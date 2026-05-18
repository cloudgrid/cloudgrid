package orchestrator

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/idempotency"
	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/ports"
	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/scoring"
)

type RunnerConfig struct {
	StorageReader     ports.StorageReader
	StorageWriter     ports.StorageWriter
	ControlPlane      ports.ControlPlane
	HarnessAdapter    ports.HarnessAdapter
	ProgressPublisher ports.ProgressPublisher
	Clock             func() time.Time
	IDGenerator       func() string
}

type Runner struct {
	reader        ports.StorageReader
	writer        ports.StorageWriter
	control       ports.ControlPlane
	harness       ports.HarnessAdapter
	publisher     ports.ProgressPublisher
	clock         func() time.Time
	idGenerator   func() string
	cancellations map[string]bool
}

type StartExperimentRequest struct {
	RequestID    string
	ProjectID    string
	ExperimentID string
	SolverRef    map[string]any
	TraceContext map[string]string
}

type StartExperimentResult struct {
	Run ports.ExperimentRun
}

type CancelExperimentRequest struct {
	RequestID       string
	ExperimentRunID string
}

type CancelExperimentResult struct {
	ExperimentRunID string
	Cancelled       bool
}

type StartOptimizationRequest struct {
	RequestID           string
	ProjectID           string
	ExperimentID        string
	OptimizerKind       string
	BasePromptVersionID string
	Config              map[string]any
	TraceContext        map[string]string
}

type StartOptimizationResult struct {
	ExperimentRunID    string
	CandidatePromptIDs []string
	Summary            map[string]any
}

func NewRunner(config RunnerConfig) *Runner {
	return &Runner{
		reader:        config.StorageReader,
		writer:        config.StorageWriter,
		control:       config.ControlPlane,
		harness:       config.HarnessAdapter,
		publisher:     config.ProgressPublisher,
		clock:         defaultClock(config.Clock),
		idGenerator:   defaultIDGenerator(config.IDGenerator),
		cancellations: map[string]bool{},
	}
}

func (r *Runner) StartOfflineExperiment(ctx context.Context, request StartExperimentRequest) (StartExperimentResult, error) {
	if err := r.requireConfigured(); err != nil {
		return StartExperimentResult{}, err
	}
	if request.ExperimentID == "" {
		return StartExperimentResult{}, errors.New("experimentId is required")
	}
	candidateRunID := r.idGenerator()
	manifest, err := r.resolveManifest(ctx, ports.ManifestResolveRequest{
		ExperimentRunID: candidateRunID,
		ExperimentID:    request.ExperimentID,
	})
	if err != nil {
		return StartExperimentResult{}, err
	}
	if manifest.Digest != "" {
		if err := r.enforceProjectBudget(ctx, request.ProjectID, manifest); err != nil {
			return StartExperimentResult{}, err
		}
	}

	experiment, err := r.loadExperiment(ctx, request.ExperimentID)
	if err != nil {
		return StartExperimentResult{}, err
	}
	items, err := r.reader.SearchDatasetItems(ctx, experiment.DatasetID, experiment.DatasetVersion)
	if err != nil {
		return StartExperimentResult{}, err
	}
	scorers, err := r.reader.SearchScorers(ctx, experiment.ScorerIDs)
	if err != nil {
		return StartExperimentResult{}, err
	}
	solverRef := request.SolverRef
	if len(solverRef) == 0 {
		solverRef = manifest.SolverRef
	}

	run := ports.ExperimentRun{
		ID:           candidateRunID,
		ExperimentID: experiment.ID,
		SolverRef:    solverRef,
		Status:       ports.ExperimentRunStatusRunning,
		StartedAt:    r.now(),
		Summary:      map[string]any{"totalItems": len(items), "completedItems": 0},
	}
	if err := r.writer.PersistExperimentRun(ctx, run); err != nil {
		return StartExperimentResult{}, err
	}
	if err := r.publishProgress(ctx, run.ID, ports.ExperimentProgressStarted, "", run.Status, run.Summary); err != nil {
		return StartExperimentResult{}, err
	}

	completedItems := 0
	for _, item := range items {
		if r.isCancelled(run.ID) {
			run, err = r.finishRun(ctx, run, ports.ExperimentRunStatusCancelled, completedItems, len(items))
			if err != nil {
				return StartExperimentResult{}, err
			}
			return StartExperimentResult{Run: run}, nil
		}

		runResult, err := r.harness.Run(ctx, ports.HarnessRunRequest{
			ExperimentRunID: run.ID,
			DatasetItemID:   item.ID,
			Input:           item.Input,
			SolverRef:       solverRef,
			TraceContext:    request.TraceContext,
		})
		if err != nil {
			return StartExperimentResult{}, r.failRun(ctx, run.ID, err)
		}

		itemRun := ports.DatasetItemRun{
			ID:              r.idGenerator(),
			ExperimentRunID: run.ID,
			DatasetItemID:   item.ID,
			HarnessRunID:    runResult.HarnessRunID,
			Output:          runResult.Output,
			LatencyMs:       runResult.LatencyMs,
		}
		itemRunKey, err := idempotency.DatasetItemExecutionKey(run.ID, item.ID)
		if err != nil {
			return StartExperimentResult{}, err
		}
		if err := r.writer.PersistDatasetItemRun(ctx, itemRunKey, itemRun); err != nil {
			return StartExperimentResult{}, err
		}

		for _, scorer := range scorers {
			result, err := r.scoreDatasetItemRun(ctx, scorer, item, itemRun, request.TraceContext)
			if err != nil {
				return StartExperimentResult{}, r.failRun(ctx, run.ID, err)
			}
			result.ID = r.idGenerator()
			result.ExperimentRunID = run.ID
			result.ProducedAt = r.now()
			resultKey, err := idempotency.EvalResultKey(result.TargetKind, result.TargetID, result.ScorerID, result.ScorerVersion)
			if err != nil {
				return StartExperimentResult{}, err
			}
			if err := r.writer.PersistEvalResult(ctx, resultKey, result); err != nil {
				return StartExperimentResult{}, err
			}
		}

		completedItems++
		summary := map[string]any{"totalItems": len(items), "completedItems": completedItems}
		if err := r.publishProgress(ctx, run.ID, ports.ExperimentProgressItemCompleted, itemRun.ID, run.Status, summary); err != nil {
			return StartExperimentResult{}, err
		}
	}

	run, err = r.finishRun(ctx, run, ports.ExperimentRunStatusFinished, completedItems, len(items))
	if err != nil {
		return StartExperimentResult{}, err
	}
	return StartExperimentResult{Run: run}, nil
}

