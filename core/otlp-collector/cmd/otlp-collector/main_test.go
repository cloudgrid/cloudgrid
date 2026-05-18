package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/otlp-collector/internal/collector"
	"google.golang.org/grpc"
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

func TestCollectorSelfObservabilitySignalExporterPostsTracesAndLogs(t *testing.T) {
	requests := map[string]map[string]any{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer service-token" {
			t.Fatalf("authorization = %q, want bearer", r.Header.Get("Authorization"))
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		requests[r.URL.Path] = payload
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE":                      "local",
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":           "true",
		"CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED":    "true",
		"CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED":      "true",
		"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID":        "cloudgrid-system",
		"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID":        "local",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT":     server.URL,
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "service-token",
	}
	exporter, err := collectorSelfObservabilitySignalExporter(func(name string) string { return env[name] }, collector.NewDiscardLogger())
	if err != nil {
		t.Fatalf("collectorSelfObservabilitySignalExporter() error = %v", err)
	}
	exporter.RecordSpan(collector.SelfObservabilitySpan{Name: "otlp.http /v1/traces", StartTime: time.Unix(1, 0), EndTime: time.Unix(1, 1)})
	exporter.RecordLog(collector.SelfObservabilityLog{Body: "collector request failed", Timestamp: time.Unix(1, 2), Attributes: map[string]string{"event": "request_failed"}})

	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	if !payloadHasResourceAttribute(requests["/v1/traces"], "service.name", "cloudgrid.otlp_collector") ||
		!payloadHasResourceAttribute(requests["/v1/logs"], "service.name", "cloudgrid.otlp_collector") {
		t.Fatalf("payloads missing collector resource attrs: %#v", requests)
	}
}

func TestCollectorSelfObservabilityExportersRespectDisabledSignals(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE":                    "local",
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":         "true",
		"CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED":  "false",
		"CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED":    "false",
		"CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED": "false",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT":   "http://127.0.0.1:4318",
	}

	metricsExporter, err := collectorSelfObservabilityMetricsExporter(func(name string) string { return env[name] }, collector.NewDiscardLogger())
	if err != nil {
		t.Fatalf("collectorSelfObservabilityMetricsExporter() error = %v", err)
	}
	if metricsExporter != nil {
		t.Fatal("metrics exporter is non-nil with metrics disabled")
	}
	signalExporter, err := collectorSelfObservabilitySignalExporter(func(name string) string { return env[name] }, collector.NewDiscardLogger())
	if err != nil {
		t.Fatalf("collectorSelfObservabilitySignalExporter() error = %v", err)
	}
	if signalExporter != nil {
		t.Fatal("signal exporter is non-nil with traces and logs disabled")
	}
}

func TestCollectorSelfObservabilityExportersRejectInvalidEndpoint(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE":                    "local",
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":         "true",
		"CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED": "true",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT":   "localhost:4318",
	}

	if _, err := collectorSelfObservabilityMetricsExporter(func(name string) string { return env[name] }, collector.NewDiscardLogger()); err == nil || !strings.Contains(err.Error(), "ERR-009") {
		t.Fatalf("metrics exporter error = %v, want config validation", err)
	}
	if _, err := collectorSelfObservabilitySignalExporter(func(name string) string { return env[name] }, collector.NewDiscardLogger()); err == nil || !strings.Contains(err.Error(), "ERR-009") {
		t.Fatalf("signal exporter error = %v, want config validation", err)
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

func TestExpectedServerStopClassifiesGracefulAndUnexpectedStops(t *testing.T) {
	if !expectedServerStop(nil) || !expectedServerStop(http.ErrServerClosed) || !expectedServerStop(grpc.ErrServerStopped) {
		t.Fatal("expectedServerStop did not accept graceful HTTP/gRPC shutdown errors")
	}
	if expectedServerStop(errors.New("listener failed")) {
		t.Fatal("expectedServerStop accepted unexpected listener failure")
	}
}

func TestGracefulStopGRPCReturnsWhenServerStops(t *testing.T) {
	server := grpc.NewServer()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	done := make(chan struct{})

	go func() {
		gracefulStopGRPC(ctx, server)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("gracefulStopGRPC did not return for an idle server")
	}
}

func TestBuildGRPCOptionsRejectsOutOfRangeMessageLimit(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES": "1",
	}

	_, err := buildGRPCOptionsFromEnv(func(name string) string { return env[name] }, 4*1024*1024)
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES") {
		t.Fatalf("error = %v, want message size validation", err)
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
	if options.LocalProjectID != "default" {
		t.Fatalf("LocalProjectID = %q, want default anonymous local project", options.LocalProjectID)
	}
	if options.MaxRequestBytes != 4*1024*1024 || options.MaxSpans != 10_000 || options.MaxLogs != 10_000 || options.MaxMetricPoints != 20_000 || options.PublishTimeout != time.Second {
		t.Fatalf("limits = bytes:%d spans:%d logs:%d metrics:%d timeout:%s, want defaults", options.MaxRequestBytes, options.MaxSpans, options.MaxLogs, options.MaxMetricPoints, options.PublishTimeout)
	}
}

