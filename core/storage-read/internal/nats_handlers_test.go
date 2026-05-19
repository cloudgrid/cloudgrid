package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestTraceGetHandlerForwardsTraceDetailQuery(t *testing.T) {
	lastTraceDetailQuery = nil
	selectedSpanID := "span-1"
	limit := 5
	request := contracts.TraceDetailRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-trace-detail"},
		TraceID:        "trace-1",
		Query:          &contracts.TraceDetailQuery{SelectedSpanID: &selectedSpanID, RelatedLogLimit: &limit},
	}
	data, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}

	handleTraceGet(&loggingReadStore{}, nil)(bridgeMessageForTest(SubjectTraceGet, data))

	if lastTraceDetailQuery == nil || lastTraceDetailQuery.SelectedSpanID == nil || *lastTraceDetailQuery.SelectedSpanID != selectedSpanID {
		t.Fatalf("forwarded query = %#v, want selected span", lastTraceDetailQuery)
	}
	if lastTraceDetailQuery.RelatedLogLimit == nil || *lastTraceDetailQuery.RelatedLogLimit != limit {
		t.Fatalf("forwarded query = %#v, want related log limit", lastTraceDetailQuery)
	}
}

func TestFacetHandlerForwardsFacetQuery(t *testing.T) {
	lastFacetQuery = contracts.TelemetryFacetQuery{}
	limit := 25
	service := "api"
	from := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	request := contracts.TelemetryFacetRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-facets"},
		Query: contracts.TelemetryFacetQuery{
			From:    &from,
			Service: &service,
			Limit:   &limit,
		},
	}
	data, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}

	handleTelemetryFacets(&loggingReadStore{}, nil)(bridgeMessageForTest(SubjectTelemetryFacets, data))

	if lastFacetQuery.Service == nil || *lastFacetQuery.Service != service {
		t.Fatalf("forwarded facet query = %#v, want service", lastFacetQuery)
	}
	if lastFacetQuery.Limit == nil || *lastFacetQuery.Limit != limit {
		t.Fatalf("forwarded facet query = %#v, want limit", lastFacetQuery)
	}
}

func TestMetricHandlersForwardInputsAndEnforceReadAuth(t *testing.T) {
	lastMetricNameInput = contracts.MetricNameSearchInput{}
	lastMetricSeriesInput = contracts.MetricSeriesInput{}
	query := "duration"
	metricName := "http.server.duration"
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	allowed := true
	denied := false

	namesRequest := contracts.MetricNameSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-metric-names",
			AuthContext: &contracts.AuthContext{AuthMode: ptr("sso"), TenantID: ptr("tenant-1"), CompanyID: ptr("company-1"), ProjectID: ptr("project-1"), ReadAllowed: &allowed},
		},
		Input: contracts.MetricNameSearchInput{Query: &query},
	}
	handleMetricNameSearch(&loggingReadStore{}, nil)(bridgeMessageForTest(SubjectMetricNames, mustMarshalNATSHandlerTest(t, namesRequest)))
	if lastMetricNameInput.Query == nil || *lastMetricNameInput.Query != query {
		t.Fatalf("forwarded metric names input = %#v, want query", lastMetricNameInput)
	}

	seriesRequest := contracts.MetricSeriesRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-metric-series",
			AuthContext: &contracts.AuthContext{AuthMode: ptr("sso"), TenantID: ptr("tenant-1"), CompanyID: ptr("company-1"), ProjectID: ptr("project-1"), ReadAllowed: &allowed},
		},
		Input: contracts.MetricSeriesInput{
			MetricName:  metricName,
			From:        from,
			To:          to,
			Aggregation: contracts.MetricAggregationAvg,
		},
	}
	handleMetricSeriesQuery(&loggingReadStore{}, nil)(bridgeMessageForTest(SubjectMetricQuery, mustMarshalNATSHandlerTest(t, seriesRequest)))
	if lastMetricSeriesInput.MetricName != metricName {
		t.Fatalf("forwarded metric series input = %#v, want metric name", lastMetricSeriesInput)
	}

	message := bridgeMessageForTest(SubjectMetricQuery, mustMarshalNATSHandlerTest(t, contracts.MetricSeriesRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-metric-denied",
			AuthContext: &contracts.AuthContext{AuthMode: ptr("sso"), TenantID: ptr("tenant-1"), CompanyID: ptr("company-1"), ProjectID: ptr("project-1"), ReadAllowed: &denied},
		},
		Input: seriesRequest.Input,
	}))
	handleMetricSeriesQuery(&loggingReadStore{}, nil)(message)
	var response contracts.MetricSeriesResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("metric series response is not JSON: %v", err)
	}
	if response.OK || response.Error == nil || response.Error.ID != "ERR-016" {
		t.Fatalf("denied metric series response = %#v, want ERR-016", response)
	}

	richRequest := contracts.RichMetricSeriesRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-rich-metric-series",
			AuthContext: &contracts.AuthContext{AuthMode: ptr("sso"), TenantID: ptr("tenant-1"), CompanyID: ptr("company-1"), ProjectID: ptr("project-1"), ReadAllowed: &allowed},
		},
		Input: contracts.RichMetricSeriesInput{
			From: from,
			To:   to,
			Query: contracts.DashboardMetricQueryInput{
				Queries: []contracts.DashboardMetricQueryRowInput{{
					ID:          "requests",
					Label:       "Requests",
					MetricName:  "http.server.requests",
					Aggregation: contracts.MetricAggregationRate,
				}},
			},
		},
	}
	richMessage := bridgeMessageForTest(SubjectRichMetricQuery, mustMarshalNATSHandlerTest(t, richRequest))
	handleRichMetricSeriesQuery(&loggingReadStore{}, nil)(richMessage)
	var richResponse contracts.RichMetricSeriesResponse
	if err := json.Unmarshal(richMessage.response, &richResponse); err != nil {
		t.Fatalf("rich metric series response is not JSON: %v", err)
	}
	if !richResponse.OK || richResponse.Data == nil || richResponse.Data.Series == nil || richResponse.Data.DisplaySeries == nil {
		t.Fatalf("rich metric series response = %#v, want successful bounded result", richResponse)
	}
	if lastMetricSeriesInput.MetricName != "http.server.requests" {
		t.Fatalf("forwarded rich metric series row = %#v, want requests query", lastMetricSeriesInput)
	}
}

