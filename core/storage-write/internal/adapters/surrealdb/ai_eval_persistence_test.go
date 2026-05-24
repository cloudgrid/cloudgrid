//go:build surrealdb

package surrealdb

import (
	"strings"
	"testing"
)

func TestBuildEvalMutationPersistQueryDatasetVersionSourceMatchesSchema(t *testing.T) {
	createRequest := validEvalRequest(map[string]any{
		"projectId":      "project-1",
		"name":           "classification cases",
		"settings":       map[string]any{"inputType": "json", "expectedType": "json"},
		"idempotencyKey": "dataset-1",
	})

	_, createVars, _, err := BuildEvalMutationPersistQuery("eval.dataset.create", createRequest, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery(create) error = %v", err)
	}
	createVersion := createVars["version_record"].(map[string]any)
	if source, ok := createVersion["source"].(map[string]any); !ok || source["kind"] != "manual" {
		t.Fatalf("create version source = %#v, want object source", createVersion["source"])
	}

	appendRequest := validEvalRequest(map[string]any{
		"projectId":                "project-1",
		"datasetId":                "dataset-1",
		"expectedDatasetVersionId": "dataset-1:version:1",
		"idempotencyKey":           "append-1",
		"source":                   "trace_import",
		"items":                    []any{map[string]any{"input": map[string]any{"text": "refund"}, "expected": map[string]any{"category": "billing"}}},
	})

	_, appendVars, _, err := BuildEvalMutationPersistQuery("eval.dataset.items.append", appendRequest, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery(append) error = %v", err)
	}
	appendVersion := appendVars["dataset_version_record"].(map[string]any)
	if source, ok := appendVersion["source"].(map[string]any); !ok || source["kind"] != "trace_import" {
		t.Fatalf("append version source = %#v, want object source", appendVersion["source"])
	}
}

func TestBuildEvalMutationPersistQueryTargetSnapshotSourceMatchesSchema(t *testing.T) {
	request := validEvalRequest(map[string]any{
		"projectId":      "project-1",
		"idempotencyKey": "snapshot-1",
		"targetRef": map[string]any{
			"kind":        "external_adapter",
			"targetRef":   "adapter://local",
			"displayName": "Local adapter",
		},
		"input": map[string]any{
			"kind":   "external_adapter",
			"name":   "Local adapter",
			"source": "evaluation_run_start",
		},
	})

	_, vars, _, err := BuildEvalMutationPersistQuery("eval.target.snapshot.create", request, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}
	record := vars["record"].(map[string]any)
	if source, ok := record["source"].(map[string]any); !ok || source["kind"] != "evaluation_run_start" {
		t.Fatalf("target snapshot source = %#v, want object source", record["source"])
	}
}

func TestBuildEvalMutationPersistQueryDatasetItemUpdateGuardsExpectedVersion(t *testing.T) {
	request := validEvalRequest(map[string]any{
		"datasetId":              "dataset-1",
		"itemId":                 "item-1",
		"expectedDatasetVersion": 4,
		"operation":              "remove",
		"metadata":               map[string]any{"reason": "duplicate"},
	})

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.dataset.item.update", request, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"LET $dataset = SELECT",
		"version != $expected_dataset_version",
		"THROW 'ERR-001 VALIDATION_FAILED: stale dataset version'",
		"UPSERT type::record('ai_dataset_item', $record_id) CONTENT $record",
		"UPDATE type::record('ai_dataset', $dataset_id) SET version = $new_dataset_version",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("query missing %q in:\n%s", want, sql)
		}
	}
	if vars["dataset_id"] != "dataset-1" || vars["expected_dataset_version"] != 4 || vars["new_dataset_version"] != 5 {
		t.Fatalf("vars = %#v", vars)
	}
	if data["version"] != 5 || data["id"] != "item-1" {
		t.Fatalf("data = %#v, want updated item at new dataset version", data)
	}
}

