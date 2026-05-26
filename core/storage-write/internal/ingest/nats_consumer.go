package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
	"github.com/nats-io/nats.go"
)

type PullSubscriber interface {
	PullSubscribe(subject string, durable string, opts ...nats.SubOpt) (PullSubscription, error)
}

type PullSubscriberJetStream interface {
	PullSubscriber
	Publish(subject string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
}

type PullSubscription interface {
	Fetch(batch int, opts ...nats.PullOpt) ([]*nats.Msg, error)
}

type CorePublisher interface {
	Publish(subject string, data []byte) error
}

func RegisterEvalMutationResponders(nc interface {
	Subscribe(subject string, cb nats.MsgHandler) (*nats.Subscription, error)
	Publish(subject string, data []byte) error
}, js interface {
	Publish(subject string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
}, store ports.AIWriteStore, logger *slog.Logger) error {
	publisher := natsAIEventPublisher{nc: nc, js: js}
	for _, subject := range []string{
		EvalDatasetCreateSubject,
		EvalDatasetItemsAppendSubject,
		EvalDatasetSettingsUpdateSubject,
		EvalDatasetItemPromoteSubject,
		EvalDatasetItemUpdateSubject,
		EvalDatasetCandidatesPrepareSubject,
		EvalDatasetCandidatesCommitSubject,
		EvalDatasetImportPrepareSubject,
		EvalDatasetImportCommitSubject,
		EvalEvaluationCreateSubject,
		EvalEvaluationUpdateSubject,
		EvalEvaluationComparisonCreateSubject,
		EvalResultsPersistSubject,
		EvalTargetSnapshotCreateSubject,
		EvalTargetPromoteSubject,
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

func RunConsumer(ctx context.Context, js PullSubscriberJetStream, nc CorePublisher, notificationPublisher ports.TraceNotificationPublisher, store ports.TelemetryWriteStore, logger *slog.Logger) error {
	return RunConsumerWithMetrics(ctx, js, nc, notificationPublisher, store, logger, nil)
}

func RunConsumerWithMetrics(ctx context.Context, js PullSubscriberJetStream, nc CorePublisher, notificationPublisher ports.TraceNotificationPublisher, store ports.TelemetryWriteStore, logger *slog.Logger, recorder MetricsRecorder) error {
	return RunConsumerWithSelfObservability(ctx, js, nc, notificationPublisher, store, logger, recorder, nil)
}

func RunConsumerWithSelfObservability(ctx context.Context, js PullSubscriberJetStream, nc CorePublisher, notificationPublisher ports.TraceNotificationPublisher, store ports.TelemetryWriteStore, logger *slog.Logger, recorder MetricsRecorder, traceLogRecorder TraceLogRecorder) error {
	return RunConsumerWithOptions(ctx, js, nc, notificationPublisher, store, logger, recorder, traceLogRecorder, DefaultConsumerOptions())
}

func RunConsumerWithOptions(ctx context.Context, js PullSubscriberJetStream, nc CorePublisher, notificationPublisher ports.TraceNotificationPublisher, store ports.TelemetryWriteStore, logger *slog.Logger, recorder MetricsRecorder, traceLogRecorder TraceLogRecorder, options ConsumerOptions) error {
	options = options.normalized()
	sub, err := js.PullSubscribe("telemetry.ingest.*", ConsumerName, nats.BindStream(StreamName), nats.ManualAck())
	if err != nil {
		return err
	}
	aiPublisher := natsAIEventPublisher{nc: nc, js: js}

	for {
		if err := ctx.Err(); err != nil {
			return nil
		}

		messages, err := sub.Fetch(options.PullBatchSize, nats.MaxWait(options.PullMaxWait))
		if err != nil {
			if errors.Is(err, nats.ErrTimeout) {
				continue
			}
			if isRetryableFetchError(err) {
				wait := options.PullMaxWait
				if wait <= 0 {
					wait = 250 * time.Millisecond
				}
				select {
				case <-time.After(wait):
					continue
				case <-ctx.Done():
					return nil
				}
			}
			return err
		}

		processFetchedMessages(ctx, messages, store, aiPublisher, notificationPublisher, logger, recorder, traceLogRecorder, options.Concurrency)
	}
}

func isRetryableFetchError(err error) bool {
	return errors.Is(err, nats.ErrFetchDisconnected) ||
		errors.Is(err, nats.ErrDisconnected) ||
		errors.Is(err, nats.ErrConnectionClosed) ||
		errors.Is(err, nats.ErrNoResponders) ||
		errors.Is(err, context.DeadlineExceeded)
}

func processFetchedMessages(ctx context.Context, messages []*nats.Msg, store ports.TelemetryWriteStore, aiPublisher natsAIEventPublisher, notificationPublisher ports.TraceNotificationPublisher, logger *slog.Logger, recorder MetricsRecorder, traceLogRecorder TraceLogRecorder, concurrency int) {
	if concurrency <= 1 || len(messages) <= 1 {
		for _, msg := range messages {
			processFetchedMessage(ctx, msg, store, aiPublisher, notificationPublisher, logger, recorder, traceLogRecorder)
		}
		return
	}
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	for _, msg := range messages {
		msg := msg
		sem <- struct{}{}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			processFetchedMessage(ctx, msg, store, aiPublisher, notificationPublisher, logger, recorder, traceLogRecorder)
		}()
	}
	wg.Wait()
}

func processFetchedMessage(ctx context.Context, msg *nats.Msg, store ports.TelemetryWriteStore, aiPublisher natsAIEventPublisher, notificationPublisher ports.TraceNotificationPublisher, logger *slog.Logger, recorder MetricsRecorder, traceLogRecorder TraceLogRecorder) {
	wrapped := natsMessage{msg: msg}
	if msg.Subject == AiProjectionSubject {
		if aiStore, ok := store.(ports.AIWriteStore); ok {
			HandleAIProjectionMessage(ctx, wrapped, aiStore, aiPublisher, logger, time.Now)
			return
		}
	}
	HandleMessageWithSelfObservability(ctx, wrapped, store, notificationPublisher, logger, time.Now, recorder, traceLogRecorder)
}

type natsTraceNotificationPublisher struct {
	nc interface {
		Publish(subject string, data []byte) error
	}
}

func NewTraceNotificationPublisher(nc interface {
	Publish(subject string, data []byte) error
}) ports.TraceNotificationPublisher {
	return natsTraceNotificationPublisher{nc: nc}
}

func (publisher natsTraceNotificationPublisher) PublishTracePersisted(ctx context.Context, notification contracts.TracePersistedNotification) error {
	data, err := json.Marshal(notification)
	if err != nil {
		return err
	}
	if msgPublisher, ok := publisher.nc.(interface {
		PublishMsg(message *nats.Msg) error
	}); ok {
		message := &nats.Msg{Subject: PersistedTraceSubject, Data: data}
		if traceContext, ok := selfobs.TraceContextFromContext(ctx); ok {
			message.Header = nats.Header{}
			message.Header.Set(selfobs.TraceParentHeader, selfobs.FormatTraceParent(traceContext))
			if traceContext.TraceState != "" {
				message.Header.Set(selfobs.TraceStateHeader, traceContext.TraceState)
			}
		}
		return msgPublisher.PublishMsg(message)
	}
	return publisher.nc.Publish(PersistedTraceSubject, data)
}

type natsAIEventPublisher struct {
	nc interface {
		Publish(subject string, data []byte) error
	}
	js interface {
		Publish(subject string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
	}
}

func (publisher natsAIEventPublisher) PublishAIProjectionPersisted(_ context.Context, notification contracts.AiProjectionPersistedNotification) error {
	data, err := json.Marshal(notification)
	if err != nil {
		return err
	}
	if publisher.nc != nil {
		return publisher.nc.Publish(AiProjectionPersistedSubject, data)
	}
	_, err = publisher.js.Publish(AiProjectionPersistedSubject, data)
	return err
}

func (publisher natsAIEventPublisher) PublishExperimentProgress(_ context.Context, notification contracts.ExperimentProgressNotification) error {
	data, err := json.Marshal(notification)
	if err != nil {
		return err
	}
	if publisher.nc != nil {
		return publisher.nc.Publish(EvalExperimentProgressSubject, data)
	}
	if publisher.js == nil {
		return nil
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

func (msg natsMessage) Header(name string) string {
	return msg.msg.Header.Get(name)
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
