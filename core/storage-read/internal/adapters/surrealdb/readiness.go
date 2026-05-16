//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"slices"
	"strings"

	sdk "github.com/surrealdb/surrealdb.go"
)

var requiredTables = []string{"trace", "span", "log_event", "service", "ingest_command"}

var requiredIndexes = map[string][]string{
	"trace":     {"startedAt", "serviceName", "status", "tenantId, projectId, startedAt", "tenantId, projectId, traceId"},
	"span":      {"traceId", "parentSpanId"},
	"log_event": {"timestamp", "serviceName", "traceId", "spanId", "severityText", "tenantId, projectId, timestamp", "tenantId, projectId, serviceName"},
}

type DatabaseInfo struct {
	Tables map[string]string `json:"tables"`
}

type TableInfo struct {
	Indexes map[string]string `json:"indexes"`
}

func CheckSchemaReadiness(dbInfo DatabaseInfo, tableInfo map[string]TableInfo) error {
	for _, table := range requiredTables {
		if _, ok := dbInfo.Tables[table]; !ok {
			return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB table %q is missing", table)
		}
	}

	for table, fields := range requiredIndexes {
		info, ok := tableInfo[table]
		if !ok {
			return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB table info for %q is missing", table)
		}
		for _, field := range fields {
			if !hasIndexForField(info.Indexes, field) {
				return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB index %s.%s is missing", table, field)
			}
		}
	}

	return nil
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

	tableInfo := make(map[string]TableInfo, len(requiredIndexes))
	for table := range requiredIndexes {
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

func hasIndexForField(indexes map[string]string, field string) bool {
	for name, definition := range indexes {
		if strings.EqualFold(name, field) || strings.Contains(name, field) {
			return true
		}
		if indexDefinitionContainsField(definition, field) {
			return true
		}
	}
	return false
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