func (r *Runner) CancelExperimentRun(ctx context.Context, request CancelExperimentRequest) (CancelExperimentResult, error) {
	if request.ExperimentRunID == "" {
		return CancelExperimentResult{}, errors.New("experimentRunId is required")
	}
	r.cancellations[request.ExperimentRunID] = true
	progress := ports.ExperimentProgress{
		ExperimentRunID: request.ExperimentRunID,
		Type:            ports.ExperimentProgressCancelled,
		Status:          ports.ExperimentRunStatusCancelled,
		OccurredAt:      r.now(),
		Summary:         map[string]any{"cancelled": true},
	}
	if r.writer != nil {
		if err := r.writer.UpdateExperimentProgress(ctx, progress); err != nil {
			return CancelExperimentResult{}, err
		}
	}
	if r.publisher != nil {
		if err := r.publisher.PublishExperimentProgress(ctx, progress); err != nil {
			return CancelExperimentResult{}, err
		}
	}
	return CancelExperimentResult{ExperimentRunID: request.ExperimentRunID, Cancelled: true}, nil
}

func (r *Runner) HandlePersistedProjections(ctx context.Context, notification ports.PersistedProjectionNotification) error {
	if notification.RequestID == "" {
		return errors.New("requestId is required")
	}
	if notification.ProjectID == "" {
		return errors.New("projectId is required")
	}
	if notification.TraceID == "" {
		return errors.New("traceId is required")
	}
	if len(notification.ProjectionIDs) == 0 {
		return errors.New("projectionIds is required")
	}
	if len(notification.Kinds) == 0 {
		return errors.New("kinds is required")
	}
	if r.reader == nil {
		return errors.New("storage reader is required")
	}
	if r.writer == nil {
		return errors.New("storage writer is required")
	}
	matches, err := r.reader.ResolveOnlinePolicyMatches(ctx, ports.OnlinePolicyResolveRequest{
		RequestID:     notification.RequestID,
		ProjectID:     notification.ProjectID,
		TraceID:       notification.TraceID,
		ProjectionIDs: append([]string(nil), notification.ProjectionIDs...),
		SpanIDs:       append([]string(nil), notification.SpanIDs...),
		Kinds:         append([]string(nil), notification.Kinds...),
		PersistedAt:   notification.PersistedAt,
	})
	if err != nil {
		return err
	}
	for _, match := range matches.Matches {
		if err := r.handleOnlinePolicyMatch(ctx, match); err != nil {
			return err
		}
	}
	return nil
}

