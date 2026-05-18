//go:build surrealdb

package surrealdb

import (
	"context"
	"strings"
	"testing"
)

func TestStatementsDefineRequiredSchemafullNormalTables(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, table := range []string{"trace", "span", "log_event", "metric_descriptor", "metric_point", "metric_ingest_cardinality", "service", "ingest_command", "ai_agent_run", "ai_llm_call", "ai_tool_call", "ai_retrieval_event", "ai_dataset", "ai_dataset_item", "ai_scorer", "ai_eval_result", "ai_experiment", "ai_experiment_run", "ai_dataset_item_run", "ai_prompt_version", "ai_annotation_queue_item"} {
		want := "DEFINE TABLE IF NOT EXISTS " + table + " SCHEMAFULL TYPE NORMAL"
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestStatementsDefineRequiredIndexes(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, want := range []string{
		"DEFINE DATABASE OVERWRITE project_default STRICT",
		"DEFINE INDEX IF NOT EXISTS idx_trace_startedAt ON trace FIELDS startedAt",
		"DEFINE INDEX IF NOT EXISTS idx_trace_tenant_project_startedAt ON trace FIELDS tenantId, projectId, startedAt",
		"DEFINE INDEX IF NOT EXISTS idx_trace_tenant_project_traceId ON trace FIELDS tenantId, projectId, traceId",
		"DEFINE INDEX IF NOT EXISTS idx_trace_serviceName ON trace FIELDS serviceName",
		"DEFINE INDEX IF NOT EXISTS idx_trace_status ON trace FIELDS status",
		"DEFINE INDEX IF NOT EXISTS idx_span_traceId ON span FIELDS traceId",
		"DEFINE INDEX IF NOT EXISTS idx_span_parentSpanId ON span FIELDS parentSpanId",
		"DEFINE INDEX IF NOT EXISTS idx_span_serviceName ON span FIELDS serviceName",
		"DEFINE INDEX IF NOT EXISTS idx_span_name ON span FIELDS name",
		"DEFINE INDEX IF NOT EXISTS idx_span_status ON span FIELDS status",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_timestamp ON log_event FIELDS timestamp",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_tenant_project_timestamp ON log_event FIELDS tenantId, projectId, timestamp",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_serviceName ON log_event FIELDS serviceName",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_tenant_project_serviceName ON log_event FIELDS tenantId, projectId, serviceName",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_traceId ON log_event FIELDS traceId",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_spanId ON log_event FIELDS spanId",
		"DEFINE INDEX IF NOT EXISTS idx_log_event_severityText ON log_event FIELDS severityText",
		"DEFINE INDEX IF NOT EXISTS idx_metric_descriptor_metricName ON metric_descriptor FIELDS metricName",
		"DEFINE INDEX IF NOT EXISTS idx_metric_descriptor_lastSeenAt ON metric_descriptor FIELDS lastSeenAt",
		"DEFINE INDEX IF NOT EXISTS idx_metric_point_metricName ON metric_point FIELDS metricName",
		"DEFINE INDEX IF NOT EXISTS idx_metric_point_metricName_timestamp ON metric_point FIELDS metricName, timestamp",
		"DEFINE INDEX IF NOT EXISTS idx_metric_point_serviceName_timestamp ON metric_point FIELDS serviceName, timestamp",
		"DEFINE INDEX IF NOT EXISTS idx_metric_point_timestamp ON metric_point FIELDS timestamp",
		"DEFINE INDEX IF NOT EXISTS idx_metric_ingest_cardinality_metricName_windowStart ON metric_ingest_cardinality FIELDS metricName, windowStart",
		"DEFINE INDEX IF NOT EXISTS idx_ingest_command_commandId ON ingest_command FIELDS commandId UNIQUE",
		"DEFINE INDEX IF NOT EXISTS idx_ingest_command_completedAt ON ingest_command FIELDS completedAt",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestStatementsDefineOwnershipMetadataFields(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, table := range []string{"trace", "span", "log_event", "metric_descriptor", "metric_point", "metric_ingest_cardinality", "service", "ingest_command", "ai_agent_run", "ai_llm_call", "ai_tool_call", "ai_retrieval_event", "ai_dataset", "ai_dataset_item", "ai_scorer", "ai_eval_result", "ai_experiment", "ai_experiment_run", "ai_dataset_item_run", "ai_prompt_version", "ai_annotation_queue_item"} {
		for _, field := range []string{"tenantId", "companyId", "projectId"} {
			want := "DEFINE FIELD IF NOT EXISTS " + field + " ON " + table + " TYPE string"
			if !strings.Contains(got, want) {
				t.Fatalf("schema missing %q in:\n%s", want, got)
			}
		}
	}
}

func TestStatementsDefineTracePrecisionFields(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, want := range []string{
		"DEFINE FIELD IF NOT EXISTS startedAtUnixNano ON trace TYPE string",
		"DEFINE FIELD IF NOT EXISTS endedAtUnixNano ON trace TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS durationNano ON trace TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS startedAtUnixNano ON span TYPE string",
		"DEFINE FIELD IF NOT EXISTS endedAtUnixNano ON span TYPE string",
		"DEFINE FIELD IF NOT EXISTS durationNano ON span TYPE string",
		"DEFINE FIELD OVERWRITE events[*].timestampUnixNano ON span TYPE string",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestStatementsDefineAiEvalRelationshipFields(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, want := range []string{
		"DEFINE FIELD IF NOT EXISTS datasetId ON ai_dataset_item TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS experimentId ON ai_experiment_run TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS experimentRunId ON ai_dataset_item_run TYPE option<string>",
		"DEFINE FIELD IF NOT EXISTS scorerId ON ai_eval_result TYPE option<string>",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestStatementsDefineIngestCommandFields(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, want := range []string{
		"DEFINE FIELD IF NOT EXISTS commandId ON ingest_command TYPE string",
		"DEFINE FIELD IF NOT EXISTS source ON ingest_command TYPE string",
		"DEFINE FIELD IF NOT EXISTS requestId ON ingest_command TYPE string",
		"DEFINE FIELD IF NOT EXISTS subject ON ingest_command TYPE string",
		"DEFINE FIELD IF NOT EXISTS traceCount ON ingest_command TYPE int",
		"DEFINE FIELD IF NOT EXISTS spanCount ON ingest_command TYPE int",
		"DEFINE FIELD IF NOT EXISTS logCount ON ingest_command TYPE int",
		"DEFINE FIELD IF NOT EXISTS completedAt ON ingest_command TYPE datetime",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestStatementsDefineTraceSummaryCountFields(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, want := range []string{
		"DEFINE FIELD IF NOT EXISTS spanCount ON trace TYPE int",
		"DEFINE FIELD IF NOT EXISTS errorSpanCount ON trace TYPE int",
		"DEFINE FIELD IF NOT EXISTS logCount ON trace TYPE int",
		"DEFINE FIELD IF NOT EXISTS serviceCount ON trace TYPE int",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestStatementsUseFlexibleFieldsOnlyWhereSchemaAllowsOpenData(t *testing.T) {
	got := strings.Join(Statements(), "\n")

	for _, want := range []string{
		"DEFINE FIELD IF NOT EXISTS attributes ON trace TYPE object FLEXIBLE",
		"DEFINE FIELD IF NOT EXISTS attributes ON span TYPE object FLEXIBLE",
		"DEFINE FIELD OVERWRITE events ON span TYPE array<object>",
		"DEFINE FIELD OVERWRITE events[*].name ON span TYPE string",
		"DEFINE FIELD OVERWRITE events[*].timestamp ON span TYPE datetime",
		"DEFINE FIELD OVERWRITE events[*].attributes ON span TYPE object FLEXIBLE",
		"DEFINE FIELD OVERWRITE links ON span TYPE array<object>",
		"DEFINE FIELD OVERWRITE links[*].traceId ON span TYPE string",
		"DEFINE FIELD OVERWRITE links[*].spanId ON span TYPE string",
		"DEFINE FIELD OVERWRITE links[*].traceState ON span TYPE option<string>",
		"DEFINE FIELD OVERWRITE links[*].attributes ON span TYPE object FLEXIBLE",
		"DEFINE FIELD IF NOT EXISTS body ON log_event TYPE any",
		"DEFINE FIELD IF NOT EXISTS attributes ON log_event TYPE object FLEXIBLE",
		"DEFINE FIELD IF NOT EXISTS attributes ON metric_point TYPE object FLEXIBLE",
		"DEFINE FIELD OVERWRITE exemplars ON metric_point TYPE array<object>",
		"DEFINE FIELD OVERWRITE exemplars[*].attributes ON metric_point TYPE object FLEXIBLE",
		"DEFINE FIELD IF NOT EXISTS valueCounts ON metric_ingest_cardinality TYPE object FLEXIBLE",
		"DEFINE FIELD IF NOT EXISTS attributes ON service TYPE object FLEXIBLE",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("schema missing %q in:\n%s", want, got)
		}
	}
}

func TestInitializeRunsOneParameterizedSchemaQuery(t *testing.T) {
	db := &recordingDB{}

	if err := Initialize(context.Background(), db); err != nil {
		t.Fatalf("Initialize() error = %v", err)
	}

	if db.sql == "" {
		t.Fatal("Initialize() did not execute SQL")
	}
	if db.vars == nil {
		t.Fatal("Initialize() vars = nil")
	}
	if len(db.vars) != 0 {
		t.Fatalf("Initialize() vars = %#v", db.vars)
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
