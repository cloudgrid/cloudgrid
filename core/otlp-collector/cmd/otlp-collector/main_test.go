package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/cloudgrid-dev/cloudgrid/core/otlp-collector/internal/collector"
)

func TestEnvOrDefaultUsesFallbackForMissingAndEmptyValues(t *testing.T) {
	t.Setenv("CLOUDGRID_TEST_VALUE", "")
	if got := envOrDefault("CLOUDGRID_TEST_VALUE", "fallback"); got != "fallback" {
		t.Fatalf("envOrDefault(empty) = %q, want fallback", got)
	}
	if got := envOrDefault("CLOUDGRID_TEST_MISSING", "fallback"); got != "fallback" {
		t.Fatalf("envOrDefault(missing) = %q, want fallback", got)
	}

	t.Setenv("CLOUDGRID_TEST_VALUE", "configured")
	if got := envOrDefault("CLOUDGRID_TEST_VALUE", "fallback"); got != "configured" {
		t.Fatalf("envOrDefault(configured) = %q, want configured", got)
	}
}

func TestOTLPHTTPAddrPrefersStandardAddrConfig(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_OTLP_HTTP_ADDR": "127.0.0.1:14318",
		"CLOUDGRID_OTLP_HOST":      "0.0.0.0",
		"CLOUDGRID_OTLP_PORT":      "4318",
	}

	if got := otlpHTTPAddr(func(name string) string { return env[name] }); got != "127.0.0.1:14318" {
		t.Fatalf("otlpHTTPAddr() = %q, want configured HTTP addr", got)
	}
}

func TestOTLPHTTPAddrKeepsLegacyHostPortFallback(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_OTLP_HOST": "127.0.0.1",
		"CLOUDGRID_OTLP_PORT": "14318",
	}

	if got := otlpHTTPAddr(func(name string) string { return env[name] }); got != "127.0.0.1:14318" {
		t.Fatalf("otlpHTTPAddr() = %q, want legacy host/port addr", got)
	}
}

func TestBuildGRPCOptionsFromEnvDefaultsToHTTPBodyLimit(t *testing.T) {
	options, err := buildGRPCOptionsFromEnv(func(string) string { return "" }, 4*1024*1024)
	if err != nil {
		t.Fatalf("buildGRPCOptionsFromEnv() error = %v", err)
	}
	if options.MaxMessageBytes != 4*1024*1024 || options.Compression != "gzip" {
		t.Fatalf("options = %#v, want HTTP limit and gzip", options)
	}
}

func TestBuildGRPCOptionsFromEnvRejectsInvalidCompression(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_OTLP_GRPC_COMPRESSION": "br",
	}

	_, err := buildGRPCOptionsFromEnv(func(name string) string { return env[name] }, 4*1024*1024)
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_OTLP_GRPC_COMPRESSION") {
		t.Fatalf("error = %v, want compression validation error", err)
	}
}

func TestRunReturnsFailureWhenNATSURLIsInvalid(t *testing.T) {
	t.Setenv("CLOUDGRID_NATS_URL", "://not-a-url")

	if got := run(); got != 1 {
		t.Fatalf("run() = %d, want startup failure exit code 1", got)
	}
}

func TestLogStartupErrorEmitsSanitizedCloudGridFields(t *testing.T) {
	var out bytes.Buffer
	logger := collector.NewLogger(&out)

	logStartupError(logger, "message_bridge_unavailable", "ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "cannot connect to NATS", "addr", "127.0.0.1:4318")

	var entry map[string]any
	if err := json.Unmarshal(out.Bytes(), &entry); err != nil {
		t.Fatalf("log entry is not JSON: %v\n%s", err, out.String())
	}
	for _, key := range []string{"service", "event", "request_id", "error_id", "error_code", "detail", "addr"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("log entry missing %q: %#v", key, entry)
		}
	}
	if entry["service"] != "otlp-collector" {
		t.Fatalf("service = %#v, want otlp-collector", entry["service"])
	}
	if entry["message"] == nil || !strings.Contains(entry["message"].(string), "collector startup failed") {
		t.Fatalf("message = %#v, want startup failure text", entry["message"])
	}
}

