package config

import (
	"strings"
	"testing"
)

func TestLoadAppliesDefaults(t *testing.T) {
	t.Setenv("CLOUDGRID_SURREALDB_URL", "ws://localhost:8000/rpc")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.NATSURL != "nats://localhost:4222" {
		t.Fatalf("NATSURL = %q", cfg.NATSURL)
	}
	if cfg.StorageAdapter != AdapterSurrealDB {
		t.Fatalf("StorageAdapter = %q, want %q", cfg.StorageAdapter, AdapterSurrealDB)
	}
	if cfg.SurrealDB.Namespace != "observability" {
		t.Fatalf("Namespace = %q", cfg.SurrealDB.Namespace)
	}
	if cfg.SurrealDB.Database != "dev" {
		t.Fatalf("Database = %q", cfg.SurrealDB.Database)
	}
}

func TestLoadAppliesLocalSelfObservabilityDefaults(t *testing.T) {
	t.Setenv("CLOUDGRID_SURREALDB_URL", "ws://localhost:8000/rpc")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
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

func TestLoadAppliesDeployedSelfObservabilityDisabledDefaults(t *testing.T) {
	t.Setenv("CLOUDGRID_DEPLOYMENT_MODE", "deployed")
	t.Setenv("CLOUDGRID_SURREALDB_URL", "ws://localhost:8000/rpc")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
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

func TestLoadRejectsDeployedEnabledSelfObservabilityWithoutRequiredValues(t *testing.T) {
	required := map[string]string{
		"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID":        "company-1",
		"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID":        "project-1",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT":     "https://collector.example.test",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "secret-token",
	}

	for key := range required {
		t.Run(key, func(t *testing.T) {
			t.Setenv("CLOUDGRID_DEPLOYMENT_MODE", "deployed")
			t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED", "true")
			t.Setenv("CLOUDGRID_SURREALDB_URL", "ws://localhost:8000/rpc")
			for k, v := range required {
				if k == key {
					t.Setenv(k, "")
				} else {
					t.Setenv(k, v)
				}
			}

			_, err := Load()
			if err == nil {
				t.Fatal("Load() error = nil")
			}
			if !strings.Contains(err.Error(), "ERR-009") || !strings.Contains(err.Error(), key) {
				t.Fatalf("Load() error = %q, want ERR-009 mentioning %s", err.Error(), key)
			}
			if strings.Contains(err.Error(), "secret-token") {
				t.Fatalf("error leaked bearer token: %q", err.Error())
			}
		})
	}
}

func TestLoadValidatesSelfObservabilityExportInterval(t *testing.T) {
	for _, value := range []string{"0", "301", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("CLOUDGRID_SURREALDB_URL", "ws://localhost:8000/rpc")
			t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS", value)

			_, err := Load()
			if err == nil {
				t.Fatal("Load() error = nil")
			}
			if !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS") {
				t.Fatalf("Load() error = %q, want export interval validation", err.Error())
			}
		})
	}
}

func TestLoadRejectsNumericSelfObservabilityBooleans(t *testing.T) {
	t.Setenv("CLOUDGRID_SURREALDB_URL", "ws://localhost:8000/rpc")
	t.Setenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED", "1")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil")
	}
	if !strings.Contains(err.Error(), "ERR-009") || !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_ENABLED") {
		t.Fatalf("Load() error = %q, want strict boolean validation", err.Error())
	}
}

func TestLoadPreservesStorageAdapterSelection(t *testing.T) {
	t.Setenv("CLOUDGRID_STORAGE_ADAPTER", "postgres")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.StorageAdapter != "postgres" {
		t.Fatalf("StorageAdapter = %q, want postgres", cfg.StorageAdapter)
	}
}

func TestLoadRejectsMissingSurrealURL(t *testing.T) {
	t.Setenv("CLOUDGRID_STORAGE_ADAPTER", AdapterSurrealDB)
	t.Setenv("CLOUDGRID_SURREALDB_URL", "")
	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil")
	}

	if !strings.Contains(err.Error(), "ERR-009") {
		t.Fatalf("error %q does not contain ERR-009", err.Error())
	}
}

func TestLoadRejectsPartialCredentialsWithoutLeakingSecrets(t *testing.T) {
	t.Setenv("CLOUDGRID_SURREALDB_URL", "ws://localhost:8000/rpc")
	t.Setenv("CLOUDGRID_SURREALDB_USERNAME", "root")
	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "super-secret")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() with both credentials error = %v", err)
	}
	if !cfg.SurrealDB.HasCredentials() {
		t.Fatal("expected credentials to be present")
	}

	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "")
	_, err = Load()
	if err == nil {
		t.Fatal("Load() with partial credentials error = nil")
	}
	if strings.Contains(err.Error(), "root") || strings.Contains(err.Error(), "super-secret") {
		t.Fatalf("error leaked credential content: %q", err.Error())
	}
}

func TestValidateRejectsInvalidRuntimeConfiguration(t *testing.T) {
	base := Config{
		StorageAdapter: AdapterSurrealDB,
		NATSURL:        "nats://localhost:4222",
		SurrealDB: SurrealDBConfig{
			URL:       "ws://localhost:8000/rpc",
			Namespace: "observability",
			Database:  "dev",
		},
	}

	tests := []struct {
		name string
		cfg  Config
		want string
	}{
		{
			name: "missing adapter",
			cfg: func() Config {
				cfg := base
				cfg.StorageAdapter = " "
				return cfg
			}(),
			want: "CLOUDGRID_STORAGE_ADAPTER is required",
		},
		{
			name: "missing nats url",
			cfg: func() Config {
				cfg := base
				cfg.NATSURL = ""
				return cfg
			}(),
			want: "CLOUDGRID_NATS_URL is required",
		},
		{
			name: "invalid nats url",
			cfg: func() Config {
				cfg := base
				cfg.NATSURL = "://bad"
				return cfg
			}(),
			want: "CLOUDGRID_NATS_URL must be a valid URL",
		},
		{
			name: "nats credentials",
			cfg: func() Config {
				cfg := base
				cfg.NATSURL = "nats://user:pass@localhost:4222"
				return cfg
			}(),
			want: "CLOUDGRID_NATS_URL must not include credentials",
		},
		{
			name: "invalid surreal url",
			cfg: func() Config {
				cfg := base
				cfg.SurrealDB.URL = "://bad"
				return cfg
			}(),
			want: "CLOUDGRID_SURREALDB_URL must be a valid URL",
		},
		{
			name: "surreal credentials in url",
			cfg: func() Config {
				cfg := base
				cfg.SurrealDB.URL = "ws://root:secret@localhost:8000/rpc"
				return cfg
			}(),
			want: "CLOUDGRID_SURREALDB_URL must not include credentials",
		},
		{
			name: "missing namespace",
			cfg: func() Config {
				cfg := base
				cfg.SurrealDB.Namespace = ""
				return cfg
			}(),
			want: "CLOUDGRID_SURREALDB_NAMESPACE is required",
		},
		{
			name: "missing database",
			cfg: func() Config {
				cfg := base
				cfg.SurrealDB.Database = ""
				return cfg
			}(),
			want: "CLOUDGRID_SURREALDB_DATABASE is required",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := test.cfg.Validate()
			if err == nil {
				t.Fatal("Validate() error = nil")
			}
			if !strings.Contains(err.Error(), "ERR-009") || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Validate() error = %q, want ERR-009 with %q", err.Error(), test.want)
			}
		})
	}
}
