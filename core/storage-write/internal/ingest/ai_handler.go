package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
)

const (
	AiProjectionSubject             = "telemetry.ingest.ai_projections"
	AiProjectionPersistedSubject    = "ai.persisted.projections"
	EvalDatasetCreateSubject        = "eval.dataset.create"
	EvalDatasetItemsAppendSubject   = "eval.dataset.items.append"
	EvalDatasetItemPromoteSubject   = "eval.dataset.item.promote"
	EvalScorerCreateSubject         = "eval.scorer.create"
	EvalExperimentCreateSubject     = "eval.experiment.create"
	EvalResultsPersistSubject       = "eval.results.persist"
	EvalExperimentProgressSubject   = "eval.experiment.progress"
	EvalPromptVersionPromoteSubject = "eval.prompt_version.promote"
	AnnotationItemUpdateSubject     = "annotation.item.update"
)

type RequestMessage interface {
	Subject() string
	Data() []byte
	Respond(data []byte) error
}

func HandleAIProjectionMessage(ctx context.Context, msg Message, store ports.AIWriteStore, publisher ports.AIEventPublisher, logger *slog.Logger, now func() time.Time) {
	start := now()
	subject := msg.Subject()
	attempt := msg.Attempt()

	command, err := decodeAIProjectionCommand(msg.Data())
	if err != nil {
		logAIProjection(logger, slog.LevelWarn, "ai_projection_validation_failed", "AI projection validation failed", command, subject, attempt, now().Sub(start), validationErrorID, validationErrorCode)
		_ = msg.Ack()
		return
	}
	if err := validateAIProjectionCommand(command, subject); err != nil {
		logAIProjection(logger, slog.LevelWarn, "ai_projection_validation_failed", "AI projection validation failed", command, subject, attempt, now().Sub(start), validationErrorID, validationErrorCode)
		_ = msg.Ack()
		return
	}

	exists, err := store.AIProjectionCommandExists(ctx, command)
	if err != nil {
		logAIProjection(logger, slog.LevelError, "ai_projection_duplicate_check_failed", "storage is unavailable", command, subject, attempt, now().Sub(start), storageErrorID, storageErrorCode)
		_ = msg.NakWithDelay(nakDelay(attempt))
		return
	}
	if exists {
		logAIProjection(logger, slog.LevelInfo, "ai_projection_duplicate_acknowledged", "AI projection duplicate acknowledged", command, subject, attempt, now().Sub(start), "", "")
		_ = msg.Ack()
		return
	}

	persistedAt := now()
	projectionIDs, err := store.PersistAIProjection(ctx, command, subject, persistedAt)
	if err != nil {
		logAIProjection(logger, slog.LevelError, "ai_projection_storage_failed", "storage is unavailable", command, subject, attempt, now().Sub(start), storageErrorID, storageErrorCode)
		_ = msg.NakWithDelay(nakDelay(attempt))
		return
	}
	if len(projectionIDs) == 0 {
		projectionIDs = []string{stringValue(command.Projection, "id")}
	}

	if err := publisher.PublishAIProjectionPersisted(ctx, aiProjectionPersistedNotification(command, projectionIDs, persistedAt)); err != nil {
		logAIProjection(logger, slog.LevelError, "ai_projection_notification_failed", "message bridge is unavailable", command, subject, attempt, now().Sub(start), bridgeErrorID, bridgeErrorCode)
	}

	logAIProjection(logger, slog.LevelInfo, "ai_projection_persisted", "AI projection persisted", command, subject, attempt, now().Sub(start), "", "")
	_ = msg.Ack()
}

func HandleEvalMutationMessage(ctx context.Context, msg RequestMessage, store ports.AIWriteStore, publisher ports.AIEventPublisher, logger *slog.Logger, now func() time.Time) {
	request, err := decodeEvalMutationRequest(msg.Data())
	if err != nil {
		requestID := ""
		response := evalMutationErrorResponse(requestID, validationBridgeError("invalid mutation request"))
		respondEvalMutation(ctx, msg, response, logger)
		return
	}
	response := HandleEvalMutationRequest(ctx, msg.Subject(), request, store, publisher, now)
	respondEvalMutation(ctx, msg, response, logger)
}

