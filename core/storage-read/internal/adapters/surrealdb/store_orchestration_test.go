//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
	sdk "github.com/surrealdb/surrealdb.go"
)

func TestStoreOrchestrationSuccessPathsUseQueryRows(t *testing.T) {
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	service := "api"
	traceID := "trace-1"
	queryRowsOverride = func(_ context.Context, _ *sdk.DB, stmt QueryStatement, out any) error {
		switch rows := out.(type) {
		case *[]contracts.TraceSummary:
			*rows = []contracts.TraceSummary{
				{Trace: contracts.Trace{ID: "trace-1", StartedAt: base}},
				{Trace: contracts.Trace{ID: "trace-2", StartedAt: base.Add(-time.Second)}},
			}
		case *[]contracts.Trace:
			*rows = []contracts.Trace{{ID: traceID, ServiceName: &service, StartedAt: base, Attributes: contracts.Attributes{}}}
		case *[]contracts.Span:
			*rows = []contracts.Span{{ID: "span-1", TraceID: traceID, Name: "GET /", ServiceName: &service, StartedAt: base, EndedAt: base.Add(time.Millisecond)}}
		case *[]contracts.LogEvent:
			*rows = []contracts.LogEvent{{ID: "log-1", TraceID: &traceID, SpanID: ptrString("span-1"), Body: "ok", Timestamp: base}}
		case *[]contracts.FacetValue:
			*rows = []contracts.FacetValue{{Value: "api", Count: 1}}
		case *[][]string:
			*rows = [][]string{{"service.name", "http.route"}}
		case *[]contracts.MetricDescriptor:
			*rows = []contracts.MetricDescriptor{{Name: "http.requests", Kind: contracts.MetricKindSum, LastSeenAt: base, AttributeKeys: []string{"service"}}}
		case *[]metricBucketRow:
			*rows = []metricBucketRow{{Bucket: base, Group0: "api", Value: 2.0, Count: 1.0, Exemplars: []contracts.MetricExemplar{{Timestamp: base, Value: 2}}}}
		case *[]countRow:
			*rows = []countRow{{Count: 3}}
		case *[]lastIngestRow:
			*rows = []lastIngestRow{{LastIngestAt: &base}}
		default:
			return fmt.Errorf("unexpected query output %T for %s", out, stmt.SQL)
		}
		return nil
	}
	t.Cleanup(func() { queryRowsOverride = nil })

	store := Store{}
	limit := 1
	traces, err := store.SearchTraces(context.Background(), contracts.TraceSearchQuery{Limit: &limit}, nil)
	if err != nil {
		t.Fatalf("SearchTraces() error = %v", err)
	}
	if len(traces.Items) != 1 || traces.NextCursor == nil {
		t.Fatalf("trace data = %#v, want paged result", traces)
	}

	candidates, err := store.SearchLiveTraceCandidates(context.Background(), contracts.LiveTraceQuery{}, []string{traceID}, nil)
	if err != nil || len(candidates) != 2 {
		t.Fatalf("SearchLiveTraceCandidates() = %#v, %v", candidates, err)
	}

	detail, err := store.GetTraceDetail(context.Background(), traceID, &contracts.TraceDetailQuery{}, nil)
	if err != nil {
		t.Fatalf("GetTraceDetail() error = %v", err)
	}
	if detail.Trace.ID != traceID || len(detail.Spans) != 1 || len(detail.Logs) != 1 {
		t.Fatalf("detail = %#v", detail)
	}

	logs, err := store.SearchLogs(context.Background(), contracts.LogSearchQuery{Limit: &limit}, nil)
	if err != nil || len(logs.Items) != 1 {
		t.Fatalf("SearchLogs() = %#v, %v", logs, err)
	}

	facets, err := store.GetTelemetryFacets(context.Background(), contracts.TelemetryFacetQuery{Limit: &limit}, nil)
	if err != nil {
		t.Fatalf("GetTelemetryFacets() error = %v", err)
	}
	if len(facets.Services) != 1 || len(facets.AttributeKeys) != 1 {
		t.Fatalf("facets = %#v", facets)
	}

	names, err := store.SearchMetricNames(context.Background(), contracts.MetricNameSearchInput{Limit: &limit}, nil)
	if err != nil || len(names.Items) != 1 {
		t.Fatalf("SearchMetricNames() = %#v, %v", names, err)
	}

	series, err := store.QueryMetricSeries(context.Background(), contracts.MetricSeriesInput{
		MetricName:  "http.requests",
		From:        base.Add(-time.Hour),
		To:          base,
		Aggregation: contracts.MetricAggregationSum,
		GroupBy:     []string{"service"},
	}, nil)
	if err != nil {
		t.Fatalf("QueryMetricSeries() error = %v", err)
	}
	if len(series.Series) != 1 || len(series.Series[0].Points) != 1 {
		t.Fatalf("series = %#v", series)
	}

	overview, err := store.GetProjectTelemetryOverviews(context.Background(), contracts.ProjectTelemetryOverviewRequest{
		Projects: []contracts.ProjectTelemetryOverviewTarget{{CompanyID: "local", ProjectID: "default"}},
	})
	if err != nil {
		t.Fatalf("GetProjectTelemetryOverviews() error = %v", err)
	}
	if len(overview.Items) != 1 || overview.Items[0].Telemetry.TraceCount != 3 || overview.Items[0].Telemetry.LastIngestAt == nil {
		t.Fatalf("overview = %#v", overview)
	}
}

