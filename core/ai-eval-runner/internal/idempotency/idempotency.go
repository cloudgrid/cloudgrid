package idempotency

import (
	"fmt"
	"net/url"
	"strings"
)

func DatasetItemExecutionKey(experimentRunID string, datasetItemID string) (string, error) {
	if err := requirePart("experimentRunId", experimentRunID); err != nil {
		return "", err
	}
	if err := requirePart("datasetItemId", datasetItemID); err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"dataset_item_execution:experimentRunId=%s:datasetItemId=%s",
		escape(experimentRunID),
		escape(datasetItemID),
	), nil
}

func EvalResultKey(targetKind string, targetID string, scorerID string, scorerVersion int) (string, error) {
	if err := requirePart("targetKind", targetKind); err != nil {
		return "", err
	}
	if err := requirePart("targetId", targetID); err != nil {
		return "", err
	}
	if err := requirePart("scorerId", scorerID); err != nil {
		return "", err
	}
	if scorerVersion < 1 {
		return "", fmt.Errorf("scorerVersion must be at least 1")
	}

	return fmt.Sprintf(
		"eval_result:targetKind=%s:targetId=%s:scorerId=%s:scorerVersion=%d",
		escape(targetKind),
		escape(targetID),
		escape(scorerID),
		scorerVersion,
	), nil
}

func OptimizationCandidateKey(experimentRunID string, promptVersionHash string) (string, error) {
	if err := requirePart("experimentRunId", experimentRunID); err != nil {
		return "", err
	}
	if err := requirePart("promptVersionHash", promptVersionHash); err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"optimization_candidate:experimentRunId=%s:promptVersionHash=%s",
		escape(experimentRunID),
		escape(promptVersionHash),
	), nil
}

func requirePart(name string, value string) error {
	if strings.TrimSpace(value) == "" {
		return fmt.Errorf("%s is required", name)
	}
	return nil
}

func escape(value string) string {
	return url.QueryEscape(value)
}
