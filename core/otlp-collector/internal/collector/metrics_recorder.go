package collector

import (
	"sync"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

const (
	metricIngestRequests          = "cloudgrid.ingest.requests"
	metricIngestBytes             = "cloudgrid.ingest.bytes"
	metricIngestPublishDuration   = "cloudgrid.ingest.publish.duration"
	metricIngestCommandsPublished = "cloudgrid.ingest.commands.published"
)

type MetricsRecorder interface {
	RecordIngestRequest(signal string, transport string, result string)
	RecordIngestBytes(signal string, transport string, result string, bytes int64)
	RecordPublishDuration(signal string, result string, duration time.Duration)
	RecordCommandPublished(signal string, result string)
}

type OTLPIngestMetricsRecorder struct {
	recorder selfobs.MetricsRecorder
}

func NewOTLPIngestMetricsRecorder(recorder selfobs.MetricsRecorder) OTLPIngestMetricsRecorder {
	return OTLPIngestMetricsRecorder{recorder: recorder}
}

func (recorder OTLPIngestMetricsRecorder) RecordIngestRequest(signal string, transport string, result string) {
	recorder.record(metricIngestRequests, selfobs.MetricKindCounter, 1, map[string]string{
		"signal":    boundedSignal(signal),
		"transport": boundedTransport(transport),
		"result":    boundedResult(result),
	})
}

func (recorder OTLPIngestMetricsRecorder) RecordIngestBytes(signal string, transport string, result string, bytes int64) {
	if bytes < 0 {
		bytes = 0
	}
	recorder.record(metricIngestBytes, selfobs.MetricKindHistogram, float64(bytes), map[string]string{
		"signal":    boundedSignal(signal),
		"transport": boundedTransport(transport),
		"result":    boundedResult(result),
	})
}

func (recorder OTLPIngestMetricsRecorder) RecordPublishDuration(signal string, result string, duration time.Duration) {
	recorder.record(metricIngestPublishDuration, selfobs.MetricKindHistogram, duration.Seconds(), map[string]string{
		"signal": boundedSignal(signal),
		"result": boundedResult(result),
	})
}

func (recorder OTLPIngestMetricsRecorder) RecordCommandPublished(signal string, result string) {
	recorder.record(metricIngestCommandsPublished, selfobs.MetricKindCounter, 1, map[string]string{
		"signal": boundedSignal(signal),
		"result": boundedResult(result),
	})
}

func (recorder OTLPIngestMetricsRecorder) record(name string, kind selfobs.MetricKind, value float64, labels map[string]string) {
	if recorder.recorder == nil {
		return
	}
	recorder.recorder.RecordMetric(selfobs.MetricEvent{Name: name, Kind: kind, Value: value, Attributes: labels})
}

type MetricRecord struct {
	Name   string
	Value  float64
	Labels map[string]string
}

type InMemoryMetricsRecorder struct {
	mu      sync.Mutex
	records []MetricRecord
}

func NewInMemoryMetricsRecorder() *InMemoryMetricsRecorder {
	return &InMemoryMetricsRecorder{}
}

func (recorder *InMemoryMetricsRecorder) RecordIngestRequest(signal string, transport string, result string) {
	recorder.append(metricIngestRequests, 1, map[string]string{
		"signal":    boundedSignal(signal),
		"transport": boundedTransport(transport),
		"result":    boundedResult(result),
	})
}

func (recorder *InMemoryMetricsRecorder) RecordIngestBytes(signal string, transport string, result string, bytes int64) {
	if bytes < 0 {
		bytes = 0
	}
	recorder.append(metricIngestBytes, float64(bytes), map[string]string{
		"signal":    boundedSignal(signal),
		"transport": boundedTransport(transport),
		"result":    boundedResult(result),
	})
}

func (recorder *InMemoryMetricsRecorder) RecordPublishDuration(signal string, result string, duration time.Duration) {
	recorder.append(metricIngestPublishDuration, duration.Seconds(), map[string]string{
		"signal": boundedSignal(signal),
		"result": boundedResult(result),
	})
}

func (recorder *InMemoryMetricsRecorder) RecordCommandPublished(signal string, result string) {
	recorder.append(metricIngestCommandsPublished, 1, map[string]string{
		"signal": boundedSignal(signal),
		"result": boundedResult(result),
	})
}

func (recorder *InMemoryMetricsRecorder) Records() []MetricRecord {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	records := make([]MetricRecord, len(recorder.records))
	for index, record := range recorder.records {
		records[index] = MetricRecord{
			Name:   record.Name,
			Value:  record.Value,
			Labels: cloneStringMap(record.Labels),
		}
	}
	return records
}

func (recorder *InMemoryMetricsRecorder) append(name string, value float64, labels map[string]string) {
	if recorder == nil {
		return
	}
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	recorder.records = append(recorder.records, MetricRecord{
		Name:   name,
		Value:  value,
		Labels: cloneStringMap(labels),
	})
}

func boundedSignal(signal string) string {
	switch signal {
	case "traces", "logs", "metrics", "ai_projections":
		return signal
	default:
		return "unknown"
	}
}

func boundedTransport(transport string) string {
	switch transport {
	case "http", "grpc", "nats", "internal":
		return transport
	default:
		return "internal"
	}
}

func boundedResult(result string) string {
	switch result {
	case "accepted", "rejected", "published", "persisted", "success", "error", "timeout", "dropped":
		return result
	default:
		return "error"
	}
}

func signalForSubject(subject string) string {
	switch subject {
	case SubjectTraceIngest:
		return "traces"
	case SubjectLogIngest:
		return "logs"
	case SubjectMetricIngest:
		return "metrics"
	case SubjectAIProjectionIngest:
		return "ai_projections"
	default:
		return "unknown"
	}
}

func signalForPath(path string) string {
	switch path {
	case "/v1/traces":
		return "traces"
	case "/v1/logs":
		return "logs"
	case "/v1/metrics":
		return "metrics"
	default:
		return "unknown"
	}
}
