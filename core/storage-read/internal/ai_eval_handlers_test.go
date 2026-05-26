package internal

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestAiEvalQueryHandlerRoutesDeclaredQuerySubjects(t *testing.T) {
	allowed := true
	store := &aiEvalStoreForTest{
		responses: map[string]map[string]any{
			SubjectEvalDatasetSearch: {
				"items": []any{map[string]any{"id": "dataset-1"}},
			},
		},
	}
	request := contracts.EvalQueryRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-dataset-search",
			AuthContext: &contracts.AuthContext{ProjectID: ptr("project-1"), ReadAllowed: &allowed},
		},
		Input: map[string]any{"query": "checkout", "limit": float64(5)},
	}
	message := bridgeMessageForTest(SubjectEvalDatasetSearch, mustMarshalNATSHandlerTest(t, request))

	handleAiEvalQuery(store, nil, defaultQueryTimeout)(message)

	if len(store.calls) != 1 {
		t.Fatalf("query calls = %d, want one call", len(store.calls))
	}
	if store.calls[0].subject != SubjectEvalDatasetSearch {
		t.Fatalf("query subject = %q, want %q", store.calls[0].subject, SubjectEvalDatasetSearch)
	}
	if store.calls[0].input["query"] != "checkout" {
		t.Fatalf("query input = %#v, want original GraphQL-ready input", store.calls[0].input)
	}
	if store.calls[0].auth == nil || store.calls[0].auth.ProjectID == nil || *store.calls[0].auth.ProjectID != "project-1" {
		t.Fatalf("query auth = %#v, want request auth context threaded to store", store.calls[0].auth)
	}
	var response contracts.EvalQueryResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not eval query JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-dataset-search" {
		t.Fatalf("response = %#v, want ok req-dataset-search", response)
	}
	if len(response.Data["items"].([]any)) != 1 {
		t.Fatalf("response data = %#v, want GraphQL-ready items", response.Data)
	}
}

func TestAiEvalQueryHandlerRoutesV2TopLevelRequests(t *testing.T) {
	allowed := true
	store := &aiEvalStoreForTest{
		responses: map[string]map[string]any{
			SubjectEvalEvaluationRunGet: {
				"run": map[string]any{"id": "run-1"},
			},
		},
	}
	request := map[string]any{
		"requestId":       "req-run-get",
		"projectId":       "project-1",
		"evaluationRunId": "run-1",
		"authContext": map[string]any{
			"projectId":   "project-1",
			"readAllowed": allowed,
		},
	}
	message := bridgeMessageForTest(SubjectEvalEvaluationRunGet, mustMarshalNATSHandlerTest(t, request))

	handleAiEvalQuery(store, nil, defaultQueryTimeout)(message)

	if len(store.calls) != 1 {
		t.Fatalf("query calls = %d, want one call", len(store.calls))
	}
	call := store.calls[0]
	if call.subject != SubjectEvalEvaluationRunGet {
		t.Fatalf("query subject = %q, want %q", call.subject, SubjectEvalEvaluationRunGet)
	}
	if call.input["projectId"] != "project-1" || call.input["evaluationRunId"] != "run-1" {
		t.Fatalf("query input = %#v, want top-level typed request fields", call.input)
	}
	if call.auth == nil || call.auth.ProjectID == nil || *call.auth.ProjectID != "project-1" {
		t.Fatalf("query auth = %#v, want request auth context", call.auth)
	}
	var response contracts.EvalQueryResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not eval query JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-run-get" {
		t.Fatalf("response = %#v, want ok req-run-get", response)
	}
}

