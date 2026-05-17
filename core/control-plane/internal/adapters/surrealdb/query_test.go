package surrealdb

import (
	"strings"
	"testing"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestControlPlaneSchemaIncludesRequiredTablesAndRelations(t *testing.T) {
	schema := BuildSchemaStatements()
	joined := strings.Join(schema, "\n")
	for _, want := range []string{
		"DEFINE TABLE IF NOT EXISTS organization",
		"DEFINE TABLE IF NOT EXISTS user",
		"DEFINE TABLE IF NOT EXISTS project",
		"DEFINE TABLE IF NOT EXISTS membership TYPE RELATION",
		"DEFINE TABLE IF NOT EXISTS owns_project TYPE RELATION",
		"DEFINE TABLE IF NOT EXISTS ingest_credential",
		"DEFINE TABLE IF NOT EXISTS project_status_event",
		"DEFINE TABLE IF NOT EXISTS dashboard SCHEMAFULL TYPE NORMAL",
		"DEFINE FIELD IF NOT EXISTS widgets[*].metric ON dashboard TYPE option<object> FLEXIBLE",
		"DEFINE TABLE IF NOT EXISTS dashboard_pin TYPE RELATION",
		"DEFINE TABLE IF NOT EXISTS project_membership SCHEMAFULL TYPE NORMAL",
		"DEFINE INDEX IF NOT EXISTS project_membership_project_user ON project_membership FIELDS projectId, userId UNIQUE",
		"DEFINE TABLE IF NOT EXISTS retention_policy SCHEMAFULL TYPE NORMAL",
		"DEFINE FIELD IF NOT EXISTS rules[*].retentionDays ON retention_policy TYPE option<int>",
		"DEFINE TABLE IF NOT EXISTS project_ai_settings SCHEMAFULL TYPE NORMAL",
		"DEFINE FIELD OVERWRITE settings ON project_ai_settings TYPE object FLEXIBLE",
		"DEFINE INDEX IF NOT EXISTS project_ai_settings_project ON project_ai_settings FIELDS projectId UNIQUE",
		"DEFINE TABLE IF NOT EXISTS alert_rule SCHEMAFULL TYPE NORMAL",
		"DEFINE FIELD IF NOT EXISTS query ON alert_rule TYPE object FLEXIBLE",
		"DEFINE TABLE IF NOT EXISTS alert_silence SCHEMAFULL TYPE NORMAL",
		"DEFINE TABLE IF NOT EXISTS alert_event SCHEMAFULL TYPE NORMAL",
		"DEFINE INDEX IF NOT EXISTS dashboard_project_visibility_owner_slug ON dashboard FIELDS projectId, visibility, ownerUserId, slug UNIQUE",
		"DEFINE INDEX IF NOT EXISTS dashboard_pin_user_dashboard_project ON dashboard_pin FIELDS in, out, projectId UNIQUE",
		"PERMISSIONS NONE",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("schema missing %q in:\n%s", want, joined)
		}
	}
	staleTable := "metric" + "_view"
	if strings.Contains(joined, staleTable) {
		t.Fatalf("schema must not define stale %s table:\n%s", staleTable, joined)
	}
}

func TestControlPlaneReadinessRequiresDashboardTables(t *testing.T) {
	info := DatabaseInfo{Tables: map[string]string{
		"organization":         "DEFINE TABLE organization",
		"user":                 "DEFINE TABLE user",
		"project":              "DEFINE TABLE project",
		"membership":           "DEFINE TABLE membership",
		"owns_project":         "DEFINE TABLE owns_project",
		"ingest_credential":    "DEFINE TABLE ingest_credential",
		"project_status_event": "DEFINE TABLE project_status_event",
	}}

	if err := CheckSchemaReadiness(info); err == nil {
		t.Fatalf("CheckSchemaReadiness without dashboard tables returned nil, want missing table error")
	}

	info.Tables["dashboard"] = "DEFINE TABLE dashboard"
	info.Tables["dashboard_pin"] = "DEFINE TABLE dashboard_pin"
	info.Tables["project_membership"] = "DEFINE TABLE project_membership"
	info.Tables["retention_policy"] = "DEFINE TABLE retention_policy"
	info.Tables["project_ai_settings"] = "DEFINE TABLE project_ai_settings"
	info.Tables["alert_rule"] = "DEFINE TABLE alert_rule"
	info.Tables["alert_silence"] = "DEFINE TABLE alert_silence"
	info.Tables["alert_event"] = "DEFINE TABLE alert_event"
	if err := CheckSchemaReadiness(info); err != nil {
		t.Fatalf("CheckSchemaReadiness with dashboard tables returned error: %v", err)
	}
}

func TestProjectListQueryUsesParametersForFilters(t *testing.T) {
	status := contracts.ProjectStatusActive
	stmt, err := BuildProjectListQuery("org-1", &status)
	if err != nil {
		t.Fatalf("BuildProjectListQuery returned error: %v", err)
	}
	if !strings.Contains(stmt.SQL, "organizationId = $organizationId") || !strings.Contains(stmt.SQL, "status = $status") {
		t.Fatalf("project list SQL = %q, want parameterized filters", stmt.SQL)
	}
	if stmt.Params["organizationId"] != "org-1" || stmt.Params["status"] != string(status) {
		t.Fatalf("params = %#v, want organization/status params", stmt.Params)
	}
}

func TestControlQueriesUseSurrealDBV3RecordFunctions(t *testing.T) {
	status := contracts.ProjectStatusActive
	statements := []string{
		BuildOrganizationForUserQuery("user-1").SQL,
		BuildMembershipAdminCountQuery("org-1", "user-1").SQL,
		BuildProjectStatusSnapshotQuery("org-1", "project-1").SQL,
	}
	projectList, err := BuildProjectListQuery("org-1", &status)
	if err != nil {
		t.Fatalf("BuildProjectListQuery returned error: %v", err)
	}
	statements = append(statements, projectList.SQL)

	joined := strings.Join(statements, "\n")
	if strings.Contains(joined, "type::thing") {
		t.Fatalf("queries use removed SurrealDB function type::thing:\n%s", joined)
	}
	if !strings.Contains(joined, "type::record") {
		t.Fatalf("queries do not use SurrealDB v3 record constructor:\n%s", joined)
	}
	if strings.Contains(joined, "id.id") || strings.Contains(joined, "in.id") || strings.Contains(joined, "out.id") {
		t.Fatalf("queries use record property access instead of record::id:\n%s", joined)
	}
}
