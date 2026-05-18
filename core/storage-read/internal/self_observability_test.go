package internal

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
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
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL + "/otlp",
		BearerToken:           "secret-token",
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		TracesEnabled:         true,
		LogsEnabled:           true,
		Now: func() time.Time {
			return time.Unix(10, 20).UTC()
		},
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{
		Name: "storage-read nats handler",
		Attributes: map[string]string{
			"messaging.system":           "nats",
			"messaging.destination.name": SubjectTraceSearch,
			"cloudgrid.request_id":       "req-1",
		},
		Result: "success",
	})
	exporter.RecordLog(LogEvent{
		Message:      "storage read NATS handler failed",
		SeverityText: "WARN",
		Attributes: map[string]string{
			"error_id":   "ERR-016",
			"error_code": "FORBIDDEN",
			"operation":  "trace_search",
		},
	})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if auth["/otlp/v1/traces"] != "Bearer secret-token" || auth["/otlp/v1/logs"] != "Bearer secret-token" {
		t.Fatalf("authorization headers = %#v, want bearer on traces and logs", auth)
	}
	tracePayload := requests["/otlp/v1/traces"]
	if !hasResourceAttribute(tracePayload, "service.name", "cloudgrid.storage_read") ||
		!hasResourceAttribute(tracePayload, "cloudgrid.self_observability.project_id", "cloudgrid-system") ||
		!hasSpan(tracePayload, "storage-read nats handler") {
		t.Fatalf("trace payload missing resource/span: %#v", tracePayload)
	}
	logPayload := requests["/otlp/v1/logs"]
	if !hasResourceAttribute(logPayload, "service.name", "cloudgrid.storage_read") ||
		!hasLogRecord(logPayload, "storage read NATS handler failed") {
		t.Fatalf("log payload missing resource/log: %#v", logPayload)
	}
}

func TestOTLPTraceLogExporterDropsEventsBeyondMaxBufferAndIgnoresRecordsAfterShutdown(t *testing.T) {
	requests := map[string]map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode %s payload: %v", r.URL.Path, err)
		}
		requests[r.URL.Path] = payload
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		TracesEnabled:         true,
		LogsEnabled:           true,
		MaxBuffer:             2,
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	for i := 0; i < 3; i++ {
		exporter.RecordSpan(SpanEvent{Name: "storage-read nats handler", Result: "success"})
		exporter.RecordLog(LogEvent{Message: "storage read NATS handler failed", SeverityText: "WARN"})
	}

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if got := countOTLPSpans(requests["/v1/traces"]); got != 2 {
		t.Fatalf("exported spans = %d, want max buffer 2", got)
	}
	if got := countOTLPLogRecords(requests["/v1/logs"]); got != 2 {
		t.Fatalf("exported logs = %d, want max buffer 2", got)
	}
	exporter.RecordSpan(SpanEvent{Name: "storage-read nats handler", Result: "success"})
	exporter.RecordLog(LogEvent{Message: "storage read NATS handler failed", SeverityText: "WARN"})
	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() after shutdown error = %v", err)
	}
	if got := countOTLPSpans(requests["/v1/traces"]); got != 2 {
		t.Fatalf("exported spans after shutdown = %d, want unchanged", got)
	}
}

func TestOTLPTraceLogExporterFlushDropsDrainedBatchOnPostFailure(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		TracesEnabled:         true,
		LogsEnabled:           true,
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	defer func() {
		_ = exporter.Shutdown(context.Background())
	}()
	exporter.RecordSpan(SpanEvent{Name: "storage-read nats handler", Result: "success"})
	exporter.RecordLog(LogEvent{Message: "storage read NATS handler failed", SeverityText: "WARN"})

	err = exporter.Flush(context.Background())
	if err == nil {
		t.Fatal("Flush() error = nil")
	}
	if strings.Join(paths, ",") != "/v1/traces" {
		t.Fatalf("posted paths = %#v, want trace post to fail before log post", paths)
	}

	err = exporter.Flush(context.Background())
	if err != nil {
		t.Fatalf("second Flush() error = %v, want drained failed batch not retried", err)
	}
	if strings.Join(paths, ",") != "/v1/traces" {
		t.Fatalf("posted paths after second flush = %#v, want no retry", paths)
	}
}

func TestReadHandlerRecordsTraceAndFailureLog(t *testing.T) {
	recorder := NewInMemoryTraceLogRecorder()
	request := contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-read-selfobs"},
		Query:          contracts.TraceSearchQuery{},
	}

	withReadSelfObservability("trace_search", recorder, handleTraceSearch(&failingReadStore{err: errors.New("ERR-006 STORAGE_UNAVAILABLE: down for project_1")}, nil))(bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, request)))

	snapshot := recorder.Snapshot()
	if !hasSpanEvent(snapshot.Spans, "storage-read nats handler", "trace_search", "error") {
		t.Fatalf("spans = %#v, want trace_search error span", snapshot.Spans)
	}
	if !hasLogEvent(snapshot.Logs, "storage read NATS handler failed", "ERR-006") {
		t.Fatalf("logs = %#v, want bounded error log", snapshot.Logs)
	}
}

func TestReadHandlerUsesInboundTraceparentForSelfObservabilitySpan(t *testing.T) {
	recorder := NewInMemoryTraceLogRecorder()
	message := bridgeMessageForTest(SubjectTraceSearch, mustMarshalNATSHandlerTest(t, contracts.TraceSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-read-selfobs"},
		Query:          contracts.TraceSearchQuery{},
	}))
	message.headers = map[string]string{
		"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		"tracestate":  "rojo=1",
	}

	withReadSelfObservability("trace_search", recorder, func(msg BridgeMessage) {
		respond(msg, contracts.TraceSearchResponse{RequestID: "req-read-selfobs", OK: true})
	})(message)

	snapshot := recorder.Snapshot()
	if len(snapshot.Spans) != 1 {
		t.Fatalf("spans = %#v, want one", snapshot.Spans)
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
}

func hasResourceAttribute(payload map[string]any, key string, value string) bool {
	for _, item := range payloadItems(payload["resourceSpans"], payload["resourceLogs"], payload["resourceMetrics"]) {
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

func countOTLPSpans(payload map[string]any) int {
	count := 0
	for _, resourceSpan := range payloadItems(payload["resourceSpans"]) {
		for _, scopeSpan := range payloadItems(resourceSpan["scopeSpans"]) {
			count += len(payloadItems(scopeSpan["spans"]))
		}
	}
	return count
}

func countOTLPLogRecords(payload map[string]any) int {
	count := 0
	for _, resourceLog := range payloadItems(payload["resourceLogs"]) {
		for _, scopeLog := range payloadItems(resourceLog["scopeLogs"]) {
			count += len(payloadItems(scopeLog["logRecords"]))
		}
	}
	return count
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

func hasSpanEvent(spans []SpanEvent, name string, operation string, result string) bool {
	for _, span := range spans {
		if span.Name == name && span.Attributes["rpc.method"] == operation && span.Result == result {
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