func TestDatasetCandidatesSearchHandlerRoutesTypedRequestAndAuthContext(t *testing.T) {
	allowed := true
	datasetID := "dataset-1"
	status := "ready"
	limit := 25
	cursor := "cursor-1"
	store := &aiEvalStoreForTest{
		responses: map[string]map[string]any{
			SubjectEvalDatasetCandidatesSearch: {
				"items":      []any{map[string]any{"id": "candidate-1"}},
				"nextCursor": "cursor-2",
			},
		},
	}
	request := contracts.DatasetCandidatesSearchRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   "req-candidates",
			AuthContext: &contracts.AuthContext{ProjectID: ptr("project-1"), ReadAllowed: &allowed},
		},
		DatasetID: &datasetID,
		Status:    &status,
		Limit:     &limit,
		Cursor:    &cursor,
	}
	message := bridgeMessageForTest(SubjectEvalDatasetCandidatesSearch, mustMarshalNATSHandlerTest(t, request))

	handleDatasetCandidatesSearch(store, nil, defaultQueryTimeout)(message)

	if len(store.calls) != 1 {
		t.Fatalf("candidate search calls = %d, want one", len(store.calls))
	}
	call := store.calls[0]
	if call.subject != SubjectEvalDatasetCandidatesSearch {
		t.Fatalf("candidate subject = %q, want %q", call.subject, SubjectEvalDatasetCandidatesSearch)
	}
	if call.input["datasetId"] != "dataset-1" || call.input["status"] != "ready" || call.input["limit"] != 25 || call.input["cursor"] != "cursor-1" {
		t.Fatalf("candidate input = %#v, want typed request fields", call.input)
	}
	if call.auth == nil || call.auth.ProjectID == nil || *call.auth.ProjectID != "project-1" {
		t.Fatalf("candidate auth = %#v, want request auth context", call.auth)
	}
	var response contracts.EvalQueryResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not candidate search JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-candidates" || response.Data["nextCursor"] != "cursor-2" {
		t.Fatalf("response = %#v, want candidate response data", response)
	}
}

func TestAiEvalQueryHandlerReturnsBridgeErrorWhenResponseCannotBeEncoded(t *testing.T) {
	store := &aiEvalStoreForTest{
		responses: map[string]map[string]any{
			SubjectEvalQualityOverview: {"value": math.Inf(1)},
		},
	}
	request := contracts.EvalQueryRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-unencodable-response"},
		Input:          map[string]any{"projectId": "default"},
	}
	message := bridgeMessageForTest(SubjectEvalQualityOverview, mustMarshalNATSHandlerTest(t, request))

	handleAiEvalQuery(store, nil, defaultQueryTimeout)(message)

	var response contracts.EvalQueryResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not eval query JSON: %v", err)
	}
	if response.OK || response.RequestID != "req-unencodable-response" {
		t.Fatalf("response = %#v, want failed request req-unencodable-response", response)
	}
	if response.Error == nil || response.Error.ID != "ERR-013" {
		t.Fatalf("response error = %#v, want ERR-013", response.Error)
	}
}

func TestAiEvalQueryHandlerRejectsInvalidJSONAndStoreFailures(t *testing.T) {
	tests := []struct {
		name      string
		store     AiEvalQueryStore
		data      []byte
		requestID string
		wantID    string
	}{
		{
			name:      "invalid JSON",
			store:     &aiEvalStoreForTest{},
			data:      []byte("{"),
			requestID: "",
			wantID:    "ERR-001",
		},
		{
			name:      "store failure",
			store:     &aiEvalStoreForTest{err: errors.New("ERR-006 STORAGE_UNAVAILABLE: unavailable")},
			data:      mustMarshalNATSHandlerTest(t, contracts.EvalQueryRequest{BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-store-failure"}}),
			requestID: "req-store-failure",
			wantID:    "ERR-006",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			message := bridgeMessageForTest(SubjectEvalResultsSearch, tt.data)

			handleAiEvalQuery(tt.store, nil, defaultQueryTimeout)(message)

			var response contracts.EvalQueryResponse
			if err := json.Unmarshal(message.response, &response); err != nil {
				t.Fatalf("response is not eval query JSON: %v", err)
			}
			if response.OK || response.RequestID != tt.requestID {
				t.Fatalf("response = %#v, want failed request %q", response, tt.requestID)
			}
			if response.Error == nil || response.Error.ID != tt.wantID {
				t.Fatalf("response error = %#v, want %s", response.Error, tt.wantID)
			}
		})
	}
}

func TestOnlinePolicyMatchesResolveHandlerRoutesTypedRequest(t *testing.T) {
	store := &aiEvalStoreForTest{
		onlineMatches: contracts.OnlinePolicyMatchesResolveData{
			Matches: []contracts.OnlinePolicyMatch{{
				PolicyID:      "policy-1",
				PolicyVersion: 1,
				PolicyName:    "production",
				SampleRate:    1,
				ScorerRefs: []contracts.OnlinePolicyScorerRef{{
					ScorerID:      "scorer-1",
					ScorerVersion: 1,
					Kind:          "deterministic",
				}},
			}},
			Projection: contracts.OnlinePolicyProjectionReadModel{
				ProjectID:      "project-1",
				TraceID:        "trace-1",
				ProjectionID:   "agent-run-1",
				Kind:           contracts.AiProjectionKindAgentRun,
				SafeAttributes: map[string]any{"answer": "helpful"},
			},
			Warnings: []string{"ignored disabled policy"},
		},
	}
	request := contracts.OnlinePolicyMatchesResolveRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-online-resolve"},
		ProjectID:      "project-1",
		TraceID:        "trace-1",
		ProjectionIDs:  []string{"agent-run-1"},
		SpanIDs:        []string{"span-1"},
		Kinds:          []contracts.AiProjectionKind{contracts.AiProjectionKindAgentRun},
		PersistedAt:    time.Date(2026, 5, 16, 9, 0, 0, 0, time.UTC),
	}
	message := bridgeMessageForTest(SubjectEvalOnlinePolicyMatchesResolve, mustMarshalNATSHandlerTest(t, request))

	handleOnlinePolicyMatchesResolve(store, nil, defaultQueryTimeout)(message)

	if len(store.onlineResolveRequests) != 1 {
		t.Fatalf("online resolve calls = %d, want one", len(store.onlineResolveRequests))
	}
	if store.onlineResolveRequests[0].ProjectID != "project-1" || store.onlineResolveRequests[0].ProjectionIDs[0] != "agent-run-1" {
		t.Fatalf("online resolve request = %#v", store.onlineResolveRequests[0])
	}
	var response contracts.OnlinePolicyMatchesResolveResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not online resolve JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-online-resolve" || response.Data == nil {
		t.Fatalf("response = %#v, want ok data", response)
	}
	if len(response.Data.Matches) != 1 || response.Data.Matches[0].PolicyID != "policy-1" {
		t.Fatalf("response matches = %#v", response.Data.Matches)
	}
}

