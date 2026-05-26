//go:build surrealdb

package surrealdb

import (
	"encoding/base64"
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
)

func TestBuildDatasetCandidatesSearchQueryUsesBackedFiltersOrderingAndCursor(t *testing.T) {
	cursor := mustAiEvalCursorForTest(t, map[string]any{
		"sort":      "updatedAt_desc_id_asc",
		"lastValue": "2026-05-20T10:00:00Z",
		"lastId":    "candidate-1",
	})
	stmt, err := BuildAiEvalQuery(storage.SubjectEvalDatasetCandidatesSearch, map[string]any{
		"datasetId":        "dataset-1",
		"sourceKind":       "eval_result",
		"status":           "ready",
		"targetShape":      "single_turn",
		"contentTreatment": "redacted",
		"clusterId":        "cluster-1",
		"scorerId":         "scorer-1",
		"policyId":         "policy-1",
		"experimentRunId":  "run-1",
		"reviewOwner":      "reviewer-1",
		"from":             "2026-05-01T00:00:00Z",
		"to":               "2026-05-21T00:00:00Z",
		"query":            "checkout",
		"limit":            25,
		"cursor":           cursor,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(candidate search) returned error: %v", err)
	}

	for _, want := range []string{
		"FROM ai_dataset_candidate",
		"datasetId = $datasetId",
		"source.kind = $sourceKind",
		"status = $status",
		"targetShape = $targetShape",
		"contentTreatment = $contentTreatment",
		"clusterId = $clusterId",
		"scorerId = $scorerId",
		"policyId = $policyId",
		"experimentRunId = $experimentRunId",
		"reviewOwner = $reviewOwner",
		"updatedAt >= $from",
		"updatedAt <= $to",
		"string::lowercase(record::id(id)) CONTAINS $query",
		"(updatedAt < $cursorLastValue OR (updatedAt = $cursorLastValue AND record::id(id) > $cursorLastId))",
		"ORDER BY updatedAt DESC, id ASC",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("SQL = %s, missing %q", stmt.SQL, want)
		}
	}
	if stmt.Params["limit"] != 26 {
		t.Fatalf("limit param = %#v, want limit+1 for cursor pagination", stmt.Params["limit"])
	}
}

func TestAiEvalCursorEncodingAndPageShaping(t *testing.T) {
	rows := []map[string]any{
		{"id": "candidate-1", "updatedAt": "2026-05-20T10:00:00Z"},
		{"id": "candidate-2", "updatedAt": "2026-05-19T10:00:00Z"},
		{"id": "candidate-3", "updatedAt": "2026-05-18T10:00:00Z"},
	}
	pageItems, nextCursor := shapeAiEvalPage(storage.SubjectEvalDatasetCandidatesSearch, map[string]any{"limit": 2}, rows)
	if len(pageItems) != 2 || nextCursor == nil {
		t.Fatalf("page items=%#v nextCursor=%v, want two items and cursor", pageItems, nextCursor)
	}
	decoded := mustDecodeAiEvalCursorForTest(t, *nextCursor)
	if decoded["sort"] != "updatedAt_desc_id_asc" || decoded["lastValue"] != "2026-05-19T10:00:00Z" || decoded["lastId"] != "candidate-2" {
		t.Fatalf("cursor = %#v, want last included updatedAt/id", decoded)
	}

	_, err := BuildAiEvalQuery(storage.SubjectEvalDatasetCandidatesSearch, map[string]any{"cursor": "not-base64"})
	if err == nil {
		t.Fatal("BuildAiEvalQuery accepted malformed cursor")
	}
}

func TestBuildAiEvalQuerySearchesDatasetItemRevisionsByRevisionIds(t *testing.T) {
	stmt, err := BuildAiEvalQuery(storage.SubjectEvalDatasetSearch, map[string]any{
		"datasetVersionId": "dataset-1:version:2",
		"itemRevisionIds":  []any{"revision-1", "revision-2"},
		"limit":            10,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(dataset item revisions) returned error: %v", err)
	}

	for _, want := range []string{
		"FROM ai_dataset_item_revision",
		"record::id(id) IN $itemRevisionIds",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("SQL = %s, missing %q", stmt.SQL, want)
		}
	}
	if _, exists := stmt.Params["datasetVersionId"]; exists {
		t.Fatalf("params unexpectedly include datasetVersionId: %#v", stmt.Params)
	}
	if strings.Contains(stmt.SQL, "datasetVersionId = $datasetVersionId") {
		t.Fatalf("SQL = %s, want revision id lookup without datasetVersionId field predicate", stmt.SQL)
	}
}

func TestBuildAiEvalQueryCoversAgentRunSearchPushdown(t *testing.T) {
	from := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC).Format(time.RFC3339)
	to := time.Date(2026, 5, 2, 0, 0, 0, 0, time.UTC).Format(time.RFC3339)

	stmt, err := BuildAiEvalQuery(storage.SubjectEvalAgentRunsSearch, map[string]any{
		"agentId":         "agent-1",
		"agentName":       "checkout-agent",
		"status":          "ok",
		"experimentRunId": "experiment-run-1",
		"query":           "checkout",
		"from":            from,
		"to":              to,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery returned error: %v", err)
	}

	for _, want := range []string{
		"FROM ai_agent_run",
		"agent.id = $agentId",
		"agent.name = $agentName",
		"status = $status",
		"experimentRunId = $experimentRunId",
		"startedAt >= $from",
		"startedAt <= $to",
		"string::lowercase(traceId) CONTAINS $query",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("SQL = %s, missing %q", stmt.SQL, want)
		}
	}
}

