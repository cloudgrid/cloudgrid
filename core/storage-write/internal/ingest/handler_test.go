package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/nats-io/nats.go"
)

func TestEnsureJetStreamDefinesTelemetryIngestStreamAndConsumer(t *testing.T) {
	js := &fakeJetStreamManager{}

	if err := EnsureJetStream(js); err != nil {
		t.Fatalf("EnsureJetStream() error = %v", err)
	}

	ingestStream := js.streams[StreamName]
	if ingestStream == nil {
		t.Fatal("ingest stream config was not added")
	}
	if ingestStream.Name != "TELEMETRY_INGEST" {
		t.Fatalf("stream name = %q", ingestStream.Name)
	}
	if strings.Join(ingestStream.Subjects, ",") != "telemetry.ingest.traces,telemetry.ingest.logs,telemetry.ingest.metrics,telemetry.ingest.ai_projections" {
		t.Fatalf("stream subjects = %#v", ingestStream.Subjects)
	}
	if ingestStream.Retention != nats.LimitsPolicy {
		t.Fatalf("stream retention = %#v", ingestStream.Retention)
	}
	if ingestStream.Storage != nats.FileStorage {
		t.Fatalf("stream storage = %#v", ingestStream.Storage)
	}
	if ingestStream.MaxAge != 7*24*time.Hour {
		t.Fatalf("stream max age = %s", ingestStream.MaxAge)
	}

	if _, ok := js.streams["TELEMETRY_PERSISTED"]; ok {
		t.Fatal("post-persist live notifications must not create a JetStream stream")
	}

	if js.consumerStream != "TELEMETRY_INGEST" || js.consumer == nil {
		t.Fatalf("consumer was not added to TELEMETRY_INGEST: stream=%q config=%#v", js.consumerStream, js.consumer)
	}
	if js.consumer.Durable != "storage-write" {
		t.Fatalf("consumer durable = %q", js.consumer.Durable)
	}
	if js.consumer.AckPolicy != nats.AckExplicitPolicy {
		t.Fatalf("consumer ack policy = %#v", js.consumer.AckPolicy)
	}
	if js.consumer.AckWait != 30*time.Second {
		t.Fatalf("consumer ack wait = %s", js.consumer.AckWait)
	}
	if js.consumer.MaxDeliver != 5 {
		t.Fatalf("consumer max deliver = %d", js.consumer.MaxDeliver)
	}
	if js.consumer.MaxAckPending != 1000 {
		t.Fatalf("consumer max ack pending = %d", js.consumer.MaxAckPending)
	}
}

func TestEnsureJetStreamUsesConfiguredConsumerOptions(t *testing.T) {
	js := &fakeJetStreamManager{}

	err := EnsureJetStreamWithOptions(js, ConsumerOptions{
		AckWait:       45 * time.Second,
		MaxDeliver:    9,
		MaxAckPending: 5000,
	})
	if err != nil {
		t.Fatalf("EnsureJetStreamWithOptions() error = %v", err)
	}

	if js.consumer.AckWait != 45*time.Second || js.consumer.MaxDeliver != 9 || js.consumer.MaxAckPending != 5000 {
		t.Fatalf("consumer = %#v, want configured ack wait/max deliver/max ack pending", js.consumer)
	}
}

func TestEnsureJetStreamUpdatesExistingStreamAndConsumer(t *testing.T) {
	js := &fakeJetStreamManager{
		addStreamErr:   nats.ErrStreamNameAlreadyInUse,
		addConsumerErr: nats.ErrConsumerNameAlreadyInUse,
	}

	if err := EnsureJetStream(js); err != nil {
		t.Fatalf("EnsureJetStream() error = %v", err)
	}

	if js.updateStreamCalls != 1 {
		t.Fatalf("UpdateStream calls = %d, want 1", js.updateStreamCalls)
	}
	if js.updateConsumerCalls != 1 {
		t.Fatalf("UpdateConsumer calls = %d, want 1", js.updateConsumerCalls)
	}
}

func TestEnsureJetStreamWrapsBridgeErrors(t *testing.T) {
	tests := []struct {
		name string
		js   *fakeJetStreamManager
	}{
		{name: "add stream", js: &fakeJetStreamManager{addStreamErr: errors.New("stream down")}},
		{name: "update stream", js: &fakeJetStreamManager{addStreamErr: nats.ErrStreamNameAlreadyInUse, updateStreamErr: errors.New("update down")}},
		{name: "add consumer", js: &fakeJetStreamManager{addConsumerErr: errors.New("consumer down")}},
		{name: "update consumer", js: &fakeJetStreamManager{addConsumerErr: nats.ErrConsumerNameAlreadyInUse, updateConsumerErr: errors.New("update down")}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := EnsureJetStream(test.js)
			if err == nil {
				t.Fatal("EnsureJetStream() error = nil")
			}
			if !strings.Contains(err.Error(), "ERR-013 MESSAGE_BRIDGE_UNAVAILABLE") {
				t.Fatalf("EnsureJetStream() error = %q, want bridge mapping", err.Error())
			}
		})
	}
}

func TestHandleMessageAcksDuplicateWithoutPersisting(t *testing.T) {
	store := &fakeStore{duplicate: true}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, validCommand())

	HandleMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.persistCalls != 0 {
		t.Fatalf("persist calls = %d, want 0", store.persistCalls)
	}
	if len(publisher.notifications) != 0 {
		t.Fatalf("notifications = %d, want 0", len(publisher.notifications))
	}
}

