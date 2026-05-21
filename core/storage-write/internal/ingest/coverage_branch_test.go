package ingest

import (
	"context"
	"errors"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/nats-io/nats.go"
)

func TestOTLPMetricsRecorderBranches(t *testing.T) {
	recorder := OTLPMetricsRecorder{}
	recorder.Increment("ignored", 1, map[string]string{"result": "ok"})
	recorder.Observe("ignored", 1, nil)

	target := &recordingSelfObsMetrics{}
	recorder = NewOTLPMetricsRecorder(target)
	recorder.Increment("cloudgrid.storage.persist.commands", 2, map[string]string{"signal": "traces"})
	recorder.Observe("cloudgrid.storage.persist.duration", 0.25, map[string]string{"signal": "traces"})

	if len(target.events) != 2 {
		t.Fatalf("recorded events = %d, want 2", len(target.events))
	}
	if target.events[0].Kind != selfobs.MetricKindCounter || target.events[0].Value != 2 {
		t.Fatalf("counter event = %#v", target.events[0])
	}
	if target.events[1].Kind != selfobs.MetricKindHistogram || target.events[1].Value != 0.25 {
		t.Fatalf("histogram event = %#v", target.events[1])
	}
}

func TestNatsAIEventPublisherBranches(t *testing.T) {
	js := &fakeNotificationJetStream{}
	publisher := natsAIEventPublisher{js: js}
	if err := publisher.PublishAIProjectionPersisted(context.Background(), contracts.AiProjectionPersistedNotification{
		RequestID:     "req-ai-1",
		TraceID:       "trace-1",
		ProjectionIDs: []string{"projection-1"},
		PersistedAt:   fixedClock(),
	}); err != nil {
		t.Fatalf("PublishAIProjectionPersisted() error = %v", err)
	}
	if js.subject != AiProjectionPersistedSubject {
		t.Fatalf("projection subject = %q, want %q", js.subject, AiProjectionPersistedSubject)
	}

	emptyPublisher := natsAIEventPublisher{}
	if err := emptyPublisher.PublishExperimentProgress(context.Background(), contracts.ExperimentProgressNotification{
		RequestID:       "req-progress-1",
		ExperimentRunID: "run-1",
		Type:            "finished",
		OccurredAt:      fixedClock(),
	}); err != nil {
		t.Fatalf("PublishExperimentProgress(nil js) error = %v", err)
	}

	js.err = errors.New("publish failed")
	if err := publisher.PublishExperimentProgress(context.Background(), contracts.ExperimentProgressNotification{
		RequestID:       "req-progress-2",
		ExperimentRunID: "run-2",
		Type:            "failed",
		OccurredAt:      fixedClock(),
	}); err == nil || err.Error() != "publish failed" {
		t.Fatalf("PublishExperimentProgress(js error) error = %v, want publish failed", err)
	}
}

func TestProcessFetchedMessagesConcurrentBranch(t *testing.T) {
	store := &fakeCombinedWriteStore{}
	publisher := &fakeTraceNotificationPublisher{}
	first := nats.NewMsg(TraceSubject)
	first.Data = mustMarshalIngestTest(t, validCommand())
	second := nats.NewMsg(LogSubject)
	second.Data = mustMarshalIngestTest(t, validLogCommand())

	processFetchedMessages(context.Background(), []*nats.Msg{first, second}, store, natsAIEventPublisher{}, publisher, testLogger(t), nil, nil, 2)

	if store.persistCalls != 2 {
		t.Fatalf("persist calls = %d, want 2", store.persistCalls)
	}
}

func TestNatsRequestMessageAccessors(t *testing.T) {
	raw := nats.NewMsg("eval.dataset.create")
	raw.Data = []byte(`{"requestId":"req-1"}`)
	msg := natsRequestMessage{msg: raw}

	if msg.Subject() != "eval.dataset.create" {
		t.Fatalf("Subject() = %q", msg.Subject())
	}
	if string(msg.Data()) != `{"requestId":"req-1"}` {
		t.Fatalf("Data() = %s", msg.Data())
	}
	if err := msg.Respond([]byte(`{"ok":true}`)); err == nil {
		t.Fatal("Respond() error = nil for message without reply subject")
	}
}

func TestHandleMetricMessageStoreBranches(t *testing.T) {
	store := &fakeStore{duplicate: true}
	msg := newFakeMetricMessage(t, validMetricCommand())
	result := handleMetricMessage(context.Background(), msg, store, testLogger(t), fixedClock, fixedClock().Add(-time.Millisecond), 1, NewInMemoryMetricsRecorder())
	if result != "success" || !msg.acked || msg.naked || store.metricPersistCalls != 0 {
		t.Fatalf("duplicate result=%q ack=%v nak=%v persist=%d", result, msg.acked, msg.naked, store.metricPersistCalls)
	}

	store = &fakeStore{duplicateErr: errors.New("down")}
	msg = newFakeMetricMessage(t, validMetricCommand())
	result = handleMetricMessage(context.Background(), msg, store, testLogger(t), fixedClock, fixedClock().Add(-time.Millisecond), 3, NewInMemoryMetricsRecorder())
	if result != "error" || msg.acked || !msg.naked || msg.nakDelay != 3*time.Second {
		t.Fatalf("duplicate error result=%q ack=%v nak=%v delay=%s", result, msg.acked, msg.naked, msg.nakDelay)
	}
}

type recordingSelfObsMetrics struct {
	events []selfobs.MetricEvent
}

func (recorder *recordingSelfObsMetrics) RecordMetric(event selfobs.MetricEvent) {
	recorder.events = append(recorder.events, event)
}

func (recorder *recordingSelfObsMetrics) Flush(context.Context) error {
	return nil
}

func (recorder *recordingSelfObsMetrics) Shutdown(context.Context) error {
	return nil
}
