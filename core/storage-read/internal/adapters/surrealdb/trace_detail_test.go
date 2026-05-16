//go:build surrealdb

package surrealdb

import (
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestBuildTraceDetailDataDerivesStructureAndSelectedSpan(t *testing.T) {
	statusError := contracts.TraceStatusError
	serviceAPI := "api"
	serviceDB := "db"
	root := "root"
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)

	trace := contracts.Trace{
		ID:         "trace-1",
		StartedAt:  base,
		DurationMs: ptrFloat64(100),
		RootSpanID: &root,
		Attributes: contracts.Attributes{},
	}
	spans := []contracts.Span{
		{ID: root, TraceID: trace.ID, Name: "GET /checkout", ServiceName: &serviceAPI, StartedAt: base, EndedAt: base.Add(100 * time.Millisecond), DurationMs: 100, Attributes: contracts.Attributes{}},
		{ID: "child-fast", TraceID: trace.ID, ParentSpanID: &root, Name: "cache lookup", ServiceName: &serviceAPI, StartedAt: base.Add(10 * time.Millisecond), EndedAt: base.Add(30 * time.Millisecond), DurationMs: 20, Attributes: contracts.Attributes{}},
		{ID: "child-slow", TraceID: trace.ID, ParentSpanID: &root, Name: "SELECT orders", ServiceName: &serviceDB, StartedAt: base.Add(35 * time.Millisecond), EndedAt: base.Add(95 * time.Millisecond), DurationMs: 60, Status: &statusError, Attributes: contracts.Attributes{}, Events: []contracts.SpanEvent{{
			Name:      "exception",
			Timestamp: base.Add(40 * time.Millisecond),
			Attributes: contracts.Attributes{
				"exception.type":       "db.Timeout",
				"exception.message":    "query timed out",
				"exception.stacktrace": "db.go:12",
			},
		}}},
		{ID: "orphan", TraceID: trace.ID, ParentSpanID: ptrString("missing-parent"), Name: "orphan work", ServiceName: &serviceAPI, StartedAt: base.Add(5 * time.Millisecond), EndedAt: base.Add(15 * time.Millisecond), DurationMs: 10, Attributes: contracts.Attributes{}},
	}
	logs := []contracts.LogEvent{
		{ID: "log-selected", TraceID: &trace.ID, SpanID: ptrString("child-slow"), ServiceName: &serviceDB, Body: "database timeout", Timestamp: base.Add(41 * time.Millisecond), Attributes: contracts.Attributes{}},
		{ID: "log-trace", TraceID: &trace.ID, ServiceName: &serviceAPI, Body: "checkout failed", Timestamp: base.Add(42 * time.Millisecond), Attributes: contracts.Attributes{}},
	}
	query := contracts.TraceDetailQuery{SelectedSpanID: ptrString("child-slow")}

	data := buildTraceDetailData(trace, spans, logs, &query)

	if data.SelectedSpan == nil || data.SelectedSpan.ID != "child-slow" {
		t.Fatalf("selected span = %#v, want child-slow", data.SelectedSpan)
	}
	if data.Structure.MaxDepth != 1 {
		t.Fatalf("max depth = %d, want 1", data.Structure.MaxDepth)
	}
	assertStringSlice(t, data.Structure.RootSpanIDs, []string{root})
	assertStringSlice(t, data.Structure.OrphanSpanIDs, []string{"orphan"})
	assertStringSlice(t, data.Structure.CriticalPathSpanIDs, []string{root, "child-slow"})

	byID := spansByID(data.Spans)
	if byID[root].ChildCount != 2 || byID["child-slow"].Depth != 1 || !byID["child-slow"].HasError || !byID["child-slow"].IsCriticalPath {
		t.Fatalf("derived spans = %#v", data.Spans)
	}
	if !byID["child-slow"].IsServiceEntry || !byID["orphan"].IsOrphan {
		t.Fatalf("service entry/orphan fields not derived: %#v", data.Spans)
	}
	if byID["child-slow"].ExceptionCount != 1 || len(byID["child-slow"].Exceptions) != 1 {
		t.Fatalf("exceptions = %#v, want one derived exception", byID["child-slow"].Exceptions)
	}
	if len(byID["child-slow"].Exceptions[0].Frames) != 1 || byID["child-slow"].Exceptions[0].Frames[0].FileName == nil || *byID["child-slow"].Exceptions[0].Frames[0].FileName != "db.go" {
		t.Fatalf("exception frames = %#v, want parsed db.go frame", byID["child-slow"].Exceptions[0].Frames)
	}
	if len(data.RelatedLogs) == 0 || data.RelatedLogs[0].ID != "log-selected" {
		t.Fatalf("related logs = %#v, want selected span log first", data.RelatedLogs)
	}
	if len(data.Warnings) == 0 || data.Warnings[0].Code != "missingParent" {
		t.Fatalf("warnings = %#v, want missingParent", data.Warnings)
	}
}

