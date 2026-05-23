package ingest

import (
	"context"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
	"log/slog"
)

type SpanEvent = selfobs.SpanEvent
type LogEvent = selfobs.LogEvent
type TraceLogExporterConfig = selfobs.TraceLogExporterConfig
type OTLPTraceLogExporter = selfobs.OTLPTraceLogExporter

var NewOTLPTraceLogExporter = selfobs.NewOTLPTraceLogExporter

type TraceLogRecorder interface {
	RecordSpan(event SpanEvent)
	RecordLog(event LogEvent)
}

type signalFilteredTraceLogRecorder struct {
	recorder      TraceLogRecorder
	tracesEnabled bool
	logsEnabled   bool
}

func NewSignalFilteredTraceLogRecorder(recorder TraceLogRecorder, tracesEnabled bool, logsEnabled bool) TraceLogRecorder {
	if recorder == nil {
		return nil
	}
	return signalFilteredTraceLogRecorder{recorder: recorder, tracesEnabled: tracesEnabled, logsEnabled: logsEnabled}
}

func (recorder signalFilteredTraceLogRecorder) RecordSpan(event SpanEvent) {
	if recorder.tracesEnabled {
		recorder.recorder.RecordSpan(event)
	}
}

func (recorder signalFilteredTraceLogRecorder) RecordLog(event LogEvent) {
	if recorder.logsEnabled {
		recorder.recorder.RecordLog(event)
	}
}

type TraceLogSnapshot struct {
	Spans []SpanEvent
	Logs  []LogEvent
}

type InMemoryTraceLogRecorder struct {
	spans []SpanEvent
	logs  []LogEvent
}

func NewInMemoryTraceLogRecorder() *InMemoryTraceLogRecorder {
	return &InMemoryTraceLogRecorder{}
}

func (recorder *InMemoryTraceLogRecorder) RecordSpan(event SpanEvent) {
	event.Attributes = copyLabels(event.Attributes)
	recorder.spans = append(recorder.spans, event)
}

func (recorder *InMemoryTraceLogRecorder) RecordLog(event LogEvent) {
	event.Attributes = copyLabels(event.Attributes)
	recorder.logs = append(recorder.logs, event)
}

func (recorder *InMemoryTraceLogRecorder) Snapshot() TraceLogSnapshot {
	return TraceLogSnapshot{
		Spans: append([]SpanEvent(nil), recorder.spans...),
		Logs:  append([]LogEvent(nil), recorder.logs...),
	}
}

func HandleMessageWithSelfObservability(ctx context.Context, msg Message, store ports.TelemetryWriteStore, publisher ports.TraceNotificationPublisher, logger *slog.Logger, now func() time.Time, metricsRecorder MetricsRecorder, traceLogRecorder TraceLogRecorder) {
	if isSelfObservabilityIngestMessage(msg.Subject(), msg.Data()) {
		HandleMessageWithMetrics(ctx, msg, store, publisher, logger, now, nil)
		return
	}
	if traceLogRecorder == nil {
		HandleMessageWithMetrics(ctx, msg, store, publisher, logger, now, metricsRecorder)
		return
	}
	start := now()
	traceContext := selfobs.NewRootTraceContext()
	if headers, ok := msg.(interface{ Header(string) string }); ok {
		if parent, ok := selfobs.TraceContextFromHeaders(headers); ok {
			traceContext = selfobs.NewChildTraceContext(parent)
		}
	}
	ctx = selfobs.ContextWithTraceContext(ctx, traceContext)
	wrapped := &selfObservabilityMessage{Message: msg}
	HandleMessageWithMetrics(ctx, wrapped, store, publisher, logger, now, metricsRecorder)
	result := "error"
	if wrapped.acked && !wrapped.naked {
		result = "success"
	}
	signal := signalForSubject(msg.Subject())
	traceLogRecorder.RecordSpan(SpanEvent{
		Name:         "storage-write ingest message",
		TraceID:      traceContext.TraceID,
		SpanID:       traceContext.SpanID,
		ParentSpanID: traceContext.ParentSpanID,
		TraceState:   traceContext.TraceState,
		StartTime:    start,
		EndTime:      now(),
		Result:       result,
		Attributes: map[string]string{
			"messaging.system":           "nats",
			"messaging.destination.name": msg.Subject(),
			"signal":                     signal,
		},
	})
	if result != "success" {
		traceLogRecorder.RecordLog(LogEvent{
			Message:      "storage write ingest failed",
			SeverityText: "WARN",
			Timestamp:    now(),
			Attributes: map[string]string{
				"signal":     signal,
				"error_id":   storageErrorID,
				"error_code": storageErrorCode,
			},
		})
	}
}

type selfObservabilityMessage struct {
	Message
	acked bool
	naked bool
}

func (message *selfObservabilityMessage) Ack() error {
	message.acked = true
	return message.Message.Ack()
}

func (message *selfObservabilityMessage) NakWithDelay(delay time.Duration) error {
	message.naked = true
	return message.Message.NakWithDelay(delay)
}

func isSelfObservabilityIngestMessage(subject string, data []byte) bool {
	switch subject {
	case TraceSubject, LogSubject:
		command, err := decodeCommand(data)
		if err != nil {
			return false
		}
		return isSelfObservabilityTelemetryCommand(command)
	case MetricSubject:
		command, err := decodeMetricsCommand(data)
		if err != nil {
			return false
		}
		return isSelfObservabilityMetricsCommand(command)
	default:
		return false
	}
}

func isSelfObservabilityTelemetryCommand(command contracts.PersistTelemetryCommand) bool {
	for _, trace := range command.Traces {
		if hasSelfObservabilityAttribute(trace.Attributes) {
			return true
		}
	}
	for _, span := range command.Spans {
		if hasSelfObservabilityAttribute(span.Attributes) {
			return true
		}
	}
	for _, log := range command.Logs {
		if hasSelfObservabilityAttribute(log.Attributes) {
			return true
		}
	}
	return false
}

func isSelfObservabilityMetricsCommand(command contracts.PersistMetricsCommand) bool {
	for _, point := range command.Points {
		if hasSelfObservabilityAttribute(point.Attributes) {
			return true
		}
	}
	return false
}

func hasSelfObservabilityAttribute(attributes contracts.Attributes) bool {
	if attributes == nil {
		return false
	}
	for _, key := range []string{
		"cloudgrid.self_observability.project_id",
		"cloudgrid.self_observability.company_id",
	} {
		if _, ok := attributes[key]; ok {
			return true
		}
	}
	return false
}
