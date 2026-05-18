package ingest

import (
	"errors"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
)

type JetStreamManager interface {
	AddStream(cfg *nats.StreamConfig, opts ...nats.JSOpt) (*nats.StreamInfo, error)
	UpdateStream(cfg *nats.StreamConfig, opts ...nats.JSOpt) (*nats.StreamInfo, error)
	AddConsumer(stream string, cfg *nats.ConsumerConfig, opts ...nats.JSOpt) (*nats.ConsumerInfo, error)
	UpdateConsumer(stream string, cfg *nats.ConsumerConfig, opts ...nats.JSOpt) (*nats.ConsumerInfo, error)
}

type ConsumerOptions struct {
	PullBatchSize int
	PullMaxWait   time.Duration
	AckWait       time.Duration
	MaxDeliver    int
	MaxAckPending int
	Concurrency   int
	ConsumerMode  string
}

func DefaultConsumerOptions() ConsumerOptions {
	return ConsumerOptions{
		PullBatchSize: 100,
		PullMaxWait:   500 * time.Millisecond,
		AckWait:       AckWait,
		MaxDeliver:    MaxDeliver,
		MaxAckPending: 1000,
		Concurrency:   4,
		ConsumerMode:  "push",
	}
}

func (options ConsumerOptions) normalized() ConsumerOptions {
	defaults := DefaultConsumerOptions()
	if options.PullBatchSize <= 0 {
		options.PullBatchSize = defaults.PullBatchSize
	}
	if options.PullMaxWait <= 0 {
		options.PullMaxWait = defaults.PullMaxWait
	}
	if options.AckWait <= 0 {
		options.AckWait = defaults.AckWait
	}
	if options.MaxDeliver <= 0 {
		options.MaxDeliver = defaults.MaxDeliver
	}
	if options.MaxAckPending <= 0 {
		options.MaxAckPending = defaults.MaxAckPending
	}
	if options.Concurrency <= 0 {
		options.Concurrency = defaults.Concurrency
	}
	if options.ConsumerMode == "" {
		options.ConsumerMode = defaults.ConsumerMode
	}
	return options
}

func EnsureJetStream(js JetStreamManager) error {
	return EnsureJetStreamWithOptions(js, DefaultConsumerOptions())
}

func EnsureJetStreamWithOptions(js JetStreamManager, options ConsumerOptions) error {
	options = options.normalized()
	stream := &nats.StreamConfig{
		Name:      StreamName,
		Subjects:  []string{TraceSubject, LogSubject, MetricSubject, AiProjectionSubject},
		Retention: nats.LimitsPolicy,
		Storage:   nats.FileStorage,
		MaxAge:    MaxAge,
	}
	if err := ensureStream(js, stream); err != nil {
		return err
	}

	consumer := &nats.ConsumerConfig{
		Durable:       ConsumerName,
		AckPolicy:     nats.AckExplicitPolicy,
		AckWait:       options.AckWait,
		MaxDeliver:    options.MaxDeliver,
		MaxAckPending: options.MaxAckPending,
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

func ensureStream(js JetStreamManager, stream *nats.StreamConfig) error {
	if _, err := js.AddStream(stream); err != nil {
		if !errors.Is(err, nats.ErrStreamNameAlreadyInUse) {
			return fmt.Errorf("%s %s: %w", bridgeErrorID, bridgeErrorCode, err)
		}
		if _, updateErr := js.UpdateStream(stream); updateErr != nil {
			return fmt.Errorf("%s %s: %w", bridgeErrorID, bridgeErrorCode, updateErr)
		}
	}
	return nil
}
