package evaluator

import (
	"context"
	"errors"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestValidateRuleCoversAllRuleKinds(t *testing.T) {
	now := fixedNow()
	validRules := []contracts.AlertRule{
		alertRule("metric-threshold", contracts.AlertRuleKindMetricThreshold, map[string]any{"metricName": "http.requests", "aggregation": "avg"}, map[string]any{"operator": "GT", "threshold": 10}),
		alertRule("metric-absence", contracts.AlertRuleKindMetricAbsence, map[string]any{"metricName": "heartbeats", "aggregation": "count"}, map[string]any{"maxAllowedCount": 0}),
		alertRule("log-match", contracts.AlertRuleKindLogMatch, map[string]any{"search": "panic"}, map[string]any{"minCount": 1}),
		alertRule("log-count", contracts.AlertRuleKindLogCount, map[string]any{"severity": "ERROR"}, map[string]any{"operator": "GTE", "threshold": 5}),
		alertRule("trace-match", contracts.AlertRuleKindTraceMatch, map[string]any{"service": "api"}, map[string]any{"minCount": 1}),
		alertRule("trace-count", contracts.AlertRuleKindTraceCount, map[string]any{"status": "error"}, map[string]any{"operator": "GTE", "threshold": 3}),
		alertRule("trace-latency", contracts.AlertRuleKindTraceLatency, map[string]any{"service": "api"}, map[string]any{"operator": "GT", "threshold": 250}),
		alertRule("trace-error", contracts.AlertRuleKindTraceError, map[string]any{"service": "api"}, map[string]any{"minCount": 1}),
	}
	for _, rule := range validRules {
		if err := ValidateRule(rule, now); err != nil {
			t.Fatalf("expected %s to validate: %v", rule.Kind, err)
		}
	}

	invalid := alertRule("bad", contracts.AlertRuleKindLogCount, map[string]any{"severity": "ERROR"}, map[string]any{"operator": "GTE", "threshold": 1.5})
	err := ValidateRule(invalid, now)
	if !isCoded(err, "ERR-018") {
		t.Fatalf("expected ERR-018 for invalid count threshold, got %v", err)
	}

	invalidLogQuery := alertRule("bad-log-query", contracts.AlertRuleKindLogMatch, map[string]any{"unknown": "field"}, map[string]any{"minCount": 1})
	err = ValidateRule(invalidLogQuery, now)
	if !isCoded(err, "ERR-018") {
		t.Fatalf("expected ERR-018 for invalid log query, got %v", err)
	}

	invalidTraceQuery := alertRule("bad-trace-query", contracts.AlertRuleKindTraceMatch, map[string]any{"unknown": "field"}, map[string]any{"minCount": 1})
	err = ValidateRule(invalidTraceQuery, now)
	if !isCoded(err, "ERR-018") {
		t.Fatalf("expected ERR-018 for invalid trace query, got %v", err)
	}
}

func TestEvaluateThresholdAbsenceCountLatencyAndErrorRules(t *testing.T) {
	now := fixedNow()
	store := &fakeStorageRead{
		metric: contracts.MetricSeriesData{Series: []contracts.MetricSeries{{Points: []contracts.MetricSeriesPoint{{Timestamp: now, Value: 12}}}}},
		logs:   contracts.LogSearchData{Items: []contracts.LogEvent{{ID: "log-1"}}},
		traces: contracts.TraceSearchData{Items: []contracts.TraceSummary{{Trace: contracts.Trace{ID: "trace-1", DurationMs: floatPtr(320), Status: ptr(contracts.TraceStatusError)}}}},
	}
	e := New(EvaluatorConfig{StorageRead: store, ControlPlane: &fakeControlPlane{}, Clock: func() time.Time { return now }, IDGenerator: fixedIDs("event")})

	cases := []struct {
		name string
		rule contracts.AlertRule
	}{
		{"metric threshold", alertRule("metric-threshold", contracts.AlertRuleKindMetricThreshold, map[string]any{"metricName": "cpu", "aggregation": "avg"}, map[string]any{"operator": "GT", "threshold": 10})},
		{"metric absence", alertRule("metric-absence", contracts.AlertRuleKindMetricAbsence, map[string]any{"metricName": "heartbeat", "aggregation": "count"}, map[string]any{"maxAllowedCount": 0})},
		{"log match", alertRule("log-match", contracts.AlertRuleKindLogMatch, map[string]any{"search": "panic"}, map[string]any{"minCount": 1})},
		{"log count", alertRule("log-count", contracts.AlertRuleKindLogCount, map[string]any{"severity": "ERROR"}, map[string]any{"operator": "GTE", "threshold": 1})},
		{"trace match", alertRule("trace-match", contracts.AlertRuleKindTraceMatch, map[string]any{"service": "api"}, map[string]any{"minCount": 1})},
		{"trace count", alertRule("trace-count", contracts.AlertRuleKindTraceCount, map[string]any{"status": "error"}, map[string]any{"operator": "GTE", "threshold": 1})},
		{"trace latency", alertRule("trace-latency", contracts.AlertRuleKindTraceLatency, map[string]any{"service": "api"}, map[string]any{"operator": "GT", "threshold": 250})},
		{"trace error", alertRule("trace-error", contracts.AlertRuleKindTraceError, map[string]any{"service": "api"}, map[string]any{"minCount": 1})},
	}
	for _, tc := range cases {
		result, err := e.EvaluateCondition(context.Background(), tc.rule, now)
		if err != nil {
			t.Fatalf("%s returned error: %v", tc.name, err)
		}
		if !result.Active {
			t.Fatalf("%s expected active result", tc.name)
		}
	}
	if store.lastProjectID != "project-a" {
		t.Fatalf("expected storage-read calls to stay project-scoped, got %q", store.lastProjectID)
	}
}

func TestStateTransitionsPendingFiringResolvedAndSilenced(t *testing.T) {
	now := fixedNow()
	rule := alertRule("rule-1", contracts.AlertRuleKindLogCount, map[string]any{"severity": "ERROR"}, map[string]any{"operator": "GTE", "threshold": 1})
	rule.PendingForSeconds = 60
	control := &fakeControlPlane{}
	store := &fakeStorageRead{logs: contracts.LogSearchData{Items: []contracts.LogEvent{{ID: "log-1"}}}}
	notifications := &fakeNotifications{status: DeliveryDelivered}
	e := New(EvaluatorConfig{StorageRead: store, ControlPlane: control, Notifications: notifications, Clock: func() time.Time { return now }, IDGenerator: fixedIDs("event-1", "event-2", "event-3", "event-4")})

	pending, err := e.EvaluateRule(context.Background(), rule, now)
	if err != nil {
		t.Fatalf("pending evaluation returned error: %v", err)
	}
	if pending.State != contracts.AlertStatePending {
		t.Fatalf("expected PENDING, got %s", pending.State)
	}

	pending.StartedAt = now.Add(-61 * time.Second)
	control.latest = &pending
	firing, err := e.EvaluateRule(context.Background(), rule, now)
	if err != nil {
		t.Fatalf("firing evaluation returned error: %v", err)
	}
	if firing.State != contracts.AlertStateFiring {
		t.Fatalf("expected FIRING, got %s", firing.State)
	}
	if notifications.calls != 1 {
		t.Fatalf("expected one notification dispatch for FIRING, got %d", notifications.calls)
	}

	control.latest = &firing
	store.logs = contracts.LogSearchData{}
	resolved, err := e.EvaluateRule(context.Background(), rule, now)
	if err != nil {
		t.Fatalf("resolved evaluation returned error: %v", err)
	}
	if resolved.State != contracts.AlertStateResolved || resolved.EndedAt == nil {
		t.Fatalf("expected RESOLVED with endedAt, got %#v", resolved)
	}

	store.logs = contracts.LogSearchData{Items: []contracts.LogEvent{{ID: "log-2"}}}
	control.silences = []contracts.AlertSilence{{ID: "silence-1", ProjectID: rule.ProjectID, RuleID: rule.ID, StartsAt: now.Add(-time.Minute), EndsAt: now.Add(time.Minute), Active: true}}
	silenced, err := e.EvaluateRule(context.Background(), rule, now)
	if err != nil {
		t.Fatalf("silenced evaluation returned error: %v", err)
	}
	if silenced.State != contracts.AlertStateSilenced {
		t.Fatalf("expected SILENCED, got %s", silenced.State)
	}
	if notifications.calls != 1 {
		t.Fatalf("silenced alerts must not dispatch notifications, got %d calls", notifications.calls)
	}
}

func TestEvaluationFailureRecordsErrorState(t *testing.T) {
	now := fixedNow()
	rule := alertRule("rule-1", contracts.AlertRuleKindLogCount, map[string]any{"severity": "ERROR"}, map[string]any{"operator": "GTE", "threshold": 1})
	control := &fakeControlPlane{}
	e := New(EvaluatorConfig{
		StorageRead:  &fakeStorageRead{err: errors.New("storage-read failed")},
		ControlPlane: control,
		Clock:        func() time.Time { return now },
		IDGenerator:  fixedIDs("event-1"),
	})

	event, err := e.EvaluateRule(context.Background(), rule, now)
	if err != nil {
		t.Fatalf("execution failures should record ERROR state instead of escaping raw provider errors: %v", err)
	}
	if event.State != contracts.AlertStateError {
		t.Fatalf("expected ERROR state, got %s", event.State)
	}
	if len(control.recorded) != 1 || control.recorded[0].State != contracts.AlertStateError {
		t.Fatalf("expected ERROR event in alert history, got %#v", control.recorded)
	}
}

func TestDispatchNotificationRetryAndTerminalStatuses(t *testing.T) {
	now := fixedNow()
	event := alertEvent("event-1", contracts.AlertStateFiring, now)
	retry := New(EvaluatorConfig{Notifications: &fakeNotifications{status: DeliveryFailedRetryable}, Clock: func() time.Time { return now }})
	if result, err := retry.DispatchNotification(context.Background(), event); err != nil || result.Status != DeliveryFailedRetryable {
		t.Fatalf("retryable failure should return retryable status without terminal error, result=%#v err=%v", result, err)
	}

	terminal := New(EvaluatorConfig{Notifications: &fakeNotifications{status: DeliveryFailedTerminal}, Clock: func() time.Time { return now }})
	_, err := terminal.DispatchNotification(context.Background(), event)
	if !isCoded(err, "ERR-020") {
		t.Fatalf("expected ERR-020 for terminal notification failure, got %v", err)
	}
}

func TestTickAndEvaluateRuleRequestUseControlPlanePorts(t *testing.T) {
	now := fixedNow()
	rule := alertRule("rule-1", contracts.AlertRuleKindLogCount, map[string]any{"severity": "ERROR"}, map[string]any{"operator": "GTE", "threshold": 1})
	control := &fakeControlPlane{rules: []contracts.AlertRule{rule}}
	e := New(EvaluatorConfig{
		StorageRead:   &fakeStorageRead{logs: contracts.LogSearchData{Items: []contracts.LogEvent{{ID: "log-1"}}}},
		ControlPlane:  control,
		Notifications: &fakeNotifications{status: DeliveryDelivered},
		Clock:         func() time.Time { return now },
		IDGenerator:   fixedIDs("event-1", "event-2"),
	})

	tick, err := e.Tick(context.Background(), now)
	if err != nil {
		t.Fatalf("tick returned error: %v", err)
	}
	if tick.EvaluatedRules != 1 || tick.FiringRules != 1 {
		t.Fatalf("unexpected tick result: %#v", tick)
	}

	event, err := e.EvaluateRuleRequest(context.Background(), "project-a", "rule-1", now)
	if err != nil {
		t.Fatalf("evaluate request returned error: %v", err)
	}
	if event.RuleID != "rule-1" || event.ProjectID != "project-a" {
		t.Fatalf("evaluate request used wrong rule/project: %#v", event)
	}
	if control.getProjectID != "project-a" || control.getRuleID != "rule-1" {
		t.Fatalf("expected rule lookup to use request project/rule, got project=%q rule=%q", control.getProjectID, control.getRuleID)
	}
}

func TestEvaluateRuleTimeoutMapsToAlertEvaluatorTimeout(t *testing.T) {
	now := fixedNow()
	rule := alertRule("rule-1", contracts.AlertRuleKindLogCount, map[string]any{"severity": "ERROR"}, map[string]any{"operator": "GTE", "threshold": 1})
	e := New(EvaluatorConfig{
		StorageRead:  &fakeStorageRead{blockUntilCanceled: true},
		ControlPlane: &fakeControlPlane{},
		Timeout:      10 * time.Millisecond,
		Clock:        func() time.Time { return now },
		IDGenerator:  fixedIDs("event-1"),
	})

	_, err := e.EvaluateRule(context.Background(), rule, now)
	if !isCoded(err, "ERR-021") {
		t.Fatalf("expected ERR-021 timeout, got %v", err)
	}
}

type fakeStorageRead struct {
	metric             contracts.MetricSeriesData
	logs               contracts.LogSearchData
	traces             contracts.TraceSearchData
	lastProjectID      string
	blockUntilCanceled bool
	err                error
}

func (f *fakeStorageRead) QueryMetricSeries(ctx context.Context, projectID string, input contracts.MetricSeriesInput) (contracts.MetricSeriesData, error) {
	f.lastProjectID = projectID
	if f.blockUntilCanceled {
		<-ctx.Done()
		return contracts.MetricSeriesData{}, ctx.Err()
	}
	if f.err != nil {
		return contracts.MetricSeriesData{}, f.err
	}
	if input.MetricName == "heartbeat" {
		return contracts.MetricSeriesData{}, nil
	}
	return f.metric, nil
}

func (f *fakeStorageRead) SearchLogs(ctx context.Context, projectID string, query contracts.LogSearchQuery) (contracts.LogSearchData, error) {
	f.lastProjectID = projectID
	if f.blockUntilCanceled {
		<-ctx.Done()
		return contracts.LogSearchData{}, ctx.Err()
	}
	if f.err != nil {
		return contracts.LogSearchData{}, f.err
	}
	return f.logs, nil
}

func (f *fakeStorageRead) SearchTraces(ctx context.Context, projectID string, query contracts.TraceSearchQuery) (contracts.TraceSearchData, error) {
	f.lastProjectID = projectID
	if f.blockUntilCanceled {
		<-ctx.Done()
		return contracts.TraceSearchData{}, ctx.Err()
	}
	if f.err != nil {
		return contracts.TraceSearchData{}, f.err
	}
	return f.traces, nil
}

type fakeControlPlane struct {
	rules        []contracts.AlertRule
	latest       *contracts.AlertEvent
	silences     []contracts.AlertSilence
	recorded     []contracts.AlertEvent
	getProjectID string
	getRuleID    string
}

func (f *fakeControlPlane) ListEnabledAlertRules(ctx context.Context) ([]contracts.AlertRule, error) {
	return f.rules, nil
}

func (f *fakeControlPlane) GetAlertRule(ctx context.Context, projectID string, ruleID string) (contracts.AlertRule, error) {
	f.getProjectID = projectID
	f.getRuleID = ruleID
	for _, rule := range f.rules {
		if rule.ProjectID == projectID && rule.ID == ruleID {
			return rule, nil
		}
	}
	return contracts.AlertRule{}, errors.New("not found")
}

func (f *fakeControlPlane) LatestAlertEvent(ctx context.Context, projectID string, ruleID string) (*contracts.AlertEvent, error) {
	return f.latest, nil
}

func (f *fakeControlPlane) ActiveSilences(ctx context.Context, projectID string, ruleID string, now time.Time) ([]contracts.AlertSilence, error) {
	return f.silences, nil
}

func (f *fakeControlPlane) RecordAlertEvent(ctx context.Context, event contracts.AlertEvent) (contracts.AlertEvent, error) {
	f.recorded = append(f.recorded, event)
	return event, nil
}

type fakeNotifications struct {
	status DeliveryStatus
	calls  int
}

func (f *fakeNotifications) Dispatch(ctx context.Context, request NotificationRequest) (NotificationResult, error) {
	f.calls++
	return NotificationResult{Status: f.status}, nil
}

func alertRule(id string, kind contracts.AlertRuleKind, query map[string]any, condition map[string]any) contracts.AlertRule {
	now := fixedNow()
	return contracts.AlertRule{
		ID:                      id,
		ProjectID:               "project-a",
		Name:                    id,
		Enabled:                 true,
		Kind:                    kind,
		Severity:                contracts.AlertSeverityWarning,
		Query:                   query,
		Condition:               condition,
		EvaluationWindowSeconds: 300,
		PendingForSeconds:       0,
		CooldownSeconds:         0,
		NotificationAdapterIDs:  []string{"in-app"},
		CreatedAt:               now,
		UpdatedAt:               now,
		UpdatedByUserID:         "user-a",
		Version:                 1,
	}
}

func alertEvent(id string, state contracts.AlertState, now time.Time) contracts.AlertEvent {
	return contracts.AlertEvent{
		ID:               id,
		ProjectID:        "project-a",
		RuleID:           "rule-1",
		InstanceID:       "rule-1",
		State:            state,
		Severity:         contracts.AlertSeverityWarning,
		Summary:          "summary",
		DeduplicationKey: "project-a:rule-1",
		StartedAt:        now,
		CreatedAt:        now,
	}
}

func fixedNow() time.Time {
	return time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
}

func fixedIDs(ids ...string) func() string {
	i := 0
	return func() string {
		if i >= len(ids) {
			return ids[len(ids)-1]
		}
		id := ids[i]
		i++
		return id
	}
}

func floatPtr(value float64) *float64 {
	return &value
}

func isCoded(err error, id string) bool {
	var coded CodedError
	return errors.As(err, &coded) && coded.ID == id
}