func TestTelemetryReadHandlersEnforceReadAuth(t *testing.T) {
	denied := false
	envelope := contracts.BridgeEnvelope{
		RequestID:   "req-denied",
		AuthContext: &contracts.AuthContext{AuthMode: ptr("sso"), TenantID: ptr("tenant-1"), CompanyID: ptr("company-1"), ProjectID: ptr("project-1"), ReadAllowed: &denied},
	}
	tests := []struct {
		name string
		run  func() *portableBridgeMessageTest
	}{
		{name: "trace search", run: func() *portableBridgeMessageTest {
			message := bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, contracts.TraceSearchRequest{BridgeEnvelope: envelope}))
			handleTraceSearch(&loggingReadStore{}, nil)(message)
			return message
		}},
		{name: "trace detail", run: func() *portableBridgeMessageTest {
			message := bridgeMessageForTest(SubjectTraceGet, mustMarshalNATSHandlerTest(t, contracts.TraceDetailRequest{BridgeEnvelope: envelope, TraceID: "trace-1"}))
			handleTraceGet(&loggingReadStore{}, nil)(message)
			return message
		}},
		{name: "log search", run: func() *portableBridgeMessageTest {
			message := bridgeMessageForTest(SubjectLogSearch, mustMarshalNATSHandlerTest(t, contracts.LogSearchRequest{BridgeEnvelope: envelope}))
			handleLogSearch(&loggingReadStore{}, nil)(message)
			return message
		}},
		{name: "facets", run: func() *portableBridgeMessageTest {
			message := bridgeMessageForTest(SubjectTelemetryFacets, mustMarshalNATSHandlerTest(t, contracts.TelemetryFacetRequest{BridgeEnvelope: envelope}))
			handleTelemetryFacets(&loggingReadStore{}, nil)(message)
			return message
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			message := tt.run()
			var response struct {
				OK    bool                   `json:"ok"`
				Error *contracts.BridgeError `json:"error"`
			}
			if err := json.Unmarshal(message.response, &response); err != nil {
				t.Fatalf("response is not JSON: %v", err)
			}
			if response.OK || response.Error == nil || response.Error.ID != "ERR-016" {
				t.Fatalf("response = %#v, want ERR-016", response)
			}
		})
	}
}

func TestTelemetryReadHandlersFailClosedForSSOWithoutReadDecision(t *testing.T) {
	request := contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-missing-read",
			AuthContext: &contracts.AuthContext{
				AuthMode:  ptr("sso"),
				TenantID:  ptr("tenant-1"),
				CompanyID: ptr("company-1"),
				ProjectID: ptr("project-1"),
			},
		},
	}
	message := bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, request))

	handleTraceSearch(&loggingReadStore{}, nil)(message)

	var response contracts.TraceSearchResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("trace search response is not JSON: %v", err)
	}
	if response.OK || response.Error == nil || response.Error.ID != "ERR-016" {
		t.Fatalf("trace search response = %#v, want fail-closed ERR-016", response)
	}
}

func TestTelemetryReadHandlersAcceptSSOReadScopeWithoutReadAllowedFlag(t *testing.T) {
	request := contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-read-scope",
			AuthContext: &contracts.AuthContext{
				AuthMode:  ptr("sso"),
				TenantID:  ptr("tenant-1"),
				CompanyID: ptr("company-1"),
				ProjectID: ptr("project-1"),
				Scopes:    []string{"telemetry:read"},
			},
		},
	}
	message := bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, request))

	handleTraceSearch(&loggingReadStore{}, nil)(message)

	var response contracts.TraceSearchResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("trace search response is not JSON: %v", err)
	}
	if !response.OK {
		t.Fatalf("trace search response = %#v, want read scope accepted", response)
	}
}

