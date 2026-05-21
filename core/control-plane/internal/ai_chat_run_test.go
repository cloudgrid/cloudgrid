package internal

import (
	"context"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestAiChatRunLifecycleIsIdempotentAndDurable(t *testing.T) {
	store := newTestStore()
	service := NewService(store, func() time.Time {
		return time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	})
	if _, err := service.GetViewer(context.Background(), localEnvelope("req-bootstrap", localUserID, ptr(LocalProjectID))); err != nil {
		t.Fatalf("bootstrap local viewer: %v", err)
	}
	seedAiChatConversation(t, store, "chat-1", nowish(service))
	request := contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      localEnvelope("req-create", localUserID, ptr(LocalProjectID)),
		ConversationID:      "chat-1",
		ProjectID:           LocalProjectID,
		UserID:              localUserID,
		UserMessageClientID: "client-message-1",
		IdempotencyKey:      "idempotency-key-0001",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-5-mini",
	}

	run, err := service.CreateAiChatRun(context.Background(), request)
	if err != nil {
		t.Fatalf("CreateAiChatRun error = %v", err)
	}
	if run.ID == "" || run.Status != contracts.AiChatRunStatusStreaming {
		t.Fatalf("created run = %#v, want streaming run with ID", run)
	}

	if _, err := service.CreateAiChatRun(context.Background(), request); err == nil {
		t.Fatal("duplicate active run succeeded, want idempotency error")
	} else if bridgeErr := BridgeErrorFromError(err); bridgeErr.ID != "ERR-001" || bridgeErr.Details["runId"] != run.ID || bridgeErr.Details["status"] != string(contracts.AiChatRunStatusStreaming) {
		t.Fatalf("duplicate active error = %#v, want ERR-001 with run details", bridgeErr)
	}

	finalized, err := service.FinalizeAiChatRun(context.Background(), contracts.AiChatRunFinalizeRequest{
		BridgeEnvelope:     localEnvelope("req-finalize", localUserID, ptr(LocalProjectID)),
		RunID:              run.ID,
		Status:             contracts.AiChatRunStatusCompleted,
		InputTokenCount:    ptr(12),
		OutputTokenCount:   ptr(4),
		EstimatedCostUSD:   ptr(0.002),
		ToolCallCount:      ptr(1),
		SandboxScriptCount: ptr(0),
		ArtifactCount:      ptr(0),
	})
	if err != nil {
		t.Fatalf("FinalizeAiChatRun error = %v", err)
	}
	if finalized.Status != contracts.AiChatRunStatusCompleted || finalized.CompletedAt == nil {
		t.Fatalf("finalized run = %#v, want completed terminal run", finalized)
	}

	if _, err := service.CreateAiChatRun(context.Background(), request); err == nil {
		t.Fatal("duplicate completed run succeeded, want idempotency error")
	} else if bridgeErr := BridgeErrorFromError(err); bridgeErr.ID != "ERR-001" || bridgeErr.Details["runId"] != run.ID || bridgeErr.Details["status"] != string(contracts.AiChatRunStatusCompleted) {
		t.Fatalf("duplicate completed error = %#v, want ERR-001 with terminal run details", bridgeErr)
	}
}

func TestAiChatRunIdempotencyWindowExpiresAfterSevenDays(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	store := newTestStore()
	service := NewService(store, func() time.Time { return now })
	if _, err := service.GetViewer(context.Background(), localEnvelope("req-bootstrap", localUserID, ptr(LocalProjectID))); err != nil {
		t.Fatalf("bootstrap local viewer: %v", err)
	}
	seedAiChatConversation(t, store, "chat-1", now)
	oldRun := ports.AiChatRunRecord{
		ID:                  "run_old",
		ConversationID:      "chat-1",
		ProjectID:           LocalProjectID,
		UserID:              localUserID,
		UserMessageClientID: "client-message-1",
		IdempotencyKey:      "idempotency-key-0001",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-5-mini",
		Status:              contracts.AiChatRunStatusCompleted,
		StartedAt:           now.Add(-8 * 24 * time.Hour),
		UpdatedAt:           now.Add(-8 * 24 * time.Hour),
	}
	if err := store.PutAiChatRun(context.Background(), oldRun); err != nil {
		t.Fatalf("seed old run: %v", err)
	}

	run, err := service.CreateAiChatRun(context.Background(), contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      localEnvelope("req-create", localUserID, ptr(LocalProjectID)),
		ConversationID:      "chat-1",
		ProjectID:           LocalProjectID,
		UserID:              localUserID,
		UserMessageClientID: "client-message-1",
		IdempotencyKey:      "idempotency-key-0001",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-5-mini",
	})
	if err != nil {
		t.Fatalf("CreateAiChatRun with expired idempotency key error = %v", err)
	}
	if run.ID == oldRun.ID {
		t.Fatalf("run ID = %q, want a new run after dedupe window", run.ID)
	}
}

func seedAiChatConversation(t *testing.T, store *testStore, id string, now time.Time) {
	t.Helper()
	if err := store.PutAiChatConversation(context.Background(), ports.AiChatConversationRecord{
		ID:            id,
		CompanyID:     LocalCompanyID,
		ProjectID:     LocalProjectID,
		UserID:        localUserID,
		Title:         "Investigate errors",
		Status:        contracts.AiChatConversationStatusActive,
		LastMessageAt: now,
		LastRunStatus: string(contracts.AiChatRunStatusIdle),
		CreatedAt:     now,
		UpdatedAt:     now,
		Version:       1,
	}); err != nil {
		t.Fatalf("seed AI Chat conversation: %v", err)
	}
}

func nowish(service *Service) time.Time {
	return service.now().UTC()
}
