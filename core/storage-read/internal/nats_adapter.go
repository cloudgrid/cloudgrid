package internal

import (
	"fmt"
	"log/slog"

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

func SubscribeTelemetryHandlers(nc *nats.Conn, store ports.TelemetryReadStore, logger *slog.Logger) ([]*nats.Subscription, error) {
	liveRegistry := NewLiveTraceRegistry(store, natsLiveTracePublisher{nc: nc}, LiveTraceOptions{})
	handlers := map[string]bridgeMessageHandler{
		SubjectProjectTelemetryOverview: handleProjectTelemetryOverview(store, logger),
		SubjectTraceSearch:              handleTraceSearch(store, logger),
		SubjectTraceGet:                 handleTraceGet(store, logger),
		SubjectLogSearch:                handleLogSearch(store, logger),
		SubjectMetricNames:              handleMetricNameSearch(store, logger),
		SubjectMetricQuery:              handleMetricSeriesQuery(store, logger),
		SubjectTelemetryFacets:          handleTelemetryFacets(store, logger),
		SubjectLiveTraceStart:           handleLiveTraceStart(liveRegistry, logger),
		SubjectLiveTraceStop:            handleLiveTraceStop(liveRegistry, logger),
		SubjectPersistedTraces:          handleTracePersistedNotification(liveRegistry, logger),
	}
	if aiEvalStore, ok := store.(ports.AiEvalReadStore); ok {
		evalLiveRegistry := NewEvalLiveRegistry(aiEvalStore, natsLiveTracePublisher{nc: nc}, EvalLiveOptions{})
		for subject, handler := range aiEvalReadSubjectHandlers(aiEvalStore, evalLiveRegistry, logger) {
			handlers[subject] = handler
		}
	}
	subscriptions := make([]*nats.Subscription, 0, len(handlers))
	for subject, handler := range handlers {
		subscription, err := nc.Subscribe(subject, adaptNATSHandler(handler))
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

func adaptNATSHandler(handler bridgeMessageHandler) nats.MsgHandler {
	return func(msg *nats.Msg) {
		handler(natsBridgeMessage{msg: msg})
	}
}