func TestStoreOrchestrationMapsQueryFailures(t *testing.T) {
	queryRowsOverride = func(context.Context, *sdk.DB, QueryStatement, any) error {
		return fmt.Errorf("surreal down")
	}
	t.Cleanup(func() { queryRowsOverride = nil })

	store := Store{}
	_, err := store.SearchTraces(context.Background(), contracts.TraceSearchQuery{}, nil)
	if err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("SearchTraces() error = %v, want storage mapping", err)
	}

	_, err = store.QueryAiEval(context.Background(), storage.SubjectEvalDatasetSearch, map[string]any{}, nil)
	if err == nil || !strings.Contains(err.Error(), "ERR-006") {
		t.Fatalf("QueryAiEval() error = %v, want storage mapping", err)
	}
}

func TestStoreAiEvalReadOrchestrationSuccessPaths(t *testing.T) {
	t.Setenv("CLOUDGRID_DATASET_TRANSFER_DIR", t.TempDir())
	base := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	queryRowsOverride = func(_ context.Context, _ *sdk.DB, stmt QueryStatement, out any) error {
		rows, ok := out.(*[]map[string]any)
		if !ok {
			return fmt.Errorf("unexpected output %T", out)
		}
		switch {
		case strings.Contains(stmt.SQL, "FROM ai_dataset_item_revision") && strings.Contains(stmt.SQL, "GROUP BY datasetId"):
			*rows = []map[string]any{{"datasetId": "dataset-1", "itemCount": 2, "reviewedItemCount": 1}}
		case strings.Contains(stmt.SQL, "FROM ai_dataset_item_revision") && strings.Contains(stmt.SQL, "ORDER BY id ASC"):
			*rows = []map[string]any{{"id": "item-1", "input": map[string]any{"q": "?"}, "expected": map[string]any{"a": "!"}}}
		case strings.Contains(stmt.SQL, "FROM ai_dataset_item_revision") && strings.Contains(stmt.SQL, "GROUP ALL"):
			*rows = []map[string]any{{"totalItemCount": 2, "reviewedItemCount": 1, "missingExpectedCount": 1}}
		case strings.Contains(stmt.SQL, "GROUP BY split"):
			*rows = []map[string]any{{"split": "validation", "count": 1}}
		case strings.Contains(stmt.SQL, "duplicateOfItemId"):
			*rows = []map[string]any{{"id": "item-dup"}}
		case strings.Contains(stmt.SQL, "FROM ai_agent_run") && strings.Contains(stmt.SQL, "GROUP BY"):
			*rows = []map[string]any{{"agentName": "api", "runCount": 1, "scoredRunCount": 1}}
		case strings.Contains(stmt.SQL, "GROUP ALL"):
			*rows = []map[string]any{{"runCount": 1, "meanLatencyMs": 12.5}}
		default:
			*rows = []map[string]any{{"id": "dataset-1", "name": "Golden", "createdAt": base.Format(time.RFC3339), "version": 1}}
		}
		return nil
	}
	t.Cleanup(func() { queryRowsOverride = nil })

	store := Store{}
	data, err := store.QueryAiEval(context.Background(), storage.SubjectEvalDatasetSearch, map[string]any{}, nil)
	if err != nil {
		t.Fatalf("QueryAiEval(dataset list) error = %v", err)
	}
	items := data["items"].([]map[string]any)
	if len(items) != 1 || items[0]["itemCount"] != 2 {
		t.Fatalf("dataset data = %#v", data)
	}

	export, err := store.QueryAiEval(context.Background(), storage.SubjectEvalDatasetExportStart, map[string]any{"datasetId": "dataset-1", "format": "jsonl"}, nil)
	if err != nil {
		t.Fatalf("QueryAiEval(dataset export) error = %v", err)
	}
	if export["status"] != "ready" {
		t.Fatalf("export = %#v", export)
	}

	health, err := store.QueryAiEval(context.Background(), storage.SubjectEvalDatasetHealth, map[string]any{"datasetId": "dataset-1"}, nil)
	if err != nil {
		t.Fatalf("QueryAiEval(dataset health) error = %v", err)
	}
	if health["status"] != "needs_review" {
		t.Fatalf("health = %#v", health)
	}

	quality, err := store.QueryAiEval(context.Background(), storage.SubjectEvalQualityOverview, map[string]any{"projectId": "default"}, nil)
	if err != nil {
		t.Fatalf("QueryAiEval(quality) error = %v", err)
	}
	if quality["summary"] == nil || quality["segments"] == nil {
		t.Fatalf("quality = %#v", quality)
	}
}