func (r *Runner) StartOptimization(ctx context.Context, request StartOptimizationRequest) (StartOptimizationResult, error) {
	if err := r.requireConfigured(); err != nil {
		return StartOptimizationResult{}, err
	}
	if request.ExperimentID == "" {
		return StartOptimizationResult{}, errors.New("experimentId is required")
	}
	if request.OptimizerKind == "" {
		return StartOptimizationResult{}, errors.New("optimizerKind is required")
	}
	if request.BasePromptVersionID == "" {
		return StartOptimizationResult{}, errors.New("basePromptVersionId is required")
	}

	runID := r.idGenerator()
	manifest, err := r.resolveManifest(ctx, ports.ManifestResolveRequest{
		ExperimentRunID: runID,
		ExperimentID:    request.ExperimentID,
		OptimizerKind:   request.OptimizerKind,
	})
	if err != nil {
		return StartOptimizationResult{}, err
	}
	if manifest.Digest != "" {
		if err := rejectHoldoutOptimization(manifest); err != nil {
			return StartOptimizationResult{}, err
		}
		if err := r.enforceProjectBudget(ctx, request.ProjectID, manifest); err != nil {
			return StartOptimizationResult{}, err
		}
	}
	if err := r.publishProgress(ctx, runID, ports.ExperimentProgressStarted, "", ports.ExperimentRunStatusRunning, map[string]any{"experimentId": request.ExperimentID}); err != nil {
		return StartOptimizationResult{}, err
	}
	result, err := r.harness.Optimize(ctx, ports.HarnessOptimizeRequest{
		ExperimentRunID:     runID,
		BasePromptVersionID: request.BasePromptVersionID,
		OptimizerKind:       request.OptimizerKind,
		Config:              request.Config,
		TraceContext:        request.TraceContext,
	})
	if err != nil {
		return StartOptimizationResult{}, r.failRun(ctx, runID, err)
	}
	if err := r.publishProgress(ctx, runID, ports.ExperimentProgressFinished, "", ports.ExperimentRunStatusFinished, result.Summary); err != nil {
		return StartOptimizationResult{}, err
	}
	return StartOptimizationResult{
		ExperimentRunID:    runID,
		CandidatePromptIDs: result.CandidatePromptIDs,
		Summary:            result.Summary,
	}, nil
}

func (r *Runner) scoreDatasetItemRun(ctx context.Context, scorer ports.Scorer, item ports.DatasetItem, itemRun ports.DatasetItemRun, traceContext map[string]string) (ports.EvalResult, error) {
	result := ports.EvalResult{
		ScorerID:      scorer.ID,
		ScorerVersion: scorer.Version,
		TargetKind:    ports.EvalTargetKindDatasetItemRun,
		TargetID:      itemRun.ID,
	}
	if scorer.Kind == ports.ScorerKindDeterministic {
		score, err := scoring.ExactJSONScorer{}.Score(item.Expected, itemRun.Output)
		if err != nil {
			return ports.EvalResult{}, err
		}
		result.Score = score.Score
		result.Passed = score.Passed
		result.Evidence = map[string]any{"scorer": "exact_json"}
		return result, nil
	}

	score, err := r.harness.Score(ctx, ports.HarnessScoreRequest{
		ScorerID:      scorer.ID,
		ScorerVersion: scorer.Version,
		TargetKind:    ports.EvalTargetKindDatasetItemRun,
		TargetID:      itemRun.ID,
		Input:         item.Input,
		Output:        itemRun.Output,
		Expected:      item.Expected,
		TraceContext:  traceContext,
	})
	if err != nil {
		return ports.EvalResult{}, err
	}
	result.Score = score.Score
	result.Passed = score.Passed
	result.Evidence = score.Evidence
	result.JudgeRunRef = score.JudgeRunRef
	return result, nil
}

