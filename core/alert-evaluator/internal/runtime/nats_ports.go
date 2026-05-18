package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/alert-evaluator/internal/evaluator"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/nats-io/nats.go"
)

const (
	SubjectControlAlertRulesList     = "control.alert_rules.list"
	SubjectControlAlertSilencesList  = "control.alert_silences.list"
	SubjectControlAlertHistoryList   = "control.alert_history.list"
	SubjectControlAlertHistoryRecord = "control.alert_history.record"
	SubjectStorageMetricQuery        = "telemetry.metrics.query"
	SubjectStorageLogSearch          = "telemetry.logs.search"
	SubjectStorageTraceSearch        = "telemetry.traces.search"
)

type Requester interface {
	RequestWithContext(ctx context.Context, subject string, data []byte) (*nats.Msg, error)
}

type NATSControlPlanePort struct {
	requester Requester
	timeout   time.Duration
}

type NATSStorageReadPort struct {
	requester Requester
	timeout   time.Duration
}

func NewNATSControlPlanePort(requester Requester, timeout time.Duration) *NATSControlPlanePort {
	return &NATSControlPlanePort{requester: requester, timeout: defaultTimeout(timeout)}
}

func NewNATSStorageReadPort(requester Requester, timeout time.Duration) *NATSStorageReadPort {
	return &NATSStorageReadPort{requester: requester, timeout: defaultTimeout(timeout)}
}

func (port *NATSControlPlanePort) ListEnabledAlertRules(ctx context.Context) ([]contracts.AlertRule, error) {
	return nil, evaluator.CodedError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: "scheduled alert ticks require project-scoped scheduler inputs", Retryable: false}
}

func (port *NATSControlPlanePort) GetAlertRule(ctx context.Context, projectID string, ruleID string) (contracts.AlertRule, error) {
	response, err := requestJSON[contracts.AlertRuleListResponse](ctx, port.requester, port.timeout, SubjectControlAlertRulesList, contracts.AlertRuleListRequest{
		BridgeEnvelope: bridgeEnvelope("alert-rule-list"),
		ProjectID:      projectID,
	})
	if err != nil {
		return contracts.AlertRule{}, err
	}
	if !response.OK || response.Data == nil {
		return contracts.AlertRule{}, bridgeResponseError(response.Error, "alert rule lookup failed")
	}
	for _, rule := range response.Data.Items {
		if rule.ID == ruleID && rule.ProjectID == projectID {
			return rule, nil
		}
	}
	return contracts.AlertRule{}, evaluator.CodedError{ID: "ERR-018", Code: "ALERT_RULE_INVALID", Message: "alert rule was not found in requested project", Retryable: false}
}

func (port *NATSControlPlanePort) LatestAlertEvent(ctx context.Context, projectID string, ruleID string) (*contracts.AlertEvent, error) {
	first := 1
	response, err := requestJSON[contracts.AlertHistoryListResponse](ctx, port.requester, port.timeout, SubjectControlAlertHistoryList, contracts.AlertHistoryListRequest{
		BridgeEnvelope: bridgeEnvelope("alert-history-list"),
		ProjectID:      projectID,
		RuleID:         &ruleID,
		First:          &first,
	})
	if err != nil {
		return nil, err
	}
	if !response.OK || response.Data == nil {
		return nil, bridgeResponseError(response.Error, "alert history lookup failed")
	}
	if len(response.Data.Connection.Items) == 0 {
		return nil, nil
	}
	event := response.Data.Connection.Items[0]
	return &event, nil
}

func (port *NATSControlPlanePort) ActiveSilences(ctx context.Context, projectID string, ruleID string, now time.Time) ([]contracts.AlertSilence, error) {
	response, err := requestJSON[contracts.AlertSilenceListResponse](ctx, port.requester, port.timeout, SubjectControlAlertSilencesList, contracts.AlertSilenceListRequest{
		BridgeEnvelope: bridgeEnvelope("alert-silence-list"),
		ProjectID:      projectID,
		RuleID:         &ruleID,
	})
	if err != nil {
		return nil, err
	}
	if !response.OK || response.Data == nil {
		return nil, bridgeResponseError(response.Error, "alert silence lookup failed")
	}
	active := make([]contracts.AlertSilence, 0, len(response.Data.Items))
	for _, silence := range response.Data.Items {
		if silence.Active && !now.Before(silence.StartsAt) && now.Before(silence.EndsAt) {
			active = append(active, silence)
		}
	}
	return active, nil
}

