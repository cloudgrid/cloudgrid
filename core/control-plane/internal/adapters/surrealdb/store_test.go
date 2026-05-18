package surrealdb

import (
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/surrealdb/surrealdb.go/pkg/models"
)

func TestRecordMapUsesSurrealFieldNamesAndOmitsRecordID(t *testing.T) {
	now := time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC)
	record := ports.IngestCredentialRecord{
		ID:            "credential-1",
		ProjectID:     "project-1",
		SecretHash:    "hash",
		CreatedAt:     now,
		CreatedByUser: "user-1",
	}

	payload, err := recordMap(record, "ID")
	if err != nil {
		t.Fatalf("recordMap returned error: %v", err)
	}
	if _, ok := payload["ID"]; ok {
		t.Fatalf("payload contains record ID: %#v", payload)
	}
	if payload["projectId"] != "project-1" {
		t.Fatalf("projectId = %#v, want project-1", payload["projectId"])
	}
	if payload["createdByUser"] != "user-1" {
		t.Fatalf("createdByUser = %#v, want user-1", payload["createdByUser"])
	}
	if _, ok := payload["disabledAt"]; ok {
		t.Fatalf("payload contains nil optional field disabledAt: %#v", payload)
	}
}

func TestStoreQueriesUseSurrealDBV3RecordFunctions(t *testing.T) {
	statements := []string{
		"SELECT * FROM type::record('user', $id)",
	}
	for _, statement := range storeQueryTemplates() {
		statements = append(statements, statement)
	}
	joined := strings.Join(statements, "\n")
	if strings.Contains(joined, "type::thing") {
		t.Fatalf("store queries use removed SurrealDB function type::thing:\n%s", joined)
	}
	if strings.Contains(joined, "id.id") || strings.Contains(joined, "in.id") || strings.Contains(joined, "out.id") {
		t.Fatalf("store queries use record property access instead of record::id:\n%s", joined)
	}
}

func storeQueryTemplates() []string {
	return []string{
		"SELECT record::id(id) AS ID, * FROM type::record('user', $id) LIMIT 1;",
		"SELECT record::id(in) AS userId, record::id(out) AS organizationId FROM membership WHERE in = type::record('user', $userId)",
		"UPSERT type::record($table, $id) CONTENT $record;",
		"DELETE type::record($table, $id);",
		"RELATE (type::record($inTable, $inId))->(type::table($relation))->(type::record($outTable, $outId)) CONTENT $record;",
	}
}

func TestRecordMapNormalizesNestedRetentionRules(t *testing.T) {
	now := time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC)
	days := 30
	record := ports.RetentionPolicyRecord{
		ProjectID: "project-1",
		Rules: []ports.RetentionRuleRecord{{
			DataClass:       contracts.RetentionDataClassTraces,
			Mode:            contracts.RetentionModeDelete,
			RetentionDays:   &days,
			UpdatedAt:       now,
			UpdatedByUserID: "user-1",
			Version:         2,
		}},
		UpdatedAt:       now,
		UpdatedByUserID: "user-1",
		Version:         2,
	}

	payload, err := recordMap(record, "ID")
	if err != nil {
		t.Fatalf("recordMap returned error: %v", err)
	}
	rules, ok := payload["rules"].([]any)
	if !ok || len(rules) != 1 {
		t.Fatalf("rules = %#v, want one normalized rule", payload["rules"])
	}
	rule, ok := rules[0].(map[string]any)
	if !ok {
		t.Fatalf("rule = %#v, want map", rules[0])
	}
	if rule["updatedByUserId"] != "user-1" {
		t.Fatalf("updatedByUserId = %#v, want user-1", rule["updatedByUserId"])
	}
}

func TestDashboardIDsUsePublicPrefixOutsideSurrealRecordKeys(t *testing.T) {
	publicID := "dashboard:default_personal_local-user_latency"
	key := "default_personal_local-user_latency"
	if got := recordKey("dashboard", publicID); got != key {
		t.Fatalf("recordKey = %q, want %q", got, key)
	}
	if got := recordKey("dashboard", "builtin-service-latency"); got != "builtin-service-latency" {
		t.Fatalf("builtin recordKey = %q, want builtin-service-latency", got)
	}
	if got := publicDashboardID(key); got != publicID {
		t.Fatalf("publicDashboardID = %q, want %q", got, publicID)
	}
	if got := publicDashboardID("builtin-service-latency"); got != "builtin-service-latency" {
		t.Fatalf("builtin publicDashboardID = %q, want builtin-service-latency", got)
	}

	row := dashboardRow{
		ID:                models.RecordID{Table: "dashboard", ID: key},
		ProjectID:         "default",
		OrganizationID:    "local-company",
		Slug:              "latency",
		Name:              "Latency",
		Tags:              []string{},
		Version:           1,
		Visibility:        string(ports.DashboardVisibilityPersonal),
		DefaultTimeWindow: "PT1H",
		Widgets:           []map[string]any{},
		CreatedAt:         time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC),
		UpdatedAt:         time.Date(2026, 5, 17, 12, 0, 0, 0, time.UTC),
	}
	record, _, err := row.record()
	if err != nil {
		t.Fatalf("dashboard row record returned error: %v", err)
	}
	if record.ID != publicID {
		t.Fatalf("dashboard record ID = %q, want %q", record.ID, publicID)
	}
}
