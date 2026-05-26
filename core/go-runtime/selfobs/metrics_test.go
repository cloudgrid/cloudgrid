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

func TestOTLPHTTPMetricsExporterPostsMetricsWithResourceAndBearerToken(t *testing.T) {
	var gotPath string
	var gotAuth string
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	exporter, err := NewOTLPHTTPMetricsExporter(MetricsExporterConfig{
		Enabled:        true,
		Endpoint:       server.URL + "/otlp",
		BearerToken:    "secret-token",
		ServiceName:    "cloudgrid.storage_read",
		DeploymentMode: "local",
		CompanyID:      "local",
		ProjectID:      "cloudgrid-system",
		Now: func() time.Time {
			return time.Unix(1, 2).UTC()
		},
	})
	if err != nil {
		t.Fatalf("NewOTLPHTTPMetricsExporter() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{
		Name:  "cloudgrid.storage.read.requests",
		Kind:  MetricKindCounter,
		Value: 1,
		Attributes: map[string]string{
			"operation": "trace_search",
			"result":    "success",
		},
	})

	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	if gotPath != "/otlp/v1/metrics" {
		t.Fatalf("path = %q, want /otlp/v1/metrics", gotPath)
	}
	if gotAuth != "Bearer secret-token" {
		t.Fatalf("authorization = %q", gotAuth)
	}
	if !hasResourceAttribute(payload, "service.name", "cloudgrid.storage_read") {
		t.Fatalf("payload missing service.name resource attribute: %#v", payload)
	}
	if !hasMetric(payload, "cloudgrid.storage.read.requests") {
		t.Fatalf("payload missing metric: %#v", payload)
	}
}

func TestOTLPHTTPMetricsExporterShutdownFlushesBufferedMetrics(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests++
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	exporter, err := NewOTLPHTTPMetricsExporter(MetricsExporterConfig{
		Enabled:        true,
		Endpoint:       server.URL,
		ServiceName:    "cloudgrid.storage_write",
		DeploymentMode: "local",
		CompanyID:      "local",
		ProjectID:      "cloudgrid-system",
	})
	if err != nil {
		t.Fatalf("NewOTLPHTTPMetricsExporter() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{Name: "cloudgrid.storage.persist.commands", Kind: MetricKindCounter, Value: 1})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if requests != 1 {
		t.Fatalf("requests = %d, want 1", requests)
	}
}

func TestOTLPHTTPMetricsExporterDropsWhenBufferFullAndAfterShutdown(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	exporter, err := NewOTLPHTTPMetricsExporter(MetricsExporterConfig{
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
		t.Fatalf("NewOTLPHTTPMetricsExporter() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{Name: "cloudgrid.ingest.requests", Kind: MetricKindCounter, Value: 1})
	exporter.RecordMetric(MetricEvent{Name: "cloudgrid.ingest.bytes", Kind: MetricKindHistogram, Value: 42})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{Name: "cloudgrid.ingest.commands.published", Kind: MetricKindCounter, Value: 1})
	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("Flush() after shutdown error = %v", err)
	}

	if countMetrics(payload) != 1 || !hasMetric(payload, "cloudgrid.ingest.requests") {
		t.Fatalf("payload metrics = %#v, want only first buffered metric", payload)
	}
}

func TestOTLPHTTPMetricsExporterLogsBoundedFailureAndDrainsBuffer(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	var logs bytes.Buffer
	exporter, err := NewOTLPHTTPMetricsExporter(MetricsExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		Logger:                slog.New(slog.NewJSONHandler(&logs, nil)),
	})
	if err != nil {
		t.Fatalf("NewOTLPHTTPMetricsExporter() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{
		Name:  "cloudgrid.storage.read.requests",
		Kind:  MetricKindCounter,
		Value: 1,
		Attributes: map[string]string{
			"operation": "trace_search",
			"result":    "success",
		},
	})

	if err := exporter.Flush(context.Background()); err == nil {
		t.Fatal("Flush() error = nil, want failed export status")
	}
	if err := exporter.Flush(context.Background()); err != nil {
		t.Fatalf("second Flush() error = %v, want drained buffer and no retry storm", err)
	}
	logLine := logs.String()
	if !strings.Contains(logLine, "self_observability_metrics_export_failed") ||
		!strings.Contains(logLine, "ERR-013") {
		t.Fatalf("failure log = %s, want bounded self-observability failure", logLine)
	}
	for _, forbidden := range []string{"trace_search", "503", "service unavailable"} {
		if strings.Contains(logLine, forbidden) {
			t.Fatalf("failure log contains forbidden raw detail %q: %s", forbidden, logLine)
		}
	}
}

func TestOTLPHTTPMetricsExporterShutdownSuppressesBridgeFailureLogs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	var logs bytes.Buffer
	exporter, err := NewOTLPHTTPMetricsExporter(MetricsExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		Logger:                slog.New(slog.NewJSONHandler(&logs, nil)),
	})
	if err != nil {
		t.Fatalf("NewOTLPHTTPMetricsExporter() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{Name: "cloudgrid.storage.read.requests", Kind: MetricKindCounter, Value: 1})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v, want exporter failures isolated", err)
	}
	if logs.Len() != 0 {
		t.Fatalf("shutdown failure logs = %s, want quiet shutdown flush", logs.String())
	}
}

