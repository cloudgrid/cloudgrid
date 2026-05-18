package internal

import (
	"strings"
	"testing"
	"time"
)

func TestLoadConfigAppliesDefaultsAndOptionalCredentials(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SURREALDB_URL": "http://localhost:8000/rpc",
	}

	cfg, err := LoadConfig(MapEnv(env))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	if cfg.NATSURL != "nats://localhost:4222" {
		t.Fatalf("NATSURL = %q, want default", cfg.NATSURL)
	}
	if cfg.StorageAdapter != AdapterSurrealDB {
		t.Fatalf("StorageAdapter = %q, want %q", cfg.StorageAdapter, AdapterSurrealDB)
	}
	if cfg.SurrealDB.URL != "http://localhost:8000/rpc" {
		t.Fatalf("SurrealDB.URL = %q", cfg.SurrealDB.URL)
	}
	if cfg.SurrealDB.Namespace != "observability" {
		t.Fatalf("SurrealDB.Namespace = %q, want default", cfg.SurrealDB.Namespace)
	}
	if cfg.SurrealDB.Database != "dev" {
		t.Fatalf("SurrealDB.Database = %q, want default", cfg.SurrealDB.Database)
	}
	if cfg.SurrealDB.Username != "" || cfg.SurrealDB.Password != "" {
		t.Fatalf("credentials should be optional and empty by default")
	}
	if cfg.Limits.QueryTimeout != 1500*time.Millisecond ||
		cfg.Limits.MaxPageSize != 200 ||
		cfg.Limits.MaxMetricPoints != 5000 ||
		cfg.Limits.LiveMaxSubscriptions != 2000 ||
		cfg.Limits.LiveEventBufferSize != 100 {
		t.Fatalf("Limits = %#v, want production-scale defaults", cfg.Limits)
	}
}

func TestLoadConfigReadsStorageReadScalingLimits(t *testing.T) {
	cfg, err := LoadConfig(MapEnv(map[string]string{
		"CLOUDGRID_SURREALDB_URL":                  "http://localhost:8000/rpc",
		"CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS":  "2500",
		"CLOUDGRID_STORAGE_READ_MAX_PAGE_SIZE":     "500",
		"CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS": "10000",
		"CLOUDGRID_LIVE_MAX_SUBSCRIPTIONS":         "3000",
		"CLOUDGRID_LIVE_EVENT_BUFFER_SIZE":         "250",
	}))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.Limits.QueryTimeout != 2500*time.Millisecond ||
		cfg.Limits.MaxPageSize != 500 ||
		cfg.Limits.MaxMetricPoints != 10000 ||
		cfg.Limits.LiveMaxSubscriptions != 3000 ||
		cfg.Limits.LiveEventBufferSize != 250 {
		t.Fatalf("Limits = %#v, want configured values", cfg.Limits)
	}
}

func TestLoadConfigRejectsInvalidStorageReadScalingLimits(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
	}{
		{name: "query timeout", key: "CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS", value: "99"},
		{name: "page size", key: "CLOUDGRID_STORAGE_READ_MAX_PAGE_SIZE", value: "1001"},
		{name: "metric points", key: "CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS", value: "99"},
		{name: "live subscriptions", key: "CLOUDGRID_LIVE_MAX_SUBSCRIPTIONS", value: "0"},
		{name: "live buffer", key: "CLOUDGRID_LIVE_EVENT_BUFFER_SIZE", value: "0"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := LoadConfig(MapEnv(map[string]string{
				"CLOUDGRID_SURREALDB_URL": "http://localhost:8000/rpc",
				tt.key:                    tt.value,
			}))
			if err == nil || !strings.Contains(err.Error(), tt.key) {
				t.Fatalf("error = %v, want validation mentioning %s", err, tt.key)
			}
		})
	}
}

func TestLoadConfigRejectsMissingSurrealDBURLWithoutLeakingCredentials(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SURREALDB_USERNAME": "root",
		"CLOUDGRID_SURREALDB_PASSWORD": "super-secret",
	}

	_, err := LoadConfig(MapEnv(env))
	if err == nil {
		t.Fatal("LoadConfig returned nil error")
	}

	message := err.Error()
	if !strings.Contains(message, "ERR-009") || !strings.Contains(message, "CLOUDGRID_SURREALDB_URL") {
		t.Fatalf("error = %q, want ERR-009 with missing URL", message)
	}
	if strings.Contains(message, "super-secret") || strings.Contains(message, "root") {
		t.Fatalf("error leaked credentials: %q", message)
	}
}

func TestLoadConfigRejectsPartialCredentials(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SURREALDB_URL":      "http://localhost:8000/rpc",
		"CLOUDGRID_SURREALDB_USERNAME": "root",
	}

	_, err := LoadConfig(MapEnv(env))
	if err == nil {
		t.Fatal("LoadConfig returned nil error")
	}
	if !strings.Contains(err.Error(), "CLOUDGRID_SURREALDB_PASSWORD") {
		t.Fatalf("error = %q, want missing password", err.Error())
	}
}

