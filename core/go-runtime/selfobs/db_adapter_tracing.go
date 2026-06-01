package selfobs

import (
	"context"
	"strings"
	"time"
)

type DBAdapterSpanConfig struct {
	Enabled       bool
	SpanName      string
	Adapter       string
	Operation     string
	TargetKind    string
	StatementKind string
	Attributes    map[string]string
	Now           func() time.Time
}

type SpanRecorder interface {
	RecordSpan(event SpanEvent)
}

func StartDBAdapterSpan(ctx context.Context, recorder SpanRecorder, config DBAdapterSpanConfig) func(error) {
	if recorder == nil || !config.Enabled || strings.TrimSpace(config.SpanName) == "" {
		return func(error) {}
	}
	now := config.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	start := now()
	parent, ok := TraceContextFromContext(ctx)
	if !ok {
		parent = NewRootTraceContext()
	}
	child := NewChildTraceContext(parent)
	return func(err error) {
		result := "success"
		if err != nil {
			result = "error"
		}
		attributes := boundedDBAdapterAttributes(config, result, err)
		recorder.RecordSpan(SpanEvent{
			Name:         boundedDBAdapterSpanName(config.SpanName),
			TraceID:      child.TraceID,
			SpanID:       child.SpanID,
			ParentSpanID: child.ParentSpanID,
			TraceState:   child.TraceState,
			StartTime:    start,
			EndTime:      now(),
			Result:       result,
			Attributes:   attributes,
		})
	}
}

func boundedDBAdapterAttributes(config DBAdapterSpanConfig, result string, err error) map[string]string {
	attributes := map[string]string{
		"cloudgrid.db.adapter":        boundedDBAdapter(config.Adapter),
		"cloudgrid.db.operation":      boundedDBOperation(config.Operation),
		"cloudgrid.db.target_kind":    boundedDBTargetKind(config.TargetKind),
		"cloudgrid.db.statement_kind": boundedDBStatementKind(config.StatementKind),
		"cloudgrid.db.result":         boundedDBResult(result),
	}
	for key, value := range config.Attributes {
		switch key {
		case "db.system":
			if strings.TrimSpace(value) == "surrealdb" {
				attributes[key] = "surrealdb"
			}
		}
	}
	if err != nil {
		attributes["cloudgrid.error_id"] = errorIDFromDBAdapterError(err)
		attributes["cloudgrid.error_code"] = errorCodeFromDBAdapterError(err)
	}
	return attributes
}

func boundedDBAdapterSpanName(value string) string {
	switch strings.TrimSpace(value) {
	case "storage-read.db.project_telemetry_overview",
		"storage-read.db.trace_search",
		"storage-read.db.live_trace_candidates",
		"storage-read.db.trace_get",
		"storage-read.db.log_search",
		"storage-read.db.telemetry_facets",
		"storage-read.db.metric_names",
		"storage-read.db.metric_series",
		"storage-read.db.ai_eval_query",
		"storage-write.db.command_exists",
		"storage-write.db.persist_ingest",
		"storage-write.db.persist_metrics",
		"storage-write.db.persist_ai_projection",
		"storage-write.db.persist_eval_mutation",
		"storage-maintenance.db.policy_get",
		"storage-maintenance.db.retention_batch",
		"storage-maintenance.db.retention_audit",
		"storage-maintenance.db.lease",
		"storage-maintenance.db.target_resolve",
		"control-plane.db.query",
		"control-plane.db.mutation",
		"control-plane.db.project_list",
		"db.readiness_check",
		"db.schema_init":
		return strings.TrimSpace(value)
	default:
		return "db.operation"
	}
}

func boundedDBAdapter(value string) string {
	if strings.TrimSpace(value) == "surrealdb" {
		return "surrealdb"
	}
	return "unknown"
}

func boundedDBOperation(value string) string {
	switch strings.TrimSpace(value) {
	case "project_telemetry_overview", "trace_search", "live_trace_candidates",
		"trace_get", "log_search", "telemetry_facets", "metric_names",
		"metric_series", "ai_eval_query", "command_exists", "persist_ingest",
		"persist_metrics", "persist_ai_projection", "persist_eval_mutation",
		"policy_get", "retention_batch", "retention_audit", "lease",
		"target_resolve", "query", "mutation", "project_list",
		"readiness_check", "schema_init":
		return strings.TrimSpace(value)
	default:
		return "unknown"
	}
}

func boundedDBTargetKind(value string) string {
	switch strings.TrimSpace(value) {
	case "telemetry", "control", "maintenance":
		return strings.TrimSpace(value)
	default:
		return "unknown"
	}
}

func boundedDBStatementKind(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "select", "upsert", "delete", "schema", "readiness", "transaction":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return "unknown"
	}
}

func boundedDBResult(value string) string {
	if value == "success" || value == "error" {
		return value
	}
	return "error"
}

func errorIDFromDBAdapterError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if strings.HasPrefix(message, "ERR-001") {
		return "ERR-001"
	}
	if strings.HasPrefix(message, "ERR-009") {
		return "ERR-009"
	}
	if strings.HasPrefix(message, "ERR-016") {
		return "ERR-016"
	}
	return "ERR-006"
}

func errorCodeFromDBAdapterError(err error) string {
	switch errorIDFromDBAdapterError(err) {
	case "ERR-001":
		return "VALIDATION_FAILED"
	case "ERR-009":
		return "CONFIG_INVALID"
	case "ERR-016":
		return "FORBIDDEN"
	default:
		return "STORAGE_UNAVAILABLE"
	}
}
