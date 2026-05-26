//go:build surrealdb

package surrealdb

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	sdk "github.com/surrealdb/surrealdb.go"
)

func TestSurrealDBHotQueryPlansUseIndexes(t *testing.T) {
	if os.Getenv("CLOUDGRID_ENABLE_SURREALDB_PLAN_TESTS") != "true" {
		t.Skip("set CLOUDGRID_ENABLE_SURREALDB_PLAN_TESTS=true to run SurrealDB query plan tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := Connect(ctx, Config{
		URL:       integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_URL"), "http://localhost:8000/rpc"),
		Namespace: integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_NAMESPACE"), "cloudgrid_plan_test"),
		Database:  fmt.Sprintf("project_plan_%d", time.Now().UnixNano()),
		Username:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_USERNAME"), "root"),
		Password:  integrationValueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_PASSWORD"), "root"),
	})
	if err != nil {
		t.Fatalf("connect SurrealDB: %v", err)
	}
	defer func() {
		_ = db.Close(context.Background())
	}()
	if err := seedPlanSchema(ctx, db); err != nil {
		t.Fatalf("seed plan schema: %v", err)
	}

	tests := []struct {
		name      string
		sql       string
		params    map[string]any
		wantIndex string
	}{
		{
			name:      "trace service and startedAt",
			sql:       "SELECT traceId FROM trace WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND serviceName = $serviceName AND startedAt >= $from EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a", "serviceName": "checkout-api", "from": time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
			wantIndex: "idx_trace_tenant_company_project_service_started",
		},
		{
			name:      "trace status and startedAt",
			sql:       "SELECT traceId FROM trace WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND status = $status AND startedAt >= $from EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a", "status": "error", "from": time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
			wantIndex: "idx_trace_tenant_company_project_status_started",
		},
		{
			name:      "trace detail",
			sql:       "SELECT traceId FROM trace WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND traceId = $traceId EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a", "traceId": "trace-010"},
			wantIndex: "idx_trace_tenant_company_project_traceId",
		},
		{
			name:      "log trace timestamp",
			sql:       "SELECT logEventId FROM log_event WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND traceId = $traceId AND timestamp >= $from EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a", "traceId": "trace-010", "from": time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
			wantIndex: "idx_log_event_tenant_company_project_trace_timestamp",
		},
		{
			name:      "log service timestamp",
			sql:       "SELECT logEventId FROM log_event WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND serviceName = $serviceName AND timestamp >= $from EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a", "serviceName": "checkout-api", "from": time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
			wantIndex: "idx_log_event_tenant_company_project_service_timestamp",
		},
		{
			name:      "metric names last seen",
			sql:       "SELECT metricName, lastSeenAt FROM metric_descriptor WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId ORDER BY lastSeenAt DESC EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a"},
			wantIndex: "idx_metric_descriptor_tenant_company_project_lastSeenAt",
		},
		{
			name:      "metric series metric timestamp",
			sql:       "SELECT metricName FROM metric_point WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND metricName = $metricName AND timestamp >= $from AND timestamp <= $to EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a", "metricName": "http.server.duration", "from": time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC), "to": time.Date(2026, 5, 2, 0, 0, 0, 0, time.UTC)},
			wantIndex: "idx_metric_point_tenant_company_project_metric_timestamp",
		},
		{
			name:      "metric series service timestamp",
			sql:       "SELECT metricName FROM metric_point WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND serviceName = $serviceName AND timestamp >= $from AND timestamp <= $to EXPLAIN;",
			params:    map[string]any{"tenantId": "local", "companyId": "local", "projectId": "project-a", "serviceName": "checkout-api", "from": time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC), "to": time.Date(2026, 5, 2, 0, 0, 0, 0, time.UTC)},
			wantIndex: "idx_metric_point_tenant_company_project_service_timestamp",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			plan, err := explainPlanText(ctx, db, test.sql, test.params)
			if err != nil {
				t.Fatalf("explain failed: %v", err)
			}
			if !strings.Contains(plan, test.wantIndex) {
				t.Fatalf("plan does not mention %s:\n%s", test.wantIndex, plan)
			}
		})
	}
}

