//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

func TestSurrealDBRetentionAdapterHardDeletesProjectScopedLogs(t *testing.T) {
	if os.Getenv("CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS") != "true" {
		t.Skip("set CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true to run SurrealDB retention adapter integration tests")
	}
	ctx := context.Background()
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	control := ControlTarget{
		Namespace: fmt.Sprintf("cloudgrid_retention_test_%d", time.Now().UnixNano()),
		Database:  "control",
	}
	client, err := Connect(ctx, Config{
		URL:       integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_URL"), "http://localhost:8000/rpc"),
		Namespace: control.Namespace,
		Database:  control.Database,
		Username:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_USERNAME"), "root"),
		Password:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_PASSWORD"), "root"),
	})
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}
	defer func() {
		_ = client.Close(ctx)
	}()
	if err := Initialize(ctx, client); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if err := client.execInTarget(ctx, control, testControlSchemaSQL(), nil); err != nil {
		t.Fatalf("control schema error = %v", err)
	}
	telemetry := TelemetryTarget{
		Namespace: "cg_tenant_tenant_a",
		Database:  "project_project_a",
		TenantID:  "tenant_a",
		CompanyID: "company_a",
		ProjectID: "project_a",
	}
	if err := client.execInTarget(ctx, ControlTarget{Namespace: telemetry.Namespace, Database: telemetry.Database}, testTelemetrySchemaSQL(), nil); err != nil {
		t.Fatalf("telemetry schema error = %v", err)
	}
	if err := seedRetentionIntegration(ctx, client, control, telemetry, now); err != nil {
		t.Fatalf("seed error = %v", err)
	}

	store := NewStore(client, control)
	executor := retention.NewExecutor(store, slog.New(slog.NewTextHandler(os.Stderr, nil)), func() time.Time { return now })
	result, err := executor.ExecuteBatch(ctx, contracts.RetentionExecuteBatchRequest{
		ProjectID:   "project_a",
		DataClass:   contracts.RetentionDataClassLogs,
		RequestedAt: now,
	})
	if err != nil {
		t.Fatalf("ExecuteBatch() error = %v", err)
	}
	if result.Error != nil {
		t.Fatalf("ExecuteBatch result error = %#v", result.Error)
	}
	if result.MatchedCount != 1 || result.HardDeletedCount != 1 {
		t.Fatalf("result = %#v, want one hard-deleted log", result)
	}
	oldRows, err := client.queryRowsInTarget(ctx, ControlTarget{Namespace: telemetry.Namespace, Database: telemetry.Database}, "SELECT logEventId FROM log_event WHERE logEventId = 'old-a';", nil)
	if err != nil {
		t.Fatalf("query old log error = %v", err)
	}
	if len(oldRows) != 0 {
		t.Fatalf("old-a rows = %#v, want deleted", oldRows)
	}
	remainingRows, err := client.queryRowsInTarget(ctx, ControlTarget{Namespace: telemetry.Namespace, Database: telemetry.Database}, "SELECT logEventId FROM log_event ORDER BY logEventId ASC;", nil)
	if err != nil {
		t.Fatalf("query remaining logs error = %v", err)
	}
	if len(remainingRows) != 2 {
		t.Fatalf("remaining rows = %#v, want new-a and cross-project", remainingRows)
	}
	audits, err := client.queryRowsInTarget(ctx, control, "SELECT * FROM retention_audit WHERE projectId = 'project_a';", nil)
	if err != nil {
		t.Fatalf("query audit error = %v", err)
	}
	if len(audits) != 1 {
		t.Fatalf("audits = %#v, want one audit row", audits)
	}
}

func testControlSchemaSQL() string {
	return `
DEFINE TABLE IF NOT EXISTS project SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS organizationId ON project TYPE string;
DEFINE FIELD IF NOT EXISTS tenantId ON project TYPE string;
DEFINE FIELD IF NOT EXISTS name ON project TYPE string;
DEFINE TABLE IF NOT EXISTS retention_policy SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS projectId ON retention_policy TYPE string;
DEFINE FIELD OVERWRITE rules ON retention_policy TYPE array<object>;
DEFINE FIELD OVERWRITE rules[*] ON retention_policy TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS updatedAt ON retention_policy TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedByUserId ON retention_policy TYPE string;
DEFINE FIELD IF NOT EXISTS version ON retention_policy TYPE int;`
}

func testTelemetrySchemaSQL() string {
	return `
DEFINE TABLE IF NOT EXISTS log_event SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS logEventId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS timestamp ON log_event TYPE datetime;
DEFINE FIELD IF NOT EXISTS deletedAt ON log_event TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON log_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON log_event TYPE option<datetime>;`
}

func seedRetentionIntegration(ctx context.Context, client *Client, control ControlTarget, target TelemetryTarget, now time.Time) error {
	if err := client.execInTarget(ctx, control, `
CREATE type::record('project', 'project_a') CONTENT { organizationId: 'company_a', tenantId: 'tenant_a', name: 'Project A' };
CREATE type::record('retention_policy', 'project_a') CONTENT {
	projectId: 'project_a',
	rules: [{
		dataClass: 'LOGS',
		mode: 'delete',
		retentionDays: 30,
		updatedAt: $now,
		updatedByUserId: 'admin',
		version: 1
	}],
	updatedAt: $now,
	updatedByUserId: 'admin',
	version: 1
};`, map[string]any{"now": now}); err != nil {
		return err
	}
	return client.execInTarget(ctx, ControlTarget{Namespace: target.Namespace, Database: target.Database}, `
CREATE log_event:old_a CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'old-a', timestamp: $old };
CREATE log_event:new_a CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'new-a', timestamp: $new };
CREATE log_event:other_project CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', logEventId: 'other-project', timestamp: $old };`, map[string]any{
		"tenantId":  target.TenantID,
		"companyId": target.CompanyID,
		"projectId": target.ProjectID,
		"old":       now.AddDate(0, 0, -45),
		"new":       now.AddDate(0, 0, -5),
	})
}

func integrationValueOrDefault(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
