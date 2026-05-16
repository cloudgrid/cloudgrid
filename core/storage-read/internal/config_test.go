package internal

import (
	"strings"
	"testing"
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
