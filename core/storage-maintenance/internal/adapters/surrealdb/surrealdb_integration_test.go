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
		Namespace: fmt.Sprintf("cg_tenant_tenant_%d", time.Now().UnixNano()),
		Database:  fmt.Sprintf("project_project_%d", time.Now().UnixNano()),
		TenantID:  fmt.Sprintf("tenant_%d", time.Now().UnixNano()),
		CompanyID: fmt.Sprintf("company_%d", time.Now().UnixNano()),
		ProjectID: fmt.Sprintf("project_%d", time.Now().UnixNano()),
	}
	telemetry.Namespace = "cg_tenant_" + telemetry.TenantID
	telemetry.Database = "project_" + telemetry.ProjectID
	if err := client.execInTarget(ctx, ControlTarget{Namespace: telemetry.Namespace, Database: telemetry.Database}, testTelemetrySchemaSQL(), nil); err != nil {
		t.Fatalf("telemetry schema error = %v", err)
	}
	if err := seedRetentionIntegration(ctx, client, control, telemetry, now); err != nil {
		t.Fatalf("seed error = %v", err)
	}

	store := NewStore(client, control)
	executor := retention.NewExecutor(store, slog.New(slog.NewTextHandler(os.Stderr, nil)), func() time.Time { return now })
	result, err := executor.ExecuteBatch(ctx, contracts.RetentionExecuteBatchRequest{
		ProjectID:   telemetry.ProjectID,
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
	audits, err := client.queryRowsInTarget(ctx, control, "SELECT * FROM retention_audit WHERE projectId = $projectId;", map[string]any{"projectId": telemetry.ProjectID})
	if err != nil {
		t.Fatalf("query audit error = %v", err)
	}
	if len(audits) != 1 {
		t.Fatalf("audits = %#v, want one audit row", audits)
	}
}

func TestSurrealDBRetentionAdapterHardDeletesEveryExecutableDataClass(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	for _, dataClass := range []contracts.RetentionDataClass{
		contracts.RetentionDataClassTraces,
		contracts.RetentionDataClassLogs,
		contracts.RetentionDataClassMetrics,
		contracts.RetentionDataClassAIEvals,
		contracts.RetentionDataClassDatasets,
		contracts.RetentionDataClassScorers,
		contracts.RetentionDataClassIngestCredentialAudit,
	} {
		t.Run(string(dataClass), func(t *testing.T) {
			ctx, client, control, telemetry, executor := newRetentionIntegrationFixture(t, now, []map[string]any{
				retentionRule(dataClass, contracts.RetentionModeDelete, 30, nil, 1, now),
			})
			seedHardDeleteClass(t, ctx, client, telemetry, dataClass, now)
			if dataClass == contracts.RetentionDataClassLogs {
				assertRows(t, ctx, client, ControlTarget{Namespace: telemetry.Namespace, Database: telemetry.Database}, "log_event", "projectId = $projectId AND timestamp < $cutoff AND deletedAt = NONE", map[string]any{
					"projectId": telemetry.ProjectID,
					"cutoff":    now.AddDate(0, 0, -30),
				}, 1)
			}

			result, err := executor.ExecuteBatch(ctx, contracts.RetentionExecuteBatchRequest{
				ProjectID:   telemetry.ProjectID,
				DataClass:   dataClass,
				RequestedAt: now,
			})
			if err != nil {
				t.Fatalf("ExecuteBatch() error = %v", err)
			}
			if result.Error != nil {
				t.Fatalf("ExecuteBatch result error = %#v", result.Error)
			}
			if result.MatchedCount == 0 || result.HardDeletedCount == 0 {
				t.Fatalf("result = %#v, want hard-delete work for %s", result, dataClass)
			}
			assertHardDeleteClassState(t, ctx, client, telemetry, dataClass)
			assertRows(t, ctx, client, control, "retention_audit", "projectId = $projectId AND dataClass = $dataClass", map[string]any{
				"projectId": telemetry.ProjectID,
				"dataClass": string(dataClass),
			}, 1)
		})
	}
}

func TestSurrealDBRetentionAdapterSoftDeleteFinalDeleteDryRunAndAudit(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	softDays := 7
	ctx, client, control, telemetry, executor := newRetentionIntegrationFixture(t, now, []map[string]any{
		retentionRule(contracts.RetentionDataClassLogs, contracts.RetentionModeSoftDeleteThenDelete, 30, &softDays, 2, now),
	})
	target := ControlTarget{Namespace: telemetry.Namespace, Database: telemetry.Database}
	old := now.AddDate(0, 0, -45)
	newer := now.AddDate(0, 0, -5)
	due := now.AddDate(0, 0, -1)
	future := now.AddDate(0, 0, 1)
	if err := client.execInTarget(ctx, target, `
CREATE log_event:dry_old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'dry-old', timestamp: $old };
CREATE log_event:soft_old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'soft-old', timestamp: $old };
CREATE log_event:new_log CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'new-log', timestamp: $newer };
CREATE log_event:due_soft CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'due-soft', timestamp: $old, deletedAt: $old, deletedByRetentionPolicyId: 'policy-old', finalDeleteAfter: $due };
CREATE log_event:future_soft CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'future-soft', timestamp: $old, deletedAt: $old, deletedByRetentionPolicyId: 'policy-old', finalDeleteAfter: $future };
`, map[string]any{
		"tenantId":  telemetry.TenantID,
		"companyId": telemetry.CompanyID,
		"projectId": telemetry.ProjectID,
		"old":       old,
		"newer":     newer,
		"due":       due,
		"future":    future,
	}); err != nil {
		t.Fatalf("seed soft-delete rows error = %v", err)
	}

	dryRun := true
	dryResult, err := executor.ExecuteBatch(ctx, contracts.RetentionExecuteBatchRequest{
		ProjectID:   telemetry.ProjectID,
		DataClass:   contracts.RetentionDataClassLogs,
		RequestedAt: now,
		DryRun:      &dryRun,
	})
	if err != nil {
		t.Fatalf("dry-run ExecuteBatch() error = %v", err)
	}
	if dryResult.Error != nil || dryResult.MatchedCount != 3 || dryResult.HardDeletedCount != 0 || dryResult.SoftDeletedCount != 0 || dryResult.FinalDeletedCount != 0 {
		t.Fatalf("dry-run result = %#v, want three matches and no mutations", dryResult)
	}
	assertRows(t, ctx, client, target, "log_event", "logEventId = 'dry-old' AND deletedAt = NONE", nil, 1)
	assertRows(t, ctx, client, target, "log_event", "logEventId = 'due-soft'", nil, 1)

	actualResult, err := executor.ExecuteBatch(ctx, contracts.RetentionExecuteBatchRequest{
		ProjectID:   telemetry.ProjectID,
		DataClass:   contracts.RetentionDataClassLogs,
		RequestedAt: now,
	})
	if err != nil {
		t.Fatalf("actual ExecuteBatch() error = %v", err)
	}
	if actualResult.Error != nil || actualResult.MatchedCount != 3 || actualResult.SoftDeletedCount != 2 || actualResult.FinalDeletedCount != 1 {
		t.Fatalf("actual result = %#v, want due final delete and two soft deletes", actualResult)
	}
	assertRows(t, ctx, client, target, "log_event", "logEventId = 'due-soft'", nil, 0)
	assertRows(t, ctx, client, target, "log_event", "logEventId IN ['dry-old', 'soft-old'] AND deletedAt != NONE", nil, 2)
	assertRows(t, ctx, client, target, "log_event", "logEventId IN ['dry-old', 'soft-old'] AND deletedAt = NONE", nil, 0)
	assertRows(t, ctx, client, target, "log_event", "logEventId IN ['new-log', 'future-soft']", nil, 2)
	assertRows(t, ctx, client, control, "retention_audit", "projectId = $projectId AND dataClass = 'LOGS'", map[string]any{"projectId": telemetry.ProjectID}, 2)
}

func TestSurrealDBRetentionLeaseContentionAndReacquire(t *testing.T) {
	now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
	ctx, _, _, _, _ := newRetentionIntegrationFixture(t, now, []map[string]any{
		retentionRule(contracts.RetentionDataClassLogs, contracts.RetentionModeRetain, 0, nil, 1, now),
	})
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
	t.Cleanup(func() {
		_ = client.Close(ctx)
	})
	if err := Initialize(ctx, client); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	store := NewStore(client, control)
	key := retention.RetentionLeaseKey("project_a", contracts.RetentionDataClassLogs)
	acquired, err := store.AcquireRetentionLease(ctx, retention.RetentionLease{
		Key:        key,
		ProjectID:  "project_a",
		DataClass:  contracts.RetentionDataClassLogs,
		OwnerID:    "worker-a",
		AcquiredAt: now,
		ExpiresAt:  now.Add(10 * time.Minute),
	})
	if err != nil || !acquired {
		t.Fatalf("initial AcquireRetentionLease = %t, %v; want true nil", acquired, err)
	}
	contended, err := store.AcquireRetentionLease(ctx, retention.RetentionLease{
		Key:        key,
		ProjectID:  "project_a",
		DataClass:  contracts.RetentionDataClassLogs,
		OwnerID:    "worker-b",
		AcquiredAt: now.Add(time.Minute),
		ExpiresAt:  now.Add(11 * time.Minute),
	})
	if err != nil {
		t.Fatalf("contended AcquireRetentionLease error = %v", err)
	}
	if contended {
		t.Fatal("contended lease was acquired before expiry")
	}
	reacquired, err := store.AcquireRetentionLease(ctx, retention.RetentionLease{
		Key:        key,
		ProjectID:  "project_a",
		DataClass:  contracts.RetentionDataClassLogs,
		OwnerID:    "worker-b",
		AcquiredAt: now.Add(11 * time.Minute),
		ExpiresAt:  now.Add(21 * time.Minute),
	})
	if err != nil || !reacquired {
		t.Fatalf("expired AcquireRetentionLease = %t, %v; want true nil", reacquired, err)
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
DEFINE TABLE IF NOT EXISTS trace SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON trace TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON trace TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON trace TYPE string;
DEFINE FIELD IF NOT EXISTS traceId ON trace TYPE string;
DEFINE FIELD IF NOT EXISTS startedAt ON trace TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS endedAt ON trace TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedAt ON trace TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON trace TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON trace TYPE option<datetime>;
DEFINE TABLE IF NOT EXISTS span SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON span TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON span TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON span TYPE string;
DEFINE FIELD IF NOT EXISTS traceId ON span TYPE string;
DEFINE FIELD IF NOT EXISTS spanId ON span TYPE string;
DEFINE FIELD IF NOT EXISTS startedAt ON span TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS endedAt ON span TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedAt ON span TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON span TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON span TYPE option<datetime>;
DEFINE TABLE IF NOT EXISTS log_event SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS logEventId ON log_event TYPE string;
DEFINE FIELD IF NOT EXISTS traceId ON log_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS timestamp ON log_event TYPE datetime;
DEFINE FIELD IF NOT EXISTS deletedAt ON log_event TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON log_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON log_event TYPE option<datetime>;
DEFINE TABLE IF NOT EXISTS metric_point SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON metric_point TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON metric_point TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON metric_point TYPE string;
DEFINE FIELD IF NOT EXISTS metricName ON metric_point TYPE string;
DEFINE FIELD IF NOT EXISTS timestamp ON metric_point TYPE datetime;
DEFINE FIELD IF NOT EXISTS deletedAt ON metric_point TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON metric_point TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON metric_point TYPE option<datetime>;
DEFINE TABLE IF NOT EXISTS metric_ingest_cardinality SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON metric_ingest_cardinality TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON metric_ingest_cardinality TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON metric_ingest_cardinality TYPE string;
DEFINE FIELD IF NOT EXISTS metricName ON metric_ingest_cardinality TYPE string;
DEFINE FIELD IF NOT EXISTS windowStart ON metric_ingest_cardinality TYPE datetime;
DEFINE FIELD IF NOT EXISTS deletedAt ON metric_ingest_cardinality TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON metric_ingest_cardinality TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON metric_ingest_cardinality TYPE option<datetime>;
DEFINE TABLE IF NOT EXISTS metric_descriptor SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON metric_descriptor TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON metric_descriptor TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON metric_descriptor TYPE string;
DEFINE FIELD IF NOT EXISTS metricName ON metric_descriptor TYPE string;
DEFINE FIELD IF NOT EXISTS lastSeenAt ON metric_descriptor TYPE datetime;
DEFINE FIELD IF NOT EXISTS deletedAt ON metric_descriptor TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON metric_descriptor TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON metric_descriptor TYPE option<datetime>;
` + testAITelemetrySchemaSQL() + `
DEFINE TABLE IF NOT EXISTS ingest_command SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON ingest_command TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON ingest_command TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON ingest_command TYPE string;
DEFINE FIELD IF NOT EXISTS commandId ON ingest_command TYPE string;
DEFINE FIELD IF NOT EXISTS completedAt ON ingest_command TYPE datetime;
DEFINE FIELD IF NOT EXISTS deletedAt ON ingest_command TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON ingest_command TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON ingest_command TYPE option<datetime>;`
}

func testAITelemetrySchemaSQL() string {
	sql := ""
	for _, table := range []string{
		"ai_agent_run",
		"ai_llm_call",
		"ai_tool_call",
		"ai_retrieval_event",
		"ai_eval_result",
		"ai_experiment",
		"ai_experiment_run",
		"ai_dataset_item_run",
		"ai_prompt_version",
		"ai_annotation_queue_item",
		"ai_dataset",
		"ai_dataset_item",
		"ai_scorer",
	} {
		sql += fmt.Sprintf(`
DEFINE TABLE IF NOT EXISTS %s SCHEMAFULL TYPE NORMAL;
DEFINE FIELD IF NOT EXISTS tenantId ON %s TYPE string;
DEFINE FIELD IF NOT EXISTS companyId ON %s TYPE string;
DEFINE FIELD IF NOT EXISTS projectId ON %s TYPE string;
DEFINE FIELD IF NOT EXISTS endedAt ON %s TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS producedAt ON %s TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS persistedAt ON %s TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS createdAt ON %s TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS updatedAt ON %s TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedAt ON %s TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS deletedByRetentionPolicyId ON %s TYPE option<string>;
DEFINE FIELD IF NOT EXISTS finalDeleteAfter ON %s TYPE option<datetime>;`, table, table, table, table, table, table, table, table, table, table, table, table)
	}
	return sql
}

func seedRetentionIntegration(ctx context.Context, client *Client, control ControlTarget, target TelemetryTarget, now time.Time) error {
	if err := client.execInTarget(ctx, control, `
CREATE type::record('project', $projectId) CONTENT { organizationId: $companyId, tenantId: $tenantId, name: 'Project A' };
CREATE type::record('retention_policy', $projectId) CONTENT {
	projectId: $projectId,
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
};`, map[string]any{"now": now, "projectId": target.ProjectID, "tenantId": target.TenantID, "companyId": target.CompanyID}); err != nil {
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

func newRetentionIntegrationFixture(t *testing.T, now time.Time, rules []map[string]any) (context.Context, *Client, ControlTarget, TelemetryTarget, *retention.Executor) {
	t.Helper()
	if os.Getenv("CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS") != "true" {
		t.Skip("set CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true to run SurrealDB retention adapter integration tests")
	}
	ctx := context.Background()
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
	t.Cleanup(func() {
		_ = client.Close(ctx)
	})
	if err := Initialize(ctx, client); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if err := client.execInTarget(ctx, control, testControlSchemaSQL(), nil); err != nil {
		t.Fatalf("control schema error = %v", err)
	}
	telemetry := TelemetryTarget{
		Namespace: fmt.Sprintf("cg_tenant_tenant_%d", time.Now().UnixNano()),
		Database:  fmt.Sprintf("project_project_%d", time.Now().UnixNano()),
		TenantID:  fmt.Sprintf("tenant_%d", time.Now().UnixNano()),
		CompanyID: fmt.Sprintf("company_%d", time.Now().UnixNano()),
		ProjectID: fmt.Sprintf("project_%d", time.Now().UnixNano()),
	}
	telemetry.Namespace = "cg_tenant_" + telemetry.TenantID
	telemetry.Database = "project_" + telemetry.ProjectID
	if err := client.execInTarget(ctx, ControlTarget{Namespace: telemetry.Namespace, Database: telemetry.Database}, testTelemetrySchemaSQL(), nil); err != nil {
		t.Fatalf("telemetry schema error = %v", err)
	}
	if err := client.execInTarget(ctx, control, `
CREATE type::record('project', $projectId) CONTENT { organizationId: $companyId, tenantId: $tenantId, name: 'Project A' };
CREATE type::record('retention_policy', $projectId) CONTENT {
	projectId: $projectId,
	rules: $rules,
	updatedAt: $now,
	updatedByUserId: 'admin',
	version: 1
};`, map[string]any{
		"now":       now,
		"rules":     rules,
		"projectId": telemetry.ProjectID,
		"tenantId":  telemetry.TenantID,
		"companyId": telemetry.CompanyID,
	}); err != nil {
		t.Fatalf("seed control rows error = %v", err)
	}
	store := NewStore(client, control)
	resolved, err := store.resolveTelemetryTarget(ctx, telemetry.ProjectID)
	if err != nil {
		t.Fatalf("resolveTelemetryTarget() error = %v", err)
	}
	if resolved.Namespace != telemetry.Namespace || resolved.Database != telemetry.Database || resolved.TenantID != telemetry.TenantID || resolved.CompanyID != telemetry.CompanyID || resolved.ProjectID != telemetry.ProjectID {
		t.Fatalf("resolved telemetry target = %#v, want %#v", resolved, telemetry)
	}
	executor := retention.NewExecutor(store, slog.New(slog.NewTextHandler(os.Stderr, nil)), func() time.Time { return now })
	return ctx, client, control, telemetry, executor
}

func retentionRule(dataClass contracts.RetentionDataClass, mode contracts.RetentionMode, retentionDays int, softDeleteDays *int, version int, now time.Time) map[string]any {
	rule := map[string]any{
		"dataClass":       string(dataClass),
		"mode":            string(mode),
		"updatedAt":       now,
		"updatedByUserId": "admin",
		"version":         version,
	}
	if mode != contracts.RetentionModeRetain {
		rule["retentionDays"] = retentionDays
	}
	if softDeleteDays != nil {
		rule["softDeleteDays"] = *softDeleteDays
	}
	return rule
}

func seedHardDeleteClass(t *testing.T, ctx context.Context, client *Client, target TelemetryTarget, dataClass contracts.RetentionDataClass, now time.Time) {
	t.Helper()
	db := ControlTarget{Namespace: target.Namespace, Database: target.Database}
	old := now.AddDate(0, 0, -45)
	newer := now.AddDate(0, 0, -5)
	params := map[string]any{
		"tenantId":  target.TenantID,
		"companyId": target.CompanyID,
		"projectId": target.ProjectID,
		"old":       old,
		"newer":     newer,
	}
	var sql string
	switch dataClass {
	case contracts.RetentionDataClassTraces:
		sql = `
CREATE trace:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, traceId: 'trace-old', startedAt: $old, endedAt: $old };
CREATE span:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, traceId: 'trace-old', spanId: 'span-old', startedAt: $old, endedAt: $old };
CREATE log_event:trace_old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, traceId: 'trace-old', logEventId: 'trace-log-old', timestamp: $old };
CREATE trace:new CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, traceId: 'trace-new', startedAt: $newer, endedAt: $newer };
CREATE trace:cross CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', traceId: 'trace-cross', startedAt: $old, endedAt: $old };`
	case contracts.RetentionDataClassLogs:
		sql = `
CREATE log_event:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'log-old', timestamp: $old };
CREATE log_event:new CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, logEventId: 'log-new', timestamp: $newer };
CREATE log_event:cross CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', logEventId: 'log-cross', timestamp: $old };`
	case contracts.RetentionDataClassMetrics:
		sql = `
CREATE metric_point:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, metricName: 'metric-old', timestamp: $old };
CREATE metric_point:new CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, metricName: 'metric-new', timestamp: $newer };
CREATE metric_point:cross CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', metricName: 'metric-cross', timestamp: $old };
CREATE metric_ingest_cardinality:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, metricName: 'metric-old', windowStart: $old };
CREATE metric_ingest_cardinality:new CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, metricName: 'metric-new', windowStart: $newer };
CREATE metric_ingest_cardinality:cross CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', metricName: 'metric-cross', windowStart: $old };
CREATE metric_descriptor:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, metricName: 'metric-old', lastSeenAt: $old };
CREATE metric_descriptor:new CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, metricName: 'metric-new', lastSeenAt: $newer };
CREATE metric_descriptor:cross CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', metricName: 'metric-cross', lastSeenAt: $old };`
	case contracts.RetentionDataClassAIEvals:
		sql = aiClassSeedSQL([]string{"ai_llm_call", "ai_tool_call", "ai_retrieval_event", "ai_dataset_item_run", "ai_eval_result", "ai_annotation_queue_item", "ai_prompt_version", "ai_experiment_run", "ai_experiment", "ai_agent_run"})
	case contracts.RetentionDataClassDatasets:
		sql = aiClassSeedSQL([]string{"ai_dataset_item", "ai_dataset"})
	case contracts.RetentionDataClassScorers:
		sql = aiClassSeedSQL([]string{"ai_scorer"})
	case contracts.RetentionDataClassIngestCredentialAudit:
		sql = `
CREATE ingest_command:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, commandId: 'ingest-old', completedAt: $old };
CREATE ingest_command:new CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, commandId: 'ingest-new', completedAt: $newer };
CREATE ingest_command:cross CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', commandId: 'ingest-cross', completedAt: $old };`
	default:
		t.Fatalf("unsupported data class %s", dataClass)
	}
	if err := client.execInTarget(ctx, db, sql, params); err != nil {
		t.Fatalf("seed %s rows error = %v", dataClass, err)
	}
}

