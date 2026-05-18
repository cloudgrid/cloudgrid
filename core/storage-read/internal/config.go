package internal

import (
	"fmt"
	"os"
	"strconv"
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
	StorageAdapter    string
	DeploymentMode    string
	NATSURL           string
	HealthHost        string
	HealthPort        string
	SurrealDB         SurrealDBConfig
	SelfObservability SelfObservabilityConfig
}

type SurrealDBConfig struct {
	URL       string
	Namespace string
	Database  string
	Username  string
	Password  string
}

type SelfObservabilityConfig struct {
	Enabled               bool
	ProjectID             string
	CompanyID             string
	OTLPEndpoint          string
	OTLPBearerToken       string
	ExportIntervalSeconds int
	TracesEnabled         bool
	LogsEnabled           bool
	MetricsEnabled        bool
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
	self, err := loadSelfObservabilityConfig(env)
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		StorageAdapter:    valueOrDefault(env("CLOUDGRID_STORAGE_ADAPTER"), AdapterSurrealDB),
		DeploymentMode:    valueOrDefault(env("CLOUDGRID_DEPLOYMENT_MODE"), "local"),
		NATSURL:           valueOrDefault(env("CLOUDGRID_NATS_URL"), defaultNATSURL),
		HealthHost:        valueOrDefault(env("CLOUDGRID_STORAGE_READ_HEALTH_HOST"), defaultHealthHost),
		HealthPort:        valueOrDefault(env("CLOUDGRID_STORAGE_READ_HEALTH_PORT"), defaultHealthPort),
		SelfObservability: self,
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

func loadSelfObservabilityConfig(env EnvLookup) (SelfObservabilityConfig, error) {
	mode := valueOrDefault(env("CLOUDGRID_DEPLOYMENT_MODE"), "local")
	if mode != "local" && mode != "deployed" {
		return SelfObservabilityConfig{}, configError("CLOUDGRID_DEPLOYMENT_MODE must be local or deployed")
	}
	defaultEnabled := mode == "local"
	enabled, err := boolValue(env("CLOUDGRID_SELF_OBSERVABILITY_ENABLED"), defaultEnabled, "CLOUDGRID_SELF_OBSERVABILITY_ENABLED")
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	interval, err := intValue(env("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS"), 10, "CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS")
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	if interval < 1 || interval > 300 {
		return SelfObservabilityConfig{}, configError("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS must be between 1 and 300")
	}

	cfg := SelfObservabilityConfig{
		Enabled:               enabled,
		ProjectID:             valueOrDefault(env("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID"), "cloudgrid-system"),
		ExportIntervalSeconds: interval,
	}
	if mode == "local" {
		cfg.CompanyID = valueOrDefault(env("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID"), "local")
		cfg.OTLPEndpoint = valueOrDefault(env("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT"), "http://localhost:4318")
	} else {
		cfg.CompanyID = strings.TrimSpace(env("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID"))
		cfg.OTLPEndpoint = strings.TrimSpace(env("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT"))
	}
	cfg.OTLPBearerToken = strings.TrimSpace(env("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN"))

	if enabled {
		cfg.TracesEnabled, err = boolValue(env("CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED"), true, "CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED")
		if err != nil {
			return SelfObservabilityConfig{}, err
		}
		cfg.LogsEnabled, err = boolValue(env("CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED"), true, "CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED")
		if err != nil {
			return SelfObservabilityConfig{}, err
		}
		cfg.MetricsEnabled, err = boolValue(env("CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED"), true, "CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED")
		if err != nil {
			return SelfObservabilityConfig{}, err
		}
	}
	if mode == "deployed" && enabled {
		for _, field := range []struct {
			name  string
			value string
		}{
			{"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID", env("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID")},
			{"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID", env("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID")},
			{"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT", env("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT")},
			{"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN", env("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN")},
		} {
			if strings.TrimSpace(field.value) == "" {
				return SelfObservabilityConfig{}, configError(field.name + " is required when self-observability is enabled in deployed mode")
			}
		}
	}
	return cfg, nil
}

func boolValue(value string, fallback bool, name string) (bool, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	switch strings.ToLower(value) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, configError(name + " must be true or false")
	}
}

func intValue(value string, fallback int, name string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, configError(name + " must be an integer")
	}
	return parsed, nil
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