func TestReadHandlerRecordsBoundedRequestMetrics(t *testing.T) {
	service := "api"
	rawQuery := "secret-search-text"
	request := contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-trace-search"},
		Query: contracts.TraceSearchQuery{
			Service: &service,
			Query:   &rawQuery,
		},
	}
	recorder := NewInMemoryMetricsRecorder()

	handleTraceSearchWithMetrics(&loggingReadStore{}, nil, recorder)(bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, request)))

	snapshot := recorder.Snapshot()
	assertReadMetricEvent(t, snapshot, "cloudgrid.storage.read.requests", map[string]string{
		"operation": "trace_search",
		"result":    "success",
	})
	assertReadMetricEvent(t, snapshot, "cloudgrid.storage.read.duration", map[string]string{
		"operation": "trace_search",
		"result":    "success",
	})
	assertReadMetricLabelsDoNotContain(t, snapshot, rawQuery, "req-trace-search", "api", "trace-1")
}

func TestReadHandlerRecordsErrorRequestMetrics(t *testing.T) {
	request := contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-trace-search"},
		Query:          contracts.TraceSearchQuery{},
	}
	recorder := NewInMemoryMetricsRecorder()

	handleTraceSearchWithMetrics(&failingReadStore{err: errors.New("database timeout for project_1")}, nil, recorder)(bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, request)))

	snapshot := recorder.Snapshot()
	assertReadMetricEvent(t, snapshot, "cloudgrid.storage.read.requests", map[string]string{
		"operation": "trace_search",
		"result":    "error",
	})
	assertReadMetricEvent(t, snapshot, "cloudgrid.storage.read.duration", map[string]string{
		"operation": "trace_search",
		"result":    "error",
	})
	assertReadMetricLabelsDoNotContain(t, snapshot, "database timeout", "project_1", "ERR-006")
}

func TestLiveTraceHandlersRecordSubscriptionMetrics(t *testing.T) {
	recorder := NewInMemoryMetricsRecorder()
	registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{
		HeartbeatInterval: time.Second,
		MaxSubscriptions:  10,
		Now:               fixedLiveNow,
	})
	startRequest := contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-live-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	}

	handleLiveTraceStartWithMetrics(registry, nil, recorder)(bridgeMessageForTest(SubjectLiveTraceStart, mustMarshalNATSHandlerTest(t, startRequest)))
	handleLiveTraceStopWithMetrics(registry, nil, recorder)(bridgeMessageForTest(SubjectLiveTraceStop, mustMarshalNATSHandlerTest(t, contracts.LiveTraceStopRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-live-stop"},
		SubscriptionID: "sub-1",
	})))

	snapshot := recorder.Snapshot()
	assertReadMetricEventValue(t, snapshot, "cloudgrid.live.subscriptions", map[string]string{
		"service": "cloudgrid.storage_read",
		"result":  "success",
	}, 1)
	assertReadMetricEventValue(t, snapshot, "cloudgrid.live.subscriptions", map[string]string{
		"service": "cloudgrid.storage_read",
		"result":  "success",
	}, -1)
	assertReadMetricLabelsDoNotContain(t, snapshot, "sub-1", "telemetry.traces.live.events.bff-1.sub-1", "req-live")
}

func TestTelemetryHandlersWireRecorderIntoProductionHandlerMap(t *testing.T) {
	recorder := NewInMemoryMetricsRecorder()
	registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{
		HeartbeatInterval: time.Second,
		MaxSubscriptions:  10,
		Now:               fixedLiveNow,
	})
	handlers := telemetryHandlers(nil, &loggingReadStore{}, registry, nil, recorder)
	service := "api"
	request := contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-trace-search"},
		Query:          contracts.TraceSearchQuery{Service: &service},
	}

	handlers[SubjectTraceSearch](bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, request)))

	assertReadMetricEvent(t, recorder.Snapshot(), "cloudgrid.storage.read.requests", map[string]string{
		"operation": "trace_search",
		"result":    "success",
	})
}

