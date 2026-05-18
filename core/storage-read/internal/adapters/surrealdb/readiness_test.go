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
	delete(tableInfo["metric_point"].Indexes, "idx_metric_point_serviceName_timestamp")

	err := CheckSchemaReadiness(completeDatabaseInfo(), tableInfo)
	if err == nil {
		t.Fatal("CheckSchemaReadiness returned nil error")
	}
	if !strings.Contains(err.Error(), "metric_point.serviceName, timestamp") {
		t.Fatalf("error = %q, want missing metric service/timestamp index", err.Error())
	}
}

func TestCheckSchemaReadinessSeparatesBuildingIndexes(t *testing.T) {
	tableInfo := completeTableInfo()
	tableInfo["metric_point"].Indexes["idx_metric_point_metricName_timestamp"] = "DEFINE INDEX idx_metric_point_metricName_timestamp ON metric_point FIELDS metricName, timestamp BUILDING"

	report := CheckSchemaReadinessReport(completeDatabaseInfo(), tableInfo)
	if len(report.MissingIndexes) != 0 {
		t.Fatalf("missing indexes = %#v, want none for building index", report.MissingIndexes)
	}
	if len(report.BuildingIndexes) != 1 || report.BuildingIndexes[0].Table != "metric_point" || report.BuildingIndexes[0].Field != "metricName, timestamp" {
		t.Fatalf("building indexes = %#v, want metric point metric/timestamp", report.BuildingIndexes)
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
		"trace": {Indexes: map[string]string{
			"idx_trace_startedAt":                "DEFINE INDEX idx_trace_startedAt ON trace FIELDS startedAt",
			"idx_trace_serviceName":              "DEFINE INDEX idx_trace_serviceName ON trace FIELDS serviceName",
			"idx_trace_status":                   "DEFINE INDEX idx_trace_status ON trace FIELDS status",
			"idx_trace_tenant_project_startedAt": "DEFINE INDEX idx_trace_tenant_project_startedAt ON trace FIELDS tenantId, projectId, startedAt",
			"idx_trace_tenant_project_traceId":   "DEFINE INDEX idx_trace_tenant_project_traceId ON trace FIELDS tenantId, projectId, traceId",
		}},
		"span": {Indexes: map[string]string{
			"idx_span_traceId":      "DEFINE INDEX idx_span_traceId ON span FIELDS traceId",
			"idx_span_parentSpanId": "DEFINE INDEX idx_span_parentSpanId ON span FIELDS parentSpanId",
		}},
		"log_event": {Indexes: map[string]string{
			"idx_log_event_timestamp":                  "DEFINE INDEX idx_log_event_timestamp ON log_event FIELDS timestamp",
			"idx_log_event_serviceName":                "DEFINE INDEX idx_log_event_serviceName ON log_event FIELDS serviceName",
			"idx_log_event_traceId":                    "DEFINE INDEX idx_log_event_traceId ON log_event FIELDS traceId",
			"idx_log_event_spanId":                     "DEFINE INDEX idx_log_event_spanId ON log_event FIELDS spanId",
			"idx_log_event_severityText":               "DEFINE INDEX idx_log_event_severityText ON log_event FIELDS severityText",
			"idx_log_event_tenant_project_timestamp":   "DEFINE INDEX idx_log_event_tenant_project_timestamp ON log_event FIELDS tenantId, projectId, timestamp",
			"idx_log_event_tenant_project_serviceName": "DEFINE INDEX idx_log_event_tenant_project_serviceName ON log_event FIELDS tenantId, projectId, serviceName",
		}},
		"metric_descriptor": {Indexes: map[string]string{
			"idx_metric_descriptor_metricName": "DEFINE INDEX idx_metric_descriptor_metricName ON metric_descriptor FIELDS metricName",
			"idx_metric_descriptor_lastSeenAt": "DEFINE INDEX idx_metric_descriptor_lastSeenAt ON metric_descriptor FIELDS lastSeenAt",
		}},
		"metric_point": {Indexes: map[string]string{
			"idx_metric_point_metricName":            "DEFINE INDEX idx_metric_point_metricName ON metric_point FIELDS metricName",
			"idx_metric_point_metricName_timestamp":  "DEFINE INDEX idx_metric_point_metricName_timestamp ON metric_point FIELDS metricName, timestamp",
			"idx_metric_point_serviceName_timestamp": "DEFINE INDEX idx_metric_point_serviceName_timestamp ON metric_point FIELDS serviceName, timestamp",
			"idx_metric_point_timestamp":             "DEFINE INDEX idx_metric_point_timestamp ON metric_point FIELDS timestamp",
		}},
		"metric_ingest_cardinality": {Indexes: map[string]string{
			"idx_metric_ingest_cardinality_metricName_windowStart": "DEFINE INDEX idx_metric_ingest_cardinality_metricName_windowStart ON metric_ingest_cardinality FIELDS metricName, windowStart",
		}},
		"service":        {Indexes: map[string]string{}},
		"ingest_command": {Indexes: map[string]string{}},
	}
}
