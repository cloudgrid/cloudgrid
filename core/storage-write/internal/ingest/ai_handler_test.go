package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestEnsureJetStreamIncludesAIProjectionSubject(t *testing.T) {
	js := &fakeJetStreamManager{}

	if err := EnsureJetStream(js); err != nil {
		t.Fatalf("EnsureJetStream() error = %v", err)
	}

	subjects := strings.Join(js.stream.Subjects, ",")
	if !strings.Contains(subjects, AiProjectionSubject) {
		t.Fatalf("stream subjects = %#v, want %q", js.stream.Subjects, AiProjectionSubject)
	}
}

func TestHandleAIProjectionMessagePersistsPublishesAndAcks(t *testing.T) {
	store := &fakeAIWriteStore{}
	publisher := &fakeAIEventPublisher{projectionStore: store}
	msg := newFakeMessageForData(t, AiProjectionSubject, validAIProjectionCommand())

	HandleAIProjectionMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.projectionExistsCalls != 1 || store.persistProjectionCalls != 1 {
		t.Fatalf("store calls exists=%d persist=%d, want 1/1", store.projectionExistsCalls, store.persistProjectionCalls)
	}
	if store.persistProjectionSubject != AiProjectionSubject {
		t.Fatalf("persist subject = %q, want %q", store.persistProjectionSubject, AiProjectionSubject)
	}
	if len(publisher.projectionNotifications) != 1 {
		t.Fatalf("projection notifications = %d, want 1", len(publisher.projectionNotifications))
	}
	notification := publisher.projectionNotifications[0]
	if notification.RequestID != "req-ai-1" || notification.TraceID != "trace-1" {
		t.Fatalf("notification = %#v", notification)
	}
	if strings.Join(notification.ProjectionIDs, ",") != "agent-run-1" {
		t.Fatalf("projection ids = %#v", notification.ProjectionIDs)
	}
	if strings.Join(notification.SpanIDs, ",") != "span-1" {
		t.Fatalf("span ids = %#v", notification.SpanIDs)
	}
	if len(notification.Kinds) != 1 || notification.Kinds[0] != contracts.AiProjectionKindAgentRun {
		t.Fatalf("kinds = %#v", notification.Kinds)
	}
	if notification.TenantID == nil || *notification.TenantID != "tenant_1" ||
		notification.ProjectID == nil || *notification.ProjectID != "project_1" {
		t.Fatalf("routing context = %#v", notification)
	}
	if publisher.projectionCallsBeforePersist[0] != 1 {
		t.Fatalf("publish saw persist calls = %d, want 1", publisher.projectionCallsBeforePersist[0])
	}
}

func TestHandleAIProjectionMessageAcksDuplicateWithoutPublishing(t *testing.T) {
	store := &fakeAIWriteStore{projectionDuplicate: true}
	publisher := &fakeAIEventPublisher{}
	msg := newFakeMessageForData(t, AiProjectionSubject, validAIProjectionCommand())

	HandleAIProjectionMessage(context.Background(), msg, store, publisher, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.persistProjectionCalls != 0 {
		t.Fatalf("persist projection calls = %d, want 0", store.persistProjectionCalls)
	}
	if len(publisher.projectionNotifications) != 0 {
		t.Fatalf("projection notifications = %d, want 0", len(publisher.projectionNotifications))
	}
}

func TestHandleAIProjectionMessageNaksStorageFailure(t *testing.T) {
	store := &fakeAIWriteStore{projectionPersistErr: errors.New("ERR-006 STORAGE_UNAVAILABLE: down")}
	msg := newFakeMessageForData(t, AiProjectionSubject, validAIProjectionCommand())
	msg.attempt = 7

	HandleAIProjectionMessage(context.Background(), msg, store, &fakeAIEventPublisher{}, testLogger(t), fixedClock)

	if msg.acked || !msg.naked {
		t.Fatalf("ack=%v nak=%v, want nak only", msg.acked, msg.naked)
	}
	if msg.nakDelay != 5*time.Second {
		t.Fatalf("nak delay = %s, want capped 5s", msg.nakDelay)
	}
}

func TestHandleAIProjectionMessageAcksValidationFailure(t *testing.T) {
	store := &fakeAIWriteStore{}
	msg := newFakeMessageForData(t, AiProjectionSubject, validAIProjectionCommand())
	msg.data = []byte(`{"requestId":"req-ai-1","issuedAt":"2026-05-08T08:00:00Z","commandId":"","traceId":"trace-1","spanId":"span-1","kind":"agent_run","projection":{"id":"agent-run-1"}}`)

	HandleAIProjectionMessage(context.Background(), msg, store, &fakeAIEventPublisher{}, testLogger(t), fixedClock)

	if !msg.acked || msg.naked {
		t.Fatalf("ack=%v nak=%v, want ack only", msg.acked, msg.naked)
	}
	if store.projectionExistsCalls != 0 || store.persistProjectionCalls != 0 {
		t.Fatalf("store calls exists=%d persist=%d, want none", store.projectionExistsCalls, store.persistProjectionCalls)
	}
}

func TestHandleEvalMutationRequestPersistsDatasetCreate(t *testing.T) {
	store := &fakeAIWriteStore{}
	publisher := &fakeAIEventPublisher{}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-dataset-1", IssuedAt: fixedClock()},
		Input: map[string]any{
			"name":        "golden answers",
			"description": "baseline",
			"tags":        []any{"smoke"},
		},
	}

	response := HandleEvalMutationRequest(context.Background(), EvalDatasetCreateSubject, request, store, publisher, fixedClock)

	if !response.OK || response.Error != nil {
		t.Fatalf("response = %#v, want ok", response)
	}
	if store.evalMutationCalls != 1 {
		t.Fatalf("eval mutation calls = %d, want 1", store.evalMutationCalls)
	}
	if store.evalMutationSubject != EvalDatasetCreateSubject {
		t.Fatalf("eval mutation subject = %q", store.evalMutationSubject)
	}
	if response.Data["id"] == "" || response.Data["version"] != 1 || response.Data["itemCount"] != 0 {
		t.Fatalf("response data = %#v", response.Data)
	}
}

