package surrealdb

import (
	"fmt"
	"strings"
)

var RequiredTables = []string{"organization", "user", "project", "membership", "owns_project", "ingest_credential", "dashboard", "dashboard_pin", "project_membership", "retention_policy", "project_ai_settings", "alert_rule", "alert_silence", "alert_event", "project_status_event"}

type DatabaseInfo struct {
	Tables map[string]string `json:"tables"`
}

func CheckSchemaReadiness(info DatabaseInfo) error {
	for _, table := range RequiredTables {
		if _, ok := info.Tables[table]; !ok {
			return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: required SurrealDB table %q is missing", table)
		}
	}
	return nil
}

func IsControlPlaneNamespace(namespace string, database string) bool {
	return strings.TrimSpace(namespace) == "cloudgrid_control" && strings.TrimSpace(database) == "control"
}
