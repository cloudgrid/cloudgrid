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
		"experimentRunId":     request.ExperimentRunID,
		"datasetItemId":       request.DatasetItemID,
		"input":               request.Input,
		"solverRef":           request.SolverRef,
		"manifestDigest":      request.ManifestDigest,
		"providerProfileRefs": request.ProviderProfileRefs,
		"runPolicy":           request.RunPolicy,
		"sandboxProfile":      request.SandboxProfile,
		"sandboxRef":          request.SandboxRef,
		"traceContext":        request.TraceContext,
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
		"manifestDigest":      request.ManifestDigest,
		"providerProfileRefs": request.ProviderProfileRefs,
		"runPolicy":           request.RunPolicy,
		"sandboxProfile":      request.SandboxProfile,
		"sandboxRef":          request.SandboxRef,
		"traceContext":        request.TraceContext,
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
		"optimizerKind":       request.OptimizerKind,
		"config":              request.Config,
		"manifestDigest":      request.ManifestDigest,
		"providerProfileRefs": request.ProviderProfileRefs,
		"runPolicy":           request.RunPolicy,
		"sandboxProfile":      request.SandboxProfile,
		"sandboxRef":          request.SandboxRef,
		"traceContext":        request.TraceContext,
	})
	if err != nil {
		return ports.HarnessOptimizeResult{}, err
	}
	return response, nil
}

func (adapter HarnessHTTPAdapter) SkillCapabilities(ctx context.Context, traceContext map[string]string) (ports.SkillCapabilitiesResult, error) {
	var response struct {
		SupportedOptimizerKinds []string       `json:"supportedOptimizerKinds"`
		RuntimeModes            []string       `json:"runtimeModes"`
		TraceExport             map[string]any `json:"traceExport"`
		Limits                  map[string]any `json:"limits"`
		EditOps                 []string       `json:"editOps"`
	}
	if err := adapter.get(ctx, "/capabilities", traceContext, &response); err != nil {
		return ports.SkillCapabilitiesResult{}, err
	}
	return ports.SkillCapabilitiesResult{
		SupportedOptimizerKinds: response.SupportedOptimizerKinds,
		RuntimeModes:            response.RuntimeModes,
		TraceExport:             response.TraceExport,
		Limits:                  response.Limits,
		EditOps:                 response.EditOps,
		Summary:                 map[string]any{"traceExport": response.TraceExport, "limits": response.Limits},
	}, nil
}

func (adapter HarnessHTTPAdapter) SkillRuntimeDryRun(ctx context.Context, request ports.SkillRuntimeDryRunRequest) (ports.SkillRuntimeDryRunResult, error) {
	var response struct {
		OptimizationRunID string           `json:"optimizationRunId"`
		OK                bool             `json:"ok"`
		CapabilityDigest  string           `json:"capabilityDigest"`
		Checks            []map[string]any `json:"checks"`
		Warnings          []string         `json:"warnings"`
	}
	if err := adapter.post(ctx, "/skill-runtime/dry-run", map[string]any{
		"optimizationRunId": request.OptimizationRunID,
		"skillPackage":      skillPackagePayload(request.SkillPackage),
		"runtimeMode":       request.RuntimeMode,
		"runtimeProfileRef": request.RuntimeProfileRef,
		"modelProfileRef":   request.ModelProfileRef,
		"toolProfileRef":    request.ToolProfileRef,
		"fixtureRef":        request.FixtureRef,
		"traceContext":      request.TraceContext,
	}, &response); err != nil {
		return ports.SkillRuntimeDryRunResult{}, err
	}
	return ports.SkillRuntimeDryRunResult{OptimizationRunID: response.OptimizationRunID, OK: response.OK, CapabilityDigest: response.CapabilityDigest, Checks: response.Checks, Warnings: response.Warnings}, nil
}