func TestRichMetricHandlerEvaluatesBinaryFormulaFromMetricSeries(t *testing.T) {
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	add := contracts.DashboardMetricFormulaBinaryOperatorAdd
	request := contracts.RichMetricSeriesRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-rich-formula"},
		Input: contracts.RichMetricSeriesInput{
			From: from,
			To:   to,
			Query: contracts.DashboardMetricQueryInput{
				Queries: []contracts.DashboardMetricQueryRowInput{{
					ID:          "requests",
					Label:       "Requests",
					MetricName:  "http.server.requests",
					Aggregation: contracts.MetricAggregationCount,
				}},
				Formulas: []contracts.DashboardMetricFormulaInput{{
					ID:    "requests_plus_one",
					Label: "Requests plus one",
					Expression: contracts.DashboardMetricFormulaExpressionInput{
						Kind:     contracts.DashboardMetricFormulaExpressionKindBinary,
						Operator: &add,
						Left: &contracts.DashboardMetricFormulaExpressionInput{
							Kind:  contracts.DashboardMetricFormulaExpressionKindRef,
							RefID: ptr("requests"),
						},
						Right: &contracts.DashboardMetricFormulaExpressionInput{
							Kind:  contracts.DashboardMetricFormulaExpressionKindNumber,
							Value: ptr(1.0),
						},
					},
				}},
				DisplaySeries: []contracts.DashboardMetricDisplaySeriesInput{{
					ID:       "formula-line",
					Label:    "Formula",
					SourceID: "requests_plus_one",
				}},
			},
		},
	}
	message := bridgeMessageForTest(SubjectRichMetricQuery, mustMarshalNATSHandlerTest(t, request))
	handleRichMetricSeriesQuery(&fixedMetricReadStore{from: from}, nil)(message)

	var response contracts.RichMetricSeriesResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("rich metric formula response is not JSON: %v", err)
	}
	if !response.OK || response.Data == nil {
		t.Fatalf("rich metric formula response = %#v, want success", response)
	}
	var formula *contracts.RichMetricSeries
	for index := range response.Data.Series {
		if response.Data.Series[index].SourceID == "requests_plus_one" {
			formula = &response.Data.Series[index]
		}
	}
	if formula == nil || len(formula.Points) != 2 {
		t.Fatalf("formula series = %#v, want two points", formula)
	}
	if formula.Points[0].Value != 3 || formula.Points[1].Value != 5 {
		t.Fatalf("formula point values = %#v, want 3 and 5", formula.Points)
	}
}

func TestProjectTelemetryOverviewHandlerForwardsTargetsAndEnforcesReadAuth(t *testing.T) {
	allowed := true
	denied := false
	tenantID := "tenant-1"
	request := contracts.ProjectTelemetryOverviewRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-project-overview",
			AuthContext: &contracts.AuthContext{AuthMode: ptr("sso"), TenantID: &tenantID, ReadAllowed: &allowed},
		},
		Projects: []contracts.ProjectTelemetryOverviewTarget{{
			TenantID:  &tenantID,
			CompanyID: "company-1",
			ProjectID: "project-1",
		}},
	}
	message := bridgeMessageForTest(SubjectProjectTelemetryOverview, mustMarshalNATSHandlerTest(t, request))
	handleProjectTelemetryOverview(&loggingReadStore{}, nil)(message)
	var response contracts.ProjectTelemetryOverviewResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("project telemetry overview response is not JSON: %v", err)
	}
	if !response.OK || response.Data == nil || len(response.Data.Items) != 1 {
		t.Fatalf("project telemetry overview response = %#v, want one item", response)
	}
	if response.Data.Items[0].CompanyID != "company-1" || response.Data.Items[0].ProjectID != "project-1" {
		t.Fatalf("overview item = %#v, want forwarded target", response.Data.Items[0])
	}

	deniedRequest := request
	deniedRequest.RequestID = "req-project-overview-denied"
	deniedRequest.AuthContext.ReadAllowed = &denied
	deniedMessage := bridgeMessageForTest(SubjectProjectTelemetryOverview, mustMarshalNATSHandlerTest(t, deniedRequest))
	handleProjectTelemetryOverview(&loggingReadStore{}, nil)(deniedMessage)
	var deniedResponse contracts.ProjectTelemetryOverviewResponse
	if err := json.Unmarshal(deniedMessage.response, &deniedResponse); err != nil {
		t.Fatalf("denied response is not JSON: %v", err)
	}
	if deniedResponse.OK || deniedResponse.Error == nil || deniedResponse.Error.ID != "ERR-016" {
		t.Fatalf("denied project telemetry overview response = %#v, want ERR-016", deniedResponse)
	}
}

func TestErrorResponseJSONSerializesBridgeErrorEnvelope(t *testing.T) {
	payload, err := ErrorResponseJSON("req-error", contracts.BridgeError{
		ID:        "ERR-006",
		Code:      "STORAGE_UNAVAILABLE",
		Message:   "Storage is unavailable",
		Retryable: true,
	})
	if err != nil {
		t.Fatalf("ErrorResponseJSON returned error: %v", err)
	}

	var response struct {
		RequestID string                 `json:"requestId"`
		OK        bool                   `json:"ok"`
		Error     *contracts.BridgeError `json:"error"`
	}
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if response.RequestID != "req-error" || response.OK {
		t.Fatalf("response envelope = %#v, want failed request req-error", response)
	}
	if response.Error == nil || response.Error.ID != "ERR-006" || response.Error.Code != "STORAGE_UNAVAILABLE" || !response.Error.Retryable {
		t.Fatalf("response error = %#v, want retryable ERR-006", response.Error)
	}
}

