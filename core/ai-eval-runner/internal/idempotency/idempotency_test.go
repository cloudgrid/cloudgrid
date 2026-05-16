package idempotency

import "testing"

func TestDatasetItemExecutionKeyIsStableAndEscapesParts(t *testing.T) {
	key, err := DatasetItemExecutionKey("run:one", "item/two")
	if err != nil {
		t.Fatalf("DatasetItemExecutionKey returned error: %v", err)
	}

	want := "dataset_item_execution:experimentRunId=run%3Aone:datasetItemId=item%2Ftwo"
	if key != want {
		t.Fatalf("key = %q, want %q", key, want)
	}

	again, err := DatasetItemExecutionKey("run:one", "item/two")
	if err != nil {
		t.Fatalf("DatasetItemExecutionKey returned error on repeated call: %v", err)
	}
	if again != key {
		t.Fatalf("repeated key = %q, want %q", again, key)
	}
}

func TestEvalResultKeyIncludesScorerVersion(t *testing.T) {
	v1, err := EvalResultKey("datasetItemRun", "target-1", "scorer-1", 1)
	if err != nil {
		t.Fatalf("EvalResultKey returned error: %v", err)
	}

	v2, err := EvalResultKey("datasetItemRun", "target-1", "scorer-1", 2)
	if err != nil {
		t.Fatalf("EvalResultKey returned error for version 2: %v", err)
	}

	if v1 == v2 {
		t.Fatalf("versioned eval result keys collided: %q", v1)
	}

	want := "eval_result:targetKind=datasetItemRun:targetId=target-1:scorerId=scorer-1:scorerVersion=1"
	if v1 != want {
		t.Fatalf("key = %q, want %q", v1, want)
	}
}

func TestOptimizationCandidateKeyRejectsMissingParts(t *testing.T) {
	if _, err := OptimizationCandidateKey("", "hash-1"); err == nil {
		t.Fatal("OptimizationCandidateKey accepted empty experiment run id")
	}

	if _, err := OptimizationCandidateKey("run-1", ""); err == nil {
		t.Fatal("OptimizationCandidateKey accepted empty prompt version hash")
	}
}
