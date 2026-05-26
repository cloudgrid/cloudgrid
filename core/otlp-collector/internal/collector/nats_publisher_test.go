package collector

import (
	"context"
	"errors"
	"testing"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/nats-io/nats.go"
)

func TestJetStreamPublisherPropagatesTraceContextHeaders(t *testing.T) {
	js := &captureJetStreamPublisher{}
	publisher := NewJetStreamPublisher(js)
	ctx := selfobs.ContextWithTraceContext(context.Background(), selfobs.TraceContext{
		TraceID:    "4bf92f3577b34da6a3ce929d0e0e4736",
		SpanID:     "00f067aa0ba902b7",
		TraceState: "rojo=1",
	})

	if err := publisher.Publish(ctx, SubjectTraceIngest, []byte(`{"ok":true}`)); err != nil {
		t.Fatalf("Publish() error = %v", err)
	}

	if js.message.Header.Get("traceparent") != "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" {
		t.Fatalf("traceparent header = %q", js.message.Header.Get("traceparent"))
	}
	if js.message.Header.Get("tracestate") != "rojo=1" {
		t.Fatalf("tracestate header = %q", js.message.Header.Get("tracestate"))
	}
}

func TestCheckJetStreamSubjectsRequiresEveryIngestSubject(t *testing.T) {
	js := &captureJetStreamReadiness{
		streams: map[string]string{
			SubjectTraceIngest:        "TELEMETRY_INGEST",
			SubjectLogIngest:          "TELEMETRY_INGEST",
			SubjectMetricIngest:       "TELEMETRY_INGEST",
			SubjectAIProjectionIngest: "TELEMETRY_INGEST",
		},
	}

	if err := CheckJetStreamSubjects(context.Background(), js, ingestReadinessSubjects); err != nil {
		t.Fatalf("CheckJetStreamSubjects() error = %v", err)
	}
	if len(js.subjects) != len(ingestReadinessSubjects) {
		t.Fatalf("checked subjects = %v, want all ingest readiness subjects", js.subjects)
	}
}

func TestCheckJetStreamSubjectsFailsWhenIngestSubjectHasNoStream(t *testing.T) {
	js := &captureJetStreamReadiness{
		streams: map[string]string{
			SubjectTraceIngest: "TELEMETRY_INGEST",
		},
		err: errors.New("stream not found"),
	}

	if err := CheckJetStreamSubjects(context.Background(), js, []string{SubjectTraceIngest, SubjectLogIngest}); err == nil {
		t.Fatal("CheckJetStreamSubjects() error = nil, want unavailable ingest stream")
	}
}

type captureJetStreamPublisher struct {
	message *nats.Msg
}

func (publisher *captureJetStreamPublisher) PublishMsg(message *nats.Msg, _ ...nats.PubOpt) (*nats.PubAck, error) {
	publisher.message = message
	return &nats.PubAck{}, nil
}

type captureJetStreamReadiness struct {
	streams  map[string]string
	err      error
	subjects []string
}

func (js *captureJetStreamReadiness) StreamNameBySubject(subject string, _ ...nats.JSOpt) (string, error) {
	js.subjects = append(js.subjects, subject)
	stream, ok := js.streams[subject]
	if !ok {
		return "", js.err
	}
	return stream, nil
}
