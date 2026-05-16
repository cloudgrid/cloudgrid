package collector

import (
	"context"
	"time"

	"github.com/nats-io/nats.go"
)

type NATSMessageBridge struct {
	nc *nats.Conn
	js nats.JetStreamContext
}

func ConnectNATSMessageBridge(url string, timeout time.Duration) (*NATSMessageBridge, error) {
	nc, err := nats.Connect(url, nats.Name("cloudgrid-otlp-collector"), nats.Timeout(timeout))
	if err != nil {
		return nil, err
	}
	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return nil, err
	}
	return &NATSMessageBridge{nc: nc, js: js}, nil
}

func (bridge *NATSMessageBridge) Publisher() JetStreamPublisher {
	return NewJetStreamPublisher(bridge.js)
}

func (bridge *NATSMessageBridge) IsClosed() bool {
	return bridge.nc.IsClosed()
}

func (bridge *NATSMessageBridge) Drain() error {
	return bridge.nc.Drain()
}

func (bridge *NATSMessageBridge) Close() {
	bridge.nc.Close()
}

type JetStreamPublisher struct {
	js nats.JetStreamContext
}

func NewJetStreamPublisher(js nats.JetStreamContext) JetStreamPublisher {
	return JetStreamPublisher{js: js}
}

func (publisher JetStreamPublisher) Publish(ctx context.Context, subject string, data []byte) error {
	_, err := publisher.js.Publish(subject, data, nats.Context(ctx))
	return err
}
