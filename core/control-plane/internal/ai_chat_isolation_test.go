package internal

import (
	"context"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestAiChatRejectsConversationWhoseCompanyDoesNotOwnProject(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-ai-chat-cross-company", localUserID, ptr(LocalProjectID))
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap local viewer: %v", err)
	}
	store.aiChatConversations["chat-cross-company"] = ports.AiChatConversationRecord{
		ID:            "chat-cross-company",
		CompanyID:     "other-company",
		ProjectID:     LocalProjectID,
		UserID:        localUserID,
		Title:         "Cross company",
		Status:        contracts.AiChatConversationStatusActive,
		LastMessageAt: fixedNow(),
		LastRunStatus: string(contracts.AiChatRunStatusIdle),
		CreatedAt:     fixedNow(),
		UpdatedAt:     fixedNow(),
		Version:       1,
	}

	if _, err := service.GetAiChatConversation(ctx, contracts.AiChatConversationGetRequest{
		BridgeEnvelope: admin,
		ConversationID: "chat-cross-company",
	}); !isForbidden(err) {
		t.Fatalf("GetAiChatConversation for cross-company conversation error = %v, want forbidden", err)
	}
	if _, err := service.CreateAiChatRun(ctx, contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      admin,
		ConversationID:      "chat-cross-company",
		ProjectID:           LocalProjectID,
		UserID:              localUserID,
		UserMessageClientID: "client-message-cross-company",
		IdempotencyKey:      "run-cross-company",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-4.1-mini",
	}); !isForbidden(err) {
		t.Fatalf("CreateAiChatRun for cross-company conversation error = %v, want forbidden", err)
	}
}

func TestAiChatDeleteRequiresCurrentProjectMatch(t *testing.T) {
	store := newTestStore()
	service := NewService(store, fixedNow)
	ctx := context.Background()
	admin := localEnvelope("req-ai-chat-delete", localUserID, ptr(LocalProjectID))
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap local viewer: %v", err)
	}
	conversation, err := service.CreateAiChatConversation(ctx, contracts.AiChatConversationCreateRequest{
		BridgeEnvelope:   admin,
		CompanyID:        LocalCompanyID,
		ProjectID:        LocalProjectID,
		UserID:           localUserID,
		FirstUserMessage: "Investigate deletion isolation",
	})
	if err != nil {
		t.Fatalf("CreateAiChatConversation returned error: %v", err)
	}
	mismatchedProjectID := "project-other"
	mismatched := admin
	mismatchedAuth := *admin.AuthContext
	mismatchedAuth.ProjectID = &mismatchedProjectID
	mismatched.AuthContext = &mismatchedAuth

	if _, err := service.DeleteAiChatConversation(ctx, contracts.AiChatConversationDeleteRequest{
		BridgeEnvelope: mismatched,
		ConversationID: conversation["id"].(string),
		UserID:         localUserID,
	}); !isForbidden(err) {
		t.Fatalf("DeleteAiChatConversation with mismatched current project error = %v, want forbidden", err)
	}
}

func TestAiChatActionApprovalUsesIdempotencyKeyAndPersistsContractFields(t *testing.T) {
	store := newTestStore()
	service := NewService(store, func() time.Time {
		return time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	})
	ctx := context.Background()
	admin := localEnvelope("req-ai-chat-approval", localUserID, ptr(LocalProjectID))
	if _, err := service.GetViewer(ctx, admin); err != nil {
		t.Fatalf("bootstrap local viewer: %v", err)
	}
	conversation, err := service.CreateAiChatConversation(ctx, contracts.AiChatConversationCreateRequest{
		BridgeEnvelope:   admin,
		CompanyID:        LocalCompanyID,
		ProjectID:        LocalProjectID,
		UserID:           localUserID,
		FirstUserMessage: "Investigate approvals",
	})
	if err != nil {
		t.Fatalf("CreateAiChatConversation returned error: %v", err)
	}
	run, err := service.CreateAiChatRun(ctx, contracts.AiChatRunCreateRequest{
		BridgeEnvelope:      admin,
		ConversationID:      conversation["id"].(string),
		ProjectID:           LocalProjectID,
		UserID:              localUserID,
		UserMessageClientID: "client-message-approval",
		IdempotencyKey:      "run-approval",
		ProviderKind:        "openai",
		ProviderProfileID:   "provider-1",
		Model:               "gpt-4.1-mini",
	})
	if err != nil {
		t.Fatalf("CreateAiChatRun returned error: %v", err)
	}
	description := "Persist an error dashboard"
	action, err := service.ProposeAiChatAction(ctx, contracts.AiChatActionProposeRequest{
		BridgeEnvelope:   admin,
		ConversationID:   conversation["id"].(string),
		RunID:            run.ID,
		ProjectID:        LocalProjectID,
		Title:            "Save dashboard",
		Description:      &description,
		Risk:             string(contracts.AiChatActionRiskMedium),
		ActionKind:       "dashboard.save",
		RequiresApproval: true,
		IdempotencyKey:   "proposal-key",
		ExpiresAt:        "2026-05-18T12:15:00Z",
		InputPreview:     map[string]any{"name": "Errors"},
	})
	if err != nil {
		t.Fatalf("ProposeAiChatAction returned error: %v", err)
	}
	if action["title"] != "Save dashboard" || action["description"] != description || action["requestedAt"] == nil {
		t.Fatalf("proposed action = %#v, want current contract fields", action)
	}

	approved, err := service.ApproveAiChatAction(ctx, contracts.AiChatActionApproveRequest{
		BridgeEnvelope:   admin,
		ActionProposalID: action["id"].(string),
		IdempotencyKey:   "approval-key",
		Approved:         true,
		UserID:           localUserID,
		ExpectedVersion:  1,
	})
	if err != nil {
		t.Fatalf("ApproveAiChatAction returned error: %v", err)
	}
	if approved["status"] != string(contracts.AiChatActionStatusApproved) || approved["decidedAt"] == nil || approved["decidedByUserId"] != localUserID {
		t.Fatalf("approved action = %#v, want approved with decision fields", approved)
	}
	retried, err := service.ApproveAiChatAction(ctx, contracts.AiChatActionApproveRequest{
		BridgeEnvelope:   admin,
		ActionProposalID: action["id"].(string),
		IdempotencyKey:   "approval-key",
		Approved:         true,
		UserID:           localUserID,
		ExpectedVersion:  1,
	})
	if err != nil {
		t.Fatalf("idempotent ApproveAiChatAction retry returned error: %v", err)
	}
	if retried["status"] != approved["status"] || retried["version"] != approved["version"] {
		t.Fatalf("idempotent retry = %#v, want existing approved action %#v", retried, approved)
	}
	if _, err := service.ApproveAiChatAction(ctx, contracts.AiChatActionApproveRequest{
		BridgeEnvelope:   admin,
		ActionProposalID: action["id"].(string),
		IdempotencyKey:   "different-approval-key",
		Approved:         true,
		UserID:           localUserID,
		ExpectedVersion:  1,
	}); err == nil {
		t.Fatal("ApproveAiChatAction retry with a different idempotency key succeeded, want terminal-state error")
	}
}
