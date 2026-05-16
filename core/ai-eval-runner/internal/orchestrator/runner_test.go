package orchestrator

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/ports"
)

func TestStartOfflineExperimentRunsDatasetItemsAndPersistsDeterministicResults(t *testing.T) {
	reader := &fakeReader{
		experiments: []ports.Experiment{{
			ID:             "experiment-1",
			DatasetID:      "dataset-1",
			DatasetVersion: 2,
			ScorerIDs:      []string{"scorer-1"},
		}},
		items: []ports.DatasetItem{{
			ID:       "item-1",
			Input:    map[string]any{"question": "2+2"},
			Expected: map[string]any{"answer": "4"},
		}},
		scorers: []ports.Scorer{{
			ID:         "scorer-1",
			Kind:       ports.ScorerKindDeterministic,
			Definition: map[string]any{"type": "exact_json"},
			Version:    3,
		}},
	}
	writer := &fakeWriter{}
	harness := &fakeHarness{
		runResult: ports.HarnessRunResult{
			HarnessRunID: "harness-run-1",
			Output:       map[string]any{"answer": "4"},
			LatencyMs:    42,
		},
	}
	publisher := &fakePublisher{}
	runner := NewRunner(RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     writer,
		HarnessAdapter:    harness,
		ProgressPublisher: publisher,
		Clock:             fixedClock(time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)),
		IDGenerator:       sequenceIDs("run-1", "item-run-1", "eval-result-1"),
	})

	result, err := runner.StartOfflineExperiment(context.Background(), StartExperimentRequest{
		RequestID:    "request-1",
		ExperimentID: "experiment-1",
		SolverRef:    map[string]any{"adapter": "test-solver"},
		TraceContext: map[string]string{"traceparent": "00-test"},
	})

	if err != nil {
		t.Fatalf("StartOfflineExperiment returned error: %v", err)
	}
	if result.Run.ID != "run-1" || result.Run.Status != ports.ExperimentRunStatusFinished {
		t.Fatalf("unexpected run result: %#v", result.Run)
	}
	if !reflect.DeepEqual(reader.experimentSearches, []string{"experiment-1"}) {
		t.Fatalf("experiment lookup did not use storage-read subject semantics: %#v", reader.experimentSearches)
	}
	if !reflect.DeepEqual(reader.datasetSearches, []datasetSearch{{datasetID: "dataset-1", version: 2}}) {
		t.Fatalf("dataset lookup did not use storage-read subject semantics: %#v", reader.datasetSearches)
	}
	if !reflect.DeepEqual(reader.scorerSearches, [][]string{{"scorer-1"}}) {
		t.Fatalf("scorer lookup did not use storage-read subject semantics: %#v", reader.scorerSearches)
	}
	if len(harness.runRequests) != 1 {
		t.Fatalf("expected one harness run request, got %d", len(harness.runRequests))
	}
	if len(harness.scoreRequests) != 0 {
		t.Fatalf("deterministic scorer must execute locally, got harness score calls: %#v", harness.scoreRequests)
	}
	if len(writer.persistedRuns) != 1 {
		t.Fatalf("expected one dataset item run persist, got %d", len(writer.persistedRuns))
	}
	if writer.persistedRuns[0].key != "dataset_item_execution:experimentRunId=run-1:datasetItemId=item-1" {
		t.Fatalf("unexpected dataset item run idempotency key: %s", writer.persistedRuns[0].key)
	}
	if len(writer.persistedResults) != 1 {
		t.Fatalf("expected one eval result persist, got %d", len(writer.persistedResults))
	}
	if writer.persistedResults[0].key != "eval_result:targetKind=datasetItemRun:targetId=item-run-1:scorerId=scorer-1:scorerVersion=3" {
		t.Fatalf("unexpected eval result idempotency key: %s", writer.persistedResults[0].key)
	}
	if writer.persistedResults[0].result.Score != 1 || !writer.persistedResults[0].result.Passed {
		t.Fatalf("unexpected deterministic score: %#v", writer.persistedResults[0].result)
	}
	progressTypes := collectProgressTypes(publisher.progress)
	if !reflect.DeepEqual(progressTypes, []string{
		ports.ExperimentProgressStarted,
		ports.ExperimentProgressItemCompleted,
		ports.ExperimentProgressFinished,
	}) {
		t.Fatalf("unexpected published progress: %#v", progressTypes)
	}
}

