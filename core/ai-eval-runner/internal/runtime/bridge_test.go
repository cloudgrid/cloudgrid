package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/orchestrator"
	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

func TestSubjectHandlersExposeApprovedRunnerSubjects(t *testing.T) {
	service := NewRunnerService(orchestrator.NewRunner(orchestrator.RunnerConfig{}), nil)

	subjects := make([]string, 0, len(service.SubjectHandlers()))
	for subject := range service.SubjectHandlers() {
		subjects = append(subjects, subject)
	}

	want := []string{
		SubjectExperimentStart,
		SubjectExperimentPause,
		SubjectExperimentResume,
		SubjectExperimentCancel,
		SubjectOptimizationStart,
		SubjectPersistedProjections,
	}
	if !sameStringSet(subjects, want) {
		t.Fatalf("subjects = %#v, want %#v", subjects, want)
	}
}

func TestExperimentPauseAndResumeHandlersUseControlRequest(t *testing.T) {
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     &runtimeReader{manifest: ports.ExperimentManifest{Digest: "manifest-digest-1"}},
		StorageWriter:     &runtimeWriter{},
		HarnessAdapter:    &runtimeHarness{},
		ProgressPublisher: &runtimePublisher{},
		Clock:             func() time.Time { return time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC) },
	})
	service := NewRunnerService(runner, nil)

	pauseMsg := newRuntimeMessage(SubjectExperimentPause, contracts.EvaluationRunControlRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-pause",
			IssuedAt:  time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC),
		},
		ProjectID:       "project-1",
		EvaluationRunID: "run-1",
		IdempotencyKey:  "pause-1",
	})
	service.SubjectHandlers()[SubjectExperimentPause](pauseMsg)
	var pauseResponse contracts.EvalMutationResponse
	decodeRuntimeResponse(t, pauseMsg.response, &pauseResponse)
	if !pauseResponse.OK || pauseResponse.Data["status"] != ports.ExperimentRunStatusPaused {
		t.Fatalf("pause response = %#v", pauseResponse)
	}

	resumeMsg := newRuntimeMessage(SubjectExperimentResume, contracts.EvaluationRunControlRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-resume",
			IssuedAt:  time.Date(2026, 5, 16, 9, 1, 0, 0, time.UTC),
		},
		ProjectID:       "project-1",
		EvaluationRunID: "run-1",
		IdempotencyKey:  "resume-1",
	})
	service.SubjectHandlers()[SubjectExperimentResume](resumeMsg)
	var resumeResponse contracts.EvalMutationResponse
	decodeRuntimeResponse(t, resumeMsg.response, &resumeResponse)
	if !resumeResponse.OK || resumeResponse.Data["status"] != ports.ExperimentRunStatusRunning {
		t.Fatalf("resume response = %#v", resumeResponse)
	}
}

func TestExperimentStartHandlerRoutesToRunnerAndRespondsWithRunData(t *testing.T) {
	reader := &runtimeReader{
		datasetVersion: ports.DatasetVersion{ID: "version-1", DatasetID: "dataset-1", Digest: "digest-1", ItemRevisionIDs: []string{"revision-1"}},
		itemRevisions:  []ports.DatasetItemRevision{{ID: "revision-1", DatasetItemID: "item-1", DatasetID: "dataset-1", Input: map[string]any{"q": "x"}, Expected: map[string]any{"a": "y"}, CurationStatus: "ready"}},
		targetSnapshot: ports.TargetSnapshot{ID: "snapshot-1", TargetRef: map[string]any{"kind": "prompt"}, Digest: "target-digest"},
	}
	harness := &runtimeHarness{runResult: ports.HarnessRunResult{HarnessRunID: "harness-run-1", Output: map[string]any{"a": "y"}, LatencyMs: 12}}
	writer := &runtimeWriter{}
	publisher := &runtimePublisher{}
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     writer,
		HarnessAdapter:    harness,
		ProgressPublisher: publisher,
		Clock:             func() time.Time { return time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC) },
		IDGenerator:       sequenceRuntimeIDs("run-1", "item-run-1", "metric-exact-1", "metric-latency-1"),
	})
	msg := newRuntimeMessage(SubjectExperimentStart, contracts.EvaluationRunStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:    "req-start",
			IssuedAt:     time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC),
			TraceContext: map[string]any{"traceparent": "00-test"},
			AuthContext:  &contracts.AuthContext{ProjectID: stringPtr("project-1")},
		},
		ProjectID:        "project-1",
		DatasetVersionID: "version-1",
		TargetSnapshotID: "snapshot-1",
		IdempotencyKey:   "start-1",
	})

	NewRunnerService(runner, nil).SubjectHandlers()[SubjectExperimentStart](msg)

	var response contracts.EvalMutationResponse
	decodeRuntimeResponse(t, msg.response, &response)
	if !response.OK || response.Data["id"] != "run-1" || response.Data["status"] != ports.ExperimentRunStatusFinished {
		t.Fatalf("response = %#v, want completed run", response)
	}
	if !reflect.DeepEqual(reader.datasetVersionGets, []string{"version-1"}) {
		t.Fatalf("dataset version gets = %#v", reader.datasetVersionGets)
	}
	if len(harness.runRequests) != 1 || harness.runRequests[0].TraceContext["traceparent"] != "00-test" {
		t.Fatalf("harness run requests = %#v", harness.runRequests)
	}
	if len(writer.evaluationResults) != 1 {
		t.Fatalf("evaluation results persisted = %d, want 1", len(writer.evaluationResults))
	}
}

