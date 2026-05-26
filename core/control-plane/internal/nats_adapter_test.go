package internal

import (
	"encoding/json"
	"testing"

	"github.com/nats-io/nats.go"
)

type captureControlBridgeMessage struct {
	data      []byte
	responses [][]byte
	err       error
}

func (message *captureControlBridgeMessage) Data() []byte {
	return message.data
}

func (message *captureControlBridgeMessage) Respond(response []byte) error {
	message.responses = append(message.responses, append([]byte(nil), response...))
	return message.err
}

func TestNATSBridgeMessageAdaptsHeadersDataAndRespondErrors(t *testing.T) {
	msg := &nats.Msg{
		Subject: "control.viewer.get",
		Data:    []byte(`{"requestId":"req-1"}`),
		Header:  nats.Header{},
	}
	msg.Header.Set("Nats-Msg-Id", "req-1")
	bridgeMessage := natsBridgeMessage{msg: msg}

	if got := string(bridgeMessage.Data()); got != `{"requestId":"req-1"}` {
		t.Fatalf("Data() = %q", got)
	}
	if got := bridgeMessage.Header("Nats-Msg-Id"); got != "req-1" {
		t.Fatalf("Header() = %q", got)
	}
	if err := bridgeMessage.Respond([]byte(`{}`)); err == nil {
		t.Fatal("Respond() error = nil without reply subject")
	}
}

func TestAdaptNATSHandlerPassesBridgeMessage(t *testing.T) {
	var captured BridgeMessage
	handler := adaptNATSHandler(func(message BridgeMessage) {
		captured = message
	})

	handler(&nats.Msg{Subject: "control.projects.list", Data: []byte("payload")})

	if captured == nil || string(captured.Data()) != "payload" {
		t.Fatalf("captured message = %#v", captured)
	}
}

func TestRecoverControlHandlerPanicRespondsCanonicalBridgeError(t *testing.T) {
	msg := &captureControlBridgeMessage{data: []byte(`{"requestId":"req-panic"}`)}
	handler := recoverControlHandlerPanic("control.projects.list", nil, func(BridgeMessage) {
		panic("handler failed")
	})

	handler(msg)

	if len(msg.responses) != 1 {
		t.Fatalf("responses = %d, want 1", len(msg.responses))
	}
	var response struct {
		RequestID string `json:"requestId"`
		OK        bool   `json:"ok"`
		Error     *struct {
			ID        string `json:"id"`
			Code      string `json:"code"`
			Retryable bool   `json:"retryable"`
		} `json:"error"`
	}
	if err := json.Unmarshal(msg.responses[0], &response); err != nil {
		t.Fatalf("panic response is not JSON: %v", err)
	}
	if response.RequestID != "req-panic" || response.OK || response.Error == nil ||
		response.Error.ID != "ERR-013" || response.Error.Code != "MESSAGE_BRIDGE_UNAVAILABLE" || !response.Error.Retryable {
		t.Fatalf("panic response = %#v", response)
	}
}

func TestConnectNATSRejectsMalformedURL(t *testing.T) {
	if _, err := ConnectNATS("://bad"); err == nil {
		t.Fatal("ConnectNATS() error = nil")
	}
}
