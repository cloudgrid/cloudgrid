//go:build surrealdb

package surrealdb

import (
	"strings"
	"testing"
)

func TestCheckSchemaReadinessAcceptsRequiredTablesAndIndexes(t *testing.T) {
	if err := CheckSchemaReadiness(completeDatabaseInfo(), completeTableInfo()); err != nil {
		t.Fatalf("CheckSchemaReadiness returned error: %v", err)
	}
}

func TestCheckSchemaReadinessReportsMissingTable(t *testing.T) {
	dbInfo := completeDatabaseInfo()
	delete(dbInfo.Tables, "log_event")

	err := CheckSchemaReadiness(dbInfo, completeTableInfo())
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "log_event") {
		t.Fatalf("error = %q, want missing log_event table", err.Error())
	}
}

func TestCheckSchemaReadinessReportsMissingIndexByField(t *testing.T) {
	tableInfo := completeTableInfo()
	delete(tableInfo["trace"].Indexes, "idx_trace_serviceName")
	delete(tableInfo["trace"].Indexes, "idx_trace_tenant_company_project_service_started")

	err := CheckSchemaReadiness(completeDatabaseInfo(), tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "trace.serviceName") {
		t.Fatalf("error = %q, want missing trace.serviceName index", err.Error())
	}
}

func TestCheckSchemaReadinessReportsMissingIngestCommandTable(t *testing.T) {
	dbInfo := completeDatabaseInfo()
	delete(dbInfo.Tables, "ingest_command")

	err := CheckSchemaReadiness(dbInfo, completeTableInfo())
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "ingest_command") {
		t.Fatalf("error = %q, want missing ingest_command table", err.Error())
	}
}

func TestCheckSchemaReadinessReportsMetricIndexGaps(t *testing.T) {
	tableInfo := completeTableInfo()
	delete(tableInfo["metric_point"].Indexes, "idx_metric_point_tenant_company_project_service_timestamp")

	err := CheckSchemaReadiness(completeDatabaseInfo(), tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "metric_point.tenantId, companyId, projectId, serviceName, timestamp") {
		t.Fatalf("error = %q, want missing scoped metric service/timestamp index", err.Error())
	}
}

func TestCheckSchemaReadinessReportsMissingSoftDeleteField(t *testing.T) {
	tableInfo := completeTableInfo()
	delete(tableInfo["trace"].Fields, "deletedAt")

	err := CheckSchemaReadiness(completeDatabaseInfo(), tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "trace.deletedAt") {
		t.Fatalf("error = %q, want missing trace.deletedAt field", err.Error())
	}
}

func TestCheckSchemaReadinessSeparatesBuildingIndexes(t *testing.T) {
	tableInfo := completeTableInfo()
	tableInfo["metric_point"].Indexes["idx_metric_point_tenant_company_project_metric_timestamp"] = "DEFINE INDEX idx_metric_point_tenant_company_project_metric_timestamp ON metric_point FIELDS tenantId, companyId, projectId, metricName, timestamp BUILDING"

	report := CheckSchemaReadinessReport(completeDatabaseInfo(), tableInfo)
	if len(report.MissingIndexes) != 0 {
		t.Fatalf("missing indexes = %#v, want none for building index", report.MissingIndexes)
	}
	if len(report.BuildingIndexes) != 1 || report.BuildingIndexes[0].Table != "metric_point" || report.BuildingIndexes[0].Field != "tenantId, companyId, projectId, metricName, timestamp" {
		t.Fatalf("building indexes = %#v, want scoped metric point metric/timestamp", report.BuildingIndexes)
	}

	err := CheckSchemaReadiness(completeDatabaseInfo(), tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "still building") {
		t.Fatalf("error = %q, want building index readiness detail", err.Error())
	}
}

func completeDatabaseInfo() DatabaseInfo {
	return DatabaseInfo{Tables: map[string]string{
		"trace":                     "DEFINE TABLE trace",
		"span":                      "DEFINE TABLE span",
		"log_event":                 "DEFINE TABLE log_event",
		"metric_descriptor":         "DEFINE TABLE metric_descriptor",
		"metric_point":              "DEFINE TABLE metric_point",
		"metric_ingest_cardinality": "DEFINE TABLE metric_ingest_cardinality",
		"service":                   "DEFINE TABLE service",
		"ingest_command":            "DEFINE TABLE ingest_command",
	}}
}

