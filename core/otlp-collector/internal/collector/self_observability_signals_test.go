package collector

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

func TestSelfObservabilitySignalExporterPostsTracesAndLogsWithResourceAndBearerOnShutdown(t *testing.T) {
	requests := map[string]map[string]any{}
	authHeaders := map[string]string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeaders[r.URL.Path] = r.Header.Get("Authorization")
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode %s payload: %v", r.URL.Path, err)
		}
		requests[r.URL.Path] = payload
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	exporter, err := NewSelfObservabilitySignalExporter(SelfObservabilitySignalExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL + "/otlp",
		BearerToken:           "secret-token",
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.otlp_collector",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		TracesEnabled:         true,
		LogsEnabled:           true,
		Now: func() time.Time {
			return time.Unix(1, 2).UTC()
		},
	})
	if err != nil {
		t.Fatalf("NewSelfObservabilitySignalExporter() error = %v", err)
	}
	exporter.RecordSpan(SelfObservabilitySpan{
		Name:      "otlp.http /v1/traces",
		StartTime: time.Unix(1, 0).UTC(),
		EndTime:   time.Unix(1, 10).UTC(),
		Attributes: map[string]string{
			"http.route":          "/v1/traces",
			"http.request.method": "POST",
		},
	})
	exporter.RecordLog(SelfObservabilityLog{
		Timestamp:    time.Unix(1, 20).UTC(),
		SeverityText: "WARN",
		Body:         "collector request failed",
		Attributes: map[string]string{
			"event":      "request_failed",
			"error_id":   "ERR-008",
			"error_code": "OTLP_DECODE_FAILED",
		},
	})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if authHeaders["/otlp/v1/traces"] != "Bearer secret-token" || authHeaders["/otlp/v1/logs"] != "Bearer secret-token" {
		t.Fatalf("authorization headers = %#v, want bearer on traces and logs", authHeaders)
	}
	tracePayload := requests["/otlp/v1/traces"]
	if !hasResourceAttribute(tracePayload, "service.name", "cloudgrid.otlp_collector") ||
		!hasResourceAttribute(tracePayload, "cloudgrid.self_observability.project_id", "cloudgrid-system") ||
		!hasSpan(tracePayload, "otlp.http /v1/traces") {
		t.Fatalf("trace payload missing resource attrs or span: %#v", tracePayload)
	}
	logPayload := requests["/otlp/v1/logs"]
	if !hasResourceAttribute(logPayload, "service.name", "cloudgrid.otlp_collector") ||
		!hasLogBody(logPayload, "collector request failed") {
		t.Fatalf("log payload missing resource attrs or log body: %#v", logPayload)
	}
}

func TestSelfObservabilitySignalExporterFiltersDisabledSignalsAndDropsWhenFull(t *testing.T) {
	requests := map[string]map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode %s payload: %v", r.URL.Path, err)
		}
		requests[r.URL.Path] = payload
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	exporter, err := NewSelfObservabilitySignalExporter(SelfObservabilitySignalExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.otlp_collector",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		TracesEnabled:         false,
		LogsEnabled:           true,
		MaxBuffer:             1,
	})
	if err != nil {
		t.Fatalf("NewSelfObservabilitySignalExporter() error = %v", err)
	}
	exporter.RecordSpan(SelfObservabilitySpan{Name: "disabled trace"})
	exporter.RecordLog(SelfObservabilityLog{Body: "first log", Timestamp: time.Unix(1, 0)})
	exporter.RecordLog(SelfObservabilityLog{Body: "dropped log", Timestamp: time.Unix(1, 1)})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
	exporter.RecordLog(SelfObservabilityLog{Body: "after shutdown"})
	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() after shutdown error = %v", err)
	}

	if _, ok := requests["/v1/traces"]; ok {
		t.Fatalf("traces endpoint was called despite disabled traces: %#v", requests["/v1/traces"])
	}
	if !hasLogBody(requests["/v1/logs"], "first log") || hasLogBody(requests["/v1/logs"], "dropped log") {
		t.Fatalf("log payload = %#v, want only first buffered log", requests["/v1/logs"])
	}
}