func (r *Runner) handleOnlinePolicyMatch(ctx context.Context, match ports.OnlinePolicyMatch) error {
	for _, scorerRef := range match.ScorerRefs {
		if match.SampleRate <= 0 {
			if err := r.persistOnlineSkippedResult(ctx, match, scorerRef, "ERR-AIE-004"); err != nil {
				return err
			}
			continue
		}
		if scorerRef.Kind != ports.ScorerKindDeterministic {
			if err := r.persistOnlineSkippedResult(ctx, match, scorerRef, "ERR-AIE-002"); err != nil {
				return err
			}
			continue
		}
		scorers, err := r.reader.SearchScorers(ctx, []string{scorerRef.ScorerID})
		if err != nil {
			return err
		}
		scorer, ok := findScorerVersion(scorers, scorerRef)
		if !ok || scorer.Kind != ports.ScorerKindDeterministic {
			if err := r.persistOnlineSkippedResult(ctx, match, scorerRef, "ERR-AIE-002"); err != nil {
				return err
			}
			continue
		}
		score, err := scoring.DefinitionScorer{}.Score(scorer.Definition, onlineProjectionScoringValue(match.Projection))
		if err != nil {
			if err := r.persistOnlineSkippedResult(ctx, match, scorerRef, "ERR-AIE-002"); err != nil {
				return err
			}
			continue
		}
		result := ports.EvalResult{
			ID:            r.idGenerator(),
			ScorerID:      scorer.ID,
			ScorerVersion: scorer.Version,
			TargetKind:    onlineTargetKind(match.Projection.Kind),
			TargetID:      match.Projection.ProjectionID,
			Score:         score.Score,
			Passed:        score.Passed,
			ProducedAt:    r.now(),
			Evidence: map[string]any{
				"online":        true,
				"policyId":      match.PolicyID,
				"policyVersion": match.PolicyVersion,
				"policyName":    match.PolicyName,
			},
		}
		if err := r.persistOnlineEvalResult(ctx, result); err != nil {
			return err
		}
	}
	return nil
}

func (r *Runner) persistOnlineSkippedResult(ctx context.Context, match ports.OnlinePolicyMatch, scorerRef ports.OnlinePolicyScorerRef, reason string) error {
	result := ports.EvalResult{
		ID:            r.idGenerator(),
		ScorerID:      scorerRef.ScorerID,
		ScorerVersion: scorerRef.ScorerVersion,
		TargetKind:    onlineTargetKind(match.Projection.Kind),
		TargetID:      match.Projection.ProjectionID,
		Score:         0,
		Passed:        false,
		ProducedAt:    r.now(),
		Evidence: map[string]any{
			"online":        true,
			"status":        "skipped",
			"reason":        reason,
			"policyId":      match.PolicyID,
			"policyVersion": match.PolicyVersion,
			"policyName":    match.PolicyName,
		},
	}
	return r.persistOnlineEvalResult(ctx, result)
}

func (r *Runner) persistOnlineEvalResult(ctx context.Context, result ports.EvalResult) error {
	resultKey, err := idempotency.EvalResultKey(result.TargetKind, result.TargetID, result.ScorerID, result.ScorerVersion)
	if err != nil {
		return err
	}
	return r.writer.PersistEvalResult(ctx, resultKey, result)
}

func findScorerVersion(scorers []ports.Scorer, ref ports.OnlinePolicyScorerRef) (ports.Scorer, bool) {
	for _, scorer := range scorers {
		if scorer.ID == ref.ScorerID && scorer.Version == ref.ScorerVersion {
			return scorer, true
		}
	}
	return ports.Scorer{}, false
}

func onlineTargetKind(kind string) string {
	switch kind {
	case "span", "llm_call", "tool_call", "retrieval_event":
		return ports.EvalTargetKindSpan
	default:
		return ports.EvalTargetKindAgentRun
	}
}

func onlineProjectionScoringValue(projection ports.OnlinePolicyProjection) map[string]any {
	value := map[string]any{
		"projectId":      projection.ProjectID,
		"traceId":        projection.TraceID,
		"spanId":         projection.SpanID,
		"projectionId":   projection.ProjectionID,
		"kind":           projection.Kind,
		"safeAttributes": projection.SafeAttributes,
	}
	putOnlineScoringString(value, "agentId", projection.AgentID)
	putOnlineScoringString(value, "agentName", projection.AgentName)
	putOnlineScoringString(value, "environment", projection.Environment)
	putOnlineScoringString(value, "serviceName", projection.ServiceName)
	putOnlineScoringString(value, "route", projection.Route)
	putOnlineScoringString(value, "toolName", projection.ToolName)
	putOnlineScoringString(value, "retrievalSource", projection.RetrievalSource)
	putOnlineScoringString(value, "model", projection.Model)
	putOnlineScoringString(value, "promptVersionId", projection.PromptVersionID)
	putOnlineScoringString(value, "experimentRunId", projection.ExperimentRunID)
	return value
}

