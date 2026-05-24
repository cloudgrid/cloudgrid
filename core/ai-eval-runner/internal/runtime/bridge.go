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
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

const (
	SubjectEvaluationRunStart    = "eval.evaluation.run.start"
	SubjectEvaluationRunPause    = "eval.evaluation.run.pause"
	SubjectEvaluationRunResume   = "eval.evaluation.run.resume"
	SubjectEvaluationRunCancel   = "eval.evaluation.run.cancel"
	SubjectExperimentStart       = SubjectEvaluationRunStart
	SubjectExperimentPause       = SubjectEvaluationRunPause
	SubjectExperimentResume      = SubjectEvaluationRunResume
	SubjectExperimentCancel      = SubjectEvaluationRunCancel
	SubjectOptimizationStart     = "eval.optimization.start"
	SubjectPersistedProjections  = "ai.persisted.projections"
	SubjectExperimentSearch      = "eval.evaluation.run.search"
	SubjectDatasetSearch         = "eval.dataset.search"
	SubjectScorerSearch          = "eval.evaluation.search"
	SubjectDatasetVersionGet     = "eval.dataset.version.get"
	SubjectTargetSnapshotGet     = "eval.target.snapshot.get"
	SubjectResultsPersist        = "eval.results.persist"
	SubjectExperimentProgress    = "eval.live.events.*.*"
	SubjectManifestResolve       = "eval.target.snapshot.get"
	SubjectOnlinePolicyResolve   = "eval.live.start"
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
	runner            *orchestrator.Runner
	logger            *slog.Logger
	selfObservability selfobs.TraceLogRecorder
}

type Handler func(BridgeMessage)

type RunnerServiceOptions struct {
	SelfObservability selfobs.TraceLogRecorder
}

func NewRunnerService(runner *orchestrator.Runner, logger *slog.Logger) *RunnerService {
	return NewRunnerServiceWithOptions(runner, logger, RunnerServiceOptions{})
}

func NewRunnerServiceWithOptions(runner *orchestrator.Runner, logger *slog.Logger, options RunnerServiceOptions) *RunnerService {
	return &RunnerService{runner: runner, logger: logger, selfObservability: options.SelfObservability}
}

func (service *RunnerService) SubjectHandlers() map[string]Handler {
	handlers := map[string]Handler{
		SubjectEvaluationRunStart:   service.handleEvaluationRunStart(),
		SubjectEvaluationRunPause:   service.handleEvaluationRunControl("pause"),
		SubjectEvaluationRunResume:  service.handleEvaluationRunControl("resume"),
		SubjectEvaluationRunCancel:  service.handleEvaluationRunCancel(),
		SubjectOptimizationStart:    service.handleOptimizationStart(),
		SubjectPersistedProjections: service.handlePersistedProjections(),
	}
	if service.selfObservability == nil {
		return handlers
	}
	for subject, handler := range handlers {
		handlers[subject] = withRunnerSelfObservability(subject, service.selfObservability, handler)
	}
	return handlers
}

func (service *RunnerService) handleEvaluationRunControl(command string) Handler {
	return func(msg BridgeMessage) {
		var request contracts.EvaluationRunControlRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, mutationErrorResponse("", validationBridgeError("invalid evaluation control request JSON")))
			return
		}
		if err := validateEnvelope(request.BridgeEnvelope); err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError(err.Error())))
			return
		}
		if strings.TrimSpace(request.EvaluationRunID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("evaluationRunId is required")))
			return
		}
		ctx, cancel := context.WithTimeout(contextWithAuth(request.AuthContext), defaultRequestTimeout)
		defer cancel()
		controlRequest := orchestrator.EvaluationRunControlRequest{
			RequestID:       request.RequestID,
			ProjectID:       request.ProjectID,
			EvaluationRunID: request.EvaluationRunID,
			Command:         command,
			IdempotencyKey:  request.IdempotencyKey,
		}
		var result orchestrator.EvaluationRunControlResult
		var err error
		if command == "pause" {
			result, err = service.runner.PauseEvaluationRun(ctx, controlRequest)
		} else {
			result, err = service.runner.ResumeEvaluationRun(ctx, controlRequest)
		}
		if err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, bridgeErrorFromError(err)))
			return
		}
		respond(msg, contracts.EvalMutationResponse{RequestID: request.RequestID, OK: true, Data: evaluationRunData(result.Run)})
	}
}