func TestSelfObservabilitySignalExporterFailureIsNonFatalAndBounded(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	var logs bytes.Buffer
	exporter, err := NewSelfObservabilitySignalExporter(SelfObservabilitySignalExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.otlp_collector",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		TracesEnabled:         true,
		LogsEnabled:           true,
		Logger:                slog.New(slog.NewJSONHandler(&logs, nil)),
	})
	if err != nil {
		t.Fatalf("NewSelfObservabilitySignalExporter() error = %v", err)
	}
	exporter.RecordSpan(SelfObservabilitySpan{Name: "otlp.http /v1/traces"})
	exporter.RecordLog(SelfObservabilityLog{Body: "collector request failed", Attributes: map[string]string{"error_id": "ERR-008"}})

	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v, want export failure isolated", err)
	}
	logLine := logs.String()
	if !strings.Contains(logLine, "self_observability_export_failed") || !strings.Contains(logLine, "ERR-013") {
		t.Fatalf("failure log = %s, want bounded warning", logLine)
	}
	for _, forbidden := range []string{"collector request failed", "otlp.http /v1/traces", "503"} {
		if strings.Contains(logLine, forbidden) {
			t.Fatalf("failure log contains forbidden raw detail %q: %s", forbidden, logLine)
		}
	}
}

func TestSelfObservabilitySignalExporterRejectsInvalidEndpoints(t *testing.T) {
	for _, endpoint := range []string{"", "localhost:4318", "://bad"} {
		t.Run(endpoint, func(t *testing.T) {
			_, err := NewSelfObservabilitySignalExporter(SelfObservabilitySignalExporterConfig{
				Enabled:       true,
				Endpoint:      endpoint,
				ServiceName:   "cloudgrid.otlp_collector",
				TracesEnabled: true,
			})
			if err == nil || !strings.Contains(err.Error(), "ERR-009 CONFIG_INVALID") {
				t.Fatalf("error = %v, want config validation", err)
			}
		})
	}
}

func TestHTTPHandlerRecordsSelfObservabilitySpanAndFailureLog(t *testing.T) {
	recorder := NewInMemorySelfObservabilityRecorder()
	handler := NewHandlerWithOptions(&recordingPublisher{}, NewDiscardLogger(), HandlerOptions{
		SelfObservability: recorder,
		Now: func() time.Time {
			return time.Unix(1, 0).UTC()
		},
	})
	request := httptest.NewRequest(http.MethodPost, "/v1/traces", http.NoBody)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", "req-selfobs")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if !recorder.HasSpan("otlp.http /v1/traces") {
		t.Fatalf("spans = %#v, want HTTP self-observability span", recorder.Spans())
	}
	if !recorder.HasLog("request_failed") {
		t.Fatalf("logs = %#v, want request_failed self-observability log", recorder.Logs())
	}
}

func hasSpan(payload map[string]any, name string) bool {
	resourceSpans, _ := payload["resourceSpans"].([]any)
	for _, item := range resourceSpans {
		resourceSpan, _ := item.(map[string]any)
		scopeSpans, _ := resourceSpan["scopeSpans"].([]any)
		for _, scopeItem := range scopeSpans {
			scopeSpan, _ := scopeItem.(map[string]any)
			spans, _ := scopeSpan["spans"].([]any)
			for _, spanItem := range spans {
				span, _ := spanItem.(map[string]any)
				if span["name"] == name {
					return true
				}
			}
		}
	}
	return false
}

func hasResourceAttribute(payload map[string]any, key string, value string) bool {
	for _, topKey := range []string{"resourceSpans", "resourceLogs"} {
		resources, _ := payload[topKey].([]any)
		for _, item := range resources {
			resourceItem, _ := item.(map[string]any)
			resource, _ := resourceItem["resource"].(map[string]any)
			if hasOTLPAttributeValue(resource["attributes"], key, value) {
				return true
			}
		}
	}
	return false
}

func hasOTLPAttributeValue(raw any, key string, value string) bool {
	attributes, _ := raw.([]any)
	for _, item := range attributes {
		attribute, _ := item.(map[string]any)
		valueMap, _ := attribute["value"].(map[string]any)
		if attribute["key"] == key && valueMap["stringValue"] == value {
			return true
		}
	}
	return false
}

func hasLogBody(payload map[string]any, body string) bool {
	resourceLogs, _ := payload["resourceLogs"].([]any)
	for _, item := range resourceLogs {
		resourceLog, _ := item.(map[string]any)
		scopeLogs, _ := resourceLog["scopeLogs"].([]any)
		for _, scopeItem := range scopeLogs {
			scopeLog, _ := scopeItem.(map[string]any)
			logRecords, _ := scopeLog["logRecords"].([]any)
			for _, logItem := range logRecords {
				record, _ := logItem.(map[string]any)
				value, _ := record["body"].(map[string]any)
				if value["stringValue"] == body {
					return true
				}
			}
		}
	}
	return false
}
