package selfobs

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDBAdapterTracingCreatesChildSpanWithBoundedAttributes(t *testing.T) {
	recorder := &dbAdapterRecorder{}
	parent := TraceContext{TraceID: "4bf92f3577b34da6a3ce929d0e0e4736", SpanID: "00f067aa0ba902b7", TraceState: "rojo=1"}
	ctx := ContextWithTraceContext(context.Background(), parent)

	end := StartDBAdapterSpan(ctx, recorder, DBAdapterSpanConfig{
		Enabled:       true,
		SpanName:      "storage-read.db.trace_search",
		Adapter:       "surrealdb",
		Operation:     "trace_search",
		TargetKind:    "telemetry",
		StatementKind: "select",
		Attributes: map[string]string{
			"raw_query":  "SELECT * FROM user WHERE token = $token",
			"db.system":  "surrealdb",
			"project_id": "project-secret",
		},
		Now: func() time.Time { return time.Unix(10, 0).UTC() },
	})
	end(errors.New("ERR-006 STORAGE_UNAVAILABLE: password=secret SELECT token"))

	if len(recorder.spans) != 1 {
		t.Fatalf("recorded spans = %d, want 1", len(recorder.spans))
	}
	span := recorder.spans[0]
	if span.TraceID != parent.TraceID || span.ParentSpanID != parent.SpanID || span.SpanID == "" || span.SpanID == parent.SpanID {
		t.Fatalf("span trace context = %#v, parent = %#v", span, parent)
	}
	if span.Name != "storage-read.db.trace_search" || span.Result != "error" {
		t.Fatalf("span name/result = %q/%q", span.Name, span.Result)
	}
	if span.Attributes["cloudgrid.db.adapter"] != "surrealdb" ||
		span.Attributes["cloudgrid.db.operation"] != "trace_search" ||
		span.Attributes["cloudgrid.db.target_kind"] != "telemetry" ||
		span.Attributes["cloudgrid.db.statement_kind"] != "select" ||
		span.Attributes["cloudgrid.db.result"] != "error" ||
		span.Attributes["cloudgrid.error_id"] != "ERR-006" ||
		span.Attributes["cloudgrid.error_code"] != "STORAGE_UNAVAILABLE" ||
		span.Attributes["db.system"] != "surrealdb" {
		t.Fatalf("span attributes = %#v", span.Attributes)
	}
	for forbidden := range map[string]struct{}{"raw_query": {}, "project_id": {}} {
		if _, ok := span.Attributes[forbidden]; ok {
			t.Fatalf("forbidden attribute %q was exported: %#v", forbidden, span.Attributes)
		}
	}
}

func TestDBAdapterTracingNoopsWhenDisabledOrUnsupported(t *testing.T) {
	recorder := &dbAdapterRecorder{}
	StartDBAdapterSpan(context.Background(), recorder, DBAdapterSpanConfig{SpanName: "storage-read.db.trace_search"})(nil)
	StartDBAdapterSpan(context.Background(), nil, DBAdapterSpanConfig{Enabled: true, SpanName: "storage-read.db.trace_search"})(nil)
	if len(recorder.spans) != 0 {
		t.Fatalf("recorded spans = %#v, want none", recorder.spans)
	}
}

type dbAdapterRecorder struct {
	spans []SpanEvent
	logs  []LogEvent
}

func (recorder *dbAdapterRecorder) RecordSpan(event SpanEvent) {
	recorder.spans = append(recorder.spans, event)
}

func (recorder *dbAdapterRecorder) RecordLog(event LogEvent) {
	recorder.logs = append(recorder.logs, event)
}

func (recorder *dbAdapterRecorder) Flush(context.Context) error { return nil }

func (recorder *dbAdapterRecorder) Shutdown(context.Context) error { return nil }