func TestHandleMessageAcksValidationErrorsAndLogsERR001(t *testing.T) {
	var out bytes.Buffer
	logger := loggerTo(&out)
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{store: store}
	msg := &fakeMessage{
		subject: "telemetry.ingest.traces",
		data:    []byte(`{"requestId":"req-1","commandId":"","source":"otlp-traces","traces":[],"spans":[],"logs":[]}`),
		attempt: 1,
	}

	HandleMessage(context.Background(), msg, store, publisher, logger, fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.duplicateChecks != 0 || store.persistCalls != 0 {
		t.Fatalf("store was called on invalid command: duplicate=%d persist=%d", store.duplicateChecks, store.persistCalls)
	}
	if len(publisher.notifications) != 0 {
		t.Fatalf("notifications = %d, want 0", len(publisher.notifications))
	}

	entry := decodeJSONLog(t, out.Bytes())
	if entry["error_id"] != "ERR-001" || entry["error_code"] != "VALIDATION_FAILED" {
		t.Fatalf("validation log missing ERR-001 mapping: %#v", entry)
	}
	if entry["request_id"] != "req-1" || entry["subject"] != "telemetry.ingest.traces" {
		t.Fatalf("validation log missing request/subject: %#v", entry)
	}
	if entry["operation_or_subject"] != "telemetry.ingest.traces" || entry["status"] != "error" {
		t.Fatalf("validation log missing standardized completion fields: %#v", entry)
	}
}

func TestHandleMaxDeliveryAdvisoryLogsTerminalJSONShape(t *testing.T) {
	var out bytes.Buffer
	logger := loggerTo(&out)

	HandleMaxDeliveryAdvisory([]byte(`{"stream":"TELEMETRY_INGEST","consumer":"storage-write","stream_seq":42,"consumer_seq":7}`), logger)

	entry := decodeJSONLog(t, out.Bytes())
	for _, key := range []string{"timestamp", "level", "service", "event", "request_id", "message", "operation_or_subject", "status", "duration_ms", "error_id", "error_code"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("log missing key %q: %#v", key, entry)
		}
	}
	if entry["event"] != "jetstream_max_delivery_terminal" || entry["status"] != "error" || entry["error_id"] != "ERR-013" {
		t.Fatalf("terminal advisory log = %#v", entry)
	}
	line := string(out.Bytes())
	for _, forbidden := range []string{"password", "body", "SurrealDB"} {
		if strings.Contains(line, forbidden) {
			t.Fatalf("terminal advisory log contains forbidden detail %q: %s", forbidden, line)
		}
	}
}

func TestHandleMessageNaksStorageErrorsWithCappedDelay(t *testing.T) {
	store := &fakeStore{persistErr: errors.New("ERR-006 STORAGE_UNAVAILABLE: down")}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, validCommand())
	msg.attempt = 9

	HandleMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if msg.acked || !msg.naked {
		t.Fatalf("ack=%v nak=%v, want nak only", msg.acked, msg.naked)
	}
	if msg.nakDelay != 5*time.Second {
		t.Fatalf("nak delay = %s, want capped 5s", msg.nakDelay)
	}
	if store.persistCalls != 1 {
		t.Fatalf("persist calls = %d, want 1", store.persistCalls)
	}
	if len(publisher.notifications) != 0 {
		t.Fatalf("notifications = %d, want 0", len(publisher.notifications))
	}
}

func TestHandleMessageNaksDuplicateCheckErrorsWithMinimumDelay(t *testing.T) {
	store := &fakeStore{duplicateErr: errors.New("ERR-006 STORAGE_UNAVAILABLE: down")}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, validCommand())
	msg.attempt = 0

	HandleMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if msg.acked || !msg.naked {
		t.Fatalf("ack=%v nak=%v, want nak only", msg.acked, msg.naked)
	}
	if msg.nakDelay != time.Second {
		t.Fatalf("nak delay = %s, want minimum 1s", msg.nakDelay)
	}
	if store.persistCalls != 0 {
		t.Fatalf("persist calls = %d, want 0", store.persistCalls)
	}
}

