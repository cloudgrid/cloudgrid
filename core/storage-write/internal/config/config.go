package config

import (
	"fmt"
	"net/url"
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
	defaultHealthPort         = "8082"
)

type Config struct {
	StorageAdapter    string
	DeploymentMode    string
	NATSURL           string
	HealthHost        string
	HealthPort        string
	Consumer          ConsumerConfig
	SurrealDB         SurrealDBConfig
	SelfObservability SelfObservabilityConfig
}

type ConsumerConfig struct {
	Mode           string
	PullBatchSize  int
	PullMaxWaitMS  int
	AckWaitSeconds int
	MaxDeliver     int
	MaxAckPending  int
	Concurrency    int
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
	ExportFailureLogLevel string
}

func (cfg SurrealDBConfig) HasCredentials() bool {
	return cfg.Username != "" && cfg.Password != ""
}

func Load() (Config, error) {
	self, err := loadSelfObservabilityConfig()
	if err != nil {
		return Config{}, err
	}
	consumer, err := loadConsumerConfig()
	if err != nil {
		return Config{}, err
	}
	cfg := Config{
		StorageAdapter:    valueOrDefault(os.Getenv("CLOUDGRID_STORAGE_ADAPTER"), AdapterSurrealDB),
		DeploymentMode:    valueOrDefault(os.Getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local"),
		NATSURL:           valueOrDefault(os.Getenv("CLOUDGRID_NATS_URL"), defaultNATSURL),
		HealthHost:        valueOrDefault(os.Getenv("CLOUDGRID_STORAGE_WRITE_HEALTH_HOST"), defaultHealthHost),
		HealthPort:        valueOrDefault(os.Getenv("CLOUDGRID_STORAGE_WRITE_HEALTH_PORT"), defaultHealthPort),
		Consumer:          consumer,
		SelfObservability: self,
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

func loadConsumerConfig() (ConsumerConfig, error) {
	mode := valueOrDefault(os.Getenv("CLOUDGRID_STORAGE_WRITE_CONSUMER_MODE"), "push")
	if mode != "push" && mode != "pull" {
		return ConsumerConfig{}, configError("CLOUDGRID_STORAGE_WRITE_CONSUMER_MODE must be push or pull")
	}
	batchSize, err := boundedIntEnv("CLOUDGRID_STORAGE_WRITE_PULL_BATCH_SIZE", 100, 1, 1000)
	if err != nil {
		return ConsumerConfig{}, err
	}
	maxWaitMS, err := boundedIntEnv("CLOUDGRID_STORAGE_WRITE_PULL_MAX_WAIT_MS", 500, 10, 30000)
	if err != nil {
		return ConsumerConfig{}, err
	}
	ackWaitSeconds, err := boundedIntEnv("CLOUDGRID_STORAGE_WRITE_ACK_WAIT_SECONDS", 30, 1, 600)
	if err != nil {
		return ConsumerConfig{}, err
	}
	maxDeliver, err := boundedIntEnv("CLOUDGRID_STORAGE_WRITE_MAX_DELIVER", 5, 1, 100)
	if err != nil {
		return ConsumerConfig{}, err
	}
	maxAckPending, err := boundedIntEnv("CLOUDGRID_STORAGE_WRITE_MAX_ACK_PENDING", 1000, 1, 100000)
	if err != nil {
		return ConsumerConfig{}, err
	}
	concurrency, err := boundedIntEnv("CLOUDGRID_STORAGE_WRITE_CONCURRENCY", 4, 1, 128)
	if err != nil {
		return ConsumerConfig{}, err
	}
	return ConsumerConfig{
		Mode:           mode,
		PullBatchSize:  batchSize,
		PullMaxWaitMS:  maxWaitMS,
		AckWaitSeconds: ackWaitSeconds,
		MaxDeliver:     maxDeliver,
		MaxAckPending:  maxAckPending,
		Concurrency:    concurrency,
	}, nil
}

func loadSelfObservabilityConfig() (SelfObservabilityConfig, error) {
	mode := valueOrDefault(os.Getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local")
	if mode != "local" && mode != "deployed" {
		return SelfObservabilityConfig{}, configError("CLOUDGRID_DEPLOYMENT_MODE must be local or deployed")
	}
	defaultEnabled := mode == "local"
	enabled, err := boolValue(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED"), defaultEnabled, "CLOUDGRID_SELF_OBSERVABILITY_ENABLED")
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	interval, err := intValue(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS"), 10, "CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS")
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	if interval < 1 || interval > 300 {
		return SelfObservabilityConfig{}, configError("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS must be between 1 and 300")
	}

	cfg := SelfObservabilityConfig{
		Enabled:               enabled,
		ProjectID:             valueOrDefault(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID"), "cloudgrid-system"),
		ExportIntervalSeconds: interval,
	}
	cfg.ExportFailureLogLevel, err = selfObservabilityLogLevel(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL"))
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	if mode == "local" {
		cfg.CompanyID = valueOrDefault(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID"), "local")
		cfg.OTLPEndpoint = valueOrDefault(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT"), "http://localhost:4318")
	} else {
		cfg.CompanyID = strings.TrimSpace(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID"))
		cfg.OTLPEndpoint = strings.TrimSpace(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT"))
	}
	cfg.OTLPBearerToken = strings.TrimSpace(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN"))

	if enabled {
		cfg.TracesEnabled, err = boolValue(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED"), true, "CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED")
		if err != nil {
			return SelfObservabilityConfig{}, err
		}
		cfg.LogsEnabled, err = boolValue(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED"), true, "CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED")
		if err != nil {
			return SelfObservabilityConfig{}, err
		}
		cfg.MetricsEnabled, err = boolValue(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED"), true, "CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED")
		if err != nil {
			return SelfObservabilityConfig{}, err
		}
	}
	if mode == "deployed" && enabled {
		for _, field := range []struct {
			name  string
			value string
		}{
			{"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID", os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID")},
			{"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID", os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID")},
			{"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT", os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT")},
			{"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN", os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN")},
		} {
			if strings.TrimSpace(field.value) == "" {
				return SelfObservabilityConfig{}, configError(field.name + " is required when self-observability is enabled in deployed mode")
			}
		}
	}
	if mode == "local" && enabled && cfg.OTLPBearerToken == "" {
		return SelfObservabilityConfig{}, configError("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN is required when self-observability is enabled")
	}
	return cfg, nil
}

func selfObservabilityLogLevel(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "warn", nil
	}
	switch value {
	case "debug", "info", "warn", "error", "off":
		return value, nil
	default:
		return "", configError("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL must be debug, info, warn, error, or off")
	}
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

func boundedIntEnv(name string, fallback int, min int, max int) (int, error) {
	parsed, err := intValue(os.Getenv(name), fallback, name)
	if err != nil {
		return 0, err
	}
	if parsed < min || parsed > max {
		return 0, configError(fmt.Sprintf("%s must be between %d and %d", name, min, max))
	}
	return parsed, nil
}

func configError(reason string) error {
	return fmt.Errorf("ERR-009 CONFIG_INVALID: %s", reason)
}
