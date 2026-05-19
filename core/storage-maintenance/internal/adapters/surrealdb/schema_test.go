//go:build surrealdb

package surrealdb

import (
	"context"
	"strings"
	"testing"
)

func TestStatementsDefineRetentionLeaseAndAuditSchema(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, want := range []string{
		"DEFINE TABLE IF NOT EXISTS retention_lease SCHEMAFULL TYPE NORMAL",
		"DEFINE FIELD IF NOT EXISTS key ON retention_lease TYPE string",
		"DEFINE FIELD IF NOT EXISTS projectId ON retention_lease TYPE string",
		"DEFINE FIELD IF NOT EXISTS dataClass ON retention_lease TYPE string",
		"DEFINE FIELD IF NOT EXISTS ownerId ON retention_lease TYPE string",
		"DEFINE FIELD IF NOT EXISTS acquiredAt ON retention_lease TYPE datetime",
		"DEFINE FIELD IF NOT EXISTS expiresAt ON retention_lease TYPE datetime",
		"DEFINE FIELD IF NOT EXISTS lastCompletedAt ON retention_lease TYPE option<datetime>",
		"DEFINE FIELD IF NOT EXISTS lastErrorCode ON retention_lease TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS lastErrorAt ON retention_lease TYPE option<datetime>",
		"DEFINE INDEX IF NOT EXISTS retention_lease_key ON retention_lease FIELDS key UNIQUE",
		"DEFINE TABLE IF NOT EXISTS retention_audit SCHEMAFULL TYPE NORMAL",
		"DEFINE FIELD IF NOT EXISTS projectId ON retention_audit TYPE string",
		"DEFINE FIELD IF NOT EXISTS dataClass ON retention_audit TYPE string",
		"DEFINE FIELD IF NOT EXISTS policyVersion ON retention_audit TYPE int",
		"DEFINE FIELD IF NOT EXISTS dryRun ON retention_audit TYPE bool",
		"DEFINE FIELD IF NOT EXISTS matchedCount ON retention_audit TYPE int",
		"DEFINE FIELD IF NOT EXISTS hardDeletedCount ON retention_audit TYPE int",
		"DEFINE FIELD IF NOT EXISTS softDeletedCount ON retention_audit TYPE int",
		"DEFINE FIELD IF NOT EXISTS finalDeletedCount ON retention_audit TYPE int",
		"DEFINE FIELD IF NOT EXISTS startedAt ON retention_audit TYPE datetime",
		"DEFINE FIELD IF NOT EXISTS completedAt ON retention_audit TYPE datetime",
		"DEFINE FIELD IF NOT EXISTS errorId ON retention_audit TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS errorCode ON retention_audit TYPE option<string>",
		"DEFINE INDEX IF NOT EXISTS retention_audit_project_completedAt ON retention_audit FIELDS projectId, completedAt",
		"DEFINE INDEX IF NOT EXISTS retention_audit_project_dataClass_completedAt ON retention_audit FIELDS projectId, dataClass, completedAt",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestInitializeRunsOneSchemaQuery(t *testing.T) {
	db := &recordingDB{}

	if err := Initialize(context.Background(), db); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}
	if db.sql == "" {
		t.Fatal("Initialize() did not execute SQL")
	}
	if db.vars == nil || len(db.vars) != 0 {
		t.Fatalf("Initialize vars = %#v, want empty map", db.vars)
	}
}

type recordingDB struct {
	sql  string
	vars map[string]any
}

func (db *recordingDB) Query(_ context.Context, sql string, vars map[string]any) error {
	db.sql = sql
	db.vars = vars
	return nil
}
