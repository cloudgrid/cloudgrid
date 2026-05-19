//go:build surrealdb

package surrealdb

import (
	"context"
	"strings"
)

type SchemaQueryer interface {
	Query(ctx context.Context, sql string, vars map[string]any) error
}

func Initialize(ctx context.Context, db SchemaQueryer) error {
	return db.Query(ctx, strings.Join(Statements(), ";\n")+";", map[string]any{})
}

func Statements() []string {
	return []string{
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
	}
}
