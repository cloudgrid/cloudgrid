package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOTLPTraceLogExporterPostsTracesAndLogsWithResourceAndBearer(t *testing.T) {
	requests := map[string]map[string]any{}
	auth := map[string]string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth[r.URL.Path] = r.Header.Get("Authorization")
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode %s payload: %v", r.URL.Path, err)
		}
		requests[r.URL.Path] = payload
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		BearerToken:           "secret-token",
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_write",
		DeploymentMode:        "deployed",
		CompanyID:             "company-1",
		ProjectID:             "project-1",
		Now: func() time.Time {
			return time.Unix(20, 30).UTC()
		},
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{
		Name: "storage-write ingest message",
		Attributes: map[string]string{
			"messaging.system":           "nats",
			"messaging.destination.name": TraceSubject,
			"cloudgrid.request_id":       "req-1",
		},
		Result: "persisted",
	})
	exporter.RecordLog(LogEvent{
		Message:      "storage write ingest failed",
		SeverityText: "WARN",
		Attributes: map[string]string{
			"error_id":   "ERR-006",
			"error_code": "STORAGE_UNAVAILABLE",
			"signal":     "traces",
		},
	})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if auth["/v1/traces"] != "Bearer secret-token" || auth["/v1/logs"] != "Bearer secret-token" {
		t.Fatalf("authorization headers = %#v, want bearer on traces and logs", auth)
	}
	tracePayload := requests["/v1/traces"]
	if !hasResourceAttribute(tracePayload, "service.name", "cloudgrid.storage_write") ||
		!hasResourceAttribute(tracePayload, "cloudgrid.self_observability.company_id", "company-1") ||
		!hasSpan(tracePayload, "storage-write ingest message") {
		t.Fatalf("trace payload missing resource/span: %#v", tracePayload)
	}
	logPayload := requests["/v1/logs"]
	if !hasResourceAttribute(logPayload, "service.name", "cloudgrid.storage_write") ||
		!hasLogRecord(logPayload, "storage write ingest failed") {
		t.Fatalf("log payload missing resource/log: %#v", logPayload)
	}
}

func TestHandleMessageRecordsTraceAndFailureLog(t *testing.T) {
	store := &fakeStore{persistErr: errors.New("ERR-006 STORAGE_UNAVAILABLE: down for project_1")}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, validCommand())
	recorder := NewInMemoryTraceLogRecorder()

	HandleMessageWithSelfObservability(context.Background(), msg, store, publisher, testLogger(t), fixedClock, nil, recorder)

	snapshot := recorder.Snapshot()
	if !hasSpanEvent(snapshot.Spans, "storage-write ingest message", "traces", "error") {
		t.Fatalf("spans = %#v, want traces error span", snapshot.Spans)
	}
	if !hasLogEvent(snapshot.Logs, "storage write ingest failed", "ERR-006") {
		t.Fatalf("logs = %#v, want bounded error log", snapshot.Logs)
	}
	assertTraceLogLabelsDoNotContain(t, snapshot, "project_1", "down for project_1")
}

func TestHandleMessageSuppressesRecursiveSelfObservabilitySignals(t *testing.T) {
	command := validCommand()
	command.Traces[0].Attributes = map[string]any{
		"cloudgrid.self_observability.project_id": "cloudgrid-system",
	}
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, command)
	metrics := NewInMemoryMetricsRecorder()
	tracesLogs := NewInMemoryTraceLogRecorder()

	HandleMessageWithSelfObservability(context.Background(), msg, store, publisher, testLogger(t), fixedClock, metrics, tracesLogs)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.persistCalls != 1 {
		t.Fatalf("persist calls = %d, want 1", store.persistCalls)
	}
	if got := metrics.Snapshot(); len(got) != 0 {
		t.Fatalf("metrics = %#v, want recursive self-observability suppressed", got)
	}
	traceLogSnapshot := tracesLogs.Snapshot()
	if len(traceLogSnapshot.Spans) != 0 || len(traceLogSnapshot.Logs) != 0 {
		t.Fatalf("trace/log snapshot = %#v, want recursive self-observability suppressed", traceLogSnapshot)
	}
}

func TestHandleMetricMessageSuppressesRecursiveSelfObservabilityMetrics(t *testing.T) {
	command := validMetricCommand()
	command.Points[0].Attributes = map[string]any{
		"cloudgrid.self_observability.project_id": "cloudgrid-system",
	}
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMetricMessage(t, command)
	recorder := NewInMemoryMetricsRecorder()

	HandleMessageWithMetrics(context.Background(), msg, store, publisher, testLogger(t), fixedClock, recorder)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.metricPersistCalls != 1 {
		t.Fatalf("metric persist calls = %d, want 1", store.metricPersistCalls)
	}
	if got := recorder.Snapshot(); len(got) != 0 {
		t.Fatalf("metrics = %#v, want recursive self-observability suppressed", got)
	}
}

