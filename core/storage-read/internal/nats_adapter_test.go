package internal

import (
	"testing"

	"github.com/nats-io/nats.go"
)

func TestNATSBridgeMessageAdaptsSubjectHeadersDataAndRespondErrors(t *testing.T) {
	msg := &nats.Msg{
		Subject: "telemetry.traces.search",
		Data:    []byte(`{"requestId":"req-1"}`),
		Header:  nats.Header{},
	}
	msg.Header.Set("Nats-Msg-Id", "req-1")
	bridgeMessage := natsBridgeMessage{msg: msg}

	if got := bridgeMessage.Subject(); got != "telemetry.traces.search" {
		t.Fatalf("Subject() = %q", got)
	}
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

	handler(&nats.Msg{Subject: "telemetry.logs.search", Data: []byte("payload")})

	if captured == nil || captured.Subject() != "telemetry.logs.search" || string(captured.Data()) != "payload" {
		t.Fatalf("captured message = %#v", captured)
	}
}

func TestConnectNATSRejectsMalformedURL(t *testing.T) {
	if _, err := ConnectNATS("://bad"); err == nil {
		t.Fatal("ConnectNATS() error = nil")
	}
}