func TestHandleEvalMutationRequestPersistsEvalResultsAndProgress(t *testing.T) {
	store := &fakeAIWriteStore{}
	publisher := &fakeAIEventPublisher{evalStore: store}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-results-1", IssuedAt: fixedClock()},
		Input: map[string]any{
			"experimentRunId": "run-1",
			"itemRuns": []any{map[string]any{
				"id":              "item-run-1",
				"experimentRunId": "run-1",
				"datasetItemId":   "item-1",
				"output":          map[string]any{"answer": "42"},
				"latencyMs":       12.0,
			}},
			"results": []any{map[string]any{
				"id":              "result-1",
				"scorerId":        "scorer-1",
				"scorerVersion":   1.0,
				"targetKind":      "datasetItemRun",
				"targetId":        "item-run-1",
				"experimentRunId": "run-1",
				"score":           1.0,
				"passed":          true,
				"producedAt":      fixedClock().Format(time.RFC3339),
			}},
		},
	}

	response := HandleEvalMutationRequest(context.Background(), EvalResultsPersistSubject, request, store, publisher, fixedClock)

	if !response.OK || response.Error != nil {
		t.Fatalf("response = %#v, want ok", response)
	}
	if store.evalMutationCalls != 1 {
		t.Fatalf("eval mutation calls = %d, want 1", store.evalMutationCalls)
	}
	if len(publisher.progressNotifications) != 1 {
		t.Fatalf("progress notifications = %d, want 1", len(publisher.progressNotifications))
	}
	notification := publisher.progressNotifications[0]
	if notification.RequestID != "req-results-1" || notification.ExperimentRunID != "run-1" || notification.Type != "item_completed" {
		t.Fatalf("progress notification = %#v", notification)
	}
	if notification.DatasetItemRunID == nil || *notification.DatasetItemRunID != "item-run-1" {
		t.Fatalf("dataset item run id = %#v", notification.DatasetItemRunID)
	}
	if publisher.progressCallsBeforePersist[0] != 1 {
		t.Fatalf("publish saw persist calls = %d, want 1", publisher.progressCallsBeforePersist[0])
	}
}

func TestHandleEvalMutationRequestPersistsOnlineEvalResultWithoutExperimentRun(t *testing.T) {
	store := &fakeAIWriteStore{}
	publisher := &fakeAIEventPublisher{evalStore: store}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-online-result-1", IssuedAt: fixedClock()},
		Input: map[string]any{
			"results": []any{map[string]any{
				"id":            "result-online-1",
				"scorerId":      "scorer-1",
				"scorerVersion": 1.0,
				"targetKind":    "agentRun",
				"targetId":      "agent-run-1",
				"score":         1.0,
				"passed":        true,
				"producedAt":    fixedClock().Format(time.RFC3339),
				"evidence":      map[string]any{"online": true, "policyId": "policy-1"},
			}},
		},
	}

	response := HandleEvalMutationRequest(context.Background(), EvalResultsPersistSubject, request, store, publisher, fixedClock)

	if !response.OK || response.Error != nil {
		t.Fatalf("response = %#v, want ok", response)
	}
	if response.Data["experimentRunId"] != nil {
		t.Fatalf("experimentRunId = %#v, want omitted/empty for online result", response.Data["experimentRunId"])
	}
	if len(publisher.progressNotifications) != 0 {
		t.Fatalf("progress notifications = %d, want none for online result", len(publisher.progressNotifications))
	}
}

