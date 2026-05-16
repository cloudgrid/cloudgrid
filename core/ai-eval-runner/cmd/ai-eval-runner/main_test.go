package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestLoadConfigDisablesRunnerByDefault(t *testing.T) {
	cfg, err := loadConfig(func(string) string { return "" })
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
		return ""
	})
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_AI_EVAL_HARNESS_URL") {
		t.Fatalf("error = %v, want harness URL validation", err)
	}
}

func TestLoadConfigReadsEnabledRunnerConfig(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_AI_EVAL_ENABLED":            "true",
		"CLOUDGRID_NATS_URL":                   "nats://example:4222",
		"CLOUDGRID_AI_EVAL_HARNESS_URL":        "http://harness.local",
		"CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST": "127.0.0.1",
		"CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT": "18085",
	}
	cfg, err := loadConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("loadConfig() error = %v", err)
	}
	if !cfg.Enabled || cfg.NATSURL != env["CLOUDGRID_NATS_URL"] || cfg.HarnessURL != env["CLOUDGRID_AI_EVAL_HARNESS_URL"] || cfg.HealthHost != "127.0.0.1" || cfg.HealthPort != "18085" {
		t.Fatalf("config = %#v", cfg)
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