func TestHandleMessagePersistsValidCommandPublishesTraceNotificationThenAcks(t *testing.T) {
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{store: store}
	command := validCommand()
	readAllowed := true
	ingestAllowed := true
	authMode := "sso"
	principalID := "user-secret"
	tenantID := "tenant_1"
	companyID := "company_1"
	projectID := "project_1"
	command.AuthContext = &contracts.AuthContext{
		Mode:          "authenticated",
		AuthMode:      &authMode,
		PrincipalID:   &principalID,
		TenantID:      &tenantID,
		CompanyID:     &companyID,
		ProjectID:     &projectID,
		Scopes:        []string{"telemetry:ingest:traces"},
		IngestAllowed: &ingestAllowed,
		ReadAllowed:   &readAllowed,
	}
	msg := newFakeMessage(t, command)

	HandleMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.persistCalls != 1 {
		t.Fatalf("persist calls = %d, want 1", store.persistCalls)
	}
	if store.persistedSubject != "telemetry.ingest.traces" {
		t.Fatalf("persisted subject = %q", store.persistedSubject)
	}
	if store.persistedAt != fixedClock() {
		t.Fatalf("persisted at = %s", store.persistedAt)
	}
	if len(publisher.notifications) != 1 {
		t.Fatalf("notifications = %d, want 1", len(publisher.notifications))
	}
	notification := publisher.notifications[0]
	if notification.CommandID != "cmd-1" {
		t.Fatalf("notification commandId = %q", notification.CommandID)
	}
	if strings.Join(notification.TraceIDs, ",") != "trace-1" {
		t.Fatalf("notification traceIds = %#v", notification.TraceIDs)
	}
	if notification.PersistedAt != fixedClock() {
		t.Fatalf("notification persistedAt = %s", notification.PersistedAt)
	}
	if strings.Join(notification.ServiceNames, ",") != "api" {
		t.Fatalf("notification serviceNames = %#v", notification.ServiceNames)
	}
	if notification.RequestID != "req-1" || notification.IssuedAt != fixedClock() {
		t.Fatalf("notification envelope = %#v", notification.BridgeEnvelope)
	}
	if notification.AuthContext == nil || notification.AuthContext.TenantID == nil || *notification.AuthContext.TenantID != tenantID {
		t.Fatalf("notification auth context = %#v", notification.AuthContext)
	}
	if notification.AuthContext.CompanyID == nil || *notification.AuthContext.CompanyID != companyID ||
		notification.AuthContext.ProjectID == nil || *notification.AuthContext.ProjectID != projectID {
		t.Fatalf("notification routing hints = %#v", notification.AuthContext)
	}
	if notification.AuthContext.PrincipalID != nil || notification.AuthContext.Scopes != nil ||
		notification.AuthContext.IngestAllowed != nil || notification.AuthContext.ReadAllowed != nil {
		t.Fatalf("notification leaked full auth context = %#v", notification.AuthContext)
	}
	if publisher.publishCallsBeforePersist[0] != 1 {
		t.Fatalf("publish saw persist calls = %d, want 1", publisher.publishCallsBeforePersist[0])
	}
}

func TestHandleMessageAcksWhenTraceNotificationPublishFails(t *testing.T) {
	var out bytes.Buffer
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{err: errors.New("nats unavailable")}
	msg := newFakeMessage(t, validCommand())

	HandleMessage(context.Background(), msg, store, publisher, loggerTo(&out), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.persistCalls != 1 {
		t.Fatalf("persist calls = %d, want 1", store.persistCalls)
	}
	line := out.String()
	if !strings.Contains(line, `"event":"telemetry_ingest_notification_failed"`) || !strings.Contains(line, `"error_id":"ERR-013"`) {
		t.Fatalf("notification failure log missing bridge mapping: %s", line)
	}
}

func TestHandleMessageDoesNotPublishTraceNotificationForLogCommands(t *testing.T) {
	command := validLogCommand()
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, command)
	msg.subject = LogSubject

	HandleMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.persistCalls != 1 {
		t.Fatalf("persist calls = %d, want 1", store.persistCalls)
	}
	if len(publisher.notifications) != 0 {
		t.Fatalf("notifications = %d, want 0", len(publisher.notifications))
	}
}

func TestHandleMessagePersistsMetricCommandsWithoutTraceNotification(t *testing.T) {
	command := validMetricCommand()
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMetricMessage(t, command)

	HandleMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.metricDuplicateChecks != 1 || store.metricPersistCalls != 1 {
		t.Fatalf("metric store calls duplicate=%d persist=%d, want 1/1", store.metricDuplicateChecks, store.metricPersistCalls)
	}
	if store.persistedMetricSubject != MetricSubject {
		t.Fatalf("persisted metric subject = %q", store.persistedMetricSubject)
	}
	if store.duplicateChecks != 0 || store.persistCalls != 0 {
		t.Fatalf("telemetry store calls duplicate=%d persist=%d, want 0/0", store.duplicateChecks, store.persistCalls)
	}
	if len(publisher.notifications) != 0 {
		t.Fatalf("notifications = %d, want 0", len(publisher.notifications))
	}
}

func TestHandleMessageRecordsBoundedPersistMetrics(t *testing.T) {
	command := validComplexCommand()
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMessage(t, command)
	recorder := NewInMemoryMetricsRecorder()

	HandleMessageWithMetrics(context.Background(), msg, store, publisher, testLogger(t), fixedClock, recorder)

	snapshot := recorder.Snapshot()
	assertMetricEvent(t, snapshot, "cloudgrid.storage.persist.commands", map[string]string{
		"signal": "traces",
		"result": "persisted",
	})
	assertMetricEvent(t, snapshot, "cloudgrid.storage.persist.duration", map[string]string{
		"signal": "traces",
		"result": "persisted",
	})
	assertMetricEvent(t, snapshot, "cloudgrid.storage.persist.records", map[string]string{
		"record_kind": "trace",
		"result":      "persisted",
	})
	assertMetricEvent(t, snapshot, "cloudgrid.storage.persist.records", map[string]string{
		"record_kind": "span",
		"result":      "persisted",
	})
	assertMetricEvent(t, snapshot, "cloudgrid.storage.persist.records", map[string]string{
		"record_kind": "log",
		"result":      "persisted",
	})
	assertMetricLabelsDoNotContain(t, snapshot, "trace-1", "span-1", "user-secret", "project_1", "ERR-006")
}

func TestHandleMessageRecordsErrorPersistMetrics(t *testing.T) {
	store := &fakeStore{persistErr: errors.New("ERR-006 STORAGE_UNAVAILABLE: down")}
	publisher := &fakeTraceNotificationPublisher{}
	msg := newFakeMetricMessage(t, validMetricCommand())
	recorder := NewInMemoryMetricsRecorder()

	HandleMessageWithMetrics(context.Background(), msg, store, publisher, testLogger(t), fixedClock, recorder)

	snapshot := recorder.Snapshot()
	assertMetricEvent(t, snapshot, "cloudgrid.storage.persist.commands", map[string]string{
		"signal": "metrics",
		"result": "error",
	})
	assertMetricEvent(t, snapshot, "cloudgrid.storage.persist.duration", map[string]string{
		"signal": "metrics",
		"result": "error",
	})
	assertMetricLabelsDoNotContain(t, snapshot, "orders.created", "/orders", "ERR-006", "down")
}

