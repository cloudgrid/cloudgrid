package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/ports"
	"github.com/nats-io/nats.go"
)

func ConnectNATS(url string) (*nats.Conn, error) {
	conn, err := nats.Connect(url, nats.Name("cloudgrid-storage-read"))
	if err != nil {
		return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS connection failed")
	}
	return conn, nil
}

func SubscribeTelemetryHandlersWithOptions(nc *nats.Conn, store ports.TelemetryReadStore, logger *slog.Logger, recorder MetricsRecorder, traceLogRecorder TraceLogRecorder, limits RuntimeLimits) ([]*nats.Subscription, error) {
	liveRegistry := NewLiveTraceRegistry(store, natsLiveTracePublisher{nc: nc}, LiveTraceOptions{
		MaxSubscriptions: limits.LiveMaxSubscriptions,
		EventBufferSize:  limits.LiveEventBufferSize,
	})
	runLiveTraceHeartbeats(liveRegistry)
	handlers := telemetryHandlersWithSelfObservability(nc, store, liveRegistry, logger, recorder, traceLogRecorder, limits)
	subscriptions := make([]*nats.Subscription, 0, len(handlers))
	for subject, handler := range handlers {
		subscription, err := nc.Subscribe(subject, adaptNATSHandler(recoverStorageReadHandlerPanic(logger, handler)))
		if err != nil {
			return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS subscribe failed")
		}
		subscriptions = append(subscriptions, subscription)
	}
	if err := nc.Flush(); err != nil {
		return nil, fmt.Errorf("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: NATS subscription flush failed")
	}
	return subscriptions, nil
}

func telemetryHandlersWithSelfObservability(nc *nats.Conn, store ports.TelemetryReadStore, liveRegistry *LiveTraceRegistry, logger *slog.Logger, recorder MetricsRecorder, traceLogRecorder TraceLogRecorder, limits RuntimeLimits) map[string]bridgeMessageHandler {
	timeout := readHandlerTimeout(limits.QueryTimeout)
	handlers := map[string]bridgeMessageHandler{
		SubjectProjectTelemetryOverview: withReadSelfObservability("project_telemetry_overview", traceLogRecorder, handleProjectTelemetryOverviewWithMetrics(store, logger, recorder, timeout)),
		SubjectTraceSearch:              withReadSelfObservability("trace_search", traceLogRecorder, handleTraceSearchWithMetrics(store, logger, recorder, timeout)),
		SubjectTraceGet:                 withReadSelfObservability("trace_get", traceLogRecorder, handleTraceGetWithMetrics(store, logger, recorder, timeout)),
		SubjectLogSearch:                withReadSelfObservability("log_search", traceLogRecorder, handleLogSearchWithMetrics(store, logger, recorder, timeout)),
		SubjectMetricNames:              withReadSelfObservability("metric_names", traceLogRecorder, handleMetricNameSearchWithMetrics(store, logger, recorder, timeout)),
		SubjectMetricQuery:              withReadSelfObservability("metric_series", traceLogRecorder, handleMetricSeriesQueryWithMetrics(store, logger, recorder, timeout)),
		SubjectRichMetricQuery:          withReadSelfObservability("rich_metric_series", traceLogRecorder, handleRichMetricSeriesQueryWithMetrics(store, logger, recorder, timeout)),
		SubjectTelemetryFacets:          withReadSelfObservability("telemetry_facets", traceLogRecorder, handleTelemetryFacetsWithMetrics(store, logger, recorder, timeout)),
		SubjectLiveTraceStart:           withReadSelfObservability("live_trace_start", traceLogRecorder, handleLiveTraceStartWithMetrics(liveRegistry, logger, recorder, timeout)),
		SubjectLiveTraceStop:            withReadSelfObservability("live_trace_stop", traceLogRecorder, handleLiveTraceStopWithMetrics(liveRegistry, logger, recorder)),
		SubjectPersistedTraces:          handleTracePersistedNotification(liveRegistry, logger, timeout),
	}
	if aiEvalStore, ok := store.(ports.AiEvalReadStore); ok {
		evalLiveRegistry := NewEvalLiveRegistry(aiEvalStore, natsLiveTracePublisher{nc: nc}, EvalLiveOptions{})
		for subject, handler := range aiEvalReadSubjectHandlers(aiEvalStore, evalLiveRegistry, logger, timeout) {
			handlers[subject] = handler
		}
	}
	return handlers
}

func runLiveTraceHeartbeats(registry *LiveTraceRegistry) {
	interval := time.Second
	if registry.heartbeatInterval < interval {
		interval = registry.heartbeatInterval
	}
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			registry.EmitHeartbeats(context.Background())
		}
	}()
}

type natsLiveTracePublisher struct {
	nc *nats.Conn
}

func (publisher natsLiveTracePublisher) Publish(subject string, data []byte) error {
	return publisher.nc.Publish(subject, data)
}

type natsBridgeMessage struct {
	msg *nats.Msg
}

func (message natsBridgeMessage) Subject() string {
	return message.msg.Subject
}

func (message natsBridgeMessage) Data() []byte {
	return message.msg.Data
}

func (message natsBridgeMessage) Respond(response []byte) error {
	return message.msg.Respond(response)
}

func (message natsBridgeMessage) Header(name string) string {
	return message.msg.Header.Get(name)
}

func adaptNATSHandler(handler bridgeMessageHandler) nats.MsgHandler {
	return func(msg *nats.Msg) {
		handler(natsBridgeMessage{msg: msg})
	}
}

func recoverStorageReadHandlerPanic(logger *slog.Logger, handler bridgeMessageHandler) bridgeMessageHandler {
	return func(message BridgeMessage) {
		defer func() {
			if recovered := recover(); recovered != nil {
				if logger != nil {
					logger.Error("nats_handler_panic_recovered",
						"subject", message.Subject(),
						"error_id", "ERR-013",
						"error_code", "MESSAGE_BRIDGE_UNAVAILABLE",
					)
				}
				_ = message.Respond(canonicalPanicBridgeResponse(message.Data()))
			}
		}()
		handler(message)
	}
}

func canonicalPanicBridgeResponse(data []byte) []byte {
	requestID := requestIDFromJSON(data)
	response := struct {
		RequestID string `json:"requestId"`
		OK        bool   `json:"ok"`
		Error     struct {
			ID        string `json:"id"`
			Code      string `json:"code"`
			Message   string `json:"message"`
			Retryable bool   `json:"retryable"`
		} `json:"error"`
	}{
		RequestID: requestID,
		OK:        false,
	}
	response.Error.ID = "ERR-013"
	response.Error.Code = "MESSAGE_BRIDGE_UNAVAILABLE"
	response.Error.Message = "Message bridge is unavailable"
	response.Error.Retryable = true
	encoded, err := json.Marshal(response)
	if err != nil {
		return []byte(`{"requestId":"","ok":false,"error":{"id":"ERR-013","code":"MESSAGE_BRIDGE_UNAVAILABLE","message":"Message bridge is unavailable","retryable":true}}`)
	}
	return encoded
}

func requestIDFromJSON(data []byte) string {
	var envelope struct {
		RequestID string `json:"requestId"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return ""
	}
	return envelope.RequestID
}
