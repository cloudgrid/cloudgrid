package internal

import (
	"testing"

	"github.com/nats-io/nats.go"
)

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

func TestConnectNATSRejectsMalformedURL(t *testing.T) {
	if _, err := ConnectNATS("://bad"); err == nil {
		t.Fatal("ConnectNATS() error = nil")
	}
}