func TestBuildTraceDetailDataFiltersSpanMatchesAndRelatedLogs(t *testing.T) {
	serviceAPI := "api"
	serviceDB := "db"
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	trace := contracts.Trace{ID: "trace-2", StartedAt: base, Attributes: contracts.Attributes{}}
	spans := []contracts.Span{
		{ID: "api", TraceID: trace.ID, Name: "GET /checkout", ServiceName: &serviceAPI, StartedAt: base, EndedAt: base.Add(20 * time.Millisecond), DurationMs: 20, Attributes: contracts.Attributes{"http.route": "/checkout"}},
		{ID: "db", TraceID: trace.ID, ParentSpanID: ptrString("api"), Name: "SELECT users", ServiceName: &serviceDB, StartedAt: base.Add(5 * time.Millisecond), EndedAt: base.Add(15 * time.Millisecond), DurationMs: 10, Attributes: contracts.Attributes{"db.system": "postgres"}},
	}
	logs := []contracts.LogEvent{
		{ID: "api-log", TraceID: &trace.ID, SpanID: ptrString("api"), ServiceName: &serviceAPI, Body: "checkout ok", Timestamp: base.Add(6 * time.Millisecond), Attributes: contracts.Attributes{}},
		{ID: "db-log", TraceID: &trace.ID, SpanID: ptrString("db"), ServiceName: &serviceDB, Body: "postgres slow", Timestamp: base.Add(7 * time.Millisecond), Attributes: contracts.Attributes{}},
	}
	showMatchesOnly := true
	limit := 1
	query := contracts.TraceDetailQuery{
		SpanService:     &serviceDB,
		SpanQuery:       ptrString("select"),
		ShowMatchesOnly: &showMatchesOnly,
		RelatedLogLimit: &limit,
		LogSearch:       ptrString("postgres"),
	}

	data := buildTraceDetailData(trace, spans, logs, &query)

	if len(data.Spans) != 1 || data.Spans[0].ID != "db" {
		t.Fatalf("filtered spans = %#v, want only db span", data.Spans)
	}
	if len(data.SpanMatches) != 1 || data.SpanMatches[0].SpanID != "db" {
		t.Fatalf("span matches = %#v, want db match", data.SpanMatches)
	}
	if len(data.RelatedLogs) != 1 || data.RelatedLogs[0].ID != "db-log" {
		t.Fatalf("related logs = %#v, want limited filtered db log", data.RelatedLogs)
	}
}

func TestBuildTraceDetailDataRequiresAllSpanFilters(t *testing.T) {
	serviceAPI := "api"
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	trace := contracts.Trace{ID: "trace-3", StartedAt: base, Attributes: contracts.Attributes{}}
	spans := []contracts.Span{
		{ID: "api", TraceID: trace.ID, Name: "GET /checkout", ServiceName: &serviceAPI, StartedAt: base, EndedAt: base.Add(20 * time.Millisecond), DurationMs: 20, Attributes: contracts.Attributes{}},
	}
	showMatchesOnly := true
	minDuration := 50.0
	query := contracts.TraceDetailQuery{
		SpanService:       &serviceAPI,
		MinSpanDurationMs: &minDuration,
		ShowMatchesOnly:   &showMatchesOnly,
	}

	data := buildTraceDetailData(trace, spans, nil, &query)

	if len(data.SpanMatches) != 0 {
		t.Fatalf("span matches = %#v, want none because duration filter fails", data.SpanMatches)
	}
	if len(data.Spans) != 0 {
		t.Fatalf("visible spans = %#v, want none because showMatchesOnly is true", data.Spans)
	}
}

func spansByID(spans []contracts.Span) map[string]contracts.Span {
	byID := map[string]contracts.Span{}
	for _, span := range spans {
		byID[span.ID] = span
	}
	return byID
}

func assertStringSlice(t *testing.T, got []string, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("slice = %#v, want %#v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("slice = %#v, want %#v", got, want)
		}
	}
}

func ptrString(value string) *string {
	return &value
}

func ptrFloat64(value float64) *float64 {
	return &value
}