func (adapter HarnessHTTPAdapter) SkillReflect(ctx context.Context, request ports.SkillReflectRequest) (ports.SkillReflectResult, error) {
	var response struct {
		OptimizationRunID string                    `json:"optimizationRunId"`
		StepID            string                    `json:"stepId"`
		Proposals         []ports.SkillEditProposal `json:"proposals"`
		Summary           map[string]any            `json:"summary"`
	}
	if err := adapter.post(ctx, "/skill-optimization/reflect", map[string]any{
		"optimizationRunId": request.OptimizationRunID,
		"stepId":            request.StepID,
		"reflectionKind":    request.ReflectionKind,
		"skillPackage":      skillPackagePayload(request.SkillPackage),
		"evidence":          request.Evidence,
		"contentPolicy":     request.ContentPolicy,
		"rejectedEdits":     skillProposalPayloads(request.RejectedEdits),
		"traceContext":      request.TraceContext,
	}, &response); err != nil {
		return ports.SkillReflectResult{}, err
	}
	return ports.SkillReflectResult{OptimizationRunID: response.OptimizationRunID, StepID: response.StepID, Proposals: response.Proposals, Summary: response.Summary}, nil
}

func (adapter HarnessHTTPAdapter) SkillMergeRank(ctx context.Context, request ports.SkillMergeRankRequest) (ports.SkillMergeRankResult, error) {
	var response struct {
		OptimizationRunID  string                    `json:"optimizationRunId"`
		StepID             string                    `json:"stepId"`
		RankedProposals    []ports.SkillEditProposal `json:"rankedProposals"`
		DroppedProposalIDs []string                  `json:"droppedProposalIds"`
		Summary            map[string]any            `json:"summary"`
	}
	if err := adapter.post(ctx, "/skill-optimization/merge-rank", map[string]any{
		"optimizationRunId": request.OptimizationRunID,
		"stepId":            request.StepID,
		"proposals":         skillProposalPayloads(request.Proposals),
		"editBudget":        request.EditBudget,
		"traceContext":      request.TraceContext,
	}, &response); err != nil {
		return ports.SkillMergeRankResult{}, err
	}
	return ports.SkillMergeRankResult{OptimizationRunID: response.OptimizationRunID, StepID: response.StepID, RankedProposals: response.RankedProposals, DroppedProposalIDs: response.DroppedProposalIDs, Summary: response.Summary}, nil
}

func (adapter HarnessHTTPAdapter) SkillSlowUpdate(ctx context.Context, request ports.SkillSlowUpdateRequest) (ports.SkillSlowUpdateResult, error) {
	var response struct {
		OptimizationRunID string   `json:"optimizationRunId"`
		Guidance          []string `json:"guidance"`
		ProtectedGuidance bool     `json:"protectedGuidance"`
	}
	if err := adapter.post(ctx, "/skill-optimization/slow-update", map[string]any{
		"optimizationRunId":   request.OptimizationRunID,
		"epoch":               request.Epoch,
		"acceptedProposalIds": request.AcceptedProposalIDs,
		"rejectedProposalIds": request.RejectedProposalIDs,
		"trainingSummary":     request.TrainingSummary,
		"traceContext":        request.TraceContext,
	}, &response); err != nil {
		return ports.SkillSlowUpdateResult{}, err
	}
	return ports.SkillSlowUpdateResult{OptimizationRunID: response.OptimizationRunID, Guidance: response.Guidance, ProtectedGuidance: response.ProtectedGuidance}, nil
}

func (adapter HarnessHTTPAdapter) SkillMetaMemory(ctx context.Context, request ports.SkillMetaMemoryRequest) (ports.SkillMetaMemoryResult, error) {
	var response struct {
		OptimizationRunID string           `json:"optimizationRunId"`
		Memory            []map[string]any `json:"memory"`
	}
	if err := adapter.post(ctx, "/skill-optimization/meta-memory", map[string]any{
		"optimizationRunId":   request.OptimizationRunID,
		"currentMemory":       request.CurrentMemory,
		"acceptedProposalIds": request.AcceptedProposalIDs,
		"rejectedProposalIds": request.RejectedProposalIDs,
		"traceContext":        request.TraceContext,
	}, &response); err != nil {
		return ports.SkillMetaMemoryResult{}, err
	}
	return ports.SkillMetaMemoryResult{OptimizationRunID: response.OptimizationRunID, Memory: response.Memory}, nil
}

