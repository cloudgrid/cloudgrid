package main

import (
	"testing"
	"time"
)

func TestLoadConfigDefaultsRetentionSchedulerDisabled(t *testing.T) {
	cfg, err := loadConfig(func(string) string { return "" })
	if err != nil {
		t.Fatalf("loadConfig returned error: %v", err)
	}
	if cfg.RetentionScheduler.Enabled {
		t.Fatal("retention scheduler enabled by default")
	}
	if cfg.RetentionScheduler.Interval != time.Hour ||
		cfg.RetentionScheduler.BatchLimit != 1000 ||
		cfg.RetentionScheduler.LeaseDuration != 15*time.Minute {
		t.Fatalf("retention scheduler config = %#v, want defaults", cfg.RetentionScheduler)
	}
}

func TestLoadConfigParsesRetentionScheduler(t *testing.T) {
	env := map[string]string{
		"CLOUDGRID_RETENTION_SCHEDULER_ENABLED":          "true",
		"CLOUDGRID_RETENTION_SCHEDULER_PROJECT_IDS":      "project-a, project-b",
		"CLOUDGRID_RETENTION_SCHEDULER_INTERVAL_SECONDS": "600",
		"CLOUDGRID_RETENTION_BATCH_LIMIT":                "250",
		"CLOUDGRID_RETENTION_LEASE_SECONDS":              "1200",
	}
	cfg, err := loadConfig(func(key string) string { return env[key] })
	if err != nil {
		t.Fatalf("loadConfig returned error: %v", err)
	}
	if !cfg.RetentionScheduler.Enabled ||
		cfg.RetentionScheduler.Interval != 10*time.Minute ||
		cfg.RetentionScheduler.BatchLimit != 250 ||
		cfg.RetentionScheduler.LeaseDuration != 20*time.Minute {
		t.Fatalf("retention scheduler config = %#v", cfg.RetentionScheduler)
	}
	if len(cfg.RetentionScheduler.ProjectIDs) != 2 ||
		cfg.RetentionScheduler.ProjectIDs[0] != "project-a" ||
		cfg.RetentionScheduler.ProjectIDs[1] != "project-b" {
		t.Fatalf("project ids = %#v", cfg.RetentionScheduler.ProjectIDs)
	}
}

func TestLoadConfigRejectsInvalidRetentionSchedulerConfig(t *testing.T) {
	tests := []map[string]string{
		{"CLOUDGRID_RETENTION_SCHEDULER_ENABLED": "maybe"},
		{"CLOUDGRID_RETENTION_SCHEDULER_INTERVAL_SECONDS": "299"},
		{"CLOUDGRID_RETENTION_BATCH_LIMIT": "0"},
		{"CLOUDGRID_RETENTION_LEASE_SECONDS": "59"},
		{"CLOUDGRID_RETENTION_SCHEDULER_ENABLED": "true"},
	}

	for _, env := range tests {
		if _, err := loadConfig(func(key string) string { return env[key] }); err == nil {
			t.Fatalf("loadConfig(%#v) returned nil error", env)
		}
	}
}
