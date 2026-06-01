//go:build surrealdb

package surrealdb

import (
	"fmt"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

type QueryStatement struct {
	SQL    string
	Params map[string]any
}

type RetentionQuery struct {
	SQL    string
	Params map[string]any
	Kind   retentionQueryKind
}

type retentionQueryKind string

const (
	queryKindNoop      retentionQueryKind = "noop"
	queryKindRetention retentionQueryKind = "retention"
)

type retentionPolicyRecord struct {
	ProjectID       string                `json:"projectId"`
	Rules           []retentionRuleRecord `json:"rules"`
	UpdatedAt       time.Time             `json:"updatedAt"`
	UpdatedByUserID string                `json:"updatedByUserId"`
	Version         int                   `json:"version"`
}

type retentionRuleRecord struct {
	DataClass       contracts.RetentionDataClass `json:"dataClass"`
	Mode            contracts.RetentionMode      `json:"mode"`
	RetentionDays   *int                         `json:"retentionDays"`
	SoftDeleteDays  *int                         `json:"softDeleteDays"`
	UpdatedAt       time.Time                    `json:"updatedAt"`
	UpdatedByUserID string                       `json:"updatedByUserId"`
	Version         int                          `json:"version"`
}

func BuildPolicyQuery(projectID string) QueryStatement {
	return QueryStatement{
		SQL:    "SELECT * FROM retention_policy WHERE projectId = $projectId LIMIT 1;",
		Params: map[string]any{"projectId": strings.TrimSpace(projectID)},
	}
}

func (record retentionPolicyRecord) policyFor(dataClass contracts.RetentionDataClass) (retention.RetentionPolicy, bool) {
	for _, rule := range record.Rules {
		if rule.DataClass != dataClass {
			continue
		}
		retentionDays := 0
		if rule.RetentionDays != nil {
			retentionDays = *rule.RetentionDays
		}
		updatedAt := rule.UpdatedAt
		if updatedAt.IsZero() {
			updatedAt = record.UpdatedAt
		}
		updatedBy := rule.UpdatedByUserID
		if updatedBy == "" {
			updatedBy = record.UpdatedByUserID
		}
		version := rule.Version
		if version == 0 {
			version = record.Version
		}
		return retention.RetentionPolicy{
			ProjectID:       record.ProjectID,
			DataClass:       rule.DataClass,
			Mode:            rule.Mode,
			RetentionDays:   retentionDays,
			SoftDeleteDays:  rule.SoftDeleteDays,
			Version:         version,
			PolicyID:        fmt.Sprintf("retention_policy:%s:%s:v%d", record.ProjectID, rule.DataClass, version),
			UpdatedAt:       updatedAt,
			UpdatedByUserID: updatedBy,
		}, true
	}
	return retention.RetentionPolicy{}, false
}

func BuildRetentionQueries(plan retention.RetentionExecutionPlan, target TelemetryTarget) ([]RetentionQuery, error) {
	if plan.DataClass == contracts.RetentionDataClassDashboardHistory {
		return []RetentionQuery{{Kind: queryKindNoop, SQL: "RETURN { matchedCount: 0, hardDeletedCount: 0, softDeletedCount: 0, finalDeletedCount: 0 };", Params: retentionParams(plan, target)}}, nil
	}
	spec, ok := dataClassSpecs[plan.DataClass]
	if !ok {
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: unsupported retention data class %s", plan.DataClass)
	}
	params := retentionParams(plan, target)
	if plan.Limit != nil {
		params["limit"] = *plan.Limit
	}
	switch plan.Mode {
	case contracts.RetentionModeDelete:
		if plan.DryRun {
			return []RetentionQuery{{Kind: queryKindRetention, SQL: dryRunSQL(spec), Params: params}}, nil
		}
		return []RetentionQuery{{Kind: queryKindRetention, SQL: hardDeleteSQL(spec), Params: params}}, nil
	case contracts.RetentionModeSoftDeleteThenDelete:
		params["finalDeleteAfter"] = plan.RequestedAt.AddDate(0, 0, plan.SoftDeleteDays)
		if plan.DryRun {
			return []RetentionQuery{{Kind: queryKindRetention, SQL: softDryRunSQL(spec), Params: params}}, nil
		}
		return []RetentionQuery{{Kind: queryKindRetention, SQL: softDeleteSQL(spec), Params: params}}, nil
	default:
		return nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: unsupported retention mode %s", plan.Mode)
	}
}

func BuildAcquireLeaseQuery(lease retention.RetentionLease) QueryStatement {
	return QueryStatement{
		SQL: strings.Join([]string{
			"BEGIN TRANSACTION;",
			"LET $current = SELECT * FROM retention_lease WHERE key = $key LIMIT 1;",
			"LET $acquired = IF array::len($current) = 0 OR $current[0].expiresAt <= $acquiredAt THEN",
			"UPSERT type::record('retention_lease', $leaseId) CONTENT $lease RETURN AFTER",
			"ELSE [] END;",
			"COMMIT TRANSACTION;",
			"RETURN { acquired: array::len($acquired) > 0 };",
		}, " "),
		Params: leaseParams(lease),
	}
}

func BuildCompleteLeaseQuery(lease retention.RetentionLease, result contracts.RetentionExecuteBatchData) QueryStatement {
	params := leaseParams(lease)
	params["completedAt"] = result.CompletedAt
	params["lastErrorCode"] = nil
	params["lastErrorAt"] = nil
	setClause := "lastCompletedAt = $completedAt, lastErrorCode = NONE, lastErrorAt = NONE"
	if result.Error != nil {
		params["lastErrorCode"] = result.Error.Code
		params["lastErrorAt"] = result.CompletedAt
		setClause = "lastErrorCode = $lastErrorCode, lastErrorAt = $lastErrorAt"
	}
	return QueryStatement{
		SQL:    "UPDATE retention_lease SET " + setClause + " WHERE key = $key AND ownerId = $ownerId;",
		Params: params,
	}
}

func BuildAuditQuery(audit retention.RetentionAuditRecord) QueryStatement {
	auditContent := map[string]any{
		"projectId":         audit.ProjectID,
		"dataClass":         string(audit.DataClass),
		"policyVersion":     audit.PolicyVersion,
		"dryRun":            audit.DryRun,
		"matchedCount":      audit.MatchedCount,
		"hardDeletedCount":  audit.HardDeletedCount,
		"softDeletedCount":  audit.SoftDeletedCount,
		"finalDeletedCount": audit.FinalDeletedCount,
		"startedAt":         audit.StartedAt,
		"completedAt":       audit.CompletedAt,
	}
	if audit.ErrorID != "" {
		auditContent["errorId"] = audit.ErrorID
	}
	if audit.ErrorCode != "" {
		auditContent["errorCode"] = audit.ErrorCode
	}
	return QueryStatement{
		SQL: "CREATE retention_audit CONTENT $audit;",
		Params: map[string]any{
			"audit": auditContent,
		},
	}
}

type retentionClassSpec struct {
	RootTable        string
	RootIDField      string
	EligibilityExpr  string
	OrderExpr        string
	DependentDeletes []deleteSpec
	TargetTables     []tableSpec
}

type deleteSpec struct {
	Table     string
	Filter    string
	TimeGuard string
}

type tableSpec struct {
	Table       string
	TimeExpr    string
	OrderExpr   string
	RootIDField string
}

var dataClassSpecs = map[contracts.RetentionDataClass]retentionClassSpec{
	contracts.RetentionDataClassTraces: {
		RootTable:       "trace",
		RootIDField:     "traceId",
		EligibilityExpr: "(endedAt ?? startedAt)",
		OrderExpr:       "endedAt ASC, startedAt ASC, traceId ASC",
		DependentDeletes: []deleteSpec{
			{Table: "span", Filter: "traceId IN $root"},
			{Table: "log_event", Filter: "traceId IN $root", TimeGuard: "timestamp < $cutoff"},
		},
		TargetTables: []tableSpec{{Table: "trace", TimeExpr: "(endedAt ?? startedAt)", OrderExpr: "endedAt ASC, startedAt ASC, traceId ASC", RootIDField: "traceId"}},
	},
	contracts.RetentionDataClassLogs: {
		RootTable:       "log_event",
		RootIDField:     "id",
		EligibilityExpr: "timestamp",
		OrderExpr:       "timestamp ASC, logEventId ASC",
		TargetTables:    []tableSpec{{Table: "log_event", TimeExpr: "timestamp", OrderExpr: "timestamp ASC, logEventId ASC", RootIDField: "id"}},
	},
	contracts.RetentionDataClassMetrics: {
		RootTable:       "metric_point",
		RootIDField:     "id",
		EligibilityExpr: "timestamp",
		OrderExpr:       "timestamp ASC, metricName ASC",
		TargetTables: []tableSpec{
			{Table: "metric_point", TimeExpr: "timestamp", OrderExpr: "timestamp ASC, metricName ASC", RootIDField: "id"},
			{Table: "metric_ingest_cardinality", TimeExpr: "windowStart", OrderExpr: "windowStart ASC, metricName ASC", RootIDField: "id"},
			{Table: "metric_descriptor", TimeExpr: "lastSeenAt", OrderExpr: "lastSeenAt ASC, metricName ASC", RootIDField: "id"},
		},
	},
	contracts.RetentionDataClassAIEvals: {
		RootTable:       "ai_agent_run",
		RootIDField:     "id",
		EligibilityExpr: "(endedAt ?? producedAt ?? persistedAt ?? createdAt)",
		OrderExpr:       "endedAt ASC, producedAt ASC, persistedAt ASC, createdAt ASC",
		TargetTables: aiEvalTables([]string{
			"ai_llm_call", "ai_tool_call", "ai_retrieval_event", "ai_dataset_item_run", "ai_eval_result",
			"ai_annotation_queue_item", "ai_prompt_version", "ai_experiment_run", "ai_experiment", "ai_agent_run",
		}),
	},
	contracts.RetentionDataClassDatasets: {
		RootTable:       "ai_dataset",
		RootIDField:     "id",
		EligibilityExpr: "(updatedAt ?? createdAt)",
		OrderExpr:       "updatedAt ASC, createdAt ASC",
		TargetTables: []tableSpec{
			{Table: "ai_dataset_item", TimeExpr: "(updatedAt ?? createdAt)", OrderExpr: "updatedAt ASC, createdAt ASC", RootIDField: "id"},
			{Table: "ai_dataset", TimeExpr: "(updatedAt ?? createdAt)", OrderExpr: "updatedAt ASC, createdAt ASC", RootIDField: "id"},
		},
	},
	contracts.RetentionDataClassScorers: {
		RootTable:       "ai_scorer",
		RootIDField:     "id",
		EligibilityExpr: "(updatedAt ?? createdAt)",
		OrderExpr:       "updatedAt ASC, createdAt ASC",
		TargetTables:    []tableSpec{{Table: "ai_scorer", TimeExpr: "(updatedAt ?? createdAt)", OrderExpr: "updatedAt ASC, createdAt ASC", RootIDField: "id"}},
	},
	contracts.RetentionDataClassIngestCredentialAudit: {
		RootTable:       "ingest_command",
		RootIDField:     "id",
		EligibilityExpr: "completedAt",
		OrderExpr:       "completedAt ASC, commandId ASC",
		TargetTables:    []tableSpec{{Table: "ingest_command", TimeExpr: "completedAt", OrderExpr: "completedAt ASC, commandId ASC", RootIDField: "id"}},
	},
}

func aiEvalTables(names []string) []tableSpec {
	tables := make([]tableSpec, 0, len(names))
	for _, name := range names {
		tables = append(tables, tableSpec{Table: name, TimeExpr: "(endedAt ?? producedAt ?? persistedAt ?? createdAt)", OrderExpr: "endedAt ASC, producedAt ASC, persistedAt ASC, createdAt ASC", RootIDField: "id"})
	}
	return tables
}

func hardDeleteSQL(spec retentionClassSpec) string {
	if len(spec.DependentDeletes) == 0 {
		return hardDeleteTargetTablesSQL(spec)
	}
	statements := []string{rootSelect(spec)}
	countParts := []string{}
	for index, dep := range spec.DependentDeletes {
		name := fmt.Sprintf("dep%d", index)
		statements = append(statements, fmt.Sprintf("LET $%s = DELETE %s WHERE %s AND %s%s RETURN BEFORE;", name, dep.Table, ownershipCondition(), dep.Filter, optionalTimeGuard(dep.TimeGuard)))
		countParts = append(countParts, fmt.Sprintf("array::len($%s)", name))
	}
	statements = append(statements, fmt.Sprintf("LET $rootDelete = DELETE %s WHERE %s AND %s IN $root RETURN BEFORE;", spec.RootTable, ownershipCondition(), spec.RootIDField))
	countParts = append(countParts, "array::len($rootDelete)")
	statements = append(statements, fmt.Sprintf("RETURN { matchedCount: array::len($root), hardDeletedCount: %s, softDeletedCount: 0, finalDeletedCount: 0 };", strings.Join(countParts, " + ")))
	return strings.Join(statements, " ")
}

func hardDeleteTargetTablesSQL(spec retentionClassSpec) string {
	statements := []string{}
	countParts := []string{}
	rootParts := []string{}
	for index, table := range spec.TargetTables {
		rowsName := fmt.Sprintf("rootRows%d", index)
		rootName := fmt.Sprintf("root%d", index)
		deleteName := fmt.Sprintf("delete%d", index)
		statements = append(statements,
			orderedRowsSelect(rowsName, table.Table, table.TimeExpr, table.OrderExpr),
			fmt.Sprintf("LET $%s = SELECT VALUE %s FROM $%s;", rootName, table.RootIDField, rowsName),
			fmt.Sprintf("LET $%s = DELETE %s WHERE %s AND %s IN $%s RETURN BEFORE;", deleteName, table.Table, ownershipCondition(), table.RootIDField, rootName),
		)
		rootParts = append(rootParts, fmt.Sprintf("array::len($%s)", rootName))
		countParts = append(countParts, fmt.Sprintf("array::len($%s)", deleteName))
	}
	return strings.Join(statements, " ") + fmt.Sprintf(" RETURN { matchedCount: %s, hardDeletedCount: %s, softDeletedCount: 0, finalDeletedCount: 0 };", strings.Join(rootParts, " + "), strings.Join(countParts, " + "))
}

func dryRunSQL(spec retentionClassSpec) string {
	return rootSelect(spec) + " RETURN { matchedCount: array::len($root), hardDeletedCount: 0, softDeletedCount: 0, finalDeletedCount: 0 };"
}

func softDeleteSQL(spec retentionClassSpec) string {
	statements := []string{}
	finalParts := []string{}
	softParts := []string{}
	for index, table := range spec.TargetTables {
		finalName := fmt.Sprintf("final%d", index)
		rowsName := fmt.Sprintf("rootRows%d", index)
		rootName := fmt.Sprintf("root%d", index)
		softName := fmt.Sprintf("soft%d", index)
		statements = append(statements,
			fmt.Sprintf("LET $%s = DELETE %s WHERE %s AND deletedAt != NONE AND finalDeleteAfter <= $requestedAt RETURN BEFORE;", finalName, table.Table, ownershipCondition()),
			orderedRowsSelect(rowsName, table.Table, table.TimeExpr, table.OrderExpr),
			fmt.Sprintf("LET $%s = SELECT VALUE %s FROM $%s;", rootName, table.RootIDField, rowsName),
			fmt.Sprintf("LET $%s = UPDATE %s SET deletedAt = $requestedAt, deletedByRetentionPolicyId = $policyId, finalDeleteAfter = $finalDeleteAfter WHERE %s AND %s IN $%s RETURN AFTER;", softName, table.Table, ownershipCondition(), table.RootIDField, rootName),
		)
		finalParts = append(finalParts, fmt.Sprintf("array::len($%s)", finalName))
		softParts = append(softParts, fmt.Sprintf("array::len($%s)", softName))
	}
	return strings.Join(statements, " ") + fmt.Sprintf(" RETURN { matchedCount: %s + %s, hardDeletedCount: 0, softDeletedCount: %s, finalDeletedCount: %s };", strings.Join(finalParts, " + "), strings.Join(softParts, " + "), strings.Join(softParts, " + "), strings.Join(finalParts, " + "))
}

func softDryRunSQL(spec retentionClassSpec) string {
	statements := []string{}
	finalParts := []string{}
	softParts := []string{}
	for index, table := range spec.TargetTables {
		finalName := fmt.Sprintf("final%d", index)
		rowsName := fmt.Sprintf("rootRows%d", index)
		rootName := fmt.Sprintf("root%d", index)
		statements = append(statements,
			fmt.Sprintf("LET $%s = SELECT VALUE %s FROM %s WHERE %s AND deletedAt != NONE AND finalDeleteAfter <= $requestedAt;", finalName, table.RootIDField, table.Table, ownershipCondition()),
			orderedRowsSelect(rowsName, table.Table, table.TimeExpr, table.OrderExpr),
			fmt.Sprintf("LET $%s = SELECT VALUE %s FROM $%s;", rootName, table.RootIDField, rowsName),
		)
		finalParts = append(finalParts, fmt.Sprintf("array::len($%s)", finalName))
		softParts = append(softParts, fmt.Sprintf("array::len($%s)", rootName))
	}
	return strings.Join(statements, " ") + fmt.Sprintf(" RETURN { matchedCount: %s + %s, hardDeletedCount: 0, softDeletedCount: 0, finalDeletedCount: 0 };", strings.Join(finalParts, " + "), strings.Join(softParts, " + "))
}

func rootSelect(spec retentionClassSpec) string {
	return orderedRowsSelect("rootRows", spec.RootTable, spec.EligibilityExpr, spec.OrderExpr) + fmt.Sprintf(" LET $root = SELECT VALUE %s FROM $rootRows;", spec.RootIDField)
}

func orderedRowsSelect(name string, table string, timeExpr string, orderExpr string) string {
	return fmt.Sprintf("LET $%s = SELECT * FROM %s WHERE %s AND deletedAt = NONE AND %s < $cutoff ORDER BY %s%s;", name, table, ownershipCondition(), timeExpr, orderExpr, limitClause())
}

func ownershipCondition() string {
	return "tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId"
}

func optionalTimeGuard(guard string) string {
	if guard == "" {
		return ""
	}
	return " AND " + guard
}

func limitClause() string {
	return " LIMIT $limit"
}

func retentionParams(plan retention.RetentionExecutionPlan, target TelemetryTarget) map[string]any {
	return map[string]any{
		"tenantId":    target.TenantID,
		"companyId":   target.CompanyID,
		"projectId":   plan.ProjectID,
		"cutoff":      plan.Cutoff,
		"requestedAt": plan.RequestedAt,
		"policyId":    plan.PolicyID,
		"limit":       maxBatchLimit(plan.Limit),
	}
}

func maxBatchLimit(limit *int) int {
	if limit == nil {
		return 1000
	}
	return *limit
}

func leaseParams(lease retention.RetentionLease) map[string]any {
	leaseContent := map[string]any{
		"key":        lease.Key,
		"projectId":  lease.ProjectID,
		"dataClass":  string(lease.DataClass),
		"ownerId":    lease.OwnerID,
		"acquiredAt": lease.AcquiredAt,
		"expiresAt":  lease.ExpiresAt,
	}
	if lease.LastCompletedAt != nil {
		leaseContent["lastCompletedAt"] = *lease.LastCompletedAt
	}
	if lease.LastErrorCode != "" {
		leaseContent["lastErrorCode"] = lease.LastErrorCode
	}
	if lease.LastErrorAt != nil {
		leaseContent["lastErrorAt"] = *lease.LastErrorAt
	}
	return map[string]any{
		"leaseId":       lease.Key,
		"key":           lease.Key,
		"projectId":     lease.ProjectID,
		"dataClass":     string(lease.DataClass),
		"ownerId":       lease.OwnerID,
		"acquiredAt":    lease.AcquiredAt,
		"expiresAt":     lease.ExpiresAt,
		"lastErrorCode": optionalString(lease.LastErrorCode),
		"lastErrorAt":   lease.LastErrorAt,
		"lease":         leaseContent,
	}
}

func optionalString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}
