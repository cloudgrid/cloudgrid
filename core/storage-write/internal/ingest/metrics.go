package ingest

import (
	"sync"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
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
	recorder.record(name, selfobs.MetricKindCounter, float64(value), labels)
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
	recorder.append(MetricEvent{Name: name, Kind: "counter", Value: float64(value), Labels: copyLabels(labels)})
}

func (recorder *InMemoryMetricsRecorder) Observe(name string, value float64, labels map[string]string) {
	recorder.append(MetricEvent{Name: name, Kind: "histogram", Value: value, Labels: copyLabels(labels)})
}

func (recorder *InMemoryMetricsRecorder) Snapshot() []MetricEvent {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	events := make([]MetricEvent, 0, len(recorder.events))
	for _, event := range recorder.events {
		event.Labels = copyLabels(event.Labels)
		events = append(events, event)
	}
	return events
}

func (recorder *InMemoryMetricsRecorder) append(event MetricEvent) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	recorder.events = append(recorder.events, event)
}

func copyLabels(labels map[string]string) map[string]string {
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
