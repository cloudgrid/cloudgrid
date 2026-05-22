//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"slices"
	"strings"

	sdk "github.com/surrealdb/surrealdb.go"
)

var requiredTables = []string{"trace", "span", "log_event", "metric_descriptor", "metric_point", "metric_ingest_cardinality", "service", "ingest_command"}

var requiredIndexes = map[string][]string{
	"trace":                     {"startedAt", "serviceName", "status", "searchText", "tenantId, companyId, projectId, startedAt", "tenantId, companyId, projectId, traceId", "tenantId, companyId, projectId, serviceName, startedAt", "tenantId, companyId, projectId, status, startedAt"},
	"span":                      {"traceId", "parentSpanId", "tenantId, companyId, projectId, traceId, parentSpanId, startedAt", "tenantId, companyId, projectId, serviceName, traceId"},
	"log_event":                 {"timestamp", "serviceName", "traceId", "spanId", "severityText", "searchText", "tenantId, companyId, projectId, timestamp", "tenantId, companyId, projectId, serviceName, timestamp", "tenantId, companyId, projectId, traceId, timestamp"},
	"metric_descriptor":         {"metricName", "lastSeenAt", "searchText", "tenantId, companyId, projectId, lastSeenAt", "tenantId, companyId, projectId, metricName"},
	"metric_point":              {"metricName", "metricName, timestamp", "serviceName, timestamp", "tenantId, companyId, projectId, metricName, timestamp", "tenantId, companyId, projectId, serviceName, timestamp", "timestamp"},
	"metric_ingest_cardinality": {"metricName, windowStart"},
}

var softDeleteTables = []string{"trace", "span", "log_event", "metric_descriptor", "metric_point", "metric_ingest_cardinality", "ingest_command"}

var requiredSoftDeleteFields = []string{"deletedAt", "deletedByRetentionPolicyId", "finalDeleteAfter"}

type DatabaseInfo struct {
	Tables map[string]string `json:"tables"`
}

type TableInfo struct {
	Fields  map[string]string `json:"fields"`
	Indexes map[string]string `json:"indexes"`
}

type SchemaIndexRef struct {
	Table string
	Field string
}

type SchemaReadinessReport struct {
	MissingTables   []string
	MissingFields   []SchemaFieldRef
	MissingIndexes  []SchemaIndexRef
	BuildingIndexes []SchemaIndexRef
}

type SchemaFieldRef struct {
	Table string
	Field string
}

func CheckSchemaReadiness(dbInfo DatabaseInfo, tableInfo map[string]TableInfo) error {
	report := CheckSchemaReadinessReport(dbInfo, tableInfo)
	if len(report.MissingTables) > 0 {
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB table %q is missing", report.MissingTables[0])
	}
	if len(report.MissingIndexes) > 0 {
		index := report.MissingIndexes[0]
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB index %s.%s is missing", index.Table, index.Field)
	}
	if len(report.MissingFields) > 0 {
		field := report.MissingFields[0]
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB field %s.%s is missing", field.Table, field.Field)
	}
	if len(report.BuildingIndexes) > 0 {
		index := report.BuildingIndexes[0]
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB index %s.%s is still building", index.Table, index.Field)
	}
	return nil
}

