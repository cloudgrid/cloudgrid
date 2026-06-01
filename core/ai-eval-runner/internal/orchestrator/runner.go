package orchestrator

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"strings"
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
	ExternalAdapter   ports.ExternalAdapter
	ProgressPublisher ports.ProgressPublisher
	Clock             func() time.Time
	IDGenerator       func() string
}

type Runner struct {
	reader           ports.StorageReader
	writer           ports.StorageWriter
	control          ports.ControlPlane
	harness          ports.HarnessAdapter
	externalAdapter  ports.ExternalAdapter
	publisher        ports.ProgressPublisher
	clock            func() time.Time
	idGenerator      func() string
	cancellations    map[string]bool
	runStates        map[string]ports.ExperimentRun
	evaluationStates map[string]ports.EvaluationRun
	manifestDigests  map[string]string
	activeSandboxes  map[string][]ports.SandboxLifecycleRequest
}

type StartExperimentRequest struct {
	RequestID    string
	ProjectID    string
	ExperimentID string
	SolverRef    map[string]any
	RunPolicy    map[string]any
	TraceContext map[string]string
}

type StartExperimentResult struct {
	Run ports.ExperimentRun
}

type StartEvaluationRunRequest struct {
	RequestID               string
	ProjectID               string
	DatasetVersionID        string
	TargetSnapshotID        string
	IdempotencyKey          string
	EvaluationDefinitionID  string
	Kind                    string
	SelectedItemRevisionIDs []string
	SplitSelector           map[string]any
	MetricSettings          []map[string]any
	RunPolicy               map[string]any
	RetentionProfile        string
	RetentionRole           string
	TraceContext            map[string]string
}

type StartEvaluationRunResult struct {
	Run ports.EvaluationRun
}

type EvaluationRunControlRequest struct {
	RequestID       string
	ProjectID       string
	EvaluationRunID string
	IdempotencyKey  string
	Command         string
}

type EvaluationRunControlResult struct {
	Run ports.EvaluationRun
}

type CancelExperimentRequest struct {
	RequestID       string
	ExperimentRunID string
}

type CancelExperimentResult struct {
	ExperimentRunID string
	Cancelled       bool
}

type ExperimentRunControlRequest struct {
	RequestID              string
	ExperimentRunID        string
	Command                string
	ExpectedManifestDigest string
	IdempotencyKey         string
}

type ExperimentRunControlResult struct {
	Run ports.ExperimentRun
}

type StartOptimizationRequest struct {
	RequestID           string
	ProjectID           string
	DatasetVersionID    string
	TargetSnapshotID    string
	IdempotencyKey      string
	ExperimentID        string
	OptimizerKind       string
	BasePromptVersionID string
	Config              map[string]any
	RunPolicy           map[string]any
	TraceContext        map[string]string
}

type StartOptimizationResult struct {
	ExperimentRunID    string
	CandidatePromptIDs []string
	Summary            map[string]any
}

func NewRunner(config RunnerConfig) *Runner {
	return &Runner{
		reader:           config.StorageReader,
		writer:           config.StorageWriter,
		control:          config.ControlPlane,
		harness:          config.HarnessAdapter,
		externalAdapter:  config.ExternalAdapter,
		publisher:        config.ProgressPublisher,
		clock:            defaultClock(config.Clock),
		idGenerator:      defaultIDGenerator(config.IDGenerator),
		cancellations:    map[string]bool{},
		runStates:        map[string]ports.ExperimentRun{},
		evaluationStates: map[string]ports.EvaluationRun{},
		manifestDigests:  map[string]string{},
		activeSandboxes:  map[string][]ports.SandboxLifecycleRequest{},
	}
}