func TestAiEvalMutationQueryHandlerRoutesDatasetExportStart(t *testing.T) {
	store := &aiEvalStoreForTest{
		responses: map[string]map[string]any{
			SubjectEvalDatasetExportStart: {"transferId": "export-1", "status": "ready"},
		},
	}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-export"},
		Input:          map[string]any{"datasetId": "dataset-1", "format": "jsonl"},
	}
	message := bridgeMessageForTest(SubjectEvalDatasetExportStart, mustMarshalNATSHandlerTest(t, request))

	handleAiEvalMutationQuery(store, nil, defaultQueryTimeout)(message)

	if len(store.calls) != 1 || store.calls[0].subject != SubjectEvalDatasetExportStart {
		t.Fatalf("calls = %#v, want dataset export start", store.calls)
	}
	var response contracts.EvalMutationResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not mutation JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-export" || response.Data["transferId"] != "export-1" {
		t.Fatalf("response = %#v, want export transfer data", response)
	}
}

func TestAiEvalMutationQueryAndManifestHandlersReturnBridgeErrors(t *testing.T) {
	t.Run("invalid mutation json", func(t *testing.T) {
		message := bridgeMessageForTest(SubjectEvalDatasetExportStart, []byte("{"))

		handleAiEvalMutationQuery(&aiEvalStoreForTest{}, nil, defaultQueryTimeout)(message)

		var response contracts.EvalMutationResponse
		if err := json.Unmarshal(message.response, &response); err != nil {
			t.Fatalf("response is not mutation JSON: %v", err)
		}
		if response.OK || response.Error == nil || response.Error.ID != "ERR-001" {
			t.Fatalf("response = %#v, want validation error", response)
		}
	})

	t.Run("mutation store failure", func(t *testing.T) {
		message := bridgeMessageForTest(SubjectEvalDatasetExportStart, mustMarshalNATSHandlerTest(t, contracts.EvalMutationRequest{
			BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-export-fail"},
			Input:          map[string]any{"datasetId": "dataset-1"},
		}))

		handleAiEvalMutationQuery(&aiEvalStoreForTest{err: errors.New("ERR-006 STORAGE_UNAVAILABLE: down")}, nil, defaultQueryTimeout)(message)

		var response contracts.EvalMutationResponse
		if err := json.Unmarshal(message.response, &response); err != nil {
			t.Fatalf("response is not mutation JSON: %v", err)
		}
		if response.OK || response.RequestID != "req-export-fail" || response.Error == nil || response.Error.ID != "ERR-006" {
			t.Fatalf("response = %#v, want storage error", response)
		}
	})

	t.Run("invalid manifest json", func(t *testing.T) {
		message := bridgeMessageForTest(SubjectEvalManifestResolve, []byte("{"))

		handleExperimentManifestResolve(&aiEvalStoreForTest{}, nil, defaultQueryTimeout)(message)

		var response contracts.ExperimentManifestResolveResponse
		if err := json.Unmarshal(message.response, &response); err != nil {
			t.Fatalf("response is not manifest JSON: %v", err)
		}
		if response.OK || response.Error == nil || response.Error.ID != "ERR-001" {
			t.Fatalf("response = %#v, want validation error", response)
		}
	})
}