func TestCancelOfflineExperimentStopsBeforeNextDatasetItem(t *testing.T) {
	reader := &fakeReader{
		experiments: []ports.Experiment{{
			ID:             "experiment-1",
			DatasetID:      "dataset-1",
			DatasetVersion: 1,
			ScorerIDs:      []string{"scorer-1"},
		}},
		items: []ports.DatasetItem{
			{ID: "item-1", Input: map[string]any{"n": float64(1)}, Expected: map[string]any{"n": float64(1)}},
			{ID: "item-2", Input: map[string]any{"n": float64(2)}, Expected: map[string]any{"n": float64(2)}},
		},
		scorers: []ports.Scorer{{ID: "scorer-1", Kind: ports.ScorerKindDeterministic, Version: 1}},
	}
	writer := &fakeWriter{}
	harness := &fakeHarness{
		runResult: ports.HarnessRunResult{HarnessRunID: "harness-run-1", Output: map[string]any{"n": float64(1)}, LatencyMs: 1},
		afterRun: func(r *Runner) {
			_, _ = r.CancelExperimentRun(context.Background(), CancelExperimentRequest{
				RequestID:       "cancel-request-1",
				ExperimentRunID: "run-1",
			})
		},
	}
	publisher := &fakePublisher{}
	runner := NewRunner(RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     writer,
		HarnessAdapter:    harness,
		ProgressPublisher: publisher,
		Clock:             fixedClock(time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)),
		IDGenerator:       sequenceIDs("run-1", "item-run-1", "eval-result-1"),
	})
	harness.runner = runner

	result, err := runner.StartOfflineExperiment(context.Background(), StartExperimentRequest{
		RequestID:    "request-1",
		ExperimentID: "experiment-1",
		SolverRef:    map[string]any{"adapter": "test-solver"},
	})

	if err != nil {
		t.Fatalf("StartOfflineExperiment returned error: %v", err)
	}
	if result.Run.Status != ports.ExperimentRunStatusCancelled {
		t.Fatalf("expected cancelled run, got %#v", result.Run)
	}
	if len(harness.runRequests) != 1 {
		t.Fatalf("expected cancellation before second item, got %d harness runs", len(harness.runRequests))
	}
	if last := publisher.progress[len(publisher.progress)-1]; last.Type != ports.ExperimentProgressCancelled {
		t.Fatalf("expected final cancellation progress, got %#v", last)
	}
}

func TestStartOptimizationDelegatesToHarnessAdapterAndPublishesProgress(t *testing.T) {
	writer := &fakeWriter{}
	harness := &fakeHarness{
		optimizeResult: ports.HarnessOptimizeResult{
			CandidatePromptIDs: []string{"prompt-candidate-1"},
			Summary:            map[string]any{"bestScore": 0.8},
		},
	}
	publisher := &fakePublisher{}
	runner := NewRunner(RunnerConfig{
		StorageReader:     &fakeReader{},
		StorageWriter:     writer,
		HarnessAdapter:    harness,
		ProgressPublisher: publisher,
		Clock:             fixedClock(time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)),
		IDGenerator:       sequenceIDs("optimization-run-1"),
	})

	result, err := runner.StartOptimization(context.Background(), StartOptimizationRequest{
		RequestID:           "request-1",
		ExperimentID:        "experiment-1",
		OptimizerKind:       "bootstrap-fewshot",
		BasePromptVersionID: "prompt-1",
		Config:              map[string]any{"maxCandidates": float64(2)},
		TraceContext:        map[string]string{"traceparent": "00-test"},
	})

	if err != nil {
		t.Fatalf("StartOptimization returned error: %v", err)
	}
	if !reflect.DeepEqual(result.CandidatePromptIDs, []string{"prompt-candidate-1"}) {
		t.Fatalf("unexpected candidates: %#v", result.CandidatePromptIDs)
	}
	if len(harness.optimizeRequests) != 1 {
		t.Fatalf("expected one harness optimization call, got %d", len(harness.optimizeRequests))
	}
	if len(writer.progressUpdates) == 0 {
		t.Fatalf("expected storage-write progress update")
	}
	if last := publisher.progress[len(publisher.progress)-1]; last.Type != ports.ExperimentProgressFinished {
		t.Fatalf("expected finished progress, got %#v", last)
	}
}

