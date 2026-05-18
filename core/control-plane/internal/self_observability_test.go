package internal

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

func TestSelfObservabilitySignalExporterFlushPostsOTLPJSONAndDrains(t *testing.T) {
	paths := []string{}
	authHeaders := []string{}
	contentTypes := []string{}
	payloads := map[string]map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		authHeaders = append(authHeaders, r.Header.Get("Authorization"))
		contentTypes = append(contentTypes, r.Header.Get("Content-Type"))
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		payloads[r.URL.Path] = payload
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	exporter := newTestSignalExporter(t, SelfObservabilitySignalExporterConfig{
		Endpoint:      server.URL + "/otlp/",
		BearerToken:   "service-token",
		TracesEnabled: true,
		LogsEnabled:   true,
	})
	exporter.RecordSpan(SelfObservabilitySpan{
		Name:       "nats control.projects.get",
		StartTime:  time.Unix(10, 0),
		EndTime:    time.Unix(11, 0),
		Attributes: map[string]string{"messaging.system": "nats"},
	})
	exporter.RecordLog(SelfObservabilityLog{
		Timestamp:    time.Unix(12, 0),
		SeverityText: "WARN",
		Body:         "control plane NATS handler failed",
		Attributes:   map[string]string{"event": "nats_handler_failed"},
	})

	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush returned error: %v", err)
	}
	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("second Flush returned error: %v", err)
	}

	if strings.Join(paths, ",") != "/otlp/v1/traces,/otlp/v1/logs" {
		t.Fatalf("paths = %#v, want one traces and one logs export", paths)
	}
	for index, auth := range authHeaders {
		if auth != "Bearer service-token" {
			t.Fatalf("auth header %d = %q, want bearer token", index, auth)
		}
	}
	for index, contentType := range contentTypes {
		if contentType != "application/json" {
			t.Fatalf("content type %d = %q, want application/json", index, contentType)
		}
	}
	if !payloadHasResourceAttribute(payloads["/otlp/v1/traces"], "service.name", "cloudgrid.control_plane") {
		t.Fatalf("trace payload missing service resource attribute: %#v", payloads["/otlp/v1/traces"])
	}
	if !payloadHasResourceAttribute(payloads["/otlp/v1/logs"], "cloudgrid.self_observability.project_id", LocalSelfObservabilityProjectID) {
		t.Fatalf("log payload missing project resource attribute: %#v", payloads["/otlp/v1/logs"])
	}
}

func TestSelfObservabilitySignalExporterOmitsAuthorizationWhenBearerTokenEmpty(t *testing.T) {
	var authorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	exporter := newTestSignalExporter(t, SelfObservabilitySignalExporterConfig{
		Endpoint:      server.URL,
		TracesEnabled: true,
	})
	exporter.RecordSpan(SelfObservabilitySpan{Name: "nats control.viewer.get"})

	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush returned error: %v", err)
	}
	if authorization != "" {
		t.Fatalf("authorization header = %q, want absent", authorization)
	}
}

func TestControlHandlerUsesInboundTraceparentForSelfObservabilitySpan(t *testing.T) {
	recorder := NewInMemorySelfObservabilityRecorder()
	message := &captureBridgeMessage{
		headers: map[string]string{
			"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
			"tracestate":  "rojo=1",
		},
	}
	handler := adaptBridgeHandlerWithSelfObservability(
		SubjectViewerGet,
		func(msg BridgeMessage) {
			_ = msg.Respond([]byte(`{"requestId":"req-1","ok":true}`))
		},
		recorder,
	)

	handler(message)

	spans := recorder.Spans()
	if len(spans) != 1 {
		t.Fatalf("spans = %#v, want one", spans)
	}
	if spans[0].TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("TraceID = %q", spans[0].TraceID)
	}
	if spans[0].ParentSpanID != "00f067aa0ba902b7" {
		t.Fatalf("ParentSpanID = %q", spans[0].ParentSpanID)
	}
	if spans[0].TraceState != "rojo=1" {
		t.Fatalf("TraceState = %q", spans[0].TraceState)
	}
}