func TestBuildEvalMutationPersistQueryDatasetSettingsUpdateCreatesVersion(t *testing.T) {
	request := validEvalRequest(map[string]any{
		"projectId":                "project-1",
		"datasetId":                "dataset-1",
		"expectedDatasetVersionId": "dataset-1:version:1",
		"idempotencyKey":           "settings-update-1",
		"settings": map[string]any{
			"evaluationFamily": "classification",
			"inputType":        "text",
			"expectedType":     "json",
			"defaultSplit":     "validation",
			"intakePolicy":     map[string]any{},
			"retentionProfile": "balanced",
		},
	})

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.dataset.settings.update", request, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"stale dataset version",
		"settings = $settings",
		"ai_dataset_version",
		"itemRevisionIds = $parent_item_revision_ids",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("sql = %s, want %q for settings update version membership preservation", sql, want)
		}
	}
	if vars["dataset_version_id"] != "dataset-1:version:2" {
		t.Fatalf("dataset_version_id = %#v, want dataset-1:version:2", vars["dataset_version_id"])
	}
	if vars["expected_dataset_version_id"] != "dataset-1:version:1" {
		t.Fatalf("expected_dataset_version_id = %#v, want parent version id", vars["expected_dataset_version_id"])
	}
	if data["currentVersionId"] != "dataset-1:version:2" || data["settings"] == nil {
		t.Fatalf("data = %#v, want settings update data", data)
	}
}

func TestBuildEvalMutationPersistQueryCandidateCommitGuardsStateAndCreatesVersion(t *testing.T) {
	request := validEvalRequest(map[string]any{
		"datasetId":                  "dataset-1",
		"expectedDatasetVersion":     2,
		"candidateIds":               []any{"candidate-b", "candidate-a"},
		"split":                      "regression",
		"reviewStatus":               "reviewed",
		"anonymizationPolicyId":      "policy-1",
		"anonymizationPolicyVersion": 3,
	})

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.dataset.candidates.commit", request, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"SELECT * FROM ai_dataset_candidate",
		"array::len($candidates) != array::len($candidate_ids)",
		"status != 'ready'",
		"datasetId != $dataset_id",
		"anonymization.policyVersion != $anonymization_policy_version",
		"THROW 'ERR-AIE-003 VALIDATION_FAILED: candidate commit rejected'",
		"UPSERT type::record('ai_dataset_item'",
		"UPDATE ai_dataset_candidate SET status = 'committed'",
		"UPDATE type::record('ai_dataset', $dataset_id) SET version = $new_dataset_version",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("query missing %q in:\n%s", want, sql)
		}
	}
	if got := vars["candidate_ids"].([]string); strings.Join(got, ",") != "candidate-a,candidate-b" {
		t.Fatalf("candidate ids = %#v, want sorted idempotency order", got)
	}
	if vars["new_dataset_version"] != 3 || data["version"] != 3 {
		t.Fatalf("vars=%#v data=%#v, want new dataset version", vars, data)
	}
}

func TestBuildEvalMutationPersistQueryCandidatePreparePersistsCandidateRecord(t *testing.T) {
	request := validEvalRequest(map[string]any{
		"datasetId": "dataset-1",
		"sources": []any{map[string]any{
			"sourceKind": "trace",
			"traceId":    "trace-1",
			"spanId":     "span-1",
		}},
		"targetShape":                    "single_turn",
		"split":                          "validation",
		"reviewStatus":                   "reviewed",
		"contentTreatment":               "realistic_anonymized",
		"anonymizationPolicyId":          "policy-1",
		"anonymizationPolicyVersion":     2,
		"anonymizationTransformedFields": []any{map[string]any{"path": "/input", "entityType": "email", "strategy": "replace"}},
	})

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.dataset.candidates.prepare", request, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}
	if !strings.Contains(sql, "UPSERT type::record('ai_dataset_candidate'") {
		t.Fatalf("query = %s, want candidate table", sql)
	}
	record := vars["record"].(map[string]any)
	if record["status"] != "ready" || record["contentTreatment"] != "realistic_anonymized" || data["sourceKind"] != "trace" {
		t.Fatalf("record=%#v data=%#v, want ready anonymized candidate", record, data)
	}
	anonymization := record["anonymization"].(map[string]any)
	if anonymization["policyId"] != "policy-1" || anonymization["policyVersion"] != 2 {
		t.Fatalf("anonymization = %#v", anonymization)
	}
}

