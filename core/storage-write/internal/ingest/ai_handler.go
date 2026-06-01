package ingest

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sort"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
)

const (
	AiProjectionSubject                   = "telemetry.ingest.ai_projections"
	AiProjectionPersistedSubject          = "ai.persisted.projections"
	EvalDatasetCreateSubject              = "eval.dataset.create"
	EvalDatasetItemsAppendSubject         = "eval.dataset.items.append"
	EvalDatasetSettingsUpdateSubject      = "eval.dataset.settings.update"
	EvalDatasetItemPromoteSubject         = "eval.dataset.item.promote"
	EvalDatasetItemUpdateSubject          = "eval.dataset.item.update"
	EvalDatasetCandidatesPrepareSubject   = "eval.dataset.candidates.prepare"
	EvalDatasetCandidatesCommitSubject    = "eval.dataset.candidates.commit"
	EvalEvaluationCreateSubject           = "eval.evaluation.create"
	EvalEvaluationUpdateSubject           = "eval.evaluation.update"
	EvalEvaluationComparisonCreateSubject = "eval.evaluation.comparison.create"
	EvalTargetSnapshotCreateSubject       = "eval.target.snapshot.create"
	EvalTargetPromoteSubject              = "eval.target.promote"
	EvalOptimizationStepPersistSubject    = "eval.optimization.step.persist"
	EvalOptimizationMemoryPersistSubject  = "eval.optimization.memory.persist"
	EvalScorerCreateSubject               = "eval.scorer.create"
	EvalExperimentCreateSubject           = "eval.experiment.create"
	EvalResultsPersistSubject             = "eval.results.persist"
	EvalExperimentProgressSubject         = "eval.experiment.progress"
	EvalPromptVersionPromoteSubject       = "eval.prompt_version.promote"
	AnnotationItemUpdateSubject           = "annotation.item.update"
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
		logAIProjection(logger, slog.LevelDebug, "ai_projection_duplicate_acknowledged", "AI projection duplicate acknowledged", command, subject, attempt, now().Sub(start), "", "")
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

	logAIProjection(logger, slog.LevelDebug, "ai_projection_persisted", "AI projection persisted", command, subject, attempt, now().Sub(start), "", "")
	_ = msg.Ack()
}

func HandleEvalMutationMessage(ctx context.Context, msg RequestMessage, store ports.AIWriteStore, publisher ports.AIEventPublisher, logger *slog.Logger, now func() time.Time) {
	request, err := decodeEvalMutationRequestForSubject(msg.Subject(), msg.Data())
	if err != nil {
		requestID := ""
		response := evalMutationErrorResponse(requestID, validationBridgeError("invalid mutation request"))
		respondEvalMutation(ctx, msg, response, logger)
		return
	}
	response := HandleEvalMutationRequestWithLogger(ctx, msg.Subject(), request, store, publisher, logger, now)
	respondEvalMutation(ctx, msg, response, logger)
}

func HandleEvalMutationRequest(ctx context.Context, subject string, request contracts.EvalMutationRequest, store ports.AIWriteStore, publisher ports.AIEventPublisher, now func() time.Time) contracts.EvalMutationResponse {
	return HandleEvalMutationRequestWithLogger(ctx, subject, request, store, publisher, nil, now)
}