func (service *RunnerService) handleEvaluationRunStart() Handler {
	return func(msg BridgeMessage) {
		var request contracts.EvaluationRunStartRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, mutationErrorResponse("", validationBridgeError("invalid evaluation run start request JSON")))
			return
		}
		if err := validateEnvelope(request.BridgeEnvelope); err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError(err.Error())))
			return
		}
		if strings.TrimSpace(request.DatasetVersionID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("datasetVersionId is required")))
			return
		}
		if strings.TrimSpace(request.TargetSnapshotID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("targetSnapshotId is required")))
			return
		}
		if strings.TrimSpace(request.IdempotencyKey) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("idempotencyKey is required")))
			return
		}
		ctx, cancel := context.WithTimeout(contextWithAuth(request.AuthContext), defaultRequestTimeout)
		defer cancel()
		project := request.ProjectID
		if project == "" {
			project = projectID(request.AuthContext)
		}
		result, err := service.runner.StartEvaluationRun(ctx, orchestrator.StartEvaluationRunRequest{
			RequestID:        request.RequestID,
			ProjectID:        project,
			DatasetVersionID: request.DatasetVersionID,
			TargetSnapshotID: request.TargetSnapshotID,
			IdempotencyKey:   request.IdempotencyKey,
			TraceContext:     traceContext(request.TraceContext),
		})
		if err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, bridgeErrorFromError(err)))
			return
		}
		respond(msg, contracts.EvalMutationResponse{RequestID: request.RequestID, OK: true, Data: evaluationRunData(result.Run)})
	}
}

func (service *RunnerService) handleEvaluationRunCancel() Handler {
	return func(msg BridgeMessage) {
		var request contracts.EvaluationRunControlRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, mutationErrorResponse("", validationBridgeError("invalid evaluation cancel request JSON")))
			return
		}
		if err := validateEnvelope(request.BridgeEnvelope); err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError(err.Error())))
			return
		}
		if strings.TrimSpace(request.EvaluationRunID) == "" {
			respond(msg, mutationErrorResponse(request.RequestID, validationBridgeError("evaluationRunId is required")))
			return
		}
		ctx, cancel := context.WithTimeout(contextWithAuth(request.AuthContext), defaultRequestTimeout)
		defer cancel()
		result, err := service.runner.CancelEvaluationRun(ctx, orchestrator.EvaluationRunControlRequest{
			RequestID:       request.RequestID,
			ProjectID:       request.ProjectID,
			EvaluationRunID: request.EvaluationRunID,
			IdempotencyKey:  request.IdempotencyKey,
			Command:         "cancel",
		})
		if err != nil {
			respond(msg, mutationErrorResponse(request.RequestID, bridgeErrorFromError(err)))
			return
		}
		respond(msg, contracts.EvalMutationResponse{RequestID: request.RequestID, OK: true, Data: evaluationRunData(result.Run)})
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
		if strings.TrimSpace(string(request.OptimizerKind)) == "" {
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
			OptimizerKind:       string(request.OptimizerKind),
			BasePromptVersionID: request.BasePromptVersionID,
			Config:              objectFromTypedContract(request.Config),
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
		id := strings.SplitN(message, ":", 2)[0]
		return contracts.BridgeError{ID: id, Code: "AI_EVAL_RUNNER_REJECTED", Message: message, Retryable: false}
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
		"runPolicy":    run.RunPolicy,
		"status":       run.Status,
		"startedAt":    run.StartedAt,
		"endedAt":      run.EndedAt,
		"summary":      run.Summary,
	}
}