func TestHandleMessageUsesInboundTraceparentForSelfObservabilitySpan(t *testing.T) {
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, validCommand())
	msg.headers = map[string]string{
		"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		"tracestate":  "rojo=1",
	}
	recorder := NewInMemoryTraceLogRecorder()

	HandleMessageWithSelfObservability(context.Background(), msg, store, publisher, testLogger(t), fixedClock, nil, recorder)

	snapshot := recorder.Snapshot()
	if len(snapshot.Spans) != 1 {
		t.Fatalf("spans = %#v, want one ingest span", snapshot.Spans)
	}
	span := snapshot.Spans[0]
	if span.TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("TraceID = %q", span.TraceID)
	}
	if span.ParentSpanID != "00f067aa0ba902b7" {
		t.Fatalf("ParentSpanID = %q", span.ParentSpanID)
	}
	if span.TraceState != "rojo=1" {
		t.Fatalf("TraceState = %q", span.TraceState)
	}
	if span.SpanID == "" || span.SpanID == span.ParentSpanID {
		t.Fatalf("SpanID = %q, ParentSpanID = %q", span.SpanID, span.ParentSpanID)
	}
}

func TestSignalFilteredTraceLogRecorderHonorsEnabledSignals(t *testing.T) {
	base := NewInMemoryTraceLogRecorder()
	tracesDisabled := NewSignalFilteredTraceLogRecorder(base, false, true)

	tracesDisabled.RecordSpan(SpanEvent{Name: "storage-write ingest message", Result: "success"})
	tracesDisabled.RecordLog(LogEvent{Message: "storage write ingest failed", SeverityText: "WARN"})

	snapshot := base.Snapshot()
	if len(snapshot.Spans) != 0 {
		t.Fatalf("spans = %#v, want none when traces are disabled", snapshot.Spans)
	}
	if len(snapshot.Logs) != 1 {
		t.Fatalf("logs = %#v, want one log when logs are enabled", snapshot.Logs)
	}

	logsDisabled := NewSignalFilteredTraceLogRecorder(base, true, false)
	logsDisabled.RecordSpan(SpanEvent{Name: "storage-write ingest message", Result: "success"})
	logsDisabled.RecordLog(LogEvent{Message: "storage write ingest failed", SeverityText: "WARN"})

	snapshot = base.Snapshot()
	if len(snapshot.Spans) != 1 {
		t.Fatalf("spans = %#v, want one span after traces are enabled", snapshot.Spans)
	}
	if len(snapshot.Logs) != 1 {
		t.Fatalf("logs = %#v, want log count unchanged when logs are disabled", snapshot.Logs)
	}
}

func hasResourceAttribute(payload map[string]any, key string, value string) bool {
	for _, item := range payloadItems(payload["resourceSpans"], payload["resourceLogs"]) {
		resource, _ := item["resource"].(map[string]any)
		if hasOTLPAttribute(resource["attributes"], key, value) {
			return true
		}
	}
	return false
}

func hasSpan(payload map[string]any, name string) bool {
	for _, resourceSpan := range payloadItems(payload["resourceSpans"]) {
		for _, scopeSpan := range payloadItems(resourceSpan["scopeSpans"]) {
			for _, span := range payloadItems(scopeSpan["spans"]) {
				if span["name"] == name {
					return true
				}
			}
		}
	}
	return false
}

func hasLogRecord(payload map[string]any, body string) bool {
	for _, resourceLog := range payloadItems(payload["resourceLogs"]) {
		for _, scopeLog := range payloadItems(resourceLog["scopeLogs"]) {
			for _, record := range payloadItems(scopeLog["logRecords"]) {
				bodyValue, _ := record["body"].(map[string]any)
				if bodyValue["stringValue"] == body {
					return true
				}
			}
		}
	}
	return false
}

func hasOTLPAttribute(raw any, key string, value string) bool {
	for _, item := range payloadItems(raw) {
		valueMap, _ := item["value"].(map[string]any)
		if item["key"] == key && valueMap["stringValue"] == value {
			return true
		}
	}
	return false
}

func hasSpanEvent(spans []SpanEvent, name string, signal string, result string) bool {
	for _, span := range spans {
		if span.Name == name && span.Attributes["signal"] == signal && span.Result == result {
			return true
		}
	}
	return false
}

func hasLogEvent(logs []LogEvent, message string, errorID string) bool {
	for _, log := range logs {
		if log.Message == message && log.Attributes["error_id"] == errorID {
			return true
		}
	}
	return false
}

func assertTraceLogLabelsDoNotContain(t *testing.T, snapshot TraceLogSnapshot, forbidden ...string) {
	t.Helper()
	for _, span := range snapshot.Spans {
		for key, value := range span.Attributes {
			for _, text := range forbidden {
				if key == text || value == text {
					t.Fatalf("span attributes contain forbidden text %q: %#v", text, span.Attributes)
				}
			}
		}
	}
	for _, log := range snapshot.Logs {
		for key, value := range log.Attributes {
			for _, text := range forbidden {
				if key == text || value == text {
					t.Fatalf("log attributes contain forbidden text %q: %#v", text, log.Attributes)
				}
			}
		}
	}
}

func payloadItems(values ...any) []map[string]any {
	var result []map[string]any
	for _, value := range values {
		items, _ := value.([]any)
		for _, item := range items {
			mapped, _ := item.(map[string]any)
			if mapped != nil {
				result = append(result, mapped)
			}
		}
	}
	return result
}
