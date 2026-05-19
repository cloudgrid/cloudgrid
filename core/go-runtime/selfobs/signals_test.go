package selfobs

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
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
		Now: func() time.Time {
			return time.Unix(10, 20).UTC()
		},
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{
		Name:      "storage-read nats handler",
		StartTime: time.Unix(10, 0).UTC(),
		EndTime:   time.Unix(10, 1).UTC(),
		Attributes: map[string]string{
			"messaging.system":           "nats",
			"messaging.destination.name": "telemetry.traces.search",
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
	if !hasOTLPResourceAttribute(tracePayload, "service.name", "cloudgrid.storage_read") ||
		!hasOTLPResourceAttribute(tracePayload, "cloudgrid.self_observability.project_id", "cloudgrid-system") ||
		!hasOTLPSpan(tracePayload, "storage-read nats handler") {
		t.Fatalf("trace payload missing resource/span: %#v", tracePayload)
	}
	logPayload := requests["/otlp/v1/logs"]
	if !hasOTLPResourceAttribute(logPayload, "service.name", "cloudgrid.storage_read") ||
		!hasOTLPLogRecord(logPayload, "storage read NATS handler failed") {
		t.Fatalf("log payload missing resource/log: %#v", logPayload)
	}
}

func TestOTLPTraceLogExporterUsesProvidedTraceContext(t *testing.T) {
	var tracePayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/traces" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&tracePayload); err != nil {
			t.Fatalf("decode trace payload: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_write",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{
		Name:         "storage-write ingest message",
		TraceID:      "4bf92f3577b34da6a3ce929d0e0e4736",
		SpanID:       "00f067aa0ba902b7",
		ParentSpanID: "1111111111111111",
		TraceState:   "rojo=1",
	})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	span := firstOTLPSpan(tracePayload)
	if span["traceId"] != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("traceId = %q", span["traceId"])
	}
	if span["spanId"] != "00f067aa0ba902b7" {
		t.Fatalf("spanId = %q", span["spanId"])
	}
	if span["parentSpanId"] != "1111111111111111" {
		t.Fatalf("parentSpanId = %q", span["parentSpanId"])
	}
	if span["traceState"] != "rojo=1" {
		t.Fatalf("traceState = %q", span["traceState"])
	}
}

func TestOTLPTraceLogExporterDropsWhenBuffersAreFullAndAfterShutdown(t *testing.T) {
	requests := map[string]map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		requests[r.URL.Path] = payload
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.otlp_collector",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		MaxBuffer:             1,
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{Name: "first span", StartTime: time.Unix(1, 0), EndTime: time.Unix(1, 1)})
	exporter.RecordSpan(SpanEvent{Name: "dropped span", StartTime: time.Unix(1, 2), EndTime: time.Unix(1, 3)})
	exporter.RecordLog(LogEvent{Message: "first log", Timestamp: time.Unix(1, 4)})
	exporter.RecordLog(LogEvent{Message: "dropped log", Timestamp: time.Unix(1, 5)})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{Name: "after shutdown"})
	exporter.RecordLog(LogEvent{Message: "after shutdown"})
	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() after shutdown error = %v", err)
	}

	if !hasOTLPSpan(requests["/v1/traces"], "first span") || hasOTLPSpan(requests["/v1/traces"], "dropped span") {
		t.Fatalf("trace payload = %#v, want only first buffered span", requests["/v1/traces"])
	}
	if !hasOTLPLogRecord(requests["/v1/logs"], "first log") || hasOTLPLogRecord(requests["/v1/logs"], "dropped log") {
		t.Fatalf("log payload = %#v, want only first buffered log", requests["/v1/logs"])
	}
}

func TestOTLPTraceLogExporterHonorsSignalToggles(t *testing.T) {
	requests := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests[r.URL.Path]++
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.ai_eval_runner",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		TracesEnabled:         true,
		LogsEnabled:           false,
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{Name: "ai-eval-runner nats handler"})
	exporter.RecordLog(LogEvent{Message: "disabled log"})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if requests["/v1/traces"] != 1 || requests["/v1/logs"] != 0 {
		t.Fatalf("requests = %#v, want traces only", requests)
	}
}