func TestEvaluationRunStartHandlerPassesV2RunShapeToRunner(t *testing.T) {
	reader := &runtimeReader{
		datasetVersion: ports.DatasetVersion{ID: "version-1", DatasetID: "dataset-1", Digest: "digest-1", ItemRevisionIDs: []string{"revision-1", "revision-2"}},
		itemRevisions: []ports.DatasetItemRevision{
			{ID: "revision-1", DatasetItemID: "item-1", DatasetID: "dataset-1", Input: map[string]any{"q": "skip"}, Expected: map[string]any{"a": "skip"}, CurationStatus: "ready"},
			{ID: "revision-2", DatasetItemID: "item-2", DatasetID: "dataset-1", Input: map[string]any{"q": "run"}, Expected: map[string]any{"a": "run"}, CurationStatus: "ready"},
		},
		targetSnapshot: ports.TargetSnapshot{ID: "snapshot-1", TargetRef: map[string]any{"kind": "prompt"}, Digest: "target-digest"},
	}
	harness := &runtimeHarness{runResult: ports.HarnessRunResult{HarnessRunID: "harness-run-1", Output: map[string]any{"a": "run"}, LatencyMs: 12}}
	writer := &runtimeWriter{}
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     reader,
		StorageWriter:     writer,
		HarnessAdapter:    harness,
		ProgressPublisher: &runtimePublisher{},
		Clock:             func() time.Time { return time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC) },
		IDGenerator:       sequenceRuntimeIDs("run-1", "item-run-1", "metric-exact-1", "metric-latency-1"),
	})
	msg := &runtimeMessage{
		subject: SubjectExperimentStart,
		data:    []byte(`{"requestId":"req-start-v2","issuedAt":"2026-05-16T09:00:00Z","projectId":"project-1","evaluationDefinitionId":"evaluation-1","kind":"quick_shot","datasetVersionId":"version-1","targetSnapshotId":"snapshot-1","selectedItemRevisionIds":["revision-2"],"splitSelector":{"splits":["validation"],"curationStatuses":["ready"]},"metricSettings":[{"metricId":"classification.exact_label_match","options":{}}],"runPolicy":{"maxParallelRequests":1},"retentionProfile":"balanced","retentionRole":"quick_shot","idempotencyKey":"start-v2-1","traceContext":{"traceparent":"00-test"}}`),
	}

	NewRunnerService(runner, nil).SubjectHandlers()[SubjectExperimentStart](msg)

	var response contracts.EvalMutationResponse
	decodeRuntimeResponse(t, msg.response, &response)
	if !response.OK || response.Data["id"] != "run-1" || response.Data["kind"] != ports.EvaluationRunKindQuickShot {
		t.Fatalf("response = %#v, want quick-shot evaluation run", response)
	}
	if _, ok := response.Data["metricResults"].([]any); !ok {
		t.Fatalf("response metricResults = %#v, want default list", response.Data["metricResults"])
	}
	if _, ok := response.Data["metricAggregates"].([]any); !ok {
		t.Fatalf("response metricAggregates = %#v, want default list", response.Data["metricAggregates"])
	}
	if len(harness.runRequests) != 1 || harness.runRequests[0].DatasetItemID != "item-2" {
		t.Fatalf("harness run requests = %#v, want selected revision only", harness.runRequests)
	}
	if len(writer.evaluationResults) != 1 || writer.evaluationResults[0].EvaluationRun.EvaluationDefinitionID != "evaluation-1" {
		t.Fatalf("persisted evaluation results = %#v", writer.evaluationResults)
	}
}

