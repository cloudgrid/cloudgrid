//go:build surrealdb

package surrealdb

import (
	"math"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
)

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
	if stmt.Params["limit"] != 25 {
		t.Fatalf("limit param = %#v, want 25", stmt.Params["limit"])
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
		"FROM ai_dataset_item",
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
		"FROM ai_dataset_item",
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
	if dataset["version"] != 2 || dataset["itemCount"] != 1 || dataset["reviewedItemCount"] != 1 {
		t.Fatalf("dataset row = %#v, want SurrealDB unsigned counts normalized", dataset)
	}
	health, ok := dataset["health"].(map[string]any)
	if !ok || health["status"] != "needs_review" || health["totalItemCount"] != 1 || health["reviewedItemCount"] != 1 {
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
	if item["version"] != 1 || item["split"] != "dev" || item["reviewStatus"] != "unreviewed" {
		t.Fatalf("dataset item = %#v, want defaulted item fields", item)
	}
	if warnings, ok := item["leakageWarnings"].([]string); !ok || len(warnings) != 0 {
		t.Fatalf("leakage warnings = %#v, want empty string slice", item["leakageWarnings"])
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
	if !strings.Contains(stmts["scorers"].SQL, "FROM ai_scorer") || !strings.Contains(stmts["scorers"].SQL, "kind = 'deterministic'") {
		t.Fatalf("scorers SQL = %s, want deterministic scorer lookup", stmts["scorers"].SQL)
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
