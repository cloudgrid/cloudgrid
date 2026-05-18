package collector

import (
	"context"
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

type captureJetStreamPublisher struct {
	message *nats.Msg
}

func (publisher *captureJetStreamPublisher) PublishMsg(message *nats.Msg, _ ...nats.PubOpt) (*nats.PubAck, error) {
	publisher.message = message
	return &nats.PubAck{}, nil
}