func TestHandleEvalMutationRequestPersistsAnnotationUpdate(t *testing.T) {
	store := &fakeAIWriteStore{}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-annotation-1", IssuedAt: fixedClock()},
		Input: map[string]any{
			"annotationQueueItemId": "annotation-1",
			"datasetItemId":         "item-1",
			"status":                "resolved",
		},
	}

	response := HandleEvalMutationRequest(context.Background(), AnnotationItemUpdateSubject, request, store, &fakeAIEventPublisher{}, fixedClock)

	if !response.OK || response.Error != nil {
		t.Fatalf("response = %#v, want ok", response)
	}
	if store.evalMutationSubject != AnnotationItemUpdateSubject {
		t.Fatalf("eval mutation subject = %q", store.evalMutationSubject)
	}
	if response.Data["id"] != "annotation-1" || response.Data["status"] != "resolved" {
		t.Fatalf("response data = %#v", response.Data)
	}
}

func TestHandleEvalMutationRequestCommitsDatasetImportByAppendingValidRows(t *testing.T) {
	root := stageUploadForTest(t, "upload-import-commit", "items.jsonl", []byte("{\"prompt\":\"hi\",\"answer\":\"hello\"}\n"))
	t.Setenv("CLOUDGRID_DATASET_TRANSFER_DIR", root)
	store := &fakeAIWriteStore{}
	prepare := datasetImportPrepareRequest("upload-import-commit", "jsonl")

	prepareResponse := HandleEvalMutationRequest(context.Background(), EvalDatasetImportPrepareSubject, prepare, store, &fakeAIEventPublisher{}, fixedClock)
	if !prepareResponse.OK || prepareResponse.Error != nil {
		t.Fatalf("prepare response = %#v, want ok", prepareResponse)
	}

	commit := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-import-commit", IssuedAt: fixedClock()},
		Input: map[string]any{
			"importId":               prepareResponse.Data["id"],
			"expectedDatasetVersion": 1,
			"mode":                   "valid_rows_only",
		},
	}

	response := HandleEvalMutationRequest(context.Background(), EvalDatasetImportCommitSubject, commit, store, &fakeAIEventPublisher{}, fixedClock)

	if !response.OK || response.Error != nil {
		t.Fatalf("commit response = %#v, want ok", response)
	}
	if !containsString(store.evalMutationSubjects, EvalDatasetItemsAppendSubject) {
		t.Fatalf("eval mutation subjects = %#v, want %q", store.evalMutationSubjects, EvalDatasetItemsAppendSubject)
	}
}

func TestHandleEvalMutationRequestSupportsDatasetAppendPromoteAndPromptPromotion(t *testing.T) {
	tests := []struct {
		name       string
		subject    string
		input      map[string]any
		wantFields map[string]any
	}{
		{
			name:    "append dataset item",
			subject: EvalDatasetItemsAppendSubject,
			input: map[string]any{
				"datasetId": "dataset-1",
				"version":   2.0,
				"items": []any{map[string]any{
					"id":       "item-1",
					"input":    map[string]any{"question": "2+2"},
					"expected": map[string]any{"answer": "4"},
					"metadata": map[string]any{"source": "manual"},
					"split":    "validation",
				}},
			},
			wantFields: map[string]any{"datasetId": "dataset-1", "version": 2},
		},
		{
			name:    "promote trace to dataset item",
			subject: EvalDatasetItemPromoteSubject,
			input: map[string]any{
				"datasetId":     "dataset-1",
				"sourceTraceId": "trace-1",
				"sourceSpanId":  "span-1",
				"split":         "regression",
				"metadata":      map[string]any{"reviewed": true},
			},
			wantFields: map[string]any{"datasetId": "dataset-1", "sourceTraceId": "trace-1", "sourceSpanId": "span-1"},
		},
		{
			name:    "promote prompt version",
			subject: EvalPromptVersionPromoteSubject,
			input: map[string]any{
				"promptVersionId": "prompt-1",
				"tag":             "production",
				"notes":           "reviewed candidate",
			},
			wantFields: map[string]any{"id": "prompt-1", "tag": "production"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := &fakeAIWriteStore{}
			request := contracts.EvalMutationRequest{
				BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-" + tt.name, IssuedAt: fixedClock()},
				Input:          tt.input,
			}

			response := HandleEvalMutationRequest(context.Background(), tt.subject, request, store, &fakeAIEventPublisher{}, fixedClock)

			if !response.OK || response.Error != nil {
				t.Fatalf("response = %#v, want ok", response)
			}
			if store.evalMutationSubject != tt.subject {
				t.Fatalf("eval mutation subject = %q, want %q", store.evalMutationSubject, tt.subject)
			}
			for field, want := range tt.wantFields {
				if response.Data[field] != want {
					t.Fatalf("response field %s = %#v, want %#v in %#v", field, response.Data[field], want, response.Data)
				}
			}
		})
	}
}

