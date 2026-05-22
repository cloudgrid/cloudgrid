//go:build surrealdb

package surrealdb

import (
	"context"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestStoreMethodsMapNilDatabaseFailuresToStorageError(t *testing.T) {
	ctx := context.Background()
	store := Store{}
	now := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	traceID := "trace-1"

	if _, err := store.SearchTraces(ctx, contracts.TraceSearchQuery{}, nil); !isStorageUnavailable(err) {
		t.Fatalf("SearchTraces error = %v, want storage unavailable", err)
	}
	if _, err := store.SearchLiveTraceCandidates(ctx, contracts.LiveTraceQuery{}, []string{traceID}, nil); !isStorageUnavailable(err) {
		t.Fatalf("SearchLiveTraceCandidates error = %v, want storage unavailable", err)
	}
	if _, err := store.GetTraceDetail(ctx, traceID, nil, nil); !isStorageUnavailable(err) {
		t.Fatalf("GetTraceDetail error = %v, want storage unavailable", err)
	}
	if _, err := store.SearchLogs(ctx, contracts.LogSearchQuery{From: &now}, nil); !isStorageUnavailable(err) {
		t.Fatalf("SearchLogs error = %v, want storage unavailable", err)
	}
	if _, err := store.GetTelemetryFacets(ctx, contracts.TelemetryFacetQuery{}, nil); !isStorageUnavailable(err) {
		t.Fatalf("GetTelemetryFacets error = %v, want storage unavailable", err)
	}
	if _, err := store.GetProjectTelemetryOverviews(ctx, contracts.ProjectTelemetryOverviewRequest{
		Projects: []contracts.ProjectTelemetryOverviewTarget{{CompanyID: "local", ProjectID: "default"}},
	}); !isStorageUnavailable(err) {
		t.Fatalf("GetProjectTelemetryOverviews error = %v, want storage unavailable", err)
	}
}

func TestStoreMethodsReturnValidationErrorsBeforeDatabaseAccess(t *testing.T) {
	ctx := context.Background()
	store := Store{}

	if _, err := store.SearchLiveTraceCandidates(ctx, contracts.LiveTraceQuery{}, []string{" "}, nil); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("SearchLiveTraceCandidates error = %v, want validation error", err)
	}
	if _, err := store.GetTraceDetail(ctx, " ", nil, nil); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("GetTraceDetail error = %v, want validation error", err)
	}

	badLimit := 501
	if _, err := store.SearchTraces(ctx, contracts.TraceSearchQuery{Limit: &badLimit}, nil); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("SearchTraces error = %v, want validation error", err)
	}
	if _, err := store.SearchLogs(ctx, contracts.LogSearchQuery{Limit: &badLimit}, nil); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("SearchLogs error = %v, want validation error", err)
	}
	if _, err := store.GetTelemetryFacets(ctx, contracts.TelemetryFacetQuery{Limit: &badLimit}, nil); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("GetTelemetryFacets error = %v, want validation error", err)
	}
	if _, err := store.GetProjectTelemetryOverviews(ctx, contracts.ProjectTelemetryOverviewRequest{
		Projects: []contracts.ProjectTelemetryOverviewTarget{{CompanyID: "bad company", ProjectID: "default"}},
	}); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("GetProjectTelemetryOverviews error = %v, want validation error", err)
	}
}

func TestFacetValuesFromAttributeKeyRowsCountsSortsFiltersAndLimits(t *testing.T) {
	search := "http"
	values := facetValuesFromAttributeKeyRows(
		[][]string{
			{"http.route", "service.name", "http.method"},
			{"http.route", "db.system"},
			{"http.method", "http.route"},
		},
		&search,
		2,
	)

	want := []contracts.FacetValue{
		{Value: "http.route", Count: 3},
		{Value: "http.method", Count: 2},
	}
	if len(values) != len(want) {
		t.Fatalf("values = %#v, want %#v", values, want)
	}
	for i := range want {
		if values[i] != want[i] {
			t.Fatalf("values[%d] = %#v, want %#v", i, values[i], want[i])
		}
	}
}

func TestTraceAndLogPagesReturnServerCursors(t *testing.T) {
	startedAt := time.Date(2026, 5, 21, 8, 0, 0, 0, time.UTC)
	traces, traceCursor := tracePage([]contracts.TraceSummary{
		{Trace: contracts.Trace{ID: "trace-1", StartedAt: startedAt}},
		{Trace: contracts.Trace{ID: "trace-2", StartedAt: startedAt.Add(-time.Second)}},
		{Trace: contracts.Trace{ID: "trace-3", StartedAt: startedAt.Add(-2 * time.Second)}},
	}, 2, nil)
	if len(traces) != 2 || traceCursor == nil {
		t.Fatalf("trace page = %d cursor=%v, want two items and cursor", len(traces), traceCursor)
	}
	decodedTrace, err := decodeCursor(*traceCursor, "startedAt_desc_traceId_asc")
	if err != nil {
		t.Fatalf("decode trace cursor: %v", err)
	}
	traceCursorValue, ok := decodedTrace.LastValue.(time.Time)
	if !ok || decodedTrace.LastID != "trace-2" || !traceCursorValue.Equal(startedAt.Add(-time.Second)) {
		t.Fatalf("trace cursor = %#v", decodedTrace)
	}

	logs, logCursor := logPage([]contracts.LogEvent{
		{ID: "log-1", Timestamp: startedAt},
		{ID: "log-2", Timestamp: startedAt.Add(-time.Second)},
	}, 1, nil)
	if len(logs) != 1 || logCursor == nil {
		t.Fatalf("log page = %d cursor=%v, want one item and cursor", len(logs), logCursor)
	}
	decodedLog, err := decodeCursor(*logCursor, "timestamp_desc_logEventId_asc")
	if err != nil {
		t.Fatalf("decode log cursor: %v", err)
	}
	logCursorValue, ok := decodedLog.LastValue.(time.Time)
	if !ok || decodedLog.LastID != "log-1" || !logCursorValue.Equal(startedAt) {
		t.Fatalf("log cursor = %#v", decodedLog)
	}
}