func TestBuildHandlerOptionsDefaultsToLocalWithoutExternalProvider(t *testing.T) {
	options, err := buildHandlerOptionsFromEnv(context.Background(), func(string) string { return "" }, http.DefaultClient)
	if err != nil {
		t.Fatalf("buildHandlerOptionsFromEnv() error = %v", err)
	}
	if options.DeploymentMode != collector.DeploymentModeLocal || options.AuthMode != collector.AuthModeLocal {
		t.Fatalf("options = %#v, want local/local", options)
	}
	if options.TokenValidator != nil || options.ProjectCache != nil {
		t.Fatalf("options = %#v, want no deployed auth dependencies", options)
	}
}

func TestBuildHandlerOptionsReadsLocalProjectRoutingConfig(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_OTLP_LOCAL_PROJECT_ID":     "default-project",
		"CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS": `{"abcdefghijklmnopqrstuvwxyz123456":"project-a"}`,
	}

	options, err := buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return env[name] }, http.DefaultClient)
	if err != nil {
		t.Fatalf("buildHandlerOptionsFromEnv() error = %v", err)
	}

	if options.LocalProjectID != "default-project" {
		t.Fatalf("LocalProjectID = %q, want default-project", options.LocalProjectID)
	}
	if options.LocalProjectTokens["abcdefghijklmnopqrstuvwxyz123456"] != "project-a" {
		t.Fatalf("LocalProjectTokens = %#v, want configured token map", options.LocalProjectTokens)
	}
}

func TestBuildHandlerOptionsRejectsInvalidLocalProjectTokenConfig(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS": `{"short":"project-a"}`,
	}

	_, err := buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return env[name] }, http.DefaultClient)
	if err == nil || !strings.Contains(err.Error(), "keys must be at least 32 characters") {
		t.Fatalf("error = %v, want token length error", err)
	}
}

func TestBuildHandlerOptionsFetchesConfiguredJWKSForDeployedSSO(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{
			"keys": []map[string]any{{
				"kty": "RSA",
				"kid": "fixture",
				"n":   base64URL(key.N.Bytes()),
				"e":   base64URL(big.NewInt(int64(key.E)).Bytes()),
			}},
		})
	}))
	defer server.Close()
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE": "deployed",
		"CLOUDGRID_AUTH_MODE":       "sso",
		"CLOUDGRID_AUTH_ISSUER":     "https://issuer.example",
		"CLOUDGRID_AUTH_AUDIENCE":   "cloudgrid-ingest",
		"CLOUDGRID_AUTH_JWKS_URL":   server.URL,
	}

	options, err := buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return env[name] }, server.Client())
	if err != nil {
		t.Fatalf("buildHandlerOptionsFromEnv() error = %v", err)
	}
	if options.DeploymentMode != collector.DeploymentModeDeployed || options.AuthMode != collector.AuthModeSSO {
		t.Fatalf("options = %#v, want deployed/sso", options)
	}
	if options.TokenValidator == nil || options.ProjectCache == nil {
		t.Fatalf("options = %#v, want token validator and project cache", options)
	}
	if calls != 1 {
		t.Fatalf("jwks fetch calls = %d, want one startup fetch", calls)
	}
}

func TestBuildHandlerOptionsRejectsMismatchedDeploymentAndAuthMode(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE": "deployed",
		"CLOUDGRID_AUTH_MODE":       "local",
	}
	_, err := buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return env[name] }, http.DefaultClient)
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_DEPLOYMENT_MODE=deployed requires CLOUDGRID_AUTH_MODE=sso") {
		t.Fatalf("error = %v, want deployed/sso mismatch error", err)
	}
}

func base64URL(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}