func TestExperimentStartHandlerRejectsInvalidPayloadBeforeBoundaryCalls(t *testing.T) {
	harness := &runtimeHarness{}
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     &runtimeReader{},
		StorageWriter:     &runtimeWriter{},
		HarnessAdapter:    harness,
		ProgressPublisher: &runtimePublisher{},
		IDGenerator:       sequenceRuntimeIDs("run-1"),
	})
	msg := &runtimeMessage{
		subject: SubjectExperimentStart,
		data:    []byte(`{"requestId":"req-invalid","issuedAt":"2026-05-16T09:00:00Z","projectId":"project-1","datasetVersionId":"version-1","targetSnapshotId":"snapshot-1","idempotencyKey":"start-1","unexpected":true}`),
	}

	NewRunnerService(runner, nil).SubjectHandlers()[SubjectExperimentStart](msg)

	var response contracts.EvalMutationResponse
	decodeRuntimeResponse(t, msg.response, &response)
	if response.OK || response.Error == nil || response.Error.ID != validationErrorID {
		t.Fatalf("response = %#v, want validation error", response)
	}
	if len(harness.runRequests) != 0 {
		t.Fatalf("harness calls = %d, want 0", len(harness.runRequests))
	}
}

func TestPersistedProjectionHandlerValidatesNotificationWithoutHarnessCall(t *testing.T) {
	harness := &runtimeHarness{}
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     &runtimeReader{},
		StorageWriter:     &runtimeWriter{},
		HarnessAdapter:    harness,
		ProgressPublisher: &runtimePublisher{},
	})
	msg := newRuntimeMessage(SubjectPersistedProjections, contracts.AiProjectionPersistedNotification{
		RequestID:     "req-projection",
		ProjectID:     stringPtr("project-1"),
		TraceID:       "trace-1",
		ProjectionIDs: []string{"agent-run-1"},
		Kinds:         []contracts.AiProjectionKind{contracts.AiProjectionKindAgentRun},
		PersistedAt:   time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC),
	})

	NewRunnerService(runner, nil).SubjectHandlers()[SubjectPersistedProjections](msg)

	if msg.response != nil {
		t.Fatalf("persisted projection notification should not request/reply, got %s", string(msg.response))
	}
	if len(harness.runRequests)+len(harness.scoreRequests)+len(harness.optimizeRequests) != 0 {
		t.Fatalf("harness was called for projection notification")
	}
}

func TestOptimizationStartHandlerAcceptsV2OptimizationRunRequest(t *testing.T) {
	harness := &runtimeHarness{optimizeResult: ports.HarnessOptimizeResult{
		CandidatePromptIDs: []string{"target-candidate-1"},
		Summary:            map[string]any{"evaluatedSubset": true},
	}}
	writer := &runtimeWriter{}
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     &runtimeReader{},
		StorageWriter:     writer,
		HarnessAdapter:    harness,
		ProgressPublisher: &runtimePublisher{},
		Clock:             func() time.Time { return time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC) },
		IDGenerator:       sequenceRuntimeIDs("optimization-run-1"),
	})
	msg := &runtimeMessage{
		subject: SubjectOptimizationStart,
		data:    []byte(`{"requestId":"req-opt-v2","issuedAt":"2026-05-16T09:00:00Z","projectId":"project-1","datasetVersionId":"version-1","targetSnapshotId":"snapshot-1","idempotencyKey":"optimization-v2-1","config":{"projectId":"project-1","baselineTargetSnapshotId":"snapshot-1","objective":{"primaryMetricId":"classification.exact_label_match","minimumEvidence":{"rows":1}},"validationEvaluationDefinitionId":"evaluation-1","validationSplitSelector":{"splits":["validation"],"curationStatuses":["ready"]},"quickShotPolicy":{"sourceDatasetVersionId":"version-1","split":"validation","minimumSampleSize":1},"runPolicy":{"maxParallelRequests":1},"idempotencyKey":"optimization-v2-1"},"traceContext":{"traceparent":"00-test"}}`),
	}

	NewRunnerService(runner, nil).SubjectHandlers()[SubjectOptimizationStart](msg)

	var response contracts.EvalMutationResponse
	decodeRuntimeResponse(t, msg.response, &response)
	if !response.OK || response.Data["id"] != "optimization-run-1" || response.Data["baselineTargetSnapshotId"] != "snapshot-1" {
		t.Fatalf("response = %#v, want v2 optimization run", response)
	}
	if len(harness.optimizeRequests) != 1 || harness.optimizeRequests[0].TraceContext["traceparent"] != "00-test" {
		t.Fatalf("harness optimize requests = %#v", harness.optimizeRequests)
	}
	if harness.optimizeRequests[0].OptimizerKind != "critic_mutate_judge_pick" {
		t.Fatalf("optimizer kind = %q, want contract-supported v2 default", harness.optimizeRequests[0].OptimizerKind)
	}
	if len(writer.evaluationResults) != 1 || writer.evaluationResults[0].OptimizationRun["id"] != "optimization-run-1" {
		t.Fatalf("persisted optimization results = %#v", writer.evaluationResults)
	}
}

