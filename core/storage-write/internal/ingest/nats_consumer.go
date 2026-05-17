package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
	"github.com/nats-io/nats.go"
)

type PullSubscriber interface {
	PullSubscribe(subject string, durable string, opts ...nats.SubOpt) (*nats.Subscription, error)
	Publish(subject string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
}

func RegisterEvalMutationResponders(nc interface {
	Subscribe(subject string, cb nats.MsgHandler) (*nats.Subscription, error)
}, js interface {
	Publish(subject string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
}, store ports.AIWriteStore, logger *slog.Logger) error {
	publisher := natsAIEventPublisher{js: js}
	for _, subject := range []string{
		EvalDatasetCreateSubject,
		EvalDatasetItemsAppendSubject,
		EvalDatasetItemPromoteSubject,
		EvalDatasetImportPrepareSubject,
		EvalDatasetImportCommitSubject,
		EvalScorerCreateSubject,
		EvalExperimentCreateSubject,
		EvalResultsPersistSubject,
		AnnotationItemUpdateSubject,
	} {
		subject := subject
		if _, err := nc.Subscribe(subject, func(msg *nats.Msg) {
			HandleEvalMutationMessage(context.Background(), natsRequestMessage{msg: msg}, store, publisher, logger, time.Now)
		}); err != nil {
			return err
		}
	}
	return nil
}

func RunConsumer(ctx context.Context, js PullSubscriber, store ports.TelemetryWriteStore, logger *slog.Logger) error {
	sub, err := js.PullSubscribe("telemetry.ingest.*", ConsumerName, nats.BindStream(StreamName), nats.ManualAck())
	if err != nil {
		return err
	}
	publisher := natsTraceNotificationPublisher{js: js}
	aiPublisher := natsAIEventPublisher{js: js}

	for {
		if err := ctx.Err(); err != nil {
			return nil
		}

		messages, err := sub.Fetch(MaxInFlight, nats.MaxWait(time.Second))
		if err != nil {
			if errors.Is(err, nats.ErrTimeout) {
				continue
			}
			return err
		}

		for _, msg := range messages {
			wrapped := natsMessage{msg: msg}
			if msg.Subject == AiProjectionSubject {
				if aiStore, ok := store.(ports.AIWriteStore); ok {
					HandleAIProjectionMessage(ctx, wrapped, aiStore, aiPublisher, logger, time.Now)
					continue
				}
			}
			HandleMessage(ctx, wrapped, store, publisher, logger, time.Now)
		}
	}
}

type natsTraceNotificationPublisher struct {
	js interface {
		Publish(subject string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
	}
}

func (publisher natsTraceNotificationPublisher) PublishTracePersisted(_ context.Context, notification contracts.TracePersistedNotification) error {
	data, err := json.Marshal(notification)
	if err != nil {
		return err
	}
	_, err = publisher.js.Publish(PersistedTraceSubject, data)
	return err
}

type natsAIEventPublisher struct {
	js interface {
		Publish(subject string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
	}
}

func (publisher natsAIEventPublisher) PublishAIProjectionPersisted(_ context.Context, notification contracts.AiProjectionPersistedNotification) error {
	data, err := json.Marshal(notification)
	if err != nil {
		return err
	}
	_, err = publisher.js.Publish(AiProjectionPersistedSubject, data)
	return err
}

func (publisher natsAIEventPublisher) PublishExperimentProgress(_ context.Context, notification contracts.ExperimentProgressNotification) error {
	data, err := json.Marshal(notification)
	if err != nil {
		return err
	}
	_, err = publisher.js.Publish(EvalExperimentProgressSubject, data)
	return err
}

type natsMessage struct {
	msg *nats.Msg
}

func (msg natsMessage) Subject() string {
	return msg.msg.Subject
}

func (msg natsMessage) Data() []byte {
	return msg.msg.Data
}

func (msg natsMessage) Attempt() int {
	metadata, err := msg.msg.Metadata()
	if err != nil || metadata == nil {
		return 1
	}
	return int(metadata.NumDelivered)
}

func (msg natsMessage) Ack() error {
	return msg.msg.Ack()
}

func (msg natsMessage) NakWithDelay(delay time.Duration) error {
	return msg.msg.NakWithDelay(delay)
}

type natsRequestMessage struct {
	msg *nats.Msg
}

func (msg natsRequestMessage) Subject() string {
	return msg.msg.Subject
}

func (msg natsRequestMessage) Data() []byte {
	return msg.msg.Data
}

func (msg natsRequestMessage) Respond(data []byte) error {
	return msg.msg.Respond(data)
}
