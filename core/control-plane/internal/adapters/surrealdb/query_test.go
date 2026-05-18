package surrealdb

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/surrealdb/surrealdb.go/pkg/models"
)

func TestControlPlaneSchemaIncludesRequiredTablesAndRelations(t *testing.T) {
	schema := BuildSchemaStatements()
	joined := strings.Join(schema, "\n")
	for _, want := range []string{
		"DEFINE TABLE IF NOT EXISTS organization",
		"DEFINE TABLE IF NOT EXISTS user",
		"DEFINE TABLE IF NOT EXISTS project",
		"DEFINE TABLE IF NOT EXISTS membership TYPE RELATION",
		"DEFINE TABLE IF NOT EXISTS organization_invitation SCHEMAFULL TYPE NORMAL",
		"DEFINE FIELD IF NOT EXISTS deliveryStatus ON organization_invitation TYPE string",
		"DEFINE FIELD OVERWRITE projectGrants ON organization_invitation TYPE array<object>",
		"DEFINE TABLE IF NOT EXISTS email_delivery SCHEMAFULL TYPE NORMAL",
		"DEFINE INDEX IF NOT EXISTS email_delivery_due ON email_delivery FIELDS status, nextAttemptAt",
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
	info.Tables["organization_invitation"] = "DEFINE TABLE organization_invitation"
	info.Tables["email_delivery"] = "DEFINE TABLE email_delivery"
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

func TestProjectListQueryOmitsWhereClauseWhenFiltersAreBlank(t *testing.T) {
	stmt, err := BuildProjectListQuery("  ", nil)
	if err != nil {
		t.Fatalf("BuildProjectListQuery returned error: %v", err)
	}
	if strings.Contains(stmt.SQL, "WHERE") {
		t.Fatalf("SQL = %q, want no WHERE clause for blank filters", stmt.SQL)
	}
	if len(stmt.Params) != 0 {
		t.Fatalf("params = %#v, want no params for blank filters", stmt.Params)
	}
}

func TestDashboardPayloadBuildsSearchTextAndRejectsInvalidWidgetJSON(t *testing.T) {
	description := " Production "
	payload, err := dashboardPayload(ports.DashboardRecord{
		ProjectID:         "project-1",
		OrganizationID:    "org-1",
		Slug:              "latency",
		Name:              "Latency",
		Description:       &description,
		Tags:              []string{"SLO", "API"},
		Visibility:        ports.DashboardVisibilityProject,
		DefaultTimeWindow: "1h",
		Widgets:           json.RawMessage(`[{"id":"w1","kind":"metric"}]`),
		CreatedAt:         time.Unix(1, 0),
		UpdatedAt:         time.Unix(2, 0),
	})
	if err != nil {
		t.Fatalf("dashboardPayload returned error: %v", err)
	}
	if payload.SearchText != "latency latency production slo api" {
		t.Fatalf("searchText = %q, want lower-case searchable fields", payload.SearchText)
	}
	if len(payload.Widgets) != 1 || payload.Widgets[0]["id"] != "w1" {
		t.Fatalf("widgets = %#v, want decoded widget payload", payload.Widgets)
	}

	if _, err := dashboardPayload(ports.DashboardRecord{Widgets: json.RawMessage(`{"not":"an array"}`)}); err == nil {
		t.Fatalf("dashboardPayload with object widgets returned nil error, want JSON type error")
	}
}

func TestDashboardRowRecordNormalizesPublicIDAndWidgetJSON(t *testing.T) {
	description := "ops"
	created := time.Unix(1, 0)
	updated := time.Unix(2, 0)
	row := dashboardRow{
		ID:                models.RecordID{Table: "dashboard", ID: "project-1_project_latency"},
		ProjectID:         "project-1",
		OrganizationID:    "org-1",
		Slug:              "latency",
		Name:              "Latency",
		Description:       &description,
		Tags:              []string{"api"},
		Version:           3,
		Visibility:        string(ports.DashboardVisibilityProject),
		DefaultTimeWindow: "1h",
		Widgets:           []map[string]any{{"id": "w1", "kind": "metric"}},
		CreatedAt:         created,
		UpdatedAt:         updated,
	}

	record, ok, err := row.record()
	if err != nil {
		t.Fatalf("record returned error: %v", err)
	}
	if !ok {
		t.Fatalf("record ok = false, want true")
	}
	if record.ID != "dashboard:project-1_project_latency" {
		t.Fatalf("record ID = %q, want public dashboard ID", record.ID)
	}
	if string(record.Widgets) != `[{"id":"w1","kind":"metric"}]` {
		t.Fatalf("widgets = %s, want encoded widget JSON", string(record.Widgets))
	}
}

func TestSurrealDBRecordIdentifierHelpersAreDeterministic(t *testing.T) {
	description := "  description  "
	if recordKey("dashboard", " dashboard:abc ") != "abc" {
		t.Fatalf("recordKey did not trim table prefix")
	}
	if publicDashboardID("abc") != "dashboard:abc" || publicDashboardID("builtin-overview") != "builtin-overview" {
		t.Fatalf("publicDashboardID did not preserve expected public forms")
	}
	if pointerString(&description) != "description" || pointerString(nil) != "" {
		t.Fatalf("pointerString did not trim or handle nil")
	}
	if compoundID("org/1", "user:2 email") != "org_1_user_2_email" {
		t.Fatalf("compoundID did not sanitize separators")
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