func assertReadMetricEvent(t *testing.T, events []MetricEvent, name string, labels map[string]string) {
	t.Helper()
	for _, event := range events {
		if event.Name != name {
			continue
		}
		matches := true
		for key, value := range labels {
			if event.Labels[key] != value {
				matches = false
				break
			}
		}
		if matches {
			return
		}
	}
	t.Fatalf("metric %s with labels %#v not found in %#v", name, labels, events)
}

func assertReadMetricEventValue(t *testing.T, events []MetricEvent, name string, labels map[string]string, value float64) {
	t.Helper()
	for _, event := range events {
		if event.Name != name || event.Value != value {
			continue
		}
		matches := true
		for key, labelValue := range labels {
			if event.Labels[key] != labelValue {
				matches = false
				break
			}
		}
		if matches {
			return
		}
	}
	t.Fatalf("metric %s value %f with labels %#v not found in %#v", name, value, labels, events)
}

func assertReadMetricLabelsDoNotContain(t *testing.T, events []MetricEvent, forbidden ...string) {
	t.Helper()
	for _, event := range events {
		for key, value := range event.Labels {
			for _, blocked := range forbidden {
				if strings.Contains(key, blocked) || strings.Contains(value, blocked) {
					t.Fatalf("metric label leaked %q in event %#v", blocked, event)
				}
			}
		}
	}
}

func TestBridgeErrorFromErrorMapsKnownReadFailures(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantID     string
		wantCode   string
		retryable  bool
		wantPrefix string
	}{
		{name: "invalid cursor", err: errors.New("ERR-003 INVALID_CURSOR: bad cursor"), wantID: "ERR-003", wantCode: "INVALID_CURSOR", retryable: false},
		{name: "validation", err: validationError("limit is too high"), wantID: "ERR-001", wantCode: "VALIDATION_FAILED", retryable: false, wantPrefix: "ERR-001 VALIDATION_FAILED"},
		{name: "trace not found", err: errors.New("ERR-004 TRACE_NOT_FOUND: missing"), wantID: "ERR-004", wantCode: "TRACE_NOT_FOUND", retryable: false},
		{name: "storage fallback", err: errors.New("provider timeout: raw database detail"), wantID: "ERR-006", wantCode: "STORAGE_UNAVAILABLE", retryable: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := bridgeErrorFromError(tt.err)
			if got.ID != tt.wantID || got.Code != tt.wantCode || got.Retryable != tt.retryable {
				t.Fatalf("bridge error = %#v, want %s %s retryable=%v", got, tt.wantID, tt.wantCode, tt.retryable)
			}
			if tt.wantPrefix != "" && !strings.HasPrefix(got.Message, tt.wantPrefix) {
				t.Fatalf("bridge error message = %q, want prefix %q", got.Message, tt.wantPrefix)
			}
		})
	}
}

func TestReadHandlersLogMappedErrorsForStoreFailures(t *testing.T) {
	tests := []struct {
		name      string
		subject   string
		requestID string
		err       error
		run       func(store *failingReadStore, logger *slog.Logger)
	}{
		{
			name:      "trace search invalid cursor",
			subject:   SubjectTraceSearch,
			requestID: "req-trace-search",
			err:       errors.New("ERR-003 INVALID_CURSOR: bad cursor"),
			run: func(store *failingReadStore, logger *slog.Logger) {
				data := mustMarshalNATSHandlerTest(t, contracts.TraceSearchRequest{
					BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-trace-search"},
					Query:          contracts.TraceSearchQuery{},
				})
				handleTraceSearch(store, logger)(bridgeMessageForTest(SubjectTraceSearch, data))
			},
		},
		{
			name:      "trace detail not found",
			subject:   SubjectTraceGet,
			requestID: "req-trace-get",
			err:       errors.New("ERR-004 TRACE_NOT_FOUND: missing"),
			run: func(store *failingReadStore, logger *slog.Logger) {
				data := mustMarshalNATSHandlerTest(t, contracts.TraceDetailRequest{
					BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-trace-get"},
					TraceID:        "trace-missing",
				})
				handleTraceGet(store, logger)(bridgeMessageForTest(SubjectTraceGet, data))
			},
		},
		{
			name:      "log search storage unavailable",
			subject:   SubjectLogSearch,
			requestID: "req-log-search",
			err:       errors.New("database timeout"),
			run: func(store *failingReadStore, logger *slog.Logger) {
				data := mustMarshalNATSHandlerTest(t, contracts.LogSearchRequest{
					BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-log-search"},
					Query:          contracts.LogSearchQuery{},
				})
				handleLogSearch(store, logger)(bridgeMessageForTest(SubjectLogSearch, data))
			},
		},
		{
			name:      "facets storage unavailable",
			subject:   SubjectTelemetryFacets,
			requestID: "req-facets",
			err:       errors.New("database timeout"),
			run: func(store *failingReadStore, logger *slog.Logger) {
				data := mustMarshalNATSHandlerTest(t, contracts.TelemetryFacetRequest{
					BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-facets"},
					Query:          contracts.TelemetryFacetQuery{},
				})
				handleTelemetryFacets(store, logger)(bridgeMessageForTest(SubjectTelemetryFacets, data))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var out bytes.Buffer
			store := &failingReadStore{err: tt.err}
			tt.run(store, storageReadTestLogger(&out))

			entry := decodeStorageReadLog(t, out.Bytes())
			if entry["status"] != "error" || entry["request_id"] != tt.requestID || entry["operation_or_subject"] != tt.subject {
				t.Fatalf("error log = %#v, want subject %s request %s", entry, tt.subject, tt.requestID)
			}
			if entry["error_id"] == "" || entry["error_code"] == "" {
				t.Fatalf("error log missing mapped error fields: %#v", entry)
			}
		})
	}
}

