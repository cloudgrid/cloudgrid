package runtime

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/nats-io/nats.go"
)

func TestNATSControlPlanePortLoadsAndRecordsAlertRuleState(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	rule := contracts.AlertRule{ID: "rule-1", ProjectID: "project-a", Name: "Latency", Enabled: true, Kind: contracts.AlertRuleKindTraceLatency, Severity: contracts.AlertSeverityWarning, EvaluationWindowSeconds: 300, CreatedAt: now, UpdatedAt: now, UpdatedByUserID: "user-a", Version: 1}
	event := contracts.AlertEvent{ID: "event-1", ProjectID: "project-a", RuleID: "rule-1", State: contracts.AlertStateFiring, Severity: contracts.AlertSeverityWarning, Summary: "firing", DeduplicationKey: "rule-1", StartedAt: now, CreatedAt: now}
	requester := &fakeRequester{responses: map[string]any{
		SubjectControlAlertRulesList: contracts.AlertRuleListResponse{RequestID: "alert-rule-list", OK: true, Data: &contracts.AlertRuleListData{Items: []contracts.AlertRule{rule}}},
		SubjectControlAlertHistoryList: contracts.AlertHistoryListResponse{RequestID: "alert-history-list", OK: true, Data: &contracts.AlertHistoryListData{
			Connection: contracts.AlertEventConnection{Items: []contracts.AlertEvent{event}},
		}},
		SubjectControlAlertSilencesList: contracts.AlertSilenceListResponse{RequestID: "alert-silence-list", OK: true, Data: &contracts.AlertSilenceListData{Items: []contracts.AlertSilence{
			{ID: "silence-1", ProjectID: "project-a", RuleID: "rule-1", StartsAt: now.Add(-time.Minute), EndsAt: now.Add(time.Minute), Active: true},
		}}},
		SubjectControlAlertHistoryRecord: contracts.AlertHistoryRecordResponse{RequestID: "alert-history-record", OK: true, Data: &contracts.AlertEventData{Event: event}},
	}}
	port := NewNATSControlPlanePort(requester, time.Second)

	loaded, err := port.GetAlertRule(context.Background(), "project-a", "rule-1")
	if err != nil {
		t.Fatalf("GetAlertRule returned error: %v", err)
	}
	if loaded.ID != "rule-1" {
		t.Fatalf("loaded rule = %#v", loaded)
	}
	latest, err := port.LatestAlertEvent(context.Background(), "project-a", "rule-1")
	if err != nil || latest == nil || latest.ID != "event-1" {
		t.Fatalf("latest = %#v err=%v", latest, err)
	}
	silences, err := port.ActiveSilences(context.Background(), "project-a", "rule-1", now)
	if err != nil || len(silences) != 1 {
		t.Fatalf("silences = %#v err=%v", silences, err)
	}
	recorded, err := port.RecordAlertEvent(context.Background(), event)
	if err != nil || recorded.ID != "event-1" {
		t.Fatalf("recorded = %#v err=%v", recorded, err)
	}
}

func TestNATSStorageReadPortQueriesProjectScopedStorageSubjects(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	requester := &fakeRequester{responses: map[string]any{
		SubjectStorageMetricQuery: contracts.MetricSeriesResponse{RequestID: "alert-metric-query", OK: true, Data: &contracts.MetricSeriesData{}},
		SubjectStorageLogSearch:   contracts.LogSearchResponse{RequestID: "alert-log-search", OK: true, Data: &contracts.LogSearchData{Items: []contracts.LogEvent{{ID: "log-1"}}}},
		SubjectStorageTraceSearch: contracts.TraceSearchResponse{RequestID: "alert-trace-search", OK: true, Data: &contracts.TraceSearchData{Items: []contracts.TraceSummary{{Trace: contracts.Trace{ID: "trace-1"}}}}},
	}}
	port := NewNATSStorageReadPort(requester, time.Second)

	if _, err := port.QueryMetricSeries(context.Background(), "project-a", contracts.MetricSeriesInput{MetricName: "cpu", From: now.Add(-time.Minute), To: now, Aggregation: contracts.MetricAggregationAvg}); err != nil {
		t.Fatalf("QueryMetricSeries returned error: %v", err)
	}
	if _, err := port.SearchLogs(context.Background(), "project-a", contracts.LogSearchQuery{}); err != nil {
		t.Fatalf("SearchLogs returned error: %v", err)
	}
	if _, err := port.SearchTraces(context.Background(), "project-a", contracts.TraceSearchQuery{}); err != nil {
		t.Fatalf("SearchTraces returned error: %v", err)
	}
	for subject, payload := range requester.requests {
		if subject == SubjectStorageMetricQuery || subject == SubjectStorageLogSearch || subject == SubjectStorageTraceSearch {
			var envelope struct {
				AuthContext *contracts.AuthContext `json:"authContext"`
			}
			if err := json.Unmarshal(payload, &envelope); err != nil {
				t.Fatalf("request %s invalid JSON: %v", subject, err)
			}
			if envelope.AuthContext == nil || envelope.AuthContext.ProjectID == nil || *envelope.AuthContext.ProjectID != "project-a" {
				t.Fatalf("request %s auth context = %#v", subject, envelope.AuthContext)
			}
		}
	}
}

type fakeRequester struct {
	responses map[string]any
	requests  map[string][]byte
}

func (requester *fakeRequester) RequestWithContext(_ context.Context, subject string, data []byte) (*nats.Msg, error) {
	if requester.requests == nil {
		requester.requests = map[string][]byte{}
	}
	requester.requests[subject] = append([]byte(nil), data...)
	response, ok := requester.responses[subject]
	if !ok {
		response = contracts.AlertRuleListResponse{RequestID: "missing", OK: false, Error: &contracts.BridgeError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: "missing fake response", Retryable: false}}
	}
	payload, _ := json.Marshal(response)
	return &nats.Msg{Data: payload}, nil
}
