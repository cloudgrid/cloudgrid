package evaluator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type StorageReadPort interface {
	QueryMetricSeries(ctx context.Context, projectID string, input contracts.MetricSeriesInput) (contracts.MetricSeriesData, error)
	SearchLogs(ctx context.Context, projectID string, query contracts.LogSearchQuery) (contracts.LogSearchData, error)
	SearchTraces(ctx context.Context, projectID string, query contracts.TraceSearchQuery) (contracts.TraceSearchData, error)
}

type ControlPlanePort interface {
	ListEnabledAlertRules(ctx context.Context) ([]contracts.AlertRule, error)
	GetAlertRule(ctx context.Context, projectID string, ruleID string) (contracts.AlertRule, error)
	LatestAlertEvent(ctx context.Context, projectID string, ruleID string) (*contracts.AlertEvent, error)
	ActiveSilences(ctx context.Context, projectID string, ruleID string, now time.Time) ([]contracts.AlertSilence, error)
	RecordAlertEvent(ctx context.Context, event contracts.AlertEvent) (contracts.AlertEvent, error)
}

type NotificationPort interface {
	Dispatch(ctx context.Context, request NotificationRequest) (NotificationResult, error)
}

type EvaluatorConfig struct {
	StorageRead   StorageReadPort
	ControlPlane  ControlPlanePort
	Notifications NotificationPort
	Timeout       time.Duration
	Clock         func() time.Time
	IDGenerator   func() string
}

type Evaluator struct {
	storage       StorageReadPort
	control       ControlPlanePort
	notifications NotificationPort
	timeout       time.Duration
	clock         func() time.Time
	idGenerator   func() string
}

type EvaluationResult struct {
	Active             bool
	ObservedValue      float64
	MatchedCount       int
	Summary            string
	EvidenceTraceID    *string
	EvidenceLogID      *string
	EvidenceMetricName *string
}

type TickResult struct {
	EvaluatedRules int
	FiringRules    int
	ErrorRules     int
}

type DeliveryStatus string

const (
	DeliveryDelivered       DeliveryStatus = "delivered"
	DeliveryFailedRetryable DeliveryStatus = "failed_retryable"
	DeliveryFailedTerminal  DeliveryStatus = "failed_terminal"
)

type NotificationRequest struct {
	Event            contracts.AlertEvent
	AdapterIDs       []string
	DeduplicationKey string
	SafeSummary      string
}

type NotificationResult struct {
	Status DeliveryStatus
}

type CodedError struct {
	ID        string
	Code      string
	Message   string
	Retryable bool
}

func (err CodedError) Error() string {
	return fmt.Sprintf("%s %s: %s", err.ID, err.Code, err.Message)
}

func New(config EvaluatorConfig) *Evaluator {
	return &Evaluator{
		storage:       config.StorageRead,
		control:       config.ControlPlane,
		notifications: config.Notifications,
		timeout:       config.Timeout,
		clock:         defaultClock(config.Clock),
		idGenerator:   defaultIDGenerator(config.IDGenerator),
	}
}

func ValidateRule(rule contracts.AlertRule, now time.Time) error {
	if strings.TrimSpace(rule.ID) == "" {
		return alertRuleInvalid("id is required")
	}
	if strings.TrimSpace(rule.ProjectID) == "" {
		return alertRuleInvalid("projectId is required")
	}
	if rule.EvaluationWindowSeconds < 1 {
		return alertRuleInvalid("evaluationWindowSeconds must be at least 1")
	}
	if rule.PendingForSeconds < 0 {
		return alertRuleInvalid("pendingForSeconds must be non-negative")
	}
	if rule.CooldownSeconds < 0 {
		return alertRuleInvalid("cooldownSeconds must be non-negative")
	}
	if !validSeverity(rule.Severity) {
		return alertRuleInvalid("severity is invalid")
	}
	switch rule.Kind {
	case contracts.AlertRuleKindMetricThreshold:
		if _, err := parseMetricQuery(rule.Query, now, rule.EvaluationWindowSeconds); err != nil {
			return err
		}
		_, err := parseNumericCondition(rule.Condition)
		return err
	case contracts.AlertRuleKindMetricAbsence:
		if _, err := parseMetricQuery(rule.Query, now, rule.EvaluationWindowSeconds); err != nil {
			return err
		}
		maxAllowed, err := intField(rule.Condition, "maxAllowedCount")
		if err != nil {
			return err
		}
		if maxAllowed != 0 {
			return alertRuleInvalid("maxAllowedCount must be 0 for metric absence rules")
		}
		return nil
	case contracts.AlertRuleKindLogMatch, contracts.AlertRuleKindTraceMatch, contracts.AlertRuleKindTraceError:
		_, err := parseMinCountCondition(rule.Condition)
		return err
	case contracts.AlertRuleKindLogCount, contracts.AlertRuleKindTraceCount:
		_, err := parseIntegerThresholdCondition(rule.Condition)
		return err
	case contracts.AlertRuleKindTraceLatency:
		_, err := parseNumericCondition(rule.Condition)
		return err
	default:
		return alertRuleInvalid("kind is invalid")
	}
}