func TestBuildHandlerOptionsReadsCollectorScalingLimits(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_OTLP_MAX_REQUEST_BYTES":             "65536",
		"CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST":         "50",
		"CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST":          "60",
		"CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST": "70",
		"CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS":            "250",
	}

	options, err := buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return env[name] }, http.DefaultClient)
	if err != nil {
		t.Fatalf("buildHandlerOptionsFromEnv() error = %v", err)
	}

	if options.MaxRequestBytes != 65_536 || options.MaxSpans != 50 || options.MaxLogs != 60 || options.MaxMetricPoints != 70 || options.PublishTimeout != 250*time.Millisecond {
		t.Fatalf("options = %#v, want configured scaling limits", options)
	}
}

func TestBuildHandlerOptionsRejectsInvalidCollectorScalingLimits(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want string
	}{
		{name: "spans", env: map[string]string{"CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST": "0"}, want: "CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST"},
		{name: "logs", env: map[string]string{"CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST": "100001"}, want: "CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST"},
		{name: "metrics", env: map[string]string{"CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST": "200001"}, want: "CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST"},
		{name: "publish timeout", env: map[string]string{"CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS": "99"}, want: "CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return tt.env[name] }, http.DefaultClient)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want %s validation", err, tt.want)
			}
		})
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

func TestBuildHandlerOptionsReadsProjectStatusCacheBounds(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
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
		"CLOUDGRID_DEPLOYMENT_MODE":                    "deployed",
		"CLOUDGRID_AUTH_MODE":                          "sso",
		"CLOUDGRID_AUTH_ISSUER":                        "https://issuer.example",
		"CLOUDGRID_AUTH_AUDIENCE":                      "cloudgrid-ingest",
		"CLOUDGRID_AUTH_JWKS_URL":                      server.URL,
		"CLOUDGRID_PROJECT_STATUS_CACHE_TTL_SECONDS":   "30",
		"CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS": "90",
	}

	options, err := buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return env[name] }, server.Client())
	if err != nil {
		t.Fatalf("buildHandlerOptionsFromEnv() error = %v", err)
	}

	if options.ProjectCache.TTL() != 30*time.Second || options.ProjectCache.MaxStaleness() != 90*time.Second {
		t.Fatalf("cache ttl=%s stale=%s, want 30s/90s", options.ProjectCache.TTL(), options.ProjectCache.MaxStaleness())
	}
}

func TestBuildHandlerOptionsRejectsProjectStatusStalenessBelowTTL(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
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
		"CLOUDGRID_DEPLOYMENT_MODE":                    "deployed",
		"CLOUDGRID_AUTH_MODE":                          "sso",
		"CLOUDGRID_AUTH_ISSUER":                        "https://issuer.example",
		"CLOUDGRID_AUTH_AUDIENCE":                      "cloudgrid-ingest",
		"CLOUDGRID_AUTH_JWKS_URL":                      server.URL,
		"CLOUDGRID_PROJECT_STATUS_CACHE_TTL_SECONDS":   "60",
		"CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS": "30",
	}

	_, err = buildHandlerOptionsFromEnv(context.Background(), func(name string) string { return env[name] }, server.Client())
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS") {
		t.Fatalf("error = %v, want stale lower-bound validation", err)
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

func payloadHasResourceAttribute(payload map[string]any, key string, value string) bool {
	for _, topKey := range []string{"resourceSpans", "resourceLogs"} {
		resources, _ := payload[topKey].([]any)
		for _, item := range resources {
			resourceItem, _ := item.(map[string]any)
			resource, _ := resourceItem["resource"].(map[string]any)
			attributes, _ := resource["attributes"].([]any)
			for _, attributeItem := range attributes {
				attribute, _ := attributeItem.(map[string]any)
				valueMap, _ := attribute["value"].(map[string]any)
				if attribute["key"] == key && valueMap["stringValue"] == value {
					return true
				}
			}
		}
	}
	return false
}