func TestReadHandlersLogValidationErrorsForInvalidJSON(t *testing.T) {
	tests := []struct {
		name    string
		subject string
		run     func(logger *slog.Logger)
	}{
		{name: "trace search", subject: SubjectTraceSearch, run: func(logger *slog.Logger) {
			handleTraceSearch(&loggingReadStore{}, logger)(bridgeMessageForTest(SubjectTraceSearch, []byte("{")))
		}},
		{name: "trace get", subject: SubjectTraceGet, run: func(logger *slog.Logger) {
			handleTraceGet(&loggingReadStore{}, logger)(bridgeMessageForTest(SubjectTraceGet, []byte("{")))
		}},
		{name: "log search", subject: SubjectLogSearch, run: func(logger *slog.Logger) {
			handleLogSearch(&loggingReadStore{}, logger)(bridgeMessageForTest(SubjectLogSearch, []byte("{")))
		}},
		{name: "facets", subject: SubjectTelemetryFacets, run: func(logger *slog.Logger) {
			handleTelemetryFacets(&loggingReadStore{}, logger)(bridgeMessageForTest(SubjectTelemetryFacets, []byte("{")))
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var out bytes.Buffer
			tt.run(storageReadTestLogger(&out))
			entry := decodeStorageReadLog(t, out.Bytes())
			if entry["status"] != "error" || entry["request_id"] != "" || entry["operation_or_subject"] != tt.subject {
				t.Fatalf("validation log = %#v, want empty request id error for %s", entry, tt.subject)
			}
			if entry["error_id"] != "ERR-001" || entry["error_code"] != "VALIDATION_FAILED" {
				t.Fatalf("validation error fields = %#v, want ERR-001 VALIDATION_FAILED", entry)
			}
		})
	}
}

func TestLiveTraceStartAndStopHandlersMutateRegistryAndLogCompletion(t *testing.T) {
	var out bytes.Buffer
	publisher := &liveTestPublisher{}
	registry := NewLiveTraceRegistry(&liveTestStore{}, publisher, LiveTraceOptions{
		HeartbeatInterval: time.Second,
		MaxSubscriptions:  10,
		Now:               fixedLiveNow,
	})
	logger := storageReadTestLogger(&out)
	startRequest := contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-live-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	}

	handleLiveTraceStart(registry, logger)(bridgeMessageForTest(SubjectLiveTraceStart, mustMarshalNATSHandlerTest(t, startRequest)))
	if registry.Count() != 1 {
		t.Fatalf("subscription count = %d, want live start handler to register subscription", registry.Count())
	}
	if len(publisher.events) != 1 {
		t.Fatalf("published events = %d, want initial heartbeat", len(publisher.events))
	}

	startLog := decodeStorageReadLog(t, firstLogLineNATSHandlerTest(out.Bytes()))
	if startLog["status"] != "ok" || startLog["request_id"] != "req-live-start" || startLog["operation_or_subject"] != SubjectLiveTraceStart {
		t.Fatalf("start log = %#v, want ok live start completion", startLog)
	}

	handleLiveTraceStop(registry, logger)(bridgeMessageForTest(SubjectLiveTraceStop, mustMarshalNATSHandlerTest(t, contracts.LiveTraceStopRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-live-stop"},
		SubscriptionID: "sub-1",
	})))
	if registry.Count() != 0 {
		t.Fatalf("subscription count = %d, want live stop handler to remove subscription", registry.Count())
	}

	stopLog := decodeStorageReadLog(t, lastLogLineNATSHandlerTest(out.Bytes()))
	if stopLog["status"] != "ok" || stopLog["request_id"] != "req-live-stop" || stopLog["operation_or_subject"] != SubjectLiveTraceStop {
		t.Fatalf("stop log = %#v, want ok live stop completion", stopLog)
	}
}

