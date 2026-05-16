package scoring

import (
	"bytes"
	"encoding/json"
)

type Result struct {
	Score  float64
	Passed bool
}

type ExactJSONScorer struct{}

func (ExactJSONScorer) Score(expected any, output any) (Result, error) {
	expectedJSON, err := json.Marshal(expected)
	if err != nil {
		return Result{}, err
	}

	outputJSON, err := json.Marshal(output)
	if err != nil {
		return Result{}, err
	}

	if bytes.Equal(expectedJSON, outputJSON) {
		return Result{Score: 1, Passed: true}, nil
	}

	return Result{Score: 0, Passed: false}, nil
}
