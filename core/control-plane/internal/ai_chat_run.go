package internal

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const aiChatRunIdempotencyWindow = 7 * 24 * time.Hour

func (service *Service) CreateAiChatRun(ctx context.Context, request contracts.AiChatRunCreateRequest) (contracts.AiChatRun, error) {
	if strings.TrimSpace(request.ConversationID) == "" ||
		strings.TrimSpace(request.ProjectID) == "" ||
		strings.TrimSpace(request.UserID) == "" ||
		strings.TrimSpace(request.UserMessageClientID) == "" ||
		strings.TrimSpace(request.IdempotencyKey) == "" ||
		strings.TrimSpace(request.ProviderKind) == "" ||
		strings.TrimSpace(request.ProviderProfileID) == "" ||
		strings.TrimSpace(request.Model) == "" {
		return contracts.AiChatRun{}, validationError("AI Chat run create requires conversation, project, user, idempotency, provider, and model fields")
	}
	if principal := principalID(request.BridgeEnvelope); principal != request.UserID {
		return contracts.AiChatRun{}, forbiddenError("AI Chat run user must match the authenticated principal")
	}
	if err := requireAiChatCurrentProject(request.BridgeEnvelope, request.ProjectID); err != nil {
		return contracts.AiChatRun{}, err
	}
	if _, err := service.requireProjectAccess(ctx, request.BridgeEnvelope, request.ProjectID); err != nil {
		return contracts.AiChatRun{}, err
	}
	conversation, ok, err := service.store.GetAiChatConversation(ctx, request.ConversationID)
	if err != nil {
		return contracts.AiChatRun{}, storageError()
	}
	if !ok {
		return contracts.AiChatRun{}, notFoundError("AI Chat conversation")
	}
	if conversation.ProjectID != request.ProjectID || conversation.UserID != request.UserID {
		return contracts.AiChatRun{}, forbiddenError("AI Chat run must match the conversation project and owner")
	}
	if conversation.Status == contracts.AiChatConversationStatusArchived {
		return contracts.AiChatRun{}, forbiddenError("archived AI Chat conversations cannot start runs")
	}
	now := service.now().UTC()
	if existing, ok, err := service.store.GetAiChatRunByIdempotency(ctx, request.ConversationID, request.UserMessageClientID, request.IdempotencyKey); err != nil {
		return contracts.AiChatRun{}, storageError()
	} else if ok && now.Sub(existing.StartedAt) <= aiChatRunIdempotencyWindow {
		return contracts.AiChatRun{}, aiChatDuplicateRunError(existing)
	}
	activeRuns, err := service.store.ListActiveAiChatRunsForConversation(ctx, request.ConversationID)
	if err != nil {
		return contracts.AiChatRun{}, storageError()
	}
	if len(activeRuns) > 0 {
		return contracts.AiChatRun{}, aiChatActiveRunError(activeRuns[0])
	}
	run := ports.AiChatRunRecord{
		ID:                  fmt.Sprintf("run_%s_%d", normalizeID(request.ConversationID), now.UnixNano()),
		ConversationID:      strings.TrimSpace(request.ConversationID),
		ProjectID:           strings.TrimSpace(request.ProjectID),
		UserID:              strings.TrimSpace(request.UserID),
		UserMessageClientID: strings.TrimSpace(request.UserMessageClientID),
		IdempotencyKey:      strings.TrimSpace(request.IdempotencyKey),
		ProviderKind:        strings.TrimSpace(request.ProviderKind),
		ProviderProfileID:   strings.TrimSpace(request.ProviderProfileID),
		Model:               strings.TrimSpace(request.Model),
		Status:              contracts.AiChatRunStatusStreaming,
		TraceID:             optionalStringPtr(pointerString(request.TraceID)),
		StartedAt:           now,
		UpdatedAt:           now,
	}
	if err := service.store.PutAiChatRun(ctx, run); err != nil {
		return contracts.AiChatRun{}, storageError()
	}
	conversation.LastRunStatus = string(run.Status)
	conversation.UpdatedAt = now
	if err := service.store.PutAiChatConversation(ctx, conversation); err != nil {
		return contracts.AiChatRun{}, storageError()
	}
	return contractAiChatRun(run), nil
}

func (service *Service) UpdateAiChatRun(ctx context.Context, request contracts.AiChatRunUpdateRequest) (contracts.AiChatRun, error) {
	run, err := service.aiChatRunForMutation(ctx, request.BridgeEnvelope, request.RunID)
	if err != nil {
		return contracts.AiChatRun{}, err
	}
	if !isActiveAiChatRunStatus(request.Status) {
		return contracts.AiChatRun{}, validationError("AI Chat run update status must be active")
	}
	applyAiChatRunCounts(&run, request.ToolCallCount, request.SandboxScriptCount, request.ArtifactCount, request.InputTokenCount, request.OutputTokenCount, request.EstimatedCostUSD, request.Error)
	run.Status = request.Status
	run.UpdatedAt = service.now().UTC()
	if err := service.store.PutAiChatRun(ctx, run); err != nil {
		return contracts.AiChatRun{}, storageError()
	}
	if conversation, ok, err := service.store.GetAiChatConversation(ctx, run.ConversationID); err != nil {
		return contracts.AiChatRun{}, storageError()
	} else if ok {
		conversation.LastRunStatus = string(run.Status)
		conversation.UpdatedAt = run.UpdatedAt
		if err := service.store.PutAiChatConversation(ctx, conversation); err != nil {
			return contracts.AiChatRun{}, storageError()
		}
	}
	return contractAiChatRun(run), nil
}

