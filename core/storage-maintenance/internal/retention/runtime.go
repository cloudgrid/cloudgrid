package retention

import (
	"bytes"
	"context"
	"encoding/json"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const SubjectRetentionExecuteBatch = "storage_maintenance.retention.execute_batch"

type BridgeMessage interface {
	Data() []byte
	Respond(response []byte) error
}

type Handler func(BridgeMessage)

type RuntimeService struct {
	executor *Executor
}

func NewRuntimeService(executor *Executor) *RuntimeService {
	return &RuntimeService{executor: executor}
}

func (service *RuntimeService) SubjectHandlers() map[string]Handler {
	return map[string]Handler{
		SubjectRetentionExecuteBatch: service.handleExecuteBatch(),
	}
}

func (service *RuntimeService) handleExecuteBatch() Handler {
	return func(msg BridgeMessage) {
		var request contracts.RetentionExecuteBatchRequest
		if err := decodeStrict(msg.Data(), &request); err != nil {
			respond(msg, contracts.RetentionExecuteBatchResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(contracts.BridgeError{ID: "ERR-001", Code: "VALIDATION_FAILED", Message: "invalid retention execute batch request JSON", Retryable: false}),
			})
			return
		}
		data, err := service.executor.ExecuteBatch(context.Background(), request)
		if err != nil {
			respond(msg, contracts.RetentionExecuteBatchResponse{
				RequestID: request.RequestID,
				OK:        false,
				Error:     ptr(contracts.BridgeError{ID: "ERR-006", Code: "STORAGE_UNAVAILABLE", Message: "Storage is unavailable", Retryable: true}),
			})
			return
		}
		respond(msg, contracts.RetentionExecuteBatchResponse{
			RequestID: request.RequestID,
			OK:        data.Error == nil,
			Data:      &data,
			Error:     data.Error,
		})
	}
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

func ptr[T any](value T) *T {
	return &value
}
