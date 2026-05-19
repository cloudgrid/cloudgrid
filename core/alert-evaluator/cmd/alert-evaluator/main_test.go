package main

import "testing"

func TestValidateConfigRejectsEnabledSchedulerWithoutProjectSource(t *testing.T) {
	cfg := loadConfig(func(key string) string {
		switch key {
		case "CLOUDGRID_ALERT_EVALUATOR_INTERVAL_SECONDS":
			return "60"
		default:
			return ""
		}
	})

	if err := cfg.Validate(); err == nil {
		t.Fatal("Validate returned nil, want missing project source error")
	}
}

func TestLoadConfigEnablesProjectDiscoverySource(t *testing.T) {
	cfg := loadConfig(func(key string) string {
		switch key {
		case "CLOUDGRID_ALERT_EVALUATOR_PROJECT_DISCOVERY_ENABLED":
			return "true"
		default:
			return ""
		}
	})

	if err := cfg.Validate(); err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if !cfg.ProjectDiscoveryEnabled {
		t.Fatalf("ProjectDiscoveryEnabled = false, want true")
	}
}
