package internal

import (
	"encoding/json"
	"errors"
	"testing"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestTraceGetHandlerAcceptsPortableBridgeMessage(t *testing.T) {
	lastTraceDetailQuery = nil
	selectedSpanID := "span-portable"
	request := contracts.TraceDetailRequest{
		BridgeEnvelope: contracts.BridgeEnvelope{RequestID: "req-portable"},
		TraceID:        "trace-portable",
		Query:          &contracts.TraceDetailQuery{SelectedSpanID: &selectedSpanID},
	}
	data, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	message := &portableBridgeMessageTest{
		subject: SubjectTraceGet,
		data:    data,
	}

	handleTraceGet(&loggingReadStore{}, nil, defaultQueryTimeout)(message)

	if lastTraceDetailQuery == nil || lastTraceDetailQuery.SelectedSpanID == nil || *lastTraceDetailQuery.SelectedSpanID != selectedSpanID {
		t.Fatalf("forwarded query = %#v, want selected span from portable message", lastTraceDetailQuery)
	}
	var response contracts.TraceDetailResponse
	if err := json.Unmarshal(message.response, &response); err != nil {
		t.Fatalf("response is not trace detail JSON: %v", err)
	}
	if !response.OK || response.RequestID != "req-portable" {
		t.Fatalf("response = %#v, want ok req-portable", response)
	}
}

func TestBridgeErrorFromErrorMapsForbidden(t *testing.T) {
	bridgeErr := bridgeErrorFromError(errors.New("ERR-016 FORBIDDEN: tenant mismatch"))

	if bridgeErr.ID != "ERR-016" || bridgeErr.Code != "FORBIDDEN" || bridgeErr.Retryable {
		t.Fatalf("bridge error = %#v, want non-retryable ERR-016", bridgeErr)
	}
}

type portableBridgeMessageTest struct {
	subject  string
	data     []byte
	response []byte
	headers  map[string]string
}

func (message *portableBridgeMessageTest) Subject() string {
	return message.subject
}

func (message *portableBridgeMessageTest) Data() []byte {
	return message.data
}

func (message *portableBridgeMessageTest) Respond(response []byte) error {
	message.response = append(message.response[:0], response...)
	return nil
}

func (message *portableBridgeMessageTest) Header(name string) string {
	return message.headers[name]
}

func bridgeMessageForTest(subject string, data []byte) *portableBridgeMessageTest {
	return &portableBridgeMessageTest{subject: subject, data: data}
}