func TestHandleMessageAcksUnknownJSONFieldsWithoutStoreCalls(t *testing.T) {
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{}
	msg := &fakeMessage{
		subject: TraceSubject,
		data:    []byte(`{"requestId":"req-1","commandId":"cmd-1","source":"otlp-traces","unknown":true,"traces":[],"spans":[],"logs":[]}`),
		attempt: 1,
	}

	HandleMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.duplicateChecks != 0 || store.persistCalls != 0 {
		t.Fatalf("store calls duplicate=%d persist=%d, want none", store.duplicateChecks, store.persistCalls)
	}
}

func TestTracePersistedNotificationDeduplicatesAndTrimsServiceNames(t *testing.T) {
	first := " api "
	duplicate := "api"
	blank := " "
	command := validCommand()
	command.Traces = []contracts.Trace{
		{ID: "trace-1", ServiceName: &first},
		{ID: "trace-2", ServiceName: &duplicate},
		{ID: "trace-3", ServiceName: &blank},
		{ID: "trace-4"},
	}

	notification := tracePersistedNotification(command, fixedClock())
	if notification == nil {
		t.Fatal("tracePersistedNotification() = nil")
	}
	if strings.Join(notification.TraceIDs, ",") != "trace-1,trace-2,trace-3,trace-4" {
		t.Fatalf("traceIDs = %#v", notification.TraceIDs)
	}
	if strings.Join(notification.ServiceNames, ",") != "api" {
		t.Fatalf("serviceNames = %#v, want deduplicated api", notification.ServiceNames)
	}
}

func TestNATSTraceNotificationPublisherPublishesVolatilePersistedTraceSubject(t *testing.T) {
	nc := &fakeNotificationNATS{}
	publisher := natsTraceNotificationPublisher{nc: nc}
	notification := contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-1",
			IssuedAt:  fixedClock(),
		},
		CommandID:   "cmd-1",
		TraceIDs:    []string{"trace-1"},
		PersistedAt: fixedClock(),
	}

	if err := publisher.PublishTracePersisted(context.Background(), notification); err != nil {
		t.Fatalf("PublishTracePersisted() error = %v", err)
	}

	if nc.subject != PersistedTraceSubject {
		t.Fatalf("subject = %q, want %q", nc.subject, PersistedTraceSubject)
	}
	var published contracts.TracePersistedNotification
	if err := json.Unmarshal(nc.data, &published); err != nil {
		t.Fatalf("published data is not notification JSON: %v", err)
	}
	if published.CommandID != "cmd-1" || strings.Join(published.TraceIDs, ",") != "trace-1" {
		t.Fatalf("published notification = %#v", published)
	}
}

func TestNATSTraceNotificationPublisherPropagatesTraceHeaders(t *testing.T) {
	nc := &fakeNotificationNATS{}
	publisher := natsTraceNotificationPublisher{nc: nc}
	ctx := selfobs.ContextWithTraceContext(context.Background(), selfobs.TraceContext{
		TraceID:    "4bf92f3577b34da6a3ce929d0e0e4736",
		SpanID:     "00f067aa0ba902b7",
		TraceState: "rojo=1",
	})

	if err := publisher.PublishTracePersisted(ctx, contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-1", IssuedAt: fixedClock()},
		CommandID:      "cmd-1",
		TraceIDs:       []string{"trace-1"},
		PersistedAt:    fixedClock(),
	}); err != nil {
		t.Fatalf("PublishTracePersisted() error = %v", err)
	}

	if nc.message.Header.Get("traceparent") != "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" {
		t.Fatalf("traceparent = %q", nc.message.Header.Get("traceparent"))
	}
	if nc.message.Header.Get("tracestate") != "rojo=1" {
		t.Fatalf("tracestate = %q", nc.message.Header.Get("tracestate"))
	}
}

func TestNATSMessageAccessorsUseRawMessageAndFallbackAttempt(t *testing.T) {
	raw := &nats.Msg{
		Subject: TraceSubject,
		Data:    []byte(`{"commandId":"cmd-1"}`),
	}
	msg := natsMessage{msg: raw}

	if msg.Subject() != TraceSubject {
		t.Fatalf("Subject() = %q, want %q", msg.Subject(), TraceSubject)
	}
	if string(msg.Data()) != `{"commandId":"cmd-1"}` {
		t.Fatalf("Data() = %s", string(msg.Data()))
	}
	if msg.Attempt() != 1 {
		t.Fatalf("Attempt() = %d, want fallback 1 without metadata", msg.Attempt())
	}
	if err := msg.Ack(); err == nil {
		t.Fatal("Ack() error = nil, want error for detached raw message")
	}
	if err := msg.NakWithDelay(time.Second); err == nil {
		t.Fatal("NakWithDelay() error = nil, want error for detached raw message")
	}
}