func TestHandleEvalMutationRequestRejectsInvalidInputWithoutStoreCall(t *testing.T) {
	store := &fakeAIWriteStore{}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-invalid-1", IssuedAt: fixedClock()},
		Input:          map[string]any{"name": ""},
	}

	response := HandleEvalMutationRequest(context.Background(), EvalDatasetCreateSubject, request, store, &fakeAIEventPublisher{}, fixedClock)

	if response.OK || response.Error == nil {
		t.Fatalf("response = %#v, want validation error", response)
	}
	if response.Error.ID != "ERR-001" || response.Error.Code != "VALIDATION_FAILED" {
		t.Fatalf("error = %#v, want ERR-001", response.Error)
	}
	if store.evalMutationCalls != 0 {
		t.Fatalf("eval mutation calls = %d, want 0", store.evalMutationCalls)
	}
}

func TestHandleEvalMutationRequestReturnsStorageError(t *testing.T) {
	store := &fakeAIWriteStore{evalMutationErr: errors.New("ERR-006 STORAGE_UNAVAILABLE: down")}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-dataset-1", IssuedAt: fixedClock()},
		Input:          map[string]any{"name": "golden answers"},
	}

	response := HandleEvalMutationRequest(context.Background(), EvalDatasetCreateSubject, request, store, &fakeAIEventPublisher{}, fixedClock)

	if response.OK || response.Error == nil {
		t.Fatalf("response = %#v, want storage error", response)
	}
	if response.Error.ID != "ERR-006" || response.Error.Code != "STORAGE_UNAVAILABLE" || !response.Error.Retryable {
		t.Fatalf("error = %#v, want retryable storage error", response.Error)
	}
}

func TestHandleEvalMutationMessageRespondsWithMutationResponse(t *testing.T) {
	store := &fakeAIWriteStore{}
	request := contracts.EvalMutationRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-message-1", IssuedAt: fixedClock()},
		Input:          map[string]any{"name": "golden answers"},
	}
	msg := newFakeRequestMessage(t, EvalDatasetCreateSubject, request)

	HandleEvalMutationMessage(context.Background(), msg, store, &fakeAIEventPublisher{}, testLogger(t), fixedClock)

	if !msg.responded {
		t.Fatal("message was not responded to")
	}
	var response contracts.EvalMutationResponse
	if err := json.Unmarshal(msg.responseData, &response); err != nil {
		t.Fatalf("response is not EvalMutationResponse JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-message-1" {
		t.Fatalf("response = %#v", response)
	}
}

func TestNATSAIEventPublisherPublishesConfiguredSubjects(t *testing.T) {
	js := &fakeNotificationJetStream{}
	publisher := natsAIEventPublisher{js: js}

	if err := publisher.PublishAIProjectionPersisted(context.Background(), contracts.AiProjectionPersistedNotification{
		RequestID:     "req-ai-1",
		TraceID:       "trace-1",
		ProjectionIDs: []string{"agent-run-1"},
		Kinds:         []contracts.AiProjectionKind{contracts.AiProjectionKindAgentRun},
		PersistedAt:   fixedClock(),
	}); err != nil {
		t.Fatalf("PublishAIProjectionPersisted() error = %v", err)
	}
	if js.subject != AiProjectionPersistedSubject {
		t.Fatalf("projection notification subject = %q, want %q", js.subject, AiProjectionPersistedSubject)
	}

	if err := publisher.PublishExperimentProgress(context.Background(), contracts.ExperimentProgressNotification{
		RequestID:       "req-progress-1",
		ExperimentRunID: "run-1",
		Type:            "finished",
		OccurredAt:      fixedClock(),
	}); err != nil {
		t.Fatalf("PublishExperimentProgress() error = %v", err)
	}
	if js.subject != EvalExperimentProgressSubject {
		t.Fatalf("progress subject = %q, want %q", js.subject, EvalExperimentProgressSubject)
	}
}

func newFakeMessageForData(t *testing.T, subject string, value any) *fakeMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return &fakeMessage{subject: subject, data: data, attempt: 1}
}