func HandleEvalMutationRequest(ctx context.Context, subject string, request contracts.EvalMutationRequest, store ports.AIWriteStore, publisher ports.AIEventPublisher, now func() time.Time) contracts.EvalMutationResponse {
	if err := validateEvalMutationRequest(subject, request); err != nil {
		return evalMutationErrorResponse(request.RequestID, validationBridgeError(err.Error()))
	}

	occurredAt := now()
	data, err := store.PersistEvalMutation(ctx, subject, request, occurredAt)
	if err != nil {
		return evalMutationErrorResponse(request.RequestID, storageBridgeError())
	}

	if notification := experimentProgressNotification(subject, request, data, occurredAt); notification != nil {
		_ = publisher.PublishExperimentProgress(ctx, *notification)
	}

	return contracts.EvalMutationResponse{
		RequestID: request.RequestID,
		OK:        true,
		Data:      data,
	}
}

func BuildEvalMutationRecord(subject string, request contracts.EvalMutationRequest, now time.Time) (map[string]any, error) {
	if err := validateEvalMutationRequest(subject, request); err != nil {
		return nil, err
	}

	switch subject {
	case EvalDatasetCreateSubject:
		id := stableID("dataset", request.RequestID, stringValue(request.Input, "name"))
		return map[string]any{
			"id":          id,
			"name":        stringValue(request.Input, "name"),
			"description": optionalStringValue(request.Input, "description"),
			"version":     1,
			"createdAt":   now.UTC().Format(time.RFC3339),
			"itemCount":   0,
			"tags":        arrayValue(request.Input, "tags"),
		}, nil
	case EvalDatasetItemsAppendSubject:
		items := arrayValue(request.Input, "items")
		item := firstMap(items)
		id := stringValue(item, "id")
		if id == "" {
			id = stableID("dataset-item", request.RequestID, stringValue(request.Input, "datasetId"))
		}
		return map[string]any{
			"id":            id,
			"datasetId":     stringValue(request.Input, "datasetId"),
			"version":       intValue(request.Input, "version"),
			"input":         item["input"],
			"expected":      item["expected"],
			"metadata":      objectValueWithDefault(item, "metadata"),
			"sourceTraceId": optionalStringValue(item, "sourceTraceId"),
			"sourceSpanId":  optionalStringValue(item, "sourceSpanId"),
			"split":         stringValueWithDefault(item, "split", "dev"),
			"reviewStatus":  stringValueWithDefault(item, "reviewStatus", "unreviewed"),
			"synthetic":     boolValue(item, "synthetic"),
		}, nil
	case EvalDatasetItemPromoteSubject:
		id := stableID("dataset-item", request.RequestID, stringValue(request.Input, "datasetId"), stringValue(request.Input, "sourceTraceId"), stringValue(request.Input, "sourceSpanId"))
		return map[string]any{
			"id":            id,
			"datasetId":     stringValue(request.Input, "datasetId"),
			"version":       maxInt(1, intValue(request.Input, "version")),
			"input":         objectValueWithDefault(request.Input, "input"),
			"expected":      request.Input["expected"],
			"metadata":      objectValueWithDefault(request.Input, "metadata"),
			"sourceTraceId": stringValue(request.Input, "sourceTraceId"),
			"sourceSpanId":  stringValue(request.Input, "sourceSpanId"),
			"split":         stringValueWithDefault(request.Input, "split", "dev"),
			"reviewStatus":  stringValueWithDefault(request.Input, "reviewStatus", "reviewed"),
			"synthetic":     false,
		}, nil
	case EvalScorerCreateSubject:
		name := stringValue(request.Input, "name")
		return map[string]any{
			"id":            stableID("scorer", request.RequestID, name),
			"name":          name,
			"kind":          stringValue(request.Input, "kind"),
			"definition":    objectValue(request.Input, "definition"),
			"judgeModelRef": optionalStringValue(request.Input, "judgeModelRef"),
			"version":       1,
		}, nil
	case EvalExperimentCreateSubject:
		name := stringValue(request.Input, "name")
		return map[string]any{
			"id":             stableID("experiment", request.RequestID, name),
			"name":           name,
			"datasetId":      stringValue(request.Input, "datasetId"),
			"datasetVersion": intValue(request.Input, "datasetVersion"),
			"scorerIds":      arrayValue(request.Input, "scorerIds"),
			"createdAt":      now.UTC().Format(time.RFC3339),
			"tags":           arrayValue(request.Input, "tags"),
		}, nil
	case EvalResultsPersistSubject:
		return map[string]any{
			"experimentRunId": stringValue(request.Input, "experimentRunId"),
			"itemRuns":        arrayValue(request.Input, "itemRuns"),
			"results":         arrayValue(request.Input, "results"),
			"persistedAt":     now.UTC().Format(time.RFC3339),
		}, nil
	case EvalPromptVersionPromoteSubject:
		id := stringValue(request.Input, "promptVersionId")
		return map[string]any{
			"id":    id,
			"tag":   stringValue(request.Input, "tag"),
			"notes": optionalStringValue(request.Input, "notes"),
		}, nil
	case AnnotationItemUpdateSubject:
		id := stringValue(request.Input, "annotationQueueItemId")
		return map[string]any{
			"id":                    id,
			"status":                stringValue(request.Input, "status"),
			"resolvedDatasetItemId": optionalStringValue(request.Input, "datasetItemId"),
		}, nil
	default:
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: unsupported eval mutation subject")
	}
}