func TestRunConsumerReturnsSubscribeErrors(t *testing.T) {
	js := &fakePullSubscriber{subscribeErr: errors.New("subscribe failed")}

	err := RunConsumer(context.Background(), js, &fakeNotificationNATS{}, &fakeTraceNotificationPublisher{}, &fakeStore{}, testLogger(t))
	if err == nil {
		t.Fatal("RunConsumer() error = nil")
	}
	if !strings.Contains(err.Error(), "subscribe failed") {
		t.Fatalf("RunConsumer() error = %v", err)
	}
	if js.subject != "telemetry.ingest.*" || js.durable != ConsumerName {
		t.Fatalf("subscription subject=%q durable=%q", js.subject, js.durable)
	}
}

func TestRunConsumerWithSelfObservabilityProcessesFetchedTraceMessageAndStopsOnCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	js := &fakePullSubscriber{
		subscription: &fakePullSubscription{
			afterFetch: cancel,
			messages: [][]*nats.Msg{{{
				Subject: TraceSubject,
				Data:    mustMarshalIngestTest(t, validCommand()),
			}}},
		},
	}
	store := &fakeStore{}
	publisher := &fakeTraceNotificationPublisher{store: store}
	recorder := NewInMemoryTraceLogRecorder()

	err := RunConsumerWithOptions(ctx, js, &fakeNotificationNATS{}, publisher, store, testLogger(t), nil, recorder, ConsumerOptions{PullBatchSize: 3, PullMaxWait: 25 * time.Millisecond, Concurrency: 1})
	if err != nil {
		t.Fatalf("RunConsumerWithSelfObservability() error = %v", err)
	}
	if js.subscription.lastFetchBatch != 3 {
		t.Fatalf("fetch batch = %d, want configured batch size", js.subscription.lastFetchBatch)
	}

	if store.persistCalls != 1 {
		t.Fatalf("persist calls = %d, want 1", store.persistCalls)
	}
	if len(publisher.notifications) != 1 {
		t.Fatalf("trace notifications = %d, want 1", len(publisher.notifications))
	}
	snapshot := recorder.Snapshot()
	if !hasSpanEvent(snapshot.Spans, "storage-write ingest message", "traces", "success") {
		t.Fatalf("spans = %#v, want successful trace ingest span", snapshot.Spans)
	}
	if len(snapshot.Logs) != 0 {
		t.Fatalf("logs = %#v, want no failure logs for successful ingest", snapshot.Logs)
	}
}

func TestRunConsumerWithSelfObservabilityRoutesAIProjectionMessagesToAIStore(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	store := &fakeCombinedWriteStore{}
	coreNC := &fakeNotificationNATS{}
	js := &fakePullSubscriber{
		subscription: &fakePullSubscription{
			afterFetch: cancel,
			messages: [][]*nats.Msg{{{
				Subject: AiProjectionSubject,
				Data:    mustMarshalIngestTest(t, validAIProjectionCommand()),
			}}},
		},
	}

	err := RunConsumerWithSelfObservability(ctx, js, coreNC, &fakeTraceNotificationPublisher{}, store, testLogger(t), nil, NewInMemoryTraceLogRecorder())
	if err != nil {
		t.Fatalf("RunConsumerWithSelfObservability() error = %v", err)
	}

	if store.projectionExistsCalls != 1 || store.persistProjectionCalls != 1 {
		t.Fatalf("AI store calls exists=%d persist=%d, want 1/1", store.projectionExistsCalls, store.persistProjectionCalls)
	}
	if store.persistCalls != 0 || store.metricPersistCalls != 0 {
		t.Fatalf("telemetry store calls persist=%d metric=%d, want none for AI projection", store.persistCalls, store.metricPersistCalls)
	}
	if coreNC.subject != AiProjectionPersistedSubject {
		t.Fatalf("AI notification subject = %q, want %q", coreNC.subject, AiProjectionPersistedSubject)
	}
	if js.publishSubject != "" {
		t.Fatalf("JetStream publish subject = %q, want core NATS publisher to be used first", js.publishSubject)
	}
}

func TestRunConsumerWithSelfObservabilityContinuesAfterFetchTimeoutAndReturnsNonTimeoutFetchError(t *testing.T) {
	t.Run("timeout then canceled context", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		js := &fakePullSubscriber{
			subscription: &fakePullSubscription{
				errors:     []error{nats.ErrTimeout},
				afterFetch: cancel,
			},
		}

		err := RunConsumerWithSelfObservability(ctx, js, &fakeNotificationNATS{}, &fakeTraceNotificationPublisher{}, &fakeStore{}, testLogger(t), nil, nil)
		if err != nil {
			t.Fatalf("RunConsumerWithSelfObservability() error = %v", err)
		}
		if js.subscription.fetchCalls != 1 {
			t.Fatalf("fetch calls = %d, want one timeout before context cancellation", js.subscription.fetchCalls)
		}
	})

	t.Run("non-timeout fetch error", func(t *testing.T) {
		js := &fakePullSubscriber{
			subscription: &fakePullSubscription{errors: []error{errors.New("consumer unavailable")}},
		}

		err := RunConsumerWithSelfObservability(context.Background(), js, &fakeNotificationNATS{}, &fakeTraceNotificationPublisher{}, &fakeStore{}, testLogger(t), nil, nil)
		if err == nil {
			t.Fatal("RunConsumerWithSelfObservability() error = nil")
		}
		if !strings.Contains(err.Error(), "consumer unavailable") {
			t.Fatalf("RunConsumerWithSelfObservability() error = %v", err)
		}
	})
}