func newFakeRequestMessage(t *testing.T, subject string, value any) *fakeRequestMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return &fakeRequestMessage{subject: subject, data: data}
}

type fakeRequestMessage struct {
	subject      string
	data         []byte
	responded    bool
	responseData []byte
}

func (msg *fakeRequestMessage) Subject() string {
	return msg.subject
}

func (msg *fakeRequestMessage) Data() []byte {
	return msg.data
}

func (msg *fakeRequestMessage) Respond(data []byte) error {
	msg.responded = true
	msg.responseData = append([]byte(nil), data...)
	return nil
}

type fakeAIWriteStore struct {
	projectionDuplicate      bool
	projectionExistsErr      error
	projectionPersistErr     error
	evalMutationErr          error
	projectionExistsCalls    int
	persistProjectionCalls   int
	persistProjectionSubject string
	evalMutationCalls        int
	evalMutationSubject      string
	evalMutationSubjects     []string
}

func (store *fakeAIWriteStore) AIProjectionCommandExists(_ context.Context, command contracts.PersistAiProjectionCommand) (bool, error) {
	store.projectionExistsCalls++
	if store.projectionExistsErr != nil {
		return false, store.projectionExistsErr
	}
	return store.projectionDuplicate && command.CommandID == "cmd-ai-1", nil
}

func (store *fakeAIWriteStore) PersistAIProjection(_ context.Context, command contracts.PersistAiProjectionCommand, subject string, _ time.Time) ([]string, error) {
	store.persistProjectionCalls++
	store.persistProjectionSubject = subject
	if store.projectionPersistErr != nil {
		return nil, store.projectionPersistErr
	}
	return []string{stringValue(command.Projection, "id")}, nil
}

func (store *fakeAIWriteStore) PersistEvalMutation(_ context.Context, subject string, request contracts.EvalMutationRequest, now time.Time) (map[string]any, error) {
	store.evalMutationCalls++
	store.evalMutationSubject = subject
	store.evalMutationSubjects = append(store.evalMutationSubjects, subject)
	if store.evalMutationErr != nil {
		return nil, store.evalMutationErr
	}
	return BuildEvalMutationRecord(subject, request, now)
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

type fakeAIEventPublisher struct {
	projectionNotifications      []contracts.AiProjectionPersistedNotification
	projectionCallsBeforePersist []int
	progressNotifications        []contracts.ExperimentProgressNotification
	progressCallsBeforePersist   []int
	projectionStore              *fakeAIWriteStore
	evalStore                    *fakeAIWriteStore
	err                          error
}

func (publisher *fakeAIEventPublisher) PublishAIProjectionPersisted(_ context.Context, notification contracts.AiProjectionPersistedNotification) error {
	publisher.projectionNotifications = append(publisher.projectionNotifications, notification)
	if publisher.projectionStore != nil {
		publisher.projectionCallsBeforePersist = append(publisher.projectionCallsBeforePersist, publisher.projectionStore.persistProjectionCalls)
	}
	return publisher.err
}

func (publisher *fakeAIEventPublisher) PublishExperimentProgress(_ context.Context, notification contracts.ExperimentProgressNotification) error {
	publisher.progressNotifications = append(publisher.progressNotifications, notification)
	if publisher.evalStore != nil {
		publisher.progressCallsBeforePersist = append(publisher.progressCallsBeforePersist, publisher.evalStore.evalMutationCalls)
	}
	return publisher.err
}

func validAIProjectionCommand() contracts.PersistAiProjectionCommand {
	tenantID := "tenant_1"
	projectID := "project_1"
	return contracts.PersistAiProjectionCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID: "req-ai-1",
			IssuedAt:  fixedClock(),
			AuthContext: &contracts.AuthContext{
				Mode:      "service",
				TenantID:  &tenantID,
				ProjectID: &projectID,
			},
		},
		CommandID: "cmd-ai-1",
		TraceID:   "trace-1",
		SpanID:    "span-1",
		Kind:      contracts.AiProjectionKindAgentRun,
		Projection: map[string]any{
			"id":         "agent-run-1",
			"traceId":    "trace-1",
			"rootSpanId": "span-1",
			"agent":      map[string]any{"name": "support-agent"},
			"startedAt":  fixedClock().Format(time.RFC3339),
			"status":     "ok",
		},
	}
}
