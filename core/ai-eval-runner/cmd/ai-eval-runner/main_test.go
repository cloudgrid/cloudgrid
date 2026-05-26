package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLoadConfigDisablesRunnerByDefault(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "system-token",
	}
	cfg, err := loadConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("loadConfig() error = %v", err)
	}
	if cfg.Enabled {
		t.Fatalf("Enabled = true, want false")
	}
	if cfg.NATSURL != defaultNATSURL || cfg.HealthHost != defaultHealthHost || cfg.HealthPort != defaultHealthPort {
		t.Fatalf("defaults = %#v", cfg)
	}
}

func TestLoadConfigRequiresHarnessURLWhenEnabled(t *testing.T) {
	_, err := loadConfig(func(name string) string {
		if name == "CLOUDGRID_AI_EVAL_ENABLED" {
			return "true"
		}
		if name == "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN" {
			return "system-token"
		}
		return ""
	})
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_AI_EVAL_HARNESS_URL") {
		t.Fatalf("error = %v, want harness URL validation", err)
	}
}

func TestLoadConfigReadsEnabledRunnerConfig(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_AI_EVAL_ENABLED":                      "true",
		"CLOUDGRID_NATS_URL":                             "nats://example:4222",
		"CLOUDGRID_AI_EVAL_HARNESS_URL":                  "http://harness.local",
		"CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST":           "127.0.0.1",
		"CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT":           "18085",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "system-token",
	}
	cfg, err := loadConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("loadConfig() error = %v", err)
	}
	if !cfg.Enabled || cfg.NATSURL != env["CLOUDGRID_NATS_URL"] || cfg.HarnessURL != env["CLOUDGRID_AI_EVAL_HARNESS_URL"] || cfg.HealthHost != "127.0.0.1" || cfg.HealthPort != "18085" {
		t.Fatalf("config = %#v", cfg)
	}
}

func TestLoadConfigAppliesLocalSelfObservabilityDefaultsWhenEnabled(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_AI_EVAL_ENABLED":                      "true",
		"CLOUDGRID_AI_EVAL_HARNESS_URL":                  "http://harness.local",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "system-token",
	}
	cfg, err := loadConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("loadConfig() error = %v", err)
	}
	self := cfg.SelfObservability
	if !self.Enabled || !self.TracesEnabled || !self.LogsEnabled {
		t.Fatalf("self-observability toggles = %#v, want enabled traces/logs", self)
	}
	if self.CompanyID != "local" || self.ProjectID != "cloudgrid-system" || self.OTLPEndpoint != "http://localhost:4318" || self.ExportIntervalSeconds != 10 {
		t.Fatalf("self-observability defaults = %#v", self)
	}
	if self.OTLPBearerToken != "system-token" {
		t.Fatalf("OTLPBearerToken = %q, want configured token", self.OTLPBearerToken)
	}
	if self.ExportFailureLogLevel != "warn" {
		t.Fatalf("ExportFailureLogLevel = %q, want warn", self.ExportFailureLogLevel)
	}
}

func TestLoadConfigAppliesSelfObservabilityFailureLogLevelOverride(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN":        "system-token",
		"CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL": "off",
	}
	cfg, err := loadConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("loadConfig() error = %v", err)
	}
	if cfg.SelfObservability.ExportFailureLogLevel != "off" {
		t.Fatalf("ExportFailureLogLevel = %q, want off", cfg.SelfObservability.ExportFailureLogLevel)
	}
}

func TestLoadConfigRejectsLocalEnabledSelfObservabilityWithoutBearerToken(t *testing.T) {
	_, err := loadConfig(func(string) string { return "" })
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN") {
		t.Fatalf("loadConfig() error = %v, want bearer token validation", err)
	}
}

func TestLoadConfigRejectsInvalidSelfObservabilityFailureLogLevel(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL": "verbose",
	}
	_, err := loadConfig(func(name string) string { return env[name] })
	if err == nil {
		t.Fatal("loadConfig() error = nil")
	}
	if !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL") {
		t.Fatalf("error = %v, want failure log level validation", err)
	}
}

func TestAIEvalSelfObservabilityExporterPostsLogs(t *testing.T) {
	var logPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/logs" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer system-token" {
			t.Fatalf("Authorization = %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&logPayload); err != nil {
			t.Fatalf("decode log payload: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	cfg := config{
		Enabled: true,
		SelfObservability: selfObservabilityConfig{
			Enabled:               true,
			CompanyID:             "local",
			ProjectID:             "cloudgrid-system",
			OTLPEndpoint:          server.URL,
			OTLPBearerToken:       "system-token",
			ExportIntervalSeconds: 300,
			LogsEnabled:           true,
		},
	}
	exporter, err := aiEvalSelfObservabilityTraceLogExporter(cfg, newLogger(&bytes.Buffer{}))
	if err != nil {
		t.Fatalf("aiEvalSelfObservabilityTraceLogExporter() error = %v", err)
	}
	exporter.RecordLog(selfObservabilityLogEvent("startup_ready", "AI evaluation runner ready", "INFO", map[string]string{"operation": "startup"}))
	if err := exporter.Shutdown(context.Background()); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}
	if !payloadHasLogResource(logPayload, "service.name", "cloudgrid.ai_eval_runner") ||
		!payloadHasLogBody(logPayload, "AI evaluation runner ready") {
		t.Fatalf("log payload = %#v", logPayload)
	}
}

func TestNewLoggerEmitsKubernetesShape(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)
	logger.Info("runner ready",
		"service", "ai-eval-runner",
		"event", "startup_ready",
		"request_id", "",
	)
	var entry map[string]any
	if err := json.Unmarshal(out.Bytes(), &entry); err != nil {
		t.Fatalf("log entry is not JSON: %v\n%s", err, out.String())
	}
	for _, key := range []string{"timestamp", "level", "service", "event", "request_id", "message"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("log entry missing %q: %#v", key, entry)
		}
	}
	if entry["level"] != "info" || entry["service"] != "ai-eval-runner" {
		t.Fatalf("entry = %#v", entry)
	}
}

func payloadHasLogResource(payload map[string]any, key string, value string) bool {
	for _, resourceLog := range payloadItems(payload["resourceLogs"]) {
		resource, _ := resourceLog["resource"].(map[string]any)
		if payloadHasAttribute(resource["attributes"], key, value) {
			return true
		}
	}
	return false
}

func payloadHasLogBody(payload map[string]any, body string) bool {
	for _, resourceLog := range payloadItems(payload["resourceLogs"]) {
		for _, scopeLog := range payloadItems(resourceLog["scopeLogs"]) {
			for _, record := range payloadItems(scopeLog["logRecords"]) {
				bodyValue, _ := record["body"].(map[string]any)
				if bodyValue["stringValue"] == body {
					return true
				}
			}
		}
	}
	return false
}

func payloadHasAttribute(attrs any, key string, value string) bool {
	for _, attr := range payloadItems(attrs) {
		if attr["key"] != key {
			continue
		}
		valueMap, _ := attr["value"].(map[string]any)
		if valueMap["stringValue"] == value {
			return true
		}
	}
	return false
}

func payloadItems(value any) []map[string]any {
	items, _ := value.([]any)
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		mapped, _ := item.(map[string]any)
		if mapped != nil {
			result = append(result, mapped)
		}
	}
	return result
}
