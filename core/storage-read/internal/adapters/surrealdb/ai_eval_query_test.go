//go:build surrealdb

package surrealdb

import (
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
	if !strings.Contains(stmts["scorers"].SQL, "id IN $scorerIds") {
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

	if !strings.Contains(stmts["run"].SQL, "FROM ai_experiment_run") || stmts["run"].Params["experimentRunId"] != "experiment-run-1" {
		t.Fatalf("run query = %#v, want experiment run lookup", stmts["run"])
	}
	if !strings.Contains(stmts["itemRun"].SQL, "FROM ai_dataset_item_run") || stmts["itemRun"].Params["datasetItemRunId"] != itemRunID {
		t.Fatalf("item run query = %#v, want dataset item run lookup", stmts["itemRun"])
	}
}