func (e *Evaluator) EvaluateCondition(ctx context.Context, rule contracts.AlertRule, now time.Time) (EvaluationResult, error) {
	ctx, cancel := e.contextWithTimeout(ctx)
	defer cancel()
	result, err := e.evaluateCondition(ctx, rule, now)
	if err != nil {
		return EvaluationResult{}, mapTimeout(err, e.timeout)
	}
	return result, nil
}

func (e *Evaluator) Tick(ctx context.Context, requestedAt time.Time) (TickResult, error) {
	ctx, cancel := e.contextWithTimeout(ctx)
	defer cancel()
	if e.control == nil {
		return TickResult{}, alertQueryUnsupported("control-plane port is not configured")
	}
	rules, err := e.control.ListEnabledAlertRules(ctx)
	if err != nil {
		return TickResult{}, mapTimeout(err, e.timeout)
	}
	result := TickResult{}
	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		event, err := e.evaluateRule(ctx, rule, requestedAt)
		result.EvaluatedRules++
		if err != nil {
			result.ErrorRules++
			continue
		}
		if event.State == contracts.AlertStateFiring {
			result.FiringRules++
		}
	}
	if err := ctx.Err(); err != nil {
		return TickResult{}, mapTimeout(err, e.timeout)
	}
	return result, nil
}

func (e *Evaluator) EvaluateRuleRequest(ctx context.Context, projectID string, ruleID string, now time.Time) (contracts.AlertEvent, error) {
	ctx, cancel := e.contextWithTimeout(ctx)
	defer cancel()
	if e.control == nil {
		return contracts.AlertEvent{}, alertQueryUnsupported("control-plane port is not configured")
	}
	if strings.TrimSpace(projectID) == "" || strings.TrimSpace(ruleID) == "" {
		return contracts.AlertEvent{}, alertRuleInvalid("projectId and ruleId are required")
	}
	rule, err := e.control.GetAlertRule(ctx, projectID, ruleID)
	if err != nil {
		return contracts.AlertEvent{}, mapTimeout(err, e.timeout)
	}
	if rule.ProjectID != projectID || rule.ID != ruleID {
		return contracts.AlertEvent{}, alertRuleInvalid("loaded rule does not match request scope")
	}
	event, err := e.evaluateRule(ctx, rule, now)
	if err != nil {
		return contracts.AlertEvent{}, mapTimeout(err, e.timeout)
	}
	return event, nil
}

func (e *Evaluator) EvaluateRule(ctx context.Context, rule contracts.AlertRule, now time.Time) (contracts.AlertEvent, error) {
	ctx, cancel := e.contextWithTimeout(ctx)
	defer cancel()
	event, err := e.evaluateRule(ctx, rule, now)
	if err != nil {
		return contracts.AlertEvent{}, mapTimeout(err, e.timeout)
	}
	return event, nil
}

func (e *Evaluator) DispatchNotification(ctx context.Context, event contracts.AlertEvent) (NotificationResult, error) {
	ctx, cancel := e.contextWithTimeout(ctx)
	defer cancel()
	result, err := e.dispatchNotification(ctx, event, nil)
	if err != nil {
		return NotificationResult{}, mapTimeout(err, e.timeout)
	}
	return result, nil
}