func TestExperimentManifestResolveHandlerRoutesTypedRequest(t *testing.T) {
	store := &aiEvalStoreForTest{}
	request := contracts.ExperimentManifestResolveRequest{
		BridgeEnvelope:  contracts.BridgeEnvelope{RequestID: "req-manifest"},
		ExperimentRunID: "run-1",
		ExperimentID:    "experiment-1",
		SplitSelector:   map[string]any{"splits": []any{"validation"}},
	}
	message := bridgeMessageForTest(SubjectEvalManifestResolve, mustMarshalNATSHandlerTest(t, request))

	handleExperimentManifestResolve(store, nil, defaultQueryTimeout)(message)

	var response contracts.ExperimentManifestResolveResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not manifest JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-manifest" || response.Data == nil {
		t.Fatalf("response = %#v, want manifest", response)
	}
	if response.Data.Manifest.Digest != "digest-for-run-1" {
		t.Fatalf("manifest = %#v", response.Data.Manifest)
	}
}

func TestLiveHandlersRejectInvalidJSONAndValidationFailures(t *testing.T) {
	registry := NewEvalLiveRegistry(&aiEvalStoreForTest{}, &evalLivePublisherForTest{}, EvalLiveOptions{MaxSubscriptions: 1})

	startInvalid := bridgeMessageForTest(SubjectEvalLiveStart, []byte("{"))
	handleEvalLiveStart(registry, nil)(startInvalid)
	var startResponse contracts.EvalLiveStartResponse
	if err := json.Unmarshal(startInvalid.response, &startResponse); err != nil {
		t.Fatalf("start response JSON: %v", err)
	}
	if startResponse.OK || startResponse.Error == nil || startResponse.Error.ID != "ERR-001" {
		t.Fatalf("start response = %#v, want validation error", startResponse)
	}

	startMissingFields := bridgeMessageForTest(SubjectEvalLiveStart, mustMarshalNATSHandlerTest(t, contracts.EvalLiveStartRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-live-invalid"},
	}))
	handleEvalLiveStart(registry, nil)(startMissingFields)
	if err := json.Unmarshal(startMissingFields.response, &startResponse); err != nil {
		t.Fatalf("start validation response JSON: %v", err)
	}
	if startResponse.OK || startResponse.RequestID != "req-live-invalid" || startResponse.Error == nil {
		t.Fatalf("start validation response = %#v", startResponse)
	}

	stopInvalid := bridgeMessageForTest(SubjectEvalLiveStop, []byte("{"))
	handleEvalLiveStop(registry, nil)(stopInvalid)
	var stopResponse contracts.EvalLiveStopResponse
	if err := json.Unmarshal(stopInvalid.response, &stopResponse); err != nil {
		t.Fatalf("stop response JSON: %v", err)
	}
	if stopResponse.OK || stopResponse.Error == nil || stopResponse.Error.ID != "ERR-001" {
		t.Fatalf("stop response = %#v, want validation error", stopResponse)
	}

	stopMissing := bridgeMessageForTest(SubjectEvalLiveStop, mustMarshalNATSHandlerTest(t, contracts.EvalLiveStopRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-stop-missing"},
	}))
	handleEvalLiveStop(registry, nil)(stopMissing)
	if err := json.Unmarshal(stopMissing.response, &stopResponse); err != nil {
		t.Fatalf("stop validation response JSON: %v", err)
	}
	if stopResponse.OK || stopResponse.RequestID != "req-stop-missing" || stopResponse.Error == nil {
		t.Fatalf("stop validation response = %#v", stopResponse)
	}
}

