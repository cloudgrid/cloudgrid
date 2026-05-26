package internal

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/ports"
)

type MetricEvent struct {
	Name   string
	Kind   string
	Value  float64
	Labels map[string]string
}

type MetricsRecorder interface {
	Increment(name string, value int64, labels map[string]string)
	Observe(name string, value float64, labels map[string]string)
}

type OTLPMetricsRecorder struct {
	recorder selfobs.MetricsRecorder
}

func NewOTLPMetricsRecorder(recorder selfobs.MetricsRecorder) OTLPMetricsRecorder {
	return OTLPMetricsRecorder{recorder: recorder}
}

func (recorder OTLPMetricsRecorder) Increment(name string, value int64, labels map[string]string) {
	kind := selfobs.MetricKindCounter
	if name == "cloudgrid.live.subscriptions" {
		kind = selfobs.MetricKindUpDownCounter
	}
	recorder.record(name, kind, float64(value), labels)
}

func (recorder OTLPMetricsRecorder) Observe(name string, value float64, labels map[string]string) {
	recorder.record(name, selfobs.MetricKindHistogram, value, labels)
}

func (recorder OTLPMetricsRecorder) record(name string, kind selfobs.MetricKind, value float64, labels map[string]string) {
	if recorder.recorder == nil {
		return
	}
	recorder.recorder.RecordMetric(selfobs.MetricEvent{Name: name, Kind: kind, Value: value, Attributes: labels})
}

type noopMetricsRecorder struct{}

func (noopMetricsRecorder) Increment(string, int64, map[string]string) {}
func (noopMetricsRecorder) Observe(string, float64, map[string]string) {}

type InMemoryMetricsRecorder struct {
	mu     sync.Mutex
	events []MetricEvent
}

func NewInMemoryMetricsRecorder() *InMemoryMetricsRecorder {
	return &InMemoryMetricsRecorder{}
}

func (recorder *InMemoryMetricsRecorder) Increment(name string, value int64, labels map[string]string) {
	recorder.append(MetricEvent{Name: name, Kind: "counter", Value: float64(value), Labels: copyMetricLabels(labels)})
}

func (recorder *InMemoryMetricsRecorder) Observe(name string, value float64, labels map[string]string) {
	recorder.append(MetricEvent{Name: name, Kind: "histogram", Value: value, Labels: copyMetricLabels(labels)})
}

func (recorder *InMemoryMetricsRecorder) Snapshot() []MetricEvent {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	events := make([]MetricEvent, 0, len(recorder.events))
	for _, event := range recorder.events {
		event.Labels = copyMetricLabels(event.Labels)
		events = append(events, event)
	}
	return events
}

func (recorder *InMemoryMetricsRecorder) append(event MetricEvent) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	recorder.events = append(recorder.events, event)
}

func copyMetricLabels(labels map[string]string) map[string]string {
	copied := make(map[string]string, len(labels))
	for key, value := range labels {
		copied[key] = value
	}
	return copied
}

func metricsRecorderOrNoop(recorder MetricsRecorder) MetricsRecorder {
	if recorder == nil {
		return noopMetricsRecorder{}
	}
	return recorder
}

type observedBridgeMessage struct {
	BridgeMessage
	ok *bool
}

func (message observedBridgeMessage) Respond(response []byte) error {
	var envelope struct {
		OK bool `json:"ok"`
	}
	if err := json.Unmarshal(response, &envelope); err == nil {
		*message.ok = envelope.OK
	}
	return message.BridgeMessage.Respond(response)
}

func withReadMetrics(operation string, recorder MetricsRecorder, handler bridgeMessageHandler) bridgeMessageHandler {
	recorder = metricsRecorderOrNoop(recorder)
	return func(msg BridgeMessage) {
		start := time.Now()
		ok := false
		handler(observedBridgeMessage{BridgeMessage: msg, ok: &ok})
		result := "error"
		if ok {
			result = "success"
		}
		labels := map[string]string{
			"operation": operation,
			"result":    result,
		}
		recorder.Increment("cloudgrid.storage.read.requests", 1, labels)
		recorder.Observe("cloudgrid.storage.read.duration", time.Since(start).Seconds(), labels)
	}
}

func handleProjectTelemetryOverviewWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("project_telemetry_overview", recorder, handleProjectTelemetryOverview(store, logger, timeout))
}

func handleTraceSearchWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("trace_search", recorder, handleTraceSearch(store, logger, timeout))
}

func handleTraceGetWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("trace_get", recorder, handleTraceGet(store, logger, timeout))
}

func handleLogSearchWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("log_search", recorder, handleLogSearch(store, logger, timeout))
}

func handleTelemetryFacetsWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("telemetry_facets", recorder, handleTelemetryFacets(store, logger, timeout))
}

func handleMetricNameSearchWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("metric_names", recorder, handleMetricNameSearch(store, logger, timeout))
}

func handleMetricSeriesQueryWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("metric_series", recorder, handleMetricSeriesQuery(store, logger, timeout))
}

func handleRichMetricSeriesQueryWithMetrics(store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withReadMetrics("rich_metric_series", recorder, handleRichMetricSeriesQuery(store, logger, timeout))
}

func withLiveSubscriptionMetrics(delta int64, recorder MetricsRecorder, handler bridgeMessageHandler) bridgeMessageHandler {
	recorder = metricsRecorderOrNoop(recorder)
	return func(msg BridgeMessage) {
		ok := false
		handler(observedBridgeMessage{BridgeMessage: msg, ok: &ok})
		result := "error"
		value := int64(0)
		if ok {
			result = "success"
			value = delta
		}
		recorder.Increment("cloudgrid.live.subscriptions", value, map[string]string{
			"service": "cloudgrid.storage_read",
			"result":  result,
		})
	}
}

func handleLiveTraceStartWithMetrics(registry *LiveTraceRegistry, logger *slog.Logger, recorder MetricsRecorder, timeout time.Duration) bridgeMessageHandler {
	return withLiveSubscriptionMetrics(1, recorder, handleLiveTraceStart(registry, logger, timeout))
}

func handleLiveTraceStopWithMetrics(registry *LiveTraceRegistry, logger *slog.Logger, recorder MetricsRecorder) bridgeMessageHandler {
	return withLiveSubscriptionMetrics(-1, recorder, handleLiveTraceStop(registry, logger))
}