func TestOTLPTraceLogExporterSanitizesLogsAndAddsOTLPLogFields(t *testing.T) {
	var logPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/logs" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if err := json.NewDecoder(r.Body).Decode(&logPayload); err != nil {
			t.Fatalf("decode log payload: %v", err)
		}
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
		Now: func() time.Time {
			return time.Unix(20, 30).UTC()
		},
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordLog(LogEvent{
		Message:      strings.Repeat("x", 520) + " bearer service-token user@example.com query { viewer { email } }",
		SeverityText: "ERROR",
		Timestamp:    time.Unix(19, 0).UTC(),
		TraceID:      "4bf92f3577b34da6a3ce929d0e0e4736",
		SpanID:       "00f067aa0ba902b7",
		Attributes: map[string]string{
			"event":                      "storage_query_failed",
			"error_id":                   "ERR-006",
			"error_code":                 "STORAGE_UNAVAILABLE",
			"operation":                  "trace_search",
			"authorization":              "Bearer service-token",
			"cloudgrid.project_id":       "tenant-project",
			"graphql.document":           "query { viewer { email } }",
			"messaging.destination.name": "telemetry.traces.search",
		},
	})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	record := firstOTLPLogRecord(logPayload)
	if record["traceId"] != "4bf92f3577b34da6a3ce929d0e0e4736" || record["spanId"] != "00f067aa0ba902b7" {
		t.Fatalf("log trace/span = %q/%q", record["traceId"], record["spanId"])
	}
	if record["severityText"] != "ERROR" || record["severityNumber"] != float64(17) {
		t.Fatalf("severity fields = %#v", record)
	}
	if record["observedTimeUnixNano"] == "" || record["timeUnixNano"] == "" {
		t.Fatalf("log record missing observed/time fields: %#v", record)
	}
	scope := firstOTLPLogScope(logPayload)
	if scope["name"] != "cloudgrid.self_observability.logs" {
		t.Fatalf("scope name = %q", scope["name"])
	}
	body, _ := record["body"].(map[string]any)
	bodyValue, _ := body["stringValue"].(string)
	if len(bodyValue) > 512 {
		t.Fatalf("body length = %d, want <= 512", len(bodyValue))
	}
	encoded, _ := json.Marshal(logPayload)
	for _, forbidden := range []string{"service-token", "user@example.com", "query { viewer", "tenant-project", "graphql.document", "authorization"} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("payload contains forbidden value/key %q: %s", forbidden, encoded)
		}
	}
	if !hasOTLPAttribute(record["attributes"], "cloudgrid.event", "storage_query_failed") ||
		!hasOTLPAttribute(record["attributes"], "cloudgrid.error_id", "ERR-006") ||
		!hasOTLPAttribute(record["attributes"], "cloudgrid.error_code", "STORAGE_UNAVAILABLE") ||
		!hasOTLPAttribute(record["attributes"], "cloudgrid.operation", "trace_search") {
		t.Fatalf("log attributes missing sanitized CloudGrid fields: %#v", record["attributes"])
	}
}

func TestOTLPTraceLogExporterRecordsDroppedLogMetricWhenBufferIsFull(t *testing.T) {
	metrics := &recordingMetricsRecorder{}
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              "http://127.0.0.1:4318",
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_write",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		MaxBuffer:             1,
		MetricsRecorder:       metrics,
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	defer func() { _ = exporter.Shutdown(context.Background()) }()

	exporter.RecordLog(LogEvent{Message: "first"})
	exporter.RecordLog(LogEvent{Message: "dropped"})

	if !metrics.has("cloudgrid.exporter.failures", map[string]string{"service": "cloudgrid.storage_write", "signal": "logs", "result": "dropped"}) {
		t.Fatalf("metrics = %#v, want dropped log exporter failure metric", metrics.events)
	}
}

func TestOTLPTraceLogExporterFailureIsNonFatalAndLogsBoundedWarning(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	var logs bytes.Buffer
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_write",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		Logger:                slog.New(slog.NewJSONHandler(&logs, nil)),
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	exporter.RecordSpan(SpanEvent{Name: "persist command", Attributes: map[string]string{"result": "success"}})
	exporter.RecordLog(LogEvent{Message: "storage write failed", SeverityText: "ERROR", Attributes: map[string]string{"error_id": "ERR-006"}})

	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v, want exporter failures isolated", err)
	}
	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v, want exporter failures isolated", err)
	}
	logLine := logs.String()
	if !strings.Contains(logLine, "self_observability_export_failed") ||
		!strings.Contains(logLine, "ERR-013") {
		t.Fatalf("failure log = %s, want bounded warning", logLine)
	}
	for _, forbidden := range []string{"persist command", "storage write failed", "500"} {
		if strings.Contains(logLine, forbidden) {
			t.Fatalf("failure log contains forbidden raw detail %q: %s", forbidden, logLine)
		}
	}
}