func TestOTLPHTTPMetricsExporterFailureLogLevelCanBeSuppressed(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	var logs bytes.Buffer
	exporter, err := NewOTLPHTTPMetricsExporter(MetricsExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		Logger:                slog.New(slog.NewJSONHandler(&logs, nil)),
		FailureLogLevel:       "off",
	})
	if err != nil {
		t.Fatalf("NewOTLPHTTPMetricsExporter() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{Name: "cloudgrid.storage.read.requests", Kind: MetricKindCounter, Value: 1})

	if err := exporter.Flush(context.Background()); err == nil {
		t.Fatal("Flush() error = nil, want failed export status")
	}
	if logs.Len() != 0 {
		t.Fatalf("failure logs = %s, want suppressed process log", logs.String())
	}
}

func TestOTLPHTTPMetricsExporterUsesConfiguredFailureLogLevel(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	var logs bytes.Buffer
	exporter, err := NewOTLPHTTPMetricsExporter(MetricsExporterConfig{
		Enabled:               true,
		Endpoint:              server.URL,
		ExportIntervalSeconds: 300,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        "local",
		CompanyID:             "local",
		ProjectID:             "cloudgrid-system",
		Logger:                slog.New(slog.NewJSONHandler(&logs, nil)),
		FailureLogLevel:       "info",
	})
	if err != nil {
		t.Fatalf("NewOTLPHTTPMetricsExporter() error = %v", err)
	}
	exporter.RecordMetric(MetricEvent{Name: "cloudgrid.storage.read.requests", Kind: MetricKindCounter, Value: 1})

	if err := exporter.Flush(context.Background()); err == nil {
		t.Fatal("Flush() error = nil, want failed export status")
	}
	if !strings.Contains(logs.String(), `"level":"INFO"`) {
		t.Fatalf("failure logs = %s, want INFO level", logs.String())
	}
}

func hasResourceAttribute(payload map[string]any, key string, value string) bool {
	resourceMetrics, _ := payload["resourceMetrics"].([]any)
	for _, item := range resourceMetrics {
		resourceMetric, _ := item.(map[string]any)
		resource, _ := resourceMetric["resource"].(map[string]any)
		if hasOTLPAttribute(resource["attributes"], key, value) {
			return true
		}
	}
	return false
}

func hasMetric(payload map[string]any, name string) bool {
	resourceMetrics, _ := payload["resourceMetrics"].([]any)
	for _, item := range resourceMetrics {
		resourceMetric, _ := item.(map[string]any)
		scopeMetrics, _ := resourceMetric["scopeMetrics"].([]any)
		for _, scopeItem := range scopeMetrics {
			scopeMetric, _ := scopeItem.(map[string]any)
			metrics, _ := scopeMetric["metrics"].([]any)
			for _, metricItem := range metrics {
				metric, _ := metricItem.(map[string]any)
				if metric["name"] == name {
					return true
				}
			}
		}
	}
	return false
}

func countMetrics(payload map[string]any) int {
	count := 0
	resourceMetrics, _ := payload["resourceMetrics"].([]any)
	for _, item := range resourceMetrics {
		resourceMetric, _ := item.(map[string]any)
		scopeMetrics, _ := resourceMetric["scopeMetrics"].([]any)
		for _, scopeItem := range scopeMetrics {
			scopeMetric, _ := scopeItem.(map[string]any)
			metrics, _ := scopeMetric["metrics"].([]any)
			count += len(metrics)
		}
	}
	return count
}

func hasOTLPAttribute(raw any, key string, value string) bool {
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
