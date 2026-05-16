//go:build surrealdb

package surrealdb

import "testing"

func TestSDKEndpointURLConvertsHTTPRPCToWebSocket(t *testing.T) {
	got := SDKEndpointURL(" http://localhost:8000/rpc ")
	if got != "ws://localhost:8000/rpc" {
		t.Fatalf("SDKEndpointURL() = %q, want websocket RPC endpoint", got)
	}
}

func TestSDKEndpointURLConvertsHTTPSRPCToSecureWebSocket(t *testing.T) {
	got := SDKEndpointURL("https://localhost:8000/rpc")
	if got != "wss://localhost:8000/rpc" {
		t.Fatalf("SDKEndpointURL() = %q, want secure websocket RPC endpoint", got)
	}
}

func TestSDKEndpointURLPreservesWebSocketURLs(t *testing.T) {
	got := SDKEndpointURL(" ws://localhost:8000/rpc ")
	if got != "ws://localhost:8000/rpc" {
		t.Fatalf("SDKEndpointURL() = %q, want trimmed websocket endpoint", got)
	}
}

func TestConfigHasCredentialsRequiresBothUsernameAndPassword(t *testing.T) {
	tests := []struct {
		name string
		cfg  Config
		want bool
	}{
		{name: "none", cfg: Config{}, want: false},
		{name: "username only", cfg: Config{Username: "root"}, want: false},
		{name: "password only", cfg: Config{Password: "secret"}, want: false},
		{name: "both", cfg: Config{Username: "root", Password: "secret"}, want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := test.cfg.HasCredentials(); got != test.want {
				t.Fatalf("HasCredentials() = %v, want %v", got, test.want)
			}
		})
	}
}