func (e *Evaluator) evaluateRule(ctx context.Context, rule contracts.AlertRule, now time.Time) (contracts.AlertEvent, error) {
	if err := ValidateRule(rule, now); err != nil {
		return contracts.AlertEvent{}, err
	}
	latest, err := e.latestEvent(ctx, rule.ProjectID, rule.ID)
	if err != nil {
		return contracts.AlertEvent{}, err
	}
	if !rule.Enabled {
		return e.record(ctx, transitionEvent(rule, latest, contracts.AlertStateOK, now, e.idGenerator(), EvaluationResult{Summary: "alert rule disabled"}))
	}
	activeSilences, err := e.activeSilences(ctx, rule.ProjectID, rule.ID, now)
	if err != nil {
		return contracts.AlertEvent{}, err
	}
	result, err := e.evaluateCondition(ctx, rule, now)
	if err != nil {
		if isTerminalEvaluationError(err) {
			return contracts.AlertEvent{}, err
		}
		return e.record(ctx, transitionEvent(rule, latest, contracts.AlertStateError, now, e.idGenerator(), EvaluationResult{Summary: "alert rule evaluation failed"}))
	}
	if result.Active && len(activeSilences) > 0 {
		return e.record(ctx, transitionEvent(rule, latest, contracts.AlertStateSilenced, now, e.idGenerator(), result))
	}
	nextState := nextState(rule, latest, result.Active, now)
	if nextState == "" && latest != nil {
		return *latest, nil
	}
	event := transitionEvent(rule, latest, nextState, now, e.idGenerator(), result)
	recorded, err := e.record(ctx, event)
	if err != nil {
		return contracts.AlertEvent{}, err
	}
	if recorded.State == contracts.AlertStateFiring {
		if _, err := e.dispatchNotification(ctx, recorded, rule.NotificationAdapterIDs); err != nil {
			return contracts.AlertEvent{}, err
		}
	}
	return recorded, nil
}

func (e *Evaluator) evaluateCondition(ctx context.Context, rule contracts.AlertRule, now time.Time) (EvaluationResult, error) {
	if err := ValidateRule(rule, now); err != nil {
		return EvaluationResult{}, err
	}
	switch rule.Kind {
	case contracts.AlertRuleKindMetricThreshold:
		input, err := parseMetricQuery(rule.Query, now, rule.EvaluationWindowSeconds)
		if err != nil {
			return EvaluationResult{}, err
		}
		condition, err := parseNumericCondition(rule.Condition)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.queryMetric(ctx, rule.ProjectID, input)
		if err != nil {
			return EvaluationResult{}, err
		}
		value, matched := maxMetricValue(data)
		return EvaluationResult{Active: matched && compare(value, condition.Operator, condition.Threshold), ObservedValue: value, MatchedCount: metricPointCount(data), Summary: fmt.Sprintf("metric %s value %.4g", input.MetricName, value), EvidenceMetricName: &input.MetricName}, nil
	case contracts.AlertRuleKindMetricAbsence:
		input, err := parseMetricQuery(rule.Query, now, rule.EvaluationWindowSeconds)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.queryMetric(ctx, rule.ProjectID, input)
		if err != nil {
			return EvaluationResult{}, err
		}
		count := metricPointCount(data)
		return EvaluationResult{Active: count == 0, ObservedValue: float64(count), MatchedCount: count, Summary: fmt.Sprintf("metric %s matched %d points", input.MetricName, count), EvidenceMetricName: &input.MetricName}, nil
	case contracts.AlertRuleKindLogMatch:
		minCount, err := parseMinCountCondition(rule.Condition)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.searchLogs(ctx, rule, now)
		if err != nil {
			return EvaluationResult{}, err
		}
		count := len(data.Items)
		return EvaluationResult{Active: count >= minCount, ObservedValue: float64(count), MatchedCount: count, Summary: fmt.Sprintf("log rule matched %d records", count), EvidenceLogID: firstLogID(data)}, nil
	case contracts.AlertRuleKindLogCount:
		condition, err := parseIntegerThresholdCondition(rule.Condition)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.searchLogs(ctx, rule, now)
		if err != nil {
			return EvaluationResult{}, err
		}
		count := len(data.Items)
		return EvaluationResult{Active: compare(float64(count), condition.Operator, float64(condition.Threshold)), ObservedValue: float64(count), MatchedCount: count, Summary: fmt.Sprintf("log count observed %d records", count), EvidenceLogID: firstLogID(data)}, nil
	case contracts.AlertRuleKindTraceMatch:
		minCount, err := parseMinCountCondition(rule.Condition)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.searchTraces(ctx, rule, now)
		if err != nil {
			return EvaluationResult{}, err
		}
		count := len(data.Items)
		return EvaluationResult{Active: count >= minCount, ObservedValue: float64(count), MatchedCount: count, Summary: fmt.Sprintf("trace rule matched %d traces", count), EvidenceTraceID: firstTraceID(data)}, nil
	case contracts.AlertRuleKindTraceCount:
		condition, err := parseIntegerThresholdCondition(rule.Condition)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.searchTraces(ctx, rule, now)
		if err != nil {
			return EvaluationResult{}, err
		}
		count := len(data.Items)
		return EvaluationResult{Active: compare(float64(count), condition.Operator, float64(condition.Threshold)), ObservedValue: float64(count), MatchedCount: count, Summary: fmt.Sprintf("trace count observed %d traces", count), EvidenceTraceID: firstTraceID(data)}, nil
	case contracts.AlertRuleKindTraceLatency:
		condition, err := parseNumericCondition(rule.Condition)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.searchTraces(ctx, rule, now)
		if err != nil {
			return EvaluationResult{}, err
		}
		value := maxTraceDuration(data)
		return EvaluationResult{Active: compare(value, condition.Operator, condition.Threshold), ObservedValue: value, MatchedCount: len(data.Items), Summary: fmt.Sprintf("trace latency observed %.4gms", value), EvidenceTraceID: firstTraceID(data)}, nil
	case contracts.AlertRuleKindTraceError:
		minCount, err := parseMinCountCondition(rule.Condition)
		if err != nil {
			return EvaluationResult{}, err
		}
		data, err := e.searchTraces(ctx, rule, now)
		if err != nil {
			return EvaluationResult{}, err
		}
		count := traceErrorCount(data)
		return EvaluationResult{Active: count >= minCount, ObservedValue: float64(count), MatchedCount: count, Summary: fmt.Sprintf("trace error rule matched %d error traces", count), EvidenceTraceID: firstTraceID(data)}, nil
	default:
		return EvaluationResult{}, alertRuleInvalid("kind is invalid")
	}
}

