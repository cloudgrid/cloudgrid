package scoring

import "testing"

func TestExactJSONScorerIsDeterministicForEquivalentObjects(t *testing.T) {
	scorer := ExactJSONScorer{}
	expected := map[string]any{"answer": "ok", "count": float64(2)}
	output := map[string]any{"count": float64(2), "answer": "ok"}

	first, err := scorer.Score(expected, output)
	if err != nil {
		t.Fatalf("Score returned error: %v", err)
	}

	second, err := scorer.Score(expected, output)
	if err != nil {
		t.Fatalf("Score returned error on repeated call: %v", err)
	}

	if first != second {
		t.Fatalf("Score is not deterministic: first=%+v second=%+v", first, second)
	}
	if !first.Passed || first.Score != 1 {
		t.Fatalf("matching objects scored %+v, want passed score 1", first)
	}
}

func TestExactJSONScorerFailsDifferentValues(t *testing.T) {
	scorer := ExactJSONScorer{}

	result, err := scorer.Score(map[string]any{"answer": "ok"}, map[string]any{"answer": "no"})
	if err != nil {
		t.Fatalf("Score returned error: %v", err)
	}

	if result.Passed || result.Score != 0 {
		t.Fatalf("different objects scored %+v, want failed score 0", result)
	}
}
