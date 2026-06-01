//go:build surrealdb

package surrealdb

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

type Store struct {
	client                 *Client
	controlTarget          ControlTarget
	dbAdapterTraceRecorder selfobs.SpanRecorder
}

func NewStore(client *Client, controlTarget ControlTarget) *Store {
	return &Store{client: client, controlTarget: controlTarget}
}

func (store *Store) EnableDBAdapterTracing(recorder selfobs.SpanRecorder) {
	store.dbAdapterTraceRecorder = recorder
}

func (store *Store) GetRetentionPolicy(ctx context.Context, projectID string, dataClass contracts.RetentionDataClass) (retention.RetentionPolicy, bool, error) {
	endTrace := store.startDBAdapterSpan(ctx, "storage-maintenance.db.policy_get", "policy_get", "select")
	var opErr error
	defer func() { endTrace(opErr) }()
	rows, err := store.client.queryRowsInTarget(ctx, store.controlTarget, BuildPolicyQuery(projectID).SQL, BuildPolicyQuery(projectID).Params)
	if err != nil {
		opErr = err
		return retention.RetentionPolicy{}, false, err
	}
	if len(rows) == 0 {
		return retention.RetentionPolicy{}, false, nil
	}
	var record retentionPolicyRecord
	if err := mapToStruct(rows[0], &record); err != nil {
		opErr = err
		return retention.RetentionPolicy{}, false, err
	}
	policy, ok := record.policyFor(dataClass)
	return policy, ok, nil
}

func (store *Store) ExecuteRetention(ctx context.Context, plan retention.RetentionExecutionPlan) (retention.RetentionExecutionResult, error) {
	endTrace := store.startDBAdapterSpan(ctx, "storage-maintenance.db.retention_batch", "retention_batch", "transaction")
	var opErr error
	defer func() { endTrace(opErr) }()
	target, err := store.resolveTelemetryTarget(ctx, plan.ProjectID)
	if err != nil {
		opErr = err
		return retention.RetentionExecutionResult{}, err
	}
	queries, err := BuildRetentionQueries(plan, target)
	if err != nil {
		opErr = err
		return retention.RetentionExecutionResult{}, err
	}
	result := retention.RetentionExecutionResult{}
	for _, query := range queries {
		if query.Kind == queryKindNoop {
			continue
		}
		row, err := store.client.queryTelemetry(ctx, target, query.SQL, query.Params)
		if err != nil {
			opErr = err
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
	endTrace := store.startDBAdapterSpan(ctx, "storage-maintenance.db.retention_audit", "retention_audit", "upsert")
	var opErr error
	defer func() { endTrace(opErr) }()
	stmt := BuildAuditQuery(audit)
	opErr = store.client.execInTarget(ctx, store.controlTarget, stmt.SQL, stmt.Params)
	return opErr
}

func (store *Store) AcquireRetentionLease(ctx context.Context, lease retention.RetentionLease) (bool, error) {
	endTrace := store.startDBAdapterSpan(ctx, "storage-maintenance.db.lease", "lease", "transaction")
	var opErr error
	defer func() { endTrace(opErr) }()
	stmt := BuildAcquireLeaseQuery(lease)
	row, err := store.client.queryTelemetry(ctx, TelemetryTarget{Namespace: store.controlTarget.Namespace, Database: store.controlTarget.Database}, stmt.SQL, stmt.Params)
	if err != nil {
		opErr = err
		return false, err
	}
	acquired, _ := row["acquired"].(bool)
	return acquired, nil
}

func (store *Store) CompleteRetentionLease(ctx context.Context, lease retention.RetentionLease, result contracts.RetentionExecuteBatchData) error {
	endTrace := store.startDBAdapterSpan(ctx, "storage-maintenance.db.lease", "lease", "transaction")
	var opErr error
	defer func() { endTrace(opErr) }()
	stmt := BuildCompleteLeaseQuery(lease, result)
	opErr = store.client.execInTarget(ctx, store.controlTarget, stmt.SQL, stmt.Params)
	return opErr
}

func (store *Store) resolveTelemetryTarget(ctx context.Context, projectID string) (TelemetryTarget, error) {
	endTrace := store.startDBAdapterSpan(ctx, "storage-maintenance.db.target_resolve", "target_resolve", "select")
	var opErr error
	defer func() { endTrace(opErr) }()
	stmt := QueryStatement{
		SQL:    "SELECT record::id(id) AS projectId, organizationId AS companyId, tenantId FROM project WHERE record::id(id) = $projectId OR projectId = $projectId LIMIT 1;",
		Params: map[string]any{"projectId": strings.TrimSpace(projectID)},
	}
	rows, err := store.client.queryRowsInTarget(ctx, store.controlTarget, stmt.SQL, stmt.Params)
	if err != nil {
		opErr = err
		return TelemetryTarget{}, err
	}
	if len(rows) == 0 {
		opErr = fmt.Errorf("ERR-016 FORBIDDEN: project ownership context is missing")
		return TelemetryTarget{}, opErr
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
		opErr = err
		return TelemetryTarget{}, err
	}
	if err := validateIdentifier("companyId", companyID); err != nil {
		opErr = err
		return TelemetryTarget{}, err
	}
	if err := validateIdentifier("projectId", projectID); err != nil {
		opErr = err
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

func (store *Store) startDBAdapterSpan(ctx context.Context, spanName string, operation string, statementKind string) func(error) {
	return selfobs.StartDBAdapterSpan(ctx, store.dbAdapterTraceRecorder, selfobs.DBAdapterSpanConfig{
		Enabled:       store.dbAdapterTraceRecorder != nil,
		SpanName:      spanName,
		Adapter:       "surrealdb",
		Operation:     operation,
		TargetKind:    "maintenance",
		StatementKind: statementKind,
		Attributes:    map[string]string{"db.system": "surrealdb"},
	})
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
	case int8:
		return int(typed)
	case int16:
		return int(typed)
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case uint:
		return int(typed)
	case uint8:
		return int(typed)
	case uint16:
		return int(typed)
	case uint32:
		return int(typed)
	case uint64:
		maxInt := int(^uint(0) >> 1)
		if typed > uint64(maxInt) {
			return maxInt
		}
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