func decodeAIProjectionCommand(data []byte) (contracts.PersistAiProjectionCommand, error) {
	var command contracts.PersistAiProjectionCommand
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&command); err != nil {
		return command, err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return command, fmt.Errorf("multiple JSON values")
	}
	return command, nil
}

func decodeEvalMutationRequest(data []byte) (contracts.EvalMutationRequest, error) {
	var request contracts.EvalMutationRequest
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return request, fmt.Errorf("multiple JSON values")
	}
	return request, nil
}

func validateAIProjectionCommand(command contracts.PersistAiProjectionCommand, subject string) error {
	if subject != AiProjectionSubject {
		return fmt.Errorf("%s %s: subject is invalid", validationErrorID, validationErrorCode)
	}
	if strings.TrimSpace(command.RequestID) == "" {
		return fmt.Errorf("%s %s: requestId is required", validationErrorID, validationErrorCode)
	}
	if command.IssuedAt.IsZero() {
		return fmt.Errorf("%s %s: issuedAt is required", validationErrorID, validationErrorCode)
	}
	if strings.TrimSpace(command.CommandID) == "" {
		return fmt.Errorf("%s %s: commandId is required", validationErrorID, validationErrorCode)
	}
	if strings.TrimSpace(command.TraceID) == "" {
		return fmt.Errorf("%s %s: traceId is required", validationErrorID, validationErrorCode)
	}
	if strings.TrimSpace(command.SpanID) == "" {
		return fmt.Errorf("%s %s: spanId is required", validationErrorID, validationErrorCode)
	}
	switch command.Kind {
	case contracts.AiProjectionKindAgentRun, contracts.AiProjectionKindLLMCall, contracts.AiProjectionKindToolCall, contracts.AiProjectionKindRetrievalEvent:
	default:
		return fmt.Errorf("%s %s: kind is invalid", validationErrorID, validationErrorCode)
	}
	if len(command.Projection) == 0 {
		return fmt.Errorf("%s %s: projection is required", validationErrorID, validationErrorCode)
	}
	if strings.TrimSpace(stringValue(command.Projection, "id")) == "" {
		return fmt.Errorf("%s %s: projection id is required", validationErrorID, validationErrorCode)
	}
	return nil
}