func TestNonDeterministicScorerDelegatesScoringToHarnessAdapter(t *testing.T) {
	reader := &fakeReader{
		experiments: []ports.Experiment{{
			ID:             "experiment-1",
			DatasetID:      "dataset-1",
			DatasetVersion: 1,
			ScorerIDs:      []string{"scorer-1"},
		}},
		items:   []ports.DatasetItem{{ID: "item-1", Input: map[string]any{"q": "x"}, Expected: map[string]any{"a": "y"}}},
		scorers: []ports.Scorer{{ID: "scorer-1", Kind: ports.ScorerKindLLMJudge, Version: 1}},
	}
	harness := &fakeHarness{
		runResult:   ports.HarnessRunResult{HarnessRunID: "harness-run-1", Output: map[string]any{"a": "z"}, LatencyMs: 1},
		scoreResult: ports.HarnessScoreResult{Score: 0.25, Passed: false, Evidence: map[string]any{"reason": "mismatch"}, JudgeRunRef: "judge-run-1"},
	}
	runner := NewRunner(RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     &fakeWriter{},
		HarnessAdapter:    harness,
		ProgressPublisher: &fakePublisher{},
		Clock:             fixedClock(time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)),
		IDGenerator:       sequenceIDs("run-1", "item-run-1", "eval-result-1"),
	})

	result, err := runner.StartOfflineExperiment(context.Background(), StartExperimentRequest{
		RequestID:    "request-1",
		ExperimentID: "experiment-1",
		SolverRef:    map[string]any{"adapter": "test-solver"},
	})

	if err != nil {
		t.Fatalf("StartOfflineExperiment returned error: %v", err)
	}
	if result.Run.Status != ports.ExperimentRunStatusFinished {
		t.Fatalf("unexpected run status: %s", result.Run.Status)
	}
	if len(harness.scoreRequests) != 1 {
		t.Fatalf("expected one harness score call, got %d", len(harness.scoreRequests))
	}
	if harness.scoreRequests[0].ScorerID != "scorer-1" || harness.scoreRequests[0].TargetID != "item-run-1" {
		t.Fatalf("unexpected score request: %#v", harness.scoreRequests[0])
	}
}

func TestStartOfflineExperimentResolvesManifestAndAppliesBudgetBeforeHarness(t *testing.T) {
	reader := &fakeReader{
		manifest: ports.ExperimentManifest{
			ExperimentRunID: "manifest-run-1",
			ExperimentID:    "experiment-1",
			DatasetID:       "dataset-1",
			DatasetVersion:  1,
			DatasetItemIDs:  []string{"item-1"},
			ScorerRefs:      []ports.VersionedRef{{ID: "scorer-1", Version: 1}},
			Budget:          map[string]any{"exhausted": true},
			Concurrency:     map[string]any{"datasetItems": 4.0},
			Digest:          "manifest-digest-1",
		},
	}
	runner := NewRunner(RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     &fakeWriter{},
		ControlPlane:      &fakeControlPlane{settings: ports.ProjectAISettings{ProjectID: "project-1", Budget: map[string]any{"dailyUsd": 10.0}}},
		HarnessAdapter:    &fakeHarness{},
		ProgressPublisher: &fakePublisher{},
		Clock:             fixedClock(time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)),
		IDGenerator:       sequenceIDs("candidate-run-ignored"),
	})

	_, err := runner.StartOfflineExperiment(context.Background(), StartExperimentRequest{
		RequestID:    "request-1",
		ProjectID:    "project-1",
		ExperimentID: "experiment-1",
		SolverRef:    map[string]any{"adapter": "test-solver"},
	})

	if err == nil || err.Error() != "ERR-AIE-004: evaluation budget exhausted" {
		t.Fatalf("StartOfflineExperiment error = %v, want budget exhaustion", err)
	}
	if !reflect.DeepEqual(reader.manifestResolveRequests, []manifestResolveRequest{{experimentRunID: "candidate-run-ignored", experimentID: "experiment-1"}}) {
		t.Fatalf("manifest resolve requests = %#v", reader.manifestResolveRequests)
	}
}

