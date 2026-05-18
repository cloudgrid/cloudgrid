package collector

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

func TestHTTPIngestMetricsRecordsAcceptedAndPublishedWithBoundedLabels(t *testing.T) {
	publisher := &recordingPublisher{}
	recorder := NewInMemoryMetricsRecorder()
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		MetricsRecorder: recorder,
	})
	payload := mustProtoJSON(t, metricsRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.requests", map[string]string{
		"signal":    "metrics",
		"transport": "http",
		"result":    "accepted",
	})
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.bytes", map[string]string{
		"signal":    "metrics",
		"transport": "http",
		"result":    "accepted",
	})
	assertMetricValueGreaterThan(t, recorder.Records(), "cloudgrid.ingest.bytes", map[string]string{
		"signal":    "metrics",
		"transport": "http",
		"result":    "accepted",
	}, 0)
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.publish.duration", map[string]string{
		"signal": "metrics",
		"result": "published",
	})
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.commands.published", map[string]string{
		"signal": "metrics",
		"result": "published",
	})
	assertMetricLabelsDoNotContain(t, recorder.Records(), "checkout-api", "POST /orders", "secret-token", "invalid protobuf")
}

func TestHTTPIngestMetricsRecordsRejectedWithoutRawErrorLabels(t *testing.T) {
	publisher := &recordingPublisher{}
	recorder := NewInMemoryMetricsRecorder()
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		MetricsRecorder: recorder,
	})

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewBufferString("not protobuf"))
	request.Header.Set("Content-Type", "application/x-protobuf")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.Code)
	}
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.requests", map[string]string{
		"signal":    "traces",
		"transport": "http",
		"result":    "rejected",
	})
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.bytes", map[string]string{
		"signal":    "traces",
		"transport": "http",
		"result":    "rejected",
	})
	assertMetricLabelsDoNotContain(t, recorder.Records(), "not protobuf", "invalid protobuf", "ERR-008")
}

func TestHTTPIngestMetricsRecordsPublishErrors(t *testing.T) {
	publisher := &recordingPublisher{err: errors.New("nats unavailable")}
	recorder := NewInMemoryMetricsRecorder()
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		MetricsRecorder: recorder,
	})
	payload := mustProtoJSON(t, logsRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", response.Code)
	}
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.publish.duration", map[string]string{
		"signal": "logs",
		"result": "error",
	})
	assertMetricRecord(t, recorder.Records(), "cloudgrid.ingest.requests", map[string]string{
		"signal":    "logs",
		"transport": "http",
		"result":    "rejected",
	})
	assertNoMetricRecord(t, recorder.Records(), "cloudgrid.ingest.commands.published")
	assertMetricLabelsDoNotContain(t, recorder.Records(), "nats unavailable")
}

func TestHTTPIngestMetricsCountsChunkedRequestBytes(t *testing.T) {
	publisher := &recordingPublisher{}
	recorder := NewInMemoryMetricsRecorder()
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		MetricsRecorder: recorder,
	})
	payload := mustProtoJSON(t, metricsRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/metrics", bytes.NewReader(payload))
	request.ContentLength = -1
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	assertMetricValueGreaterThan(t, recorder.Records(), "cloudgrid.ingest.bytes", map[string]string{
		"signal":    "metrics",
		"transport": "http",
		"result":    "accepted",
	}, 0)
}

