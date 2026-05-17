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
	store := &aiEvalStoreForTest{
		responses: map[string]map[string]any{
			SubjectEvalDatasetSearch: {
				"items": []any{map[string]any{"id": "dataset-1"}},
			},
		},
	}
	request := contracts.EvalQueryRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-dataset-search"},
		Input:          map[string]any{"query": "checkout", "limit": float64(5)},
	}
	message := bridgeMessageForTest(SubjectEvalDatasetSearch, mustMarshalNATSHandlerTest(t, request))

	handleAiEvalQuery(store, nil)(message)

	if len(store.calls) != 1 {
		t.Fatalf("query calls = %d, want one call", len(store.calls))
	}
	if store.calls[0].subject != SubjectEvalDatasetSearch {
		t.Fatalf("query subject = %q, want %q", store.calls[0].subject, SubjectEvalDatasetSearch)
	}
	if store.calls[0].input["query"] != "checkout" {
		t.Fatalf("query input = %#v, want original GraphQL-ready input", store.calls[0].input)
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

	handleAiEvalQuery(store, nil)(message)

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

			handleAiEvalQuery(tt.store, nil)(message)

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
				Projection: contracts.OnlinePolicyProjectionReadModel{
					ProjectID:      "project-1",
					TraceID:        "trace-1",
					ProjectionID:   "agent-run-1",
					Kind:           contracts.AiProjectionKindAgentRun,
					SafeAttributes: map[string]any{"answer": "helpful"},
				},
			}},
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

	handleOnlinePolicyMatchesResolve(store, nil)(message)

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
	handleExperimentProgressNotification(registry, nil)(bridgeMessageForTest(SubjectEvalExperimentProgress, mustMarshalNATSHandlerTest(t, notification)))
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

	handleExperimentProgressNotification(registry, nil)(bridgeMessageForTest(SubjectEvalExperimentProgress, mustMarshalNATSHandlerTest(t, notification)))
	if len(publisher.events) != 2 {
		t.Fatalf("published events = %d, want no fanout after stop", len(publisher.events))
	}
}

func TestAiEvalStorageReadSubjectsExcludeMutationSubjects(t *testing.T) {
	handlers := aiEvalReadSubjectHandlers(&aiEvalStoreForTest{}, NewEvalLiveRegistry(&aiEvalStoreForTest{}, &evalLivePublisherForTest{}, EvalLiveOptions{}), nil)

	for _, subject := range []string{
		SubjectEvalAgentRunsSearch,
		SubjectEvalDatasetSearch,
		SubjectEvalDatasetTransferGet,
		SubjectEvalDatasetHealth,
		SubjectEvalScorerSearch,
		SubjectEvalExperimentSearch,
		SubjectEvalResultsSearch,
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
}

type aiEvalStoreForTest struct {
	responses             map[string]map[string]any
	onlineMatches         contracts.OnlinePolicyMatchesResolveData
	calls                 []aiEvalQueryCallForTest
	onlineResolveRequests []contracts.OnlinePolicyMatchesResolveRequest
	err                   error
}

func (store *aiEvalStoreForTest) QueryAiEval(ctx context.Context, subject string, input map[string]any) (map[string]any, error) {
	_ = ctx
	store.calls = append(store.calls, aiEvalQueryCallForTest{subject: subject, input: input})
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
		"schema":          "cloudgrid.ai-eval.experiment-manifest.v1",
		"version":         1,
		"digest":          "digest-for-" + request.ExperimentRunID,
		"experimentRunId": request.ExperimentRunID,
		"experimentId":    request.ExperimentID,
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
