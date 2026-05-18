package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/config"
)

func TestNewLoggerEmitsKubernetesShape(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logger.Info("service ready",
		"service", "storage-write",
		"event", "startup_ready",
		"request_id", "",
	)

	entry := decodeLogEntry(t, out.Bytes())
	for _, key := range []string{"timestamp", "level", "service", "event", "request_id", "message"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("log entry missing required key %q: %#v", key, entry)
		}
	}
	if entry["level"] != "info" {
		t.Fatalf("level = %#v, want lowercase info", entry["level"])
	}
	if entry["message"] != "service ready" {
		t.Fatalf("message = %#v", entry["message"])
	}
	if _, ok := entry["time"]; ok {
		t.Fatalf("log entry used slog time key: %#v", entry)
	}
	if _, ok := entry["msg"]; ok {
		t.Fatalf("log entry used slog msg key: %#v", entry)
	}
}

func TestRunReturnsFailureWhenRequiredConfigIsMissing(t *testing.T) {
	t.Setenv("CLOUDGRID_STORAGE_ADAPTER", "surrealdb")
	t.Setenv("CLOUDGRID_SURREALDB_URL", "")
	t.Setenv("CLOUDGRID_SURREALDB_USERNAME", "")
	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "")

	if got := run(); got != 1 {
		t.Fatalf("run() = %d, want startup failure exit code 1", got)
	}
}

func TestRunReturnsFailureWhenConfiguredAdapterIsNotCompiledIn(t *testing.T) {
	t.Setenv("CLOUDGRID_STORAGE_ADAPTER", "postgres")
	t.Setenv("CLOUDGRID_SURREALDB_URL", "")
	t.Setenv("CLOUDGRID_SURREALDB_USERNAME", "")
	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "")

	if got := run(); got != 1 {
		t.Fatalf("run() = %d, want startup failure exit code 1", got)
	}
}

func TestNewTelemetryWriteAdapterRejectsUncompiledAdapterName(t *testing.T) {
	_, err := newTelemetryWriteAdapter(context.Background(), config.Config{StorageAdapter: "postgres"})
	if err == nil {
		t.Fatal("newTelemetryWriteAdapter() error = nil")
	}
	if !strings.Contains(err.Error(), "storage-write binary was built with adapter") {
		t.Fatalf("newTelemetryWriteAdapter() error = %v", err)
	}
}

func TestStorageWriteSelfObservabilityExporterHelpersRespectSignalConfiguration(t *testing.T) {
	logger := newLogger(&bytes.Buffer{})
	base := config.Config{
		DeploymentMode: "local",
		SelfObservability: config.SelfObservabilityConfig{
			Enabled:               true,
			ProjectID:             "cloudgrid-system",
			CompanyID:             "local",
			OTLPEndpoint:          "http://localhost:4318",
			ExportIntervalSeconds: 300,
		},
	}

	metrics, err := storageWriteSelfObservabilityMetricsExporter(base, logger)
	if err != nil {
		t.Fatalf("metrics helper error = %v", err)
	}
	if metrics != nil {
		t.Fatal("metrics helper returned exporter when metrics signal is disabled")
	}
	tracesLogs, err := storageWriteSelfObservabilityTraceLogExporter(base, logger)
	if err != nil {
		t.Fatalf("trace/log helper error = %v", err)
	}
	if tracesLogs != nil {
		t.Fatal("trace/log helper returned exporter when trace and log signals are disabled")
	}

	base.SelfObservability.MetricsEnabled = true
	metrics, err = storageWriteSelfObservabilityMetricsExporter(base, logger)
	if err != nil {
		t.Fatalf("metrics helper with enabled metrics error = %v", err)
	}
	if metrics == nil {
		t.Fatal("metrics helper returned nil when metrics signal is enabled")
	}
	_ = metrics.Shutdown(context.Background())

	base.SelfObservability.MetricsEnabled = false
	base.SelfObservability.LogsEnabled = true
	tracesLogs, err = storageWriteSelfObservabilityTraceLogExporter(base, logger)
	if err != nil {
		t.Fatalf("trace/log helper with enabled logs error = %v", err)
	}
	if tracesLogs == nil {
		t.Fatal("trace/log helper returned nil when logs are enabled")
	}
	_ = tracesLogs.Shutdown(context.Background())
}

func TestStorageWriteSelfObservabilityExporterHelpersRejectInvalidEndpointWhenEnabled(t *testing.T) {
	logger := newLogger(&bytes.Buffer{})
	cfg := config.Config{
		DeploymentMode: "local",
		SelfObservability: config.SelfObservabilityConfig{
			Enabled:               true,
			ProjectID:             "cloudgrid-system",
			CompanyID:             "local",
			OTLPEndpoint:          "://bad",
			ExportIntervalSeconds: 300,
			MetricsEnabled:        true,
			LogsEnabled:           true,
		},
	}

	if _, err := storageWriteSelfObservabilityMetricsExporter(cfg, logger); err == nil {
		t.Fatal("metrics helper error = nil for invalid endpoint")
	}
	if _, err := storageWriteSelfObservabilityTraceLogExporter(cfg, logger); err == nil {
		t.Fatal("trace/log helper error = nil for invalid endpoint")
	}
}

