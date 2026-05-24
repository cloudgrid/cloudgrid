//go:build surrealdb

package surrealdb

import (
	"strings"
	"testing"
)

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