func TestOTLPTraceLogExporterRateLimitsFailureWarnings(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	current := time.Unix(30, 0).UTC()
	var logs bytes.Buffer
	exporter, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 60,
		ServiceName:           "cloudgrid.otlp_collector",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		Logger:                slog.New(slog.NewJSONHandler(&logs, nil)),
		Now: func() time.Time {
			return current
		},
	})
	if err != nil {
		t.Fatalf("NewOTLPTraceLogExporter() error = %v", err)
	}
	defer func() { _ = exporter.Shutdown(context.Background()) }()

	exporter.RecordLog(LogEvent{Message: "first failure"})
	_ = exporter.Flush(context.Background())
	exporter.RecordLog(LogEvent{Message: "second failure"})
	_ = exporter.Flush(context.Background())
	if got := strings.Count(logs.String(), "\n"); got != 1 {
		t.Fatalf("failure warnings before interval = %d, logs = %s", got, logs.String())
	}
	current = current.Add(61 * time.Second)
	exporter.RecordLog(LogEvent{Message: "third failure"})
	_ = exporter.Flush(context.Background())
	if got := strings.Count(logs.String(), "\n"); got != 2 {
		t.Fatalf("failure warnings after interval = %d, logs = %s", got, logs.String())
	}
}

func TestOTLPTraceLogExporterRejectsInvalidEndpoints(t *testing.T) {
	for _, endpoint := range []string{"", "localhost:4318", "://bad"} {
		t.Run(endpoint, func(t *testing.T) {
			_, err := NewOTLPTraceLogExporter(TraceLogExporterConfig{
				Enabled:     true,
				Endpoint:    endpoint,
				ServiceName: "cloudgrid.otlp_collector",
			})
			if err == nil || !strings.Contains(err.Error(), "ERR-009 CONFIG_INVALID") {
				t.Fatalf("error = %v, want config validation", err)
			}
		})
	}
}

func hasOTLPResourceAttribute(payload map[string]any, key string, value string) bool {
	for _, item := range payloadMapItems(payload["resourceSpans"], payload["resourceLogs"], payload["resourceMetrics"]) {
		resource, _ := item["resource"].(map[string]any)
		if hasOTLPAttribute(resource["attributes"], key, value) {
			return true
		}
	}
	return false
}

func hasOTLPSpan(payload map[string]any, name string) bool {
	for _, resourceSpan := range payloadMapItems(payload["resourceSpans"]) {
		for _, scopeSpan := range payloadMapItems(resourceSpan["scopeSpans"]) {
			for _, span := range payloadMapItems(scopeSpan["spans"]) {
				if span["name"] == name {
					return true
				}
			}
		}
	}
	return false
}

func firstOTLPSpan(payload map[string]any) map[string]any {
	for _, resourceSpan := range payloadMapItems(payload["resourceSpans"]) {
		for _, scopeSpan := range payloadMapItems(resourceSpan["scopeSpans"]) {
			for _, span := range payloadMapItems(scopeSpan["spans"]) {
				return span
			}
		}
	}
	return nil
}

func hasOTLPLogRecord(payload map[string]any, body string) bool {
	for _, resourceLog := range payloadMapItems(payload["resourceLogs"]) {
		for _, scopeLog := range payloadMapItems(resourceLog["scopeLogs"]) {
			for _, record := range payloadMapItems(scopeLog["logRecords"]) {
				bodyValue, _ := record["body"].(map[string]any)
				if bodyValue["stringValue"] == body {
					return true
				}
			}
		}
	}
	return false
}

func firstOTLPLogRecord(payload map[string]any) map[string]any {
	for _, resourceLog := range payloadMapItems(payload["resourceLogs"]) {
		for _, scopeLog := range payloadMapItems(resourceLog["scopeLogs"]) {
			for _, record := range payloadMapItems(scopeLog["logRecords"]) {
				return record
			}
		}
	}
	return nil
}

func firstOTLPLogScope(payload map[string]any) map[string]any {
	for _, resourceLog := range payloadMapItems(payload["resourceLogs"]) {
		for _, scopeLog := range payloadMapItems(resourceLog["scopeLogs"]) {
			scope, _ := scopeLog["scope"].(map[string]any)
			return scope
		}
	}
	return nil
}

func payloadMapItems(values ...any) []map[string]any {
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

type recordingMetricsRecorder struct {
	events []MetricEvent
}

func (recorder *recordingMetricsRecorder) RecordMetric(event MetricEvent) {
	event.Attributes = copyLabels(event.Attributes)
	recorder.events = append(recorder.events, event)
}

func (recorder *recordingMetricsRecorder) Flush(context.Context) error {
	return nil
}

func (recorder *recordingMetricsRecorder) Shutdown(context.Context) error {
	return nil
}

func (recorder *recordingMetricsRecorder) has(name string, attrs map[string]string) bool {
	for _, event := range recorder.events {
		if event.Name != name {
			continue
		}
		matched := true
		for key, value := range attrs {
			if event.Attributes[key] != value {
				matched = false
				break
			}
		}
		if matched {
			return true
		}
	}
	return false
}