func validateEvalMutationRequest(subject string, request contracts.EvalMutationRequest) error {
	if strings.TrimSpace(request.RequestID) == "" {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: requestId is required")
	}
	if request.IssuedAt.IsZero() {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: issuedAt is required")
	}
	if request.Input == nil {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: input is required")
	}

	switch subject {
	case EvalDatasetCreateSubject:
		return requireNonBlank(request.Input, "name")
	case EvalDatasetItemsAppendSubject:
		if err := requireNonBlank(request.Input, "datasetId"); err != nil {
			return err
		}
		if intValue(request.Input, "version") < 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: version must be at least 1")
		}
		if len(arrayValue(request.Input, "items")) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: items is required")
		}
		return nil
	case EvalDatasetItemPromoteSubject:
		for _, field := range []string{"datasetId", "sourceTraceId", "sourceSpanId"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		return nil
	case EvalScorerCreateSubject:
		if err := requireNonBlank(request.Input, "name"); err != nil {
			return err
		}
		if err := requireNonBlank(request.Input, "kind"); err != nil {
			return err
		}
		return requireObject(request.Input, "definition")
	case EvalExperimentCreateSubject:
		for _, field := range []string{"name", "datasetId"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		if intValue(request.Input, "datasetVersion") < 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: datasetVersion must be at least 1")
		}
		if len(arrayValue(request.Input, "scorerIds")) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: scorerIds is required")
		}
		return nil
	case EvalResultsPersistSubject:
		if err := requireNonBlank(request.Input, "experimentRunId"); err != nil {
			return err
		}
		if len(arrayValue(request.Input, "itemRuns")) == 0 && len(arrayValue(request.Input, "results")) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: itemRuns or results is required")
		}
		return nil
	case EvalPromptVersionPromoteSubject:
		if err := requireNonBlank(request.Input, "promptVersionId"); err != nil {
			return err
		}
		return requireNonBlank(request.Input, "tag")
	case AnnotationItemUpdateSubject:
		if err := requireNonBlank(request.Input, "annotationQueueItemId"); err != nil {
			return err
		}
		status := stringValue(request.Input, "status")
		switch status {
		case "open", "in_review", "resolved", "dismissed":
			return nil
		default:
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: status is invalid")
		}
	default:
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: unsupported eval mutation subject")
	}
}

func aiProjectionPersistedNotification(command contracts.PersistAiProjectionCommand, projectionIDs []string, persistedAt time.Time) contracts.AiProjectionPersistedNotification {
	var tenantID *string
	var projectID *string
	if command.AuthContext != nil {
		tenantID = command.AuthContext.TenantID
		projectID = command.AuthContext.ProjectID
	}
	return contracts.AiProjectionPersistedNotification{
		RequestID:     command.RequestID,
		TenantID:      tenantID,
		ProjectID:     projectID,
		TraceID:       command.TraceID,
		ProjectionIDs: projectionIDs,
		SpanIDs:       []string{command.SpanID},
		Kinds:         []contracts.AiProjectionKind{command.Kind},
		PersistedAt:   persistedAt,
	}
}

func experimentProgressNotification(subject string, request contracts.EvalMutationRequest, data map[string]any, occurredAt time.Time) *contracts.ExperimentProgressNotification {
	if subject != EvalResultsPersistSubject {
		return nil
	}
	experimentRunID := stringValue(request.Input, "experimentRunId")
	if experimentRunID == "" {
		return nil
	}
	notification := &contracts.ExperimentProgressNotification{
		RequestID:       request.RequestID,
		ExperimentRunID: experimentRunID,
		Type:            "progress",
		OccurredAt:      occurredAt,
	}
	itemRuns := arrayValue(data, "itemRuns")
	if len(itemRuns) > 0 {
		if itemRun, ok := itemRuns[0].(map[string]any); ok {
			itemRunID := stringValue(itemRun, "id")
			if itemRunID != "" {
				notification.DatasetItemRunID = &itemRunID
				notification.Type = "item_completed"
			}
		}
	}
	return notification
}

func respondEvalMutation(ctx context.Context, msg RequestMessage, response contracts.EvalMutationResponse, logger *slog.Logger) {
	data, err := json.Marshal(response)
	if err != nil {
		logger.ErrorContext(ctx, "eval mutation response encoding failed", "service", storageWriteService, "event", "eval_mutation_response_encoding_failed", "error_id", bridgeErrorID, "error_code", bridgeErrorCode)
		return
	}
	if err := msg.Respond(data); err != nil {
		logger.ErrorContext(ctx, "eval mutation response failed", "service", storageWriteService, "event", "eval_mutation_response_failed", "error_id", bridgeErrorID, "error_code", bridgeErrorCode)
	}
}