func (port *NATSControlPlanePort) RecordAlertEvent(ctx context.Context, event contracts.AlertEvent) (contracts.AlertEvent, error) {
	response, err := requestJSON[contracts.AlertHistoryRecordResponse](ctx, port.requester, port.timeout, SubjectControlAlertHistoryRecord, contracts.AlertHistoryRecordRequest{
		BridgeEnvelope: bridgeEnvelope("alert-history-record"),
		Event:          event,
	})
	if err != nil {
		return contracts.AlertEvent{}, err
	}
	if !response.OK || response.Data == nil {
		return contracts.AlertEvent{}, bridgeResponseError(response.Error, "alert history record failed")
	}
	return response.Data.Event, nil
}

func (port *NATSStorageReadPort) QueryMetricSeries(ctx context.Context, projectID string, input contracts.MetricSeriesInput) (contracts.MetricSeriesData, error) {
	response, err := requestJSON[contracts.MetricSeriesResponse](ctx, port.requester, port.timeout, SubjectStorageMetricQuery, contracts.MetricSeriesRequest{
		BridgeEnvelope: storageReadEnvelope(projectID, "alert-metric-query"),
		Input:          input,
	})
	if err != nil {
		return contracts.MetricSeriesData{}, err
	}
	if !response.OK || response.Data == nil {
		return contracts.MetricSeriesData{}, bridgeResponseError(response.Error, "metric alert query failed")
	}
	return *response.Data, nil
}

func (port *NATSStorageReadPort) SearchLogs(ctx context.Context, projectID string, query contracts.LogSearchQuery) (contracts.LogSearchData, error) {
	response, err := requestJSON[contracts.LogSearchResponse](ctx, port.requester, port.timeout, SubjectStorageLogSearch, contracts.LogSearchRequest{
		BridgeEnvelope: storageReadEnvelope(projectID, "alert-log-search"),
		Query:          query,
	})
	if err != nil {
		return contracts.LogSearchData{}, err
	}
	if !response.OK || response.Data == nil {
		return contracts.LogSearchData{}, bridgeResponseError(response.Error, "log alert query failed")
	}
	return *response.Data, nil
}

func (port *NATSStorageReadPort) SearchTraces(ctx context.Context, projectID string, query contracts.TraceSearchQuery) (contracts.TraceSearchData, error) {
	response, err := requestJSON[contracts.TraceSearchResponse](ctx, port.requester, port.timeout, SubjectStorageTraceSearch, contracts.TraceSearchRequest{
		BridgeEnvelope: storageReadEnvelope(projectID, "alert-trace-search"),
		Query:          query,
	})
	if err != nil {
		return contracts.TraceSearchData{}, err
	}
	if !response.OK || response.Data == nil {
		return contracts.TraceSearchData{}, bridgeResponseError(response.Error, "trace alert query failed")
	}
	return *response.Data, nil
}

func requestJSON[T any](ctx context.Context, requester Requester, timeout time.Duration, subject string, request any) (T, error) {
	var zero T
	if requester == nil {
		return zero, evaluator.CodedError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: "message bridge requester is not configured", Retryable: false}
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return zero, evaluator.CodedError{ID: "ERR-018", Code: "ALERT_RULE_INVALID", Message: "alert evaluator request encoding failed", Retryable: false}
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	msg, err := requester.RequestWithContext(ctx, subject, payload)
	if err != nil {
		return zero, evaluator.CodedError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: "alert evaluator bridge request failed", Retryable: true}
	}
	if err := json.Unmarshal(msg.Data, &zero); err != nil {
		return zero, evaluator.CodedError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: "alert evaluator bridge response was invalid", Retryable: true}
	}
	return zero, nil
}

func bridgeResponseError(err *contracts.BridgeError, fallback string) error {
	if err == nil {
		return evaluator.CodedError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: fallback, Retryable: true}
	}
	return evaluator.CodedError{ID: err.ID, Code: err.Code, Message: err.Message, Retryable: err.Retryable}
}

func bridgeEnvelope(requestID string) contracts.BridgeEnvelope {
	return contracts.BridgeEnvelope{RequestID: requestID, IssuedAt: time.Now().UTC()}
}

func storageReadEnvelope(projectID string, requestID string) contracts.BridgeEnvelope {
	readAllowed := true
	return contracts.BridgeEnvelope{
		RequestID: requestID,
		IssuedAt:  time.Now().UTC(),
		AuthContext: &contracts.AuthContext{
			ProjectID:   &projectID,
			ReadAllowed: &readAllowed,
			CheckedAt:   ptr(time.Now().UTC()),
		},
	}
}

func defaultTimeout(timeout time.Duration) time.Duration {
	if timeout <= 0 {
		return 1500 * time.Millisecond
	}
	return timeout
}

func ConnectNATS(url string) (*nats.Conn, error) {
	conn, err := nats.Connect(url, nats.Name("cloudgrid-alert-evaluator"))
	if err != nil {
		return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS connection failed")
	}
	return conn, nil
}
