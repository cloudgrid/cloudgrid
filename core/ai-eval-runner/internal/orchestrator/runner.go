package orchestrator

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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
			itemRun.ActualOutputType = stringDefault(result.ActualOutputType, actualOutputType(output))
			itemRun.TraceID = stringDefault(result.TraceID, itemRun.TraceID)
			itemRun.RootSpanID = stringDefault(result.RootSpanID, itemRun.RootSpanID)
			itemRun.ConversationRef = result.ConversationRef
			itemRun.ImportantSteps = capImportantSteps(result.ImportantSteps)
			itemRun.TrajectorySummary = result.Summary
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
	if isMissingActualOutput(output) {
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
		exactJSONMetricResult(r.idGenerator(), itemRun, item.Expected, output, problems, r.now()),
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