func TestLogErrorMapsErrorTaxonomyAndSanitizesProviderError(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logError(logger, "startup_storage_unavailable", errors.New("ERR-006 STORAGE_UNAVAILABLE: SurrealDB rejected password=secret"), "req-123", "ERR-006")

	entry := decodeLogEntry(t, out.Bytes())
	if entry["level"] != "error" {
		t.Fatalf("level = %#v, want error", entry["level"])
	}
	if entry["request_id"] != "req-123" {
		t.Fatalf("request_id = %#v, want req-123", entry["request_id"])
	}
	if entry["error_id"] != "ERR-006" {
		t.Fatalf("error_id = %#v, want ERR-006", entry["error_id"])
	}
	if entry["error_code"] != "STORAGE_UNAVAILABLE" {
		t.Fatalf("error_code = %#v, want STORAGE_UNAVAILABLE", entry["error_code"])
	}
	if entry["message"] != "storage is unavailable" {
		t.Fatalf("message = %#v", entry["message"])
	}
	encoded := string(out.Bytes())
	if strings.Contains(encoded, "password=secret") || strings.Contains(encoded, "SurrealDB rejected") {
		t.Fatalf("log leaked provider error: %s", encoded)
	}
}

func TestLogErrorIncludesRuntimeBindFailureDetail(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logError(logger, "health_server_bind_failed", errors.New("listen tcp :8082: bind: address already in use"), "", "ERR-010", "health_addr", "0.0.0.0:8082")

	entry := decodeLogEntry(t, out.Bytes())
	if entry["error_id"] != "ERR-010" {
		t.Fatalf("error_id = %#v, want ERR-010", entry["error_id"])
	}
	if entry["message"] != "listen tcp :8082: bind: address already in use" {
		t.Fatalf("message = %#v, want bind failure detail", entry["message"])
	}
	if entry["health_addr"] != "0.0.0.0:8082" {
		t.Fatalf("health_addr = %#v", entry["health_addr"])
	}
}

func TestLogErrorDerivesFallbackCodeWhenNotProvided(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logError(logger, "startup_config_invalid", errors.New("ERR-009 CONFIG_INVALID: missing"), "req-1", "")

	entry := decodeLogEntry(t, out.Bytes())
	if entry["request_id"] != "req-1" {
		t.Fatalf("request_id = %#v, want req-1", entry["request_id"])
	}
	if entry["error_id"] != "ERR-009" || entry["error_code"] != "CONFIG_INVALID" {
		t.Fatalf("derived error fields = %#v", entry)
	}
	if entry["message"] != "ERR-009 CONFIG_INVALID: missing" {
		t.Fatalf("message = %#v", entry["message"])
	}
}

func TestSafeErrorMessageAllowsOnlyOperatorActionableDetails(t *testing.T) {
	tests := []struct {
		name string
		err  error
		code string
		want string
	}{
		{name: "nil error", err: nil, code: "ERR-006", want: ""},
		{name: "config error", err: errors.New("ERR-009 CONFIG_INVALID: missing nats url"), code: "ERR-009", want: "ERR-009 CONFIG_INVALID: missing nats url"},
		{name: "validation error", err: errors.New("ERR-001 VALIDATION_FAILED: invalid command"), code: "ERR-001", want: "ERR-001 VALIDATION_FAILED: invalid command"},
		{name: "message bridge error", err: errors.New("nats: authorization violation token=secret"), code: "ERR-013", want: "message bridge is unavailable"},
		{name: "runtime composition error", err: errors.New("listen tcp :8082: bind: address already in use"), code: "ERR-010", want: "listen tcp :8082: bind: address already in use"},
		{name: "provider storage error", err: errors.New("surrealdb password=secret"), code: "ERR-006", want: "storage is unavailable"},
		{name: "unknown error code defaults to storage message", err: errors.New("provider leaked detail"), code: "ERR-999", want: "storage is unavailable"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := safeErrorMessage(test.err, test.code); got != test.want {
				t.Fatalf("safeErrorMessage() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestErrorIDFromErrorRecognizesStorageWriteTaxonomyPrefixes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{name: "nil error", err: nil, want: ""},
		{name: "config", err: errors.New("ERR-009 CONFIG_INVALID: missing"), want: "ERR-009"},
		{name: "validation", err: errors.New("ERR-001 VALIDATION_FAILED: bad"), want: "ERR-001"},
		{name: "fallback", err: errors.New("plain provider failure"), want: "ERR-006"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := errorIDFromError(test.err); got != test.want {
				t.Fatalf("errorIDFromError() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestErrorCodeForIDMapsKnownAndUnknownIDs(t *testing.T) {
	tests := map[string]string{
		"ERR-001": "VALIDATION_FAILED",
		"ERR-006": "STORAGE_UNAVAILABLE",
		"ERR-009": "CONFIG_INVALID",
		"ERR-010": "RUNTIME_COMPOSITION_FAILED",
		"ERR-013": "MESSAGE_BRIDGE_UNAVAILABLE",
		"ERR-999": "STORAGE_UNAVAILABLE",
	}

	for id, want := range tests {
		if got := errorCodeForID(id); got != want {
			t.Fatalf("errorCodeForID(%q) = %q, want %q", id, got, want)
		}
	}
}

func decodeLogEntry(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("log entry is not JSON: %v\n%s", err, string(data))
	}
	return entry
}
