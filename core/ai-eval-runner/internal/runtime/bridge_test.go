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
)

func TestSubjectHandlersExposeApprovedRunnerSubjects(t *testing.T) {
	service := NewRunnerService(orchestrator.NewRunner(orchestrator.RunnerConfig{}), nil)

	subjects := make([]string, 0, len(service.SubjectHandlers()))
	for subject := range service.SubjectHandlers() {
		subjects = append(subjects, subject)
	}

	want := []string{
		SubjectExperimentStart,
		SubjectExperimentCancel,
		SubjectOptimizationStart,
		SubjectPersistedProjections,
	}
	if !sameStringSet(subjects, want) {
		t.Fatalf("subjects = %#v, want %#v", subjects, want)
	}
}

func TestExperimentStartHandlerRoutesToRunnerAndRespondsWithRunData(t *testing.T) {
	reader := &runtimeReader{
		experiments: []ports.Experiment{{ID: "experiment-1", DatasetID: "dataset-1", DatasetVersion: 1, ScorerIDs: []string{"scorer-1"}}},
		items:       []ports.DatasetItem{{ID: "item-1", Input: map[string]any{"q": "x"}, Expected: map[string]any{"a": "y"}}},
		scorers:     []ports.Scorer{{ID: "scorer-1", Kind: ports.ScorerKindDeterministic, Version: 1}},
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
		IDGenerator:       sequenceRuntimeIDs("run-1", "item-run-1", "eval-result-1"),
	})
	msg := newRuntimeMessage(SubjectExperimentStart, contracts.ExperimentStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:    "req-start",
			IssuedAt:     time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC),
			TraceContext: map[string]any{"traceparent": "00-test"},
			AuthContext:  &contracts.AuthContext{ProjectID: stringPtr("project-1")},
		},
		ExperimentID: "experiment-1",
		SolverRef:    map[string]any{"adapter": "harness"},
	})

	NewRunnerService(runner, nil).SubjectHandlers()[SubjectExperimentStart](msg)

	var response contracts.EvalMutationResponse
	decodeRuntimeResponse(t, msg.response, &response)
	if !response.OK || response.Data["id"] != "run-1" || response.Data["status"] != ports.ExperimentRunStatusFinished {
		t.Fatalf("response = %#v, want finished run", response)
	}
	if !reflect.DeepEqual(reader.experimentSearches, []string{"experiment-1"}) {
		t.Fatalf("experiment searches = %#v", reader.experimentSearches)
	}
	if len(harness.runRequests) != 1 || harness.runRequests[0].TraceContext["traceparent"] != "00-test" {
		t.Fatalf("harness run requests = %#v", harness.runRequests)
	}
	if len(writer.persistedResults) != 1 {
		t.Fatalf("eval results persisted = %d, want 1", len(writer.persistedResults))
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
		data:    []byte(`{"requestId":"req-invalid","issuedAt":"2026-05-16T09:00:00Z","experimentId":"experiment-1","unexpected":true}`),
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

func TestNATSAdaptersUseApprovedBoundarySubjects(t *testing.T) {
	requester := &recordingRequester{
		responses: map[string]any{
			SubjectResultsPersist:       contracts.EvalMutationResponse{RequestID: "req", OK: true, Data: map[string]any{}},
			SubjectControlAISettingsGet: contracts.ProjectAiSettingsGetResponse{RequestID: "req", OK: true, Data: map[string]any{"settings": map[string]any{"projectId": "project-1", "budget": map[string]any{"dailyUsd": 10}}}},
		},
	}
	writer := NATSStorageWriter{Requester: requester}
	control := NATSControlPlane{Requester: requester}
	publisher := NATSProgressPublisher{Publisher: requester}

	if err := writer.PersistEvalResult(context.Background(), "eval-key", ports.EvalResult{ID: "result-1", ExperimentRunID: "run-1", TargetKind: "datasetItemRun", TargetID: "item-run-1", ScorerID: "scorer-1", ScorerVersion: 1}); err != nil {
		t.Fatalf("PersistEvalResult() error = %v", err)
	}
	if _, err := control.GetProjectAISettings(context.Background(), "project-1"); err != nil {
		t.Fatalf("GetProjectAISettings() error = %v", err)
	}
	if err := publisher.PublishExperimentProgress(context.Background(), ports.ExperimentProgress{ExperimentRunID: "run-1", Type: ports.ExperimentProgressStarted, OccurredAt: "2026-05-16T09:00:00Z"}); err != nil {
		t.Fatalf("PublishExperimentProgress() error = %v", err)
	}

	if !reflect.DeepEqual(requester.requestSubjects, []string{SubjectResultsPersist, SubjectControlAISettingsGet}) {
		t.Fatalf("request subjects = %#v", requester.requestSubjects)
	}
	if !reflect.DeepEqual(requester.publishSubjects, []string{SubjectExperimentProgress}) {
		t.Fatalf("publish subjects = %#v", requester.publishSubjects)
	}
}

func TestHarnessHTTPAdapterCallsHarnessOnlyWithTraceContext(t *testing.T) {
	var gotPath string
	var gotTraceparent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotTraceparent = r.Header.Get("traceparent")
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
		TraceContext:    map[string]string{"traceparent": "00-test"},
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
}

type runtimeMessage struct {
	subject  string
	data     []byte
	response []byte
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
	experiments        []ports.Experiment
	items              []ports.DatasetItem
	scorers            []ports.Scorer
	manifest           ports.ExperimentManifest
	experimentSearches []string
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

func (reader *runtimeReader) ResolveManifest(_ context.Context, _ ports.ManifestResolveRequest) (ports.ExperimentManifest, error) {
	return reader.manifest, nil
}

type runtimeWriter struct {
	persistedResults []ports.EvalResult
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

type recordingRequester struct {
	responses       map[string]any
	requestSubjects []string
	publishSubjects []string
}

func (requester *recordingRequester) RequestWithContext(_ context.Context, subject string, data []byte) (*Message, error) {
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, errors.New("empty request")
	}
	requester.requestSubjects = append(requester.requestSubjects, subject)
	response, ok := requester.responses[subject]
	if !ok {
		return nil, errors.New("missing response")
	}
	payload, err := json.Marshal(response)
	if err != nil {
		return nil, err
	}
	return &Message{Data: payload}, nil
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