func (service *Service) FinalizeAiChatRun(ctx context.Context, request contracts.AiChatRunFinalizeRequest) (contracts.AiChatRun, error) {
	run, err := service.aiChatRunForMutation(ctx, request.BridgeEnvelope, request.RunID)
	if err != nil {
		return contracts.AiChatRun{}, err
	}
	if !isTerminalAiChatRunStatus(request.Status) {
		return contracts.AiChatRun{}, validationError("AI Chat run finalize status must be terminal")
	}
	now := service.now().UTC()
	applyAiChatRunCounts(&run, request.ToolCallCount, request.SandboxScriptCount, request.ArtifactCount, request.InputTokenCount, request.OutputTokenCount, request.EstimatedCostUSD, request.Error)
	run.Status = request.Status
	run.CompletedAt = &now
	run.UpdatedAt = now
	if err := service.store.PutAiChatRun(ctx, run); err != nil {
		return contracts.AiChatRun{}, storageError()
	}
	if conversation, ok, err := service.store.GetAiChatConversation(ctx, run.ConversationID); err != nil {
		return contracts.AiChatRun{}, storageError()
	} else if ok {
		if run.Status == contracts.AiChatRunStatusFailed {
			conversation.LastRunStatus = string(contracts.AiChatRunStatusFailed)
		} else {
			conversation.LastRunStatus = string(contracts.AiChatRunStatusIdle)
		}
		conversation.UpdatedAt = run.UpdatedAt
		if err := service.store.PutAiChatConversation(ctx, conversation); err != nil {
			return contracts.AiChatRun{}, storageError()
		}
	}
	return contractAiChatRun(run), nil
}

func (service *Service) aiChatRunForMutation(ctx context.Context, envelope contracts.BridgeEnvelope, runID string) (ports.AiChatRunRecord, error) {
	if strings.TrimSpace(runID) == "" {
		return ports.AiChatRunRecord{}, validationError("runId is required")
	}
	run, ok, err := service.store.GetAiChatRun(ctx, runID)
	if err != nil {
		return ports.AiChatRunRecord{}, storageError()
	}
	if !ok {
		return ports.AiChatRunRecord{}, notFoundError("AI Chat run")
	}
	if err := requireAiChatCurrentProject(envelope, run.ProjectID); err != nil {
		return ports.AiChatRunRecord{}, err
	}
	if _, err := service.requireProjectAccess(ctx, envelope, run.ProjectID); err != nil {
		return ports.AiChatRunRecord{}, err
	}
	if principal := principalID(envelope); principal != run.UserID {
		return ports.AiChatRunRecord{}, forbiddenError("AI Chat run user must match the authenticated principal")
	}
	return run, nil
}

func applyAiChatRunCounts(run *ports.AiChatRunRecord, toolCalls *int, sandboxScripts *int, artifacts *int, inputTokens *int, outputTokens *int, estimatedCost *float64, runError *string) {
	if toolCalls != nil {
		run.ToolCallCount = *toolCalls
	}
	if sandboxScripts != nil {
		run.SandboxScriptCount = *sandboxScripts
	}
	if artifacts != nil {
		run.ArtifactCount = *artifacts
	}
	if inputTokens != nil {
		run.InputTokenCount = *inputTokens
	}
	if outputTokens != nil {
		run.OutputTokenCount = *outputTokens
	}
	if estimatedCost != nil {
		run.EstimatedCostUSD = estimatedCost
	}
	if runError != nil {
		run.Error = optionalStringPtr(*runError)
	}
}

func isActiveAiChatRunStatus(status contracts.AiChatRunStatus) bool {
	return status == contracts.AiChatRunStatusQueued ||
		status == contracts.AiChatRunStatusStreaming ||
		status == contracts.AiChatRunStatusAwaitingApproval
}

func isTerminalAiChatRunStatus(status contracts.AiChatRunStatus) bool {
	return status == contracts.AiChatRunStatusCompleted ||
		status == contracts.AiChatRunStatusFailed ||
		status == contracts.AiChatRunStatusCancelled
}

func contractAiChatRun(run ports.AiChatRunRecord) contracts.AiChatRun {
	return contracts.AiChatRun{
		ID:                run.ID,
		ConversationID:    run.ConversationID,
		Status:            run.Status,
		ProviderProfileID: run.ProviderProfileID,
		Model:             run.Model,
		Artifacts:         []map[string]any{},
		ActionProposals:   []map[string]any{},
		StartedAt:         run.StartedAt,
		CompletedAt:       run.CompletedAt,
		Error:             run.Error,
	}
}

func aiChatDuplicateRunError(run ports.AiChatRunRecord) error {
	return aiChatRunStateError("ERR-001", "VALIDATION_FAILED", "Duplicate AI Chat run submission", false, run)
}

func aiChatActiveRunError(run ports.AiChatRunRecord) error {
	return aiChatRunStateError("ERR-AIC-004", "AI_CHAT_LIMIT_EXCEEDED", "Another AI Chat run is already active", true, run)
}

func aiChatRunStateError(id string, code string, message string, retryable bool, run ports.AiChatRunRecord) error {
	return codedBridgeError{
		error: fmt.Errorf("%s %s: %s", id, code, message),
		bridge: contracts.BridgeError{
			ID:        id,
			Code:      code,
			Message:   message,
			Retryable: retryable,
			Details: map[string]any{
				"runId":  run.ID,
				"status": string(run.Status),
			},
		},
	}
}
