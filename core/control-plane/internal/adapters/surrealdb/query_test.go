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
		"DEFINE TABLE organization",
		"DEFINE TABLE user",
		"DEFINE TABLE project",
		"DEFINE TABLE membership TYPE RELATION",
		"DEFINE TABLE owns_project TYPE RELATION",
		"DEFINE TABLE ingest_credential",
		"DEFINE TABLE project_status_event",
		"DEFINE TABLE dashboard SCHEMAFULL TYPE NORMAL",
		"DEFINE TABLE dashboard_pin TYPE RELATION",
		"DEFINE TABLE project_membership SCHEMAFULL TYPE NORMAL",
		"DEFINE INDEX project_membership_project_user ON project_membership FIELDS projectId, userId UNIQUE",
		"DEFINE TABLE retention_policy SCHEMAFULL TYPE NORMAL",
		"DEFINE TABLE alert_rule SCHEMAFULL TYPE NORMAL",
		"DEFINE TABLE alert_silence SCHEMAFULL TYPE NORMAL",
		"DEFINE TABLE alert_event SCHEMAFULL TYPE NORMAL",
		"DEFINE INDEX dashboard_project_visibility_owner_slug ON dashboard FIELDS projectId, visibility, ownerUserId, slug UNIQUE",
		"DEFINE INDEX dashboard_pin_user_dashboard_project ON dashboard_pin FIELDS in, out, projectId UNIQUE",
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