func TestRunnerHandlerRecordsSelfObservabilityFailureLog(t *testing.T) {
	recorder := &recordingTraceLogRecorder{}
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     &runtimeReader{},
		StorageWriter:     &runtimeWriter{},
		HarnessAdapter:    &runtimeHarness{},
		ProgressPublisher: &runtimePublisher{},
		IDGenerator:       sequenceRuntimeIDs("run-1"),
	})
	msg := &runtimeMessage{
		subject: SubjectExperimentStart,
		data:    []byte(`{"requestId":"req-invalid","issuedAt":"2026-05-16T09:00:00Z","projectId":"project-1","datasetVersionId":"version-1","targetSnapshotId":"snapshot-1","idempotencyKey":"start-1","unexpected":true}`),
	}

	NewRunnerServiceWithOptions(runner, nil, RunnerServiceOptions{SelfObservability: recorder}).SubjectHandlers()[SubjectExperimentStart](msg)

	if len(recorder.spans) != 1 || recorder.spans[0].Attributes["cloudgrid.operation"] != "evaluation_run_start" {
		t.Fatalf("spans = %#v", recorder.spans)
	}
	if len(recorder.logs) != 1 {
		t.Fatalf("logs = %#v, want one failure log", recorder.logs)
	}
	if recorder.logs[0].Attributes["event"] != "ai_eval_runner_failed" ||
		recorder.logs[0].Attributes["error_id"] != validationErrorID ||
		recorder.logs[0].Attributes["cloudgrid.request_id"] != "req-invalid" {
		t.Fatalf("failure log = %#v", recorder.logs[0])
	}
}

