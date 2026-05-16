package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

const (
	AdapterSurrealDB          = "surrealdb"
	defaultNATSURL            = "nats://localhost:4222"
	defaultSurrealDBNamespace = "observability"
	defaultSurrealDBDatabase  = "dev"
	defaultHealthHost         = "0.0.0.0"
	defaultHealthPort         = "8082"
)

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

func (cfg SurrealDBConfig) HasCredentials() bool {
	return cfg.Username != "" && cfg.Password != ""
}

func Load() (Config, error) {
	cfg := Config{
		StorageAdapter: valueOrDefault(os.Getenv("CLOUDGRID_STORAGE_ADAPTER"), AdapterSurrealDB),
		NATSURL:        valueOrDefault(os.Getenv("CLOUDGRID_NATS_URL"), defaultNATSURL),
		HealthHost:     valueOrDefault(os.Getenv("CLOUDGRID_STORAGE_WRITE_HEALTH_HOST"), defaultHealthHost),
		HealthPort:     valueOrDefault(os.Getenv("CLOUDGRID_STORAGE_WRITE_HEALTH_PORT"), defaultHealthPort),
		SurrealDB: SurrealDBConfig{
			URL:       strings.TrimSpace(os.Getenv("CLOUDGRID_SURREALDB_URL")),
			Namespace: valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_NAMESPACE"), defaultSurrealDBNamespace),
			Database:  valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_DATABASE"), defaultSurrealDBDatabase),
			Username:  strings.TrimSpace(os.Getenv("CLOUDGRID_SURREALDB_USERNAME")),
			Password:  strings.TrimSpace(os.Getenv("CLOUDGRID_SURREALDB_PASSWORD")),
		},
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func (cfg Config) Validate() error {
	if strings.TrimSpace(cfg.StorageAdapter) == "" {
		return configError("CLOUDGRID_STORAGE_ADAPTER is required")
	}
	if cfg.NATSURL == "" {
		return configError("CLOUDGRID_NATS_URL is required")
	}
	natsURL, err := url.ParseRequestURI(cfg.NATSURL)
	if err != nil {
		return configError("CLOUDGRID_NATS_URL must be a valid URL")
	}
	if natsURL.User != nil {
		return configError("CLOUDGRID_NATS_URL must not include credentials")
	}
	if cfg.StorageAdapter != AdapterSurrealDB {
		return nil
	}
	if cfg.SurrealDB.URL == "" {
		return configError("CLOUDGRID_SURREALDB_URL is required")
	}
	surrealURL, err := url.ParseRequestURI(cfg.SurrealDB.URL)
	if err != nil {
		return configError("CLOUDGRID_SURREALDB_URL must be a valid URL")
	}
	if surrealURL.User != nil {
		return configError("CLOUDGRID_SURREALDB_URL must not include credentials")
	}
	if cfg.SurrealDB.Namespace == "" {
		return configError("CLOUDGRID_SURREALDB_NAMESPACE is required")
	}
	if cfg.SurrealDB.Database == "" {
		return configError("CLOUDGRID_SURREALDB_DATABASE is required")
	}
	if (cfg.SurrealDB.Username == "") != (cfg.SurrealDB.Password == "") {
		return configError("CLOUDGRID_SURREALDB_USERNAME and CLOUDGRID_SURREALDB_PASSWORD must be provided together")
	}
	return nil
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
