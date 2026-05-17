package main

import (
	"context"
	"log/slog"

	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ingest"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
	"github.com/nats-io/nats.go"
)

func newMessageBridgeAdapter(natsURL string, store ports.TelemetryWriteStore, logger *slog.Logger) (messageBridgeAdapter, error) {
	nc, err := nats.Connect(natsURL, nats.Name("cloudgrid-storage-write"))
	if err != nil {
		return messageBridgeAdapter{}, err
	}

	js, err := nc.JetStream()
	if err != nil {
		nc.Close()
		return messageBridgeAdapter{}, err
	}
	if err := ingest.EnsureJetStream(js); err != nil {
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
			return ingest.RunConsumer(ctx, js, nc, ingest.NewTraceNotificationPublisher(nc), store, logger)
		},
		IsClosed: nc.IsClosed,
		Drain:    nc.Drain,
		Close:    nc.Close,
	}, nil
}