func TestLoadConfigPreservesStorageAdapterSelection(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_STORAGE_ADAPTER": "postgres",
	}

	cfg, err := LoadConfig(MapEnv(env))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}
	if cfg.StorageAdapter != "postgres" {
		t.Fatalf("StorageAdapter = %q, want postgres", cfg.StorageAdapter)
	}
}

func TestLoadConfigAppliesLocalSelfObservabilityDefaults(t *testing.T) {
	cfg, err := LoadConfig(MapEnv(map[string]string{
		"CLOUDGRID_SURREALDB_URL": "http://localhost:8000/rpc",
	}))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	self := cfg.SelfObservability
	if !self.Enabled {
		t.Fatal("SelfObservability.Enabled = false, want local default enabled")
	}
	if self.ProjectID != "cloudgrid-system" || self.CompanyID != "local" || self.OTLPEndpoint != "http://localhost:4318" {
		t.Fatalf("self-observability identity/endpoint = %#v, want local defaults", self)
	}
	if self.OTLPBearerToken != "" {
		t.Fatal("local self-observability token should be empty by default")
	}
	if self.ExportIntervalSeconds != 10 {
		t.Fatalf("ExportIntervalSeconds = %d, want 10", self.ExportIntervalSeconds)
	}
	if !self.TracesEnabled || !self.LogsEnabled || !self.MetricsEnabled {
		t.Fatalf("signal defaults = traces:%v logs:%v metrics:%v, want all enabled", self.TracesEnabled, self.LogsEnabled, self.MetricsEnabled)
	}
}

func TestLoadConfigAppliesDeployedSelfObservabilityDisabledDefaults(t *testing.T) {
	cfg, err := LoadConfig(MapEnv(map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE": "deployed",
		"CLOUDGRID_SURREALDB_URL":   "http://localhost:8000/rpc",
	}))
	if err != nil {
		t.Fatalf("LoadConfig returned error: %v", err)
	}

	self := cfg.SelfObservability
	if self.Enabled {
		t.Fatal("SelfObservability.Enabled = true, want deployed default disabled")
	}
	if self.ProjectID != "cloudgrid-system" {
		t.Fatalf("ProjectID = %q, want cloudgrid-system", self.ProjectID)
	}
	if self.CompanyID != "" || self.OTLPEndpoint != "" || self.OTLPBearerToken != "" {
		t.Fatalf("deployed disabled credentials = %#v, want empty company/endpoint/token", self)
	}
	if self.TracesEnabled || self.LogsEnabled || self.MetricsEnabled {
		t.Fatalf("deployed disabled signals = traces:%v logs:%v metrics:%v, want all disabled", self.TracesEnabled, self.LogsEnabled, self.MetricsEnabled)
	}
}

func TestLoadConfigRejectsDeployedEnabledSelfObservabilityWithoutRequiredValues(t *testing.T) {
	base := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE":                      "deployed",
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":           "true",
		"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID":        "company-1",
		"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID":        "project-1",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT":     "https://collector.example.test",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "secret-token",
		"CLOUDGRID_SURREALDB_URL":                        "http://localhost:8000/rpc",
	}

	for _, key := range []string{
		"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID",
		"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN",
	} {
		t.Run(key, func(t *testing.T) {
			env := map[string]string{}
			for k, v := range base {
				env[k] = v
			}
			env[key] = ""

			_, err := LoadConfig(MapEnv(env))
			if err == nil {
				t.Fatal("LoadConfig returned nil error")
			}
			if !strings.Contains(err.Error(), "ERR-009") || !strings.Contains(err.Error(), key) {
				t.Fatalf("error = %q, want ERR-009 mentioning %s", err.Error(), key)
			}
			if strings.Contains(err.Error(), "secret-token") {
				t.Fatalf("error leaked bearer token: %q", err.Error())
			}
		})
	}
}

func TestLoadConfigValidatesSelfObservabilityExportInterval(t *testing.T) {
	for _, value := range []string{"0", "301", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			_, err := LoadConfig(MapEnv(map[string]string{
				"CLOUDGRID_SURREALDB_URL":                              "http://localhost:8000/rpc",
				"CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS": value,
			}))
			if err == nil {
				t.Fatal("LoadConfig returned nil error")
			}
			if !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS") {
				t.Fatalf("error = %q, want export interval validation", err.Error())
			}
		})
	}
}

func TestLoadConfigRejectsNumericSelfObservabilityBooleans(t *testing.T) {
	_, err := LoadConfig(MapEnv(map[string]string{
		"CLOUDGRID_SURREALDB_URL":                   "http://localhost:8000/rpc",
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":      "1",
		"CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED": "0",
	}))
	if err == nil {
		t.Fatal("LoadConfig returned nil error")
	}
	if !strings.Contains(err.Error(), "ERR-009") || !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_ENABLED") {
		t.Fatalf("error = %q, want strict boolean validation", err.Error())
	}
}
