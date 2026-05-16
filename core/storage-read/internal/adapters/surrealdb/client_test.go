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