func seedPlanSchema(ctx context.Context, db *sdk.DB) error {
	statements := []string{
		"DEFINE TABLE IF NOT EXISTS trace SCHEMAFULL",
		"DEFINE FIELD IF NOT EXISTS tenantId ON trace TYPE string",
		"DEFINE FIELD IF NOT EXISTS companyId ON trace TYPE string",
		"DEFINE FIELD IF NOT EXISTS projectId ON trace TYPE string",
		"DEFINE FIELD IF NOT EXISTS traceId ON trace TYPE string",
		"DEFINE FIELD IF NOT EXISTS serviceName ON trace TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS status ON trace TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS startedAt ON trace TYPE datetime",
		"DEFINE INDEX IF NOT EXISTS idx_trace_tenant_company_project_service_started ON trace FIELDS tenantId, companyId, projectId, serviceName, startedAt",
		"DEFINE INDEX IF NOT EXISTS idx_trace_tenant_company_project_status_started ON trace FIELDS tenantId, companyId, projectId, status, startedAt",
		"DEFINE INDEX IF NOT EXISTS idx_trace_tenant_company_project_traceId ON trace FIELDS tenantId, companyId, projectId, traceId",
		"DEFINE TABLE IF NOT EXISTS log_event SCHEMAFULL",
		"DEFINE FIELD IF NOT EXISTS tenantId ON log_event TYPE string",
		"DEFINE FIELD IF NOT EXISTS companyId ON log_event TYPE string",
		"DEFINE FIELD IF NOT EXISTS projectId ON log_event TYPE string",
		"DEFINE FIELD IF NOT EXISTS logEventId ON log_event TYPE string",
		"DEFINE FIELD IF NOT EXISTS traceId ON log_event TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS serviceName ON log_event TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS timestamp ON log_event TYPE datetime",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_tenant_company_project_trace_timestamp ON log_event FIELDS tenantId, companyId, projectId, traceId, timestamp",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_tenant_company_project_service_timestamp ON log_event FIELDS tenantId, companyId, projectId, serviceName, timestamp",
		"DEFINE TABLE IF NOT EXISTS metric_descriptor SCHEMAFULL",
		"DEFINE FIELD IF NOT EXISTS tenantId ON metric_descriptor TYPE string",
		"DEFINE FIELD IF NOT EXISTS companyId ON metric_descriptor TYPE string",
		"DEFINE FIELD IF NOT EXISTS projectId ON metric_descriptor TYPE string",
		"DEFINE FIELD IF NOT EXISTS metricName ON metric_descriptor TYPE string",
		"DEFINE FIELD IF NOT EXISTS lastSeenAt ON metric_descriptor TYPE datetime",
		"DEFINE INDEX IF NOT EXISTS idx_metric_descriptor_tenant_company_project_lastSeenAt ON metric_descriptor FIELDS tenantId, companyId, projectId, lastSeenAt",
		"DEFINE TABLE IF NOT EXISTS metric_point SCHEMAFULL",
		"DEFINE FIELD IF NOT EXISTS tenantId ON metric_point TYPE string",
		"DEFINE FIELD IF NOT EXISTS companyId ON metric_point TYPE string",
		"DEFINE FIELD IF NOT EXISTS projectId ON metric_point TYPE string",
		"DEFINE FIELD IF NOT EXISTS metricName ON metric_point TYPE string",
		"DEFINE FIELD IF NOT EXISTS serviceName ON metric_point TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS timestamp ON metric_point TYPE datetime",
		"DEFINE INDEX IF NOT EXISTS idx_metric_point_tenant_company_project_metric_timestamp ON metric_point FIELDS tenantId, companyId, projectId, metricName, timestamp",
		"DEFINE INDEX IF NOT EXISTS idx_metric_point_tenant_company_project_service_timestamp ON metric_point FIELDS tenantId, companyId, projectId, serviceName, timestamp",
	}
	if err := runPlanQuery(ctx, db, strings.Join(statements, ";\n")+";", nil); err != nil {
		return err
	}
	for index := 0; index < 600; index++ {
		traceID := fmt.Sprintf("trace-%03d", index)
		timestamp := time.Date(2026, 5, 1, 0, index%60, 0, 0, time.UTC)
		if err := runPlanQuery(ctx, db, "CREATE trace CONTENT $record;", map[string]any{"record": map[string]any{
			"tenantId": "local", "companyId": "local", "projectId": "project-a", "traceId": traceID, "serviceName": "checkout-api", "status": "error", "startedAt": timestamp,
		}}); err != nil {
			return err
		}
		if err := runPlanQuery(ctx, db, "CREATE log_event CONTENT $record;", map[string]any{"record": map[string]any{
			"tenantId": "local", "companyId": "local", "projectId": "project-a", "logEventId": "log-" + traceID, "traceId": traceID, "serviceName": "checkout-api", "timestamp": timestamp,
		}}); err != nil {
			return err
		}
		if err := runPlanQuery(ctx, db, "CREATE metric_point CONTENT $record;", map[string]any{"record": map[string]any{
			"tenantId": "local", "companyId": "local", "projectId": "project-a", "metricName": "http.server.duration", "serviceName": "checkout-api", "timestamp": timestamp,
		}}); err != nil {
			return err
		}
	}
	return runPlanQuery(ctx, db, "CREATE metric_descriptor CONTENT $record;", map[string]any{"record": map[string]any{
		"tenantId": "local", "companyId": "local", "projectId": "project-a", "metricName": "http.server.duration", "lastSeenAt": time.Date(2026, 5, 2, 0, 0, 0, 0, time.UTC),
	}})
}

func explainPlanText(ctx context.Context, db *sdk.DB, sql string, vars map[string]any) (string, error) {
	results, err := sdk.Query[any](ctx, db, sql, vars)
	if err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func runPlanQuery(ctx context.Context, db *sdk.DB, sql string, vars map[string]any) error {
	results, err := sdk.Query[any](ctx, db, sql, vars)
	if err != nil {
		return err
	}
	if results == nil {
		return nil
	}
	for _, result := range *results {
		if result.Error != nil {
			return result.Error
		}
	}
	return nil
}

func integrationValueOrDefault(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
