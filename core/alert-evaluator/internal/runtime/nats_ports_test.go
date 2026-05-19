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
	var ruleListRequest contracts.AlertRuleListRequest
	if err := json.Unmarshal(requester.requests[SubjectControlAlertRulesList], &ruleListRequest); err != nil {
		t.Fatalf("alert rule list request invalid JSON: %v", err)
	}
	if ruleListRequest.AuthContext == nil || ruleListRequest.AuthContext.ProjectID == nil || *ruleListRequest.AuthContext.ProjectID != "project-a" {
		t.Fatalf("alert rule list auth context = %#v", ruleListRequest.AuthContext)
	}
	if len(ruleListRequest.AuthContext.Scopes) != 1 || ruleListRequest.AuthContext.Scopes[0] != "cloudgrid:alert-evaluator" {
		t.Fatalf("alert rule list scopes = %#v", ruleListRequest.AuthContext.Scopes)
	}
}

func TestNATSControlPlanePortListsEnabledRulesForConfiguredProjects(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	enabledRule := contracts.AlertRule{ID: "rule-enabled", ProjectID: "project-a", Name: "Enabled", Enabled: true, Kind: contracts.AlertRuleKindLogCount, Severity: contracts.AlertSeverityWarning, EvaluationWindowSeconds: 300, CreatedAt: now, UpdatedAt: now, UpdatedByUserID: "user-a", Version: 1}
	disabledRule := enabledRule
	disabledRule.ID = "rule-disabled"
	disabledRule.Enabled = false
	requester := &fakeRequester{responses: map[string]any{
		SubjectControlAlertRulesList: contracts.AlertRuleListResponse{RequestID: "alert-rule-list", OK: true, Data: &contracts.AlertRuleListData{Items: []contracts.AlertRule{disabledRule, enabledRule}}},
	}}
	port := NewNATSControlPlanePortForProjects(requester, time.Second, []string{"project-a", "project-a", " "})

	rules, err := port.ListEnabledAlertRules(context.Background())
	if err != nil {
		t.Fatalf("ListEnabledAlertRules returned error: %v", err)
	}
	if len(rules) != 1 || rules[0].ID != "rule-enabled" {
		t.Fatalf("rules = %#v, want only enabled rule", rules)
	}
}

func TestNATSControlPlanePortDiscoversProjectsBeforeListingEnabledRules(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	enabledRule := contracts.AlertRule{ID: "rule-enabled", ProjectID: "project-b", Name: "Enabled", Enabled: true, Kind: contracts.AlertRuleKindLogCount, Severity: contracts.AlertSeverityWarning, EvaluationWindowSeconds: 300, CreatedAt: now, UpdatedAt: now, UpdatedByUserID: "user-a", Version: 1}
	nextCursor := "project-a"
	requester := &fakeRequester{responses: map[string]any{
		SubjectControlProjectsListForService: []any{
			contracts.ProjectListForServiceResponse{RequestID: "project-discovery", OK: true, Data: &contracts.ProjectListForServiceData{
				Items:      []contracts.ServiceProject{{ProjectID: "project-a", CompanyID: "company-a", TenantID: "company-a", Status: contracts.ProjectStatusActive, ChangedAt: now}},
				NextCursor: &nextCursor,
			}},
			contracts.ProjectListForServiceResponse{RequestID: "project-discovery", OK: true, Data: &contracts.ProjectListForServiceData{
				Items: []contracts.ServiceProject{{ProjectID: "project-b", CompanyID: "company-a", TenantID: "company-a", Status: contracts.ProjectStatusActive, ChangedAt: now}},
			}},
		},
		SubjectControlAlertRulesList: contracts.AlertRuleListResponse{RequestID: "alert-rule-list", OK: true, Data: &contracts.AlertRuleListData{Items: []contracts.AlertRule{enabledRule}}},
	}}
	port := NewNATSControlPlanePortWithDiscovery(requester, time.Second)

	rules, err := port.ListEnabledAlertRules(context.Background())
	if err != nil {
		t.Fatalf("ListEnabledAlertRules returned error: %v", err)
	}
	if len(rules) != 1 || rules[0].ProjectID != "project-b" {
		t.Fatalf("rules = %#v, want enabled rule from discovered project", rules)
	}
	var discoveryRequest contracts.ProjectListForServiceRequest
	if err := json.Unmarshal(requester.requestsBySubject(SubjectControlProjectsListForService)[0], &discoveryRequest); err != nil {
		t.Fatalf("discovery request invalid JSON: %v", err)
	}
	if discoveryRequest.ServiceScope != contracts.ServiceProjectScopeAlertEvaluator || discoveryRequest.Status == nil || *discoveryRequest.Status != contracts.ProjectStatusActive {
		t.Fatalf("discovery request = %#v, want alert_evaluator active", discoveryRequest)
	}
	if discoveryRequest.AuthContext == nil || len(discoveryRequest.AuthContext.Scopes) != 1 || discoveryRequest.AuthContext.Scopes[0] != "cloudgrid:alert-evaluator" {
		t.Fatalf("discovery auth context = %#v, want service scope", discoveryRequest.AuthContext)
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
	responses       map[string]any
	requests        map[string][]byte
	requestSequence map[string][][]byte
	responseIndexes map[string]int
}

func (requester *fakeRequester) RequestWithContext(_ context.Context, subject string, data []byte) (*nats.Msg, error) {
	if requester.requests == nil {
		requester.requests = map[string][]byte{}
	}
	if requester.requestSequence == nil {
		requester.requestSequence = map[string][][]byte{}
	}
	requester.requests[subject] = append([]byte(nil), data...)
	requester.requestSequence[subject] = append(requester.requestSequence[subject], append([]byte(nil), data...))
	response, ok := requester.responses[subject]
	if !ok {
		response = contracts.AlertRuleListResponse{RequestID: "missing", OK: false, Error: &contracts.BridgeError{ID: "ERR-019", Code: "ALERT_QUERY_UNSUPPORTED", Message: "missing fake response", Retryable: false}}
	}
	if sequence, ok := response.([]any); ok {
		if requester.responseIndexes == nil {
			requester.responseIndexes = map[string]int{}
		}
		index := requester.responseIndexes[subject]
		if index < len(sequence) {
			response = sequence[index]
			requester.responseIndexes[subject] = index + 1
		} else {
			response = sequence[len(sequence)-1]
		}
	}
	payload, _ := json.Marshal(response)
	return &nats.Msg{Data: payload}, nil
}

func (requester *fakeRequester) requestsBySubject(subject string) [][]byte {
	return requester.requestSequence[subject]
}