func TestValidateCommandRejectsInvalidTelemetryShapes(t *testing.T) {
	tests := []struct {
		name    string
		command func() contracts.PersistTelemetryCommand
		subject string
		want    string
	}{
		{
			name: "missing request id",
			command: func() contracts.PersistTelemetryCommand {
				command := validComplexCommand()
				command.RequestID = ""
				return command
			},
			subject: TraceSubject,
			want:    "requestId is required",
		},
		{
			name: "missing issued at",
			command: func() contracts.PersistTelemetryCommand {
				command := validComplexCommand()
				command.IssuedAt = time.Time{}
				return command
			},
			subject: TraceSubject,
			want:    "issuedAt is required",
		},
		{
			name: "source subject mismatch",
			command: func() contracts.PersistTelemetryCommand {
				command := validComplexCommand()
				command.Source = "otlp-logs"
				return command
			},
			subject: TraceSubject,
			want:    "source does not match subject",
		},
		{
			name: "invalid source",
			command: func() contracts.PersistTelemetryCommand {
				command := validComplexCommand()
				command.Source = "metrics"
				return command
			},
			subject: TraceSubject,
			want:    "source is invalid",
		},
		{
			name: "missing span event timestamp",
			command: func() contracts.PersistTelemetryCommand {
				command := validComplexCommand()
				command.Spans[0].Events = []contracts.SpanEvent{{Name: "event"}}
				return command
			},
			subject: TraceSubject,
			want:    "span event timestamp is required",
		},
		{
			name: "missing log body",
			command: func() contracts.PersistTelemetryCommand {
				command := validComplexCommand()
				command.Logs[0].Body = nil
				return command
			},
			subject: TraceSubject,
			want:    "log body is required",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateCommand(test.command(), test.subject)
			if err == nil {
				t.Fatal("validateCommand() error = nil")
			}
			if !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validateCommand() error = %q, want %q", err.Error(), test.want)
			}
		})
	}
}

func TestValidateCommandRejectsSSOCommandWithoutAuthorizedIngestContext(t *testing.T) {
	authMode := "sso"
	tenantID := "tenant_1"
	companyID := "company_1"
	projectID := "project_1"
	allowed := false

	tests := []struct {
		name    string
		command func() contracts.PersistTelemetryCommand
	}{
		{
			name: "missing ingest allowed",
			command: func() contracts.PersistTelemetryCommand {
				command := validCommand()
				command.AuthContext = &contracts.AuthContext{
					AuthMode:  &authMode,
					TenantID:  &tenantID,
					CompanyID: &companyID,
					ProjectID: &projectID,
				}
				return command
			},
		},
		{
			name: "explicitly denied",
			command: func() contracts.PersistTelemetryCommand {
				command := validCommand()
				command.AuthContext = &contracts.AuthContext{
					AuthMode:      &authMode,
					TenantID:      &tenantID,
					CompanyID:     &companyID,
					ProjectID:     &projectID,
					IngestAllowed: &allowed,
				}
				return command
			},
		},
		{
			name: "missing project routing",
			command: func() contracts.PersistTelemetryCommand {
				ingestAllowed := true
				command := validCommand()
				command.AuthContext = &contracts.AuthContext{
					AuthMode:      &authMode,
					TenantID:      &tenantID,
					CompanyID:     &companyID,
					IngestAllowed: &ingestAllowed,
				}
				return command
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateCommand(test.command(), TraceSubject)
			if err == nil {
				t.Fatal("validateCommand() error = nil")
			}
			if !strings.Contains(err.Error(), "authorized ingest authContext is required") {
				t.Fatalf("validateCommand() error = %q, want authorized auth context failure", err.Error())
			}
		})
	}
}

func TestValidateMetricsCommandRejectsSSOCommandWithoutAuthorizedIngestContext(t *testing.T) {
	authMode := "sso"
	tenantID := "tenant_1"
	companyID := "company_1"
	projectID := "project_1"
	command := validMetricCommand()
	command.AuthContext = &contracts.AuthContext{
		AuthMode:  &authMode,
		TenantID:  &tenantID,
		CompanyID: &companyID,
		ProjectID: &projectID,
	}

	err := validateMetricsCommand(command, MetricSubject)
	if err == nil {
		t.Fatal("validateMetricsCommand() error = nil")
	}
	if !strings.Contains(err.Error(), "authorized ingest authContext is required") {
		t.Fatalf("validateMetricsCommand() error = %q, want authorized auth context failure", err.Error())
	}
}

type fakeJetStreamManager struct {
	streams             map[string]*nats.StreamConfig
	consumerStream      string
	consumer            *nats.ConsumerConfig
	addStreamErr        error
	updateStreamErr     error
	addConsumerErr      error
	updateConsumerErr   error
	updateStreamCalls   int
	updateConsumerCalls int
}

func (js *fakeJetStreamManager) AddStream(cfg *nats.StreamConfig, _ ...nats.JSOpt) (*nats.StreamInfo, error) {
	if js.streams == nil {
		js.streams = map[string]*nats.StreamConfig{}
	}
	js.streams[cfg.Name] = cfg
	if js.addStreamErr != nil {
		return nil, js.addStreamErr
	}
	return &nats.StreamInfo{Config: *cfg}, nil
}

func (js *fakeJetStreamManager) UpdateStream(cfg *nats.StreamConfig, _ ...nats.JSOpt) (*nats.StreamInfo, error) {
	js.updateStreamCalls++
	if js.streams == nil {
		js.streams = map[string]*nats.StreamConfig{}
	}
	js.streams[cfg.Name] = cfg
	if js.updateStreamErr != nil {
		return nil, js.updateStreamErr
	}
	return &nats.StreamInfo{Config: *cfg}, nil
}

