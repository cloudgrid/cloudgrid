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