func TestBuildEvalMutationPersistQueryEvaluationCreateSetsVersion(t *testing.T) {
	request := validEvalRequest(map[string]any{
		"projectId":        "project-1",
		"name":             "classification evaluation",
		"datasetId":        "dataset-1",
		"idempotencyKey":   "evaluation-1",
		"targetRef":        map[string]any{"kind": "external_adapter", "targetRef": "adapter://local"},
		"metricSettings":   []any{map[string]any{"metricId": "classification.exact_label_match"}},
		"splitSelector":    map[string]any{"splits": []any{"validation"}},
		"runPolicy":        map[string]any{"maxParallelRequests": 1},
		"retentionProfile": "balanced",
	})

	_, vars, data, err := BuildEvalMutationPersistQuery("eval.evaluation.create", request, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}
	record := vars["record"].(map[string]any)
	metricSettings, ok := record["metricSettings"].([]any)
	if !ok || len(metricSettings) != 1 {
		t.Fatalf("record metricSettings = %#v, want preserved metric settings array", record["metricSettings"])
	}
	if record["version"] != 1 || data["version"] != 1 {
		t.Fatalf("record=%#v data=%#v, want version 1", record, data)
	}
}

func TestBuildEvalMutationPersistQueryResultsPersistStoresOptimizationRun(t *testing.T) {
	request := validEvalRequest(map[string]any{
		"projectId":       "project-1",
		"evaluationRunId": "run-1",
		"idempotencyKey":  "persist-optimization-1",
		"optimizationRun": map[string]any{
			"id":                       "optimization-1",
			"status":                   "running",
			"baselineTargetSnapshotId": "snapshot-baseline",
			"candidateTargetSnapshotIds": []any{
				"snapshot-candidate",
			},
			"causedEvaluationRunIds": []any{"run-1"},
			"comparisonIds":          []any{},
			"objective":              map[string]any{"primaryMetricId": "accuracy"},
			"quickShotPolicy":        map[string]any{"split": "training"},
			"budgetSnapshot":         map[string]any{"maxRuns": 3},
		},
	})

	sql, vars, data, err := BuildEvalMutationPersistQuery("eval.results.persist", request, fixedWriterTime())
	if err != nil {
		t.Fatalf("BuildEvalMutationPersistQuery() error = %v", err)
	}

	for _, want := range []string{
		"UPSERT type::record('ai_optimization_run', $optimization_run.id)",
		"UPSERT type::record('ai_eval_idempotency'",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("query missing %q in:\n%s", want, sql)
		}
	}
	optimizationRun := vars["optimization_run"].(map[string]any)
	if optimizationRun["id"] != "optimization-1" || optimizationRun["projectId"] != "default" {
		t.Fatalf("optimization run vars = %#v", optimizationRun)
	}
	if data["optimizationRun"] == nil {
		t.Fatalf("data = %#v, want optimizationRun echo", data)
	}
}

func TestBuildEvalMutationPersistQueryRejectsInvalidScorerDefinitionAndResultPayload(t *testing.T) {
	tests := []struct {
		name    string
		subject string
		input   map[string]any
	}{
		{
			name:    "scorer definition missing requirements",
			subject: "eval.scorer.create",
			input:   map[string]any{"name": "bad scorer", "kind": "deterministic", "definition": map[string]any{"type": "exact_match", "resultKind": "deterministic"}},
		},
		{
			name:    "result payload missing visualization",
			subject: "eval.results.persist",
			input: map[string]any{"results": []any{map[string]any{
				"id":            "result-1",
				"scorerId":      "scorer-1",
				"scorerVersion": 1,
				"targetKind":    "datasetItemRun",
				"targetId":      "item-run-1",
				"payload": map[string]any{
					"resultKind": "classification",
					"metrics":    map[string]any{"accuracy": 1, "support": 1},
					"breakdown":  map[string]any{"categories": []any{}},
				},
			}}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, _, err := BuildEvalMutationPersistQuery(tt.subject, validEvalRequest(tt.input), fixedWriterTime())
			if err == nil || !strings.HasPrefix(err.Error(), "ERR-001") {
				t.Fatalf("error = %v, want validation failure", err)
			}
		})
	}
}
