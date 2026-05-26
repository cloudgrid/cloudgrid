package internal

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

type SpanEvent = selfobs.SpanEvent
type LogEvent = selfobs.LogEvent
type TraceLogExporterConfig = selfobs.TraceLogExporterConfig
type OTLPTraceLogExporter = selfobs.OTLPTraceLogExporter

type TraceLogRecorder interface {
	RecordSpan(event SpanEvent)
	RecordLog(event LogEvent)
}

func NewOTLPTraceLogExporter(config TraceLogExporterConfig) (*OTLPTraceLogExporter, error) {
	return selfobs.NewOTLPTraceLogExporter(config)
}

type TraceLogSnapshot struct {
	Spans []SpanEvent
	Logs  []LogEvent
}

type InMemoryTraceLogRecorder struct {
	mu    sync.Mutex
	spans []SpanEvent
	logs  []LogEvent
}

func NewInMemoryTraceLogRecorder() *InMemoryTraceLogRecorder {
	return &InMemoryTraceLogRecorder{}
}

func (recorder *InMemoryTraceLogRecorder) RecordSpan(event SpanEvent) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	event.Attributes = copyMetricLabels(event.Attributes)
	recorder.spans = append(recorder.spans, event)
}

func (recorder *InMemoryTraceLogRecorder) RecordLog(event LogEvent) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	event.Attributes = copyMetricLabels(event.Attributes)
	recorder.logs = append(recorder.logs, event)
}

func (recorder *InMemoryTraceLogRecorder) Snapshot() TraceLogSnapshot {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	snapshot := TraceLogSnapshot{
		Spans: make([]SpanEvent, 0, len(recorder.spans)),
		Logs:  make([]LogEvent, 0, len(recorder.logs)),
	}
	for _, span := range recorder.spans {
		span.Attributes = copyMetricLabels(span.Attributes)
		snapshot.Spans = append(snapshot.Spans, span)
	}
	for _, log := range recorder.logs {
		log.Attributes = copyMetricLabels(log.Attributes)
		snapshot.Logs = append(snapshot.Logs, log)
	}
	return snapshot
}

type selfObsBridgeMessage struct {
	BridgeMessage
	ok        *bool
	errorID   *string
	errorCode *string
}

func (message selfObsBridgeMessage) Respond(response []byte) error {
	var envelope struct {
		OK    bool                   `json:"ok"`
		Error *contracts.BridgeError `json:"error"`
	}
	if err := json.Unmarshal(response, &envelope); err == nil {
		*message.ok = envelope.OK
		if envelope.Error != nil {
			*message.errorID = envelope.Error.ID
			*message.errorCode = envelope.Error.Code
		}
	}
	return message.BridgeMessage.Respond(response)
}

func withReadSelfObservability(operation string, recorder TraceLogRecorder, handler bridgeMessageHandler) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		if recorder == nil {
			handler(msg)
			return
		}
		start := time.Now()
		ok := false
		errorID := ""
		errorCode := ""
		handler(selfObsBridgeMessage{BridgeMessage: msg, ok: &ok, errorID: &errorID, errorCode: &errorCode})
		result := "error"
		if ok {
			result = "success"
		}
		traceContext := selfobs.NewRootTraceContext()
		if headers, ok := msg.(interface{ Header(string) string }); ok {
			if parent, ok := selfobs.TraceContextFromHeaders(headers); ok {
				traceContext = selfobs.NewChildTraceContext(parent)
			}
		}
		recorder.RecordSpan(SpanEvent{
			Name:         "storage-read nats handler",
			TraceID:      traceContext.TraceID,
			SpanID:       traceContext.SpanID,
			ParentSpanID: traceContext.ParentSpanID,
			TraceState:   traceContext.TraceState,
			Attributes: map[string]string{
				"messaging.system":           "nats",
				"messaging.destination.name": boundedReadOperation(operation),
				"rpc.method":                 boundedReadOperation(operation),
				"duration_ms":                fmt.Sprintf("%d", time.Since(start).Milliseconds()),
			},
			Result: result,
		})
		if !ok {
			recorder.RecordLog(LogEvent{
				Message:      "storage read NATS handler failed",
				SeverityText: "WARN",
				Attributes: map[string]string{
					"operation":  boundedReadOperation(operation),
					"error_id":   boundedErrorID(errorID),
					"error_code": boundedErrorCode(errorCode),
				},
			})
		}
	}
}

func boundedReadOperation(operation string) string {
	switch operation {
	case "project_telemetry_overview", "trace_search", "trace_get", "log_search", "telemetry_facets", "metric_names", "metric_series", "rich_metric_series", "live_trace_start", "live_trace_stop":
		return operation
	default:
		return "unknown"
	}
}

func boundedErrorID(id string) string {
	switch id {
	case "ERR-001", "ERR-003", "ERR-006", "ERR-013", "ERR-014", "ERR-016":
		return id
	default:
		return "ERR-006"
	}
}

func boundedErrorCode(code string) string {
	switch code {
	case "VALIDATION_FAILED", "INVALID_CURSOR", "STORAGE_UNAVAILABLE", "MESSAGE_BRIDGE_UNAVAILABLE", "MESSAGE_BRIDGE_TIMEOUT", "FORBIDDEN":
		return code
	default:
		return "STORAGE_UNAVAILABLE"
	}
}