func evaluationRunData(run ports.EvaluationRun) map[string]any {
	data := map[string]any{
		"id":                      run.ID,
		"projectId":               run.ProjectID,
		"kind":                    run.Kind,
		"status":                  run.Status,
		"datasetId":               run.DatasetID,
		"datasetVersionId":        run.DatasetVersionID,
		"datasetDigest":           run.DatasetDigest,
		"selectedItemRevisionIds": run.SelectedItemRevisionIDs,
		"splitSelector":           run.SplitSelector,
		"targetSnapshotId":        run.TargetSnapshotID,
		"metricSettingsSnapshot":  run.MetricSettingsSnapshot,
		"runPolicySnapshot":       run.RunPolicySnapshot,
		"retentionProfile":        run.RetentionProfile,
		"retentionRole":           run.RetentionRole,
		"startedAt":               run.StartedAt,
		"summary":                 run.Summary,
	}
	if run.EvaluationDefinitionID != "" {
		data["evaluationDefinitionId"] = run.EvaluationDefinitionID
	}
	if run.EndedAt != "" {
		data["endedAt"] = run.EndedAt
	}
	if len(run.Problem) > 0 {
		data["problem"] = run.Problem
	}
	return data
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

type observedRunnerMessage struct {
	BridgeMessage
	response []byte
}

func (message *observedRunnerMessage) Respond(response []byte) error {
	message.response = append([]byte(nil), response...)
	return message.BridgeMessage.Respond(response)
}

func withRunnerSelfObservability(subject string, recorder selfobs.TraceLogRecorder, handler Handler) Handler {
	return func(msg BridgeMessage) {
		start := time.Now().UTC()
		observed := &observedRunnerMessage{BridgeMessage: msg}
		handler(observed)
		requestID, ok, bridgeError := runnerResponseObservabilityFields(observed.response)
		if requestID == "" {
			requestID = requestIDFromPayload(msg.Data())
		}
		result := "success"
		if !ok {
			result = "error"
		}
		traceContext := selfobs.NewRootTraceContext()
		if headers, ok := msg.(interface{ Header(string) string }); ok {
			if parent, ok := selfobs.TraceContextFromHeaders(headers); ok {
				traceContext = selfobs.NewChildTraceContext(parent)
			}
		}
		operation := boundedRunnerOperation(subject)
		recorder.RecordSpan(selfobs.SpanEvent{
			Name:         "ai-eval-runner nats handler",
			TraceID:      traceContext.TraceID,
			SpanID:       traceContext.SpanID,
			ParentSpanID: traceContext.ParentSpanID,
			TraceState:   traceContext.TraceState,
			StartTime:    start,
			EndTime:      time.Now().UTC(),
			Result:       result,
			Attributes: map[string]string{
				"messaging.system":           "nats",
				"messaging.destination.name": boundedRunnerSubject(subject),
				"cloudgrid.request_id":       requestID,
				"cloudgrid.operation":        operation,
			},
		})
		if bridgeError != nil {
			recorder.RecordLog(selfobs.LogEvent{
				Timestamp:    time.Now().UTC(),
				SeverityText: "WARN",
				TraceID:      traceContext.TraceID,
				SpanID:       traceContext.SpanID,
				Message:      "AI evaluation runner handler failed",
				Attributes: map[string]string{
					"event":                "ai_eval_runner_failed",
					"cloudgrid.request_id": requestID,
					"error_id":             boundedRunnerErrorID(bridgeError.ID),
					"error_code":           boundedRunnerErrorCode(bridgeError.Code),
					"operation":            operation,
				},
			})
		}
	}
}

func runnerResponseObservabilityFields(payload []byte) (string, bool, *contracts.BridgeError) {
	var response struct {
		RequestID string                 `json:"requestId"`
		OK        bool                   `json:"ok"`
		Error     *contracts.BridgeError `json:"error,omitempty"`
	}
	if len(payload) == 0 || json.Unmarshal(payload, &response) != nil {
		return "", true, nil
	}
	return response.RequestID, response.OK, response.Error
}

func requestIDFromPayload(payload []byte) string {
	var value struct {
		RequestID string `json:"requestId"`
	}
	_ = json.Unmarshal(payload, &value)
	return value.RequestID
}

func objectFromTypedContract(value any) map[string]any {
	if value == nil {
		return nil
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil
	}
	for key, nested := range decoded {
		if nested == nil {
			delete(decoded, key)
		}
	}
	return decoded
}

func boundedRunnerSubject(subject string) string {
	switch subject {
	case SubjectExperimentStart, SubjectExperimentPause, SubjectExperimentResume, SubjectExperimentCancel, SubjectOptimizationStart, SubjectPersistedProjections:
		return subject
	default:
		return "unknown"
	}
}

func boundedRunnerOperation(subject string) string {
	switch subject {
	case SubjectExperimentStart:
		return "evaluation_run_start"
	case SubjectExperimentCancel:
		return "evaluation_run_cancel"
	case SubjectExperimentPause:
		return "evaluation_run_pause"
	case SubjectExperimentResume:
		return "evaluation_run_resume"
	case SubjectOptimizationStart:
		return "optimization_start"
	case SubjectPersistedProjections:
		return "persisted_projections"
	default:
		return "unknown"
	}
}

func boundedRunnerErrorID(id string) string {
	switch id {
	case "ERR-001", "ERR-006", "ERR-013", "ERR-AIE", "ERR-AIE-001", "ERR-AIE-002", "ERR-AIE-003", "ERR-AIE-004":
		return id
	default:
		return "ERR-006"
	}
}

func boundedRunnerErrorCode(code string) string {
	switch code {
	case "VALIDATION_FAILED", "STORAGE_UNAVAILABLE", "MESSAGE_BRIDGE_UNAVAILABLE", "AI_EVAL_RUNNER_REJECTED":
		return code
	default:
		return "STORAGE_UNAVAILABLE"
	}
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