func TestNATSAdaptersUseApprovedBoundarySubjects(t *testing.T) {
	requester := &recordingRequester{
		responses: map[string]any{
			SubjectResultsPersist:       contracts.EvalMutationResponse{RequestID: "req", OK: true, Data: map[string]any{}},
			SubjectControlAISettingsGet: contracts.ProjectAiSettingsGetResponse{RequestID: "req", OK: true, Data: map[string]any{"settings": map[string]any{"projectId": "project-1", "budget": map[string]any{"dailyUsd": 10}}}},
			SubjectOnlinePolicyResolve: contracts.OnlinePolicyMatchesResolveResponse{RequestID: "req-online", OK: true, Data: &contracts.OnlinePolicyMatchesResolveData{
				Projection: contracts.OnlinePolicyProjectionReadModel{
					ProjectID:      "project-1",
					TraceID:        "trace-1",
					ProjectionID:   "agent-run-1",
					Kind:           contracts.AiProjectionKindAgentRun,
					SafeAttributes: map[string]any{"answer": "ok"},
				},
				Matches: []contracts.OnlinePolicyMatch{{
					PolicyID:      "policy-1",
					PolicyVersion: 1,
					PolicyName:    "production",
					SampleRate:    1,
					ScorerRefs: []contracts.OnlinePolicyScorerRef{{
						ScorerID:      "scorer-1",
						ScorerVersion: 2,
						Kind:          "deterministic",
					}},
				}},
				Warnings: []string{},
			}},
		},
	}
	reader := NATSStorageReader{Requester: requester}
	writer := NATSStorageWriter{Requester: requester}
	control := NATSControlPlane{Requester: requester}
	publisher := NATSProgressPublisher{Publisher: requester}

	matches, err := reader.ResolveOnlinePolicyMatches(context.Background(), ports.OnlinePolicyResolveRequest{
		RequestID:     "req-online",
		ProjectID:     "project-1",
		TraceID:       "trace-1",
		ProjectionIDs: []string{"agent-run-1"},
		SpanIDs:       []string{"span-1"},
		Kinds:         []string{"agent_run"},
		PersistedAt:   "2026-05-16T09:00:00Z",
	})
	if err != nil {
		t.Fatalf("ResolveOnlinePolicyMatches() error = %v", err)
	}
	if len(matches.Matches) != 1 || matches.Matches[0].PolicyID != "policy-1" || matches.Matches[0].Projection.ProjectionID != "agent-run-1" {
		t.Fatalf("online matches = %#v", matches)
	}
	if err := writer.PersistEvalResult(context.Background(), "eval-key", ports.EvalResult{ID: "result-1", ExperimentRunID: "run-1", TargetKind: "datasetItemRun", TargetID: "item-run-1", ScorerID: "scorer-1", ScorerVersion: 1}); err != nil {
		t.Fatalf("PersistEvalResult() error = %v", err)
	}
	if _, err := control.GetProjectAISettings(context.Background(), "project-1"); err != nil {
		t.Fatalf("GetProjectAISettings() error = %v", err)
	}
	if err := publisher.PublishExperimentProgress(context.Background(), ports.ExperimentProgress{ExperimentRunID: "run-1", Type: ports.ExperimentProgressStarted, OccurredAt: "2026-05-16T09:00:00Z"}); err != nil {
		t.Fatalf("PublishExperimentProgress() error = %v", err)
	}

	if !reflect.DeepEqual(requester.requestSubjects, []string{SubjectOnlinePolicyResolve, SubjectResultsPersist, SubjectControlAISettingsGet}) {
		t.Fatalf("request subjects = %#v", requester.requestSubjects)
	}
	if !reflect.DeepEqual(requester.publishSubjects, []string{SubjectExperimentProgress}) {
		t.Fatalf("publish subjects = %#v", requester.publishSubjects)
	}
}

func TestNATSStorageWriterPersistsEvaluationResultsWithV2PayloadWrapper(t *testing.T) {
	requester := &recordingRequester{
		responses: map[string]any{
			SubjectResultsPersist: contracts.EvalMutationResponse{RequestID: "req", OK: true, Data: map[string]any{}},
		},
	}
	writer := NATSStorageWriter{Requester: requester}

	err := writer.PersistEvaluationResults(context.Background(), ports.EvaluationResultsPersist{
		ProjectID:       "project-1",
		EvaluationRunID: "eval-run-1",
		IdempotencyKey:  "persist-key",
		EvaluationRun:   ports.EvaluationRun{ID: "eval-run-1", ProjectID: "project-1", Kind: ports.EvaluationRunKindDatasetEvaluation, Status: ports.ExperimentRunStatusFinished},
		ItemRuns:        []ports.EvaluationItemRun{{ID: "item-run-1", EvaluationRunID: "eval-run-1", Status: ports.EvaluationItemRunStatusCompleted}},
		MetricResults:   []ports.MetricResult{{ID: "metric-1", MetricID: "extraction.exact_json_match", SubjectID: "item-run-1"}},
	})

	if err != nil {
		t.Fatalf("PersistEvaluationResults() error = %v", err)
	}
	if !reflect.DeepEqual(requester.requestSubjects, []string{SubjectResultsPersist}) {
		t.Fatalf("request subjects = %#v", requester.requestSubjects)
	}
	payload := requester.requestPayloads[0]
	if payload["projectId"] != "project-1" || payload["evaluationRunId"] != "eval-run-1" || payload["idempotencyKey"] != "persist-key" {
		t.Fatalf("top-level persist payload = %#v", payload)
	}
	wrapped, ok := payload["payload"].(map[string]any)
	if !ok {
		t.Fatalf("persist request missing payload wrapper: %#v", payload)
	}
	if _, exists := payload["evaluationRun"]; exists {
		t.Fatalf("evaluationRun must be inside payload wrapper: %#v", payload)
	}
	if wrapped["evaluationRun"] == nil || len(wrapped["itemRuns"].([]any)) != 1 || len(wrapped["metricResults"].([]any)) != 1 {
		t.Fatalf("wrapped payload = %#v", wrapped)
	}
}