func TestLiveTraceStartHandlerLogsValidationAndAuthorizationErrors(t *testing.T) {
	readAllowed := false
	tests := []struct {
		name      string
		data      []byte
		requestID string
		wantID    string
	}{
		{name: "invalid JSON", data: []byte("{"), requestID: "", wantID: "ERR-001"},
		{
			name: "denied auth",
			data: mustMarshalNATSHandlerTest(t, contracts.LiveTraceStartRequest{
				BridgeEnvelope: contracts.BridgeEnvelope{
					RequestID:   "req-denied",
					AuthContext: &contracts.AuthContext{Mode: "authenticated", ReadAllowed: &readAllowed},
				},
				SubscriptionID: "sub-1",
				SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
				Query:          contracts.LiveTraceQuery{},
			}),
			requestID: "req-denied",
			wantID:    "ERR-016",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var out bytes.Buffer
			registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{Now: fixedLiveNow})

			handleLiveTraceStart(registry, storageReadTestLogger(&out))(bridgeMessageForTest(SubjectLiveTraceStart, tt.data))

			entry := decodeStorageReadLog(t, out.Bytes())
			if entry["status"] != "error" || entry["request_id"] != tt.requestID || entry["operation_or_subject"] != SubjectLiveTraceStart {
				t.Fatalf("live start error log = %#v, want request %q", entry, tt.requestID)
			}
			if entry["error_id"] != tt.wantID {
				t.Fatalf("live start error id = %#v, want %s", entry, tt.wantID)
			}
			if registry.Count() != 0 {
				t.Fatalf("subscription count = %d, want no subscription after failed start", registry.Count())
			}
		})
	}
}

func TestLiveTraceStopHandlerLogsInvalidJSON(t *testing.T) {
	var out bytes.Buffer
	registry := NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{Now: fixedLiveNow})

	handleLiveTraceStop(registry, storageReadTestLogger(&out))(bridgeMessageForTest(SubjectLiveTraceStop, []byte("{")))

	entry := decodeStorageReadLog(t, out.Bytes())
	if entry["status"] != "error" || entry["request_id"] != "" || entry["operation_or_subject"] != SubjectLiveTraceStop {
		t.Fatalf("live stop invalid JSON log = %#v", entry)
	}
	if entry["error_id"] != "ERR-001" || entry["error_code"] != "VALIDATION_FAILED" {
		t.Fatalf("live stop error fields = %#v, want validation error", entry)
	}
}

func TestTracePersistedNotificationHandlerResolvesCandidatesAndLogsCompletion(t *testing.T) {
	now := fixedLiveNow()
	store := &liveTestStore{candidates: []contracts.TraceSummary{
		liveTraceSummary("trace-1", "api", contracts.TraceStatusOK, now, 10),
	}}
	publisher := &liveTestPublisher{}
	registry := NewLiveTraceRegistry(store, publisher, LiveTraceOptions{Now: func() time.Time { return now }})
	_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
		SubscriptionID: "sub-1",
		SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
		Query:          contracts.LiveTraceQuery{},
	})
	if err != nil {
		t.Fatalf("Start returned error: %v", err)
	}
	var out bytes.Buffer

	handleTracePersistedNotification(registry, storageReadTestLogger(&out))(bridgeMessageForTest(SubjectPersistedTraces, mustMarshalNATSHandlerTest(t, contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-notify"},
		CommandID:      "cmd-1",
		TraceIDs:       []string{"trace-1"},
		PersistedAt:    now,
	})))

	if len(store.liveCandidateCalls) != 1 {
		t.Fatalf("candidate calls = %d, want persisted notification to resolve candidates", len(store.liveCandidateCalls))
	}
	events := decodePublishedLiveEvents(t, publisher.events)
	if len(events) != 2 || events[1].Trace == nil || events[1].Trace.ID != "trace-1" {
		t.Fatalf("published events = %#v, want heartbeat plus trace-1 live event", events)
	}
	entry := decodeStorageReadLog(t, out.Bytes())
	if entry["status"] != "ok" || entry["request_id"] != "req-notify" || entry["operation_or_subject"] != SubjectPersistedTraces {
		t.Fatalf("notification log = %#v, want ok completion", entry)
	}
}