func HandleEvalMutationRequestWithLogger(ctx context.Context, subject string, request contracts.EvalMutationRequest, store ports.AIWriteStore, publisher ports.AIEventPublisher, logger *slog.Logger, now func() time.Time) contracts.EvalMutationResponse {
	if err := validateEvalMutationRequest(subject, request); err != nil {
		return evalMutationErrorResponse(request.RequestID, validationBridgeError(err.Error()))
	}

	if subject == EvalDatasetImportPrepareSubject {
		data, err := PrepareDatasetImport(ctx, datasetTransferRoot(), request, now)
		if err != nil {
			return evalMutationErrorResponse(request.RequestID, bridgeErrorFromError(err))
		}
		return contracts.EvalMutationResponse{RequestID: request.RequestID, OK: true, Data: data}
	}
	if subject == EvalDatasetImportCommitSubject {
		appendRequests, err := DatasetImportAppendRequests(ctx, datasetTransferRoot(), request, now)
		if err != nil {
			return evalMutationErrorResponse(request.RequestID, bridgeErrorFromError(err))
		}
		for _, appendRequest := range appendRequests {
			if _, err := store.PersistEvalMutation(ctx, EvalDatasetItemsAppendSubject, appendRequest, now()); err != nil {
				logEvalMutationStorageError(ctx, logger, EvalDatasetItemsAppendSubject, appendRequest.RequestID, err)
				return evalMutationErrorResponse(request.RequestID, storageBridgeError())
			}
		}
		data, err := CommitDatasetImport(ctx, datasetTransferRoot(), request, now)
		if err != nil {
			return evalMutationErrorResponse(request.RequestID, bridgeErrorFromError(err))
		}
		return contracts.EvalMutationResponse{RequestID: request.RequestID, OK: true, Data: data}
	}

	occurredAt := now()
	data, err := store.PersistEvalMutation(ctx, subject, request, occurredAt)
	if err != nil {
		logEvalMutationStorageError(ctx, logger, subject, request.RequestID, err)
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

func logEvalMutationStorageError(ctx context.Context, logger *slog.Logger, subject string, requestID string, err error) {
	if logger == nil || err == nil {
		return
	}
	logger.ErrorContext(ctx, "eval mutation storage failed", "service", storageWriteService, "event", "eval_mutation_storage_failed", "request_id", requestID, "operation_or_subject", subject, "error", err.Error(), "error_id", storageErrorID, "error_code", storageErrorCode)
}

func BuildEvalMutationRecord(subject string, request contracts.EvalMutationRequest, now time.Time) (map[string]any, error) {
	if err := validateEvalMutationRequest(subject, request); err != nil {
		return nil, err
	}

	switch subject {
	case EvalDatasetCreateSubject:
		id := stableID("dataset", request.RequestID, stringValue(request.Input, "name"))
		if stringValue(request.Input, "projectId") != "" {
			versionID := datasetVersionID(id, 1)
			settings := objectValueWithDefault(request.Input, "settings")
			digest := stableDigest(map[string]any{"settings": settings, "itemRevisionIds": []string{}})
			return map[string]any{
				"id":               id,
				"projectId":        stringValue(request.Input, "projectId"),
				"name":             stringValue(request.Input, "name"),
				"description":      optionalStringValue(request.Input, "description"),
				"settings":         settings,
				"currentVersionId": versionID,
				"currentVersion":   1,
				"currentDigest":    digest,
				"itemCount":        0,
				"readyItemCount":   0,
				"splitCounts":      emptySplitCounts(),
				"health":           map[string]any{},
				"tags":             arrayValue(request.Input, "tags"),
				"metadata":         objectValueWithDefault(request.Input, "metadata"),
				"createdAt":        now.UTC().Format(time.RFC3339),
				"createdBy":        actorID(request),
				"updatedAt":        now.UTC().Format(time.RFC3339),
				"updatedBy":        actorID(request),
			}, nil
		}
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
		if stringValue(request.Input, "projectId") != "" {
			datasetID := stringValue(request.Input, "datasetId")
			expectedVersion := datasetVersionNumberFromInput(request.Input)
			itemID := stringValue(item, "datasetItemId")
			if itemID == "" {
				itemID = stringValue(item, "id")
			}
			if itemID == "" {
				itemID = stableID("dataset-item", request.RequestID, datasetID)
			}
			revisionID := stableID("dataset-item-revision", itemID, fmt.Sprintf("%d", expectedVersion+1), stringValue(request.Input, "idempotencyKey"))
			revision := datasetItemRevisionRecord(request, item, datasetID, itemID, revisionID, 1, now)
			return map[string]any{
				"id":                       datasetID,
				"datasetId":                datasetID,
				"version":                  expectedVersion + 1,
				"currentVersion":           expectedVersion + 1,
				"currentVersionId":         datasetVersionID(datasetID, expectedVersion+1),
				"expectedDatasetVersionId": stringValue(request.Input, "expectedDatasetVersionId"),
				"datasetItemId":            itemID,
				"datasetItemRevision":      revision,
				"itemRevisionIds":          []any{revisionID},
			}, nil
		}
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
	case EvalDatasetSettingsUpdateSubject:
		datasetID := stringValue(request.Input, "datasetId")
		expectedVersion := datasetVersionNumberFromInput(request.Input)
		settings := objectValueWithDefault(request.Input, "settings")
		versionID := datasetVersionID(datasetID, expectedVersion+1)
		digest := stableDigest(map[string]any{"settings": settings, "parentVersionId": stringValue(request.Input, "expectedDatasetVersionId")})
		return map[string]any{
			"id":                       datasetID,
			"datasetId":                datasetID,
			"projectId":                stringValue(request.Input, "projectId"),
			"settings":                 settings,
			"currentVersion":           expectedVersion + 1,
			"currentVersionId":         versionID,
			"currentDigest":            digest,
			"expectedDatasetVersionId": stringValue(request.Input, "expectedDatasetVersionId"),
			"updatedAt":                now.UTC().Format(time.RFC3339),
			"updatedBy":                actorID(request),
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
	case EvalDatasetItemUpdateSubject:
		if stringValue(request.Input, "projectId") != "" {
			datasetID := stringValue(request.Input, "datasetId")
			itemID := stringValue(request.Input, "itemId")
			expectedVersion := intValue(request.Input, "expectedDatasetVersion")
			revisionID := stableID("dataset-item-revision", itemID, fmt.Sprintf("%d", expectedVersion+1), stringValue(request.Input, "idempotencyKey"))
			revision := datasetItemRevisionRecord(request, request.Input, datasetID, itemID, revisionID, expectedVersion+1, now)
			return map[string]any{
				"id":                  itemID,
				"datasetId":           datasetID,
				"version":             expectedVersion + 1,
				"datasetItemRevision": revision,
				"itemRevisionIds":     []any{revisionID},
			}, nil
		}
		version := intValue(request.Input, "expectedDatasetVersion") + 1
		return map[string]any{
			"id":           stringValue(request.Input, "itemId"),
			"datasetId":    stringValue(request.Input, "datasetId"),
			"version":      version,
			"input":        request.Input["input"],
			"expected":     request.Input["expected"],
			"metadata":     objectValueWithDefault(request.Input, "metadata"),
			"split":        stringValueWithDefault(request.Input, "split", "dev"),
			"reviewStatus": stringValueWithDefault(request.Input, "reviewStatus", "unreviewed"),
			"removedAt":    optionalStringValue(request.Input, "removedAt"),
		}, nil
	case EvalDatasetCandidatesPrepareSubject:
		source := firstMap(arrayValue(request.Input, "sources"))
		sourceKind := stringValue(source, "sourceKind")
		id := stableID("candidate", request.RequestID, stringValue(request.Input, "datasetId"), sourceKind, stringValue(source, "traceId"), stringValue(source, "spanId"), stringValue(source, "evalResultId"))
		record := map[string]any{
			"id":               id,
			"datasetId":        optionalStringValue(request.Input, "datasetId"),
			"status":           "ready",
			"sourceKind":       sourceKind,
			"source":           source,
			"targetShape":      stringValueWithDefault(request.Input, "targetShape", "single_turn"),
			"metadata":         objectValueWithDefault(request.Input, "metadata"),
			"split":            stringValueWithDefault(request.Input, "split", "dev"),
			"reviewStatus":     stringValueWithDefault(request.Input, "reviewStatus", "unreviewed"),
			"contentTreatment": stringValueWithDefault(request.Input, "contentTreatment", "original"),
			"reason":           stringValue(request.Input, "reason"),
			"warnings":         arrayValue(request.Input, "warnings"),
			"createdAt":        now.UTC().Format(time.RFC3339),
			"updatedAt":        now.UTC().Format(time.RFC3339),
		}
		if input, ok := request.Input["input"]; ok {
			record["input"] = input
		}
		if expected, ok := request.Input["expected"]; ok {
			record["expected"] = expected
		}
		if anonymization := anonymizationRecord(request.Input, now); anonymization != nil {
			record["anonymization"] = anonymization
		}
		return record, nil
	case EvalDatasetCandidatesCommitSubject:
		nextVersion := intValue(request.Input, "expectedDatasetVersion") + 1
		return map[string]any{
			"id":                 stringValue(request.Input, "datasetId"),
			"version":            nextVersion,
			"sourceCandidateIds": sortedStringValues(arrayValue(request.Input, "candidateIds")),
			"split":              optionalStringValue(request.Input, "split"),
			"reviewStatus":       optionalStringValue(request.Input, "reviewStatus"),
		}, nil
	case EvalEvaluationCreateSubject:
		id := stableID("evaluation-definition", request.RequestID, stringValue(request.Input, "name"))
		return map[string]any{
			"id":               id,
			"projectId":        stringValue(request.Input, "projectId"),
			"name":             stringValue(request.Input, "name"),
			"description":      optionalStringValue(request.Input, "description"),
			"datasetId":        stringValue(request.Input, "datasetId"),
			"targetRef":        objectValueWithDefault(request.Input, "targetRef"),
			"metricSettings":   objectValueWithDefault(request.Input, "metricSettings"),
			"splitSelector":    objectValueWithDefault(request.Input, "splitSelector"),
			"runPolicy":        objectValueWithDefault(request.Input, "runPolicy"),
			"retentionProfile": stringValueWithDefault(request.Input, "retentionProfile", "balanced"),
			"createdAt":        now.UTC().Format(time.RFC3339),
			"createdBy":        actorID(request),
			"updatedAt":        now.UTC().Format(time.RFC3339),
			"updatedBy":        actorID(request),
		}, nil
	case EvalEvaluationUpdateSubject:
		id := stringValue(request.Input, "evaluationDefinitionId")
		record := cloneAnyMap(objectValueWithDefault(request.Input, "input"))
		for key, value := range request.Input {
			if _, exists := record[key]; !exists {
				record[key] = value
			}
		}
		record["id"] = id
		record["projectId"] = stringValue(request.Input, "projectId")
		record["updatedAt"] = now.UTC().Format(time.RFC3339)
		record["updatedBy"] = actorID(request)
		return record, nil
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
		if stringValue(request.Input, "projectId") != "" {
			return map[string]any{
				"id":               stableID("evaluation-results", request.RequestID, stringValue(request.Input, "evaluationRunId")),
				"projectId":        stringValue(request.Input, "projectId"),
				"evaluationRunId":  stringValue(request.Input, "evaluationRunId"),
				"evaluationRun":    objectValueWithDefault(request.Input, "evaluationRun"),
				"optimizationRun":  objectValueWithDefault(request.Input, "optimizationRun"),
				"itemRuns":         firstNonEmptyArray(request.Input, "itemRuns", "evaluationItemRuns"),
				"metricResults":    firstNonEmptyArray(request.Input, "metricResults", "results"),
				"metricAggregates": arrayValue(request.Input, "metricAggregates"),
				"persistedAt":      now.UTC().Format(time.RFC3339),
			}, nil
		}
		return map[string]any{
			"experimentRunId": optionalStringValue(request.Input, "experimentRunId"),
			"itemRuns":        arrayValue(request.Input, "itemRuns"),
			"results":         arrayValue(request.Input, "results"),
			"persistedAt":     now.UTC().Format(time.RFC3339),
		}, nil
	case EvalEvaluationComparisonCreateSubject:
		id := stableID("evaluation-comparison", request.RequestID, stringValue(request.Input, "baselineRunId"), stringValue(request.Input, "candidateRunId"))
		return map[string]any{
			"id":                        id,
			"projectId":                 stringValue(request.Input, "projectId"),
			"baselineEvaluationRunId":   stringValue(request.Input, "baselineRunId"),
			"candidateEvaluationRunId":  stringValue(request.Input, "candidateRunId"),
			"baselineTargetSnapshotId":  optionalStringValue(request.Input, "baselineTargetSnapshotId"),
			"candidateTargetSnapshotId": optionalStringValue(request.Input, "candidateTargetSnapshotId"),
			"metricResultIds":           arrayValue(request.Input, "metricResultIds"),
			"metricAggregateIds":        arrayValue(request.Input, "metricAggregateIds"),
			"targetDiffId":              optionalStringValue(request.Input, "targetDiffId"),
			"summary":                   objectValueWithDefault(request.Input, "summary"),
			"createdAt":                 now.UTC().Format(time.RFC3339),
			"createdBy":                 actorID(request),
		}, nil
	case EvalTargetSnapshotCreateSubject:
		input := objectValueWithDefault(request.Input, "input")
		id := stableID("target-snapshot", request.RequestID, stableDigest(input))
		return map[string]any{
			"id":              id,
			"projectId":       stringValue(request.Input, "projectId"),
			"targetRef":       objectValueWithDefault(request.Input, "targetRef"),
			"kind":            stringValueWithDefault(input, "kind", stringValueWithDefault(request.Input, "kind", "prompt")),
			"name":            stringValueWithDefault(input, "name", "target snapshot"),
			"version":         maxInt(1, intValue(input, "version")),
			"digest":          stableDigest(input),
			"createdAt":       now.UTC().Format(time.RFC3339),
			"createdBy":       actorID(request),
			"source":          stringValueWithDefault(input, "source", "manual"),
			"parts":           arrayValue(input, "parts"),
			"metadata":        objectValueWithDefault(input, "metadata"),
			"reproducibility": stringValueWithDefault(input, "reproducibility", "full"),
		}, nil
	case EvalTargetPromoteSubject:
		id := stableID("promotion", request.RequestID, stringValue(request.Input, "candidateSnapshotId"), stringValue(request.Input, "comparisonId"))
		return map[string]any{
			"id":                        id,
			"projectId":                 stringValue(request.Input, "projectId"),
			"targetRef":                 objectValueWithDefault(request.Input, "targetRef"),
			"candidateTargetSnapshotId": stringValue(request.Input, "candidateSnapshotId"),
			"comparisonId":              stringValue(request.Input, "comparisonId"),
			"baselineTargetSnapshotId":  optionalStringValue(request.Input, "baselineTargetSnapshotId"),
			"evidenceEvaluationRunIds":  arrayValue(request.Input, "evidenceEvaluationRunIds"),
			"summary":                   stringValue(request.Input, "summary"),
			"promotedBy":                actorID(request),
			"promotedAt":                now.UTC().Format(time.RFC3339),
			"notes":                     stringValue(request.Input, "notes"),
		}, nil
	case EvalOptimizationStepPersistSubject:
		payload := objectValueWithDefault(request.Input, "payload")
		record := skillOptimizationStepRecord(payload)
		if stringValue(record, "id") == "" {
			record["id"] = stringValue(request.Input, "stepId")
		}
		return record, nil
	case EvalOptimizationMemoryPersistSubject:
		payload := objectValueWithDefault(request.Input, "payload")
		record := map[string]any{
			"id":                 stableID("optimization-memory", stringValue(request.Input, "optimizationRunId")),
			"projectId":          stringValueWithDefault(payload, "projectId", stringValue(request.Input, "projectId")),
			"optimizationRunId":  stringValueWithDefault(payload, "optimizationRunId", stringValue(request.Input, "optimizationRunId")),
			"rejectedEditBuffer": skillOptimizationEdits(arrayValue(payload, "rejectedEditBuffer"), 20),
			"slowUpdateContent":  boundedString(stringValue(payload, "slowUpdateContent"), 8192),
			"metaMemoryContent":  boundedString(stringValue(payload, "metaMemoryContent"), 8192),
			"truncated":          boolValue(payload, "truncated"),
			"updatedAt":          stringValue(payload, "updatedAt"),
		}
		return record, nil
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

func decodeEvalMutationRequestForSubject(subject string, data []byte) (contracts.EvalMutationRequest, error) {
	request, err := decodeEvalMutationRequest(data)
	if err == nil {
		return request, nil
	}

	raw := map[string]json.RawMessage{}
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&raw); err != nil {
		return contracts.EvalMutationRequest{}, err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return contracts.EvalMutationRequest{}, fmt.Errorf("multiple JSON values")
	}

	var envelope contracts.BridgeEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return contracts.EvalMutationRequest{}, err
	}
	input := map[string]any{}
	if rawInput, ok := raw["input"]; ok {
		var objectInput map[string]any
		if err := json.Unmarshal(rawInput, &objectInput); err == nil && objectInput != nil {
			for key, value := range objectInput {
				input[key] = value
			}
		} else {
			var arrayInput []any
			if err := json.Unmarshal(rawInput, &arrayInput); err == nil {
				input["items"] = arrayInput
				input["input"] = arrayInput
			} else {
				var scalarInput any
				if err := json.Unmarshal(rawInput, &scalarInput); err != nil {
					return contracts.EvalMutationRequest{}, err
				}
				input["input"] = scalarInput
			}
		}
	}
	if rawPayload, ok := raw["payload"]; ok {
		var payload map[string]any
		if err := json.Unmarshal(rawPayload, &payload); err != nil {
			return contracts.EvalMutationRequest{}, err
		}
		input["payload"] = payload
		for key, value := range payload {
			if _, exists := input[key]; !exists {
				input[key] = value
			}
		}
	}

	for _, field := range []string{
		"projectId",
		"datasetId",
		"datasetItemId",
		"datasetVersionId",
		"expectedDatasetVersion",
		"idempotencyKey",
		"stagedUploadId",
		"importJobId",
		"transferId",
		"transferKind",
		"evaluationDefinitionId",
		"evaluationRunId",
		"baselineRunId",
		"candidateRunId",
		"baselineSnapshotId",
		"candidateSnapshotId",
		"baselineTargetSnapshotId",
		"candidateTargetSnapshotId",
		"targetSnapshotId",
		"comparisonId",
		"optimizationRunId",
		"stepId",
	} {
		copyRawField(raw, input, field)
	}
	for _, field := range []string{"sourceRef", "targetRef", "candidateIds"} {
		copyRawField(raw, input, field)
	}
	if itemID := stringValue(input, "datasetItemId"); itemID != "" && stringValue(input, "itemId") == "" {
		input["itemId"] = itemID
	}
	if subject == EvalDatasetItemsAppendSubject {
		if items := arrayValue(input, "input"); len(items) > 0 && len(arrayValue(input, "items")) == 0 {
			input["items"] = items
		}
	}
	return contracts.EvalMutationRequest{BridgeEnvelope: envelope, Input: input}, nil
}

func copyRawField(raw map[string]json.RawMessage, input map[string]any, field string) {
	if _, exists := input[field]; exists {
		return
	}
	value, ok := raw[field]
	if !ok {
		return
	}
	var decoded any
	if err := json.Unmarshal(value, &decoded); err == nil {
		input[field] = decoded
	}
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
	case EvalDatasetImportPrepareSubject:
		return validateDatasetImportPrepareRequest(request)
	case EvalDatasetImportCommitSubject:
		if err := requireNonBlank(request.Input, "importId"); err != nil {
			return err
		}
		if intValue(request.Input, "expectedDatasetVersion") < 1 && stringValue(request.Input, "expectedDatasetVersionId") == "" {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: expectedDatasetVersionId is required")
		}
		return nil
	case EvalDatasetCreateSubject:
		if err := requireNonBlank(request.Input, "name"); err != nil {
			return err
		}
		if stringValue(request.Input, "projectId") != "" {
			if err := requireNonBlank(request.Input, "idempotencyKey"); err != nil {
				return err
			}
			return requireObject(request.Input, "settings")
		}
		return nil
	case EvalDatasetItemsAppendSubject:
		if err := requireNonBlank(request.Input, "datasetId"); err != nil {
			return err
		}
		if stringValue(request.Input, "projectId") != "" {
			if err := requireNonBlank(request.Input, "idempotencyKey"); err != nil {
				return err
			}
			if intValue(request.Input, "expectedDatasetVersion") < 1 && stringValue(request.Input, "expectedDatasetVersionId") == "" {
				return fmt.Errorf("ERR-001 VALIDATION_FAILED: expectedDatasetVersionId is required")
			}
			for _, item := range arrayValue(request.Input, "items") {
				itemMap, ok := item.(map[string]any)
				if !ok {
					return fmt.Errorf("ERR-001 VALIDATION_FAILED: dataset item is invalid")
				}
				if err := validateDatasetSplit(stringValueWithDefault(itemMap, "split", stringValue(request.Input, "defaultSplit"))); err != nil {
					return err
				}
				if err := validateCurationStatus(stringValueWithDefault(itemMap, "curationStatus", "draft")); err != nil {
					return err
				}
			}
		} else if intValue(request.Input, "version") < 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: version must be at least 1")
		}
		if len(arrayValue(request.Input, "items")) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: items is required")
		}
		return nil
	case EvalDatasetSettingsUpdateSubject:
		for _, field := range []string{"datasetId", "expectedDatasetVersionId", "idempotencyKey"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		return requireObject(request.Input, "settings")
	case EvalDatasetItemPromoteSubject:
		for _, field := range []string{"datasetId", "sourceTraceId", "sourceSpanId"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		return nil
	case EvalDatasetItemUpdateSubject:
		for _, field := range []string{"datasetId", "itemId", "operation"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		if intValue(request.Input, "expectedDatasetVersion") < 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: expectedDatasetVersion must be at least 1")
		}
		if stringValue(request.Input, "projectId") != "" {
			if err := requireNonBlank(request.Input, "idempotencyKey"); err != nil {
				return err
			}
			if split := stringValue(request.Input, "split"); split != "" {
				if err := validateDatasetSplit(split); err != nil {
					return err
				}
			}
			if status := stringValue(request.Input, "curationStatus"); status != "" {
				if err := validateCurationStatus(status); err != nil {
					return err
				}
			}
		}
		return nil
	case EvalDatasetCandidatesPrepareSubject:
		if len(arrayValue(request.Input, "sources")) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: sources is required")
		}
		if strings.TrimSpace(stringValue(firstMap(arrayValue(request.Input, "sources")), "sourceKind")) == "" {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: sourceKind is required")
		}
		return nil
	case EvalDatasetCandidatesCommitSubject:
		if err := requireNonBlank(request.Input, "datasetId"); err != nil {
			return err
		}
		if intValue(request.Input, "expectedDatasetVersion") < 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: expectedDatasetVersion must be at least 1")
		}
		if len(arrayValue(request.Input, "candidateIds")) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: candidateIds is required")
		}
		if stringValue(request.Input, "projectId") != "" {
			if err := requireNonBlank(request.Input, "idempotencyKey"); err != nil {
				return err
			}
		}
		return nil
	case EvalEvaluationCreateSubject:
		if err := requireNonBlank(request.Input, "idempotencyKey"); err != nil {
			return err
		}
		if err := requireNonBlank(request.Input, "projectId"); err != nil {
			return err
		}
		return requireNonBlank(request.Input, "name")
	case EvalEvaluationUpdateSubject:
		for _, field := range []string{"projectId", "evaluationDefinitionId", "idempotencyKey"} {
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
		if err := requireObject(request.Input, "definition"); err != nil {
			return err
		}
		return validateScorerDefinition(objectValue(request.Input, "definition"))
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
		if stringValue(request.Input, "projectId") != "" {
			if err := requireNonBlank(request.Input, "idempotencyKey"); err != nil {
				return err
			}
			if len(arrayValue(request.Input, "itemRuns")) == 0 && len(arrayValue(request.Input, "evaluationItemRuns")) == 0 && len(arrayValue(request.Input, "results")) == 0 && len(arrayValue(request.Input, "metricResults")) == 0 && len(objectValue(request.Input, "evaluationRun")) == 0 && len(objectValue(request.Input, "optimizationRun")) == 0 && len(objectValue(request.Input, "payload")) == 0 {
				return fmt.Errorf("ERR-001 VALIDATION_FAILED: payload must include evaluationRun, itemRuns, or metricResults")
			}
			return nil
		}
		if len(arrayValue(request.Input, "itemRuns")) == 0 && len(arrayValue(request.Input, "results")) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: itemRuns or results is required")
		}
		for _, result := range arrayValue(request.Input, "results") {
			resultMap, ok := result.(map[string]any)
			if !ok {
				return fmt.Errorf("ERR-001 VALIDATION_FAILED: result is invalid")
			}
			if payload := objectValue(resultMap, "payload"); len(payload) > 0 {
				if err := validateEvalResultPayload(payload); err != nil {
					return err
				}
			}
		}
		if len(arrayValue(request.Input, "itemRuns")) > 0 {
			return requireNonBlank(request.Input, "experimentRunId")
		}
		return nil
	case EvalEvaluationComparisonCreateSubject:
		for _, field := range []string{"projectId", "baselineRunId", "candidateRunId", "idempotencyKey"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		return nil
	case EvalTargetSnapshotCreateSubject:
		for _, field := range []string{"projectId", "idempotencyKey"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		return requireObject(request.Input, "targetRef")
	case EvalTargetPromoteSubject:
		for _, field := range []string{"projectId", "candidateSnapshotId", "comparisonId", "idempotencyKey"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		return requireObject(request.Input, "targetRef")
	case EvalOptimizationStepPersistSubject:
		for _, field := range []string{"projectId", "optimizationRunId", "stepId", "idempotencyKey"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		payload := objectValue(request.Input, "payload")
		if len(payload) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: payload is required")
		}
		for _, field := range []string{"id", "optimizationRunId", "projectId", "status", "rolloutEvaluationRunId", "baselineSkillDigest", "gateDecision", "startedAt"} {
			if err := requireNonBlank(payload, field); err != nil {
				return err
			}
		}
		if intValue(payload, "epoch") < 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: epoch must be at least 1")
		}
		if intValue(payload, "step") < 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: step must be at least 1")
		}
		return nil
	case EvalOptimizationMemoryPersistSubject:
		for _, field := range []string{"projectId", "optimizationRunId", "idempotencyKey"} {
			if err := requireNonBlank(request.Input, field); err != nil {
				return err
			}
		}
		payload := objectValue(request.Input, "payload")
		if len(payload) == 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: payload is required")
		}
		for _, field := range []string{"optimizationRunId", "projectId", "updatedAt"} {
			if err := requireNonBlank(payload, field); err != nil {
				return err
			}
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

func datasetTransferRoot() string {
	if value := strings.TrimSpace(os.Getenv("CLOUDGRID_DATASET_TRANSFER_DIR")); value != "" {
		return value
	}
	return ".cloudgrid/dataset-transfer"
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

func bridgeErrorFromError(err error) contracts.BridgeError {
	if err == nil {
		return storageBridgeError()
	}
	message := err.Error()
	if strings.HasPrefix(message, validationErrorID) {
		return validationBridgeError(message)
	}
	if strings.HasPrefix(message, storageErrorID) {
		return storageBridgeError()
	}
	return storageBridgeError()
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

func validateDatasetSplit(split string) error {
	switch split {
	case "training", "validation", "test":
		return nil
	default:
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: split is invalid")
	}
}

func validateCurationStatus(status string) error {
	switch status {
	case "draft", "needs_expected", "needs_review", "ready", "rejected":
		return nil
	default:
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: curationStatus is invalid")
	}
}

func datasetItemRevisionRecord(request contracts.EvalMutationRequest, item map[string]any, datasetID string, itemID string, revisionID string, revision int, now time.Time) map[string]any {
	status := stringValueWithDefault(item, "curationStatus", "draft")
	split := stringValueWithDefault(item, "split", "training")
	sourceRefs := arrayValue(item, "sourceRefs")
	if len(sourceRefs) == 0 {
		sourceRefs = arrayValue(request.Input, "sourceRefs")
	}
	record := map[string]any{
		"id":               revisionID,
		"datasetItemId":    itemID,
		"datasetId":        datasetID,
		"revision":         maxInt(1, revision),
		"input":            item["input"],
		"expected":         item["expected"],
		"observedOutput":   item["observedOutput"],
		"reason":           stringValue(item, "reason"),
		"curationStatus":   status,
		"curationNote":     optionalStringValue(item, "curationNote"),
		"split":            split,
		"sourceRefs":       sourceRefs,
		"contentTreatment": stringValueWithDefault(item, "contentTreatment", "original"),
		"metadata":         objectValueWithDefault(item, "metadata"),
		"createdAt":        now.UTC().Format(time.RFC3339),
		"createdBy":        actorID(request),
		"updatedAt":        now.UTC().Format(time.RFC3339),
		"updatedBy":        actorID(request),
	}
	if provenance := objectValue(item, "anonymizationProvenance"); len(provenance) > 0 {
		record["anonymizationProvenance"] = provenance
	}
	record["digest"] = stableDigest(map[string]any{
		"input":            record["input"],
		"expected":         record["expected"],
		"observedOutput":   record["observedOutput"],
		"reason":           record["reason"],
		"curationStatus":   record["curationStatus"],
		"split":            record["split"],
		"sourceRefs":       record["sourceRefs"],
		"contentTreatment": record["contentTreatment"],
		"metadata":         record["metadata"],
	})
	return record
}

func emptySplitCounts() map[string]any {
	return map[string]any{"training": 0, "validation": 0, "test": 0}
}

func datasetVersionID(datasetID string, version int) string {
	return fmt.Sprintf("%s:version:%d", datasetID, maxInt(1, version))
}

func datasetVersionNumberFromInput(input map[string]any) int {
	if version := intValue(input, "expectedDatasetVersion"); version > 0 {
		return version
	}
	versionID := stringValue(input, "expectedDatasetVersionId")
	if versionID == "" {
		versionID = stringValue(input, "currentVersionId")
	}
	prefix := ":version:"
	index := strings.LastIndex(versionID, prefix)
	if index < 0 {
		return 1
	}
	version := 0
	for _, char := range versionID[index+len(prefix):] {
		if char < '0' || char > '9' {
			break
		}
		version = version*10 + int(char-'0')
	}
	if version < 1 {
		return 1
	}
	return version
}

func firstNonEmptyArray(input map[string]any, keys ...string) []any {
	for _, key := range keys {
		if values := arrayValue(input, key); len(values) > 0 {
			return values
		}
	}
	return []any{}
}

func cloneAnyMap(input map[string]any) map[string]any {
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func actorID(request contracts.EvalMutationRequest) string {
	if request.AuthContext != nil && request.AuthContext.PrincipalID != nil && strings.TrimSpace(*request.AuthContext.PrincipalID) != "" {
		return *request.AuthContext.PrincipalID
	}
	return "system"
}

func stableDigest(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		encoded = []byte(fmt.Sprint(value))
	}
	sum := sha256.Sum256(encoded)
	return "sha256:" + hex.EncodeToString(sum[:])
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

func skillOptimizationStepRecord(payload map[string]any) map[string]any {
	return map[string]any{
		"id":                        stringValue(payload, "id"),
		"optimizationRunId":         stringValue(payload, "optimizationRunId"),
		"projectId":                 stringValue(payload, "projectId"),
		"epoch":                     intValue(payload, "epoch"),
		"step":                      intValue(payload, "step"),
		"status":                    stringValue(payload, "status"),
		"rolloutEvaluationRunId":    stringValue(payload, "rolloutEvaluationRunId"),
		"candidateTargetSnapshotId": optionalStringValue(payload, "candidateTargetSnapshotId"),
		"baselineSkillDigest":       stringValue(payload, "baselineSkillDigest"),
		"candidateSkillDigest":      optionalStringValue(payload, "candidateSkillDigest"),
		"proposedEdits":             skillOptimizationEdits(arrayValue(payload, "proposedEdits"), 100),
		"selectedEdits":             skillOptimizationEdits(arrayValue(payload, "selectedEdits"), 100),
		"rejectedEditSummaries":     skillOptimizationEdits(arrayValue(payload, "rejectedEditSummaries"), 100),
		"trainingScore":             skillOptimizationNumericValue(payload, "trainingScore"),
		"validationScore":           optionalNumericValue(payload, "validationScore"),
		"gateDecision":              stringValue(payload, "gateDecision"),
		"problem":                   objectValueWithDefault(payload, "problem"),
		"startedAt":                 stringValue(payload, "startedAt"),
		"endedAt":                   optionalStringValue(payload, "endedAt"),
	}
}

func skillOptimizationEdits(items []any, limit int) []any {
	if limit <= 0 || len(items) == 0 {
		return []any{}
	}
	edits := make([]any, 0, skillOptimizationMinInt(len(items), limit))
	for _, item := range items {
		edit, ok := item.(map[string]any)
		if !ok {
			continue
		}
		edits = append(edits, map[string]any{
			"op":             stringValue(edit, "op"),
			"filePath":       optionalStringValue(edit, "filePath"),
			"target":         optionalStringValue(edit, "target"),
			"contentPreview": boundedOptionalString(stringValue(edit, "contentPreview"), 2000),
			"rationale":      boundedOptionalString(stringValue(edit, "rationale"), 2000),
			"sourceType":     stringValue(edit, "sourceType"),
			"supportCount":   intValue(edit, "supportCount"),
			"evidenceRefs":   skillOptimizationEvidenceRefs(arrayValue(edit, "evidenceRefs"), 50),
		})
		if len(edits) >= limit {
			break
		}
	}
	return edits
}

func skillOptimizationEvidenceRefs(items []any, limit int) []any {
	refs := make([]any, 0, skillOptimizationMinInt(len(items), limit))
	for _, item := range items {
		ref, ok := item.(map[string]any)
		if !ok {
			continue
		}
		clean := map[string]any{}
		for _, key := range []string{"traceId", "spanId", "evaluationRunId", "evaluationItemRunId", "importJobId", "candidateId"} {
			if value := stringValue(ref, key); value != "" {
				clean[key] = value
			}
		}
		if len(clean) > 0 {
			refs = append(refs, clean)
		}
		if len(refs) >= limit {
			break
		}
	}
	return refs
}

func skillOptimizationNumericValue(input map[string]any, key string) float64 {
	value, ok := input[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		number, _ := typed.Float64()
		return number
	default:
		return 0
	}
}

func optionalNumericValue(input map[string]any, key string) any {
	if _, ok := input[key]; !ok || input[key] == nil {
		return nil
	}
	return skillOptimizationNumericValue(input, key)
}

func boundedOptionalString(value string, limit int) any {
	if value == "" {
		return nil
	}
	return boundedString(value, limit)
}

func boundedString(value string, limit int) string {
	value = strings.TrimSpace(value)
	if limit > 0 && len(value) > limit {
		return value[:limit]
	}
	return value
}

func skillOptimizationMinInt(left int, right int) int {
	if left < right {
		return left
	}
	return right
}

func sortedStringValues(items []any) []string {
	values := make([]string, 0, len(items))
	for _, item := range items {
		value := strings.TrimSpace(fmt.Sprint(item))
		if value != "" {
			values = append(values, value)
		}
	}
	sort.Strings(values)
	return values
}

func anonymizationRecord(input map[string]any, now time.Time) map[string]any {
	policyID := stringValue(input, "anonymizationPolicyId")
	policyVersion := intValue(input, "anonymizationPolicyVersion")
	if policyID == "" || policyVersion < 1 {
		return nil
	}
	return map[string]any{
		"policyId":          policyID,
		"policyVersion":     policyVersion,
		"transformedAt":     now.UTC().Format(time.RFC3339),
		"consistencyScope":  stringValueWithDefault(input, "anonymizationConsistencyScope", "project"),
		"transformedFields": arrayValue(input, "anonymizationTransformedFields"),
	}
}

func validateScorerDefinition(definition map[string]any) error {
	if strings.TrimSpace(stringValue(definition, "type")) == "" {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: scorer definition type is required")
	}
	if strings.TrimSpace(stringValue(definition, "resultKind")) == "" {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: scorer definition resultKind is required")
	}
	requirements := objectValue(definition, "requirements")
	for _, field := range []string{"executionLocation", "contentClass", "latencyClass"} {
		if strings.TrimSpace(stringValue(requirements, field)) == "" {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: scorer definition requirements.%s is required", field)
		}
	}
	switch stringValue(definition, "type") {
	case "exact_match":
		if stringValue(definition, "expectedPath") == "" || stringValue(definition, "actualPath") == "" {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: exact_match scorer paths are required")
		}
	}
	return nil
}

func validateEvalResultPayload(payload map[string]any) error {
	resultKind := stringValue(payload, "resultKind")
	if resultKind == "" {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: eval result payload resultKind is required")
	}
	if len(objectValue(payload, "metrics")) == 0 {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: eval result payload metrics is required")
	}
	if _, ok := payload["breakdown"].(map[string]any); !ok {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: eval result payload breakdown is required")
	}
	if len(objectValue(payload, "visualization")) == 0 {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: eval result payload visualization is required")
	}
	if resultKind == "classification" {
		metrics := objectValue(payload, "metrics")
		accuracy, ok := numericValue(metrics, "accuracy")
		if !ok || accuracy < 0 || accuracy > 1 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: classification accuracy is invalid")
		}
		if intValue(metrics, "support") < 0 {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: classification support is invalid")
		}
		if _, ok := objectValue(payload, "breakdown")["categories"]; !ok {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: classification categories are required")
		}
		visualization := objectValue(payload, "visualization")
		if stringValue(visualization, "kind") != "confusion_matrix" {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: classification visualization is invalid")
		}
		if _, ok := visualization["labels"]; !ok {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: classification visualization is invalid")
		}
		if _, ok := visualization["matrix"]; !ok {
			return fmt.Errorf("ERR-001 VALIDATION_FAILED: classification visualization is invalid")
		}
	}
	return nil
}

func numericValue(input map[string]any, key string) (float64, bool) {
	value, ok := input[key]
	if !ok || value == nil {
		return 0, false
	}
	switch typed := value.(type) {
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case float64:
		return typed, true
	default:
		return 0, false
	}
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