func TestNATSAdaptersPropagateAuthContext(t *testing.T) {
	requester := &recordingRequester{
		responses: map[string]any{
			SubjectExperimentSearch: contracts.EvalQueryResponse{
				RequestID: "req",
				OK:        true,
				Data:      map[string]any{"items": []any{}},
			},
			SubjectResultsPersist: contracts.EvalMutationResponse{
				RequestID: "req",
				OK:        true,
				Data:      map[string]any{},
			},
		},
	}
	ctx := contextWithAuth(&contracts.AuthContext{ProjectID: stringPtr("project-1")})
	reader := NATSStorageReader{Requester: requester}
	writer := NATSStorageWriter{Requester: requester}

	_, _ = reader.SearchExperiments(ctx, "experiment-1")
	_ = writer.PersistExperimentRun(ctx, ports.ExperimentRun{ID: "run-1", ExperimentID: "experiment-1"})

	if requester.requestPayloads[0]["input"].(map[string]any)["id"] != "experiment-1" {
		t.Fatalf("experiment lookup payload = %#v, want public id filter", requester.requestPayloads[0])
	}
	for _, payload := range requester.requestPayloads {
		envelope, ok := payload["authContext"].(map[string]any)
		if !ok || envelope["projectId"] != "project-1" {
			t.Fatalf("request payload did not propagate auth context: %#v", payload)
		}
	}
}

func TestHarnessHTTPAdapterCallsHarnessOnlyWithTraceContext(t *testing.T) {
	var gotPath string
	var gotTraceparent string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotTraceparent = r.Header.Get("traceparent")
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"harnessRunId": "harness-run-1",
			"output":       map[string]any{"answer": "4"},
			"latencyMs":    7,
		})
	}))
	defer server.Close()
	adapter := HarnessHTTPAdapter{BaseURL: server.URL, Client: server.Client()}

	result, err := adapter.Run(context.Background(), ports.HarnessRunRequest{
		ExperimentRunID: "run-1",
		DatasetItemID:   "item-1",
		Input:           map[string]any{"question": "2+2"},
		ProviderProfileRefs: []string{
			"provider-openai",
		},
		TraceContext: map[string]string{"traceparent": "00-test"},
	})

	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if gotPath != "/v1/run" || gotTraceparent != "00-test" {
		t.Fatalf("request path/header = %q/%q", gotPath, gotTraceparent)
	}
	if result.HarnessRunID != "harness-run-1" {
		t.Fatalf("result = %#v", result)
	}
	if !reflect.DeepEqual(gotBody["providerProfileRefs"], []any{"provider-openai"}) {
		t.Fatalf("providerProfileRefs body = %#v", gotBody["providerProfileRefs"])
	}
}

type runtimeMessage struct {
	subject  string
	data     []byte
	response []byte
}

func (message *runtimeMessage) Header(name string) string {
	if name == selfobs.TraceParentHeader {
		return "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
	}
	return ""
}

func newRuntimeMessage(tSubject string, value any) *runtimeMessage {
	data, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return &runtimeMessage{subject: tSubject, data: data}
}

func (message *runtimeMessage) Subject() string {
	return message.subject
}

func (message *runtimeMessage) Data() []byte {
	return message.data
}

func (message *runtimeMessage) Respond(response []byte) error {
	message.response = append([]byte(nil), response...)
	return nil
}

type runtimeReader struct {
	experiments           []ports.Experiment
	items                 []ports.DatasetItem
	datasetVersion        ports.DatasetVersion
	itemRevisions         []ports.DatasetItemRevision
	targetSnapshot        ports.TargetSnapshot
	scorers               []ports.Scorer
	manifest              ports.ExperimentManifest
	onlineMatches         ports.OnlinePolicyMatches
	experimentSearches    []string
	datasetVersionGets    []string
	onlineResolveRequests []ports.OnlinePolicyResolveRequest
}

