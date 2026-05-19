//go:build surrealdb

package surrealdb

import (
	"strings"
	"testing"
)

func TestCheckSchemaReadinessAcceptsRetentionTablesAndIndexes(t *testing.T) {
	if err := CheckSchemaReadiness(completeDatabaseInfo(), completeTableInfo()); err != nil {
		t.Fatalf("CheckSchemaReadiness returned error: %v", err)
	}
}

func TestCheckSchemaReadinessReportsMissingRetentionLeaseTable(t *testing.T) {
	dbInfo := completeDatabaseInfo()
	delete(dbInfo.Tables, "retention_lease")

	err := CheckSchemaReadiness(dbInfo, completeTableInfo())
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "retention_lease") {
		t.Fatalf("error = %q, want missing retention_lease", err.Error())
	}
}

func TestCheckSchemaReadinessReportsMissingAuditIndex(t *testing.T) {
	tableInfo := completeTableInfo()
	delete(tableInfo["retention_audit"].Indexes, "retention_audit_project_dataClass_completedAt")

	err := CheckSchemaReadiness(completeDatabaseInfo(), tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "retention_audit.projectId, dataClass, completedAt") {
		t.Fatalf("error = %q, want missing audit index", err.Error())
	}
}

func completeDatabaseInfo() DatabaseInfo {
	return DatabaseInfo{Tables: map[string]string{
		"retention_lease": "DEFINE TABLE retention_lease",
		"retention_audit": "DEFINE TABLE retention_audit",
	}}
}

func completeTableInfo() map[string]TableInfo {
	return map[string]TableInfo{
		"retention_lease": {Indexes: map[string]string{
			"retention_lease_key": "DEFINE INDEX retention_lease_key ON retention_lease FIELDS key UNIQUE",
		}},
		"retention_audit": {Indexes: map[string]string{
			"retention_audit_project_completedAt":           "DEFINE INDEX retention_audit_project_completedAt ON retention_audit FIELDS projectId, completedAt",
			"retention_audit_project_dataClass_completedAt": "DEFINE INDEX retention_audit_project_dataClass_completedAt ON retention_audit FIELDS projectId, dataClass, completedAt",
		}},
	}
}