func TestStoreAiEvalEvaluationRunsAttachStorageReadAggregates(t *testing.T) {
	queryRowsOverride = func(_ context.Context, _ *sdk.DB, stmt QueryStatement, out any) error {
		rows, ok := out.(*[]map[string]any)
		if !ok {
			return fmt.Errorf("unexpected output %T", out)
		}
		switch {
		case strings.Contains(stmt.SQL, "FROM ai_evaluation_run"):
			*rows = []map[string]any{{"id": "run-1", "startedAt": "2026-05-20T10:00:00Z", "status": "completed"}}
		case strings.Contains(stmt.SQL, "FROM ai_metric_aggregate"):
			*rows = []map[string]any{{"id": "aggregate-1", "subjectId": "run-1", "metricId": "accuracy", "metricVersion": 1, "scope": "evaluation_run", "support": 10, "payload": map[string]any{"kind": "number", "value": 0.9}}}
		default:
			return fmt.Errorf("unexpected query %s", stmt.SQL)
		}
		return nil
	}
	t.Cleanup(func() { queryRowsOverride = nil })

	store := Store{}
	data, err := store.QueryAiEval(context.Background(), storage.SubjectEvalEvaluationRunSearch, map[string]any{"status": "completed"}, nil)
	if err != nil {
		t.Fatalf("QueryAiEval(evaluation runs) error = %v", err)
	}
	items := data["items"].([]map[string]any)
	if len(items) != 1 {
		t.Fatalf("items = %#v, want one run", items)
	}
	aggregates := items[0]["metricAggregates"].([]any)
	if len(aggregates) != 1 {
		t.Fatalf("aggregates = %#v, want storage-read attached aggregate", aggregates)
	}
	summary := items[0]["summary"].(map[string]any)
	if len(summary["metricAggregates"].([]any)) != 1 {
		t.Fatalf("summary = %#v, want storage-read aggregate in summary", summary)
	}
}
