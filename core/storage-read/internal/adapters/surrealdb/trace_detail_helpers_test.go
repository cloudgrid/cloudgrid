//go:build surrealdb

package surrealdb

import (
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestParseStackFramesExtractsFunctionLocationAndLanguage(t *testing.T) {
	stacktrace := "at checkout.handler (/srv/app/checkout.ts:12:34)\nworker.process /srv/app/worker.js:56\nmain.main /srv/app/main.go:7\nmodule.call /srv/app/tool.py:9\nplain frame"

	frames := parseStackFrames(&stacktrace)

	if len(frames) != 5 {
		t.Fatalf("frames = %#v, want 5 parsed non-empty frames", frames)
	}
	assertFrame(t, frames[0], "checkout.handler", "/srv/app/checkout.ts", 12, 34, "typescript")
	assertFrame(t, frames[1], "worker.process", "/srv/app/worker.js", 56, 0, "javascript")
	assertFrame(t, frames[2], "main.main", "/srv/app/main.go", 7, 0, "go")
	assertFrame(t, frames[3], "module.call", "/srv/app/tool.py", 9, 0, "python")
	if frames[4].FunctionName == nil || *frames[4].FunctionName != "plain" {
		t.Fatalf("plain frame = %#v, want first token as function", frames[4])
	}
	if frames[4].FileName != nil || frames[4].Language != nil {
		t.Fatalf("plain frame = %#v, want no location or language", frames[4])
	}
}

func TestParseStackFramesHandlesBlankUnknownAndNilStacktrace(t *testing.T) {
	if frames := parseStackFrames(nil); len(frames) != 0 {
		t.Fatalf("nil stack frames = %#v, want empty", frames)
	}

	stacktrace := "\n  at task (/tmp/file.unknown:3) \n\n"
	frames := parseStackFrames(&stacktrace)
	if len(frames) != 1 {
		t.Fatalf("frames = %#v, want one non-empty frame", frames)
	}
	assertFrame(t, frames[0], "task", "/tmp/file.unknown", 3, 0, "")
}

func TestSpanMatchesQuerySearchesSpanEventsLinksAndExceptions(t *testing.T) {
	service := "checkout"
	stacktrace := "worker.ts:4"
	exceptionType := "TimeoutError"
	exceptionMessage := "payment provider timeout"
	span := contracts.Span{
		ID:          "span-1",
		Name:        "POST /orders",
		ServiceName: &service,
		Attributes:  contracts.Attributes{"http.route": "/orders"},
		Events: []contracts.SpanEvent{{
			Name:       "retry",
			Attributes: contracts.Attributes{"retry.reason": "gateway timeout"},
		}},
		Links: []contracts.SpanLink{{TraceID: "linked-trace", SpanID: "linked-span", Attributes: contracts.Attributes{}}},
		Exceptions: []contracts.SpanException{{
			Type:       &exceptionType,
			Message:    &exceptionMessage,
			Stacktrace: &stacktrace,
			Attributes: contracts.Attributes{},
		}},
	}

	fields := []string{}
	if !spanMatchesQuery(span, contracts.TraceDetailQuery{SpanQuery: ptrString("timeout")}, &fields) {
		t.Fatal("spanMatchesQuery returned false for matching event/exception text")
	}
	assertStringSlice(t, uniqueStrings(fields), []string{"events.attributes.retry.reason", "exceptions"})

	fields = []string{}
	if !spanMatchesQuery(span, contracts.TraceDetailQuery{SpanQuery: ptrString("linked-trace")}, &fields) {
		t.Fatal("spanMatchesQuery returned false for matching linked trace")
	}
	assertStringSlice(t, fields, []string{"links"})
}

func TestSpanMatchesFiltersRequiresAllFiltersAndRecordsFields(t *testing.T) {
	status := contracts.TraceStatusError
	service := "db"
	minDuration := 20.0
	maxDuration := 50.0
	span := contracts.Span{
		ID:          "span-1",
		Name:        "SELECT carts",
		ServiceName: &service,
		Status:      &status,
		DurationMs:  35,
		Attributes:  contracts.Attributes{"db.system": "postgres", "attempt": 2},
	}
	query := contracts.TraceDetailQuery{
		SpanService:       &service,
		SpanName:          ptrString("SELECT carts"),
		SpanStatus:        &status,
		MinSpanDurationMs: &minDuration,
		MaxSpanDurationMs: &maxDuration,
		Attributes: []contracts.AttributeFilter{
			{Key: "db.system", Operator: contracts.AttributeFilterOperatorContains, Value: "post"},
			{Key: "attempt", Operator: contracts.AttributeFilterOperatorEQ, Value: 2},
		},
	}

	fields := []string{}
	if !spanMatchesFilters(span, query, &fields) {
		t.Fatal("spanMatchesFilters returned false for span matching all filters")
	}
	assertStringSlice(t, uniqueStrings(fields), []string{"attributes.attempt", "attributes.db.system", "durationMs", "name", "serviceName", "status"})

	query.MaxSpanDurationMs = ptrFloat64(30)
	fields = []string{}
	if spanMatchesFilters(span, query, &fields) {
		t.Fatal("spanMatchesFilters returned true when max duration filter should fail")
	}
}

func TestAttributeMatchesCoversSupportedDetailOperators(t *testing.T) {
	attrs := contracts.Attributes{"env": "prod", "message": "Gateway Timeout", "attempt": 2}

	tests := []struct {
		name   string
		filter contracts.AttributeFilter
		want   bool
	}{
		{"exists true", contracts.AttributeFilter{Key: "env", Operator: contracts.AttributeFilterOperatorExists}, true},
		{"exists false", contracts.AttributeFilter{Key: "missing", Operator: contracts.AttributeFilterOperatorExists}, false},
		{"eq compares stringified values", contracts.AttributeFilter{Key: "attempt", Operator: contracts.AttributeFilterOperatorEQ, Value: "2"}, true},
		{"neq true for missing key", contracts.AttributeFilter{Key: "missing", Operator: contracts.AttributeFilterOperatorNEQ, Value: "prod"}, true},
		{"neq false for same value", contracts.AttributeFilter{Key: "env", Operator: contracts.AttributeFilterOperatorNEQ, Value: "prod"}, false},
		{"contains case insensitive", contracts.AttributeFilter{Key: "message", Operator: contracts.AttributeFilterOperatorContains, Value: "timeout"}, true},
		{"unsupported false", contracts.AttributeFilter{Key: "attempt", Operator: contracts.AttributeFilterOperatorGT, Value: 1}, false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := attributeMatches(attrs, test.filter); got != test.want {
				t.Fatalf("attributeMatches() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestSpanMatchesDefaultsToErrorsAndCriticalPathWithoutExplicitCriteria(t *testing.T) {
	status := contracts.TraceStatusError
	spans := []contracts.Span{
		{ID: "ok", Attributes: contracts.Attributes{}},
		{ID: "error", Status: &status, HasError: true, Attributes: contracts.Attributes{}},
		{ID: "critical", IsCriticalPath: true, Attributes: contracts.Attributes{}},
	}

	matches := spanMatches(spans, nil, map[string]bool{"critical": true})

	if len(matches) != 2 {
		t.Fatalf("matches = %#v, want error and critical defaults", matches)
	}
	if matches[0].SpanID != "error" || matches[0].Reason != "error" {
		t.Fatalf("first match = %#v, want error reason", matches[0])
	}
	if matches[1].SpanID != "critical" || matches[1].Reason != "criticalPath" {
		t.Fatalf("second match = %#v, want critical path reason", matches[1])
	}
}

func TestRelatedLogsRanksSelectedSpanThenSpanTraceAndContext(t *testing.T) {
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	traceID := "trace-1"
	selectedSpanID := "selected"
	otherSpanID := "other"
	logs := []contracts.LogEvent{
		{ID: "context", Body: "checkout timeout", Timestamp: base.Add(4 * time.Millisecond), Attributes: contracts.Attributes{}},
		{ID: "trace", TraceID: &traceID, Body: "checkout timeout", Timestamp: base.Add(3 * time.Millisecond), Attributes: contracts.Attributes{}},
		{ID: "other-span", TraceID: &traceID, SpanID: &otherSpanID, Body: "checkout timeout", Timestamp: base.Add(2 * time.Millisecond), Attributes: contracts.Attributes{}},
		{ID: "selected-late", TraceID: &traceID, SpanID: &selectedSpanID, Body: "checkout timeout", Timestamp: base.Add(5 * time.Millisecond), Attributes: contracts.Attributes{}},
		{ID: "selected-early", TraceID: &traceID, SpanID: &selectedSpanID, Body: "checkout timeout", Timestamp: base.Add(time.Millisecond), Attributes: contracts.Attributes{}},
	}
	query := contracts.TraceDetailQuery{SelectedSpanID: &selectedSpanID, LogSearch: ptrString("timeout")}

	got := relatedLogs(logs, &query, nil)

	if len(got) != 2 {
		t.Fatalf("related logs = %#v, want only selected span logs", got)
	}
	assertLogIDs(t, got, []string{"selected-early", "selected-late"})

	query.SelectedSpanID = nil
	limit := 3
	query.RelatedLogLimit = &limit
	got = relatedLogs(logs, &query, map[string]bool{otherSpanID: true})
	assertLogIDs(t, got, []string{"other-span", "trace", "context"})
}

func TestRelatedLogsSearchesAttributesAndUsesDefaultLimitForInvalidLimit(t *testing.T) {
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	logs := make([]contracts.LogEvent, 0, defaultRelatedLogLimit+2)
	for index := 0; index < defaultRelatedLogLimit+2; index++ {
		logs = append(logs, contracts.LogEvent{
			ID:         string(rune('a'+index%26)) + string(rune('a'+index/26)),
			Body:       "not a body match",
			Timestamp:  base.Add(time.Duration(index) * time.Millisecond),
			Attributes: contracts.Attributes{"error.kind": "Timeout"},
		})
	}
	invalidLimit := maxPageLimit + 1
	query := contracts.TraceDetailQuery{RelatedLogLimit: &invalidLimit, LogSearch: ptrString("error.kind")}

	got := relatedLogs(logs, &query, nil)

	if len(got) != defaultRelatedLogLimit {
		t.Fatalf("related log count = %d, want default limit %d", len(got), defaultRelatedLogLimit)
	}
}

func TestSmallTraceDetailScalarHelpers(t *testing.T) {
	if stringValue(nil) != "" {
		t.Fatal("stringValue(nil) should return empty string")
	}
	if optionalString(nil) != nil {
		t.Fatal("optionalString(nil) should return nil")
	}
	if optionalBool("true") != nil {
		t.Fatal("optionalBool(non-bool) should return nil")
	}
	if !stringPointerContains(ptrString("Gateway Timeout"), "timeout") {
		t.Fatal("stringPointerContains should match case-insensitively")
	}
	if stringPointerContains(nil, "timeout") {
		t.Fatal("stringPointerContains(nil) should return false")
	}
	assertStringSlice(t, uniqueStrings([]string{"b", "a", "b"}), []string{"a", "b"})
}

func assertFrame(t *testing.T, frame contracts.StackTraceFrame, functionName string, fileName string, lineNumber int, columnNumber int, language string) {
	t.Helper()
	if frame.FunctionName == nil || *frame.FunctionName != functionName {
		t.Fatalf("frame = %#v, want function %q", frame, functionName)
	}
	if frame.FileName == nil || *frame.FileName != fileName {
		t.Fatalf("frame = %#v, want file %q", frame, fileName)
	}
	if frame.LineNumber == nil || *frame.LineNumber != lineNumber {
		t.Fatalf("frame = %#v, want line %d", frame, lineNumber)
	}
	if columnNumber == 0 {
		if frame.ColumnNumber != nil {
			t.Fatalf("frame = %#v, want no column", frame)
		}
	} else if frame.ColumnNumber == nil || *frame.ColumnNumber != columnNumber {
		t.Fatalf("frame = %#v, want column %d", frame, columnNumber)
	}
	if language == "" {
		if frame.Language != nil {
			t.Fatalf("frame = %#v, want no language", frame)
		}
		return
	}
	if frame.Language == nil || *frame.Language != language {
		t.Fatalf("frame = %#v, want language %q", frame, language)
	}
}

func assertLogIDs(t *testing.T, got []contracts.LogEvent, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("log IDs = %#v, want %#v", logIDs(got), want)
	}
	for index := range want {
		if got[index].ID != want[index] {
			t.Fatalf("log IDs = %#v, want %#v", logIDs(got), want)
		}
	}
}

func logIDs(logs []contracts.LogEvent) []string {
	ids := make([]string, 0, len(logs))
	for _, log := range logs {
		ids = append(ids, log.ID)
	}
	return ids
}