func (reader *runtimeReader) SearchExperiments(_ context.Context, experimentID string) ([]ports.Experiment, error) {
	reader.experimentSearches = append(reader.experimentSearches, experimentID)
	return reader.experiments, nil
}

func (reader *runtimeReader) SearchDatasetItems(_ context.Context, _ string, _ int) ([]ports.DatasetItem, error) {
	return reader.items, nil
}

func (reader *runtimeReader) SearchScorers(_ context.Context, _ []string) ([]ports.Scorer, error) {
	return reader.scorers, nil
}

func (reader *runtimeReader) GetDatasetVersion(_ context.Context, datasetVersionID string) (ports.DatasetVersion, error) {
	reader.datasetVersionGets = append(reader.datasetVersionGets, datasetVersionID)
	if reader.datasetVersion.ID != "" {
		return reader.datasetVersion, nil
	}
	return ports.DatasetVersion{ID: datasetVersionID, DatasetID: "dataset-1", ItemRevisionIDs: []string{}}, nil
}

func (reader *runtimeReader) SearchDatasetItemRevisions(_ context.Context, _ string, itemRevisionIDs []string) ([]ports.DatasetItemRevision, error) {
	if len(itemRevisionIDs) == 0 {
		return reader.itemRevisions, nil
	}
	results := make([]ports.DatasetItemRevision, 0, len(itemRevisionIDs))
	wanted := map[string]bool{}
	for _, id := range itemRevisionIDs {
		wanted[id] = true
	}
	for _, item := range reader.itemRevisions {
		if wanted[item.ID] {
			results = append(results, item)
		}
	}
	return results, nil
}

func (reader *runtimeReader) GetTargetSnapshot(_ context.Context, targetSnapshotID string) (ports.TargetSnapshot, error) {
	if reader.targetSnapshot.ID != "" {
		return reader.targetSnapshot, nil
	}
	return ports.TargetSnapshot{ID: targetSnapshotID, TargetRef: map[string]any{"kind": "prompt"}, Digest: "target-digest"}, nil
}

func (reader *runtimeReader) ResolveManifest(_ context.Context, _ ports.ManifestResolveRequest) (ports.ExperimentManifest, error) {
	return reader.manifest, nil
}

func (reader *runtimeReader) ResolveOnlinePolicyMatches(_ context.Context, request ports.OnlinePolicyResolveRequest) (ports.OnlinePolicyMatches, error) {
	reader.onlineResolveRequests = append(reader.onlineResolveRequests, request)
	return reader.onlineMatches, nil
}

type runtimeWriter struct {
	persistedResults  []ports.EvalResult
	evaluationResults []ports.EvaluationResultsPersist
}

func (writer *runtimeWriter) PersistExperimentRun(_ context.Context, _ ports.ExperimentRun) error {
	return nil
}

func (writer *runtimeWriter) PersistDatasetItemRun(_ context.Context, _ string, _ ports.DatasetItemRun) error {
	return nil
}

func (writer *runtimeWriter) PersistEvalResult(_ context.Context, _ string, result ports.EvalResult) error {
	writer.persistedResults = append(writer.persistedResults, result)
	return nil
}

func (writer *runtimeWriter) PersistEvaluationResults(_ context.Context, result ports.EvaluationResultsPersist) error {
	writer.evaluationResults = append(writer.evaluationResults, result)
	return nil
}

func (writer *runtimeWriter) UpdateExperimentProgress(_ context.Context, _ ports.ExperimentProgress) error {
	return nil
}

type runtimeHarness struct {
	runResult        ports.HarnessRunResult
	scoreResult      ports.HarnessScoreResult
	optimizeResult   ports.HarnessOptimizeResult
	runRequests      []ports.HarnessRunRequest
	scoreRequests    []ports.HarnessScoreRequest
	optimizeRequests []ports.HarnessOptimizeRequest
}

func (harness *runtimeHarness) StartSandbox(_ context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return ports.SandboxLifecycleResult{SandboxRef: "sandbox-" + request.ExperimentRunID + "-" + request.AttemptID, SandboxProfile: request.SandboxProfile, CleanupRequired: true}, nil
}

func (harness *runtimeHarness) PauseSandbox(_ context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return ports.SandboxLifecycleResult{SandboxRef: request.SandboxRef, SandboxProfile: request.SandboxProfile}, nil
}