func TestStartOptimizationRejectsHoldoutManifestBeforeHarness(t *testing.T) {
	reader := &fakeReader{
		manifest: ports.ExperimentManifest{
			ExperimentRunID: "optimization-run-1",
			ExperimentID:    "experiment-1",
			DatasetID:       "dataset-1",
			DatasetVersion:  1,
			DatasetItemIDs:  []string{"item-1"},
			ScorerRefs:      []ports.VersionedRef{{ID: "scorer-1", Version: 1}},
			SplitSelector:   ports.DatasetSplitSelector{Splits: []string{"optimization", "holdout"}, ReviewedOnly: true},
			Budget:          map[string]any{"dailyUsd": 10.0},
			Concurrency:     map[string]any{"candidates": 2.0},
			Digest:          "manifest-digest-1",
		},
	}
	harness := &fakeHarness{}
	runner := NewRunner(RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     &fakeWriter{},
		ControlPlane:      &fakeControlPlane{settings: ports.ProjectAISettings{ProjectID: "project-1", Budget: map[string]any{"dailyUsd": 10.0}}},
		HarnessAdapter:    harness,
		ProgressPublisher: &fakePublisher{},
		Clock:             fixedClock(time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)),
		IDGenerator:       sequenceIDs("optimization-run-1"),
	})

	_, err := runner.StartOptimization(context.Background(), StartOptimizationRequest{
		RequestID:           "request-1",
		ProjectID:           "project-1",
		ExperimentID:        "experiment-1",
		OptimizerKind:       "bootstrap-fewshot",
		BasePromptVersionID: "prompt-1",
	})

	if err == nil || err.Error() != "ERR-AIE-002: holdout split cannot be used for optimization" {
		t.Fatalf("StartOptimization error = %v, want holdout rejection", err)
	}
	if len(harness.optimizeRequests) != 0 {
		t.Fatalf("harness optimize calls = %d, want 0", len(harness.optimizeRequests))
	}
}

func TestStartOfflineExperimentReturnsErrorWhenFinalProgressCannotPersist(t *testing.T) {
	reader := &fakeReader{
		experiments: []ports.Experiment{{
			ID:             "experiment-1",
			DatasetID:      "dataset-1",
			DatasetVersion: 1,
			ScorerIDs:      []string{"scorer-1"},
		}},
		items:   []ports.DatasetItem{{ID: "item-1", Input: map[string]any{"answer": "4"}, Expected: map[string]any{"answer": "4"}}},
		scorers: []ports.Scorer{{ID: "scorer-1", Kind: ports.ScorerKindDeterministic, Version: 1}},
	}
	writer := &fakeWriter{progressErrByType: map[string]error{ports.ExperimentProgressFinished: errors.New("progress persist failed")}}
	runner := NewRunner(RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     writer,
		HarnessAdapter:    &fakeHarness{runResult: ports.HarnessRunResult{HarnessRunID: "harness-run-1", Output: map[string]any{"answer": "4"}, LatencyMs: 1}},
		ProgressPublisher: &fakePublisher{},
		Clock:             fixedClock(time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)),
		IDGenerator:       sequenceIDs("run-1", "item-run-1", "eval-result-1"),
	})

	_, err := runner.StartOfflineExperiment(context.Background(), StartExperimentRequest{
		RequestID:    "request-1",
		ExperimentID: "experiment-1",
		SolverRef:    map[string]any{"adapter": "test-solver"},
	})

	if err == nil || err.Error() != "progress persist failed" {
		t.Fatalf("expected final progress persist error, got %v", err)
	}
}

type datasetSearch struct {
	datasetID string
	version   int
}

type manifestResolveRequest struct {
	experimentRunID string
	experimentID    string
}

type fakeReader struct {
	experiments             []ports.Experiment
	items                   []ports.DatasetItem
	scorers                 []ports.Scorer
	manifest                ports.ExperimentManifest
	experimentSearches      []string
	datasetSearches         []datasetSearch
	scorerSearches          [][]string
	manifestResolveRequests []manifestResolveRequest
}

func (r *fakeReader) SearchExperiments(ctx context.Context, experimentID string) ([]ports.Experiment, error) {
	r.experimentSearches = append(r.experimentSearches, experimentID)
	return r.experiments, nil
}

func (r *fakeReader) SearchDatasetItems(ctx context.Context, datasetID string, datasetVersion int) ([]ports.DatasetItem, error) {
	r.datasetSearches = append(r.datasetSearches, datasetSearch{datasetID: datasetID, version: datasetVersion})
	return r.items, nil
}

