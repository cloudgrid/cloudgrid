//go:build surrealdb

package surrealdb

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

type Store struct {
	client        *Client
	controlTarget ControlTarget
}

func NewStore(client *Client, controlTarget ControlTarget) *Store {
	return &Store{client: client, controlTarget: controlTarget}
}

func (store *Store) GetRetentionPolicy(ctx context.Context, projectID string, dataClass contracts.RetentionDataClass) (retention.RetentionPolicy, bool, error) {
	rows, err := store.client.queryRowsInTarget(ctx, store.controlTarget, BuildPolicyQuery(projectID).SQL, BuildPolicyQuery(projectID).Params)
	if err != nil {
		return retention.RetentionPolicy{}, false, err
	}
	if len(rows) == 0 {
		return retention.RetentionPolicy{}, false, nil
	}
	var record retentionPolicyRecord
	if err := mapToStruct(rows[0], &record); err != nil {
		return retention.RetentionPolicy{}, false, err
	}
	policy, ok := record.policyFor(dataClass)
	return policy, ok, nil
}

func (store *Store) ExecuteRetention(ctx context.Context, plan retention.RetentionExecutionPlan) (retention.RetentionExecutionResult, error) {
	target, err := store.resolveTelemetryTarget(ctx, plan.ProjectID)
	if err != nil {
		return retention.RetentionExecutionResult{}, err
	}
	queries, err := BuildRetentionQueries(plan, target)
	if err != nil {
		return retention.RetentionExecutionResult{}, err
	}
	result := retention.RetentionExecutionResult{}
	for _, query := range queries {
		if query.Kind == queryKindNoop {
			continue
		}
		row, err := store.client.queryTelemetry(ctx, target, query.SQL, query.Params)
		if err != nil {
			return retention.RetentionExecutionResult{}, err
		}
		result.MatchedCount += intFromAny(row["matchedCount"])
		result.HardDeletedCount += intFromAny(row["hardDeletedCount"])
		result.SoftDeletedCount += intFromAny(row["softDeletedCount"])
		result.FinalDeletedCount += intFromAny(row["finalDeletedCount"])
	}
	return result, nil
}

func (store *Store) RecordRetentionAudit(ctx context.Context, audit retention.RetentionAuditRecord) error {
	stmt := BuildAuditQuery(audit)
	return store.client.execInTarget(ctx, store.controlTarget, stmt.SQL, stmt.Params)
}

func (store *Store) AcquireRetentionLease(ctx context.Context, lease retention.RetentionLease) (bool, error) {
	stmt := BuildAcquireLeaseQuery(lease)
	row, err := store.client.queryTelemetry(ctx, TelemetryTarget{Namespace: store.controlTarget.Namespace, Database: store.controlTarget.Database}, stmt.SQL, stmt.Params)
	if err != nil {
		return false, err
	}
	acquired, _ := row["acquired"].(bool)
	return acquired, nil
}

func (store *Store) CompleteRetentionLease(ctx context.Context, lease retention.RetentionLease, result contracts.RetentionExecuteBatchData) error {
	stmt := BuildCompleteLeaseQuery(lease, result)
	return store.client.execInTarget(ctx, store.controlTarget, stmt.SQL, stmt.Params)
}

func (store *Store) resolveTelemetryTarget(ctx context.Context, projectID string) (TelemetryTarget, error) {
	stmt := QueryStatement{
		SQL:    "SELECT record::id(id) AS projectId, organizationId AS companyId, tenantId FROM project WHERE record::id(id) = $projectId OR projectId = $projectId LIMIT 1;",
		Params: map[string]any{"projectId": strings.TrimSpace(projectID)},
	}
	rows, err := store.client.queryRowsInTarget(ctx, store.controlTarget, stmt.SQL, stmt.Params)
	if err != nil {
		return TelemetryTarget{}, err
	}
	if len(rows) == 0 {
		return TelemetryTarget{}, fmt.Errorf("ERR-016 FORBIDDEN: project ownership context is missing")
	}
	companyID := stringFromAny(rows[0]["companyId"])
	tenantID := stringFromAny(rows[0]["tenantId"])
	if tenantID == "" {
		tenantID = "local"
	}
	if companyID == "" {
		companyID = tenantID
	}
	if err := validateIdentifier("tenantId", tenantID); err != nil {
		return TelemetryTarget{}, err
	}
	if err := validateIdentifier("companyId", companyID); err != nil {
		return TelemetryTarget{}, err
	}
	if err := validateIdentifier("projectId", projectID); err != nil {
		return TelemetryTarget{}, err
	}
	namespace := "cg_tenant_" + tenantID
	if tenantID == "local" {
		namespace = "cloudgrid_local"
	}
	return TelemetryTarget{
		Namespace: namespace,
		Database:  "project_" + projectID,
		TenantID:  tenantID,
		CompanyID: companyID,
		ProjectID: projectID,
	}, nil
}

func mapToStruct(input map[string]any, output any) error {
	data, err := json.Marshal(input)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, output)
}

func intFromAny(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) {
			return 0
		}
		return int(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return int(parsed)
	default:
		return 0
	}
}

func stringFromAny(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return ""
	}
}

func validateIdentifier(name string, value string) error {
	if value == "" {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: %s is required", name)
	}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			continue
		}
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: %s contains unsupported characters", name)
	}
	return nil
}