func (js *fakeJetStreamManager) AddConsumer(stream string, cfg *nats.ConsumerConfig, _ ...nats.JSOpt) (*nats.ConsumerInfo, error) {
	js.consumerStream = stream
	js.consumer = cfg
	if js.addConsumerErr != nil {
		return nil, js.addConsumerErr
	}
	return &nats.ConsumerInfo{Config: *cfg}, nil
}

func (js *fakeJetStreamManager) UpdateConsumer(stream string, cfg *nats.ConsumerConfig, _ ...nats.JSOpt) (*nats.ConsumerInfo, error) {
	js.updateConsumerCalls++
	js.consumerStream = stream
	js.consumer = cfg
	if js.updateConsumerErr != nil {
		return nil, js.updateConsumerErr
	}
	return &nats.ConsumerInfo{Config: *cfg}, nil
}

type fakeStore struct {
	duplicate        bool
	duplicateErr     error
	persistErr       error
	duplicateChecks  int
	persistCalls     int
	persistedSubject string
	persistedAt      time.Time

	metricDuplicateChecks  int
	metricPersistCalls     int
	persistedMetricSubject string
}

func (store *fakeStore) CommandExists(_ context.Context, command contracts.PersistTelemetryCommand) (bool, error) {
	store.duplicateChecks++
	if store.duplicateErr != nil {
		return false, store.duplicateErr
	}
	return store.duplicate && command.CommandID == "cmd-1", nil
}

func (store *fakeStore) Persist(_ context.Context, _ contracts.PersistTelemetryCommand, subject string, completedAt time.Time) error {
	store.persistCalls++
	store.persistedSubject = subject
	store.persistedAt = completedAt
	return store.persistErr
}

func (store *fakeStore) MetricsCommandExists(_ context.Context, command contracts.PersistMetricsCommand) (bool, error) {
	store.metricDuplicateChecks++
	if store.duplicateErr != nil {
		return false, store.duplicateErr
	}
	return store.duplicate && command.CommandID == "cmd-metrics-1", nil
}

func (store *fakeStore) PersistMetrics(_ context.Context, _ contracts.PersistMetricsCommand, subject string, completedAt time.Time) error {
	store.metricPersistCalls++
	store.persistedMetricSubject = subject
	store.persistedAt = completedAt
	return store.persistErr
}

type fakeMessage struct {
	subject  string
	data     []byte
	attempt  int
	headers  map[string]string
	acked    bool
	naked    bool
	nakDelay time.Duration
}

func newFakeMessage(t *testing.T, command contracts.PersistTelemetryCommand) *fakeMessage {
	t.Helper()
	data, err := json.Marshal(command)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return &fakeMessage{
		subject: "telemetry.ingest.traces",
		data:    data,
		attempt: 1,
	}
}

func newFakeMetricMessage(t *testing.T, command contracts.PersistMetricsCommand) *fakeMessage {
	t.Helper()
	data, err := json.Marshal(command)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return &fakeMessage{
		subject: MetricSubject,
		data:    data,
		attempt: 1,
	}
}

func (msg *fakeMessage) Subject() string {
	return msg.subject
}

func (msg *fakeMessage) Data() []byte {
	return msg.data
}

func (msg *fakeMessage) Attempt() int {
	return msg.attempt
}

func (msg *fakeMessage) Header(name string) string {
	return msg.headers[name]
}

func (msg *fakeMessage) Ack() error {
	msg.acked = true
	return nil
}

func (msg *fakeMessage) NakWithDelay(delay time.Duration) error {
	msg.naked = true
	msg.nakDelay = delay
	return nil
}

func validCommand() contracts.PersistTelemetryCommand {
	serviceName := "api"
	return contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-1",
			IssuedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
		},
		CommandID: "cmd-1",
		Source:    "otlp-traces",
		Traces: []contracts.Trace{{
			ID:          "trace-1",
			ServiceName: &serviceName,
			StartedAt:   time.Date(2026, 5, 8, 8, 0, 1, 0, time.UTC),
			Attributes:  contracts.Attributes{},
		}},
		Spans: []contracts.Span{},
		Logs:  []contracts.LogEvent{},
	}
}

func validLogCommand() contracts.PersistTelemetryCommand {
	body := "hello"
	return contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-log-1",
			IssuedAt:  time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC),
		},
		CommandID: "cmd-log-1",
		Source:    "otlp-logs",
		Traces:    []contracts.Trace{},
		Spans:     []contracts.Span{},
		Logs: []contracts.LogEvent{{
			ID:        "log-1",
			Body:      body,
			Timestamp: time.Date(2026, 5, 8, 8, 0, 1, 0, time.UTC),
		}},
	}
}

func validMetricCommand() contracts.PersistMetricsCommand {
	return contracts.PersistMetricsCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-metrics-1",
			IssuedAt:  fixedClock(),
		},
		CommandID: "cmd-metrics-1",
		Source:    "otlp-metrics",
		Descriptors: []contracts.MetricDescriptor{{
			ID:          "orders-created",
			Name:        "orders.created",
			Kind:        contracts.MetricKindSum,
			Unit:        "1",
			FirstSeenAt: fixedClock(),
			LastSeenAt:  fixedClock(),
		}},
		Points: []contracts.MetricPoint{{
			ID:         "orders-created-point",
			MetricName: "orders.created",
			Kind:       contracts.MetricKindSum,
			Timestamp:  fixedClock(),
			Value:      floatPtr(7),
			Attributes: contracts.Attributes{"route": "/orders"},
			Exemplars:  []contracts.MetricExemplar{},
		}},
	}
}

