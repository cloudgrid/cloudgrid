package collector

import (
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

func TestRootSpanUsesOnlyRootWhenAvailableAndEarliestFallback(t *testing.T) {
	parent := "parent"
	start := time.Date(2026, 5, 11, 8, 0, 0, 0, time.UTC)
	root := contracts.Span{ID: "root", StartedAt: start.Add(time.Second)}
	child := contracts.Span{ID: "child", ParentSpanID: &parent, StartedAt: start}

	if got := rootSpan([]contracts.Span{child, root}); got.ID != "root" {
		t.Fatalf("rootSpan() = %q, want only root span", got.ID)
	}

	left := contracts.Span{ID: "left", StartedAt: start.Add(2 * time.Second)}
	right := contracts.Span{ID: "right", StartedAt: start}
	if got := rootSpan([]contracts.Span{left, right}); got.ID != "right" {
		t.Fatalf("rootSpan() fallback = %q, want earliest span", got.ID)
	}
}

func TestSpanKindMapsUnspecifiedToNilAndNamedKindsToLowercase(t *testing.T) {
	if got := spanKind(tracepb.Span_SPAN_KIND_UNSPECIFIED); got != nil {
		t.Fatalf("unspecified span kind = %#v, want nil", *got)
	}
	got := spanKind(tracepb.Span_SPAN_KIND_SERVER)
	if got == nil || *got != "server" {
		t.Fatalf("server span kind = %#v, want server", got)
	}
}
