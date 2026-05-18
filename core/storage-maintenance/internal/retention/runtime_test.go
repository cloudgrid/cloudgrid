package retention

import (
	"encoding/json"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestRuntimeServiceHandlesRetentionExecuteBatch(t *testing.T) {
	now := fixedNow()
	store := NewFixtureStore()
	store.PutPolicy(policy("project-a", contracts.RetentionDataClassLogs, contracts.RetentionModeDelete, 30, nil, 1))
	store.PutRecord(FixtureRecord{ID: "log-old", ProjectID: "project-a", DataClass: contracts.RetentionDataClassLogs, EventTime: now.AddDate(0, 0, -40)})
	service := NewRuntimeService(NewExecutor(store, nil, func() time.Time { return now }))
	request := request("project-a", contracts.RetentionDataClassLogs, now, nil, nil)
	payload, _ := json.Marshal(request)
	msg := &fakeBridgeMessage{data: payload}

	service.SubjectHandlers()[SubjectRetentionExecuteBatch](msg)

	var response contracts.RetentionExecuteBatchResponse
	if err := json.Unmarshal(msg.response, &response); err != nil {
		t.Fatalf("response JSON invalid: %v", err)
	}
	if !response.OK || response.RequestID != "req-retention" || response.Data == nil {
		t.Fatalf("response = %#v, want successful data response", response)
	}
	if response.Data.HardDeletedCount != 1 {
		t.Fatalf("hardDeletedCount = %d, want 1", response.Data.HardDeletedCount)
	}
}

func TestRuntimeServiceRejectsInvalidJSON(t *testing.T) {
	service := NewRuntimeService(NewExecutor(NewFixtureStore(), nil, fixedNow))
	msg := &fakeBridgeMessage{data: []byte(`{"requestId":"req","unknown":true}`)}

	service.SubjectHandlers()[SubjectRetentionExecuteBatch](msg)

	var response contracts.RetentionExecuteBatchResponse
	if err := json.Unmarshal(msg.response, &response); err != nil {
		t.Fatalf("response JSON invalid: %v", err)
	}
	if response.OK || response.Error == nil || response.Error.ID != "ERR-001" {
		t.Fatalf("response = %#v, want ERR-001", response)
	}
}

type fakeBridgeMessage struct {
	data     []byte
	response []byte
}

func (msg *fakeBridgeMessage) Data() []byte {
	return msg.data
}

func (msg *fakeBridgeMessage) Respond(response []byte) error {
	msg.response = response
	return nil
}
