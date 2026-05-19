//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"slices"
	"strings"

	sdk "github.com/surrealdb/surrealdb.go"
)

var requiredTables = []string{"retention_lease", "retention_audit"}

var requiredIndexes = map[string][]string{
	"retention_lease": {"key"},
	"retention_audit": {"projectId, completedAt", "projectId, dataClass, completedAt"},
}

type DatabaseInfo struct {
	Tables map[string]string `json:"tables"`
}

type TableInfo struct {
	Indexes map[string]string `json:"indexes"`
}

type SchemaIndexRef struct {
	Table string
	Field string
}

type SchemaReadinessReport struct {
	MissingTables   []string
	MissingIndexes  []SchemaIndexRef
	BuildingIndexes []SchemaIndexRef
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
	return report
}

func CheckReadiness(ctx context.Context, db *sdk.DB, target ControlTarget) error {
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
	required := strings.Fields(strings.NewReplacer(",", " ").Replace(field))
	return slices.ContainsFunc(required, func(requiredField string) bool {
		return !slices.ContainsFunc(parts, func(part string) bool {
			return strings.EqualFold(part, requiredField)
		})
	}) == false
}

func indexDefinitionIndicatesBuildInProgress(definition string) bool {
	normalized := strings.ToLower(definition)
	return strings.Contains(normalized, "building") || strings.Contains(normalized, "indexing")
}