func TestSetLogCorrelationsInitializesAttributesAndPrefersSpanCorrelation(t *testing.T) {
	traceID := "trace-1"
	spanID := "span-1"
	logs := []contracts.LogEvent{
		{ID: "none"},
		{ID: "trace", TraceID: &traceID},
		{ID: "span", TraceID: &traceID, SpanID: &spanID},
	}

	setLogCorrelations(logs)

	if logs[0].Attributes == nil || logs[1].Attributes == nil || logs[2].Attributes == nil {
		t.Fatalf("setLogCorrelations did not initialize attributes: %#v", logs)
	}
	if *logs[0].Correlation != contracts.LogCorrelationNone {
		t.Fatalf("none correlation = %s", *logs[0].Correlation)
	}
	if *logs[1].Correlation != contracts.LogCorrelationTrace {
		t.Fatalf("trace correlation = %s", *logs[1].Correlation)
	}
	if *logs[2].Correlation != contracts.LogCorrelationSpan {
		t.Fatalf("span correlation = %s", *logs[2].Correlation)
	}
}

func TestNormalizeSpansInitializesNestedCollectionsAndLinkDefaults(t *testing.T) {
	spans := []contracts.Span{
		{
			ID:     "span-1",
			Events: []contracts.SpanEvent{{Name: "event"}},
			Links:  []contracts.SpanLink{{TraceID: "linked", SpanID: "linked-span"}},
		},
	}

	normalizeSpans(spans)

	if spans[0].Attributes == nil {
		t.Fatal("normalizeSpans did not initialize span attributes")
	}
	if spans[0].Events == nil || spans[0].Events[0].Attributes == nil {
		t.Fatalf("normalizeSpans did not initialize event attributes: %#v", spans[0].Events)
	}
	if spans[0].Links == nil || spans[0].Links[0].Attributes == nil {
		t.Fatalf("normalizeSpans did not initialize link attributes: %#v", spans[0].Links)
	}
	if spans[0].Links[0].Direction == nil || *spans[0].Links[0].Direction != contracts.SpanLinkDirectionUnknown {
		t.Fatalf("link direction = %#v, want unknown", spans[0].Links[0].Direction)
	}
}

func TestNormalizeTraceSummariesBackfillsLegacyUnixNanoAndAttributes(t *testing.T) {
	startedAt := time.Date(2026, 5, 19, 12, 15, 21, 123456789, time.UTC)
	items := []contracts.TraceSummary{{
		Trace: contracts.Trace{
			ID:        "trace-1",
			StartedAt: startedAt,
		},
	}}

	normalizeTraceSummaries(items)

	if items[0].StartedAtUnixNano != "1779192921123456789" {
		t.Fatalf("StartedAtUnixNano = %q", items[0].StartedAtUnixNano)
	}
	if items[0].Attributes == nil {
		t.Fatal("normalizeTraceSummaries did not initialize attributes")
	}
}

func TestNormalizeTraceSummariesPreservesStoredUnixNano(t *testing.T) {
	items := []contracts.TraceSummary{{
		Trace: contracts.Trace{
			ID:                "trace-1",
			StartedAt:         time.Date(2026, 5, 19, 12, 15, 21, 0, time.UTC),
			StartedAtUnixNano: "42",
			Attributes:        contracts.Attributes{"service.name": "api"},
		},
	}}

	normalizeTraceSummaries(items)

	if items[0].StartedAtUnixNano != "42" {
		t.Fatalf("StartedAtUnixNano = %q, want stored value", items[0].StartedAtUnixNano)
	}
	if items[0].Attributes["service.name"] != "api" {
		t.Fatalf("attributes = %#v, want preserved", items[0].Attributes)
	}
}

func TestQueryRowsRequiresConfiguredDatabase(t *testing.T) {
	_, err := queryRows[contracts.TraceSummary](context.Background(), nil, QueryStatement{SQL: "SELECT * FROM trace;", Params: map[string]any{}})
	if err == nil || !strings.Contains(err.Error(), "storage database is not configured") {
		t.Fatalf("queryRows error = %v, want missing database error", err)
	}
}

func TestStorageErrorUsesCanonicalCloudGridError(t *testing.T) {
	if !isStorageUnavailable(storageError()) {
		t.Fatalf("storageError() = %v, want canonical storage unavailable", storageError())
	}
}

func isStorageUnavailable(err error) bool {
	return err != nil && strings.Contains(err.Error(), "ERR-006 STORAGE_UNAVAILABLE")
}