func TestTracePersistedNotificationHandlerLogsInvalidJSONAndStoreErrors(t *testing.T) {
	tests := []struct {
		name      string
		registry  *LiveTraceRegistry
		data      []byte
		requestID string
		wantID    string
	}{
		{
			name:      "invalid JSON",
			registry:  NewLiveTraceRegistry(&liveTestStore{}, &liveTestPublisher{}, LiveTraceOptions{Now: fixedLiveNow}),
			data:      []byte("{"),
			requestID: "",
			wantID:    "ERR-001",
		},
		{
			name: "store error",
			registry: func() *LiveTraceRegistry {
				registry := NewLiveTraceRegistry(&liveTestStore{err: errors.New("ERR-006 STORAGE_UNAVAILABLE: unavailable")}, &liveTestPublisher{}, LiveTraceOptions{Now: fixedLiveNow})
				_, err := registry.Start(context.Background(), contracts.LiveTraceStartRequest{
					BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-start"},
					SubscriptionID: "sub-1",
					SinkSubject:    "telemetry.traces.live.events.bff-1.sub-1",
					Query:          contracts.LiveTraceQuery{},
				})
				if err != nil {
					t.Fatalf("Start returned error: %v", err)
				}
				return registry
			}(),
			data: mustMarshalNATSHandlerTest(t, contracts.TracePersistedNotification{
				BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-notify-error"},
				CommandID:      "cmd-1",
				TraceIDs:       []string{"trace-1"},
				PersistedAt:    fixedLiveNow(),
			}),
			requestID: "req-notify-error",
			wantID:    "ERR-006",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var out bytes.Buffer
			handleTracePersistedNotification(tt.registry, storageReadTestLogger(&out))(bridgeMessageForTest(SubjectPersistedTraces, tt.data))

			entry := decodeStorageReadLog(t, out.Bytes())
			if entry["status"] != "error" || entry["request_id"] != tt.requestID || entry["operation_or_subject"] != SubjectPersistedTraces {
				t.Fatalf("notification error log = %#v, want request %q", entry, tt.requestID)
			}
			if entry["error_id"] != tt.wantID {
				t.Fatalf("notification error id = %#v, want %s", entry, tt.wantID)
			}
		})
	}
}

func firstLogLineNATSHandlerTest(data []byte) []byte {
	lines := bytes.Split(bytes.TrimSpace(data), []byte("\n"))
	return lines[0]
}

func lastLogLineNATSHandlerTest(data []byte) []byte {
	lines := bytes.Split(bytes.TrimSpace(data), []byte("\n"))
	return lines[len(lines)-1]
}

func mustMarshalNATSHandlerTest(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

type failingReadStore struct {
	err error
}

func (store *failingReadStore) GetProjectTelemetryOverviews(_ context.Context, _ contracts.ProjectTelemetryOverviewRequest) (contracts.ProjectTelemetryOverviewData, error) {
	return contracts.ProjectTelemetryOverviewData{}, store.err
}

func (store *failingReadStore) SearchTraces(_ context.Context, _ contracts.TraceSearchQuery, _ *contracts.AuthContext) (contracts.TraceSearchData, error) {
	return contracts.TraceSearchData{}, store.err
}

func (store *failingReadStore) SearchLiveTraceCandidates(_ context.Context, _ contracts.LiveTraceQuery, _ []string, _ *contracts.AuthContext) ([]contracts.TraceSummary, error) {
	return nil, store.err
}

func (store *failingReadStore) GetTraceDetail(_ context.Context, _ string, _ *contracts.TraceDetailQuery, _ *contracts.AuthContext) (*contracts.TraceDetailData, error) {
	return nil, store.err
}

func (store *failingReadStore) SearchLogs(_ context.Context, _ contracts.LogSearchQuery, _ *contracts.AuthContext) (contracts.LogSearchData, error) {
	return contracts.LogSearchData{}, store.err
}

func (store *failingReadStore) GetTelemetryFacets(_ context.Context, _ contracts.TelemetryFacetQuery, _ *contracts.AuthContext) (contracts.TelemetryFacetData, error) {
	return contracts.TelemetryFacetData{}, store.err
}

func (store *failingReadStore) SearchMetricNames(_ context.Context, _ contracts.MetricNameSearchInput, _ *contracts.AuthContext) (contracts.MetricNameSearchData, error) {
	return contracts.MetricNameSearchData{}, store.err
}

func (store *failingReadStore) QueryMetricSeries(_ context.Context, _ contracts.MetricSeriesInput, _ *contracts.AuthContext) (contracts.MetricSeriesData, error) {
	return contracts.MetricSeriesData{}, store.err
}

type fixedMetricReadStore struct {
	loggingReadStore
	from time.Time
}

func (store *fixedMetricReadStore) QueryMetricSeries(_ context.Context, input contracts.MetricSeriesInput, _ *contracts.AuthContext) (contracts.MetricSeriesData, error) {
	return contracts.MetricSeriesData{
		Metric:      contracts.MetricDescriptor{Name: input.MetricName, Unit: "requests"},
		Aggregation: input.Aggregation,
		Interval:    "PT1M",
		Series: []contracts.MetricSeries{{
			Labels: contracts.Attributes{},
			Points: []contracts.MetricSeriesPoint{
				{Timestamp: store.from, Value: 2, Exemplars: []contracts.MetricExemplar{}},
				{Timestamp: store.from.Add(time.Minute), Value: 4, Exemplars: []contracts.MetricExemplar{}},
			},
		}},
		Warnings: []contracts.MetricQueryWarning{},
	}, nil
}