func completeTableInfo() map[string]TableInfo {
	return map[string]TableInfo{
		"trace": {Fields: softDeleteFields(), Indexes: map[string]string{
			"idx_trace_startedAt":                              "DEFINE INDEX idx_trace_startedAt ON trace FIELDS startedAt",
			"idx_trace_serviceName":                            "DEFINE INDEX idx_trace_serviceName ON trace FIELDS serviceName",
			"idx_trace_status":                                 "DEFINE INDEX idx_trace_status ON trace FIELDS status",
			"idx_trace_searchText":                             "DEFINE INDEX idx_trace_searchText ON trace FIELDS searchText FULLTEXT ANALYZER cloudgrid_search BM25",
			"idx_trace_tenant_company_project_startedAt":       "DEFINE INDEX idx_trace_tenant_company_project_startedAt ON trace FIELDS tenantId, companyId, projectId, startedAt",
			"idx_trace_tenant_company_project_traceId":         "DEFINE INDEX idx_trace_tenant_company_project_traceId ON trace FIELDS tenantId, companyId, projectId, traceId",
			"idx_trace_tenant_company_project_service_started": "DEFINE INDEX idx_trace_tenant_company_project_service_started ON trace FIELDS tenantId, companyId, projectId, serviceName, startedAt",
			"idx_trace_tenant_company_project_status_started":  "DEFINE INDEX idx_trace_tenant_company_project_status_started ON trace FIELDS tenantId, companyId, projectId, status, startedAt",
		}},
		"span": {Fields: softDeleteFields(), Indexes: map[string]string{
			"idx_span_traceId":      "DEFINE INDEX idx_span_traceId ON span FIELDS traceId",
			"idx_span_parentSpanId": "DEFINE INDEX idx_span_parentSpanId ON span FIELDS parentSpanId",
			"idx_span_tenant_company_project_trace_parent_started": "DEFINE INDEX idx_span_tenant_company_project_trace_parent_started ON span FIELDS tenantId, companyId, projectId, traceId, parentSpanId, startedAt",
			"idx_span_tenant_company_project_service_trace":        "DEFINE INDEX idx_span_tenant_company_project_service_trace ON span FIELDS tenantId, companyId, projectId, serviceName, traceId",
		}},
		"log_event": {Fields: softDeleteFields(), Indexes: map[string]string{
			"idx_log_event_timestamp":                                "DEFINE INDEX idx_log_event_timestamp ON log_event FIELDS timestamp",
			"idx_log_event_serviceName":                              "DEFINE INDEX idx_log_event_serviceName ON log_event FIELDS serviceName",
			"idx_log_event_traceId":                                  "DEFINE INDEX idx_log_event_traceId ON log_event FIELDS traceId",
			"idx_log_event_spanId":                                   "DEFINE INDEX idx_log_event_spanId ON log_event FIELDS spanId",
			"idx_log_event_severityText":                             "DEFINE INDEX idx_log_event_severityText ON log_event FIELDS severityText",
			"idx_log_event_searchText":                               "DEFINE INDEX idx_log_event_searchText ON log_event FIELDS searchText FULLTEXT ANALYZER cloudgrid_search BM25",
			"idx_log_event_tenant_company_project_timestamp":         "DEFINE INDEX idx_log_event_tenant_company_project_timestamp ON log_event FIELDS tenantId, companyId, projectId, timestamp",
			"idx_log_event_tenant_company_project_service_timestamp": "DEFINE INDEX idx_log_event_tenant_company_project_service_timestamp ON log_event FIELDS tenantId, companyId, projectId, serviceName, timestamp",
			"idx_log_event_tenant_company_project_trace_timestamp":   "DEFINE INDEX idx_log_event_tenant_company_project_trace_timestamp ON log_event FIELDS tenantId, companyId, projectId, traceId, timestamp",
		}},
		"metric_descriptor": {Fields: softDeleteFields(), Indexes: map[string]string{
			"idx_metric_descriptor_metricName":                        "DEFINE INDEX idx_metric_descriptor_metricName ON metric_descriptor FIELDS metricName",
			"idx_metric_descriptor_lastSeenAt":                        "DEFINE INDEX idx_metric_descriptor_lastSeenAt ON metric_descriptor FIELDS lastSeenAt",
			"idx_metric_descriptor_searchText":                        "DEFINE INDEX idx_metric_descriptor_searchText ON metric_descriptor FIELDS searchText FULLTEXT ANALYZER cloudgrid_search BM25",
			"idx_metric_descriptor_tenant_company_project_lastSeenAt": "DEFINE INDEX idx_metric_descriptor_tenant_company_project_lastSeenAt ON metric_descriptor FIELDS tenantId, companyId, projectId, lastSeenAt",
			"idx_metric_descriptor_tenant_company_project_metricName": "DEFINE INDEX idx_metric_descriptor_tenant_company_project_metricName ON metric_descriptor FIELDS tenantId, companyId, projectId, metricName",
		}},
		"metric_point": {Fields: softDeleteFields(), Indexes: map[string]string{
			"idx_metric_point_metricName":                               "DEFINE INDEX idx_metric_point_metricName ON metric_point FIELDS metricName",
			"idx_metric_point_metricName_timestamp":                     "DEFINE INDEX idx_metric_point_metricName_timestamp ON metric_point FIELDS metricName, timestamp",
			"idx_metric_point_tenant_company_project_metric_timestamp":  "DEFINE INDEX idx_metric_point_tenant_company_project_metric_timestamp ON metric_point FIELDS tenantId, companyId, projectId, metricName, timestamp",
			"idx_metric_point_serviceName_timestamp":                    "DEFINE INDEX idx_metric_point_serviceName_timestamp ON metric_point FIELDS serviceName, timestamp",
			"idx_metric_point_tenant_company_project_service_timestamp": "DEFINE INDEX idx_metric_point_tenant_company_project_service_timestamp ON metric_point FIELDS tenantId, companyId, projectId, serviceName, timestamp",
			"idx_metric_point_timestamp":                                "DEFINE INDEX idx_metric_point_timestamp ON metric_point FIELDS timestamp",
		}},
		"metric_ingest_cardinality": {Fields: softDeleteFields(), Indexes: map[string]string{
			"idx_metric_ingest_cardinality_metricName_windowStart": "DEFINE INDEX idx_metric_ingest_cardinality_metricName_windowStart ON metric_ingest_cardinality FIELDS metricName, windowStart",
		}},
		"service":        {Indexes: map[string]string{}},
		"ingest_command": {Fields: softDeleteFields(), Indexes: map[string]string{}},
	}
}

func softDeleteFields() map[string]string {
	return map[string]string{
		"deletedAt":                  "DEFINE FIELD deletedAt ON table TYPE option<datetime>",
		"deletedByRetentionPolicyId": "DEFINE FIELD deletedByRetentionPolicyId ON table TYPE option<string>",
		"finalDeleteAfter":           "DEFINE FIELD finalDeleteAfter ON table TYPE option<datetime>",
	}
}