func CheckSchemaReadinessReport(dbInfo DatabaseInfo, tableInfo map[string]TableInfo) SchemaReadinessReport {
	report := SchemaReadinessReport{}
	for _, table := range requiredTables {
		if _, ok := dbInfo.Tables[table]; !ok {
			report.MissingTables = append(report.MissingTables, table)
		}
	}

	for table, fields := range requiredIndexes {
		info, ok := tableInfo[table]
		if !ok {
			for _, field := range fields {
				report.MissingIndexes = append(report.MissingIndexes, SchemaIndexRef{Table: table, Field: field})
			}
			continue
		}
		for _, field := range fields {
			status := indexStatusForField(info.Indexes, field)
			switch status {
			case schemaIndexMissing:
				report.MissingIndexes = append(report.MissingIndexes, SchemaIndexRef{Table: table, Field: field})
			case schemaIndexBuilding:
				report.BuildingIndexes = append(report.BuildingIndexes, SchemaIndexRef{Table: table, Field: field})
			}
		}
	}

	for _, table := range softDeleteTables {
		info, ok := tableInfo[table]
		if !ok {
			for _, field := range requiredSoftDeleteFields {
				report.MissingFields = append(report.MissingFields, SchemaFieldRef{Table: table, Field: field})
			}
			continue
		}
		for _, field := range requiredSoftDeleteFields {
			if _, ok := info.Fields[field]; !ok {
				report.MissingFields = append(report.MissingFields, SchemaFieldRef{Table: table, Field: field})
			}
		}
	}

	return report
}

func CheckReadiness(ctx context.Context, db *sdk.DB) error {
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return err
	}
	if err := db.Use(ctx, target.Namespace, target.Database); err != nil {
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB readiness check failed")
	}

	dbInfo, err := queryOne[DatabaseInfo](ctx, db, "INFO FOR DB;", nil)
	if err != nil {
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB readiness check failed")
	}

	tablesToInspect := map[string]bool{}
	for table := range requiredIndexes {
		tablesToInspect[table] = true
	}
	for _, table := range softDeleteTables {
		tablesToInspect[table] = true
	}
	tableInfo := make(map[string]TableInfo, len(tablesToInspect))
	for table := range tablesToInspect {
		info, err := queryOne[TableInfo](ctx, db, fmt.Sprintf("INFO FOR TABLE %s;", table), nil)
		if err != nil {
			return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: SurrealDB readiness check failed")
		}
		tableInfo[table] = info
	}

	return CheckSchemaReadiness(dbInfo, tableInfo)
}

func queryOne[T any](ctx context.Context, db *sdk.DB, sql string, vars map[string]any) (T, error) {
	var zero T
	results, err := sdk.Query[T](ctx, db, sql, vars)
	if err != nil {
		return zero, err
	}
	if results == nil || len(*results) == 0 {
		return zero, fmt.Errorf("empty SurrealDB query result")
	}
	result := (*results)[0]
	if result.Error != nil {
		return zero, result.Error
	}
	return result.Result, nil
}

type schemaIndexStatus int

const (
	schemaIndexMissing schemaIndexStatus = iota
	schemaIndexReady
	schemaIndexBuilding
)

func indexStatusForField(indexes map[string]string, field string) schemaIndexStatus {
	status := schemaIndexMissing
	for name, definition := range indexes {
		if strings.EqualFold(name, field) || strings.Contains(name, field) {
			if indexDefinitionIndicatesBuildInProgress(definition) {
				status = schemaIndexBuilding
				continue
			}
			return schemaIndexReady
		}
		if indexDefinitionContainsField(definition, field) {
			if indexDefinitionIndicatesBuildInProgress(definition) {
				status = schemaIndexBuilding
				continue
			}
			return schemaIndexReady
		}
	}
	return status
}

func indexDefinitionContainsField(definition string, field string) bool {
	normalized := strings.NewReplacer(",", " ", "(", " ", ")", " ").Replace(definition)
	parts := strings.Fields(normalized)
	if strings.Contains(field, ",") {
		required := strings.Fields(strings.NewReplacer(",", " ").Replace(field))
		return slices.ContainsFunc(required, func(requiredField string) bool {
			return !slices.ContainsFunc(parts, func(part string) bool {
				return strings.EqualFold(part, requiredField)
			})
		}) == false
	}
	return slices.ContainsFunc(parts, func(part string) bool {
		return strings.EqualFold(part, field)
	})
}

func indexDefinitionIndicatesBuildInProgress(definition string) bool {
	normalized := strings.ToLower(definition)
	return strings.Contains(normalized, "building") || strings.Contains(normalized, "indexing")
}