func TestBuildAiEvalV2QuerySubjectsUseStorageReadTablesAndFilters(t *testing.T) {
	definitions, err := BuildAiEvalQuery(storage.SubjectEvalEvaluationSearch, map[string]any{
		"datasetId":  "dataset-1",
		"targetKind": "prompt",
		"query":      "checkout",
		"limit":      20,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(evaluation search) error = %v", err)
	}
	for _, want := range []string{"FROM ai_evaluation_definition", "datasetId = $datasetId", "targetRef.kind = $targetKind", "string::lowercase(name) CONTAINS $query"} {
		if !strings.Contains(definitions.SQL, want) {
			t.Fatalf("definition SQL = %s, missing %q", definitions.SQL, want)
		}
	}

	runs, err := BuildAiEvalQuery(storage.SubjectEvalEvaluationRunSearch, map[string]any{
		"evaluationDefinitionId": "eval-1",
		"datasetVersionId":       "version-1",
		"status":                 "completed",
		"kind":                   "dataset_evaluation",
		"targetSnapshotId":       "snapshot-1",
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(run search) error = %v", err)
	}
	for _, want := range []string{"FROM ai_evaluation_run", "evaluationDefinitionId = $evaluationDefinitionId", "datasetVersionId = $datasetVersionId", "status = $status", "kind = $kind", "targetSnapshotId = $targetSnapshotId", "ORDER BY startedAt DESC, id ASC"} {
		if !strings.Contains(runs.SQL, want) {
			t.Fatalf("run SQL = %s, missing %q", runs.SQL, want)
		}
	}

	itemRuns, err := BuildAiEvalQuery(storage.SubjectEvalEvaluationRunSearch, map[string]any{
		"evaluationRunId":       "run-1",
		"datasetItemRevisionId": "revision-1",
		"status":                "failed",
		"itemRuns":              true,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(item run search) error = %v", err)
	}
	for _, want := range []string{"FROM ai_evaluation_item_run", "evaluationRunId = $evaluationRunId", "datasetItemRevisionId = $datasetItemRevisionId", "status = $status"} {
		if !strings.Contains(itemRuns.SQL, want) {
			t.Fatalf("item run SQL = %s, missing %q", itemRuns.SQL, want)
		}
	}

	results, err := BuildAiEvalQuery(storage.SubjectEvalResultsSearch, map[string]any{
		"evaluationRunId": "run-1",
		"metricId":        "exact_match",
		"scope":           "item_run",
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(results search) error = %v", err)
	}
	for _, want := range []string{"FROM ai_metric_result", "evaluationRunId = $evaluationRunId", "metricId = $metricId", "scope = $scope", "ORDER BY producedAt DESC, id ASC"} {
		if !strings.Contains(results.SQL, want) {
			t.Fatalf("results SQL = %s, missing %q", results.SQL, want)
		}
	}

	comparisons, err := BuildAiEvalQuery(storage.SubjectEvalEvaluationComparisonSearch, map[string]any{
		"baselineRunId":  "run-a",
		"candidateRunId": "run-b",
		"metricId":       "accuracy",
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(comparison search) error = %v", err)
	}
	for _, want := range []string{"FROM ai_evaluation_comparison", "baselineRunId = $baselineRunId", "candidateRunId = $candidateRunId", "metricIds CONTAINS $metricId"} {
		if !strings.Contains(comparisons.SQL, want) {
			t.Fatalf("comparison SQL = %s, missing %q", comparisons.SQL, want)
		}
	}
}

func TestBuildAiEvalV2SingleReadAndOptimizationQueries(t *testing.T) {
	version, err := BuildAiEvalQuery(storage.SubjectEvalDatasetVersionGet, map[string]any{"datasetVersionId": "version-1"})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(version get) error = %v", err)
	}
	if !strings.Contains(version.SQL, "FROM ai_dataset_version") || !strings.Contains(version.SQL, "record::id(id) = $datasetVersionId") {
		t.Fatalf("version SQL = %s", version.SQL)
	}

	run, err := BuildAiEvalQuery(storage.SubjectEvalEvaluationRunGet, map[string]any{"evaluationRunId": "run-1"})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(run get) error = %v", err)
	}
	if !strings.Contains(run.SQL, "FROM ai_evaluation_run") || !strings.Contains(run.SQL, "record::id(id) = $evaluationRunId") {
		t.Fatalf("run get SQL = %s", run.SQL)
	}

	diff, err := BuildAiEvalQuery(storage.SubjectEvalTargetDiff, map[string]any{"baselineSnapshotId": "snapshot-a", "candidateSnapshotId": "snapshot-b"})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(target diff) error = %v", err)
	}
	if !strings.Contains(diff.SQL, "FROM ai_target_diff") || !strings.Contains(diff.SQL, "baselineTargetSnapshotId = $baselineSnapshotId") || !strings.Contains(diff.SQL, "candidateTargetSnapshotId = $candidateSnapshotId") {
		t.Fatalf("target diff SQL = %s", diff.SQL)
	}

	optimizations, err := BuildAiEvalQuery(storage.SubjectEvalOptimizationSearch, map[string]any{
		"status":                      "running",
		"baselineTargetSnapshotId":    "snapshot-a",
		"selectedCandidateSnapshotId": "snapshot-b",
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(optimization search) error = %v", err)
	}
	for _, want := range []string{"FROM ai_optimization_run", "status = $status", "baselineTargetSnapshotId = $baselineTargetSnapshotId", "selectedCandidateSnapshotId = $selectedCandidateSnapshotId"} {
		if !strings.Contains(optimizations.SQL, want) {
			t.Fatalf("optimization SQL = %s, missing %q", optimizations.SQL, want)
		}
	}
}

func TestBuildMetricAggregateQueryGroupsInStorageRead(t *testing.T) {
	stmt, err := BuildMetricAggregateQuery(storage.SubjectEvalEvaluationRunSearch, []string{"run-1", "run-2"})
	if err != nil {
		t.Fatalf("BuildMetricAggregateQuery returned error: %v", err)
	}
	for _, want := range []string{"FROM ai_metric_aggregate", "subjectId IN $subjectIds", "scope = 'evaluation_run'", "ORDER BY metricId ASC"} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("aggregate SQL = %s, missing %q", stmt.SQL, want)
		}
	}
}

func TestBuildAiEvalV2RejectsUnsupportedFilterValues(t *testing.T) {
	for _, tt := range []struct {
		name    string
		subject string
		input   map[string]any
	}{
		{name: "split", subject: storage.SubjectEvalDatasetSearch, input: map[string]any{"split": "holdout"}},
		{name: "curation", subject: storage.SubjectEvalDatasetSearch, input: map[string]any{"curationStatus": "reviewed"}},
		{name: "run status", subject: storage.SubjectEvalEvaluationRunSearch, input: map[string]any{"status": "done"}},
		{name: "scope", subject: storage.SubjectEvalResultsSearch, input: map[string]any{"evaluationRunId": "run-1", "scope": "experiment"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := BuildAiEvalQuery(tt.subject, tt.input); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestBuildAiEvalQueryUsesDeclaredSubjectTableAndFilters(t *testing.T) {
	stmt, err := BuildAiEvalQuery(storage.SubjectAnnotationQueueSearch, map[string]any{
		"status":     "open",
		"reason":     "low_score",
		"assignedTo": "reviewer-1",
		"limit":      25,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery returned error: %v", err)
	}

	if !strings.Contains(stmt.SQL, "FROM ai_annotation_queue_item") {
		t.Fatalf("SQL = %s, want annotation queue table", stmt.SQL)
	}
	for _, condition := range []string{"tenantId = $tenantId", "projectId = $projectId", "status = $status", "reason = $reason", "assignedTo = $assignedTo"} {
		if !strings.Contains(stmt.SQL, condition) {
			t.Fatalf("SQL = %s, missing condition %q", stmt.SQL, condition)
		}
	}
	if stmt.Params["limit"] != 26 {
		t.Fatalf("limit param = %#v, want limit+1", stmt.Params["limit"])
	}
}

func TestBuildDatasetHealthQueriesComputeStorageReadHealth(t *testing.T) {
	stmts, err := BuildDatasetHealthQueries(map[string]any{"datasetId": "dataset-1"})
	if err != nil {
		t.Fatalf("BuildDatasetHealthQueries returned error: %v", err)
	}

	for name, stmt := range stmts {
		for _, want := range []string{"tenantId = $tenantId", "projectId = $projectId", "datasetId = $datasetId"} {
			if !strings.Contains(stmt.SQL, want) {
				t.Fatalf("%s SQL = %s, missing %q", name, stmt.SQL, want)
			}
		}
	}
	if !strings.Contains(stmts["summary"].SQL, "GROUP ALL") || !strings.Contains(stmts["splitCounts"].SQL, "GROUP BY split") {
		t.Fatalf("dataset health queries = %#v, want aggregate summary and split counts", stmts)
	}
	if !strings.Contains(stmts["duplicates"].SQL, "duplicateOfItemId != NONE") {
		t.Fatalf("duplicate SQL = %s, want duplicate candidate pushdown", stmts["duplicates"].SQL)
	}
}

func TestShapeAiQualityOverviewNormalizesAggregateValues(t *testing.T) {
	summary := shapeAiQualitySummary(map[string]any{
		"runCount":      uint64(3),
		"meanLatencyMs": math.NaN(),
		"costUsd":       struct{}{},
	})
	if summary["runCount"] != 3 || summary["meanLatencyMs"] != float64(0) || summary["costUsd"] != float64(0) {
		t.Fatalf("summary = %#v, want normalized JSON-safe aggregate values", summary)
	}

	segments := shapeAiQualitySegments([]map[string]any{{
		"agentName":       "checkout-agent",
		"environment":     "dev",
		"service":         "checkout",
		"route":           "/checkout",
		"runCount":        uint64(2),
		"scoredRunCount":  uint64(1),
		"p50LatencyMs":    "12.5",
		"p95LatencyMs":    struct{}{},
		"costUsd":         "0.25",
		"regressionCount": uint64(0),
	}})
	if len(segments) != 1 {
		t.Fatalf("segments = %#v, want one segment", segments)
	}
	segment := segments[0]
	if segment["runCount"] != 2 || segment["scoredRunCount"] != 1 || segment["p50LatencyMs"] != 12.5 || segment["p95LatencyMs"] != float64(0) || segment["costUsd"] != 0.25 {
		t.Fatalf("segment = %#v, want normalized JSON-safe values", segment)
	}
	if _, ok := segment["agentName"]; ok {
		t.Fatalf("segment = %#v, want raw grouping fields removed", segment)
	}
}

func TestBuildDatasetListCountsQueryBatchesDatasetCounts(t *testing.T) {
	stmt, err := BuildDatasetListCountsQuery([]string{"dataset-1", "dataset-2"})
	if err != nil {
		t.Fatalf("BuildDatasetListCountsQuery returned error: %v", err)
	}

	for _, want := range []string{
		"FROM ai_dataset_item_revision",
		"datasetId IN $datasetIds",
		"GROUP BY datasetId",
		"count() AS itemCount",
		"reviewedItemCount",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("SQL = %s, missing %q", stmt.SQL, want)
		}
	}
}

func TestBuildDatasetExportItemsQuerySelectsOrderField(t *testing.T) {
	stmt, err := BuildDatasetExportItemsQuery(map[string]any{"datasetId": "dataset-1"})
	if err != nil {
		t.Fatalf("BuildDatasetExportItemsQuery returned error: %v", err)
	}

	for _, want := range []string{
		"SELECT id, input, expected",
		"FROM ai_dataset_item_revision",
		"datasetId = $datasetId",
		"ORDER BY id ASC",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("SQL = %s, missing %q", stmt.SQL, want)
		}
	}
}

func TestBuildAiQualityOverviewQueriesAggregateByProjectSegments(t *testing.T) {
	stmts, err := BuildAiQualityOverviewQueries(map[string]any{
		"projectId":   "default",
		"agentName":   "checkout-agent",
		"environment": "prod",
		"service":     "api",
		"route":       "/checkout",
	})
	if err != nil {
		t.Fatalf("BuildAiQualityOverviewQueries returned error: %v", err)
	}

	segments := stmts["segments"].SQL
	for _, want := range []string{
		"FROM ai_agent_run",
		"agent.name AS agentName",
		"agent.name = $agentName",
		"metadata.environment = $environment",
		"metadata.service = $service",
		"metadata.route = $route",
		"GROUP BY agent.name, metadata.environment, metadata.service, metadata.route",
	} {
		if !strings.Contains(segments, want) {
			t.Fatalf("segments SQL = %s, missing %q", segments, want)
		}
	}
	if strings.Contains(segments, "string::join") || strings.Contains(segments, "dimensions") {
		t.Fatalf("segments SQL = %s, want Go-shaped key and dimensions after grouped query", segments)
	}
}

func TestShapeAiQualitySegmentsNormalizesSurrealAggregateRows(t *testing.T) {
	segments := shapeAiQualitySegments([]map[string]any{{
		"agentName":       "checkout-agent",
		"environment":     nil,
		"service":         nil,
		"route":           nil,
		"runCount":        uint64(1),
		"scoredRunCount":  uint64(1),
		"p50LatencyMs":    float64(5000),
		"p95LatencyMs":    uint64(5000),
		"costUsd":         uint64(0),
		"regressionCount": []any{uint64(0)},
	}})

	segment := segments[0]
	if segment["key"] != "checkout-agent:::" || segment["label"] != "checkout-agent" {
		t.Fatalf("segment identity = %#v, want stable fallback dimensions", segment)
	}
	if segment["runCount"] != 1 || segment["scoredRunCount"] != 1 || segment["regressionCount"] != 0 {
		t.Fatalf("segment counts = %#v, want normalized ints", segment)
	}
	if segment["p50LatencyMs"] != float64(5000) || segment["p95LatencyMs"] != float64(5000) || segment["costUsd"] != float64(0) {
		t.Fatalf("segment metrics = %#v, want normalized numbers", segment)
	}
}

func TestBuildAiEvalQueryRoutesExperimentRunLookupsToRunTable(t *testing.T) {
	byRunID, err := BuildAiEvalQuery(storage.SubjectEvalExperimentSearch, map[string]any{
		"experimentRunId": "experiment-run-1",
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery by run id returned error: %v", err)
	}
	if !strings.Contains(byRunID.SQL, "FROM ai_experiment_run") || !strings.Contains(byRunID.SQL, "record::id(id) = $experimentRunId") {
		t.Fatalf("SQL = %s, want experiment run id lookup on run table", byRunID.SQL)
	}

	byExperimentID, err := BuildAiEvalQuery(storage.SubjectEvalExperimentSearch, map[string]any{
		"experimentId": "experiment-1",
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery by experiment id returned error: %v", err)
	}
	if !strings.Contains(byExperimentID.SQL, "FROM ai_experiment_run") || !strings.Contains(byExperimentID.SQL, "experimentId = $experimentId") {
		t.Fatalf("SQL = %s, want experiment runs for experiment id", byExperimentID.SQL)
	}

	itemRuns, err := BuildAiEvalQuery(storage.SubjectEvalExperimentSearch, map[string]any{
		"experimentRunId": "experiment-run-1",
		"itemRuns":        true,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery item runs returned error: %v", err)
	}
	if !strings.Contains(itemRuns.SQL, "FROM ai_dataset_item_run") || !strings.Contains(itemRuns.SQL, "experimentRunId = $experimentRunId") {
		t.Fatalf("SQL = %s, want dataset item runs for experiment run id", itemRuns.SQL)
	}
}

func TestShapeAiEvalItemsReturnsGraphQLReadyRows(t *testing.T) {
	items := shapeAiEvalItems(storage.SubjectEvalDatasetSearch, map[string]any{}, []map[string]any{{
		"id":                "dataset-1",
		"name":              "Regression",
		"createdAt":         "2026-05-12T10:00:00Z",
		"version":           uint64(2),
		"itemCount":         uint64(1),
		"reviewedItemCount": uint64(1),
	}})
	dataset := items[0]
	currentVersion, ok := dataset["currentVersion"].(map[string]any)
	if !ok {
		t.Fatalf("dataset currentVersion = %#v, want v2 version object", dataset["currentVersion"])
	}
	if currentVersion["version"] != 2 || dataset["currentVersionId"] != "dataset-1:version:2" || dataset["itemCount"] != 1 || dataset["readyItemCount"] != 1 {
		t.Fatalf("dataset row = %#v, want SurrealDB unsigned counts normalized", dataset)
	}
	health, ok := dataset["health"].(map[string]any)
	if !ok || health["status"] != "needs_review" || health["totalItemCount"] != 1 || health["readyItemCount"] != 1 {
		t.Fatalf("dataset health = %#v, want GraphQL health", dataset["health"])
	}
	if tags, ok := dataset["tags"].([]string); !ok || len(tags) != 0 {
		t.Fatalf("dataset tags = %#v, want empty string slice", dataset["tags"])
	}

	datasetItems := shapeAiEvalItems(storage.SubjectEvalDatasetSearch, map[string]any{"datasetId": "dataset-1"}, []map[string]any{{
		"id":        "item-1",
		"datasetId": "dataset-1",
		"input":     map[string]any{"prompt": "hi"},
	}})
	item := datasetItems[0]
	if item["id"] != "item-1" || item["split"] != "validation" || item["curationStatus"] != "draft" {
		t.Fatalf("dataset item revision = %#v, want defaulted revision fields", item)
	}

	agentRuns := shapeAiEvalItems(storage.SubjectEvalAgentRunsSearch, map[string]any{}, []map[string]any{{
		"id":        "agent-run-1",
		"traceId":   "trace-1",
		"spanId":    "span-1",
		"startedAt": "2026-05-12T10:00:00Z",
	}})
	agentRun := agentRuns[0]
	agent, ok := agentRun["agent"].(map[string]any)
	if !ok || agent["name"] != "unknown" || agentRun["rootSpanId"] != "span-1" || agentRun["status"] != "unset" {
		t.Fatalf("agent run = %#v, want GraphQL-ready defaults", agentRun)
	}
}

func TestBuildExperimentManifestResolveQueriesResolveImmutableInputs(t *testing.T) {
	stmts, err := BuildExperimentManifestResolveQueries(contracts.ExperimentManifestResolveRequest{
		ExperimentRunID: "experiment-run-1",
		ExperimentID:    "experiment-1",
		SplitSelector: map[string]any{
			"splits":           []any{"optimization", "validation"},
			"reviewedOnly":     true,
			"includeSynthetic": false,
		},
	})
	if err != nil {
		t.Fatalf("BuildExperimentManifestResolveQueries returned error: %v", err)
	}

	for name, stmt := range stmts {
		for _, want := range []string{"tenantId = $tenantId", "projectId = $projectId"} {
			if !strings.Contains(stmt.SQL, want) {
				t.Fatalf("%s SQL = %s, missing %q", name, stmt.SQL, want)
			}
		}
	}
	if !strings.Contains(stmts["datasetItems"].SQL, "split IN $splits") || !strings.Contains(stmts["datasetItems"].SQL, "reviewStatus = 'reviewed'") {
		t.Fatalf("dataset item SQL = %s, want resolved reviewed split item query", stmts["datasetItems"].SQL)
	}
	if !strings.Contains(stmts["run"].SQL, "record::id(id) = $experimentRunId") {
		t.Fatalf("run SQL = %s, want record id lookup", stmts["run"].SQL)
	}
	if !strings.Contains(stmts["experiment"].SQL, "record::id(id) = $experimentId") {
		t.Fatalf("experiment SQL = %s, want record id lookup", stmts["experiment"].SQL)
	}
	if !strings.Contains(stmts["scorers"].SQL, "record::id(id) IN $scorerIds") {
		t.Fatalf("scorer SQL = %s, want versioned scorer lookup", stmts["scorers"].SQL)
	}
}

func TestBuildOnlinePolicyMatchesResolveQueriesUseProjectionAndPolicyPushdown(t *testing.T) {
	stmts, err := BuildOnlinePolicyMatchesResolveQueries(contracts.OnlinePolicyMatchesResolveRequest{
		ProjectID:     "project-1",
		TraceID:       "trace-1",
		ProjectionIDs: []string{"agent-run-1"},
		SpanIDs:       []string{"span-1"},
		Kinds:         []contracts.AiProjectionKind{contracts.AiProjectionKindAgentRun},
		PersistedAt:   time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("BuildOnlinePolicyMatchesResolveQueries returned error: %v", err)
	}

	for name, stmt := range stmts {
		for _, want := range []string{"tenantId = $tenantId", "projectId = $projectId"} {
			if !strings.Contains(stmt.SQL, want) {
				t.Fatalf("%s SQL = %s, missing %q", name, stmt.SQL, want)
			}
		}
	}
	if !strings.Contains(stmts["settings"].SQL, "FROM project_ai_settings") || !strings.Contains(stmts["settings"].SQL, "enabled = true") {
		t.Fatalf("settings SQL = %s, want enabled project AI settings lookup", stmts["settings"].SQL)
	}
	if !strings.Contains(stmts["projection"].SQL, "FROM ai_agent_run") || !strings.Contains(stmts["projection"].SQL, "id IN $projectionIds") || !strings.Contains(stmts["projection"].SQL, "traceId = $traceId") {
		t.Fatalf("projection SQL = %s, want bounded persisted projection lookup", stmts["projection"].SQL)
	}
	if !strings.Contains(stmts["scorers"].SQL, "FROM ai_scorer") || !strings.Contains(stmts["scorers"].SQL, "contentRequirements") {
		t.Fatalf("scorers SQL = %s, want scorer requirement lookup", stmts["scorers"].SQL)
	}
}

func TestOnlinePolicyTargetMatchingUsesProjectionReadModelOnly(t *testing.T) {
	routePrefix := "/checkout"
	environment := "prod"
	target := contracts.OnlinePolicyTarget{
		Environment: &environment,
		RoutePrefix: &routePrefix,
		Attributes: []contracts.OnlinePolicyAttributeFilter{{
			Key:      "quality",
			Operator: contracts.AttributeFilterOperator("eq"),
			Value:    "candidate",
		}},
	}
	route := "/checkout/submit"
	projection := contracts.OnlinePolicyProjectionReadModel{
		ProjectID:      "project-1",
		TraceID:        "trace-1",
		ProjectionID:   "agent-run-1",
		Kind:           contracts.AiProjectionKindAgentRun,
		Environment:    &environment,
		Route:          &route,
		SafeAttributes: map[string]any{"quality": "candidate"},
	}

	if !onlinePolicyTargetMatchesProjection(target, projection) {
		t.Fatalf("target should match projection read model")
	}

	projection.SafeAttributes["quality"] = "baseline"
	if onlinePolicyTargetMatchesProjection(target, projection) {
		t.Fatalf("target should not match mismatched safe attribute")
	}
}

func TestBuildAiEvalQueryRejectsMutationSubjects(t *testing.T) {
	if _, err := BuildAiEvalQuery("eval.dataset.create", map[string]any{}); err == nil {
		t.Fatal("BuildAiEvalQuery returned nil error for mutation subject")
	}
}

func TestAiEvalQueryBuildersValidateLimitsAndRequiredInputs(t *testing.T) {
	invalidLimits := []any{0, int64(201), float64(250), "many"}
	for _, limit := range invalidLimits {
		if _, err := BuildAiEvalQuery(storage.SubjectEvalDatasetSearch, map[string]any{"limit": limit}); err == nil {
			t.Fatalf("BuildAiEvalQuery(limit=%#v) returned nil error", limit)
		}
	}
	for _, build := range []struct {
		name string
		fn   func() error
	}{
		{name: "dataset health", fn: func() error { _, err := BuildDatasetHealthQueries(map[string]any{}); return err }},
		{name: "dataset export", fn: func() error { _, err := BuildDatasetExportItemsQuery(map[string]any{}); return err }},
		{name: "quality overview", fn: func() error { _, err := BuildAiQualityOverviewQueries(map[string]any{}); return err }},
		{name: "experiment event", fn: func() error { _, err := BuildExperimentRunEventQueries(" ", nil); return err }},
		{name: "manifest resolve", fn: func() error {
			_, err := BuildExperimentManifestResolveQueries(contracts.ExperimentManifestResolveRequest{ExperimentRunID: "run-1"})
			return err
		}},
		{name: "online policy project", fn: func() error {
			_, err := BuildOnlinePolicyMatchesResolveQueries(contracts.OnlinePolicyMatchesResolveRequest{TraceID: "trace-1", ProjectionIDs: []string{"p1"}})
			return err
		}},
		{name: "online policy trace", fn: func() error {
			_, err := BuildOnlinePolicyMatchesResolveQueries(contracts.OnlinePolicyMatchesResolveRequest{ProjectID: "project-1", ProjectionIDs: []string{"p1"}})
			return err
		}},
		{name: "online policy projections", fn: func() error {
			_, err := BuildOnlinePolicyMatchesResolveQueries(contracts.OnlinePolicyMatchesResolveRequest{ProjectID: "project-1", TraceID: "trace-1"})
			return err
		}},
	} {
		t.Run(build.name, func(t *testing.T) {
			if err := build.fn(); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestAiEvalQueryBuildersCoverDatasetScorerResultsAndQualityFilters(t *testing.T) {
	datasetList, err := BuildAiEvalQuery(storage.SubjectEvalDatasetSearch, map[string]any{"tag": "release", "query": "checkout"})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(dataset list) error = %v", err)
	}
	for _, want := range []string{"FROM ai_dataset", "tags = $tag", "string::lowercase(record::id(id)) CONTAINS $query", "string::lowercase(name) CONTAINS $query"} {
		if !strings.Contains(datasetList.SQL, want) {
			t.Fatalf("dataset list SQL = %s, missing %q", datasetList.SQL, want)
		}
	}

	datasetItems, err := BuildAiEvalQuery(storage.SubjectEvalDatasetSearch, map[string]any{"datasetId": "dataset-1"})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(dataset items) error = %v", err)
	}
	if !strings.Contains(datasetItems.SQL, "FROM ai_dataset_item_revision") || !strings.Contains(datasetItems.SQL, "datasetId = $datasetId") {
		t.Fatalf("dataset items SQL = %s", datasetItems.SQL)
	}

	scorers, err := BuildAiEvalQuery(storage.SubjectEvalScorerSearch, map[string]any{"kind": "deterministic", "query": "exact"})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(scorers) error = %v", err)
	}
	if !strings.Contains(scorers.SQL, "FROM ai_scorer") || !strings.Contains(scorers.SQL, "kind = $kind") || !strings.Contains(scorers.SQL, "string::lowercase(name) CONTAINS $query") {
		t.Fatalf("scorer SQL = %s", scorers.SQL)
	}

	results, err := BuildAiEvalQuery(storage.SubjectEvalResultsSearch, map[string]any{
		"scorerId":        "scorer-1",
		"experimentRunId": "run-1",
		"targetKind":      "dataset_item_run",
		"targetId":        "item-run-1",
		"passed":          false,
	})
	if err != nil {
		t.Fatalf("BuildAiEvalQuery(results) error = %v", err)
	}
	for _, want := range []string{"FROM ai_metric_result", "scorerId = $scorerId", "experimentRunId = $experimentRunId", "targetKind = $targetKind", "targetId = $targetId", "passed = $passed"} {
		if !strings.Contains(results.SQL, want) {
			t.Fatalf("results SQL = %s, missing %q", results.SQL, want)
		}
	}

	from := time.Date(2026, 5, 16, 8, 0, 0, 0, time.UTC).Format(time.RFC3339)
	to := time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC)
	quality, err := BuildAiQualityOverviewQueries(map[string]any{"projectId": "project-1", "from": from, "to": to})
	if err != nil {
		t.Fatalf("BuildAiQualityOverviewQueries(filters) error = %v", err)
	}
	if !strings.Contains(quality["summary"].SQL, "startedAt >= $from") || !strings.Contains(quality["summary"].SQL, "startedAt <= $to") {
		t.Fatalf("quality summary SQL = %s", quality["summary"].SQL)
	}
}

func TestAiEvalHelperConversionsCoverSurrealDBScalarShapes(t *testing.T) {
	if numericValue(int8(1)) != 1 || numericValue(int16(2)) != 2 || numericValue(int32(3)) != 3 || numericValue(uint8(4)) != 4 || numericValue(uint16(5)) != 5 || numericValue(uint32(6)) != 6 || numericValue("7.5") != 7.5 {
		t.Fatal("numericValue did not normalize numeric scalar variants")
	}
	if numericValue(math.Inf(1)) != 0 || numericValue("not-number") != 0 {
		t.Fatal("numericValue did not reject non-finite or non-numeric values")
	}
	if intValueFromAny(int8(1)) != 1 || intValueFromAny(int16(2)) != 2 || intValueFromAny(int32(3)) != 3 || intValueFromAny(float32(4)) != 4 {
		t.Fatal("intValueFromAny did not normalize scalar variants")
	}
	if stringsFromAny([]any{" a ", "", 12, "b"})[0] != "a" {
		t.Fatal("stringsFromAny did not trim/filter values")
	}
	if values := stringSlice([]any{"x", "", 1, "y"}); len(values) != 2 || values[1] != "y" {
		t.Fatalf("stringSlice = %#v", values)
	}
	if maxIntValue(1, 2) != 2 || maxIntValue(3, 2) != 3 || defaultAny(nil, "fallback") != "fallback" || boolFromAny("true") {
		t.Fatal("small helper defaults did not behave as expected")
	}
	if value, ok := timeInput(map[string]any{"from": time.Date(2026, 5, 16, 8, 0, 0, 0, time.FixedZone("test", 3600))}, "from"); !ok || value.Location() != time.UTC {
		t.Fatalf("timeInput(time) = %v %v", value, ok)
	}
	if _, ok := timeInput(map[string]any{"from": "not-time"}, "from"); ok {
		t.Fatal("timeInput accepted invalid time string")
	}
}

func TestDatasetHealthWarningsAndStatusCoverAllHealthBranches(t *testing.T) {
	health := map[string]any{
		"reviewedItemCount":       5,
		"duplicateCandidateCount": 2,
		"leakageWarningCount":     1,
		"missingExpectedCount":    3,
	}
	warnings := datasetHealthWarnings(health)
	if strings.Join(warnings, ",") != "small_dataset,duplicate_candidates,split_leakage,missing_expected" {
		t.Fatalf("warnings = %#v", warnings)
	}

	for _, item := range []struct {
		health map[string]any
		want   string
	}{
		{map[string]any{"leakageWarningCount": 1}, "leakage_warning"},
		{map[string]any{"schemaIssueCount": 1}, "invalid"},
		{map[string]any{"missingExpectedCount": 1}, "needs_review"},
		{map[string]any{"smallDataset": true}, "needs_review"},
		{map[string]any{}, "ready"},
	} {
		if got := datasetHealthStatusFromCounts(item.health); got != item.want {
			t.Fatalf("status = %q, want %q for %#v", got, item.want, item.health)
		}
	}
}

func TestBuildExperimentRunEventQueriesUseRunAndItemRunIDs(t *testing.T) {
	itemRunID := "item-run-1"
	stmts, err := BuildExperimentRunEventQueries("experiment-run-1", &itemRunID)
	if err != nil {
		t.Fatalf("BuildExperimentRunEventQueries returned error: %v", err)
	}

	if !strings.Contains(stmts["run"].SQL, "FROM ai_experiment_run") || !strings.Contains(stmts["run"].SQL, "record::id(id) = $experimentRunId") || stmts["run"].Params["experimentRunId"] != "experiment-run-1" {
		t.Fatalf("run query = %#v, want experiment run lookup", stmts["run"])
	}
	if !strings.Contains(stmts["itemRun"].SQL, "FROM ai_dataset_item_run") || !strings.Contains(stmts["itemRun"].SQL, "record::id(id) = $datasetItemRunId") || stmts["itemRun"].Params["datasetItemRunId"] != itemRunID {
		t.Fatalf("item run query = %#v, want dataset item run lookup", stmts["itemRun"])
	}
}

func TestShapeAiEvalItemsCoversAllGraphQLRows(t *testing.T) {
	now := time.Date(2026, 5, 18, 11, 0, 0, 0, time.UTC).Format(time.RFC3339)

	scorers := shapeAiEvalItems(storage.SubjectEvalScorerSearch, map[string]any{}, []map[string]any{{
		"recordId": "scorer-1",
		"name":     "Exact match",
		"kind":     "deterministic",
	}})
	if scorers[0]["id"] != "scorer-1" || scorers[0]["version"] != 1 {
		t.Fatalf("scorer row = %#v", scorers[0])
	}
	if definition, ok := scorers[0]["definition"].(map[string]any); !ok || len(definition) != 0 {
		t.Fatalf("scorer definition = %#v, want empty object", scorers[0]["definition"])
	}

	experiments := shapeAiEvalItems(storage.SubjectEvalExperimentSearch, map[string]any{}, []map[string]any{{
		"id":                  "experiment-1",
		"datasetId":           "dataset-1",
		"datasetVersion":      uint64(0),
		"splitSelector":       map[string]any{"splits": []any{"dev", "validation"}, "reviewedOnly": true},
		"scorerIds":           []any{"scorer-1"},
		"promptVersionRefs":   []any{"prompt-1"},
		"skillSnapshotRefs":   []any{"skill-1"},
		"toolSnapshotRefs":    []any{"tool-1"},
		"providerProfileRefs": []any{"provider-1"},
		"tags":                []any{"smoke"},
	}})
	if experiments[0]["datasetVersion"] != 1 {
		t.Fatalf("experiment row = %#v, want minimum dataset version", experiments[0])
	}
	if selector := experiments[0]["splitSelector"].(map[string]any); selector["reviewedOnly"] != true {
		t.Fatalf("split selector = %#v", selector)
	}

	runs := shapeAiEvalItems(storage.SubjectEvalExperimentSearch, map[string]any{"experimentId": "experiment-1"}, []map[string]any{{
		"id": "run-1",
	}})
	if runs[0]["status"] != "queued" || runs[0]["startedAt"] == nil {
		t.Fatalf("run row = %#v, want defaults", runs[0])
	}
	if _, ok := runs[0]["solverRef"].(map[string]any); !ok {
		t.Fatalf("solverRef = %#v, want object", runs[0]["solverRef"])
	}

	itemRuns := shapeAiEvalItems(storage.SubjectEvalExperimentSearch, map[string]any{"experimentRunId": "run-1", "itemRuns": true}, []map[string]any{{
		"id":        "item-run-1",
		"latencyMs": "12.5",
	}})
	if itemRuns[0]["latencyMs"] != 12.5 {
		t.Fatalf("item run row = %#v", itemRuns[0])
	}
	if _, ok := itemRuns[0]["output"].(map[string]any); !ok {
		t.Fatalf("output = %#v, want object", itemRuns[0]["output"])
	}

	results := shapeAiEvalItems(storage.SubjectEvalResultsSearch, map[string]any{}, []map[string]any{{"id": "result-1"}})
	if results[0]["producedAt"] == nil {
		t.Fatalf("result row = %#v, want producedAt fallback", results[0])
	}

	queue := shapeAiEvalItems(storage.SubjectAnnotationQueueSearch, map[string]any{}, []map[string]any{{"id": "annotation-1", "createdAt": now}})
	if queue[0]["status"] != "open" || queue[0]["createdAt"] != now {
		t.Fatalf("annotation queue row = %#v", queue[0])
	}
}

func TestOnlinePolicyHelpersNormalizeRowsAndFilters(t *testing.T) {
	attributes := []any{
		map[string]any{"key": "tier", "operator": "in", "value": []any{"gold", "silver"}},
		map[string]any{"key": "env", "operator": "neq", "value": "dev"},
		map[string]any{"key": "", "operator": "eq", "value": "ignored"},
	}
	target := onlinePolicyTargetFromMap(map[string]any{
		"agentName":   "checkout-agent",
		"routePrefix": "/checkout",
		"attributes":  attributes,
	})
	if target.AgentName == nil || *target.AgentName != "checkout-agent" || len(target.Attributes) != 2 {
		t.Fatalf("target = %#v, want normalized filters", target)
	}
	if isEmptyOnlineTarget(target) {
		t.Fatal("target with agentName and attributes should not be empty")
	}
	if !isEmptyOnlineTarget(contracts.OnlinePolicyTarget{}) {
		t.Fatal("zero target should be empty")
	}

	route := "/checkout/submit"
	projection := onlineProjectionFromRow(map[string]any{
		"id":             "projection-1",
		"kind":           string(contracts.AiProjectionKindAgentRun),
		"agentName":      "checkout-agent",
		"route":          route,
		"safeAttributes": map[string]any{"tier": "gold", "env": "prod", "message": "hello world"},
	}, contracts.OnlinePolicyMatchesResolveRequest{ProjectID: "project-1", TraceID: "trace-1"})
	if projection.ProjectID != "project-1" || projection.TraceID != "trace-1" || projection.ProjectionID != "projection-1" {
		t.Fatalf("projection = %#v", projection)
	}
	if !onlinePolicyTargetMatchesProjection(target, projection) {
		t.Fatalf("target should match projection: target=%#v projection=%#v", target, projection)
	}

	for _, item := range []struct {
		filter contracts.OnlinePolicyAttributeFilter
		want   bool
	}{
		{contracts.OnlinePolicyAttributeFilter{Key: "message", Operator: contracts.AttributeFilterOperator("contains"), Value: "world"}, true},
		{contracts.OnlinePolicyAttributeFilter{Key: "tier", Operator: contracts.AttributeFilterOperator("not_in"), Value: []any{"bronze"}}, true},
		{contracts.OnlinePolicyAttributeFilter{Key: "missing", Operator: contracts.AttributeFilterOperator("exists")}, false},
		{contracts.OnlinePolicyAttributeFilter{Key: "tier", Operator: contracts.AttributeFilterOperator("unknown"), Value: "gold"}, false},
	} {
		if got := onlineAttributeFilterMatches(projection.SafeAttributes, item.filter); got != item.want {
			t.Fatalf("filter %#v got %v want %v", item.filter, got, item.want)
		}
	}
}

func TestBuildExperimentManifestProducesStableDigest(t *testing.T) {
	request := contracts.ExperimentManifestResolveRequest{
		ExperimentRunID: "run-1",
		ExperimentID:    "experiment-1",
		SplitSelector: map[string]any{
			"splits":           []any{"validation"},
			"reviewedOnly":     true,
			"includeSynthetic": false,
		},
	}
	experiment := map[string]any{
		"datasetId":           "dataset-1",
		"datasetVersion":      2,
		"baselineRef":         map[string]any{"id": "baseline"},
		"solverRef":           map[string]any{"id": "solver"},
		"promptVersionRefs":   []any{"prompt-2", "prompt-1"},
		"skillSnapshotRefs":   []any{"skill-1"},
		"toolSnapshotRefs":    []any{"tool-1"},
		"providerProfileRefs": []any{"provider-1"},
		"createdAt":           "2026-05-18T11:00:00Z",
	}
	items := []map[string]any{{"id": "item-2"}, {"id": "item-1"}}
	scorers := []map[string]any{{"id": "scorer-2", "version": 2}, {"id": "scorer-1", "version": 3}}
	manifest := buildExperimentManifest(request, experiment, items, scorers)
	rebuilt := buildExperimentManifest(request, experiment, items, scorers)

	if manifest["schema"] != "cloudgrid.ai-eval.experiment-manifest.v1" || manifest["digest"] == "" {
		t.Fatalf("manifest = %#v, want schema and digest", manifest)
	}
	if manifest["digest"] != rebuilt["digest"] {
		t.Fatalf("digest changed across equivalent builds: %s != %s", manifest["digest"], rebuilt["digest"])
	}
	if digest := manifestDigest(manifest); digest != manifest["digest"] {
		t.Fatalf("digest = %s manifest digest = %s", digest, manifest["digest"])
	}
	if manifest["runPolicy"] == nil {
		t.Fatalf("manifest = %#v, want typed runPolicy", manifest)
	}
	if itemIDs := manifest["datasetItemIds"].([]string); len(itemIDs) != 2 || itemIDs[0] != "item-1" {
		t.Fatalf("dataset item ids = %#v", itemIDs)
	}
	if scorerRefs := manifest["scorerRefs"].([]map[string]any); len(scorerRefs) != 2 || scorerRefs[0]["id"] != "scorer-1" || scorerRefs[0]["version"] != 3 {
		t.Fatalf("scorer refs = %#v", scorerRefs)
	}
}

func TestOnlinePolicyValidationWarningsAndRunPolicy(t *testing.T) {
	if err := validateOnlinePolicyTarget(contracts.OnlinePolicyTarget{
		Attributes: []contracts.OnlinePolicyAttributeFilter{{Key: "prompt.raw", Operator: contracts.AttributeFilterOperator("eq"), Value: "secret"}},
	}); err == nil {
		t.Fatal("validateOnlinePolicyTarget accepted raw content attribute")
	}
	if onlineScorerAllowedByPolicy(onlineScorerRow{kind: "llm_judge", version: 1, contentRequirements: []string{"prompt"}}, map[string]any{}) {
		t.Fatal("llm judge scorer requiring prompt content should be disallowed without policy allowance")
	}
	policy := defaultEvalRunPolicy()
	if policy == nil || policy.MaxParallelRequests != 10 || policy.TokenBudget == nil || policy.Retry == nil {
		t.Fatalf("run policy = %#v, want default typed run policy", policy)
	}
}

func mustAiEvalCursorForTest(t *testing.T, value map[string]any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func mustDecodeAiEvalCursorForTest(t *testing.T, cursor string) map[string]any {
	t.Helper()
	data, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	return value
}