func (e *Evaluator) queryMetric(ctx context.Context, projectID string, input contracts.MetricSeriesInput) (contracts.MetricSeriesData, error) {
	if e.storage == nil {
		return contracts.MetricSeriesData{}, alertQueryUnsupported("storage-read port is not configured")
	}
	return e.storage.QueryMetricSeries(ctx, projectID, input)
}

func (e *Evaluator) searchLogs(ctx context.Context, rule contracts.AlertRule, now time.Time) (contracts.LogSearchData, error) {
	if e.storage == nil {
		return contracts.LogSearchData{}, alertQueryUnsupported("storage-read port is not configured")
	}
	query, err := parseLogQuery(rule.Query, now, rule.EvaluationWindowSeconds)
	if err != nil {
		return contracts.LogSearchData{}, err
	}
	return e.storage.SearchLogs(ctx, rule.ProjectID, query)
}

func (e *Evaluator) searchTraces(ctx context.Context, rule contracts.AlertRule, now time.Time) (contracts.TraceSearchData, error) {
	if e.storage == nil {
		return contracts.TraceSearchData{}, alertQueryUnsupported("storage-read port is not configured")
	}
	query, err := parseTraceQuery(rule.Query, now, rule.EvaluationWindowSeconds)
	if err != nil {
		return contracts.TraceSearchData{}, err
	}
	return e.storage.SearchTraces(ctx, rule.ProjectID, query)
}

func (e *Evaluator) dispatchNotification(ctx context.Context, event contracts.AlertEvent, adapterIDs []string) (NotificationResult, error) {
	if e.notifications == nil {
		return NotificationResult{Status: DeliveryDelivered}, nil
	}
	result, err := e.notifications.Dispatch(ctx, NotificationRequest{
		Event:            event,
		AdapterIDs:       append([]string(nil), adapterIDs...),
		DeduplicationKey: event.DeduplicationKey,
		SafeSummary:      event.Summary,
	})
	if err != nil {
		return NotificationResult{}, alertNotificationFailed()
	}
	switch result.Status {
	case DeliveryDelivered, DeliveryFailedRetryable:
		return result, nil
	case DeliveryFailedTerminal:
		return NotificationResult{}, alertNotificationFailed()
	default:
		return NotificationResult{}, alertNotificationFailed()
	}
}

