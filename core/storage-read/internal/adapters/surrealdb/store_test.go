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

	if _, err := store.SearchTraces(ctx, contracts.TraceSearchQuery{}); !isStorageUnavailable(err) {
		t.Fatalf("SearchTraces error = %v, want storage unavailable", err)
	}
	if _, err := store.SearchLiveTraceCandidates(ctx, contracts.LiveTraceQuery{}, []string{traceID}); !isStorageUnavailable(err) {
		t.Fatalf("SearchLiveTraceCandidates error = %v, want storage unavailable", err)
	}
	if _, err := store.GetTraceDetail(ctx, traceID, nil); !isStorageUnavailable(err) {
		t.Fatalf("GetTraceDetail error = %v, want storage unavailable", err)
	}
	if _, err := store.SearchLogs(ctx, contracts.LogSearchQuery{From: &now}); !isStorageUnavailable(err) {
		t.Fatalf("SearchLogs error = %v, want storage unavailable", err)
	}
	if _, err := store.GetTelemetryFacets(ctx, contracts.TelemetryFacetQuery{}); !isStorageUnavailable(err) {
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

	if _, err := store.SearchLiveTraceCandidates(ctx, contracts.LiveTraceQuery{}, []string{" "}); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("SearchLiveTraceCandidates error = %v, want validation error", err)
	}
	if _, err := store.GetTraceDetail(ctx, " ", nil); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("GetTraceDetail error = %v, want validation error", err)
	}

	badLimit := 501
	if _, err := store.SearchTraces(ctx, contracts.TraceSearchQuery{Limit: &badLimit}); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("SearchTraces error = %v, want validation error", err)
	}
	if _, err := store.SearchLogs(ctx, contracts.LogSearchQuery{Limit: &badLimit}); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
		t.Fatalf("SearchLogs error = %v, want validation error", err)
	}
	if _, err := store.GetTelemetryFacets(ctx, contracts.TelemetryFacetQuery{Limit: &badLimit}); err == nil || !strings.Contains(err.Error(), "VALIDATION_FAILED") {
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