func TestSelfObservabilitySignalExporterFailureIsLoggedAndDoesNotRetryDrainedPayload(t *testing.T) {
	var output bytes.Buffer
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	exporter := newTestSignalExporter(t, SelfObservabilitySignalExporterConfig{
		Endpoint:      server.URL,
		TracesEnabled: true,
		Logger:        slog.New(slog.NewJSONHandler(&output, nil)),
	})
	exporter.RecordSpan(SelfObservabilitySpan{Name: "nats control.projects.get"})

	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush returned error: %v", err)
	}
	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("second Flush returned error: %v", err)
	}

	if requests != 1 {
		t.Fatalf("requests = %d, want failed payload drained after one attempt", requests)
	}
	if !strings.Contains(output.String(), "self_observability_export_failed") {
		t.Fatalf("log output = %q, want bounded exporter failure warning", output.String())
	}
}

func TestSelfObservabilitySignalExporterRespectsSignalTogglesAndBufferLimit(t *testing.T) {
	requests := map[string]int{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests[r.URL.Path]++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	exporter := newTestSignalExporter(t, SelfObservabilitySignalExporterConfig{
		Endpoint:      server.URL,
		TracesEnabled: true,
		LogsEnabled:   false,
		MaxBuffer:     1,
	})
	exporter.RecordSpan(SelfObservabilitySpan{Name: "first"})
	exporter.RecordSpan(SelfObservabilitySpan{Name: "second"})
	exporter.RecordLog(SelfObservabilityLog{Body: "disabled log signal"})

	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush returned error: %v", err)
	}

	if requests["/v1/traces"] != 1 || requests["/v1/logs"] != 0 {
		t.Fatalf("requests = %#v, want one traces export and no logs export", requests)
	}
}

func TestSelfObservabilitySignalEndpointRejectsInvalidBaseURL(t *testing.T) {
	if _, err := NewSelfObservabilitySignalExporter(SelfObservabilitySignalExporterConfig{
		Enabled:       true,
		Endpoint:      "localhost:4318",
		TracesEnabled: true,
	}); err == nil || !strings.Contains(err.Error(), "ERR-009") {
		t.Fatalf("NewSelfObservabilitySignalExporter error = %v, want ERR-009 invalid endpoint", err)
	}
}

func newTestSignalExporter(t *testing.T, config SelfObservabilitySignalExporterConfig) *SelfObservabilitySignalExporter {
	t.Helper()
	config.Enabled = true
	config.ServiceName = "cloudgrid.control_plane"
	config.DeploymentMode = "local"
	config.CompanyID = LocalCompanyID
	config.ProjectID = LocalSelfObservabilityProjectID
	config.ExportIntervalSeconds = 300
	exporter, err := NewSelfObservabilitySignalExporter(config)
	if err != nil {
		t.Fatalf("NewSelfObservabilitySignalExporter returned error: %v", err)
	}
	t.Cleanup(func() {
		_ = exporter.Shutdown(context.Background())
	})
	return exporter
}

func payloadHasResourceAttribute(payload map[string]any, key string, value string) bool {
	for _, topKey := range []string{"resourceSpans", "resourceLogs"} {
		resources, _ := payload[topKey].([]any)
		for _, item := range resources {
			resourceItem, _ := item.(map[string]any)
			resource, _ := resourceItem["resource"].(map[string]any)
			attributes, _ := resource["attributes"].([]any)
			for _, attributeItem := range attributes {
				attribute, _ := attributeItem.(map[string]any)
				valueMap, _ := attribute["value"].(map[string]any)
				if attribute["key"] == key && valueMap["stringValue"] == value {
					return true
				}
			}
		}
	}
	return false
}
