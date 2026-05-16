package internal

import (
	"fmt"
	"os"
	"strings"
)

const (
	AdapterSurrealDB          = "surrealdb"
	defaultNATSURL            = "nats://localhost:4222"
	defaultSurrealDBNamespace = "observability"
	defaultSurrealDBDatabase  = "dev"
	defaultHealthHost         = "0.0.0.0"
	defaultHealthPort         = "8081"
)

type EnvLookup func(string) string

type Config struct {
	StorageAdapter string
	NATSURL        string
	HealthHost     string
	HealthPort     string
	SurrealDB      SurrealDBConfig
}

type SurrealDBConfig struct {
	URL       string
	Namespace string
	Database  string
	Username  string
	Password  string
}

func OSEnv(key string) string {
	return os.Getenv(key)
}

func MapEnv(values map[string]string) EnvLookup {
	return func(key string) string {
		return values[key]
	}
}

func LoadConfig(env EnvLookup) (Config, error) {
	cfg := Config{
		StorageAdapter: valueOrDefault(env("CLOUDGRID_STORAGE_ADAPTER"), AdapterSurrealDB),
		NATSURL:        valueOrDefault(env("CLOUDGRID_NATS_URL"), defaultNATSURL),
		HealthHost:     valueOrDefault(env("CLOUDGRID_STORAGE_READ_HEALTH_HOST"), defaultHealthHost),
		HealthPort:     valueOrDefault(env("CLOUDGRID_STORAGE_READ_HEALTH_PORT"), defaultHealthPort),
		SurrealDB: SurrealDBConfig{
			URL:       strings.TrimSpace(env("CLOUDGRID_SURREALDB_URL")),
			Namespace: valueOrDefault(env("CLOUDGRID_SURREALDB_NAMESPACE"), defaultSurrealDBNamespace),
			Database:  valueOrDefault(env("CLOUDGRID_SURREALDB_DATABASE"), defaultSurrealDBDatabase),
			Username:  strings.TrimSpace(env("CLOUDGRID_SURREALDB_USERNAME")),
			Password:  env("CLOUDGRID_SURREALDB_PASSWORD"),
		},
	}

	if strings.TrimSpace(cfg.StorageAdapter) == "" {
		return Config{}, configError("CLOUDGRID_STORAGE_ADAPTER is required")
	}
	if cfg.StorageAdapter == AdapterSurrealDB && cfg.SurrealDB.URL == "" {
		return Config{}, configError("CLOUDGRID_SURREALDB_URL is required")
	}
	if cfg.StorageAdapter == AdapterSurrealDB && cfg.SurrealDB.Username == "" && cfg.SurrealDB.Password != "" {
		return Config{}, configError("CLOUDGRID_SURREALDB_USERNAME is required when CLOUDGRID_SURREALDB_PASSWORD is set")
	}
	if cfg.StorageAdapter == AdapterSurrealDB && cfg.SurrealDB.Username != "" && cfg.SurrealDB.Password == "" {
		return Config{}, configError("CLOUDGRID_SURREALDB_PASSWORD is required when CLOUDGRID_SURREALDB_USERNAME is set")
	}

	return cfg, nil
}

func valueOrDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func configError(reason string) error {
	return fmt.Errorf("ERR-009 CONFIG_INVALID: %s", reason)
}
