package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/orchestrator"
	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	SubjectExperimentStart       = "eval.experiment.start"
	SubjectExperimentCancel      = "eval.experiment.cancel"
	SubjectOptimizationStart     = "eval.optimization.start"
	SubjectPersistedProjections  = "ai.persisted.projections"
	SubjectExperimentSearch      = "eval.experiment.search"
	SubjectDatasetSearch         = "eval.dataset.search"
	SubjectScorerSearch          = "eval.scorer.search"
	SubjectResultsPersist        = "eval.results.persist"
	SubjectExperimentProgress    = "eval.experiment.progress"
	SubjectManifestResolve       = "eval.manifest.resolve"
	SubjectOnlinePolicyResolve   = "eval.online.policy_matches.resolve"
	SubjectControlAISettingsGet  = "control.ai_settings.get"
	validationErrorID            = "ERR-001"
	validationErrorCode          = "VALIDATION_FAILED"
	messageBridgeErrorID         = "ERR-013"
	messageBridgeErrorCode       = "MESSAGE_BRIDGE_UNAVAILABLE"
	defaultRequestTimeout        = 1500 * time.Millisecond
	defaultHarnessRequestTimeout = 30 * time.Second
	defaultHarnessUserAgent      = "cloudgrid-ai-eval-runner"
)

type BridgeMessage interface {
	Subject() string
	Data() []byte
	Respond(response []byte) error
}

type Requester interface {
	RequestWithContext(ctx context.Context, subject string, data []byte) (*Message, error)
	Publish(subject string, data []byte) error
}

type Message struct {
	Data []byte
}

type RunnerService struct {
	runner *orchestrator.Runner
	logger *slog.Logger
}

type Handler func(BridgeMessage)

func NewRunnerService(runner *orchestrator.Runner, logger *slog.Logger) *RunnerService {
	return &RunnerService{runner: runner, logger: logger}
}

func (service *RunnerService) SubjectHandlers() map[string]Handler {
	return map[string]Handler{
		SubjectExperimentStart:      service.handleExperimentStart(),
		SubjectExperimentCancel:     service.handleExperimentCancel(),
		SubjectOptimizationStart:    service.handleOptimizationStart(),
		SubjectPersistedProjections: service.handlePersistedProjections(),
	}
}

func (service *RunnerService) handleExperimentStart() Handler {
	return func(msg BridgeMessage) {
		var request contracts.ExperimentStartRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, mutationErrorResponse("", validationBridgeError("invalid experiment start request JSON")))
			return
		}
		if err := validateEnvelope(request.BridgeEnvelope); err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError(err.Error())))
			return
		}
		if strings.TrimSpace(request.ExperimentID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("experimentId is required")))
			return
		}
		ctx, cancel := context.WithTimeout(contextWithAuth(request.AuthContext), defaultRequestTimeout)
		defer cancel()
		result, err := service.runner.StartOfflineExperiment(ctx, orchestrator.StartExperimentRequest{
			RequestID:    request.RequestID,
			ProjectID:    projectID(request.AuthContext),
			ExperimentID: request.ExperimentID,
			SolverRef:    request.SolverRef,
			TraceContext: traceContext(request.TraceContext),
		})
		if err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, bridgeErrorFromError(err)))
			return
		}
		respond(msg, contracts.EvalMutationResponse{RequestID: request.RequestID, OK: true, Data: experimentRunData(result.Run)})
	}
}

func (service *RunnerService) handleExperimentCancel() Handler {
	return func(msg BridgeMessage) {
		var request contracts.ExperimentCancelRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, mutationErrorResponse("", validationBridgeError("invalid experiment cancel request JSON")))
			return
		}
		if err := validateEnvelope(request.BridgeEnvelope); err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError(err.Error())))
			return
		}
		if strings.TrimSpace(request.ExperimentRunID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("experimentRunId is required")))
			return
		}
		ctx, cancel := context.WithTimeout(contextWithAuth(request.AuthContext), defaultRequestTimeout)
		defer cancel()
		result, err := service.runner.CancelExperimentRun(ctx, orchestrator.CancelExperimentRequest{
			RequestID:       request.RequestID,
			ExperimentRunID: request.ExperimentRunID,
		})
		if err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, bridgeErrorFromError(err)))
			return
		}
		respond(msg, contracts.EvalMutationResponse{
			RequestID: request.RequestID,
			OK:        true,
			Data: map[string]any{
				"id":              result.ExperimentRunID,
				"experimentRunId": result.ExperimentRunID,
				"status":          ports.ExperimentRunStatusCancelled,
				"summary":         map[string]any{"cancelled": result.Cancelled},
			},
		})
	}
}