func TestAiEvalLiveStartProgressFanoutAndStop(t *testing.T) {
	now := time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)
	publisher := &evalLivePublisherForTest{}
	registry := NewEvalLiveRegistry(&aiEvalStoreForTest{}, publisher, EvalLiveOptions{
		HeartbeatInterval: time.Second,
		MaxSubscriptions:  10,
		Now:               func() time.Time { return now },
	})

	startMessage := bridgeMessageForTest(SubjectEvalLiveStart, mustMarshalNATSHandlerTest(t, contracts.EvalLiveStartRequest{
		BridgeEnvelope:  contracts.BridgeEnvelope{RequestID: "req-live-start"},
		SubscriptionID:  "sub-1",
		ExperimentRunID: "experiment-run-1",
		SinkSubject:     "eval.live.events.bff-1.sub-1",
	}))
	handleEvalLiveStart(registry, nil)(startMessage)
	if registry.Count() != 1 {
		t.Fatalf("subscription count = %d, want one live eval subscription", registry.Count())
	}
	if len(publisher.events) != 1 {
		t.Fatalf("published events = %d, want initial heartbeat", len(publisher.events))
	}

	itemRunID := "item-run-1"
	notification := contracts.ExperimentProgressNotification{
		RequestID:        "req-progress",
		ExperimentRunID:  "experiment-run-1",
		Type:             "item_completed",
		DatasetItemRunID: &itemRunID,
		OccurredAt:       now.Add(time.Second),
	}
	handleExperimentProgressNotification(registry, nil, defaultQueryTimeout)(bridgeMessageForTest(SubjectEvalExperimentProgress, mustMarshalNATSHandlerTest(t, notification)))
	if len(publisher.events) != 2 {
		t.Fatalf("published events = %d, want heartbeat plus progress", len(publisher.events))
	}
	if publisher.events[1].subject != "eval.live.events.bff-1.sub-1" {
		t.Fatalf("event subject = %q, want sink subject", publisher.events[1].subject)
	}
	var event contracts.ExperimentRunEvent
	if err := json.Unmarshal(publisher.events[1].data, &event); err != nil {
		t.Fatalf("progress event is not JSON: %v", err)
	}
	if event.Type != "item_completed" || event.Seq != 2 || event.ExperimentRunID == nil || *event.ExperimentRunID != "experiment-run-1" {
		t.Fatalf("progress event = %#v, want item_completed seq 2 for experiment-run-1", event)
	}

	stopMessage := bridgeMessageForTest(SubjectEvalLiveStop, mustMarshalNATSHandlerTest(t, contracts.EvalLiveStopRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-live-stop"},
		SubscriptionID: "sub-1",
	}))
	handleEvalLiveStop(registry, nil)(stopMessage)
	if registry.Count() != 0 {
		t.Fatalf("subscription count = %d, want stop to remove live eval subscription", registry.Count())
	}

	handleExperimentProgressNotification(registry, nil, defaultQueryTimeout)(bridgeMessageForTest(SubjectEvalExperimentProgress, mustMarshalNATSHandlerTest(t, notification)))
	if len(publisher.events) != 2 {
		t.Fatalf("published events = %d, want no fanout after stop", len(publisher.events))
	}
}

func TestAiEvalStorageReadSubjectsExcludeMutationSubjects(t *testing.T) {
	handlers := aiEvalReadSubjectHandlers(&aiEvalStoreForTest{}, NewEvalLiveRegistry(&aiEvalStoreForTest{}, &evalLivePublisherForTest{}, EvalLiveOptions{}), nil, defaultQueryTimeout)

	for _, subject := range []string{
		SubjectEvalAgentRunsSearch,
		SubjectEvalDatasetSearch,
		SubjectEvalDatasetCandidatesSearch,
		SubjectEvalDatasetTransferGet,
		SubjectEvalDatasetVersionGet,
		SubjectEvalDatasetHealth,
		SubjectEvalScorerSearch,
		SubjectEvalExperimentSearch,
		SubjectEvalEvaluationSearch,
		SubjectEvalEvaluationRunSearch,
		SubjectEvalEvaluationRunGet,
		SubjectEvalResultsSearch,
		SubjectEvalEvaluationComparisonSearch,
		SubjectEvalTargetSnapshotGet,
		SubjectEvalTargetDiff,
		SubjectEvalOptimizationSearch,
		SubjectEvalOptimizationGet,
		SubjectEvalQualityOverview,
		SubjectEvalDatasetExportStart,
		SubjectEvalManifestResolve,
		SubjectEvalOnlinePolicyMatchesResolve,
		SubjectAnnotationQueueSearch,
		SubjectEvalLiveStart,
		SubjectEvalLiveStop,
		SubjectEvalExperimentProgress,
	} {
		if handlers[subject] == nil {
			t.Fatalf("missing storage-read handler for %s", subject)
		}
	}
	for _, subject := range []string{
		"eval.dataset.create",
		"eval.scorer.create",
		"eval.experiment.create",
		"eval.results.persist",
		"annotation.item.update",
		"eval.experiment.start",
		"eval.experiment.cancel",
		"eval.optimization.start",
	} {
		if handlers[subject] != nil {
			t.Fatalf("storage-read must not register mutation subject %s", subject)
		}
	}
}

