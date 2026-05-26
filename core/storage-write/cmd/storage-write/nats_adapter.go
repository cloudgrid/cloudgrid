package main

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/config"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ingest"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
	"github.com/nats-io/nats.go"
)

func newMessageBridgeAdapter(natsURL string, store ports.TelemetryWriteStore, logger *slog.Logger) (messageBridgeAdapter, error) {
	return newMessageBridgeAdapterWithMetrics(natsURL, store, logger, nil, config.ConsumerConfig{})
}

func newMessageBridgeAdapterWithMetrics(natsURL string, store ports.TelemetryWriteStore, logger *slog.Logger, recorder ingest.MetricsRecorder, consumer config.ConsumerConfig) (messageBridgeAdapter, error) {
	return newMessageBridgeAdapterWithSelfObservability(natsURL, store, logger, recorder, nil, consumer)
}

func newMessageBridgeAdapterWithSelfObservability(natsURL string, store ports.TelemetryWriteStore, logger *slog.Logger, recorder ingest.MetricsRecorder, traceLogRecorder ingest.TraceLogRecorder, consumer config.ConsumerConfig) (messageBridgeAdapter, error) {
	options := consumerOptions(consumer)
	nc, err := nats.Connect(natsURL, nats.Name("cloudgrid-storage-write"))
	if err != nil {
		return messageBridgeAdapter{}, err
	}

	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return messageBridgeAdapter{}, err
	}
	if err := ingest.EnsureJetStreamWithOptions(js, options); err != nil {
		nc.Close()
		return messageBridgeAdapter{}, err
	}
	if _, err := nc.Subscribe(ingest.MaxDeliveryAdvisory, func(msg *nats.Msg) {
		ingest.HandleMaxDeliveryAdvisory(msg.Data, logger)
	}); err != nil {
		nc.Close()
		return messageBridgeAdapter{}, err
	}
	if aiStore, ok := store.(ports.AIWriteStore); ok {
		if err := ingest.RegisterEvalMutationResponders(nc, js, aiStore, logger); err != nil {
			nc.Close()
			return messageBridgeAdapter{}, err
		}
	}

	return messageBridgeAdapter{
		RunConsumer: func(ctx context.Context) error {
			return ingest.RunConsumerWithOptions(ctx, pullSubscriberJetStream{JetStreamContext: js}, nc, ingest.NewTraceNotificationPublisher(nc), store, logger, recorder, traceLogRecorder, options)
		},
		CheckReady: func(ctx context.Context) error {
			return checkNATSReady(ctx, nc)
		},
		Drain: nc.Drain,
		Close: nc.Close,
	}, nil
}

func checkNATSReady(ctx context.Context, nc *nats.Conn) error {
	if nc == nil || nc.IsClosed() || nc.IsDraining() {
		return errors.New("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: invalid NATS connection")
	}
	timeout := time.Second
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining > 0 && remaining < timeout {
			timeout = remaining
		}
	}
	return nc.FlushTimeout(timeout)
}

func consumerOptions(consumer config.ConsumerConfig) ingest.ConsumerOptions {
	return ingest.ConsumerOptions{
		PullBatchSize: consumer.PullBatchSize,
		PullMaxWait:   time.Duration(consumer.PullMaxWaitMS) * time.Millisecond,
		AckWait:       time.Duration(consumer.AckWaitSeconds) * time.Second,
		MaxDeliver:    consumer.MaxDeliver,
		MaxAckPending: consumer.MaxAckPending,
		Concurrency:   consumer.Concurrency,
		ConsumerMode:  consumer.Mode,
	}
}

type pullSubscriberJetStream struct {
	nats.JetStreamContext
}

func (js pullSubscriberJetStream) PullSubscribe(subject string, durable string, opts ...nats.SubOpt) (ingest.PullSubscription, error) {
	return js.JetStreamContext.PullSubscribe(subject, durable, opts...)
}