func (harness *runtimeHarness) ResumeSandbox(_ context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return ports.SandboxLifecycleResult{SandboxRef: request.SandboxRef, SandboxProfile: request.SandboxProfile}, nil
}

func (harness *runtimeHarness) AbortSandbox(_ context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return ports.SandboxLifecycleResult{SandboxRef: request.SandboxRef, SandboxProfile: request.SandboxProfile}, nil
}

func (harness *runtimeHarness) CleanupSandbox(_ context.Context, request ports.SandboxLifecycleRequest) (ports.SandboxLifecycleResult, error) {
	return ports.SandboxLifecycleResult{SandboxRef: request.SandboxRef, SandboxProfile: request.SandboxProfile}, nil
}

func (harness *runtimeHarness) Run(_ context.Context, request ports.HarnessRunRequest) (ports.HarnessRunResult, error) {
	harness.runRequests = append(harness.runRequests, request)
	return harness.runResult, nil
}

func (harness *runtimeHarness) Score(_ context.Context, request ports.HarnessScoreRequest) (ports.HarnessScoreResult, error) {
	harness.scoreRequests = append(harness.scoreRequests, request)
	return harness.scoreResult, nil
}

func (harness *runtimeHarness) Optimize(_ context.Context, request ports.HarnessOptimizeRequest) (ports.HarnessOptimizeResult, error) {
	harness.optimizeRequests = append(harness.optimizeRequests, request)
	return harness.optimizeResult, nil
}

type runtimePublisher struct{}

func (publisher *runtimePublisher) PublishExperimentProgress(_ context.Context, _ ports.ExperimentProgress) error {
	return nil
}

func (publisher *runtimePublisher) PublishEvaluationProgress(_ context.Context, _ ports.ExperimentProgress) error {
	return nil
}

type recordingTraceLogRecorder struct {
	spans []selfobs.SpanEvent
	logs  []selfobs.LogEvent
}

func (recorder *recordingTraceLogRecorder) RecordSpan(event selfobs.SpanEvent) {
	event.Attributes = copyStringMap(event.Attributes)
	recorder.spans = append(recorder.spans, event)
}

func (recorder *recordingTraceLogRecorder) RecordLog(event selfobs.LogEvent) {
	event.Attributes = copyStringMap(event.Attributes)
	recorder.logs = append(recorder.logs, event)
}

func (recorder *recordingTraceLogRecorder) Flush(context.Context) error {
	return nil
}

func (recorder *recordingTraceLogRecorder) Shutdown(context.Context) error {
	return nil
}

func copyStringMap(value map[string]string) map[string]string {
	copied := make(map[string]string, len(value))
	for key, item := range value {
		copied[key] = item
	}
	return copied
}

type recordingRequester struct {
	responses       map[string]any
	requestSubjects []string
	requestPayloads []map[string]any
	publishSubjects []string
}

func (requester *recordingRequester) RequestWithContext(_ context.Context, subject string, data []byte) (*Message, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, errors.New("empty request")
	}
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, err
	}
	requester.requestPayloads = append(requester.requestPayloads, payload)
	requester.requestSubjects = append(requester.requestSubjects, subject)
	response, ok := requester.responses[subject]
	if !ok {
		return nil, errors.New("missing response")
	}
	responseData, err := json.Marshal(response)
	if err != nil {
		return nil, err
	}
	return &Message{Data: responseData}, nil
}

func (requester *recordingRequester) Publish(subject string, data []byte) error {
	if len(bytes.TrimSpace(data)) == 0 {
		return errors.New("empty publish")
	}
	requester.publishSubjects = append(requester.publishSubjects, subject)
	return nil
}

func decodeRuntimeResponse(t *testing.T, data []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(data, target); err != nil {
		t.Fatalf("response is not JSON: %v; payload=%s", err, string(data))
	}
}

func sequenceRuntimeIDs(ids ...string) func() string {
	index := 0
	return func() string {
		if index >= len(ids) {
			panic("test id sequence exhausted")
		}
		id := ids[index]
		index++
		return id
	}
}

func stringPtr(value string) *string {
	return &value
}

func sameStringSet(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	counts := map[string]int{}
	for _, value := range left {
		counts[value]++
	}
	for _, value := range right {
		counts[value]--
	}
	for _, count := range counts {
		if count != 0 {
			return false
		}
	}
	return true
}