func (r *Runner) StartEvaluationRun(ctx context.Context, request StartEvaluationRunRequest) (StartEvaluationRunResult, error) {
	if err := r.requireConfigured(); err != nil {
		return StartEvaluationRunResult{}, err
	}
	if request.ProjectID == "" {
		return StartEvaluationRunResult{}, errors.New("projectId is required")
	}
	if request.DatasetVersionID == "" {
		return StartEvaluationRunResult{}, errors.New("datasetVersionId is required")
	}
	if request.TargetSnapshotID == "" {
		return StartEvaluationRunResult{}, errors.New("targetSnapshotId is required")
	}
	if request.IdempotencyKey == "" {
		return StartEvaluationRunResult{}, errors.New("idempotencyKey is required")
	}
	datasetVersion, err := r.reader.GetDatasetVersion(ctx, request.DatasetVersionID)
	if err != nil {
		return StartEvaluationRunResult{}, err
	}
	targetSnapshot, err := r.reader.GetTargetSnapshot(ctx, request.TargetSnapshotID)
	if err != nil {
		return StartEvaluationRunResult{}, err
	}
	projectSettings, err := r.projectAISettings(ctx, request.ProjectID)
	if err != nil {
		return StartEvaluationRunResult{}, err
	}
	if boolSetting(projectSettings.Budget, "exhausted") || boolSetting(projectSettings.Budget, "budgetExhausted") {
		return StartEvaluationRunResult{}, errors.New("ERR-AIE-004: evaluation budget exhausted")
	}
	providerProfileRefs := providerProfileRefsForTarget(targetSnapshot, projectSettings, "default")
	selectedRevisionIDs := selectedItemRevisionIDs(request.SelectedItemRevisionIDs, datasetVersion.ItemRevisionIDs)
	items, err := r.reader.SearchDatasetItemRevisions(ctx, datasetVersion.ID, selectedRevisionIDs)
	if err != nil {
		return StartEvaluationRunResult{}, err
	}
	if len(items) == 0 {
		return StartEvaluationRunResult{}, errors.New("ERR-001 VALIDATION_FAILED: selected dataset version has no item revisions")
	}
	if err := validateReadyItemRevisions(items); err != nil {
		return StartEvaluationRunResult{}, err
	}

	runID := r.idGenerator()
	now := r.now()
	kind := stringDefault(request.Kind, ports.EvaluationRunKindDatasetEvaluation)
	retentionRole := stringDefault(request.RetentionRole, ports.EvaluationRetentionRoleBaseline)
	if kind == ports.EvaluationRunKindQuickShot {
		retentionRole = ports.EvaluationRetentionRoleQuickShot
	}
	run := ports.EvaluationRun{
		ID:                      runID,
		ProjectID:               request.ProjectID,
		EvaluationDefinitionID:  request.EvaluationDefinitionID,
		Kind:                    kind,
		Status:                  ports.ExperimentRunStatusRunning,
		DatasetID:               datasetVersion.DatasetID,
		DatasetVersionID:        datasetVersion.ID,
		DatasetDigest:           stringDefault(datasetVersion.Digest, stableDigest(datasetVersion.ItemRevisionIDs)),
		SelectedItemRevisionIDs: selectedRevisionIDs,
		SplitSelector:           mapDefault(request.SplitSelector, map[string]any{"splits": []any{"validation"}}),
		TargetSnapshotID:        targetSnapshot.ID,
		MetricSettingsSnapshot:  request.MetricSettings,
		RunPolicySnapshot:       mapDefault(request.RunPolicy, map[string]any{}),
		RetentionProfile:        stringDefault(request.RetentionProfile, ports.EvaluationRetentionProfileBalanced),
		RetentionRole:           retentionRole,
		StartedAt:               now,
		Summary:                 evaluationRunSummary(len(items), 0, 0, nil),
	}
	r.rememberEvaluationRun(run)
	_ = r.publishEvaluationProgress(ctx, run, nil, ports.ExperimentProgressStarted)

	itemRuns := make([]ports.EvaluationItemRun, 0, len(items))
	metricResults := make([]ports.MetricResult, 0, len(items)*2)
	completed := 0
	failed := 0
	for _, item := range items {
		if r.isCancelled(run.ID) {
			itemRuns = append(itemRuns, r.cancelledEvaluationItemRun(run, item, targetSnapshot))
			break
		}
		itemRun, itemMetrics := r.executeEvaluationItem(ctx, run, item, targetSnapshot, providerProfileRefs, request)
		if itemRun.Status == ports.EvaluationItemRunStatusCompleted {
			completed++
		} else {
			failed++
		}
		itemRuns = append(itemRuns, itemRun)
		metricResults = append(metricResults, itemMetrics...)
		_ = r.publishEvaluationProgress(ctx, run, &itemRun, ports.ExperimentProgressItemCompleted)
	}

	run.EndedAt = r.now()
	if r.isCancelled(run.ID) {
		run.Status = ports.ExperimentRunStatusCancelled
	} else if failed > 0 && completed == 0 {
		run.Status = ports.ExperimentRunStatusFailed
		run.Problem = map[string]any{"code": "internal_error", "message": "all evaluation items failed"}
	} else {
		run.Status = ports.ExperimentRunStatusFinished
	}
	run.Summary = evaluationRunSummary(len(items), completed, failed, metricResults)
	r.rememberEvaluationRun(run)
	if err := r.writer.PersistEvaluationResults(ctx, ports.EvaluationResultsPersist{
		ProjectID:        request.ProjectID,
		EvaluationRunID:  run.ID,
		IdempotencyKey:   request.IdempotencyKey,
		EvaluationRun:    run,
		ItemRuns:         itemRuns,
		MetricResults:    metricResults,
		MetricAggregates: []map[string]any{},
	}); err != nil {
		return StartEvaluationRunResult{}, err
	}
	finalEvent := ports.ExperimentProgressFinished
	if run.Status == ports.ExperimentRunStatusCancelled {
		finalEvent = ports.ExperimentProgressCancelled
	} else if run.Status == ports.ExperimentRunStatusFailed {
		finalEvent = ports.ExperimentProgressFailed
	}
	_ = r.publishEvaluationProgress(ctx, run, nil, finalEvent)
	return StartEvaluationRunResult{Run: run}, nil
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
	solverRef = normalizeSolverRef(solverRef)
	runPolicy := normalizeRunPolicy(mergePolicy(manifest.RunPolicy, request.RunPolicy))

	run := ports.ExperimentRun{
		ID:           candidateRunID,
		ExperimentID: experiment.ID,
		SolverRef:    solverRef,
		RunPolicy:    runPolicy,
		Status:       ports.ExperimentRunStatusRunning,
		StartedAt:    r.now(),
		Summary:      experimentRunSummary(len(items), 0, ports.ExperimentRunStatusRunning),
	}
	if err := r.writer.PersistExperimentRun(ctx, run); err != nil {
		return StartExperimentResult{}, err
	}
	r.rememberRun(run, manifest.Digest)
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

		sandbox, err := r.harness.StartSandbox(ctx, ports.SandboxLifecycleRequest{
			ExperimentRunID:     run.ID,
			DatasetItemID:       item.ID,
			AttemptID:           item.ID,
			ManifestDigest:      manifest.Digest,
			ProviderProfileRefs: manifest.ProviderProfileRefs,
			SandboxProfile:      ports.SandboxProfileEphemeralEvalItem,
			RunPolicy:           runPolicy,
			TraceContext:        request.TraceContext,
		})
		if err != nil {
			return StartExperimentResult{}, r.failRun(ctx, run.ID, err)
		}
		activeSandbox := ports.SandboxLifecycleRequest{
			ExperimentRunID:     run.ID,
			DatasetItemID:       item.ID,
			AttemptID:           item.ID,
			ManifestDigest:      manifest.Digest,
			ProviderProfileRefs: manifest.ProviderProfileRefs,
			SandboxProfile:      ports.SandboxProfileEphemeralEvalItem,
			SandboxRef:          sandbox.SandboxRef,
			RunPolicy:           runPolicy,
			TraceContext:        request.TraceContext,
		}
		r.trackSandbox(run.ID, activeSandbox)

		runResult, err := r.harness.Run(ctx, ports.HarnessRunRequest{
			ExperimentRunID:     run.ID,
			DatasetItemID:       item.ID,
			Input:               item.Input,
			SolverRef:           solverRef,
			ManifestDigest:      manifest.Digest,
			ProviderProfileRefs: manifest.ProviderProfileRefs,
			RunPolicy:           runPolicy,
			SandboxProfile:      ports.SandboxProfileEphemeralEvalItem,
			SandboxRef:          sandbox.SandboxRef,
			TraceContext:        request.TraceContext,
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
			result, err := r.scoreDatasetItemRun(ctx, scorer, item, itemRun, manifest.Digest, manifest.ProviderProfileRefs, runPolicy, ports.SandboxProfileEphemeralEvalItem, sandbox.SandboxRef, request.TraceContext)
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
		if _, err := r.harness.CleanupSandbox(ctx, activeSandbox); err != nil {
			return StartExperimentResult{}, r.failRun(ctx, run.ID, err)
		}
		r.untrackSandbox(run.ID, sandbox.SandboxRef)
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
	current := r.currentRun(request.ExperimentRunID)
	current.Status = ports.ExperimentRunStatusCancelled
	current.EndedAt = r.now()
	r.rememberRun(current, r.manifestDigests[request.ExperimentRunID])
	for _, sandbox := range r.activeSandboxes[request.ExperimentRunID] {
		_, _ = r.harness.AbortSandbox(ctx, sandbox)
	}
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

func (r *Runner) CancelEvaluationRun(ctx context.Context, request EvaluationRunControlRequest) (EvaluationRunControlResult, error) {
	if request.EvaluationRunID == "" {
		return EvaluationRunControlResult{}, errors.New("evaluationRunId is required")
	}
	r.cancellations[request.EvaluationRunID] = true
	current := r.currentEvaluationRun(request.EvaluationRunID, request.ProjectID)
	if isTerminalStatus(current.Status) {
		return EvaluationRunControlResult{Run: current}, nil
	}
	current.Status = ports.ExperimentRunStatusCancelled
	current.EndedAt = r.now()
	current.Summary = mapDefault(current.Summary, map[string]any{})
	current.Summary["cancelled"] = true
	r.rememberEvaluationRun(current)
	if r.writer != nil {
		if err := r.writer.PersistEvaluationResults(ctx, ports.EvaluationResultsPersist{ProjectID: current.ProjectID, EvaluationRunID: current.ID, IdempotencyKey: stringDefault(request.IdempotencyKey, request.RequestID), EvaluationRun: current}); err != nil {
			return EvaluationRunControlResult{}, err
		}
	}
	_ = r.publishEvaluationProgress(ctx, current, nil, ports.ExperimentProgressCancelled)
	return EvaluationRunControlResult{Run: current}, nil
}

func (r *Runner) PauseEvaluationRun(ctx context.Context, request EvaluationRunControlRequest) (EvaluationRunControlResult, error) {
	if request.EvaluationRunID == "" {
		return EvaluationRunControlResult{}, errors.New("evaluationRunId is required")
	}
	current := r.currentEvaluationRun(request.EvaluationRunID, request.ProjectID)
	if current.Status == ports.ExperimentRunStatusPaused || current.Status == ports.ExperimentRunStatusPausing {
		return EvaluationRunControlResult{Run: current}, nil
	}
	if isTerminalStatus(current.Status) {
		return EvaluationRunControlResult{}, errors.New("ERR-AIE-001: cannot pause terminal evaluation run")
	}
	current.Status = ports.ExperimentRunStatusPaused
	current.Summary = mapDefault(current.Summary, map[string]any{})
	current.Summary["control"] = "pause"
	r.rememberEvaluationRun(current)
	if r.writer != nil {
		if err := r.writer.PersistEvaluationResults(ctx, ports.EvaluationResultsPersist{ProjectID: current.ProjectID, EvaluationRunID: current.ID, IdempotencyKey: stringDefault(request.IdempotencyKey, request.RequestID), EvaluationRun: current}); err != nil {
			return EvaluationRunControlResult{}, err
		}
	}
	_ = r.publishEvaluationProgress(ctx, current, nil, ports.ExperimentProgressProgress)
	return EvaluationRunControlResult{Run: current}, nil
}

func (r *Runner) ResumeEvaluationRun(ctx context.Context, request EvaluationRunControlRequest) (EvaluationRunControlResult, error) {
	if request.EvaluationRunID == "" {
		return EvaluationRunControlResult{}, errors.New("evaluationRunId is required")
	}
	current := r.currentEvaluationRun(request.EvaluationRunID, request.ProjectID)
	if isTerminalStatus(current.Status) {
		return EvaluationRunControlResult{}, errors.New("ERR-AIE-001: cannot resume terminal evaluation run")
	}
	if current.Status == ports.ExperimentRunStatusRunning {
		return EvaluationRunControlResult{Run: current}, nil
	}
	current.Status = ports.ExperimentRunStatusRunning
	current.Summary = mapDefault(current.Summary, map[string]any{})
	current.Summary["control"] = "resume"
	r.rememberEvaluationRun(current)
	if r.writer != nil {
		if err := r.writer.PersistEvaluationResults(ctx, ports.EvaluationResultsPersist{ProjectID: current.ProjectID, EvaluationRunID: current.ID, IdempotencyKey: stringDefault(request.IdempotencyKey, request.RequestID), EvaluationRun: current}); err != nil {
			return EvaluationRunControlResult{}, err
		}
	}
	_ = r.publishEvaluationProgress(ctx, current, nil, ports.ExperimentProgressProgress)
	return EvaluationRunControlResult{Run: current}, nil
}

func (r *Runner) PauseExperimentRun(ctx context.Context, request ExperimentRunControlRequest) (ExperimentRunControlResult, error) {
	if request.ExperimentRunID == "" {
		return ExperimentRunControlResult{}, errors.New("experimentRunId is required")
	}
	current := r.currentRun(request.ExperimentRunID)
	if current.Status == ports.ExperimentRunStatusPaused || current.Status == ports.ExperimentRunStatusPausing {
		return ExperimentRunControlResult{Run: current}, nil
	}
	if isTerminalStatus(current.Status) {
		return ExperimentRunControlResult{}, errors.New("ERR-AIE-001: cannot pause terminal experiment run")
	}
	current.Status = ports.ExperimentRunStatusPausing
	current.Summary = map[string]any{"control": "pause"}
	for _, sandbox := range r.activeSandboxes[request.ExperimentRunID] {
		_, _ = r.harness.PauseSandbox(ctx, sandbox)
	}
	current.Status = ports.ExperimentRunStatusPaused
	r.rememberRun(current, r.manifestDigests[request.ExperimentRunID])
	if r.writer != nil {
		if err := r.writer.PersistExperimentRun(ctx, current); err != nil {
			return ExperimentRunControlResult{}, err
		}
		if err := r.writer.UpdateExperimentProgress(ctx, ports.ExperimentProgress{ExperimentRunID: current.ID, Type: ports.ExperimentProgressProgress, Status: current.Status, OccurredAt: r.now(), Summary: current.Summary}); err != nil {
			return ExperimentRunControlResult{}, err
		}
	}
	return ExperimentRunControlResult{Run: current}, nil
}

func (r *Runner) ResumeExperimentRun(ctx context.Context, request ExperimentRunControlRequest) (ExperimentRunControlResult, error) {
	if request.ExperimentRunID == "" {
		return ExperimentRunControlResult{}, errors.New("experimentRunId is required")
	}
	current := r.currentRun(request.ExperimentRunID)
	if isTerminalStatus(current.Status) {
		return ExperimentRunControlResult{}, errors.New("ERR-AIE-001: cannot resume terminal experiment run")
	}
	persistedDigest := r.manifestDigests[request.ExperimentRunID]
	if persistedDigest == "" && r.reader != nil {
		manifest, err := r.resolveManifest(ctx, ports.ManifestResolveRequest{ExperimentRunID: request.ExperimentRunID})
		if err != nil {
			return ExperimentRunControlResult{}, err
		}
		persistedDigest = manifest.Digest
		if persistedDigest != "" {
			r.manifestDigests[request.ExperimentRunID] = persistedDigest
		}
	}
	if request.ExpectedManifestDigest != "" && persistedDigest != "" && request.ExpectedManifestDigest != persistedDigest {
		return ExperimentRunControlResult{}, errors.New("ERR-AIE-002: stale manifest digest")
	}
	if current.Status == ports.ExperimentRunStatusRunning || current.Status == ports.ExperimentRunStatusResuming {
		return ExperimentRunControlResult{Run: current}, nil
	}
	current.Status = ports.ExperimentRunStatusResuming
	current.Summary = map[string]any{"control": "resume"}
	current.Status = ports.ExperimentRunStatusRunning
	r.rememberRun(current, persistedDigest)
	if r.writer != nil {
		if err := r.writer.PersistExperimentRun(ctx, current); err != nil {
			return ExperimentRunControlResult{}, err
		}
		if err := r.writer.UpdateExperimentProgress(ctx, ports.ExperimentProgress{ExperimentRunID: current.ID, Type: ports.ExperimentProgressProgress, Status: current.Status, OccurredAt: r.now(), Summary: current.Summary}); err != nil {
			return ExperimentRunControlResult{}, err
		}
	}
	return ExperimentRunControlResult{Run: current}, nil
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
	if request.TargetSnapshotID != "" {
		return r.startV2Optimization(ctx, request)
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
	runPolicy := normalizeRunPolicy(manifest.RunPolicy)
	sandbox, err := r.harness.StartSandbox(ctx, ports.SandboxLifecycleRequest{
		ExperimentRunID:     runID,
		CandidateID:         runID,
		AttemptID:           runID,
		ManifestDigest:      manifest.Digest,
		ProviderProfileRefs: manifest.ProviderProfileRefs,
		SandboxProfile:      ports.SandboxProfileEphemeralOptimizationCandidate,
		RunPolicy:           runPolicy,
		TraceContext:        request.TraceContext,
	})
	if err != nil {
		return StartOptimizationResult{}, r.failRun(ctx, runID, err)
	}
	result, err := r.harness.Optimize(ctx, ports.HarnessOptimizeRequest{
		ExperimentRunID:     runID,
		ExperimentID:        request.ExperimentID,
		BasePromptVersionID: request.BasePromptVersionID,
		OptimizerKind:       request.OptimizerKind,
		Config:              request.Config,
		ManifestDigest:      manifest.Digest,
		ProviderProfileRefs: manifest.ProviderProfileRefs,
		RunPolicy:           runPolicy,
		SandboxProfile:      ports.SandboxProfileEphemeralOptimizationCandidate,
		SandboxRef:          sandbox.SandboxRef,
		TraceContext:        request.TraceContext,
	})
	if err != nil {
		return StartOptimizationResult{}, r.failRun(ctx, runID, err)
	}
	if err := r.publishProgress(ctx, runID, ports.ExperimentProgressFinished, "", ports.ExperimentRunStatusFinished, result.Summary); err != nil {
		return StartOptimizationResult{}, err
	}
	_, _ = r.harness.CleanupSandbox(ctx, ports.SandboxLifecycleRequest{ExperimentRunID: runID, CandidateID: runID, AttemptID: runID, ManifestDigest: manifest.Digest, ProviderProfileRefs: manifest.ProviderProfileRefs, SandboxProfile: ports.SandboxProfileEphemeralOptimizationCandidate, SandboxRef: sandbox.SandboxRef, RunPolicy: runPolicy, TraceContext: request.TraceContext})
	return StartOptimizationResult{
		ExperimentRunID:    runID,
		CandidatePromptIDs: result.CandidatePromptIDs,
		Summary:            result.Summary,
	}, nil
}

func (r *Runner) startV2Optimization(ctx context.Context, request StartOptimizationRequest) (StartOptimizationResult, error) {
	if request.ProjectID == "" {
		return StartOptimizationResult{}, errors.New("projectId is required")
	}
	if request.TargetSnapshotID == "" {
		return StartOptimizationResult{}, errors.New("targetSnapshotId is required")
	}
	if request.IdempotencyKey == "" {
		return StartOptimizationResult{}, errors.New("idempotencyKey is required")
	}
	searchPolicy := objectMap(request.Config, "searchPolicy")
	if stringValueFromMap(searchPolicy, "optimizerKind") == "skill_text_edit" {
		return r.startSkillTextEditOptimization(ctx, request)
	}
	runID := r.idGenerator()
	now := r.now()
	runPolicy := mapDefault(request.RunPolicy, objectMap(request.Config, "runPolicy"))
	sandbox, err := r.harness.StartSandbox(ctx, ports.SandboxLifecycleRequest{
		ExperimentRunID:     runID,
		CandidateID:         runID,
		AttemptID:           runID,
		ManifestDigest:      stableDigest(request.Config),
		ProviderProfileRefs: stringRefsFromValue(request.Config["providerProfileRefs"]),
		SandboxProfile:      ports.SandboxProfileEphemeralOptimizationCandidate,
		RunPolicy:           runPolicy,
		TraceContext:        request.TraceContext,
	})
	if err != nil {
		return StartOptimizationResult{}, err
	}
	result, err := r.harness.Optimize(ctx, ports.HarnessOptimizeRequest{
		ExperimentRunID:     runID,
		ExperimentID:        stringValueFromMap(request.Config, "validationEvaluationDefinitionId"),
		BasePromptVersionID: request.TargetSnapshotID,
		OptimizerKind:       "critic_mutate_judge_pick",
		Config:              request.Config,
		ManifestDigest:      stableDigest(request.Config),
		ProviderProfileRefs: stringRefsFromValue(request.Config["providerProfileRefs"]),
		RunPolicy:           runPolicy,
		SandboxProfile:      ports.SandboxProfileEphemeralOptimizationCandidate,
		SandboxRef:          sandbox.SandboxRef,
		TraceContext:        request.TraceContext,
	})
	if err != nil {
		return StartOptimizationResult{}, err
	}
	_, _ = r.harness.CleanupSandbox(ctx, ports.SandboxLifecycleRequest{ExperimentRunID: runID, CandidateID: runID, AttemptID: runID, ManifestDigest: stableDigest(request.Config), ProviderProfileRefs: stringRefsFromValue(request.Config["providerProfileRefs"]), SandboxProfile: ports.SandboxProfileEphemeralOptimizationCandidate, SandboxRef: sandbox.SandboxRef, RunPolicy: runPolicy, TraceContext: request.TraceContext})
	endedAt := r.now()
	optimizationRun := map[string]any{
		"id":                               runID,
		"projectId":                        request.ProjectID,
		"status":                           ports.ExperimentRunStatusFinished,
		"baselineTargetSnapshotId":         request.TargetSnapshotID,
		"objective":                        objectMap(request.Config, "objective"),
		"trainingEvaluationDefinitionId":   stringValueFromMap(request.Config, "trainingEvaluationDefinitionId"),
		"trainingSplitSelector":            objectMap(request.Config, "trainingSplitSelector"),
		"validationEvaluationDefinitionId": stringValueFromMap(request.Config, "validationEvaluationDefinitionId"),
		"validationSplitSelector":          objectMap(request.Config, "validationSplitSelector"),
		"testEvaluationDefinitionId":       stringValueFromMap(request.Config, "testEvaluationDefinitionId"),
		"candidateTargetSnapshotIds":       result.CandidatePromptIDs,
		"causedEvaluationRunIds":           []string{},
		"quickShotPolicy":                  objectMap(request.Config, "quickShotPolicy"),
		"comparisonIds":                    []string{},
		"selectedCandidateSnapshotId":      firstString(result.CandidatePromptIDs),
		"budgetSnapshot":                   map[string]any{},
		"createdAt":                        now,
		"startedAt":                        now,
		"endedAt":                          endedAt,
		"summary":                          result.Summary,
	}
	if err := r.writer.PersistEvaluationResults(ctx, ports.EvaluationResultsPersist{
		ProjectID:       request.ProjectID,
		IdempotencyKey:  request.IdempotencyKey,
		OptimizationRun: optimizationRun,
	}); err != nil {
		return StartOptimizationResult{}, err
	}
	return StartOptimizationResult{
		ExperimentRunID:    runID,
		CandidatePromptIDs: result.CandidatePromptIDs,
		Summary:            result.Summary,
	}, nil
}

func (r *Runner) startSkillTextEditOptimization(ctx context.Context, request StartOptimizationRequest) (StartOptimizationResult, error) {
	if request.DatasetVersionID == "" {
		return StartOptimizationResult{}, errors.New("datasetVersionId is required")
	}
	runID := r.idGenerator()
	now := r.now()
	searchPolicy := objectMap(request.Config, "searchPolicy")
	skillPolicy := mapDefault(objectMap(searchPolicy, "skillPolicy"), defaultSkillPolicy())
	if splitSelectorContainsTest(objectMap(request.Config, "trainingSplitSelector")) || splitSelectorContainsTest(objectMap(searchPolicy, "trainingSplitSelector")) {
		return StartOptimizationResult{}, errors.New("ERR-001 VALIDATION_FAILED: test split cannot be used for skill optimizer reflection")
	}
	targetSnapshot, err := r.reader.GetTargetSnapshot(ctx, request.TargetSnapshotID)
	if err != nil {
		return StartOptimizationResult{}, err
	}
	skillPackage, err := skillPackageFromTargetSnapshot(targetSnapshot, skillPolicy)
	if err != nil {
		return StartOptimizationResult{}, err
	}
	if err := validateSkillPackagePreflight(skillPackage, skillPolicy); err != nil {
		return StartOptimizationResult{}, err
	}
	capabilities, err := r.harness.SkillCapabilities(ctx, request.TraceContext)
	if err != nil {
		return StartOptimizationResult{}, err
	}
	if !stringSliceContains(capabilities.SupportedOptimizerKinds, "skill_text_edit") {
		return StartOptimizationResult{}, errors.New("ERR-AIE-003: harness does not support skill_text_edit")
	}
	dryRun, err := r.harness.SkillRuntimeDryRun(ctx, ports.SkillRuntimeDryRunRequest{
		OptimizationRunID: runID,
		SkillPackage:      skillPackage,
		RuntimeMode:       stringDefault(stringValueFromMap(searchPolicy, "runtimeMode"), "managed_harness"),
		RuntimeProfileRef: stringValueFromMap(searchPolicy, "runtimeProfileRef"),
		ModelProfileRef:   stringValueFromMap(searchPolicy, "modelProfileRef"),
		ToolProfileRef:    stringValueFromMap(searchPolicy, "toolProfileRef"),
		FixtureRef:        stringValueFromMap(searchPolicy, "fixtureRef"),
		TraceContext:      request.TraceContext,
	})
	if err != nil {
		return StartOptimizationResult{}, err
	}
	if !dryRun.OK {
		return StartOptimizationResult{}, errors.New("ERR-AIE-003: skill runtime dry run failed")
	}
	datasetVersion, trainingItems, validationItems, err := r.loadSkillOptimizationItems(ctx, request)
	if err != nil {
		return StartOptimizationResult{}, err
	}
	trainingRun, trainingItemRuns, trainingMetrics, err := r.executeSkillEvaluationBatch(ctx, request, datasetVersion, targetSnapshot, trainingItems, ports.EvaluationRetentionRoleBaseline, ports.EvaluationRunKindDatasetEvaluation, stringValueFromMap(request.Config, "trainingEvaluationDefinitionId"), objectMap(request.Config, "trainingSplitSelector"), request.IdempotencyKey+":training")
	if err != nil {
		return StartOptimizationResult{}, err
	}
	trainingEvidence := optimizerEvidenceFromItemRuns(trainingItems, trainingItemRuns, trainingMetrics, requiresTrajectoryEvidence(mapDefault(request.RunPolicy, objectMap(request.Config, "runPolicy"))))
	reflections, err := r.collectSkillReflections(ctx, runID, "step-reflect", skillPackage, trainingEvidence, nil, request)
	if err != nil {
		return StartOptimizationResult{}, err
	}
	ranked, err := r.harness.SkillMergeRank(ctx, ports.SkillMergeRankRequest{
		OptimizationRunID: runID,
		StepID:            "step-rank",
		Proposals:         reflections,
		EditBudget:        intDefault(intValueFromMap(skillPolicy, "editBudget"), intDefault(intValueFromMap(searchPolicy, "editBudget"), 4)),
		TraceContext:      request.TraceContext,
	})
	if err != nil {
		return StartOptimizationResult{}, err
	}
	if len(ranked.RankedProposals) == 0 {
		return StartOptimizationResult{}, r.persistSkillOptimizationRun(ctx, request, runID, now, r.now(), targetSnapshot.ID, nil, "", map[string]any{"status": "skipped_no_edits", "trainingEvaluationRunId": trainingRun.ID})
	}
	currentPackage := skillPackage
	currentScore := metricAverage(trainingMetrics)
	bestScore := currentScore
	bestSnapshotID := targetSnapshot.ID
	bestDigest := skillPackage.ManifestDigest
	var candidateIDs []string
	var acceptedIDs []string
	var rejectedIDs []string
	var rejectedBuffer []ports.SkillEditProposal
	for index, proposal := range ranked.RankedProposals {
		stepID := r.idGenerator()
		stepStartedAt := r.now()
		candidatePackage, candidateDigest, validationProblem := applySkillProposal(currentPackage, proposal, skillPolicy)
		if validationProblem != nil {
			rejectedIDs = append(rejectedIDs, proposal.ID)
			rejectedBuffer = append(rejectedBuffer, proposal)
			if err := r.persistSkillOptimizationStep(ctx, request, runID, stepID, index+1, trainingRun.ID, currentPackage.ManifestDigest, "", "", "rejected", "failed_preflight", currentScore, 0, []ports.SkillEditProposal{proposal}, nil, []ports.SkillEditProposal{proposal}, validationProblem, stepStartedAt); err != nil {
				return StartOptimizationResult{}, err
			}
			continue
		}
		candidateSnapshot, err := r.writer.CreateTargetSnapshot(ctx, ports.TargetSnapshotCreateRequest{
			RequestID:      request.RequestID + ":" + stepID + ":target-snapshot",
			ProjectID:      request.ProjectID,
			TargetRef:      candidateTargetRef(targetSnapshot, candidateDigest),
			IdempotencyKey: request.IdempotencyKey + ":" + stepID + ":target-snapshot",
			Input:          candidateTargetSnapshotInput(targetSnapshot, candidatePackage, candidateDigest, stepID),
		})
		if err != nil {
			return StartOptimizationResult{}, err
		}
		if candidateSnapshot.ID == "" {
			candidateSnapshot.ID = "candidate-" + stepID
		}
		if candidateSnapshot.Digest == "" {
			candidateSnapshot.Digest = candidateDigest
		}
		candidateIDs = append(candidateIDs, candidateSnapshot.ID)
		validationRun, _, validationMetrics, err := r.executeSkillEvaluationBatch(ctx, request, datasetVersion, candidateSnapshotForRun(targetSnapshot, candidateSnapshot, candidatePackage, candidateDigest), validationItems, ports.EvaluationRetentionRoleValidation, ports.EvaluationRunKindOptimizationValidation, stringValueFromMap(request.Config, "validationEvaluationDefinitionId"), objectMap(request.Config, "validationSplitSelector"), request.IdempotencyKey+":"+stepID+":validation")
		if err != nil {
			return StartOptimizationResult{}, err
		}
		validationScore := metricAverage(validationMetrics)
		status := "rejected"
		gateDecision := "rejected"
		if validationScore > bestScore {
			status = "accepted"
			gateDecision = "accepted_new_best"
			bestScore = validationScore
			bestSnapshotID = candidateSnapshot.ID
			bestDigest = candidateDigest
			currentPackage = candidatePackage
			acceptedIDs = append(acceptedIDs, proposal.ID)
		} else {
			rejectedIDs = append(rejectedIDs, proposal.ID)
			rejectedBuffer = append(rejectedBuffer, proposal)
		}
		if err := r.persistSkillOptimizationStep(ctx, request, runID, stepID, index+1, validationRun.ID, skillPackage.ManifestDigest, candidateDigest, candidateSnapshot.ID, status, gateDecision, currentScore, validationScore, []ports.SkillEditProposal{proposal}, []ports.SkillEditProposal{proposal}, nil, nil, stepStartedAt); err != nil {
			return StartOptimizationResult{}, err
		}
	}
	slowUpdate, _ := r.harness.SkillSlowUpdate(ctx, ports.SkillSlowUpdateRequest{OptimizationRunID: runID, Epoch: 1, AcceptedProposalIDs: acceptedIDs, RejectedProposalIDs: rejectedIDs, TrainingSummary: map[string]any{"trainingEvaluationRunId": trainingRun.ID, "evidenceItems": len(trainingEvidence)}, TraceContext: request.TraceContext})
	metaMemory, _ := r.harness.SkillMetaMemory(ctx, ports.SkillMetaMemoryRequest{OptimizationRunID: runID, CurrentMemory: nil, AcceptedProposalIDs: acceptedIDs, RejectedProposalIDs: rejectedIDs, TraceContext: request.TraceContext})
	exportedRef := ""
	if boolDefault(skillPolicy["exportBestSkill"], true) && bestSnapshotID != targetSnapshot.ID {
		exportedRef = "skill-package://" + bestSnapshotID + "/" + bestDigest
	}
	if err := r.writer.PersistOptimizationMemory(ctx, ports.OptimizationMemoryPersistRequest{
		RequestID:         request.RequestID + ":skill-memory",
		ProjectID:         request.ProjectID,
		OptimizationRunID: runID,
		IdempotencyKey:    request.IdempotencyKey + ":skill-memory",
		Payload: map[string]any{
			"optimizationRunId":  runID,
			"projectId":          request.ProjectID,
			"rejectedEditBuffer": skillStepEditsPayload(rejectedBuffer),
			"slowUpdateContent":  strings.Join(slowUpdate.Guidance, "\n"),
			"metaMemoryContent":  stableJSON(metaMemory.Memory),
			"truncated":          len(rejectedBuffer) > 20,
			"updatedAt":          r.now(),
		},
	}); err != nil {
		return StartOptimizationResult{}, err
	}
	summary := map[string]any{
		"optimizerKind":               "skill_text_edit",
		"trainingEvaluationRunId":     trainingRun.ID,
		"candidateTargetSnapshotIds":  candidateIDs,
		"selectedCandidateSnapshotId": bestSnapshotID,
		"bestSkillDigest":             bestDigest,
		"exportedSkillContentRef":     exportedRef,
		"acceptedProposalIds":         acceptedIDs,
		"rejectedProposalIds":         rejectedIDs,
	}
	if err := r.persistSkillOptimizationRun(ctx, request, runID, now, r.now(), targetSnapshot.ID, candidateIDs, bestSnapshotID, summary); err != nil {
		return StartOptimizationResult{}, err
	}
	return StartOptimizationResult{ExperimentRunID: runID, CandidatePromptIDs: candidateIDs, Summary: summary}, nil
}

func (r *Runner) loadSkillOptimizationItems(ctx context.Context, request StartOptimizationRequest) (ports.DatasetVersion, []ports.DatasetItemRevision, []ports.DatasetItemRevision, error) {
	datasetVersion, err := r.reader.GetDatasetVersion(ctx, request.DatasetVersionID)
	if err != nil {
		return ports.DatasetVersion{}, nil, nil, err
	}
	items, err := r.reader.SearchDatasetItemRevisions(ctx, datasetVersion.ID, datasetVersion.ItemRevisionIDs)
	if err != nil {
		return ports.DatasetVersion{}, nil, nil, err
	}
	if err := validateReadyItemRevisions(items); err != nil {
		return ports.DatasetVersion{}, nil, nil, err
	}
	training := filterItemsForSplit(items, objectMap(request.Config, "trainingSplitSelector"), "training")
	validation := filterItemsForSplit(items, objectMap(request.Config, "validationSplitSelector"), "validation")
	if len(training) == 0 {
		return ports.DatasetVersion{}, nil, nil, errors.New("ERR-001 VALIDATION_FAILED: skill optimization requires training rows")
	}
	if len(validation) == 0 {
		return ports.DatasetVersion{}, nil, nil, errors.New("ERR-001 VALIDATION_FAILED: skill optimization requires validation rows")
	}
	return datasetVersion, training, validation, nil
}

func (r *Runner) executeSkillEvaluationBatch(ctx context.Context, request StartOptimizationRequest, datasetVersion ports.DatasetVersion, target ports.TargetSnapshot, items []ports.DatasetItemRevision, retentionRole string, kind string, evaluationDefinitionID string, splitSelector map[string]any, idempotencyKey string) (ports.EvaluationRun, []ports.EvaluationItemRun, []ports.MetricResult, error) {
	projectSettings, err := r.projectAISettings(ctx, request.ProjectID)
	if err != nil {
		return ports.EvaluationRun{}, nil, nil, err
	}
	providerProfileRefs := providerProfileRefsForTarget(target, projectSettings, "default")
	runID := r.idGenerator()
	now := r.now()
	selectedIDs := make([]string, 0, len(items))
	for _, item := range items {
		selectedIDs = append(selectedIDs, item.ID)
	}
	runPolicy := mapDefault(request.RunPolicy, objectMap(request.Config, "runPolicy"))
	if objective := objectMap(request.Config, "objective"); len(objective) > 0 {
		runPolicy = copyMap(runPolicy)
		runPolicy["objective"] = objective
	}
	run := ports.EvaluationRun{
		ID:                      runID,
		ProjectID:               request.ProjectID,
		EvaluationDefinitionID:  evaluationDefinitionID,
		Kind:                    kind,
		Status:                  ports.ExperimentRunStatusRunning,
		DatasetID:               datasetVersion.DatasetID,
		DatasetVersionID:        datasetVersion.ID,
		DatasetDigest:           stringDefault(datasetVersion.Digest, stableDigest(datasetVersion.ItemRevisionIDs)),
		SelectedItemRevisionIDs: selectedIDs,
		SplitSelector:           mapDefault(splitSelector, map[string]any{"splits": []any{items[0].Split}}),
		TargetSnapshotID:        target.ID,
		MetricSettingsSnapshot:  []map[string]any{},
		RunPolicySnapshot:       runPolicy,
		RetentionProfile:        ports.EvaluationRetentionProfileBalanced,
		RetentionRole:           retentionRole,
		StartedAt:               now,
		Summary:                 evaluationRunSummary(len(items), 0, 0, nil),
	}
	itemRuns := make([]ports.EvaluationItemRun, 0, len(items))
	metricResults := make([]ports.MetricResult, 0, len(items)*2)
	completed := 0
	failed := 0
	evalRequest := StartEvaluationRunRequest{RequestID: request.RequestID, ProjectID: request.ProjectID, DatasetVersionID: datasetVersion.ID, TargetSnapshotID: target.ID, IdempotencyKey: idempotencyKey, RunPolicy: runPolicy, TraceContext: request.TraceContext}
	for _, item := range items {
		itemRun, metrics := r.executeEvaluationItem(ctx, run, item, target, providerProfileRefs, evalRequest)
		if itemRun.Status == ports.EvaluationItemRunStatusCompleted {
			completed++
		} else {
			failed++
		}
		itemRuns = append(itemRuns, itemRun)
		metricResults = append(metricResults, metrics...)
	}
	run.EndedAt = r.now()
	if failed > 0 && completed == 0 {
		run.Status = ports.ExperimentRunStatusFailed
	} else {
		run.Status = ports.ExperimentRunStatusFinished
	}
	run.Summary = evaluationRunSummary(len(items), completed, failed, metricResults)
	if err := r.writer.PersistEvaluationResults(ctx, ports.EvaluationResultsPersist{ProjectID: request.ProjectID, EvaluationRunID: run.ID, IdempotencyKey: idempotencyKey, EvaluationRun: run, ItemRuns: itemRuns, MetricResults: metricResults, MetricAggregates: []map[string]any{}}); err != nil {
		return ports.EvaluationRun{}, nil, nil, err
	}
	return run, itemRuns, metricResults, nil
}

func (r *Runner) collectSkillReflections(ctx context.Context, runID string, stepID string, skillPackage ports.SkillPackageManifest, evidence []map[string]any, rejected []ports.SkillEditProposal, request StartOptimizationRequest) ([]ports.SkillEditProposal, error) {
	all := []ports.SkillEditProposal{}
	for _, kind := range []string{"failure", "success"} {
		result, err := r.harness.SkillReflect(ctx, ports.SkillReflectRequest{OptimizationRunID: runID, StepID: stepID + ":" + kind, ReflectionKind: kind, SkillPackage: skillPackage, Evidence: evidence, ContentPolicy: objectMap(request.Config, "contentPolicy"), RejectedEdits: rejected, TraceContext: request.TraceContext})
		if err != nil {
			return nil, err
		}
		all = append(all, result.Proposals...)
	}
	return dedupeSkillProposals(all), nil
}

func (r *Runner) persistSkillOptimizationStep(ctx context.Context, request StartOptimizationRequest, runID string, stepID string, stepNumber int, rolloutRunID string, baselineDigest string, candidateDigest string, candidateSnapshotID string, status string, gateDecision string, trainingScore float64, validationScore float64, proposed []ports.SkillEditProposal, selected []ports.SkillEditProposal, rejected []ports.SkillEditProposal, problem map[string]any, startedAt string) error {
	payload := map[string]any{
		"id":                     stepID,
		"optimizationRunId":      runID,
		"projectId":              request.ProjectID,
		"epoch":                  1,
		"step":                   stepNumber,
		"status":                 status,
		"rolloutEvaluationRunId": rolloutRunID,
		"baselineSkillDigest":    baselineDigest,
		"candidateSkillDigest":   candidateDigest,
		"proposedEdits":          skillStepEditsPayload(proposed),
		"selectedEdits":          skillStepEditsPayload(selected),
		"rejectedEditSummaries":  skillStepEditsPayload(rejected),
		"trainingScore":          trainingScore,
		"validationScore":        validationScore,
		"gateDecision":           gateDecision,
		"problem":                problem,
		"startedAt":              startedAt,
		"endedAt":                r.now(),
	}
	if candidateSnapshotID != "" {
		payload["candidateTargetSnapshotId"] = candidateSnapshotID
	}
	return r.writer.PersistOptimizationStep(ctx, ports.OptimizationStepPersistRequest{RequestID: request.RequestID + ":" + stepID + ":skill-step", ProjectID: request.ProjectID, OptimizationRunID: runID, StepID: stepID, IdempotencyKey: request.IdempotencyKey + ":" + stepID + ":skill-step", Payload: payload})
}

func (r *Runner) persistSkillOptimizationRun(ctx context.Context, request StartOptimizationRequest, runID string, startedAt string, endedAt string, baselineSnapshotID string, candidateIDs []string, selectedCandidateID string, summary map[string]any) error {
	optimizationRun := map[string]any{
		"id":                               runID,
		"projectId":                        request.ProjectID,
		"status":                           ports.ExperimentRunStatusFinished,
		"baselineTargetSnapshotId":         baselineSnapshotID,
		"objective":                        objectMap(request.Config, "objective"),
		"searchPolicy":                     objectMap(request.Config, "searchPolicy"),
		"trainingEvaluationDefinitionId":   stringValueFromMap(request.Config, "trainingEvaluationDefinitionId"),
		"trainingSplitSelector":            objectMap(request.Config, "trainingSplitSelector"),
		"validationEvaluationDefinitionId": stringValueFromMap(request.Config, "validationEvaluationDefinitionId"),
		"validationSplitSelector":          objectMap(request.Config, "validationSplitSelector"),
		"testEvaluationDefinitionId":       stringValueFromMap(request.Config, "testEvaluationDefinitionId"),
		"candidateTargetSnapshotIds":       candidateIDs,
		"causedEvaluationRunIds":           []string{},
		"quickShotPolicy":                  objectMap(request.Config, "quickShotPolicy"),
		"comparisonIds":                    []string{},
		"selectedCandidateSnapshotId":      selectedCandidateID,
		"budgetSnapshot":                   map[string]any{},
		"createdAt":                        startedAt,
		"startedAt":                        startedAt,
		"endedAt":                          endedAt,
		"summary":                          summary,
	}
	return r.writer.PersistEvaluationResults(ctx, ports.EvaluationResultsPersist{ProjectID: request.ProjectID, IdempotencyKey: request.IdempotencyKey + ":optimization-run", OptimizationRun: optimizationRun})
}

func (r *Runner) executeEvaluationItem(ctx context.Context, run ports.EvaluationRun, item ports.DatasetItemRevision, target ports.TargetSnapshot, providerProfileRefs []string, request StartEvaluationRunRequest) (ports.EvaluationItemRun, []ports.MetricResult) {
	startedAt := r.now()
	itemRunID := r.idGenerator()
	traceID := stringDefault(traceValue(request.TraceContext, "traceparent"), "trace-"+itemRunID)
	rootSpanID := "span-" + itemRunID
	itemRun := ports.EvaluationItemRun{
		ID:                    itemRunID,
		EvaluationRunID:       run.ID,
		DatasetItemID:         item.DatasetItemID,
		DatasetItemRevisionID: item.ID,
		TargetSnapshotID:      target.ID,
		Status:                ports.EvaluationItemRunStatusCompleted,
		ActualOutputType:      ports.EvaluationActualOutputTypeJSON,
		TraceID:               traceID,
		RootSpanID:            rootSpanID,
		Problems:              []map[string]any{},
		SummaryEvidenceRefs:   []map[string]any{{"kind": "trace", "id": traceID, "traceId": traceID, "spanId": rootSpanID}},
		ImportantSteps:        []map[string]any{},
		RetentionRole:         run.RetentionRole,
		StartedAt:             startedAt,
	}

	var output any
	var latencyMs float64
	var problems []map[string]any
	if isExternalTarget(target) && r.externalAdapter != nil {
		result, err := r.externalAdapter.RunEvaluationItem(ctx, ports.ExternalAdapterRunRequest{
			RequestID:       request.RequestID,
			IdempotencyKey:  request.IdempotencyKey + ":" + item.ID,
			EvaluationRunID: run.ID,
			ItemRevisionID:  item.ID,
			Input:           item.Input,
			TargetRef:       target.TargetRef,
			TraceContext:    request.TraceContext,
		})
		if err != nil {
			problems = append(problems, problemForError(err))
			itemRun.Status = ports.EvaluationItemRunStatusFailed
		} else {
			output = result.ActualOutput
			itemRun.ActualOutputRef = result.ActualOutputRef
			itemRun.ActualOutputType = stringDefault(result.ActualOutputType, actualOutputType(output))
			itemRun.TraceID = stringDefault(result.TraceID, itemRun.TraceID)
			itemRun.RootSpanID = stringDefault(result.RootSpanID, itemRun.RootSpanID)
			itemRun.ConversationRef = result.ConversationRef
			itemRun.SummaryEvidenceRefs = traceEvidenceRefs(itemRun.TraceID, itemRun.RootSpanID, result.TraceRefs, result.ArtifactRefs)
			traceEvidence, traceOK := r.waitForTraceEvidence(ctx, run.ProjectID, request.RequestID, itemRun.TraceID, itemRun.RootSpanID, traceLinkWait(run.RunPolicySnapshot))
			if traceOK {
				itemRun.ImportantSteps = capImportantSteps(traceEvidence.ImportantSteps)
				itemRun.TrajectorySummary = traceEvidence.TrajectorySummary
				itemRun.SummaryEvidenceRefs = append(itemRun.SummaryEvidenceRefs, traceEvidence.EvidenceRefs...)
				itemRun.SummaryEvidenceRefs = append(itemRun.SummaryEvidenceRefs, traceEvidence.ArtifactRefs...)
			} else if requiresTrajectoryEvidence(run.RunPolicySnapshot) {
				problems = append(problems, map[string]any{"code": ports.EvaluationProblemTraceEvidenceMissing, "message": "trace evidence is unavailable after the trace-link wait window"})
				itemRun.SummaryEvidenceRefs = append(itemRun.SummaryEvidenceRefs, map[string]any{"kind": "evaluation_item_run", "id": itemRun.ID, "excludedFromOptimizerReflection": true, "reason": "trace_evidence_missing"})
			}
			if itemRun.TrajectorySummary == "" {
				itemRun.TrajectorySummary = result.Summary
			}
			problems = append(problems, result.Problems...)
			latencyMs = result.LatencyMs
		}
	} else {
		result, err := r.harness.Run(ctx, ports.HarnessRunRequest{
			ExperimentRunID:     run.ID,
			DatasetItemID:       item.DatasetItemID,
			Input:               item.Input,
			SolverRef:           target.TargetRef,
			ManifestDigest:      target.Digest,
			ProviderProfileRefs: providerProfileRefs,
			RunPolicy:           run.RunPolicySnapshot,
			SandboxProfile:      ports.SandboxProfileEphemeralEvalItem,
			TraceContext:        request.TraceContext,
		})
		if err != nil {
			problems = append(problems, problemForError(err))
			itemRun.Status = ports.EvaluationItemRunStatusFailed
		} else {
			output = result.Output
			latencyMs = result.LatencyMs
			itemRun.ImportantSteps = []map[string]any{{
				"kind":          "model_call",
				"name":          "harness.run",
				"status":        "completed",
				"inputPreview":  previewJSON(item.Input),
				"outputPreview": previewJSON(result.Output),
				"spanRef":       map[string]any{"kind": "span", "id": itemRun.RootSpanID, "traceId": itemRun.TraceID, "spanId": itemRun.RootSpanID},
			}}
		}
	}
	if isMissingActualOutput(output) && itemRun.ActualOutputRef == "" {
		problems = append(problems, map[string]any{"code": ports.EvaluationProblemInvalidActualOutput, "message": "actual output is missing"})
		itemRun.Status = ports.EvaluationItemRunStatusFailed
	}
	if hasInvalidMetricSettings(run.MetricSettingsSnapshot) {
		problems = append(problems, map[string]any{"code": ports.EvaluationProblemMetricConfigInvalid, "message": "metric settings contain an invalid metric definition"})
		itemRun.Status = ports.EvaluationItemRunStatusFailed
	}
	itemRun.ActualOutput = output
	itemRun.ActualOutputType = stringDefault(itemRun.ActualOutputType, actualOutputType(output))
	itemRun.Problems = problems
	if itemRun.TrajectorySummary == "" {
		itemRun.TrajectorySummary = fmt.Sprintf("Executed target for dataset item revision %s with %d problem(s).", item.ID, len(problems))
	}
	itemRun.EndedAt = r.now()
	itemRun.SummaryGeneratedAt = itemRun.EndedAt
	itemRun.SummaryDigest = stableDigest(map[string]any{"summary": itemRun.TrajectorySummary, "problems": problems, "actualOutput": output})

	metrics := []ports.MetricResult{
		exactJSONMetricResult(r.idGenerator(), itemRun, item.Expected, output, metricBlockingProblems(problems), r.now()),
		latencyMetricResult(r.idGenerator(), itemRun, latencyMs, r.now()),
	}
	itemRun.MetricResultIDs = []string{metrics[0].ID, metrics[1].ID}
	return itemRun, metrics
}

func (r *Runner) scoreDatasetItemRun(ctx context.Context, scorer ports.Scorer, item ports.DatasetItem, itemRun ports.DatasetItemRun, manifestDigest string, providerProfileRefs []string, runPolicy map[string]any, sandboxProfile string, sandboxRef string, traceContext map[string]string) (ports.EvalResult, error) {
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
		ScorerID:            scorer.ID,
		ScorerVersion:       scorer.Version,
		TargetKind:          ports.EvalTargetKindDatasetItemRun,
		TargetID:            itemRun.ID,
		Input:               item.Input,
		Output:              itemRun.Output,
		Expected:            item.Expected,
		ManifestDigest:      manifestDigest,
		ProviderProfileRefs: providerProfileRefs,
		RunPolicy:           runPolicy,
		SandboxProfile:      sandboxProfile,
		SandboxRef:          sandboxRef,
		TraceContext:        traceContext,
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
		settings, err := r.projectAISettings(ctx, projectID)
		if err != nil {
			return err
		}
		if boolSetting(settings.Budget, "exhausted") || boolSetting(settings.Budget, "budgetExhausted") {
			return errors.New("ERR-AIE-004: evaluation budget exhausted")
		}
	}
	return nil
}

func (r *Runner) projectAISettings(ctx context.Context, projectID string) (ports.ProjectAISettings, error) {
	if projectID == "" || r.control == nil {
		return ports.ProjectAISettings{}, nil
	}
	return r.control.GetProjectAISettings(ctx, projectID)
}

func providerProfileRefsForTarget(target ports.TargetSnapshot, settings ports.ProjectAISettings, purpose string) []string {
	refs := stringRefsFromValue(target.Metadata["providerProfileRefs"])
	if len(refs) > 0 {
		return refs
	}
	if ref := stringValueFromMap(target.TargetRef, "providerProfileId"); ref != "" {
		return []string{ref}
	}
	if metadata := objectMap(target.TargetRef, "metadata"); len(metadata) > 0 {
		if refs := stringRefsFromValue(metadata["providerProfileRefs"]); len(refs) > 0 {
			return refs
		}
		if ref := stringValueFromMap(metadata, "providerProfileId"); ref != "" {
			return []string{ref}
		}
	}
	alias := firstNonEmptyString(
		stringValueFromMap(target.TargetRef, "modelAlias"),
		stringValueFromMap(target.TargetRef, "modelAliasId"),
		stringValueFromMap(objectMap(target.TargetRef, "metadata"), "modelAlias"),
		stringValueFromMap(objectMap(target.TargetRef, "metadata"), "modelAliasId"),
	)
	if alias != "" {
		if providerProfileID := providerProfileIDForAlias(settings.ModelAliases, alias, purpose); providerProfileID != "" {
			return []string{providerProfileID}
		}
	}
	if settings.DefaultProviderProfileID != "" {
		return []string{settings.DefaultProviderProfileID}
	}
	return nil
}

func providerProfileIDForAlias(aliases []map[string]any, alias string, purpose string) string {
	for _, item := range aliases {
		if stringValueFromMap(item, "id") == alias || stringValueFromMap(item, "name") == alias {
			return stringValueFromMap(item, "providerProfileId")
		}
	}
	for _, item := range aliases {
		if stringValueFromMap(item, "purpose") == purpose {
			return stringValueFromMap(item, "providerProfileId")
		}
	}
	return ""
}

func stringRefsFromValue(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if value, ok := item.(string); ok && value != "" {
				result = append(result, value)
			}
		}
		return result
	default:
		return nil
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func rejectHoldoutOptimization(manifest ports.ExperimentManifest) error {
	for _, split := range manifest.SplitSelector.Splits {
		if split == "holdout" {
			return errors.New("ERR-AIE-002: holdout split cannot be used for optimization")
		}
	}
	return nil
}

func defaultSkillPolicy() map[string]any {
	return map[string]any{
		"maxPackageBytes":    262144,
		"maxSkillBytes":      65536,
		"maxSkillTokens":     8000,
		"editBudget":         4,
		"editableFileGlobs":  []any{"SKILL.md", "references/**/*.md", "references/*.md", "examples/**/*.md", "examples/*.md"},
		"protectedFileGlobs": []any{"scripts/**", "**/*.lock", "**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.gif", "**/*.webp", "**/*.pdf", "**/*.zip", "**/*.tar", "**/*.gz"},
		"allowedEditOps":     []any{"append", "insert_after", "replace", "delete"},
		"exportBestSkill":    true,
		"allowScriptEdits":   false,
	}
}

func skillPackageFromTargetSnapshot(snapshot ports.TargetSnapshot, skillPolicy map[string]any) (ports.SkillPackageManifest, error) {
	skillParts := []map[string]any{}
	for _, part := range snapshot.Parts {
		if stringValueFromMap(part, "partKind") == "skill" || stringValueFromMap(part, "kind") == "skill" {
			skillParts = append(skillParts, part)
		}
	}
	if len(skillParts) == 0 {
		for _, source := range []map[string]any{objectMap(snapshot.Metadata, "skillPackage"), objectMap(snapshot.TargetRef, "skillPackage")} {
			if len(source) > 0 {
				skillParts = append(skillParts, map[string]any{"partKind": "skill", "manifest": source})
			}
		}
	}
	if len(skillParts) != 1 {
		return ports.SkillPackageManifest{}, errors.New("ERR-001 VALIDATION_FAILED: baseline target snapshot must contain exactly one skill package")
	}
	manifestMap := objectMap(skillParts[0], "manifest")
	if len(manifestMap) == 0 {
		manifestMap = objectMap(skillParts[0], "skillPackage")
	}
	if len(manifestMap) == 0 {
		manifestMap = skillParts[0]
	}
	manifest := ports.SkillPackageManifest{
		PackageRef:          stringValueFromMap(manifestMap, "packageRef"),
		Entrypoint:          stringDefault(stringValueFromMap(manifestMap, "entrypoint"), "SKILL.md"),
		ManifestDigest:      firstNonEmptyString(stringValueFromMap(manifestMap, "manifestDigest"), stringValueFromMap(skillParts[0], "digest"), snapshot.Digest),
		EditableFileGlobs:   stringRefsFromValue(firstNonNil(manifestMap["editableFileGlobs"], skillPolicy["editableFileGlobs"])),
		ProtectedFileGlobs:  stringRefsFromValue(firstNonNil(manifestMap["protectedFileGlobs"], skillPolicy["protectedFileGlobs"])),
		RuntimeRequirements: objectMap(manifestMap, "runtimeRequirements"),
	}
	for _, item := range mapArrayFromValue(manifestMap["files"]) {
		file := ports.SkillPackageFile{
			Path:     stringValueFromMap(item, "path"),
			Role:     stringValueFromMap(item, "role"),
			Digest:   stringValueFromMap(item, "digest"),
			ByteSize: intValueFromMap(item, "byteSize"),
			Content:  stringValueFromMap(item, "content"),
			Editable: boolValueFromMap(item, "editable"),
		}
		if file.Content == "" {
			file.Content = stringValueFromMap(item, "text")
		}
		manifest.Files = append(manifest.Files, file)
	}
	return manifest, nil
}

func validateSkillPackagePreflight(manifest ports.SkillPackageManifest, skillPolicy map[string]any) error {
	if manifest.Entrypoint != "SKILL.md" {
		return errors.New("ERR-001 VALIDATION_FAILED: skill package entrypoint must be SKILL.md")
	}
	if len(manifest.Files) == 0 {
		return errors.New("ERR-001 VALIDATION_FAILED: skill package file inventory is required")
	}
	hasEntrypoint := false
	totalBytes := 0
	editableFiles := 0
	for _, file := range manifest.Files {
		if file.Path == "" || file.Digest == "" {
			return errors.New("ERR-001 VALIDATION_FAILED: skill package file inventory is invalid")
		}
		if file.Path == "SKILL.md" {
			hasEntrypoint = true
		}
		totalBytes += maxInt(file.ByteSize, len(file.Content))
		if file.Editable || pathAllowed(file.Path, manifest.EditableFileGlobs) {
			editableFiles++
		}
	}
	if !hasEntrypoint {
		return errors.New("ERR-001 VALIDATION_FAILED: skill package is missing SKILL.md")
	}
	if editableFiles == 0 {
		return errors.New("ERR-001 VALIDATION_FAILED: skill package has no editable files")
	}
	if limit := intValueFromMap(skillPolicy, "maxPackageBytes"); limit > 0 && totalBytes > limit {
		return errors.New("ERR-001 VALIDATION_FAILED: skill package exceeds maxPackageBytes")
	}
	if limit := intValueFromMap(skillPolicy, "maxSkillBytes"); limit > 0 && optimizerVisibleSkillBytes(manifest) > limit {
		return errors.New("ERR-001 VALIDATION_FAILED: skill package exceeds maxSkillBytes")
	}
	return nil
}

func filterItemsForSplit(items []ports.DatasetItemRevision, selector map[string]any, fallback string) []ports.DatasetItemRevision {
	splits := stringRefsFromValue(selector["splits"])
	if len(splits) == 0 {
		splits = []string{fallback}
	}
	results := make([]ports.DatasetItemRevision, 0, len(items))
	for _, item := range items {
		if stringSliceContains(splits, item.Split) {
			results = append(results, item)
		}
	}
	return results
}

func splitSelectorContainsTest(selector map[string]any) bool {
	return stringSliceContains(stringRefsFromValue(selector["splits"]), "test")
}

func optimizerEvidenceFromItemRuns(items []ports.DatasetItemRevision, itemRuns []ports.EvaluationItemRun, metrics []ports.MetricResult, requireTrajectory bool) []map[string]any {
	itemsByID := map[string]ports.DatasetItemRevision{}
	for _, item := range items {
		if item.Split != "test" {
			itemsByID[item.ID] = item
		}
	}
	metricsByItemRun := map[string][]map[string]any{}
	for _, metric := range metrics {
		metricsByItemRun[metric.SubjectID] = append(metricsByItemRun[metric.SubjectID], metricResultMap(metric))
	}
	evidence := []map[string]any{}
	for _, run := range itemRuns {
		item, ok := itemsByID[run.DatasetItemRevisionID]
		if !ok {
			continue
		}
		if requireTrajectory && hasEvaluationProblemCode(run.Problems, ports.EvaluationProblemTraceEvidenceMissing) {
			continue
		}
		evidence = append(evidence, map[string]any{"itemRunId": run.ID, "split": item.Split, "actualOutput": run.ActualOutput, "expected": item.Expected, "metricResults": metricsByItemRun[run.ID], "importantSteps": run.ImportantSteps, "trajectorySummary": run.TrajectorySummary, "traceRefs": run.SummaryEvidenceRefs})
	}
	return evidence
}

func dedupeSkillProposals(proposals []ports.SkillEditProposal) []ports.SkillEditProposal {
	seen := map[string]bool{}
	result := []ports.SkillEditProposal{}
	for _, proposal := range proposals {
		key := proposal.ID
		if key == "" {
			key = stableDigest(proposal)
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, proposal)
	}
	return result
}

func applySkillProposal(manifest ports.SkillPackageManifest, proposal ports.SkillEditProposal, skillPolicy map[string]any) (ports.SkillPackageManifest, string, map[string]any) {
	if proposal.ProtectedFileViolation {
		return manifest, "", map[string]any{"code": "protected_file_edit", "message": "proposal edits a protected skill package file"}
	}
	next := cloneSkillPackage(manifest)
	for _, edit := range proposal.Edits {
		if !stringSliceContains(stringRefsFromValue(skillPolicy["allowedEditOps"]), edit.Op) {
			return manifest, "", map[string]any{"code": "edit_op_not_allowed", "message": "proposal uses an unsupported edit operation"}
		}
		if pathAllowed(edit.FilePath, manifest.ProtectedFileGlobs) || pathAllowed(edit.FilePath, stringRefsFromValue(skillPolicy["protectedFileGlobs"])) {
			return manifest, "", map[string]any{"code": "protected_file_edit", "message": "proposal edits a protected skill package file"}
		}
		index := skillFileIndex(next.Files, edit.FilePath)
		if index < 0 || !(next.Files[index].Editable || pathAllowed(edit.FilePath, manifest.EditableFileGlobs)) {
			return manifest, "", map[string]any{"code": "file_not_editable", "message": "proposal edits a non-editable skill package file"}
		}
		updated, ok := applySkillEdit(next.Files[index].Content, edit)
		if !ok {
			return manifest, "", map[string]any{"code": "edit_anchor_missing", "message": "proposal edit anchor was not found"}
		}
		next.Files[index].Content = updated
		next.Files[index].ByteSize = len(updated)
		next.Files[index].Digest = stableDigest(map[string]any{"path": next.Files[index].Path, "content": updated})
	}
	if limit := intValueFromMap(skillPolicy, "maxPackageBytes"); limit > 0 && skillPackageBytes(next) > limit {
		return manifest, "", map[string]any{"code": "package_too_large", "message": "candidate package exceeds maxPackageBytes"}
	}
	if limit := intValueFromMap(skillPolicy, "maxSkillBytes"); limit > 0 && optimizerVisibleSkillBytes(next) > limit {
		return manifest, "", map[string]any{"code": "skill_too_large", "message": "candidate skill exceeds maxSkillBytes"}
	}
	digest := stableDigest(skillPackagePayloadForDigest(next))
	next.ManifestDigest = digest
	return next, digest, nil
}

func applySkillEdit(current string, edit ports.SkillEditOperation) (string, bool) {
	switch edit.Op {
	case "append":
		return current + edit.Content, true
	case "replace":
		if edit.Anchor == "" {
			return edit.Content, true
		}
		if !strings.Contains(current, edit.Anchor) {
			return current, false
		}
		return strings.Replace(current, edit.Anchor, edit.Content, 1), true
	case "insert_after":
		if edit.Anchor == "" || !strings.Contains(current, edit.Anchor) {
			return current, false
		}
		return strings.Replace(current, edit.Anchor, edit.Anchor+edit.Content, 1), true
	case "delete":
		if edit.Anchor == "" || !strings.Contains(current, edit.Anchor) {
			return current, false
		}
		return strings.Replace(current, edit.Anchor, "", 1), true
	default:
		return current, false
	}
}

func candidateTargetRef(baseline ports.TargetSnapshot, digest string) map[string]any {
	ref := copyMap(baseline.TargetRef)
	ref["skillPackageDigest"] = digest
	return ref
}

func candidateTargetSnapshotInput(baseline ports.TargetSnapshot, manifest ports.SkillPackageManifest, digest string, stepID string) map[string]any {
	return map[string]any{"kind": stringDefault(baseline.Kind, "skill"), "name": stringDefault(baseline.Name, "skill target") + " candidate " + stepID, "version": baseline.Version + 1, "digest": digest, "parts": []any{map[string]any{"partKind": "skill", "kind": "skill", "digest": digest, "manifest": skillPackageMap(manifest)}}, "metadata": map[string]any{"baselineTargetSnapshotId": baseline.ID, "skillPackageDigest": digest}, "source": map[string]any{"kind": "optimization"}}
}

func candidateSnapshotForRun(baseline ports.TargetSnapshot, candidate ports.TargetSnapshot, manifest ports.SkillPackageManifest, digest string) ports.TargetSnapshot {
	if len(candidate.TargetRef) == 0 {
		candidate.TargetRef = candidateTargetRef(baseline, digest)
	}
	if candidate.Kind == "" {
		candidate.Kind = baseline.Kind
	}
	if len(candidate.Parts) == 0 {
		candidate.Parts = []map[string]any{{"partKind": "skill", "kind": "skill", "digest": digest, "manifest": skillPackageMap(manifest)}}
	}
	return candidate
}

func metricAverage(metrics []ports.MetricResult) float64 {
	total := 0.0
	count := 0
	for _, metric := range metrics {
		if metric.MetricID != "extraction.exact_json_match" {
			continue
		}
		if value, ok := metric.Payload["value"].(bool); ok {
			if value {
				total += 1
			}
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return total / float64(count)
}

func skillStepEditsPayload(proposals []ports.SkillEditProposal) []any {
	items := []any{}
	for _, proposal := range proposals {
		for _, edit := range proposal.Edits {
			items = append(items, map[string]any{
				"id":             proposal.ID,
				"op":             edit.Op,
				"filePath":       edit.FilePath,
				"target":         edit.Target,
				"contentPreview": capString(edit.Content, 2000),
				"rationale":      capString(proposal.Rationale, 2000),
				"sourceType":     proposal.Source,
				"supportCount":   proposal.SupportCount,
				"evidenceRefs":   skillEvidenceRefsPayload(proposal.EvidenceRefs),
			})
		}
	}
	return items
}

func skillEvidenceRefsPayload(refs []string) []any {
	items := make([]any, 0, len(refs))
	for _, ref := range refs {
		items = append(items, map[string]any{"kind": "optimizer_evidence", "id": ref})
	}
	return items
}

func cloneSkillPackage(manifest ports.SkillPackageManifest) ports.SkillPackageManifest {
	next := manifest
	next.EditableFileGlobs = append([]string(nil), manifest.EditableFileGlobs...)
	next.ProtectedFileGlobs = append([]string(nil), manifest.ProtectedFileGlobs...)
	next.RuntimeRequirements = copyMap(manifest.RuntimeRequirements)
	next.Files = append([]ports.SkillPackageFile(nil), manifest.Files...)
	return next
}

func skillFileIndex(files []ports.SkillPackageFile, filePath string) int {
	for index, file := range files {
		if file.Path == filePath {
			return index
		}
	}
	return -1
}

func skillPackageBytes(manifest ports.SkillPackageManifest) int {
	total := 0
	for _, file := range manifest.Files {
		total += maxInt(file.ByteSize, len(file.Content))
	}
	return total
}

func optimizerVisibleSkillBytes(manifest ports.SkillPackageManifest) int {
	total := 0
	for _, file := range manifest.Files {
		if file.Path == "SKILL.md" || file.Editable || pathAllowed(file.Path, manifest.EditableFileGlobs) {
			total += maxInt(file.ByteSize, len(file.Content))
		}
	}
	return total
}

func skillPackagePayloadForDigest(manifest ports.SkillPackageManifest) any {
	return skillPackageMap(manifest)
}

func skillPackageMap(manifest ports.SkillPackageManifest) map[string]any {
	files := make([]any, 0, len(manifest.Files))
	for _, file := range manifest.Files {
		files = append(files, map[string]any{"path": file.Path, "role": file.Role, "digest": file.Digest, "byteSize": file.ByteSize, "content": file.Content, "editable": file.Editable})
	}
	return map[string]any{"packageRef": manifest.PackageRef, "entrypoint": manifest.Entrypoint, "manifestDigest": manifest.ManifestDigest, "files": files, "editableFileGlobs": manifest.EditableFileGlobs, "protectedFileGlobs": manifest.ProtectedFileGlobs, "runtimeRequirements": manifest.RuntimeRequirements}
}

func pathAllowed(filePath string, globs []string) bool {
	for _, glob := range globs {
		if glob == "" {
			continue
		}
		if glob == filePath {
			return true
		}
		if ok, _ := path.Match(glob, filePath); ok {
			return true
		}
		if strings.Contains(glob, "**") {
			prefix := strings.Split(glob, "**")[0]
			suffix := strings.TrimPrefix(strings.Split(glob, "**")[1], "/")
			if strings.HasPrefix(filePath, prefix) && (suffix == "" || pathAllowed(filePath, []string{prefix + suffix, prefix + "*" + suffix})) {
				return true
			}
		}
	}
	return false
}

func mapArrayFromValue(value any) []map[string]any {
	switch typed := value.(type) {
	case []map[string]any:
		return append([]map[string]any(nil), typed...)
	case []any:
		result := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if row, ok := item.(map[string]any); ok {
				result = append(result, row)
			}
		}
		return result
	default:
		return nil
	}
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func boolValueFromMap(value map[string]any, key string) bool {
	if value == nil {
		return false
	}
	typed, _ := value[key].(bool)
	return typed
}

func boolDefault(value any, fallback bool) bool {
	if typed, ok := value.(bool); ok {
		return typed
	}
	return fallback
}

func stringSliceContains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func intValueFromMap(value map[string]any, key string) int {
	if value == nil {
		return 0
	}
	switch typed := value[key].(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return int(parsed)
	default:
		return 0
	}
}

func intDefault(value int, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func copyMap(values map[string]any) map[string]any {
	copied := map[string]any{}
	for key, value := range values {
		copied[key] = value
	}
	return copied
}

func stableJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}

func hasEvaluationProblemCode(problems []map[string]any, code string) bool {
	for _, problem := range problems {
		if problem["code"] == code {
			return true
		}
	}
	return false
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
	run.Summary = experimentRunSummary(totalItems, completedItems, status)
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

func normalizeSolverRef(value map[string]any) map[string]any {
	kind, _ := value["kind"].(string)
	name, _ := value["name"].(string)
	switch strings.TrimSpace(kind) {
	case "prompt", "agent", "workflow", "skill", "tool":
	default:
		kind = "agent"
	}
	if strings.TrimSpace(name) == "" {
		if id, _ := value["id"].(string); strings.TrimSpace(id) != "" {
			name = id
		} else {
			name = "local"
		}
	}
	normalized := map[string]any{}
	for key, entry := range value {
		normalized[key] = entry
	}
	normalized["kind"] = kind
	normalized["name"] = name
	return normalized
}

func normalizeRunPolicy(value map[string]any) map[string]any {
	normalized := map[string]any{}
	for key, entry := range value {
		normalized[key] = entry
	}
	if _, ok := normalized["maxParallelRequests"]; !ok {
		normalized["maxParallelRequests"] = 10
	}
	return normalized
}

func mergePolicy(resolved map[string]any, requested map[string]any) map[string]any {
	if len(resolved) == 0 {
		return requested
	}
	merged := map[string]any{}
	for key, value := range resolved {
		merged[key] = value
	}
	for key, value := range requested {
		merged[key] = value
	}
	return merged
}

func experimentRunSummary(totalItems int, completedItems int, status string) map[string]any {
	passed := completedItems
	errored := 0
	skipped := 0
	if status == ports.ExperimentRunStatusCancelled {
		skipped = totalItems - completedItems
		if skipped < 0 {
			skipped = 0
		}
	}
	if status == ports.ExperimentRunStatusFailed {
		passed = 0
		errored = totalItems - completedItems
		if errored < 1 {
			errored = 1
		}
	}
	return map[string]any{
		"itemCounts": map[string]any{
			"total":       totalItems,
			"passed":      passed,
			"failed":      0,
			"errored":     errored,
			"skipped":     skipped,
			"needsReview": 0,
			"quarantined": 0,
		},
		"scoreSummaries": []any{},
		"problemCounts": map[string]any{
			"modelQuality":   0,
			"itemQuality":    0,
			"scorerConfig":   0,
			"infrastructure": 0,
		},
		"budgetUsage": map[string]any{
			"inputTokens":  0,
			"outputTokens": 0,
			"totalTokens":  0,
			"estimatedUsd": 0,
		},
		"regressions": []any{},
	}
}

func evaluationRunSummary(totalItems int, completedItems int, failedItems int, metricResults []ports.MetricResult) map[string]any {
	problemCounts := evaluationProblemCounts(metricResults)
	return map[string]any{
		"itemCounts": map[string]any{
			"total":       totalItems,
			"queued":      0,
			"running":     0,
			"completed":   completedItems,
			"failed":      failedItems,
			"cancelled":   0,
			"quarantined": 0,
		},
		"metricAggregates": []any{},
		"problemCounts":    problemCounts,
		"budgetUsage": map[string]any{
			"inputTokens":  0,
			"outputTokens": 0,
			"totalTokens":  0,
			"estimatedUsd": 0,
		},
	}
}

func evaluationProblemCounts(results []ports.MetricResult) map[string]any {
	counts := map[string]any{
		"invalidActualOutput":   0,
		"invalidExpectedOutput": 0,
		"missingEvidence":       0,
		"adapterFailure":        0,
		"timeout":               0,
		"providerFailure":       0,
		"contentRedacted":       0,
		"notApplicable":         0,
		"metricConfigInvalid":   0,
		"internalError":         0,
	}
	for _, result := range problemMetricResults(results) {
		code, _ := result.Problem["code"].(string)
		switch code {
		case ports.EvaluationProblemInvalidActualOutput:
			counts["invalidActualOutput"] = counts["invalidActualOutput"].(int) + 1
		case ports.EvaluationProblemAdapterFailure:
			counts["adapterFailure"] = counts["adapterFailure"].(int) + 1
		case ports.EvaluationProblemTimeout:
			counts["timeout"] = counts["timeout"].(int) + 1
		case ports.EvaluationProblemMetricConfigInvalid:
			counts["metricConfigInvalid"] = counts["metricConfigInvalid"].(int) + 1
		default:
			counts["internalError"] = counts["internalError"].(int) + 1
		}
	}
	return counts
}

func exactJSONMetricResult(id string, itemRun ports.EvaluationItemRun, expected map[string]any, actual any, problems []map[string]any, producedAt string) ports.MetricResult {
	passed := len(problems) == 0 && reflectMaps(expected, actual)
	result := ports.MetricResult{
		ID:            id,
		MetricID:      "extraction.exact_json_match",
		MetricVersion: 1,
		Scope:         ports.EvaluationMetricScopeItemRun,
		SubjectID:     itemRun.ID,
		Family:        ports.EvaluationMetricFamilyExtraction,
		Payload:       map[string]any{"kind": "boolean", "value": passed},
		Unit:          ports.EvaluationMetricUnitNone,
		Direction:     ports.EvaluationMetricDirectionHigherIsBetter,
		EvidenceRefs:  []map[string]any{{"kind": "evaluation_item_run", "id": itemRun.ID}},
		Metadata:      map[string]any{"datasetItemRevisionId": itemRun.DatasetItemRevisionID},
		ProducedAt:    producedAt,
	}
	if len(problems) > 0 {
		result.Problem = problems[0]
	}
	return result
}

func latencyMetricResult(id string, itemRun ports.EvaluationItemRun, latencyMs float64, producedAt string) ports.MetricResult {
	return ports.MetricResult{
		ID:            id,
		MetricID:      "trajectory.duration_ms",
		MetricVersion: 1,
		Scope:         ports.EvaluationMetricScopeItemRun,
		SubjectID:     itemRun.ID,
		Family:        ports.EvaluationMetricFamilyTrajectory,
		Payload:       map[string]any{"kind": "number", "value": latencyMs},
		Unit:          ports.EvaluationMetricUnitMs,
		Direction:     ports.EvaluationMetricDirectionLowerIsBetter,
		EvidenceRefs:  []map[string]any{{"kind": "evaluation_item_run", "id": itemRun.ID}},
		Metadata:      map[string]any{},
		ProducedAt:    producedAt,
	}
}

func problemMetricResults(results []ports.MetricResult) []ports.MetricResult {
	filtered := []ports.MetricResult{}
	for _, result := range results {
		if len(result.Problem) > 0 {
			filtered = append(filtered, result)
		}
	}
	return filtered
}

func hasInvalidMetricSettings(settings []map[string]any) bool {
	for _, setting := range settings {
		metricID, _ := setting["metricId"].(string)
		if strings.TrimSpace(metricID) == "" {
			return true
		}
	}
	return false
}

func (r *Runner) cancelledEvaluationItemRun(run ports.EvaluationRun, item ports.DatasetItemRevision, target ports.TargetSnapshot) ports.EvaluationItemRun {
	now := r.now()
	id := r.idGenerator()
	return ports.EvaluationItemRun{
		ID:                    id,
		EvaluationRunID:       run.ID,
		DatasetItemID:         item.DatasetItemID,
		DatasetItemRevisionID: item.ID,
		TargetSnapshotID:      target.ID,
		Status:                ports.EvaluationItemRunStatusCancelled,
		ActualOutputType:      ports.EvaluationActualOutputTypeJSON,
		TraceID:               "trace-" + id,
		RootSpanID:            "span-" + id,
		MetricResultIDs:       []string{},
		Problems:              []map[string]any{},
		TrajectorySummary:     "Evaluation item was cancelled before target execution.",
		SummaryEvidenceRefs:   []map[string]any{},
		ImportantSteps:        []map[string]any{},
		SummaryDigest:         stableDigest(map[string]any{"status": "cancelled", "item": item.ID}),
		SummaryGeneratedAt:    now,
		RetentionRole:         run.RetentionRole,
		StartedAt:             now,
		EndedAt:               now,
	}
}

func selectedItemRevisionIDs(requested []string, versionIDs []string) []string {
	source := versionIDs
	if len(requested) > 0 {
		source = requested
	}
	ids := make([]string, 0, len(source))
	seen := map[string]bool{}
	for _, id := range source {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids
}

func validateReadyItemRevisions(items []ports.DatasetItemRevision) error {
	for _, item := range items {
		if item.CurationStatus != "" && item.CurationStatus != "ready" {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: dataset item revision %s is not ready", item.ID)
		}
		if len(item.Input) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: dataset item revision %s input is invalid", item.ID)
		}
	}
	return nil
}

func isExternalTarget(target ports.TargetSnapshot) bool {
	kind, _ := target.TargetRef["kind"].(string)
	if kind == "external_adapter" || kind == "external" {
		return true
	}
	if target.Kind == "external_adapter" {
		return true
	}
	_, hasURL := target.TargetRef["adapterUrl"].(string)
	return hasURL
}

func problemForError(err error) map[string]any {
	code := ports.EvaluationProblemAdapterFailure
	if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timeout") {
		code = ports.EvaluationProblemTimeout
	}
	return map[string]any{"code": code, "message": err.Error()}
}

func actualOutputType(value any) string {
	if _, ok := value.(string); ok {
		return ports.EvaluationActualOutputTypeText
	}
	return ports.EvaluationActualOutputTypeJSON
}

func isMissingActualOutput(value any) bool {
	if value == nil {
		return true
	}
	if actualMap, ok := value.(map[string]any); ok && actualMap == nil {
		return true
	}
	if actualSlice, ok := value.([]any); ok && actualSlice == nil {
		return true
	}
	return false
}

func capImportantSteps(steps []map[string]any) []map[string]any {
	if len(steps) > 20 {
		steps = steps[:20]
	}
	capped := make([]map[string]any, 0, len(steps))
	for _, step := range steps {
		next := map[string]any{}
		for key, value := range step {
			if key == "inputPreview" || key == "outputPreview" {
				if text, ok := value.(string); ok {
					next[key] = capString(text, 2000)
					continue
				}
			}
			next[key] = value
		}
		capped = append(capped, next)
	}
	return capped
}

func previewJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return capString(string(data), 2000)
}

func capString(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func reflectMaps(expected map[string]any, actual any) bool {
	actualMap, ok := actual.(map[string]any)
	if !ok {
		return false
	}
	expectedData, _ := json.Marshal(expected)
	actualData, _ := json.Marshal(actualMap)
	return string(expectedData) == string(actualData)
}

func stableDigest(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		data = []byte(fmt.Sprint(value))
	}
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func stringDefault(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func mapDefault(value map[string]any, fallback map[string]any) map[string]any {
	if len(value) == 0 {
		return fallback
	}
	return value
}

func objectMap(value map[string]any, key string) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	if nested, ok := value[key].(map[string]any); ok {
		return nested
	}
	return map[string]any{}
}

func stringValueFromMap(value map[string]any, key string) string {
	if value == nil {
		return ""
	}
	if text, ok := value[key].(string); ok {
		return strings.TrimSpace(text)
	}
	return ""
}

func floatValueFromMap(value map[string]any, key string) float64 {
	if value == nil {
		return 0
	}
	switch typed := value[key].(type) {
	case float64:
		return typed
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		parsed, _ := typed.Float64()
		return parsed
	default:
		return 0
	}
}

func firstString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func traceValue(values map[string]string, key string) string {
	if values == nil {
		return ""
	}
	return values[key]
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

func (r *Runner) publishEvaluationProgress(ctx context.Context, run ports.EvaluationRun, itemRun *ports.EvaluationItemRun, progressType string) error {
	if r.publisher == nil {
		return nil
	}
	progress := ports.ExperimentProgress{
		ProjectID:       run.ProjectID,
		EvaluationRunID: run.ID,
		Type:            progressType,
		Status:          run.Status,
		OccurredAt:      r.now(),
		Summary:         run.Summary,
		Run:             evaluationRunMap(run),
	}
	if itemRun != nil {
		progress.EvaluationItemRunID = itemRun.ID
		progress.ItemRun = evaluationItemRunMap(*itemRun)
	}
	return r.publisher.PublishEvaluationProgress(ctx, progress)
}

func (r *Runner) isCancelled(experimentRunID string) bool {
	return r.cancellations[experimentRunID]
}

func (r *Runner) rememberRun(run ports.ExperimentRun, manifestDigest string) {
	if run.ID == "" {
		return
	}
	r.runStates[run.ID] = run
	if manifestDigest != "" {
		r.manifestDigests[run.ID] = manifestDigest
	}
}

func (r *Runner) rememberEvaluationRun(run ports.EvaluationRun) {
	if run.ID == "" {
		return
	}
	r.evaluationStates[run.ID] = run
}

func (r *Runner) currentEvaluationRun(evaluationRunID string, projectID string) ports.EvaluationRun {
	if run, ok := r.evaluationStates[evaluationRunID]; ok {
		return run
	}
	return ports.EvaluationRun{
		ID:               evaluationRunID,
		ProjectID:        projectID,
		Kind:             ports.EvaluationRunKindDatasetEvaluation,
		Status:           ports.ExperimentRunStatusRunning,
		RetentionProfile: ports.EvaluationRetentionProfileBalanced,
		RetentionRole:    ports.EvaluationRetentionRoleBaseline,
		Summary:          map[string]any{},
	}
}

func evaluationRunMap(run ports.EvaluationRun) map[string]any {
	values := map[string]any{
		"id":                      run.ID,
		"projectId":               run.ProjectID,
		"kind":                    run.Kind,
		"status":                  run.Status,
		"datasetId":               run.DatasetID,
		"datasetVersionId":        run.DatasetVersionID,
		"datasetDigest":           run.DatasetDigest,
		"selectedItemRevisionIds": run.SelectedItemRevisionIDs,
		"splitSelector":           run.SplitSelector,
		"targetSnapshotId":        run.TargetSnapshotID,
		"metricSettingsSnapshot":  run.MetricSettingsSnapshot,
		"runPolicySnapshot":       run.RunPolicySnapshot,
		"retentionProfile":        run.RetentionProfile,
		"retentionRole":           run.RetentionRole,
		"startedAt":               run.StartedAt,
		"summary":                 run.Summary,
	}
	if run.EvaluationDefinitionID != "" {
		values["evaluationDefinitionId"] = run.EvaluationDefinitionID
	}
	if run.EndedAt != "" {
		values["endedAt"] = run.EndedAt
	}
	if len(run.Problem) > 0 {
		values["problem"] = run.Problem
	}
	return values
}

func evaluationItemRunMap(run ports.EvaluationItemRun) map[string]any {
	values := map[string]any{
		"id":                    run.ID,
		"evaluationRunId":       run.EvaluationRunID,
		"datasetItemId":         run.DatasetItemID,
		"datasetItemRevisionId": run.DatasetItemRevisionID,
		"targetSnapshotId":      run.TargetSnapshotID,
		"status":                run.Status,
		"actualOutput":          run.ActualOutput,
		"actualOutputRef":       run.ActualOutputRef,
		"actualOutputType":      run.ActualOutputType,
		"traceId":               run.TraceID,
		"rootSpanId":            run.RootSpanID,
		"metricResultIds":       run.MetricResultIDs,
		"problems":              run.Problems,
		"trajectorySummary":     run.TrajectorySummary,
		"summaryEvidenceRefs":   run.SummaryEvidenceRefs,
		"importantSteps":        run.ImportantSteps,
		"summaryDigest":         run.SummaryDigest,
		"summaryGeneratedAt":    run.SummaryGeneratedAt,
		"retentionRole":         run.RetentionRole,
		"startedAt":             run.StartedAt,
	}
	if run.ConversationRef != "" {
		values["conversationRef"] = run.ConversationRef
	}
	if run.EndedAt != "" {
		values["endedAt"] = run.EndedAt
	}
	return values
}

func metricResultMap(result ports.MetricResult) map[string]any {
	values := map[string]any{
		"id":            result.ID,
		"metricId":      result.MetricID,
		"metricVersion": result.MetricVersion,
		"scope":         result.Scope,
		"subjectId":     result.SubjectID,
		"family":        result.Family,
		"payload":       result.Payload,
		"unit":          result.Unit,
		"direction":     result.Direction,
		"evidenceRefs":  result.EvidenceRefs,
		"metadata":      result.Metadata,
		"producedAt":    result.ProducedAt,
	}
	if len(result.Problem) > 0 {
		values["problem"] = result.Problem
	}
	return values
}

func (r *Runner) waitForTraceEvidence(ctx context.Context, projectID string, requestID string, traceID string, rootSpanID string, wait time.Duration) (ports.TraceEvidence, bool) {
	if r.reader == nil || traceID == "" {
		return ports.TraceEvidence{}, false
	}
	deadline := time.Now().Add(wait)
	for {
		evidence, err := r.reader.GetTraceEvidence(ctx, ports.TraceEvidenceRequest{
			RequestID:  stringDefault(requestID, "trace-evidence"),
			ProjectID:  projectID,
			TraceID:    traceID,
			RootSpanID: rootSpanID,
		})
		if err == nil && (evidence.TrajectorySummary != "" || len(evidence.ImportantSteps) > 0 || len(evidence.EvidenceRefs) > 0) {
			return evidence, true
		}
		if wait <= 0 || !time.Now().Before(deadline) {
			return ports.TraceEvidence{}, false
		}
		timer := time.NewTimer(10 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ports.TraceEvidence{}, false
		case <-timer.C:
		}
	}
}

func traceLinkWait(runPolicy map[string]any) time.Duration {
	waitMs := floatValueFromMap(runPolicy, "traceLinkWaitMs")
	if waitMs <= 0 {
		waitMs = floatValueFromMap(runPolicy, "traceEvidenceWaitMs")
	}
	if waitMs <= 0 {
		return 0
	}
	return time.Duration(waitMs) * time.Millisecond
}

func requiresTrajectoryEvidence(runPolicy map[string]any) bool {
	if value, ok := runPolicy["requiresTrajectoryEvidence"].(bool); ok {
		return value
	}
	objective, _ := runPolicy["objective"].(map[string]any)
	if value, ok := objective["requiresTrajectoryEvidence"].(bool); ok {
		return value
	}
	minimumEvidence, _ := objective["minimumEvidence"].(map[string]any)
	if value, ok := minimumEvidence["trajectory"].(bool); ok {
		return value
	}
	return false
}

func traceEvidenceRefs(traceID string, rootSpanID string, traceRefs []map[string]any, artifactRefs []map[string]any) []map[string]any {
	refs := []map[string]any{{"kind": "trace", "id": traceID, "traceId": traceID, "spanId": rootSpanID}}
	refs = append(refs, traceRefs...)
	refs = append(refs, artifactRefs...)
	return refs
}

func metricBlockingProblems(problems []map[string]any) []map[string]any {
	blocking := make([]map[string]any, 0, len(problems))
	for _, problem := range problems {
		if problem["code"] == ports.EvaluationProblemTraceEvidenceMissing {
			continue
		}
		blocking = append(blocking, problem)
	}
	return blocking
}

func (r *Runner) currentRun(experimentRunID string) ports.ExperimentRun {
	if run, ok := r.runStates[experimentRunID]; ok {
		return run
	}
	return ports.ExperimentRun{ID: experimentRunID, Status: ports.ExperimentRunStatusRunning, Summary: map[string]any{}}
}

func (r *Runner) trackSandbox(experimentRunID string, sandbox ports.SandboxLifecycleRequest) {
	r.activeSandboxes[experimentRunID] = append(r.activeSandboxes[experimentRunID], sandbox)
}

func (r *Runner) untrackSandbox(experimentRunID string, sandboxRef string) {
	active := r.activeSandboxes[experimentRunID]
	remaining := active[:0]
	for _, sandbox := range active {
		if sandbox.SandboxRef != sandboxRef {
			remaining = append(remaining, sandbox)
		}
	}
	if len(remaining) == 0 {
		delete(r.activeSandboxes, experimentRunID)
		return
	}
	r.activeSandboxes[experimentRunID] = remaining
}

func isTerminalStatus(status string) bool {
	switch status {
	case ports.ExperimentRunStatusCancelled, ports.ExperimentRunStatusFailed, ports.ExperimentRunStatusFinished:
		return true
	default:
		return false
	}
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
