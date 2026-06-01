//go:build surrealdb

package surrealdb

import (
	"context"
	"testing"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	sdk "github.com/surrealdb/surrealdb.go"
)

func TestStoreRecordsDBAdapterTraceSpanFromParentContext(t *testing.T) {
	recorder := &traceRecorder{}
	queryRowsOverride = func(_ context.Context, _ *sdk.DB, _ QueryStatement, out any) error {
		*(out.(*[]contracts.TraceSummary)) = []contracts.TraceSummary{}
		return nil
	}
	t.Cleanup(func() { queryRowsOverride = nil })

	parent := selfobs.TraceContext{TraceID: "4bf92f3577b34da6a3ce929d0e0e4736", SpanID: "00f067aa0ba902b7"}
	ctx := selfobs.ContextWithTraceContext(context.Background(), parent)
	store := Store{DB: nil}
	store.EnableDBAdapterTracing(recorder)

	_, err := store.SearchTraces(ctx, contracts.TraceSearchQuery{}, nil)
	if err != nil {
		t.Fatalf("SearchTraces returned error: %v", err)
	}
	if len(recorder.spans) != 1 {
		t.Fatalf("spans = %#v, want one adapter span", recorder.spans)
	}
	span := recorder.spans[0]
	if span.Name != "storage-read.db.trace_search" || span.ParentSpanID != parent.SpanID {
		t.Fatalf("span = %#v, want trace_search child of parent", span)
	}
	if span.Attributes["cloudgrid.db.operation"] != "trace_search" || span.Attributes["cloudgrid.db.target_kind"] != "telemetry" {
		t.Fatalf("span attributes = %#v", span.Attributes)
	}
}

func TestStoreDoesNotRecordDBAdapterTraceWhenUnsupported(t *testing.T) {
	recorder := &traceRecorder{}
	queryRowsOverride = func(_ context.Context, _ *sdk.DB, _ QueryStatement, out any) error {
		*(out.(*[]contracts.TraceSummary)) = []contracts.TraceSummary{}
		return nil
	}
	t.Cleanup(func() { queryRowsOverride = nil })

	store := Store{DB: nil}
	_, err := store.SearchTraces(context.Background(), contracts.TraceSearchQuery{}, nil)
	if err != nil {
		t.Fatalf("SearchTraces returned error: %v", err)
	}
	if len(recorder.spans) != 0 {
		t.Fatalf("spans = %#v, want none", recorder.spans)
	}
}

type traceRecorder struct {
	spans []selfobs.SpanEvent
	logs  []selfobs.LogEvent
}

func (recorder *traceRecorder) RecordSpan(event selfobs.SpanEvent) {
	recorder.spans = append(recorder.spans, event)
}

func (recorder *traceRecorder) RecordLog(event selfobs.LogEvent) {
	recorder.logs = append(recorder.logs, event)
}

func (recorder *traceRecorder) Flush(context.Context) error { return nil }

func (recorder *traceRecorder) Shutdown(context.Context) error { return nil }
