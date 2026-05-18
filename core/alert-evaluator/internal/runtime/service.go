package runtime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/alert-evaluator/internal/evaluator"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	SubjectTick                 = "alert_evaluator.tick"
	SubjectRuleEvaluate         = "alert_evaluator.rules.evaluate"
	SubjectNotificationDispatch = "alert_evaluator.notifications.dispatch"
)

type BridgeMessage interface {
	Subject() string
	Data() []byte
	Respond(response []byte) error
}

type Handler func(BridgeMessage)

type Service struct {
	evaluator *evaluator.Evaluator
}

func NewService(evaluator *evaluator.Evaluator) *Service {
	return &Service{evaluator: evaluator}
}

func (service *Service) SubjectHandlers() map[string]Handler {
	return map[string]Handler{
		SubjectTick:                 service.handleTick(),
		SubjectRuleEvaluate:         service.handleRuleEvaluate(),
		SubjectNotificationDispatch: service.handleNotificationDispatch(),
	}
}

func (service *Service) handleTick() Handler {
	return func(msg BridgeMessage) {
		var request contracts.AlertEvaluatorTickRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, contracts.AlertEvaluatorTickResponse{RequestID: "", OK: false, Error: ptr(bridgeError(evaluator.CodedError{ID: "ERR-018", Code: "ALERT_RULE_INVALID", Message: "invalid alert evaluator tick request JSON"}))})
			return
		}
		result, err := service.evaluator.Tick(context.Background(), request.RequestedAt)
		if err != nil {
			respond(msg, contracts.AlertEvaluatorTickResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeError(err))})
			return
		}
		respond(msg, contracts.AlertEvaluatorTickResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{
			"evaluatedRules": result.EvaluatedRules,
			"firingRules":    result.FiringRules,
			"errorRules":     result.ErrorRules,
		}})
	}
}

func (service *Service) handleRuleEvaluate() Handler {
	return func(msg BridgeMessage) {
		var request contracts.AlertRuleEvaluateRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, contracts.AlertRuleEvaluateResponse{RequestID: "", OK: false, Error: ptr(bridgeError(evaluator.CodedError{ID: "ERR-018", Code: "ALERT_RULE_INVALID", Message: "invalid alert rule evaluate request JSON"}))})
			return
		}
		now := time.Now().UTC()
		if request.Now != nil {
			now = *request.Now
		}
		event, err := service.evaluator.EvaluateRuleRequest(context.Background(), request.ProjectID, request.RuleID, now)
		if err != nil {
			respond(msg, contracts.AlertRuleEvaluateResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeError(err))})
			return
		}
		respond(msg, contracts.AlertRuleEvaluateResponse{RequestID: request.RequestID, OK: true, Data: alertEventData(event)})
	}
}

func (service *Service) handleNotificationDispatch() Handler {
	return func(msg BridgeMessage) {
		var request contracts.AlertNotificationDispatchRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, contracts.AlertNotificationDispatchResponse{RequestID: "", OK: false, Error: ptr(bridgeError(evaluator.CodedError{ID: "ERR-018", Code: "ALERT_RULE_INVALID", Message: "invalid alert notification dispatch request JSON"}))})
			return
		}
		result, err := service.evaluator.DispatchNotification(context.Background(), request.Event)
		if err != nil {
			respond(msg, contracts.AlertNotificationDispatchResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeError(err))})
			return
		}
		respond(msg, contracts.AlertNotificationDispatchResponse{RequestID: request.RequestID, OK: true, Data: map[string]any{"status": string(result.Status)}})
	}
}

func alertEventData(event contracts.AlertEvent) map[string]any {
	data := map[string]any{
		"id":               event.ID,
		"projectId":        event.ProjectID,
		"ruleId":           event.RuleID,
		"instanceId":       event.InstanceID,
		"state":            string(event.State),
		"severity":         string(event.Severity),
		"summary":          event.Summary,
		"deduplicationKey": event.DeduplicationKey,
		"startedAt":        event.StartedAt.Format(time.RFC3339Nano),
		"createdAt":        event.CreatedAt.Format(time.RFC3339Nano),
	}
	if event.EndedAt != nil {
		data["endedAt"] = event.EndedAt.Format(time.RFC3339Nano)
	}
	if event.EvidenceTraceID != nil {
		data["evidenceTraceId"] = *event.EvidenceTraceID
	}
	if event.EvidenceSpanID != nil {
		data["evidenceSpanId"] = *event.EvidenceSpanID
	}
	if event.EvidenceLogID != nil {
		data["evidenceLogId"] = *event.EvidenceLogID
	}
	if event.EvidenceMetricName != nil {
		data["evidenceMetricName"] = *event.EvidenceMetricName
	}
	return data
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func respond(msg BridgeMessage, response any) {
	data, err := json.Marshal(response)
	if err != nil {
		return
	}
	_ = msg.Respond(data)
}

func bridgeError(err error) contracts.BridgeError {
	var coded evaluator.CodedError
	if errors.As(err, &coded) {
		return contracts.BridgeError{ID: coded.ID, Code: coded.Code, Message: coded.Message, Retryable: coded.Retryable}
	}
	return contracts.BridgeError{ID: "ERR-021", Code: "ALERT_EVALUATOR_TIMEOUT", Message: "Alert evaluation timed out", Retryable: true}
}

func ptr[T any](value T) *T {
	return &value
}
