package ingest

import (
	"errors"
	"fmt"

	"github.com/nats-io/nats.go"
)

type JetStreamManager interface {
	AddStream(cfg *nats.StreamConfig, opts ...nats.JSOpt) (*nats.StreamInfo, error)
	UpdateStream(cfg *nats.StreamConfig, opts ...nats.JSOpt) (*nats.StreamInfo, error)
	AddConsumer(stream string, cfg *nats.ConsumerConfig, opts ...nats.JSOpt) (*nats.ConsumerInfo, error)
	UpdateConsumer(stream string, cfg *nats.ConsumerConfig, opts ...nats.JSOpt) (*nats.ConsumerInfo, error)
}

func EnsureJetStream(js JetStreamManager) error {
	stream := &nats.StreamConfig{
		Name:      StreamName,
		Subjects:  []string{TraceSubject, LogSubject, MetricSubject, AiProjectionSubject},
		Retention: nats.LimitsPolicy,
		Storage:   nats.FileStorage,
		MaxAge:    MaxAge,
	}
	if _, err := js.AddStream(stream); err != nil {
		if !errors.Is(err, nats.ErrStreamNameAlreadyInUse) {
			return fmt.Errorf("%s %s: %w", bridgeErrorID, bridgeErrorCode, err)
		}
		if _, updateErr := js.UpdateStream(stream); updateErr != nil {
			return fmt.Errorf("%s %s: %w", bridgeErrorID, bridgeErrorCode, updateErr)
		}
	}

	consumer := &nats.ConsumerConfig{
		Durable:       ConsumerName,
		AckPolicy:     nats.AckExplicitPolicy,
		AckWait:       AckWait,
		MaxDeliver:    MaxDeliver,
		MaxAckPending: MaxInFlight,
	}
	if _, err := js.AddConsumer(StreamName, consumer); err != nil {
		if !errors.Is(err, nats.ErrConsumerNameAlreadyInUse) {
			return fmt.Errorf("%s %s: %w", bridgeErrorID, bridgeErrorCode, err)
		}
		if _, updateErr := js.UpdateConsumer(StreamName, consumer); updateErr != nil {
			return fmt.Errorf("%s %s: %w", bridgeErrorID, bridgeErrorCode, updateErr)
		}
	}

	return nil
}