type aiEvalQueryCallForTest struct {
	subject string
	input   map[string]any
	auth    *contracts.AuthContext
}

type aiEvalStoreForTest struct {
	responses             map[string]map[string]any
	onlineMatches         contracts.OnlinePolicyMatchesResolveData
	calls                 []aiEvalQueryCallForTest
	onlineResolveRequests []contracts.OnlinePolicyMatchesResolveRequest
	err                   error
}

func (store *aiEvalStoreForTest) QueryAiEval(ctx context.Context, subject string, input map[string]any, authContext *contracts.AuthContext) (map[string]any, error) {
	_ = ctx
	store.calls = append(store.calls, aiEvalQueryCallForTest{subject: subject, input: input, auth: authContext})
	if store.err != nil {
		return nil, store.err
	}
	if store.responses != nil && store.responses[subject] != nil {
		return store.responses[subject], nil
	}
	return map[string]any{"items": []any{}}, nil
}

func (store *aiEvalStoreForTest) GetExperimentRunEventData(ctx context.Context, notification contracts.ExperimentProgressNotification) (map[string]any, map[string]any, error) {
	_ = ctx
	if store.err != nil {
		return nil, nil, store.err
	}
	run := map[string]any{"id": notification.ExperimentRunID, "status": "running"}
	var itemRun map[string]any
	if notification.DatasetItemRunID != nil {
		itemRun = map[string]any{"id": *notification.DatasetItemRunID, "experimentRunId": notification.ExperimentRunID}
	}
	return run, itemRun, nil
}

func (store *aiEvalStoreForTest) ResolveExperimentManifest(ctx context.Context, request contracts.ExperimentManifestResolveRequest) (map[string]any, error) {
	_ = ctx
	if store.err != nil {
		return nil, store.err
	}
	return map[string]any{
		"schema":              "cloudgrid.ai-eval.experiment-manifest.v1",
		"version":             1,
		"digest":              "digest-for-" + request.ExperimentRunID,
		"experimentRunId":     request.ExperimentRunID,
		"experimentId":        request.ExperimentID,
		"datasetId":           "dataset-1",
		"datasetVersion":      1,
		"splitSelector":       map[string]any{"splits": []string{"validation"}, "reviewedOnly": true, "includeSynthetic": false},
		"datasetItemIds":      []string{"item-1"},
		"scorerRefs":          []map[string]any{{"id": "scorer-1", "version": 1}},
		"solverRef":           map[string]any{"kind": "agent", "name": "solver"},
		"promptVersionRefs":   []string{},
		"skillSnapshotRefs":   []string{},
		"toolSnapshotRefs":    []string{},
		"providerProfileRefs": []string{},
		"budget":              map[string]any{},
		"concurrency":         map[string]any{},
		"runPolicy":           map[string]any{"maxParallelRequests": 10},
		"createdAt":           "2026-05-18T11:00:00Z",
	}, nil
}

func (store *aiEvalStoreForTest) ResolveOnlinePolicyMatches(ctx context.Context, request contracts.OnlinePolicyMatchesResolveRequest) (contracts.OnlinePolicyMatchesResolveData, error) {
	_ = ctx
	store.onlineResolveRequests = append(store.onlineResolveRequests, request)
	if store.err != nil {
		return contracts.OnlinePolicyMatchesResolveData{}, store.err
	}
	return store.onlineMatches, nil
}

type evalLivePublisherForTest struct {
	events []evalLivePublishForTest
}

type evalLivePublishForTest struct {
	subject string
	data    []byte
}

func (publisher *evalLivePublisherForTest) Publish(subject string, data []byte) error {
	publisher.events = append(publisher.events, evalLivePublishForTest{subject: subject, data: append([]byte(nil), data...)})
	return nil
}