func (r *fakeReader) SearchScorers(ctx context.Context, scorerIDs []string) ([]ports.Scorer, error) {
	r.scorerSearches = append(r.scorerSearches, append([]string(nil), scorerIDs...))
	return r.scorers, nil
}

func (r *fakeReader) ResolveManifest(ctx context.Context, request ports.ManifestResolveRequest) (ports.ExperimentManifest, error) {
	r.manifestResolveRequests = append(r.manifestResolveRequests, manifestResolveRequest{experimentRunID: request.ExperimentRunID, experimentID: request.ExperimentID})
	return r.manifest, nil
}

type fakeControlPlane struct {
	settings ports.ProjectAISettings
}

func (c *fakeControlPlane) GetProjectAISettings(ctx context.Context, projectID string) (ports.ProjectAISettings, error) {
	return c.settings, nil
}

type persistedRun struct {
	key string
	run ports.DatasetItemRun
}

type persistedResult struct {
	key    string
	result ports.EvalResult
}

type fakeWriter struct {
	experimentRuns    []ports.ExperimentRun
	persistedRuns     []persistedRun
	persistedResults  []persistedResult
	progressUpdates   []ports.ExperimentProgress
	progressErrByType map[string]error
}

func (w *fakeWriter) PersistExperimentRun(ctx context.Context, run ports.ExperimentRun) error {
	w.experimentRuns = append(w.experimentRuns, run)
	return nil
}

func (w *fakeWriter) PersistDatasetItemRun(ctx context.Context, idempotencyKey string, run ports.DatasetItemRun) error {
	w.persistedRuns = append(w.persistedRuns, persistedRun{key: idempotencyKey, run: run})
	return nil
}

func (w *fakeWriter) PersistEvalResult(ctx context.Context, idempotencyKey string, result ports.EvalResult) error {
	w.persistedResults = append(w.persistedResults, persistedResult{key: idempotencyKey, result: result})
	return nil
}

func (w *fakeWriter) UpdateExperimentProgress(ctx context.Context, progress ports.ExperimentProgress) error {
	if w.progressErrByType != nil && w.progressErrByType[progress.Type] != nil {
		return w.progressErrByType[progress.Type]
	}
	w.progressUpdates = append(w.progressUpdates, progress)
	return nil
}

type fakeHarness struct {
	runner           *Runner
	runResult        ports.HarnessRunResult
	scoreResult      ports.HarnessScoreResult
	optimizeResult   ports.HarnessOptimizeResult
	afterRun         func(*Runner)
	runRequests      []ports.HarnessRunRequest
	scoreRequests    []ports.HarnessScoreRequest
	optimizeRequests []ports.HarnessOptimizeRequest
}

func (h *fakeHarness) Run(ctx context.Context, request ports.HarnessRunRequest) (ports.HarnessRunResult, error) {
	h.runRequests = append(h.runRequests, request)
	if h.afterRun != nil {
		h.afterRun(h.runner)
	}
	return h.runResult, nil
}

func (h *fakeHarness) Score(ctx context.Context, request ports.HarnessScoreRequest) (ports.HarnessScoreResult, error) {
	h.scoreRequests = append(h.scoreRequests, request)
	return h.scoreResult, nil
}

func (h *fakeHarness) Optimize(ctx context.Context, request ports.HarnessOptimizeRequest) (ports.HarnessOptimizeResult, error) {
	h.optimizeRequests = append(h.optimizeRequests, request)
	return h.optimizeResult, nil
}

type fakePublisher struct {
	progress []ports.ExperimentProgress
	err      error
}

func (p *fakePublisher) PublishExperimentProgress(ctx context.Context, progress ports.ExperimentProgress) error {
	if p.err != nil {
		return p.err
	}
	p.progress = append(p.progress, progress)
	return nil
}

func fixedClock(t time.Time) func() time.Time {
	return func() time.Time { return t }
}

func sequenceIDs(ids ...string) func() string {
	index := 0
	return func() string {
		if index >= len(ids) {
			panic(errors.New("test id sequence exhausted"))
		}
		id := ids[index]
		index++
		return id
	}
}

func collectProgressTypes(progress []ports.ExperimentProgress) []string {
	types := make([]string, 0, len(progress))
	for _, item := range progress {
		types = append(types, item.Type)
	}
	return types
}