func (adapter HarnessHTTPAdapter) sandboxLifecycle(ctx context.Context, path string, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	var response ports.SandboxLifecycleResult
	if err := adapter.post(ctx, path, map[string]any{
		"experimentRunId":     request.ExperimentRunID,
		"datasetItemId":       request.DatasetItemID,
		"scorerId":            request.ScorerID,
		"candidateId":         request.CandidateID,
		"attemptId":           request.AttemptID,
		"manifestDigest":      request.ManifestDigest,
		"providerProfileRefs": request.ProviderProfileRefs,
		"sandboxProfile":      request.SandboxProfile,
		"sandboxRef":          request.SandboxRef,
		"checkpointRef":       request.CheckpointRef,
		"runPolicy":           request.RunPolicy,
		"cleanupRetry":        request.CleanupRetry,
		"traceContext":        request.TraceContext,
	}, &response); err != nil {
		return ports.SandboxLifecycleResult{}, err
	}
	return response, nil
}

func (adapter HarnessHTTPAdapter) get(ctx context.Context, path string, traceContext map[string]string, target any) error {
	timeout := adapter.Timeout
	if timeout <= 0 {
		timeout = defaultHarnessRequestTimeout
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, strings.TrimRight(adapter.BaseURL, "/")+path, nil)
	if err != nil {
		return err
	}
	request.Header.Set("user-agent", defaultHarnessUserAgent)
	if traceparent := traceContext["traceparent"]; traceparent != "" {
		request.Header.Set("traceparent", traceparent)
	}
	if tracestate := traceContext["tracestate"]; tracestate != "" {
		request.Header.Set("tracestate", tracestate)
	}
	client := adapter.Client
	if client == nil {
		client = http.DefaultClient
	}
	return doJSON(requestCtx, client, request, target)
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

func skillPackagePayload(manifest ports.SkillPackageManifest) map[string]any {
	files := make([]any, 0, len(manifest.Files))
	for _, file := range manifest.Files {
		item := map[string]any{
			"path":     file.Path,
			"role":     file.Role,
			"digest":   file.Digest,
			"byteSize": file.ByteSize,
			"editable": file.Editable,
		}
		if file.Content != "" {
			item["content"] = file.Content
		}
		files = append(files, item)
	}
	return map[string]any{
		"packageRef":          manifest.PackageRef,
		"entrypoint":          manifest.Entrypoint,
		"manifestDigest":      manifest.ManifestDigest,
		"files":               files,
		"editableFileGlobs":   manifest.EditableFileGlobs,
		"protectedFileGlobs":  manifest.ProtectedFileGlobs,
		"runtimeRequirements": manifest.RuntimeRequirements,
	}
}

func skillProposalPayloads(proposals []ports.SkillEditProposal) []any {
	items := make([]any, 0, len(proposals))
	for _, proposal := range proposals {
		edits := make([]any, 0, len(proposal.Edits))
		for _, edit := range proposal.Edits {
			edits = append(edits, map[string]any{"op": edit.Op, "target": edit.Target, "filePath": edit.FilePath, "anchor": edit.Anchor, "content": edit.Content})
		}
		items = append(items, map[string]any{
			"id":                     proposal.ID,
			"source":                 proposal.Source,
			"rationale":              proposal.Rationale,
			"supportCount":           proposal.SupportCount,
			"evidenceRefs":           proposal.EvidenceRefs,
			"edits":                  edits,
			"expectedValidity":       proposal.ExpectedValidity,
			"protectedFileViolation": proposal.ProtectedFileViolation,
		})
	}
	return items
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
