package collector

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	defaultSelfObservabilityProjectID = "cloudgrid-system"
	defaultSelfObservabilityEndpoint  = "http://localhost:4318"
	defaultSelfObservabilityInterval  = 10
)

type SelfObservabilityConfig struct {
	Enabled               bool
	CompanyID             string
	ProjectID             string
	OTLPEndpoint          string
	OTLPBearerToken       string
	ExportIntervalSeconds int
	TracesEnabled         bool
	LogsEnabled           bool
	MetricsEnabled        bool
}

func ResolveSelfObservabilityConfig(getenv func(string) string) (SelfObservabilityConfig, error) {
	deploymentMode := strings.TrimSpace(getenv("CLOUDGRID_DEPLOYMENT_MODE"))
	if deploymentMode == "" {
		deploymentMode = DeploymentModeLocal
	}

	defaultEnabled := deploymentMode == DeploymentModeLocal
	enabled, err := boolEnv(getenv, "CLOUDGRID_SELF_OBSERVABILITY_ENABLED", defaultEnabled)
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	interval, err := intEnv(getenv, "CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS", defaultSelfObservabilityInterval, 1, 300)
	if err != nil {
		return SelfObservabilityConfig{}, err
	}

	config := SelfObservabilityConfig{
		Enabled:               enabled,
		ProjectID:             strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID")),
		CompanyID:             strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID")),
		OTLPEndpoint:          strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT")),
		OTLPBearerToken:       strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN")),
		ExportIntervalSeconds: interval,
	}
	if config.ProjectID == "" && deploymentMode == DeploymentModeLocal {
		config.ProjectID = defaultSelfObservabilityProjectID
	}
	if config.CompanyID == "" && deploymentMode == DeploymentModeLocal {
		config.CompanyID = localCompanyID
	}
	if config.OTLPEndpoint == "" && deploymentMode == DeploymentModeLocal {
		config.OTLPEndpoint = defaultSelfObservabilityEndpoint
	}

	config.TracesEnabled, err = boolEnv(getenv, "CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED", enabled)
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	config.LogsEnabled, err = boolEnv(getenv, "CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED", enabled)
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	config.MetricsEnabled, err = boolEnv(getenv, "CLOUDGRID_SELF_OBSERVABILITY_METRICS_ENABLED", enabled)
	if err != nil {
		return SelfObservabilityConfig{}, err
	}
	if !enabled {
		config.TracesEnabled = false
		config.LogsEnabled = false
		config.MetricsEnabled = false
	}

	if deploymentMode == DeploymentModeDeployed && enabled {
		for _, field := range []struct {
			name  string
			value string
		}{
			{name: "CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID", value: config.CompanyID},
			{name: "CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID", value: config.ProjectID},
			{name: "CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT", value: config.OTLPEndpoint},
			{name: "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN", value: config.OTLPBearerToken},
		} {
			if field.value == "" {
				return SelfObservabilityConfig{}, configInvalidError("%s is required when self-observability is enabled in deployed mode", field.name)
			}
		}
	}
	return config, nil
}

func boolEnv(getenv func(string) string, name string, fallback bool) (bool, error) {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return fallback, nil
	}
	switch strings.ToLower(raw) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, configInvalidError("%s must be true or false", name)
	}
}

func intEnv(getenv func(string) string, name string, fallback int, min int, max int) (int, error) {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < min || value > max {
		return 0, configInvalidError("%s must be an integer between %d and %d", name, min, max)
	}
	return value, nil
}

func configInvalidError(format string, args ...any) error {
	return fmt.Errorf("ERR-009 CONFIG_INVALID: "+format, args...)
}