func putOnlineScoringString(values map[string]any, key string, value string) {
	if value != "" {
		values[key] = value
	}
}

func (r *Runner) loadExperiment(ctx context.Context, experimentID string) (ports.Experiment, error) {
	experiments, err := r.reader.SearchExperiments(ctx, experimentID)
	if err != nil {
		return ports.Experiment{}, err
	}
	for _, experiment := range experiments {
		if experiment.ID == experimentID {
			return experiment, nil
		}
	}
	return ports.Experiment{}, fmt.Errorf("experiment %q not found", experimentID)
}

func (r *Runner) resolveManifest(ctx context.Context, request ports.ManifestResolveRequest) (ports.ExperimentManifest, error) {
	if r.reader == nil {
		return ports.ExperimentManifest{}, errors.New("storage reader is not configured")
	}
	return r.reader.ResolveManifest(ctx, request)
}

func (r *Runner) enforceProjectBudget(ctx context.Context, projectID string, manifest ports.ExperimentManifest) error {
	if boolSetting(manifest.Budget, "exhausted") || boolSetting(manifest.Budget, "budgetExhausted") {
		return errors.New("ERR-AIE-004: evaluation budget exhausted")
	}
	if projectID != "" && r.control != nil {
		settings, err := r.control.GetProjectAISettings(ctx, projectID)
		if err != nil {
			return err
		}
		if boolSetting(settings.Budget, "exhausted") || boolSetting(settings.Budget, "budgetExhausted") {
			return errors.New("ERR-AIE-004: evaluation budget exhausted")
		}
	}
	return nil
}

func rejectHoldoutOptimization(manifest ports.ExperimentManifest) error {
	for _, split := range manifest.SplitSelector.Splits {
		if split == "holdout" {
			return errors.New("ERR-AIE-002: holdout split cannot be used for optimization")
		}
	}
	return nil
}

func boolSetting(values map[string]any, key string) bool {
	value, ok := values[key]
	if !ok || value == nil {
		return false
	}
	typed, _ := value.(bool)
	return typed
}

func (r *Runner) finishRun(ctx context.Context, run ports.ExperimentRun, status string, completedItems int, totalItems int) (ports.ExperimentRun, error) {
	run.Status = status
	run.EndedAt = r.now()
	run.Summary = map[string]any{"totalItems": totalItems, "completedItems": completedItems}
	progressType := ports.ExperimentProgressFinished
	if status == ports.ExperimentRunStatusCancelled {
		progressType = ports.ExperimentProgressCancelled
	}
	if err := r.writer.PersistExperimentRun(ctx, run); err != nil {
		return ports.ExperimentRun{}, err
	}
	if err := r.publishProgress(ctx, run.ID, progressType, "", status, run.Summary); err != nil {
		return ports.ExperimentRun{}, err
	}
	return run, nil
}

func (r *Runner) failRun(ctx context.Context, experimentRunID string, cause error) error {
	_ = r.publishProgress(ctx, experimentRunID, ports.ExperimentProgressFailed, "", ports.ExperimentRunStatusFailed, map[string]any{"error": cause.Error()})
	return cause
}

func (r *Runner) publishProgress(ctx context.Context, runID string, progressType string, itemRunID string, status string, summary map[string]any) error {
	progress := ports.ExperimentProgress{
		ExperimentRunID:  runID,
		Type:             progressType,
		Status:           status,
		DatasetItemRunID: itemRunID,
		OccurredAt:       r.now(),
		Summary:          summary,
	}
	if err := r.writer.UpdateExperimentProgress(ctx, progress); err != nil {
		return err
	}
	return r.publisher.PublishExperimentProgress(ctx, progress)
}

func (r *Runner) isCancelled(experimentRunID string) bool {
	return r.cancellations[experimentRunID]
}

func (r *Runner) requireConfigured() error {
	if r.reader == nil {
		return errors.New("storage reader is required")
	}
	if r.writer == nil {
		return errors.New("storage writer is required")
	}
	if r.harness == nil {
		return errors.New("harness adapter is required")
	}
	if r.publisher == nil {
		return errors.New("progress publisher is required")
	}
	return nil
}

func (r *Runner) now() string {
	return r.clock().UTC().Format(time.RFC3339Nano)
}

func defaultClock(clock func() time.Time) func() time.Time {
	if clock != nil {
		return clock
	}
	return time.Now
}

func defaultIDGenerator(generator func() string) func() string {
	if generator != nil {
		return generator
	}
	return func() string {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
}
