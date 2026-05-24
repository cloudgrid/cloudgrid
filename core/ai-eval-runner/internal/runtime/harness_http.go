package runtime

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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

func (adapter HarnessHTTPAdapter) StartSandbox(ctx context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return adapter.sandboxLifecycle(ctx, "/v1/sandboxes/start", request)
}

func (adapter HarnessHTTPAdapter) PauseSandbox(ctx context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return adapter.sandboxLifecycle(ctx, "/v1/sandboxes/pause", request)
}

func (adapter HarnessHTTPAdapter) ResumeSandbox(ctx context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return adapter.sandboxLifecycle(ctx, "/v1/sandboxes/resume", request)
}

func (adapter HarnessHTTPAdapter) AbortSandbox(ctx context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return adapter.sandboxLifecycle(ctx, "/v1/sandboxes/abort", request)
}

func (adapter HarnessHTTPAdapter) CleanupSandbox(ctx context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return adapter.sandboxLifecycle(ctx, "/v1/sandboxes/cleanup", request)
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
		"manifestDigest":  request.ManifestDigest,
		"runPolicy":       request.RunPolicy,
		"sandboxProfile":  request.SandboxProfile,
		"sandboxRef":      request.SandboxRef,
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
		"scorer": map[string]any{
			"id":         request.ScorerID,
			"name":       request.ScorerID,
			"kind":       ports.ScorerKindLLMJudge,
			"definition": map[string]any{},
			"version":    request.ScorerVersion,
		},
		"target": map[string]any{
			"kind":     request.TargetKind,
			"id":       request.TargetID,
			"output":   request.Output,
			"expected": request.Expected,
			"metadata": map[string]any{"input": request.Input},
		},
		"manifestDigest": request.ManifestDigest,
		"runPolicy":      request.RunPolicy,
		"sandboxProfile": request.SandboxProfile,
		"sandboxRef":     request.SandboxRef,
		"traceContext":   request.TraceContext,
	}, &response); err != nil {
		return ports.HarnessScoreResult{}, err
	}
	return ports.HarnessScoreResult{Score: response.Score, Passed: response.Passed, Evidence: response.Evidence, JudgeRunRef: response.JudgeRunRef}, nil
}

func (adapter HarnessHTTPAdapter) Optimize(ctx context.Context, request ports.HarnessOptimizeRequest) (ports.HarnessOptimizeResult, error) {
	response, err := adapter.postNDJSON(ctx, "/v1/optimize", map[string]any{
		"experimentRunId": request.ExperimentRunID,
		"experimentId":    request.ExperimentID,
		"basePromptVersion": map[string]any{
			"id":   request.BasePromptVersionID,
			"name": request.BasePromptVersionID,
			"text": request.BasePromptVersionID,
			"hash": request.BasePromptVersionID,
		},
		"optimizerKind":  request.OptimizerKind,
		"config":         request.Config,
		"manifestDigest": request.ManifestDigest,
		"runPolicy":      request.RunPolicy,
		"sandboxProfile": request.SandboxProfile,
		"sandboxRef":     request.SandboxRef,
		"traceContext":   request.TraceContext,
	})
	if err != nil {
		return ports.HarnessOptimizeResult{}, err
	}
	return response, nil
}

func (adapter HarnessHTTPAdapter) sandboxLifecycle(ctx context.Context, path string, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	var response ports.SandboxLifecycleResult
	if err := adapter.post(ctx, path, map[string]any{
		"experimentRunId": request.ExperimentRunID,
		"datasetItemId":   request.DatasetItemID,
		"scorerId":        request.ScorerID,
		"candidateId":     request.CandidateID,
		"attemptId":       request.AttemptID,
		"manifestDigest":  request.ManifestDigest,
		"sandboxProfile":  request.SandboxProfile,
		"sandboxRef":      request.SandboxRef,
		"checkpointRef":   request.CheckpointRef,
		"runPolicy":       request.RunPolicy,
		"cleanupRetry":    request.CleanupRetry,
		"traceContext":    request.TraceContext,
	}, &response); err != nil {
		return ports.SandboxLifecycleResult{}, err
	}
	return response, nil
}

func (adapter HarnessHTTPAdapter) post(ctx context.Context, path string, payload map[string]any, target any) error {
	payload = cleanPayload(payload)
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

func (adapter HarnessHTTPAdapter) postNDJSON(ctx context.Context, path string, payload map[string]any) (ports.HarnessOptimizeResult, error) {
	payload = cleanPayload(payload)
	data, err := marshalJSON(payload)
	if err != nil {
		return ports.HarnessOptimizeResult{}, err
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
		return ports.HarnessOptimizeResult{}, err
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("user-agent", defaultHarnessUserAgent)
	client := adapter.Client
	if client == nil {
		client = http.DefaultClient
	}
	response, err := client.Do(request)
	if err != nil {
		return ports.HarnessOptimizeResult{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return ports.HarnessOptimizeResult{}, fmt.Errorf("harness adapter returned status %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	result := ports.HarnessOptimizeResult{Summary: map[string]any{}}
	scanner := bufio.NewScanner(response.Body)
	for scanner.Scan() {
		var event struct {
			Type          string         `json:"type"`
			PromptVersion map[string]any `json:"promptVersion"`
			Summary       map[string]any `json:"summary"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			return ports.HarnessOptimizeResult{}, err
		}
		if event.Type == "candidate" {
			if id, _ := event.PromptVersion["id"].(string); id != "" {
				result.CandidatePromptIDs = append(result.CandidatePromptIDs, id)
			}
		}
		if event.Type == "summary" {
			result.Summary = event.Summary
		}
	}
	if err := scanner.Err(); err != nil {
		return ports.HarnessOptimizeResult{}, err
	}
	return result, nil
}

func cleanPayload(payload map[string]any) map[string]any {
	cleaned := map[string]any{}
	for key, value := range payload {
		switch typed := value.(type) {
		case string:
			if typed != "" {
				cleaned[key] = typed
			}
		case map[string]any:
			nested := cleanPayload(typed)
			if len(nested) > 0 {
				cleaned[key] = nested
			}
		case map[string]string:
			if len(typed) > 0 {
				cleaned[key] = typed
			}
		default:
			if value != nil {
				cleaned[key] = value
			}
		}
	}
	return cleaned
}