func (e *Evaluator) latestEvent(ctx context.Context, projectID string, ruleID string) (*contracts.AlertEvent, error) {
	if e.control == nil {
		return nil, nil
	}
	return e.control.LatestAlertEvent(ctx, projectID, ruleID)
}

func (e *Evaluator) activeSilences(ctx context.Context, projectID string, ruleID string, now time.Time) ([]contracts.AlertSilence, error) {
	if e.control == nil {
		return nil, nil
	}
	return e.control.ActiveSilences(ctx, projectID, ruleID, now)
}

func (e *Evaluator) record(ctx context.Context, event contracts.AlertEvent) (contracts.AlertEvent, error) {
	if e.control == nil {
		return event, nil
	}
	return e.control.RecordAlertEvent(ctx, event)
}

func (e *Evaluator) contextWithTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}
	if e.timeout <= 0 {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, e.timeout)
}

type numericCondition struct {
	Operator  string
	Threshold float64
}

type integerCondition struct {
	Operator  string
	Threshold int
}

func parseNumericCondition(raw map[string]any) (numericCondition, error) {
	operator, err := operatorField(raw)
	if err != nil {
		return numericCondition{}, err
	}
	threshold, err := numberField(raw, "threshold")
	if err != nil {
		return numericCondition{}, err
	}
	return numericCondition{Operator: operator, Threshold: threshold}, nil
}

func parseIntegerThresholdCondition(raw map[string]any) (integerCondition, error) {
	operator, err := operatorField(raw)
	if err != nil {
		return integerCondition{}, err
	}
	threshold, err := intField(raw, "threshold")
	if err != nil {
		return integerCondition{}, err
	}
	return integerCondition{Operator: operator, Threshold: threshold}, nil
}

func parseMinCountCondition(raw map[string]any) (int, error) {
	minCount, err := intField(raw, "minCount")
	if err != nil {
		return 0, err
	}
	if minCount < 1 || minCount > 100000 {
		return 0, alertRuleInvalid("minCount must be between 1 and 100000")
	}
	return minCount, nil
}

func operatorField(raw map[string]any) (string, error) {
	operator, ok := raw["operator"].(string)
	if !ok {
		return "", alertRuleInvalid("operator is required")
	}
	operator = strings.ToUpper(strings.TrimSpace(operator))
	switch operator {
	case "GT", "GTE", "LT", "LTE", "EQ", "NEQ":
		return operator, nil
	default:
		return "", alertRuleInvalid("operator is invalid")
	}
}

func parseMetricQuery(raw map[string]any, now time.Time, windowSeconds int) (contracts.MetricSeriesInput, error) {
	metricName, ok := raw["metricName"].(string)
	if !ok || strings.TrimSpace(metricName) == "" {
		return contracts.MetricSeriesInput{}, alertRuleInvalid("metricName is required")
	}
	aggregation, ok := raw["aggregation"].(string)
	if !ok || strings.TrimSpace(aggregation) == "" {
		return contracts.MetricSeriesInput{}, alertRuleInvalid("aggregation is required")
	}
	input := contracts.MetricSeriesInput{
		MetricName:  strings.TrimSpace(metricName),
		Aggregation: contracts.MetricAggregation(strings.TrimSpace(aggregation)),
		From:        now.Add(-time.Duration(windowSeconds) * time.Second),
		To:          now,
	}
	if interval, ok := raw["interval"].(string); ok && strings.TrimSpace(interval) != "" {
		input.Interval = ptr(strings.TrimSpace(interval))
	}
	if limit, ok, err := optionalInt(raw, "limit"); err != nil {
		return contracts.MetricSeriesInput{}, err
	} else if ok {
		input.Limit = &limit
	}
	if groupBy, ok, err := optionalStringSlice(raw, "groupBy"); err != nil {
		return contracts.MetricSeriesInput{}, err
	} else if ok {
		input.GroupBy = groupBy
	}
	return input, nil
}

func parseLogQuery(raw map[string]any, now time.Time, windowSeconds int) (contracts.LogSearchQuery, error) {
	var query contracts.LogSearchQuery
	if err := roundTrip(raw, &query); err != nil {
		return contracts.LogSearchQuery{}, alertRuleInvalid("log query is invalid")
	}
	query.From = ptr(now.Add(-time.Duration(windowSeconds) * time.Second))
	query.To = ptr(now)
	if query.Limit == nil {
		query.Limit = ptr(200)
	}
	return query, nil
}