func floatPtr(value float64) *float64 {
	return &value
}

func assertMetricEvent(t *testing.T, events []MetricEvent, name string, labels map[string]string) {
	t.Helper()
	for _, event := range events {
		if event.Name != name {
			continue
		}
		matches := true
		for key, value := range labels {
			if event.Labels[key] != value {
				matches = false
				break
			}
		}
		if matches {
			return
		}
	}
	t.Fatalf("metric %s with labels %#v not found in %#v", name, labels, events)
}

func assertMetricLabelsDoNotContain(t *testing.T, events []MetricEvent, forbidden ...string) {
	t.Helper()
	for _, event := range events {
		for key, value := range event.Labels {
			for _, blocked := range forbidden {
				if strings.Contains(key, blocked) || strings.Contains(value, blocked) {
					t.Fatalf("metric label leaked %q in event %#v", blocked, event)
				}
			}
		}
	}
}

func validComplexCommand() contracts.PersistTelemetryCommand {
	command := validCommand()
	command.Spans = []contracts.Span{{
		ID:        "span-1",
		TraceID:   "trace-1",
		Name:      "GET /",
		StartedAt: fixedClock(),
		EndedAt:   fixedClock().Add(time.Millisecond),
	}}
	command.Logs = []contracts.LogEvent{{
		ID:        "log-1",
		Body:      "hello",
		Timestamp: fixedClock(),
	}}
	return command
}

type fakeTraceNotificationPublisher struct {
	notifications             []contracts.TracePersistedNotification
	publishCallsBeforePersist []int
	store                     *fakeStore
	err                       error
}

func (publisher *fakeTraceNotificationPublisher) PublishTracePersisted(_ context.Context, notification contracts.TracePersistedNotification) error {
	publisher.notifications = append(publisher.notifications, notification)
	if publisher.store != nil {
		publisher.publishCallsBeforePersist = append(publisher.publishCallsBeforePersist, publisher.store.persistCalls)
	}
	return publisher.err
}

type fakeNotificationNATS struct {
	subject string
	data    []byte
	message *nats.Msg
	err     error
}

func (nc *fakeNotificationNATS) Publish(subject string, data []byte) error {
	nc.subject = subject
	nc.data = append([]byte(nil), data...)
	return nc.err
}

func (nc *fakeNotificationNATS) PublishMsg(message *nats.Msg) error {
	nc.subject = message.Subject
	nc.data = append([]byte(nil), message.Data...)
	nc.message = message
	return nc.err
}

type fakeNotificationJetStream struct {
	subject string
	data    []byte
	err     error
}

func (js *fakeNotificationJetStream) Publish(subject string, data []byte, _ ...nats.PubOpt) (*nats.PubAck, error) {
	js.subject = subject
	js.data = append([]byte(nil), data...)
	return &nats.PubAck{}, js.err
}

type fakePullSubscriber struct {
	subject        string
	durable        string
	subscribeErr   error
	subscription   *fakePullSubscription
	publishSubject string
	publishData    []byte
}

func (js *fakePullSubscriber) PullSubscribe(subject string, durable string, _ ...nats.SubOpt) (PullSubscription, error) {
	js.subject = subject
	js.durable = durable
	if js.subscribeErr != nil {
		return nil, js.subscribeErr
	}
	if js.subscription == nil {
		js.subscription = &fakePullSubscription{}
	}
	return js.subscription, nil
}

func (js *fakePullSubscriber) Publish(subject string, data []byte, _ ...nats.PubOpt) (*nats.PubAck, error) {
	js.publishSubject = subject
	js.publishData = append([]byte(nil), data...)
	return &nats.PubAck{}, nil
}

type fakePullSubscription struct {
	messages       [][]*nats.Msg
	errors         []error
	afterFetch     func()
	fetchCalls     int
	lastFetchBatch int
}

func (sub *fakePullSubscription) Fetch(batch int, _ ...nats.PullOpt) ([]*nats.Msg, error) {
	sub.fetchCalls++
	sub.lastFetchBatch = batch
	defer func() {
		if sub.afterFetch != nil {
			sub.afterFetch()
		}
	}()
	if len(sub.errors) > 0 {
		err := sub.errors[0]
		sub.errors = sub.errors[1:]
		return nil, err
	}
	if len(sub.messages) == 0 {
		return nil, nats.ErrTimeout
	}
	messages := sub.messages[0]
	sub.messages = sub.messages[1:]
	return messages, nil
}

type fakeCombinedWriteStore struct {
	fakeStore
	fakeAIWriteStore
}

func fixedClock() time.Time {
	return time.Date(2026, 5, 8, 8, 0, 2, 0, time.UTC)
}

func testLogger(t *testing.T) *slog.Logger {
	t.Helper()
	return loggerTo(&bytes.Buffer{})
}

func loggerTo(out *bytes.Buffer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			switch attr.Key {
			case slog.TimeKey:
				attr.Key = "timestamp"
			case slog.MessageKey:
				attr.Key = "message"
			case slog.LevelKey:
				attr.Value = slog.StringValue(strings.ToLower(attr.Value.String()))
			}
			return attr
		},
	}))
}

func decodeJSONLog(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("log entry is not JSON: %v\n%s", err, string(data))
	}
	return entry
}

func mustMarshalIngestTest(t *testing.T, value any) []byte {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return data
}
