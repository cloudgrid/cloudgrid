package runtime

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/ports"
)

type HarnessHTTPAdapter struct {
	BaseURL string
	Client  *http.Client
	Timeout time.Duration
}

func (adapter HarnessHTTPAdapter) Run(ctx context.Context, request ports.HarnessRunRequest) (ports.HarnessRunResult, error) {
	var response struct {
		HarnessRunID string         `json:"harnessRunId"`
		RunID        string         `json:"runId"`
		Output       map[string]any `json:"output"`
		LatencyMs    float64        `json:"latencyMs"`
		Summary      map[string]any `json:"summary"`
	}
	if err := adapter.post(ctx, "/v1/run", map[string]any{
		"experimentRunId": request.ExperimentRunID,
		"datasetItemId":   request.DatasetItemID,
		"input":           request.Input,
		"solverRef":       request.SolverRef,
		"traceContext":    request.TraceContext,
	}, &response); err != nil {
		return ports.HarnessRunResult{}, err
	}
	harnessRunID := response.HarnessRunID
	if harnessRunID == "" {
		harnessRunID = response.RunID
	}
	return ports.HarnessRunResult{HarnessRunID: harnessRunID, Output: response.Output, LatencyMs: response.LatencyMs}, nil
}

func (adapter HarnessHTTPAdapter) Score(ctx context.Context, request ports.HarnessScoreRequest) (ports.HarnessScoreResult, error) {
	var response struct {
		Score       float64        `json:"score"`
		Passed      bool           `json:"passed"`
		Evidence    map[string]any `json:"evidence"`
		JudgeRunRef string         `json:"judgeRunRef"`
	}
	if err := adapter.post(ctx, "/v1/score", map[string]any{
		"scorerId":      request.ScorerID,
		"scorerVersion": request.ScorerVersion,
		"targetKind":    request.TargetKind,
		"targetId":      request.TargetID,
		"input":         request.Input,
		"output":        request.Output,
		"expected":      request.Expected,
		"traceContext":  request.TraceContext,
	}, &response); err != nil {
		return ports.HarnessScoreResult{}, err
	}
	return ports.HarnessScoreResult{Score: response.Score, Passed: response.Passed, Evidence: response.Evidence, JudgeRunRef: response.JudgeRunRef}, nil
}

func (adapter HarnessHTTPAdapter) Optimize(ctx context.Context, request ports.HarnessOptimizeRequest) (ports.HarnessOptimizeResult, error) {
	var response struct {
		CandidatePromptIDs []string       `json:"candidatePromptIds"`
		Summary            map[string]any `json:"summary"`
	}
	if err := adapter.post(ctx, "/v1/optimize", map[string]any{
		"experimentRunId":     request.ExperimentRunID,
		"basePromptVersionId": request.BasePromptVersionID,
		"optimizerKind":       request.OptimizerKind,
		"config":              request.Config,
		"traceContext":        request.TraceContext,
	}, &response); err != nil {
		return ports.HarnessOptimizeResult{}, err
	}
	return ports.HarnessOptimizeResult{CandidatePromptIDs: response.CandidatePromptIDs, Summary: response.Summary}, nil
}

func (adapter HarnessHTTPAdapter) post(ctx context.Context, path string, payload map[string]any, target any) error {
	data, err := marshalJSON(payload)
	if err != nil {
		return err
	}
	timeout := adapter.Timeout
	if timeout <= 0 {
		timeout = defaultHarnessRequestTimeout
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	url := strings.TrimRight(adapter.BaseURL, "/") + path
	request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("user-agent", defaultHarnessUserAgent)
	if traceContext, ok := payload["traceContext"].(map[string]string); ok {
		if traceparent := traceContext["traceparent"]; traceparent != "" {
			request.Header.Set("traceparent", traceparent)
		}
		if tracestate := traceContext["tracestate"]; tracestate != "" {
			request.Header.Set("tracestate", tracestate)
		}
	}
	client := adapter.Client
	if client == nil {
		client = http.DefaultClient
	}
	return doJSON(requestCtx, client, request, target)
}
