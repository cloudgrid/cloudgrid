package collector

import (
	"strings"
	"testing"
)

func TestResolveSelfObservabilityConfigLocalDefaultsEnabled(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "system-token",
	}
	config, err := ResolveSelfObservabilityConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("ResolveSelfObservabilityConfig() error = %v", err)
	}

	if !config.Enabled {
		t.Fatal("Enabled = false, want true")
	}
	if config.CompanyID != "local" || config.ProjectID != "cloudgrid-system" || config.OTLPEndpoint != "http://localhost:4318" {
		t.Fatalf("config = %#v, want local/cloudgrid-system/http://localhost:4318", config)
	}
	if config.OTLPBearerToken != "system-token" {
		t.Fatalf("OTLPBearerToken = %q, want configured token", config.OTLPBearerToken)
	}
	if config.ExportIntervalSeconds != 10 {
		t.Fatalf("ExportIntervalSeconds = %d, want 10", config.ExportIntervalSeconds)
	}
	if !config.TracesEnabled || !config.LogsEnabled || !config.MetricsEnabled {
		t.Fatalf("signal toggles = traces:%t logs:%t metrics:%t, want all enabled", config.TracesEnabled, config.LogsEnabled, config.MetricsEnabled)
	}
}

func TestResolveSelfObservabilityConfigLocalEnabledRequiresBearerToken(t *testing.T) {
	_, err := ResolveSelfObservabilityConfig(func(string) string { return "" })
	if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN") {
		t.Fatalf("ResolveSelfObservabilityConfig() error = %v, want bearer token validation", err)
	}
}

func TestResolveSelfObservabilityConfigDeployedDefaultsDisabled(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_DEPLOYMENT_MODE": "deployed",
	}

	config, err := ResolveSelfObservabilityConfig(func(name string) string { return env[name] })
	if err != nil {
		t.Fatalf("ResolveSelfObservabilityConfig() error = %v", err)
	}

	if config.Enabled {
		t.Fatal("Enabled = true, want false")
	}
	if config.TracesEnabled || config.LogsEnabled || config.MetricsEnabled {
		t.Fatalf("signal toggles = traces:%t logs:%t metrics:%t, want all disabled", config.TracesEnabled, config.LogsEnabled, config.MetricsEnabled)
	}
}

func TestResolveSelfObservabilityConfigDeployedEnabledRequiresRoutingAndCredential(t *testing.T) {
	required := []string{
		"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID",
		"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT",
		"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN",
	}

	for _, missing := range required {
		t.Run(missing, func(t *testing.T) {
			env := map[string]string{
				"CLOUDGRID_DEPLOYMENT_MODE":                      "deployed",
				"CLOUDGRID_SELF_OBSERVABILITY_ENABLED":           "true",
				"CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID":        "company-a",
				"CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID":        "project-a",
				"CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT":     "https://collector.example",
				"CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN": "service-token",
			}
			delete(env, missing)

			_, err := ResolveSelfObservabilityConfig(func(name string) string { return env[name] })
			if err == nil || !strings.Contains(err.Error(), missing) {
				t.Fatalf("error = %v, want missing %s validation", err, missing)
			}
		})
	}
}

func TestResolveSelfObservabilityConfigExportIntervalValidatesRange(t *testing.T) {
	for _, value := range []string{"0", "301", "not-a-number"} {
		t.Run(value, func(t *testing.T) {
			env := map[string]string{
				"CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS": value,
			}

			_, err := ResolveSelfObservabilityConfig(func(name string) string { return env[name] })
			if err == nil || !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS") {
				t.Fatalf("error = %v, want export interval validation", err)
			}
		})
	}
}

func TestResolveSelfObservabilityConfigRejectsNumericBooleansWithConfigError(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_SELF_OBSERVABILITY_ENABLED": "1",
	}

	_, err := ResolveSelfObservabilityConfig(func(name string) string { return env[name] })
	if err == nil {
		t.Fatal("ResolveSelfObservabilityConfig() error = nil")
	}
	if !strings.Contains(err.Error(), "ERR-009 CONFIG_INVALID") || !strings.Contains(err.Error(), "CLOUDGRID_SELF_OBSERVABILITY_ENABLED") {
		t.Fatalf("error = %v, want ERR-009 boolean validation", err)
	}
}
