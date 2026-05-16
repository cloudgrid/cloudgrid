//go:build surrealdb

package surrealdb

import (
	"strings"
	"testing"
)

func TestCheckSchemaReadinessAcceptsRequiredTablesAndIndexes(t *testing.T) {
	dbInfo := DatabaseInfo{Tables: map[string]string{
		"trace":          "DEFINE TABLE trace",
		"span":           "DEFINE TABLE span",
		"log_event":      "DEFINE TABLE log_event",
		"service":        "DEFINE TABLE service",
		"ingest_command": "DEFINE TABLE ingest_command",
	}}
	tableInfo := map[string]TableInfo{
		"trace":     {Indexes: map[string]string{"idx_trace_startedAt": "DEFINE INDEX", "idx_trace_serviceName": "DEFINE INDEX", "idx_trace_status": "DEFINE INDEX", "idx_trace_tenant_project_startedAt": "DEFINE INDEX idx_trace_tenant_project_startedAt ON trace FIELDS tenantId, projectId, startedAt", "idx_trace_tenant_project_traceId": "DEFINE INDEX idx_trace_tenant_project_traceId ON trace FIELDS tenantId, projectId, traceId"}},
		"span":      {Indexes: map[string]string{"idx_span_traceId": "DEFINE INDEX", "idx_span_parentSpanId": "DEFINE INDEX"}},
		"log_event": {Indexes: map[string]string{"idx_log_event_timestamp": "DEFINE INDEX", "idx_log_event_serviceName": "DEFINE INDEX", "idx_log_event_traceId": "DEFINE INDEX", "idx_log_event_spanId": "DEFINE INDEX", "idx_log_event_severityText": "DEFINE INDEX", "idx_log_event_tenant_project_timestamp": "DEFINE INDEX idx_log_event_tenant_project_timestamp ON log_event FIELDS tenantId, projectId, timestamp", "idx_log_event_tenant_project_serviceName": "DEFINE INDEX idx_log_event_tenant_project_serviceName ON log_event FIELDS tenantId, projectId, serviceName"}},
		"service":   {Indexes: map[string]string{}},
	}

	if err := CheckSchemaReadiness(dbInfo, tableInfo); err != nil {
		t.Fatalf("CheckSchemaReadiness returned error: %v", err)
	}
}

func TestCheckSchemaReadinessReportsMissingTable(t *testing.T) {
	dbInfo := DatabaseInfo{Tables: map[string]string{
		"trace":          "DEFINE TABLE trace",
		"span":           "DEFINE TABLE span",
		"service":        "DEFINE TABLE service",
		"ingest_command": "DEFINE TABLE ingest_command",
	}}

	err := CheckSchemaReadiness(dbInfo, map[string]TableInfo{})
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "log_event") {
		t.Fatalf("error = %q, want missing log_event table", err.Error())
	}
}

func TestCheckSchemaReadinessReportsMissingIndexByField(t *testing.T) {
	dbInfo := DatabaseInfo{Tables: map[string]string{
		"trace":          "DEFINE TABLE trace",
		"span":           "DEFINE TABLE span",
		"log_event":      "DEFINE TABLE log_event",
		"service":        "DEFINE TABLE service",
		"ingest_command": "DEFINE TABLE ingest_command",
	}}
	tableInfo := map[string]TableInfo{
		"trace":     {Indexes: map[string]string{"idx_trace_startedAt": "DEFINE INDEX idx_trace_startedAt ON trace FIELDS startedAt", "idx_trace_status": "DEFINE INDEX idx_trace_status ON trace FIELDS status", "idx_trace_tenant_project_startedAt": "DEFINE INDEX idx_trace_tenant_project_startedAt ON trace FIELDS tenantId, projectId, startedAt", "idx_trace_tenant_project_traceId": "DEFINE INDEX idx_trace_tenant_project_traceId ON trace FIELDS tenantId, projectId, traceId"}},
		"span":      {Indexes: map[string]string{"idx_span_traceId": "DEFINE INDEX idx_span_traceId ON span FIELDS traceId", "idx_span_parentSpanId": "DEFINE INDEX idx_span_parentSpanId ON span FIELDS parentSpanId"}},
		"log_event": {Indexes: map[string]string{"idx_log_event_timestamp": "DEFINE INDEX idx_log_event_timestamp ON log_event FIELDS timestamp", "idx_log_event_serviceName": "DEFINE INDEX idx_log_event_serviceName ON log_event FIELDS serviceName", "idx_log_event_traceId": "DEFINE INDEX idx_log_event_traceId ON log_event FIELDS traceId", "idx_log_event_spanId": "DEFINE INDEX idx_log_event_spanId ON log_event FIELDS spanId", "idx_log_event_severityText": "DEFINE INDEX idx_log_event_severityText ON log_event FIELDS severityText", "idx_log_event_tenant_project_timestamp": "DEFINE INDEX idx_log_event_tenant_project_timestamp ON log_event FIELDS tenantId, projectId, timestamp", "idx_log_event_tenant_project_serviceName": "DEFINE INDEX idx_log_event_tenant_project_serviceName ON log_event FIELDS tenantId, projectId, serviceName"}},
		"service":   {Indexes: map[string]string{}},
	}

	err := CheckSchemaReadiness(dbInfo, tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "trace.serviceName") {
		t.Fatalf("error = %q, want missing trace.serviceName index", err.Error())
	}
}

func TestCheckSchemaReadinessReportsMissingIngestCommandTable(t *testing.T) {
	dbInfo := DatabaseInfo{Tables: map[string]string{
		"trace":     "DEFINE TABLE trace",
		"span":      "DEFINE TABLE span",
		"log_event": "DEFINE TABLE log_event",
		"service":   "DEFINE TABLE service",
	}}
	tableInfo := map[string]TableInfo{
		"trace":     {Indexes: map[string]string{"idx_trace_startedAt": "DEFINE INDEX", "idx_trace_serviceName": "DEFINE INDEX", "idx_trace_status": "DEFINE INDEX", "idx_trace_tenant_project_startedAt": "DEFINE INDEX idx_trace_tenant_project_startedAt ON trace FIELDS tenantId, projectId, startedAt", "idx_trace_tenant_project_traceId": "DEFINE INDEX idx_trace_tenant_project_traceId ON trace FIELDS tenantId, projectId, traceId"}},
		"span":      {Indexes: map[string]string{"idx_span_traceId": "DEFINE INDEX", "idx_span_parentSpanId": "DEFINE INDEX"}},
		"log_event": {Indexes: map[string]string{"idx_log_event_timestamp": "DEFINE INDEX", "idx_log_event_serviceName": "DEFINE INDEX", "idx_log_event_traceId": "DEFINE INDEX", "idx_log_event_spanId": "DEFINE INDEX", "idx_log_event_severityText": "DEFINE INDEX", "idx_log_event_tenant_project_timestamp": "DEFINE INDEX idx_log_event_tenant_project_timestamp ON log_event FIELDS tenantId, projectId, timestamp", "idx_log_event_tenant_project_serviceName": "DEFINE INDEX idx_log_event_tenant_project_serviceName ON log_event FIELDS tenantId, projectId, serviceName"}},
		"service":   {Indexes: map[string]string{}},
	}

	err := CheckSchemaReadiness(dbInfo, tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "ingest_command") {
		t.Fatalf("error = %q, want missing ingest_command table", err.Error())
	}
}