func TestHTTPIngestMetricsAndSelfObservabilityRecordOversizedRequestWithoutPublishing(t *testing.T) {
	publisher := &recordingPublisher{}
	metrics := NewInMemoryMetricsRecorder()
	selfobs := NewInMemorySelfObservabilityRecorder()
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		MetricsRecorder:   metrics,
		SelfObservability: selfobs,
		MaxRequestBytes:   64,
	})

	request := httptest.NewRequest(http.MethodPost, "/v1/metrics", bytes.NewBufferString(strings.Repeat("x", 128)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", "req-too-large")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", response.Code)
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
	assertMetricRecord(t, metrics.Records(), "cloudgrid.ingest.requests", map[string]string{
		"signal":    "metrics",
		"transport": "http",
		"result":    "rejected",
	})
	assertMetricValueGreaterThan(t, metrics.Records(), "cloudgrid.ingest.bytes", map[string]string{
		"signal":    "metrics",
		"transport": "http",
		"result":    "rejected",
	}, 64)
	if !selfobs.HasSpan("otlp.http /v1/metrics") || !selfobs.HasLog("request_failed") {
		t.Fatalf("self-observability spans=%#v logs=%#v, want HTTP span and request_failed log", selfobs.Spans(), selfobs.Logs())
	}
	assertMetricLabelsDoNotContain(t, metrics.Records(), strings.Repeat("x", 128), "req-too-large")
}

func TestOTLPIngestMetricsRecorderForwardsBoundedEventsToRuntimeExporter(t *testing.T) {
	sink := &recordingRuntimeMetricsRecorder{}
	recorder := NewOTLPIngestMetricsRecorder(sink)

	recorder.RecordIngestRequest("raw-trace-id", "raw-transport", "raw-error")
	recorder.RecordIngestBytes("traces", "http", "accepted", -10)
	recorder.RecordPublishDuration("logs", "published", 25*time.Millisecond)
	recorder.RecordCommandPublished("metrics", "published")

	if len(sink.events) != 4 {
		t.Fatalf("events = %#v, want 4 runtime metric events", sink.events)
	}
	if sink.events[0].Attributes["signal"] != "unknown" ||
		sink.events[0].Attributes["transport"] != "internal" ||
		sink.events[0].Attributes["result"] != "error" {
		t.Fatalf("first event labels = %#v, want bounded enum labels", sink.events[0].Attributes)
	}
	if sink.events[1].Value != 0 {
		t.Fatalf("bytes value = %f, want negative bytes clamped to 0", sink.events[1].Value)
	}
}

type recordingRuntimeMetricsRecorder struct {
	events []selfobs.MetricEvent
}

func (recorder *recordingRuntimeMetricsRecorder) RecordMetric(event selfobs.MetricEvent) {
	recorder.events = append(recorder.events, event)
}

func (recorder *recordingRuntimeMetricsRecorder) Flush(context.Context) error {
	return nil
}

func (recorder *recordingRuntimeMetricsRecorder) Shutdown(context.Context) error {
	return nil
}

func assertMetricRecord(t *testing.T, records []MetricRecord, name string, labels map[string]string) {
	t.Helper()
	for _, record := range records {
		if record.Name != name {
			continue
		}
		if labelsMatch(record.Labels, labels) {
			return
		}
	}
	t.Fatalf("metric %s with labels %#v not found in %#v", name, labels, records)
}

func assertNoMetricRecord(t *testing.T, records []MetricRecord, name string) {
	t.Helper()
	for _, record := range records {
		if record.Name == name {
			t.Fatalf("metric %s found unexpectedly in %#v", name, records)
		}
	}
}

func assertMetricValueGreaterThan(t *testing.T, records []MetricRecord, name string, labels map[string]string, floor float64) {
	t.Helper()
	for _, record := range records {
		if record.Name != name || !labelsMatch(record.Labels, labels) {
			continue
		}
		if record.Value <= floor {
			t.Fatalf("metric %s with labels %#v value = %f, want > %f", name, labels, record.Value, floor)
		}
		return
	}
	t.Fatalf("metric %s with labels %#v not found in %#v", name, labels, records)
}

func labelsMatch(got map[string]string, want map[string]string) bool {
	for key, value := range want {
		if got[key] != value {
			return false
		}
	}
	return true
}

func assertMetricLabelsDoNotContain(t *testing.T, records []MetricRecord, forbidden ...string) {
	t.Helper()
	for _, record := range records {
		for key, value := range record.Labels {
			for _, item := range forbidden {
				if item != "" && (key == item || value == item) {
					t.Fatalf("metric label copied forbidden value %q in %#v", item, record)
				}
			}
		}
	}
}
