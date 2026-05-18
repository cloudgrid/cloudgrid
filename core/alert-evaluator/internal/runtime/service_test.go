package runtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/alert-evaluator/internal/evaluator"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestSubjectHandlersExposeAlertEvaluatorSubjects(t *testing.T) {
	service := NewService(evaluator.New(evaluator.EvaluatorConfig{}))
	handlers := service.SubjectHandlers()
	for _, subject := range []string{SubjectTick, SubjectRuleEvaluate, SubjectNotificationDispatch} {
		if handlers[subject] == nil {
			t.Fatalf("missing handler for %s", subject)
		}
	}
}

func TestRuleEvaluateHandlerReturnsGenericEvaluatorResponse(t *testing.T) {
	now := time.Date(2026, 5, 18, 10, 0, 0, 0, time.UTC)
	rule := contracts.AlertRule{
		ID: "rule-1", ProjectID: "project-a", Name: "rule-1", Enabled: true,
		Kind: contracts.AlertRuleKindLogCount, Severity: contracts.AlertSeverityWarning,
		Query: map[string]any{"severity": "ERROR"}, Condition: map[string]any{"operator": "GTE", "threshold": 1},
		EvaluationWindowSeconds: 300, NotificationAdapterIDs: []string{"in-app"}, CreatedAt: now, UpdatedAt: now, UpdatedByUserID: "user-a", Version: 1,
	}
	service := NewService(evaluator.New(evaluator.EvaluatorConfig{
		StorageRead:   fakeStorage{logs: contracts.LogSearchData{Items: []contracts.LogEvent{{ID: "log-1"}}}},
		ControlPlane:  fakeControl{rule: rule},
		Notifications: fakeNotifications{},
		Clock:         func() time.Time { return now },
		IDGenerator:   func() string { return "event-1" },
	}))

	request := contracts.AlertRuleEvaluateRequest{BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1", IssuedAt: now}, ProjectID: "project-a", RuleID: "rule-1", Now: &now}
	payload, _ := json.Marshal(request)
	msg := &fakeMessage{data: payload}
	service.SubjectHandlers()[SubjectRuleEvaluate](msg)

	var response contracts.AlertRuleEvaluateResponse
	if err := json.Unmarshal(msg.response, &response); err != nil {
		t.Fatalf("invalid response JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-1" || response.Data["state"] != string(contracts.AlertStateFiring) {
		t.Fatalf("unexpected response: %#v", response)
	}
}

type fakeMessage struct {
	data     []byte
	response []byte
}

func (m *fakeMessage) Subject() string           { return "" }
func (m *fakeMessage) Data() []byte              { return m.data }
func (m *fakeMessage) Respond(data []byte) error { m.response = data; return nil }

type fakeStorage struct {
	logs contracts.LogSearchData
}

func (f fakeStorage) QueryMetricSeries(ctx context.Context, projectID string, input contracts.MetricSeriesInput) (contracts.MetricSeriesData, error) {
	return contracts.MetricSeriesData{}, nil
}

func (f fakeStorage) SearchLogs(ctx context.Context, projectID string, query contracts.LogSearchQuery) (contracts.LogSearchData, error) {
	return f.logs, nil
}

func (f fakeStorage) SearchTraces(ctx context.Context, projectID string, query contracts.TraceSearchQuery) (contracts.TraceSearchData, error) {
	return contracts.TraceSearchData{}, nil
}

type fakeControl struct {
	rule contracts.AlertRule
}

func (f fakeControl) ListEnabledAlertRules(ctx context.Context) ([]contracts.AlertRule, error) {
	return []contracts.AlertRule{f.rule}, nil
}
func (f fakeControl) GetAlertRule(ctx context.Context, projectID string, ruleID string) (contracts.AlertRule, error) {
	return f.rule, nil
}
func (f fakeControl) LatestAlertEvent(ctx context.Context, projectID string, ruleID string) (*contracts.AlertEvent, error) {
	return nil, nil
}
func (f fakeControl) ActiveSilences(ctx context.Context, projectID string, ruleID string, now time.Time) ([]contracts.AlertSilence, error) {
	return nil, nil
}
func (f fakeControl) RecordAlertEvent(ctx context.Context, event contracts.AlertEvent) (contracts.AlertEvent, error) {
	return event, nil
}

type fakeNotifications struct{}

func (fakeNotifications) Dispatch(ctx context.Context, request evaluator.NotificationRequest) (evaluator.NotificationResult, error) {
	return evaluator.NotificationResult{Status: evaluator.DeliveryDelivered}, nil
}