func (service *RunnerService) handleOptimizationStart() Handler {
	return func(msg BridgeMessage) {
		var request contracts.OptimizationStartRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, mutationErrorResponse("", validationBridgeError("invalid optimization start request JSON")))
			return
		}
		if err := validateEnvelope(request.BridgeEnvelope); err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError(err.Error())))
			return
		}
		if strings.TrimSpace(request.ExperimentID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("experimentId is required")))
			return
		}
		if strings.TrimSpace(request.OptimizerKind) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("optimizerKind is required")))
			return
		}
		if strings.TrimSpace(request.BasePromptVersionID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("basePromptVersionId is required")))
			return
		}
		ctx, cancel := context.WithTimeout(contextWithAuth(request.AuthContext), defaultRequestTimeout)
		defer cancel()
		result, err := service.runner.StartOptimization(ctx, orchestrator.StartOptimizationRequest{
			RequestID:           request.RequestID,
			ProjectID:           projectID(request.AuthContext),
			ExperimentID:        request.ExperimentID,
			OptimizerKind:       request.OptimizerKind,
			BasePromptVersionID: request.BasePromptVersionID,
			Config:              request.Config,
			TraceContext:        traceContext(request.TraceContext),
		})
		if err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, bridgeErrorFromError(err)))
			return
		}
		respond(msg, contracts.EvalMutationResponse{
			RequestID: request.RequestID,
			OK:        true,
			Data: map[string]any{
				"id":                 result.ExperimentRunID,
				"experimentRunId":    result.ExperimentRunID,
				"experimentId":       request.ExperimentID,
				"status":             ports.ExperimentRunStatusFinished,
				"candidatePromptIds": result.CandidatePromptIDs,
				"summary":            result.Summary,
			},
		})
	}
}

func (service *RunnerService) handlePersistedProjections() Handler {
	return func(msg BridgeMessage) {
		var notification contracts.AiProjectionPersistedNotification
		if err := decodeStrict(msg.Data(), &notification); err != nil {
			logAdapterWarning(service.logger, "persisted projection notification validation failed", err)
			return
		}
		if err := service.runner.HandlePersistedProjections(context.Background(), ports.PersistedProjectionNotification{
			RequestID:     notification.RequestID,
			ProjectID:     stringPtrValue(notification.ProjectID),
			TraceID:       notification.TraceID,
			ProjectionIDs: notification.ProjectionIDs,
			SpanIDs:       notification.SpanIDs,
			Kinds:         projectionKinds(notification.Kinds),
			PersistedAt:   notification.PersistedAt.UTC().Format(time.RFC3339Nano),
		}); err != nil {
			logAdapterWarning(service.logger, "persisted projection notification rejected", err)
		}
	}
}

func respond(msg BridgeMessage, response contracts.EvalMutationResponse) {
	data, err := json.Marshal(response)
	if err != nil {
		return
	}
	_ = msg.Respond(data)
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("multiple JSON values")
	}
	return nil
}

func validateEnvelope(envelope contracts.BridgeEnvelope) error {
	if strings.TrimSpace(envelope.RequestID) == "" {
		return errors.New("requestId is required")
	}
	if envelope.IssuedAt.IsZero() {
		return errors.New("issuedAt is required")
	}
	return nil
}

func mutationErrorResponse(requestID string, err contracts.BridgeError) contracts.EvalMutationResponse {
	return contracts.EvalMutationResponse{RequestID: requestID, OK: false, Error: &err}
}

func validationBridgeError(message string) contracts.BridgeError {
	return contracts.BridgeError{ID: validationErrorID, Code: validationErrorCode, Message: message, Retryable: false}
}

func messageBridgeError() contracts.BridgeError {
	return contracts.BridgeError{ID: messageBridgeErrorID, Code: messageBridgeErrorCode, Message: "Message bridge is unavailable", Retryable: true}
}

func bridgeErrorFromError(err error) contracts.BridgeError {
	if err == nil {
		return validationBridgeError("unknown error")
	}
	message := err.Error()
	if strings.HasPrefix(message, "ERR-001") {
		return contracts.BridgeError{ID: "ERR-001", Code: "VALIDATION_FAILED", Message: message, Retryable: false}
	}
	if strings.HasPrefix(message, "ERR-AIE-") {
		return contracts.BridgeError{ID: "ERR-AIE", Code: "AI_EVAL_RUNNER_REJECTED", Message: message, Retryable: false}
	}
	if strings.HasPrefix(message, "ERR-013") {
		return messageBridgeError()
	}
	return contracts.BridgeError{ID: "ERR-006", Code: "STORAGE_UNAVAILABLE", Message: "Storage is unavailable", Retryable: true}
}

func projectID(authContext *contracts.AuthContext) string {
	if authContext == nil || authContext.ProjectID == nil {
		return ""
	}
	return *authContext.ProjectID
}

func traceContext(values map[string]any) map[string]string {
	if len(values) == 0 {
		return nil
	}
	result := make(map[string]string, len(values))
	for key, value := range values {
		if text, ok := value.(string); ok {
			result[key] = text
		}
	}
	return result
}

func experimentRunData(run ports.ExperimentRun) map[string]any {
	return map[string]any{
		"id":           run.ID,
		"experimentId": run.ExperimentID,
		"solverRef":    run.SolverRef,
		"status":       run.Status,
		"startedAt":    run.StartedAt,
		"endedAt":      run.EndedAt,
		"summary":      run.Summary,
	}
}

func projectionKinds(kinds []contracts.AiProjectionKind) []string {
	result := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		result = append(result, string(kind))
	}
	return result
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func logAdapterWarning(logger *slog.Logger, message string, err error) {
	if logger == nil {
		return
	}
	logger.Warn(message, "service", "ai-eval-runner", "error", err)
}

func marshalJSON(value any) ([]byte, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("%s %s: encode request failed", messageBridgeErrorID, messageBridgeErrorCode)
	}
	return data, nil
}

func doJSON(ctx context.Context, client *http.Client, request *http.Request, target any) error {
	response, err := client.Do(request.WithContext(ctx))
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("harness adapter returned status %d", response.StatusCode)
	}
	decoder := json.NewDecoder(response.Body)
	decoder.UseNumber()
	return decoder.Decode(target)
}