func evalMutationErrorResponse(requestID string, bridgeError contracts.BridgeError) contracts.EvalMutationResponse {
	return contracts.EvalMutationResponse{
		RequestID: requestID,
		OK:        false,
		Error:     &bridgeError,
	}
}

func validationBridgeError(message string) contracts.BridgeError {
	return contracts.BridgeError{ID: validationErrorID, Code: validationErrorCode, Message: message, Retryable: false}
}

func storageBridgeError() contracts.BridgeError {
	return contracts.BridgeError{ID: storageErrorID, Code: storageErrorCode, Message: "storage is unavailable", Retryable: true}
}

func requireNonBlank(input map[string]any, field string) error {
	if strings.TrimSpace(stringValue(input, field)) == "" {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: %s is required", field)
	}
	return nil
}

func requireObject(input map[string]any, field string) error {
	if len(objectValue(input, field)) == 0 {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: %s is required", field)
	}
	return nil
}

func stableID(prefix string, values ...string) string {
	for i, value := range values {
		values[i] = strings.TrimSpace(value)
	}
	joined := strings.Join(values, "-")
	joined = strings.ToLower(strings.NewReplacer(" ", "-", "_", "-").Replace(joined))
	joined = strings.Trim(joined, "-")
	if joined == "" {
		return prefix
	}
	return prefix + "-" + joined
}

func stringValue(input map[string]any, key string) string {
	value, ok := input[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func optionalStringValue(input map[string]any, key string) any {
	value := stringValue(input, key)
	if value == "" {
		return nil
	}
	return value
}

func intValue(input map[string]any, key string) int {
	value, ok := input[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func objectValue(input map[string]any, key string) map[string]any {
	value, ok := input[key]
	if !ok || value == nil {
		return map[string]any{}
	}
	if object, ok := value.(map[string]any); ok {
		return object
	}
	return map[string]any{}
}

func objectValueWithDefault(input map[string]any, key string) map[string]any {
	value := objectValue(input, key)
	if value == nil {
		return map[string]any{}
	}
	return value
}

func arrayValue(input map[string]any, key string) []any {
	value, ok := input[key]
	if !ok || value == nil {
		return []any{}
	}
	switch typed := value.(type) {
	case []any:
		return typed
	case []string:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, item)
		}
		return items
	default:
		return []any{}
	}
}

func firstMap(items []any) map[string]any {
	if len(items) == 0 {
		return map[string]any{}
	}
	if item, ok := items[0].(map[string]any); ok {
		return item
	}
	return map[string]any{}
}

func stringValueWithDefault(input map[string]any, key string, fallback string) string {
	value := stringValue(input, key)
	if value == "" {
		return fallback
	}
	return value
}

func boolValue(input map[string]any, key string) bool {
	value, ok := input[key]
	if !ok || value == nil {
		return false
	}
	typed, _ := value.(bool)
	return typed
}

func maxInt(a int, b int) int {
	if a > b {
		return a
	}
	return b
}

func logAIProjection(logger *slog.Logger, level slog.Level, event string, message string, command contracts.PersistAiProjectionCommand, subject string, attempt int, duration time.Duration, errorID string, errorCode string) {
	attrs := []any{
		"service", storageWriteService,
		"event", event,
		"request_id", command.RequestID,
		"operation_or_subject", subject,
		"status", logStatus(errorID),
		"command_id", command.CommandID,
		"subject", subject,
		"trace_id", command.TraceID,
		"span_id", command.SpanID,
		"kind", string(command.Kind),
		"attempt", attempt,
		"duration_ms", duration.Milliseconds(),
	}
	if errorID != "" {
		attrs = append(attrs, "error_id", errorID, "error_code", errorCode)
	}
	logger.Log(context.Background(), level, message, attrs...)
}