func parseTraceQuery(raw map[string]any, now time.Time, windowSeconds int) (contracts.TraceSearchQuery, error) {
	var query contracts.TraceSearchQuery
	if err := roundTrip(raw, &query); err != nil {
		return contracts.TraceSearchQuery{}, alertRuleInvalid("trace query is invalid")
	}
	query.From = ptr(now.Add(-time.Duration(windowSeconds) * time.Second))
	query.To = ptr(now)
	if query.Limit == nil {
		query.Limit = ptr(200)
	}
	return query, nil
}

func roundTrip(raw map[string]any, target any) error {
	data, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func numberField(raw map[string]any, key string) (float64, error) {
	value, ok := raw[key]
	if !ok {
		return 0, alertRuleInvalid(key + " is required")
	}
	number, ok := value.(float64)
	if !ok {
		if i, ok := value.(int); ok {
			number = float64(i)
		} else {
			return 0, alertRuleInvalid(key + " must be numeric")
		}
	}
	if math.IsNaN(number) || math.IsInf(number, 0) {
		return 0, alertRuleInvalid(key + " must be finite")
	}
	return number, nil
}

func intField(raw map[string]any, key string) (int, error) {
	value, ok := raw[key]
	if !ok {
		return 0, alertRuleInvalid(key + " is required")
	}
	switch typed := value.(type) {
	case int:
		return typed, nil
	case float64:
		if math.Trunc(typed) != typed {
			return 0, alertRuleInvalid(key + " must be an integer")
		}
		return int(typed), nil
	default:
		return 0, alertRuleInvalid(key + " must be an integer")
	}
}

func optionalInt(raw map[string]any, key string) (int, bool, error) {
	if _, ok := raw[key]; !ok {
		return 0, false, nil
	}
	value, err := intField(raw, key)
	return value, true, err
}

func optionalStringSlice(raw map[string]any, key string) ([]string, bool, error) {
	rawValue, ok := raw[key]
	if !ok {
		return nil, false, nil
	}
	values, ok := rawValue.([]string)
	if ok {
		return values, true, nil
	}
	rawSlice, ok := rawValue.([]any)
	if !ok {
		return nil, false, alertRuleInvalid(key + " must be a string array")
	}
	values = make([]string, 0, len(rawSlice))
	for _, item := range rawSlice {
		value, ok := item.(string)
		if !ok {
			return nil, false, alertRuleInvalid(key + " must be a string array")
		}
		values = append(values, value)
	}
	return values, true, nil
}

func compare(left float64, operator string, right float64) bool {
	switch operator {
	case "GT":
		return left > right
	case "GTE":
		return left >= right
	case "LT":
		return left < right
	case "LTE":
		return left <= right
	case "EQ":
		return left == right
	case "NEQ":
		return left != right
	default:
		return false
	}
}

func nextState(rule contracts.AlertRule, latest *contracts.AlertEvent, active bool, now time.Time) contracts.AlertState {
	if !active {
		if latest != nil && (latest.State == contracts.AlertStatePending || latest.State == contracts.AlertStateFiring || latest.State == contracts.AlertStateSilenced || latest.State == contracts.AlertStateError) {
			return contracts.AlertStateResolved
		}
		return contracts.AlertStateOK
	}
	if latest != nil && latest.State == contracts.AlertStatePending {
		if int(now.Sub(latest.StartedAt).Seconds()) >= rule.PendingForSeconds {
			return contracts.AlertStateFiring
		}
		return contracts.AlertStatePending
	}
	if latest != nil && latest.State == contracts.AlertStateFiring {
		if rule.CooldownSeconds > 0 && now.Sub(latest.CreatedAt) < time.Duration(rule.CooldownSeconds)*time.Second {
			return ""
		}
		return contracts.AlertStateFiring
	}
	if rule.PendingForSeconds > 0 {
		return contracts.AlertStatePending
	}
	return contracts.AlertStateFiring
}

func transitionEvent(rule contracts.AlertRule, latest *contracts.AlertEvent, state contracts.AlertState, now time.Time, id string, result EvaluationResult) contracts.AlertEvent {
	startedAt := now
	instanceID := rule.ID
	if latest != nil && (state == contracts.AlertStatePending || state == contracts.AlertStateFiring || state == contracts.AlertStateSilenced) {
		startedAt = latest.StartedAt
		instanceID = latest.InstanceID
	}
	event := contracts.AlertEvent{
		ID:                 id,
		ProjectID:          rule.ProjectID,
		RuleID:             rule.ID,
		InstanceID:         instanceID,
		State:              state,
		Severity:           rule.Severity,
		Summary:            summaryFor(rule, result, state),
		DeduplicationKey:   rule.ProjectID + ":" + rule.ID,
		StartedAt:          startedAt,
		CreatedAt:          now,
		EvidenceTraceID:    result.EvidenceTraceID,
		EvidenceLogID:      result.EvidenceLogID,
		EvidenceMetricName: result.EvidenceMetricName,
	}
	if state == contracts.AlertStateResolved || state == contracts.AlertStateOK {
		event.EndedAt = &now
	}
	return event
}

func summaryFor(rule contracts.AlertRule, result EvaluationResult, state contracts.AlertState) string {
	if strings.TrimSpace(result.Summary) != "" {
		return result.Summary
	}
	return fmt.Sprintf("%s rule %s evaluated to %s", rule.Kind, rule.ID, state)
}

func metricPointCount(data contracts.MetricSeriesData) int {
	count := 0
	for _, series := range data.Series {
		count += len(series.Points)
	}
	return count
}

func maxMetricValue(data contracts.MetricSeriesData) (float64, bool) {
	value := 0.0
	matched := false
	for _, series := range data.Series {
		for _, point := range series.Points {
			if !matched || point.Value > value {
				value = point.Value
				matched = true
			}
		}
	}
	return value, matched
}

func maxTraceDuration(data contracts.TraceSearchData) float64 {
	value := 0.0
	for _, trace := range data.Items {
		if trace.DurationMs != nil && *trace.DurationMs > value {
			value = *trace.DurationMs
		}
	}
	return value
}

func traceErrorCount(data contracts.TraceSearchData) int {
	count := 0
	for _, trace := range data.Items {
		if trace.ErrorSpanCount > 0 || (trace.Status != nil && *trace.Status == contracts.TraceStatusError) {
			count++
		}
	}
	return count
}

func firstTraceID(data contracts.TraceSearchData) *string {
	if len(data.Items) == 0 {
		return nil
	}
	return &data.Items[0].ID
}

func firstLogID(data contracts.LogSearchData) *string {
	if len(data.Items) == 0 {
		return nil
	}
	return &data.Items[0].ID
}

func validSeverity(severity contracts.AlertSeverity) bool {
	switch severity {
	case contracts.AlertSeverityInfo, contracts.AlertSeverityWarning, contracts.AlertSeverityError, contracts.AlertSeverityCritical:
		return true
	default:
		return false
	}
}

func alertRuleInvalid(reason string) error {
	return CodedError{ID: "ERR-018", Code: "ALERT_RULE_INVALID", Message: "Alert rule configuration is invalid: " + reason, Retryable: false}
}

func alertQueryUnsupported(reason string) error {
	return CodedError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: "Alert query is not supported: " + reason, Retryable: false}
}

func alertNotificationFailed() error {
	return CodedError{ID: "ERR-020", Code: "ALERT_NOTIFICATION_FAILED", Message: "Alert notification delivery failed", Retryable: true}
}

func alertEvaluatorTimeout(timeout time.Duration) error {
	return CodedError{ID: "ERR-021", Code: "ALERT_EVALUATOR_TIMEOUT", Message: fmt.Sprintf("Alert evaluation timed out after %dms", timeout.Milliseconds()), Retryable: true}
}

func mapTimeout(err error, timeout time.Duration) error {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return alertEvaluatorTimeout(timeout)
	}
	return err
}

func isTerminalEvaluationError(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return true
	}
	var coded CodedError
	return errors.As(err, &coded)
}

func defaultClock(clock func() time.Time) func() time.Time {
	if clock != nil {
		return clock
	}
	return func() time.Time { return time.Now().UTC() }
}

func defaultIDGenerator(generator func() string) func() string {
	if generator != nil {
		return generator
	}
	return func() string { return fmt.Sprintf("alert-event-%d", time.Now().UTC().UnixNano()) }
}

func ptr[T any](value T) *T {
	return &value
}