func aiClassSeedSQL(tables []string) string {
	sql := ""
	for _, table := range tables {
		sql += fmt.Sprintf(`
CREATE %s:old CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, endedAt: $old, producedAt: $old, persistedAt: $old, createdAt: $old, updatedAt: $old };
CREATE %s:new CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: $projectId, endedAt: $newer, producedAt: $newer, persistedAt: $newer, createdAt: $newer, updatedAt: $newer };
CREATE %s:cross CONTENT { tenantId: $tenantId, companyId: $companyId, projectId: 'project_b', endedAt: $old, producedAt: $old, persistedAt: $old, createdAt: $old, updatedAt: $old };`, table, table, table)
	}
	return sql
}

func assertHardDeleteClassState(t *testing.T, ctx context.Context, client *Client, target TelemetryTarget, dataClass contracts.RetentionDataClass) {
	t.Helper()
	db := ControlTarget{Namespace: target.Namespace, Database: target.Database}
	switch dataClass {
	case contracts.RetentionDataClassTraces:
		assertRows(t, ctx, client, db, "trace", "traceId = 'trace-old'", nil, 0)
		assertRows(t, ctx, client, db, "span", "spanId = 'span-old'", nil, 0)
		assertRows(t, ctx, client, db, "log_event", "logEventId = 'trace-log-old'", nil, 0)
		assertRows(t, ctx, client, db, "trace", "traceId = 'trace-new'", nil, 1)
		assertRows(t, ctx, client, db, "trace", "traceId = 'trace-cross' AND projectId = 'project_b'", nil, 1)
	case contracts.RetentionDataClassLogs:
		assertRows(t, ctx, client, db, "log_event", "logEventId = 'log-old'", nil, 0)
		assertRows(t, ctx, client, db, "log_event", "logEventId IN ['log-new', 'log-cross']", nil, 2)
	case contracts.RetentionDataClassMetrics:
		for _, table := range []string{"metric_point", "metric_ingest_cardinality", "metric_descriptor"} {
			assertRows(t, ctx, client, db, table, "metricName = 'metric-old'", nil, 0)
			assertRows(t, ctx, client, db, table, "metricName IN ['metric-new', 'metric-cross']", nil, 2)
		}
	case contracts.RetentionDataClassAIEvals:
		assertAIClassState(t, ctx, client, db, target.ProjectID, []string{"ai_llm_call", "ai_tool_call", "ai_retrieval_event", "ai_dataset_item_run", "ai_eval_result", "ai_annotation_queue_item", "ai_prompt_version", "ai_experiment_run", "ai_experiment", "ai_agent_run"})
	case contracts.RetentionDataClassDatasets:
		assertAIClassState(t, ctx, client, db, target.ProjectID, []string{"ai_dataset_item", "ai_dataset"})
	case contracts.RetentionDataClassScorers:
		assertAIClassState(t, ctx, client, db, target.ProjectID, []string{"ai_scorer"})
	case contracts.RetentionDataClassIngestCredentialAudit:
		assertRows(t, ctx, client, db, "ingest_command", "commandId = 'ingest-old'", nil, 0)
		assertRows(t, ctx, client, db, "ingest_command", "commandId IN ['ingest-new', 'ingest-cross']", nil, 2)
	default:
		t.Fatalf("unsupported data class %s", dataClass)
	}
}

func assertAIClassState(t *testing.T, ctx context.Context, client *Client, db ControlTarget, projectID string, tables []string) {
	t.Helper()
	for _, table := range tables {
		assertRows(t, ctx, client, db, table, fmt.Sprintf("id = type::record('%s', 'old')", table), nil, 0)
		assertRows(t, ctx, client, db, table, "projectId IN [$projectId, 'project_b']", map[string]any{"projectId": projectID}, 2)
	}
}

func assertRows(t *testing.T, ctx context.Context, client *Client, target ControlTarget, table string, condition string, params map[string]any, want int) {
	t.Helper()
	if params == nil {
		params = map[string]any{}
	}
	rows, err := client.queryRowsInTarget(ctx, target, fmt.Sprintf("SELECT id FROM %s WHERE %s;", table, condition), params)
	if err != nil {
		t.Fatalf("query %s where %s error = %v", table, condition, err)
	}
	if len(rows) != want {
		t.Fatalf("%s rows for %q = %#v, want %d", table, condition, rows, want)
	}
}

func integrationValueOrDefault(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
