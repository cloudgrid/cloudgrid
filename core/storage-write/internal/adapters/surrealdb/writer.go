//go:build surrealdb

package surrealdb

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type WriterQueryer interface {
	QueryInTarget(ctx context.Context, target TelemetryTarget, sql string, vars map[string]any) error
	IngestCommandExistsInTarget(ctx context.Context, target TelemetryTarget, commandID string) (bool, error)
}

type targetRowsQueryer interface {
	QueryRowsInTarget(ctx context.Context, target TelemetryTarget, sql string, vars map[string]any) ([]map[string]any, error)
}

type Persister struct {
	DB WriterQueryer
}

func (p Persister) CommandExists(ctx context.Context, command contracts.PersistTelemetryCommand) (bool, error) {
	if p.DB == nil {
		return false, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: storage writer is not configured")
	}
	commandID := command.CommandID
	if strings.TrimSpace(commandID) == "" {
		return false, fmt.Errorf("ERR-001 VALIDATION_FAILED: commandId is required")
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return false, err
	}
	return p.DB.IngestCommandExistsInTarget(ctx, target, commandID)
}

func (p Persister) Persist(ctx context.Context, command contracts.PersistTelemetryCommand, subject string, completedAt time.Time) error {
	if p.DB == nil {
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: storage writer is not configured")
	}

	sql, vars, err := BuildPersistQuery(command, subject, completedAt)
	if err != nil {
		return err
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return err
	}
	return p.DB.QueryInTarget(ctx, target, sql, vars)
}

func (p Persister) MetricsCommandExists(ctx context.Context, command contracts.PersistMetricsCommand) (bool, error) {
	if p.DB == nil {
		return false, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: storage writer is not configured")
	}
	if strings.TrimSpace(command.CommandID) == "" {
		return false, fmt.Errorf("ERR-001 VALIDATION_FAILED: commandId is required")
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return false, err
	}
	return p.DB.IngestCommandExistsInTarget(ctx, target, command.CommandID)
}

func (p Persister) PersistMetrics(ctx context.Context, command contracts.PersistMetricsCommand, subject string, completedAt time.Time) error {
	if p.DB == nil {
		return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: storage writer is not configured")
	}
	sql, vars, err := BuildMetricsPersistQuery(command, subject, completedAt)
	if err != nil {
		return err
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return err
	}
	return p.DB.QueryInTarget(ctx, target, sql, vars)
}

func (p Persister) AIProjectionCommandExists(ctx context.Context, command contracts.PersistAiProjectionCommand) (bool, error) {
	if p.DB == nil {
		return false, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: storage writer is not configured")
	}
	if strings.TrimSpace(command.CommandID) == "" {
		return false, fmt.Errorf("ERR-001 VALIDATION_FAILED: commandId is required")
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return false, err
	}
	return p.DB.IngestCommandExistsInTarget(ctx, target, command.CommandID)
}

func (p Persister) PersistAIProjection(ctx context.Context, command contracts.PersistAiProjectionCommand, subject string, completedAt time.Time) ([]string, error) {
	if p.DB == nil {
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: storage writer is not configured")
	}
	sql, vars, projectionIDs, err := BuildAIProjectionPersistQuery(command, subject, completedAt)
	if err != nil {
		return nil, err
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return nil, err
	}
	return projectionIDs, p.DB.QueryInTarget(ctx, target, sql, vars)
}

func (p Persister) PersistEvalMutation(ctx context.Context, subject string, request contracts.EvalMutationRequest, occurredAt time.Time) (map[string]any, error) {
	if p.DB == nil {
		return nil, fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: storage writer is not configured")
	}
	sql, vars, data, err := BuildEvalMutationPersistQuery(subject, request, occurredAt)
	if err != nil {
		return nil, err
	}
	target, err := ResolveTelemetryTarget(request.AuthContext)
	if err != nil {
		return nil, err
	}
	if err := p.DB.QueryInTarget(ctx, target, sql, vars); err != nil {
		return nil, err
	}
	if subject == "eval.dataset.items.append" {
		queryer, ok := p.DB.(targetRowsQueryer)
		if !ok {
			return data, nil
		}
		rows, err := queryer.QueryRowsInTarget(ctx, target, "SELECT meta::id(id) AS id, name, description, version, createdAt, itemCount, tags FROM type::record('ai_dataset', $dataset_id) LIMIT 1;", map[string]any{
			"dataset_id": mapStringValue(request.Input, "datasetId"),
		})
		if err != nil {
			return nil, err
		}
		if len(rows) > 0 {
			normalizeRecordDateStrings(rows[0])
			return rows[0], nil
		}
	}
	return data, nil
}

func BuildPersistQuery(command contracts.PersistTelemetryCommand, subject string, completedAt time.Time) (string, map[string]any, error) {
	if strings.TrimSpace(command.CommandID) == "" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: commandId is required")
	}
	if strings.TrimSpace(command.Source) == "" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: source is required")
	}
	if command.Source != "otlp-traces" && command.Source != "otlp-logs" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: source is invalid")
	}
	if strings.TrimSpace(subject) == "" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: subject is required")
	}
	if strings.TrimSpace(command.RequestID) == "" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: requestId is required")
	}
	if completedAt.IsZero() {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: completedAt is required")
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return "", nil, err
	}

	var builder strings.Builder
	builder.WriteString("BEGIN TRANSACTION;\n")
	vars := map[string]any{
		"commandId": command.CommandID,
		"tenantId":  target.TenantID,
		"companyId": target.CompanyID,
		"projectId": target.ProjectID,
	}

	serviceRecords := map[string]serviceRecord{}

	spanCountByTrace := map[string]int{}
	errorSpanCountByTrace := map[string]int{}
	serviceNamesByTrace := map[string]map[string]struct{}{}
	spanNamesByTrace := map[string][]string{}
	spanAttributesByTrace := map[string][]contracts.Attributes{}
	operationNameByTrace := map[string]string{}
	for _, span := range command.Spans {
		spanCountByTrace[span.TraceID]++
		spanNamesByTrace[span.TraceID] = append(spanNamesByTrace[span.TraceID], span.Name)
		spanAttributesByTrace[span.TraceID] = append(spanAttributesByTrace[span.TraceID], span.Attributes)
		if spanHasErrorStatus(span) {
			errorSpanCountByTrace[span.TraceID]++
		}
		if isRootSpan(span) && strings.TrimSpace(span.Name) != "" {
			if _, exists := operationNameByTrace[span.TraceID]; !exists {
				operationNameByTrace[span.TraceID] = span.Name
			}
		}
		if serviceName := spanServiceName(span); serviceName != "" {
			if serviceNamesByTrace[span.TraceID] == nil {
				serviceNamesByTrace[span.TraceID] = map[string]struct{}{}
			}
			serviceNamesByTrace[span.TraceID][serviceName] = struct{}{}
		}
	}
	logCountByTrace := map[string]int{}
	for _, log := range command.Logs {
		if log.TraceID != nil {
			logCountByTrace[*log.TraceID]++
		}
	}

	for i, trace := range command.Traces {
		if strings.TrimSpace(trace.ID) == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: trace id is required")
		}
		if trace.StartedAt.IsZero() {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: trace startedAt is required")
		}
		key := fmt.Sprintf("trace%d", i)
		vars[key+"_id"] = trace.ID
		vars[key+"_record"] = traceRecord(trace, operationNameByTrace[trace.ID], spanNamesByTrace[trace.ID], spanAttributesByTrace[trace.ID], spanCountByTrace[trace.ID], errorSpanCountByTrace[trace.ID], logCountByTrace[trace.ID], len(serviceNamesByTrace[trace.ID]), target)
		builder.WriteString(fmt.Sprintf("UPSERT type::record('trace', $%s_id) CONTENT $%s_record;\n", key, key))
		if trace.ServiceName != nil {
			mergeService(serviceRecords, *trace.ServiceName, trace.StartedAt, trace.Attributes)
		}
	}

	for i, span := range command.Spans {
		if strings.TrimSpace(span.ID) == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span id is required")
		}
		if strings.TrimSpace(span.TraceID) == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span traceId is required")
		}
		if strings.TrimSpace(span.Name) == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span name is required")
		}
		if span.StartedAt.IsZero() {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span startedAt is required")
		}
		if span.EndedAt.IsZero() {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span endedAt is required")
		}
		for _, event := range span.Events {
			if strings.TrimSpace(event.Name) == "" {
				return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span event name is required")
			}
			if event.Timestamp.IsZero() {
				return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span event timestamp is required")
			}
		}
		for _, link := range span.Links {
			if strings.TrimSpace(link.TraceID) == "" {
				return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span link traceId is required")
			}
			if strings.TrimSpace(link.SpanID) == "" {
				return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: span link spanId is required")
			}
		}
		key := fmt.Sprintf("span%d", i)
		vars[key+"_id"] = span.ID
		vars[key+"_record"] = spanRecord(span, target)
		builder.WriteString(fmt.Sprintf("UPSERT type::record('span', $%s_id) CONTENT $%s_record;\n", key, key))
		if span.ServiceName != nil {
			mergeService(serviceRecords, *span.ServiceName, span.StartedAt, span.Attributes)
		}
	}

	for i, log := range command.Logs {
		if strings.TrimSpace(log.ID) == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: log event id is required")
		}
		if log.Body == nil {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: log body is required")
		}
		if log.Timestamp.IsZero() {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: log timestamp is required")
		}
		key := fmt.Sprintf("log%d", i)
		vars[key+"_id"] = log.ID
		vars[key+"_record"] = logRecord(log, target)
		builder.WriteString(fmt.Sprintf("UPSERT type::record('log_event', $%s_id) CONTENT $%s_record;\n", key, key))
		if log.ServiceName != nil {
			mergeService(serviceRecords, *log.ServiceName, log.Timestamp, log.Attributes)
		}
	}
	traceLogIDs := make([]string, 0, len(logCountByTrace))
	for traceID := range logCountByTrace {
		traceLogIDs = append(traceLogIDs, traceID)
	}
	sort.Strings(traceLogIDs)
	for i, traceID := range traceLogIDs {
		key := fmt.Sprintf("traceLog%d", i)
		vars[key+"_id"] = traceID
		builder.WriteString(fmt.Sprintf("UPDATE type::record('trace', $%s_id) SET logCount = (SELECT count() AS count FROM log_event WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND traceId = $%s_id GROUP ALL)[0].count;\n", key, key))
	}

	serviceNames := make([]string, 0, len(serviceRecords))
	for name := range serviceRecords {
		serviceNames = append(serviceNames, name)
	}
	sort.Strings(serviceNames)
	for i, name := range serviceNames {
		key := fmt.Sprintf("service%d", i)
		record := serviceRecords[name]
		vars[key+"_id"] = slugServiceName(name)
		serviceRecord := map[string]any{
			"name":        record.Name,
			"firstSeenAt": record.FirstSeenAt.UTC(),
			"lastSeenAt":  record.LastSeenAt.UTC(),
			"attributes":  nonNilAttributes(record.Attributes),
		}
		addOwnership(serviceRecord, target)
		vars[key+"_record"] = serviceRecord
		builder.WriteString(fmt.Sprintf("UPSERT type::record('service', $%s_id) MERGE $%s_record;\n", key, key))
	}

	vars["ingest_command_id"] = command.CommandID
	ingestRecord := map[string]any{
		"commandId":        command.CommandID,
		"source":           command.Source,
		"requestId":        command.RequestID,
		"subject":          subject,
		"traceCount":       len(command.Traces),
		"spanCount":        len(command.Spans),
		"logCount":         len(command.Logs),
		"metricPointCount": 0,
		"completedAt":      completedAt.UTC(),
	}
	addOwnership(ingestRecord, target)
	vars["ingest_command_record"] = ingestRecord
	builder.WriteString("CREATE type::record('ingest_command', $ingest_command_id) CONTENT $ingest_command_record;\n")
	builder.WriteString("COMMIT TRANSACTION;")
	return builder.String(), vars, nil
}

func BuildMetricsPersistQuery(command contracts.PersistMetricsCommand, subject string, completedAt time.Time) (string, map[string]any, error) {
	if strings.TrimSpace(command.CommandID) == "" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: commandId is required")
	}
	if command.Source != "otlp-metrics" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: source is invalid")
	}
	if strings.TrimSpace(subject) != "telemetry.ingest.metrics" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: subject is invalid")
	}
	if strings.TrimSpace(command.RequestID) == "" {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: requestId is required")
	}
	if completedAt.IsZero() {
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: completedAt is required")
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return "", nil, err
	}
	if err := validateMetricNameBudget(command.Descriptors, command.Points); err != nil {
		return "", nil, err
	}

	var builder strings.Builder
	builder.WriteString("BEGIN TRANSACTION;\n")
	vars := map[string]any{"commandId": command.CommandID}

	cardinality := map[string]metricCardinalityRecord{}
	cardinalityBudget := newMetricCardinalityBudget()
	filteredPoints := make([]contracts.MetricPoint, 0, len(command.Points))
	observedMetricAttributeKeys := map[string]map[string]struct{}{}
	for _, point := range command.Points {
		if strings.TrimSpace(point.MetricName) == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: metric point metricName is required")
		}
		if point.Kind == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: metric point kind is required")
		}
		if point.Timestamp.IsZero() {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: metric point timestamp is required")
		}
		filtered := applyMetricPointPolicy(point, cardinalityBudget)
		mergeMetricCardinality(cardinality, filtered)
		filteredPoints = append(filteredPoints, filtered)
		if observedMetricAttributeKeys[filtered.MetricName] == nil {
			observedMetricAttributeKeys[filtered.MetricName] = map[string]struct{}{}
		}
		for attributeKey := range filtered.Attributes {
			observedMetricAttributeKeys[filtered.MetricName][attributeKey] = struct{}{}
		}
	}
	for i, descriptor := range command.Descriptors {
		if strings.TrimSpace(descriptor.Name) == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: metric descriptor name is required")
		}
		if descriptor.Kind == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: metric descriptor kind is required")
		}
		key := fmt.Sprintf("descriptor%d", i)
		attributeKeys := metricDescriptorAttributeKeys(descriptor.AttributeKeys, observedMetricAttributeKeys[descriptor.Name])
		descriptor.AttributeKeys = attributeKeys
		vars[key+"_id"] = metricRecordSlug(descriptor.Name)
		vars[key+"_record"] = metricDescriptorRecord(descriptor, target)
		vars[key+"_attribute_keys"] = stringArrayRecord(attributeKeys)
		builder.WriteString(metricDescriptorUpsertStatement(key))
	}

	for i, filtered := range filteredPoints {
		key := fmt.Sprintf("point%d", i)
		vars[key+"_id"] = metricPointRecordID(filtered)
		vars[key+"_record"] = metricPointRecord(filtered, target)
		builder.WriteString(fmt.Sprintf("UPSERT type::record('metric_point', $%s_id) CONTENT $%s_record;\n", key, key))
	}

	cardinalityKeys := make([]string, 0, len(cardinality))
	for key := range cardinality {
		cardinalityKeys = append(cardinalityKeys, key)
	}
	sort.Strings(cardinalityKeys)
	for i, keyValue := range cardinalityKeys {
		key := fmt.Sprintf("cardinality%d", i)
		record := cardinality[keyValue]
		vars[key+"_id"] = metricRecordSlug(record.MetricName) + "_" + record.WindowStart.Format("20060102")
		vars[key+"_record"] = metricCardinalityRecordMap(record, target)
		builder.WriteString(fmt.Sprintf("UPSERT type::record('metric_ingest_cardinality', $%s_id) MERGE $%s_record;\n", key, key))
	}

	vars["ingest_command_id"] = command.CommandID
	ingestRecord := map[string]any{
		"commandId":        command.CommandID,
		"source":           command.Source,
		"requestId":        command.RequestID,
		"subject":          subject,
		"traceCount":       0,
		"spanCount":        0,
		"logCount":         0,
		"metricPointCount": len(command.Points),
		"completedAt":      completedAt.UTC(),
	}
	addOwnership(ingestRecord, target)
	vars["ingest_command_record"] = ingestRecord
	builder.WriteString("CREATE type::record('ingest_command', $ingest_command_id) CONTENT $ingest_command_record;\n")
	builder.WriteString("COMMIT TRANSACTION;")
	return builder.String(), vars, nil
}

func BuildAIProjectionPersistQuery(command contracts.PersistAiProjectionCommand, subject string, completedAt time.Time) (string, map[string]any, []string, error) {
	if strings.TrimSpace(command.CommandID) == "" {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: commandId is required")
	}
	if strings.TrimSpace(subject) != "telemetry.ingest.ai_projections" {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: subject is invalid")
	}
	if strings.TrimSpace(command.RequestID) == "" {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: requestId is required")
	}
	if strings.TrimSpace(command.TraceID) == "" {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: traceId is required")
	}
	if strings.TrimSpace(command.SpanID) == "" {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: spanId is required")
	}
	if completedAt.IsZero() {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: completedAt is required")
	}
	table, err := aiProjectionTable(command.Kind)
	if err != nil {
		return "", nil, nil, err
	}
	projectionID := strings.TrimSpace(mapStringValue(command.Projection, "id"))
	if projectionID == "" {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: projection id is required")
	}
	target, err := ResolveTelemetryTarget(command.AuthContext)
	if err != nil {
		return "", nil, nil, err
	}

	record := cloneMap(command.Projection)
	delete(record, "id")
	record["traceId"] = command.TraceID
	record["spanId"] = command.SpanID
	record["kind"] = string(command.Kind)
	if command.SourceFlavor != nil {
		record["sourceFlavor"] = *command.SourceFlavor
	}
	if command.NormalizationWarnings != nil {
		record["normalizationWarnings"] = command.NormalizationWarnings
	}
	normalizeRecordDateStrings(record)
	addOwnership(record, target)

	ingestRecord := map[string]any{
		"commandId":        command.CommandID,
		"source":           "ai-projection",
		"requestId":        command.RequestID,
		"subject":          subject,
		"traceCount":       1,
		"spanCount":        1,
		"logCount":         0,
		"metricPointCount": 0,
		"completedAt":      completedAt.UTC(),
	}
	addOwnership(ingestRecord, target)

	sql := fmt.Sprintf("BEGIN TRANSACTION;\nUPSERT type::record('%s', $projection_id) CONTENT $projection_record;\nCREATE type::record('ingest_command', $ingest_command_id) CONTENT $ingest_command_record;\nCOMMIT TRANSACTION;", table)
	vars := map[string]any{
		"projection_id":         projectionID,
		"projection_record":     record,
		"ingest_command_id":     command.CommandID,
		"ingest_command_record": ingestRecord,
	}
	return sql, vars, []string{projectionID}, nil
}

func BuildEvalMutationPersistQuery(subject string, request contracts.EvalMutationRequest, occurredAt time.Time) (string, map[string]any, map[string]any, error) {
	if strings.TrimSpace(request.RequestID) == "" {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: requestId is required")
	}
	if request.IssuedAt.IsZero() {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: issuedAt is required")
	}
	if request.Input == nil {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: input is required")
	}
	if occurredAt.IsZero() {
		return "", nil, nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: occurredAt is required")
	}
	table, data, err := evalMutationRecord(subject, request, occurredAt)
	if err != nil {
		return "", nil, nil, err
	}
	target, err := ResolveTelemetryTarget(request.AuthContext)
	if err != nil {
		return "", nil, nil, err
	}
	record := cloneMap(data)
	recordID := record["id"]
	delete(record, "id")
	normalizeRecordDateStrings(record)
	addOwnership(record, target)

	sql := fmt.Sprintf("BEGIN TRANSACTION;\nUPSERT type::record('%s', $record_id) CONTENT $record;\nCOMMIT TRANSACTION;", table)
	vars := map[string]any{
		"record_id": recordID,
		"record":    record,
	}
	if subject == "eval.dataset.items.append" {
		datasetID := mapStringValue(request.Input, "datasetId")
		version := mapIntValue(request.Input, "version")
		sql = fmt.Sprintf(
			"BEGIN TRANSACTION;\nUPSERT type::record('%s', $record_id) CONTENT $record;\nUPDATE type::record('ai_dataset', $dataset_id) SET version = $dataset_version, itemCount = (SELECT count() AS count FROM ai_dataset_item WHERE tenantId = $tenant_id AND companyId = $company_id AND projectId = $project_id AND datasetId = $dataset_id GROUP ALL)[0].count;\nCOMMIT TRANSACTION;",
			table,
		)
		vars["dataset_id"] = datasetID
		vars["dataset_version"] = version
		vars["tenant_id"] = target.TenantID
		vars["company_id"] = target.CompanyID
		vars["project_id"] = target.ProjectID
	}
	return sql, vars, data, nil
}

func aiProjectionTable(kind contracts.AiProjectionKind) (string, error) {
	switch kind {
	case contracts.AiProjectionKindAgentRun:
		return "ai_agent_run", nil
	case contracts.AiProjectionKindLLMCall:
		return "ai_llm_call", nil
	case contracts.AiProjectionKindToolCall:
		return "ai_tool_call", nil
	case contracts.AiProjectionKindRetrievalEvent:
		return "ai_retrieval_event", nil
	default:
		return "", fmt.Errorf("ERR-001 VALIDATION_FAILED: kind is invalid")
	}
}

func evalMutationRecord(subject string, request contracts.EvalMutationRequest, occurredAt time.Time) (string, map[string]any, error) {
	switch subject {
	case "eval.dataset.create":
		name := mapStringValue(request.Input, "name")
		if name == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: name is required")
		}
		record := map[string]any{
			"id":        stableRecordID("dataset", request.RequestID, name),
			"name":      name,
			"version":   1,
			"createdAt": occurredAt.UTC(),
			"itemCount": 0,
			"tags":      mapArrayValue(request.Input, "tags"),
		}
		putMapString(record, "description", request.Input, "description")
		return "ai_dataset", record, nil
	case "eval.dataset.items.append":
		datasetID := mapStringValue(request.Input, "datasetId")
		version := mapIntValue(request.Input, "version")
		items := mapArrayValue(request.Input, "items")
		item := firstObject(items)
		if datasetID == "" || version < 1 || len(item) == 0 {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: dataset item append input is invalid")
		}
		id := mapStringValue(item, "id")
		if id == "" {
			id = stableRecordID("dataset-item", request.RequestID, datasetID)
		}
		record := map[string]any{
			"id":           id,
			"datasetId":    datasetID,
			"version":      version,
			"input":        item["input"],
			"expected":     item["expected"],
			"metadata":     mapObjectValueWithDefault(item, "metadata"),
			"split":        mapStringValueWithDefault(item, "split", "dev"),
			"reviewStatus": mapStringValueWithDefault(item, "reviewStatus", "unreviewed"),
			"synthetic":    mapBoolValue(item, "synthetic"),
		}
		putMapString(record, "sourceTraceId", item, "sourceTraceId")
		putMapString(record, "sourceSpanId", item, "sourceSpanId")
		return "ai_dataset_item", record, nil
	case "eval.dataset.item.promote":
		datasetID := mapStringValue(request.Input, "datasetId")
		sourceTraceID := mapStringValue(request.Input, "sourceTraceId")
		sourceSpanID := mapStringValue(request.Input, "sourceSpanId")
		if datasetID == "" || sourceTraceID == "" || sourceSpanID == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: dataset item promote input is invalid")
		}
		version := mapIntValue(request.Input, "version")
		if version < 1 {
			version = 1
		}
		record := map[string]any{
			"id":            stableRecordID("dataset-item", request.RequestID, datasetID, sourceTraceID, sourceSpanID),
			"datasetId":     datasetID,
			"version":       version,
			"input":         mapObjectValueWithDefault(request.Input, "input"),
			"expected":      request.Input["expected"],
			"metadata":      mapObjectValueWithDefault(request.Input, "metadata"),
			"sourceTraceId": sourceTraceID,
			"sourceSpanId":  sourceSpanID,
			"split":         mapStringValueWithDefault(request.Input, "split", "dev"),
			"reviewStatus":  mapStringValueWithDefault(request.Input, "reviewStatus", "reviewed"),
			"synthetic":     false,
		}
		return "ai_dataset_item", record, nil
	case "eval.scorer.create":
		name := mapStringValue(request.Input, "name")
		kind := mapStringValue(request.Input, "kind")
		definition := mapObjectValue(request.Input, "definition")
		if name == "" || kind == "" || len(definition) == 0 {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: scorer input is invalid")
		}
		record := map[string]any{
			"id":         stableRecordID("scorer", request.RequestID, name),
			"name":       name,
			"kind":       kind,
			"definition": definition,
			"version":    1,
		}
		putMapString(record, "judgeModelRef", request.Input, "judgeModelRef")
		return "ai_scorer", record, nil
	case "eval.experiment.create":
		name := mapStringValue(request.Input, "name")
		datasetID := mapStringValue(request.Input, "datasetId")
		datasetVersion := mapIntValue(request.Input, "datasetVersion")
		scorerIDs := mapArrayValue(request.Input, "scorerIds")
		if name == "" || datasetID == "" || datasetVersion < 1 || len(scorerIDs) == 0 {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: experiment input is invalid")
		}
		return "ai_experiment", map[string]any{
			"id":             stableRecordID("experiment", request.RequestID, name),
			"name":           name,
			"datasetId":      datasetID,
			"datasetVersion": datasetVersion,
			"scorerIds":      scorerIDs,
			"createdAt":      occurredAt.UTC(),
			"tags":           mapArrayValue(request.Input, "tags"),
		}, nil
	case "eval.results.persist":
		experimentRunID := mapStringValue(request.Input, "experimentRunId")
		itemRuns := mapArrayValue(request.Input, "itemRuns")
		results := mapArrayValue(request.Input, "results")
		if len(results) > 0 && len(itemRuns) == 0 {
			result := firstObject(results)
			id := mapStringValue(result, "id")
			if id == "" {
				return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: eval result id is required")
			}
			if mapStringValue(result, "experimentId") != "" && mapStringValue(result, "status") != "" && mapStringValue(result, "scorerId") == "" {
				record := cloneMap(result)
				record["id"] = id
				return "ai_experiment_run", record, nil
			}
			record := cloneMap(result)
			if experimentRunID != "" {
				record["experimentRunId"] = experimentRunID
			} else if mapStringValue(record, "experimentRunId") == "" {
				delete(record, "experimentRunId")
			}
			return "ai_eval_result", record, nil
		}
		if experimentRunID == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: experimentRunId is required")
		}
		itemRun := firstObject(itemRuns)
		if len(itemRun) == 0 {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: itemRuns is required")
		}
		id := mapStringValue(itemRun, "id")
		if id == "" {
			id = stableRecordID("dataset-item-run", request.RequestID, experimentRunID)
		}
		record := cloneMap(itemRun)
		record["id"] = id
		if mapStringValue(record, "experimentRunId") == "" {
			record["experimentRunId"] = experimentRunID
		}
		record["persistedAt"] = occurredAt.UTC()
		return "ai_dataset_item_run", record, nil
	case "eval.prompt_version.promote":
		id := mapStringValue(request.Input, "promptVersionId")
		tag := mapStringValue(request.Input, "tag")
		if id == "" || tag == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: prompt version promote input is invalid")
		}
		record := map[string]any{
			"id":  id,
			"tag": tag,
		}
		putMapString(record, "notes", request.Input, "notes")
		return "ai_prompt_version", record, nil
	case "annotation.item.update":
		id := mapStringValue(request.Input, "annotationQueueItemId")
		status := mapStringValue(request.Input, "status")
		if id == "" || status == "" {
			return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: annotation input is invalid")
		}
		record := map[string]any{
			"id":     id,
			"status": status,
		}
		putMapString(record, "resolvedDatasetItemId", request.Input, "datasetItemId")
		return "ai_annotation_queue_item", record, nil
	default:
		return "", nil, fmt.Errorf("ERR-001 VALIDATION_FAILED: unsupported eval mutation subject")
	}
}

const (
	maxMetricNamesPerCommand            = 10000
	maxMetricAttributeKeys              = 64
	maxMetricDistinctValuesPerAttribute = 1000
	maxMetricExemplarsPerPoint          = 16
)

var reservedMetricAttributeKeys = map[string]struct{}{
	"tenantId":             {},
	"tenant_id":            {},
	"companyId":            {},
	"company_id":           {},
	"projectId":            {},
	"project_id":           {},
	"cloudgrid.tenant_id":  {},
	"cloudgrid.company_id": {},
	"cloudgrid.project_id": {},
	"authorization":        {},
}

type metricCardinalityRecord struct {
	MetricName    string
	WindowStart   time.Time
	AttributeKeys []string
	ValueCounts   map[string]int
}

func validateMetricNameBudget(descriptors []contracts.MetricDescriptor, points []contracts.MetricPoint) error {
	seen := map[string]struct{}{}
	for _, descriptor := range descriptors {
		name := strings.TrimSpace(descriptor.Name)
		if name != "" {
			seen[name] = struct{}{}
		}
	}
	for _, point := range points {
		name := strings.TrimSpace(point.MetricName)
		if name != "" {
			seen[name] = struct{}{}
		}
	}
	if len(seen) > maxMetricNamesPerCommand {
		return fmt.Errorf("ERR-001 VALIDATION_FAILED: metric name budget exceeded")
	}
	return nil
}

type metricCardinalityBudget map[string]map[string]map[string]struct{}

func newMetricCardinalityBudget() metricCardinalityBudget {
	return metricCardinalityBudget{}
}

func (budget metricCardinalityBudget) allow(metricName string, key string, value any) bool {
	if budget[metricName] == nil {
		budget[metricName] = map[string]map[string]struct{}{}
	}
	if budget[metricName][key] == nil {
		budget[metricName][key] = map[string]struct{}{}
	}
	valueKey := canonicalMetricAttributeValue(value)
	if _, ok := budget[metricName][key][valueKey]; ok {
		return true
	}
	if len(budget[metricName][key]) >= maxMetricDistinctValuesPerAttribute {
		return false
	}
	budget[metricName][key][valueKey] = struct{}{}
	return true
}

func applyMetricPointPolicy(point contracts.MetricPoint, cardinalityBudget metricCardinalityBudget) contracts.MetricPoint {
	filtered := point
	attrs := contracts.Attributes{}
	keys := make([]string, 0, len(point.Attributes))
	for key := range point.Attributes {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	dropped := point.DroppedAttributeCount
	for _, key := range keys {
		if _, reserved := reservedMetricAttributeKeys[key]; reserved {
			dropped++
			continue
		}
		if len(attrs) >= maxMetricAttributeKeys {
			dropped++
			continue
		}
		if !cardinalityBudget.allow(point.MetricName, key, point.Attributes[key]) {
			dropped++
			continue
		}
		attrs[key] = point.Attributes[key]
	}
	filtered.Attributes = attrs
	filtered.DroppedAttributeCount = dropped
	if len(filtered.Exemplars) > maxMetricExemplarsPerPoint {
		filtered.Exemplars = append([]contracts.MetricExemplar(nil), filtered.Exemplars[:maxMetricExemplarsPerPoint]...)
	}
	return filtered
}

func canonicalMetricAttributeValue(value any) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprint(value)
	}
	return string(encoded)
}

func mergeMetricCardinality(records map[string]metricCardinalityRecord, point contracts.MetricPoint) {
	windowStart := point.Timestamp.UTC().Truncate(24 * time.Hour)
	recordKey := point.MetricName + "|" + windowStart.Format(time.RFC3339)
	record := records[recordKey]
	if record.ValueCounts == nil {
		record = metricCardinalityRecord{
			MetricName:  point.MetricName,
			WindowStart: windowStart,
			ValueCounts: map[string]int{},
		}
	}
	seenKeys := map[string]struct{}{}
	for _, key := range record.AttributeKeys {
		seenKeys[key] = struct{}{}
	}
	for key, value := range point.Attributes {
		seenKeys[key] = struct{}{}
		countKey := key + "=" + fmt.Sprint(value)
		record.ValueCounts[countKey]++
	}
	record.AttributeKeys = make([]string, 0, len(seenKeys))
	for key := range seenKeys {
		record.AttributeKeys = append(record.AttributeKeys, key)
	}
	sort.Strings(record.AttributeKeys)
	records[recordKey] = record
}

func metricDescriptorRecord(descriptor contracts.MetricDescriptor, target TelemetryTarget) map[string]any {
	record := map[string]any{
		"metricName":    descriptor.Name,
		"unit":          descriptor.Unit,
		"kind":          string(descriptor.Kind),
		"attributeKeys": stringArrayRecord(descriptor.AttributeKeys),
		"firstSeenAt":   descriptor.FirstSeenAt.UTC(),
		"lastSeenAt":    descriptor.LastSeenAt.UTC(),
	}
	putStringPtr(record, "description", descriptor.Description)
	record["searchText"] = searchText(
		descriptor.Name,
		descriptor.Unit,
		string(descriptor.Kind),
		descriptor.Description,
		descriptor.AttributeKeys,
	)
	if descriptor.AggregationTemporality != nil {
		record["aggregationTemporality"] = string(*descriptor.AggregationTemporality)
	}
	if descriptor.Monotonic != nil {
		record["monotonic"] = *descriptor.Monotonic
	}
	addOwnership(record, target)
	return record
}

func metricDescriptorUpsertStatement(key string) string {
	return fmt.Sprintf("UPSERT type::record('metric_descriptor', $%[1]s_id) SET tenantId = $%[1]s_record.tenantId, companyId = $%[1]s_record.companyId, projectId = $%[1]s_record.projectId, metricName = $%[1]s_record.metricName, description = $%[1]s_record.description, unit = $%[1]s_record.unit, kind = $%[1]s_record.kind, aggregationTemporality = $%[1]s_record.aggregationTemporality, monotonic = $%[1]s_record.monotonic, attributeKeys = array::sort(array::distinct(array::concat(IF attributeKeys = NONE THEN [] ELSE attributeKeys END, $%[1]s_attribute_keys))), firstSeenAt = IF firstSeenAt = NONE OR $%[1]s_record.firstSeenAt < firstSeenAt THEN $%[1]s_record.firstSeenAt ELSE firstSeenAt END, lastSeenAt = IF lastSeenAt = NONE OR $%[1]s_record.lastSeenAt > lastSeenAt THEN $%[1]s_record.lastSeenAt ELSE lastSeenAt END, searchText = string::concat($%[1]s_record.metricName, ' ', $%[1]s_record.unit, ' ', $%[1]s_record.kind, ' ', $%[1]s_record.description, ' ', array::sort(array::distinct(array::concat(IF attributeKeys = NONE THEN [] ELSE attributeKeys END, $%[1]s_attribute_keys))));\n", key)
}

func metricDescriptorAttributeKeys(declared []string, observed map[string]struct{}) []string {
	seen := map[string]struct{}{}
	for _, key := range declared {
		if strings.TrimSpace(key) == "" {
			continue
		}
		seen[key] = struct{}{}
	}
	for key := range observed {
		if strings.TrimSpace(key) == "" {
			continue
		}
		seen[key] = struct{}{}
	}
	keys := make([]string, 0, len(seen))
	for key := range seen {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func metricPointRecord(point contracts.MetricPoint, target TelemetryTarget) map[string]any {
	record := map[string]any{
		"metricName":            point.MetricName,
		"kind":                  string(point.Kind),
		"timestamp":             point.Timestamp.UTC(),
		"bucketCounts":          floatArrayRecord(point.BucketCounts),
		"explicitBounds":        floatArrayRecord(point.ExplicitBounds),
		"quantileValues":        quantileRecordValues(point.QuantileValues),
		"attributes":            nonNilAttributes(point.Attributes),
		"exemplars":             metricExemplarRecords(point.Exemplars),
		"droppedAttributeCount": point.DroppedAttributeCount,
	}
	putStringPtr(record, "serviceName", point.ServiceName)
	putStringPtr(record, "scopeName", point.ScopeName)
	putTimePtr(record, "startTimestamp", point.StartTimestamp)
	putFloatPtr(record, "value", point.Value)
	putFloatPtr(record, "count", point.Count)
	putFloatPtr(record, "sum", point.Sum)
	putFloatPtr(record, "min", point.Min)
	putFloatPtr(record, "max", point.Max)
	addOwnership(record, target)
	return record
}

func metricCardinalityRecordMap(record metricCardinalityRecord, target TelemetryTarget) map[string]any {
	out := map[string]any{
		"metricName":    record.MetricName,
		"windowStart":   record.WindowStart.UTC(),
		"attributeKeys": stringArrayRecord(record.AttributeKeys),
		"valueCounts":   record.ValueCounts,
	}
	addOwnership(out, target)
	return out
}

func quantileRecordValues(values []contracts.QuantileValue) []map[string]any {
	out := make([]map[string]any, 0, len(values))
	for _, value := range values {
		out = append(out, map[string]any{"quantile": value.Quantile, "value": value.Value})
	}
	return out
}

func metricExemplarRecords(exemplars []contracts.MetricExemplar) []map[string]any {
	out := make([]map[string]any, 0, len(exemplars))
	for _, exemplar := range exemplars {
		record := map[string]any{
			"timestamp":  exemplar.Timestamp.UTC(),
			"value":      exemplar.Value,
			"attributes": nonNilAttributes(exemplar.Attributes),
		}
		putStringPtr(record, "traceId", exemplar.TraceID)
		putStringPtr(record, "spanId", exemplar.SpanID)
		out = append(out, record)
	}
	return out
}

func stringArrayRecord(values []string) []string {
	if values == nil {
		return []string{}
	}
	return append([]string{}, values...)
}

func floatArrayRecord(values []float64) []float64 {
	if values == nil {
		return []float64{}
	}
	return append([]float64{}, values...)
}

func metricRecordSlug(name string) string {
	return slugServiceName(name)
}

func metricPointRecordID(point contracts.MetricPoint) string {
	if strings.TrimSpace(point.ID) != "" {
		return point.ID
	}
	attrs, _ := json.Marshal(point.Attributes)
	sum := sha256.Sum256(attrs)
	return fmt.Sprintf("%s_%d_%s", metricRecordSlug(point.MetricName), point.Timestamp.UnixNano(), hex.EncodeToString(sum[:])[:16])
}

type serviceRecord struct {
	Name        string
	FirstSeenAt time.Time
	LastSeenAt  time.Time
	Attributes  contracts.Attributes
}

func traceRecord(trace contracts.Trace, operationName string, spanNames []string, spanAttributes []contracts.Attributes, spanCount int, errorSpanCount int, logCount int, serviceCount int, target TelemetryTarget) map[string]any {
	record := map[string]any{
		"traceId":           trace.ID,
		"startedAt":         trace.StartedAt.UTC(),
		"startedAtUnixNano": unixNanoString(trace.StartedAt),
		"attributes":        nonNilAttributes(trace.Attributes),
		"spanCount":         spanCount,
		"errorSpanCount":    errorSpanCount,
		"logCount":          logCount,
		"serviceCount":      serviceCount,
		"searchText":        traceSearchText(trace, operationName, spanNames, spanAttributes),
	}
	putStringPtr(record, "serviceName", trace.ServiceName)
	if strings.TrimSpace(operationName) != "" {
		record["operationName"] = strings.TrimSpace(operationName)
	}
	if trace.EndedAt != nil {
		endedAtNano := unixNanoString(*trace.EndedAt)
		record["endedAt"] = trace.EndedAt.UTC()
		record["endedAtUnixNano"] = endedAtNano
		record["durationNano"] = durationNanoString(trace.StartedAt, *trace.EndedAt)
	}
	putFloatPtr(record, "durationMs", trace.DurationMs)
	putStringPtr(record, "rootSpanId", trace.RootSpanID)
	putStatusPtr(record, "status", trace.Status)
	addOwnership(record, target)
	return record
}

func isRootSpan(span contracts.Span) bool {
	return span.ParentSpanID == nil || strings.TrimSpace(*span.ParentSpanID) == ""
}

func spanRecord(span contracts.Span, target TelemetryTarget) map[string]any {
	record := map[string]any{
		"spanId":            span.ID,
		"traceId":           span.TraceID,
		"name":              span.Name,
		"startedAt":         span.StartedAt.UTC(),
		"startedAtUnixNano": unixNanoString(span.StartedAt),
		"endedAt":           span.EndedAt.UTC(),
		"endedAtUnixNano":   unixNanoString(span.EndedAt),
		"durationNano":      durationNanoString(span.StartedAt, span.EndedAt),
		"durationMs":        span.DurationMs,
		"attributes":        nonNilAttributes(span.Attributes),
		"events":            spanEvents(span.Events),
		"links":             spanLinks(span.Links),
	}
	putStringPtr(record, "parentSpanId", span.ParentSpanID)
	putStringPtr(record, "kind", span.Kind)
	putStringPtr(record, "serviceName", span.ServiceName)
	putStatusPtr(record, "status", span.Status)
	addOwnership(record, target)
	return record
}

func logRecord(log contracts.LogEvent, target TelemetryTarget) map[string]any {
	record := map[string]any{
		"logEventId": log.ID,
		"body":       log.Body,
		"timestamp":  log.Timestamp.UTC(),
		"attributes": nonNilAttributes(log.Attributes),
		"searchText": logSearchText(log),
	}
	putStringPtr(record, "traceId", log.TraceID)
	putStringPtr(record, "spanId", log.SpanID)
	putStringPtr(record, "serviceName", log.ServiceName)
	putStringPtr(record, "severityText", log.SeverityText)
	if log.SeverityNumber != nil {
		record["severityNumber"] = *log.SeverityNumber
	}
	if body, ok := log.Body.(string); ok {
		record["bodyText"] = body
	}
	putTimePtr(record, "observedTimestamp", log.ObservedTimestamp)
	addOwnership(record, target)
	return record
}

func traceSearchText(trace contracts.Trace, operationName string, spanNames []string, spanAttributes []contracts.Attributes) string {
	parts := []any{trace.ID, trace.ServiceName, operationName, trace.RootSpanID, trace.Status, trace.Attributes}
	for _, spanName := range spanNames {
		parts = append(parts, spanName)
	}
	for _, attributes := range spanAttributes {
		parts = append(parts, attributes)
	}
	return searchText(parts...)
}

func logSearchText(log contracts.LogEvent) string {
	return searchText(log.ID, log.TraceID, log.SpanID, log.ServiceName, log.SeverityText, log.Body, log.Attributes)
}

func searchText(parts ...any) string {
	terms := make([]string, 0, len(parts))
	for _, part := range parts {
		appendSearchTerms(&terms, part)
	}
	return strings.Join(uniqueNonBlankStrings(terms), " ")
}

func appendSearchTerms(terms *[]string, value any) {
	switch typed := value.(type) {
	case nil:
		return
	case string:
		*terms = append(*terms, typed)
	case *string:
		if typed != nil {
			*terms = append(*terms, *typed)
		}
	case fmt.Stringer:
		*terms = append(*terms, typed.String())
	case []string:
		*terms = append(*terms, typed...)
	case contracts.Attributes:
		appendAttributesSearchTerms(terms, map[string]any(typed))
	case map[string]any:
		appendAttributesSearchTerms(terms, typed)
	case contracts.TraceStatus:
		*terms = append(*terms, string(typed))
	case *contracts.TraceStatus:
		if typed != nil {
			*terms = append(*terms, string(*typed))
		}
	default:
		*terms = append(*terms, fmt.Sprint(typed))
	}
}

func appendAttributesSearchTerms(terms *[]string, attributes map[string]any) {
	keys := make([]string, 0, len(attributes))
	for key := range attributes {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		*terms = append(*terms, key)
		appendSearchTerms(terms, attributes[key])
	}
}

func uniqueNonBlankStrings(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func spanEvents(events []contracts.SpanEvent) []map[string]any {
	out := make([]map[string]any, 0, len(events))
	for _, event := range events {
		out = append(out, map[string]any{
			"name":              event.Name,
			"timestamp":         event.Timestamp.UTC(),
			"timestampUnixNano": unixNanoString(event.Timestamp),
			"attributes":        nonNilAttributes(event.Attributes),
		})
	}
	return out
}

func unixNanoString(value time.Time) string {
	return strconv.FormatInt(value.UTC().UnixNano(), 10)
}

func durationNanoString(start time.Time, end time.Time) string {
	duration := end.Sub(start)
	if duration < 0 {
		duration = 0
	}
	return strconv.FormatInt(duration.Nanoseconds(), 10)
}

func spanLinks(links []contracts.SpanLink) []map[string]any {
	out := make([]map[string]any, 0, len(links))
	for _, link := range links {
		record := map[string]any{
			"traceId":    link.TraceID,
			"spanId":     link.SpanID,
			"attributes": nonNilAttributes(link.Attributes),
		}
		putStringPtr(record, "traceState", link.TraceState)
		out = append(out, record)
	}
	return out
}

func mergeService(records map[string]serviceRecord, name string, seenAt time.Time, attrs contracts.Attributes) {
	name = strings.TrimSpace(name)
	if name == "" {
		return
	}

	current, ok := records[name]
	if !ok {
		records[name] = serviceRecord{
			Name:        name,
			FirstSeenAt: seenAt,
			LastSeenAt:  seenAt,
			Attributes:  nonNilAttributes(attrs),
		}
		return
	}
	if seenAt.Before(current.FirstSeenAt) {
		current.FirstSeenAt = seenAt
	}
	if seenAt.After(current.LastSeenAt) {
		current.LastSeenAt = seenAt
	}
	if current.Attributes == nil {
		current.Attributes = contracts.Attributes{}
	}
	for key, value := range attrs {
		current.Attributes[key] = value
	}
	records[name] = current
}

func spanServiceName(span contracts.Span) string {
	if span.ServiceName != nil && strings.TrimSpace(*span.ServiceName) != "" {
		return strings.TrimSpace(*span.ServiceName)
	}
	if value, ok := span.Attributes["service.name"].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func spanHasErrorStatus(span contracts.Span) bool {
	if span.Status != nil && strings.EqualFold(string(*span.Status), string(contracts.TraceStatusError)) {
		return true
	}
	if value, ok := span.Attributes["error.type"].(string); ok && strings.TrimSpace(value) != "" {
		return true
	}
	return false
}

var serviceSlugPattern = regexp.MustCompile(`[^a-z0-9_-]+`)

func slugServiceName(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	slug = serviceSlugPattern.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return "unknown"
	}
	return slug
}

func nonNilAttributes(attrs contracts.Attributes) contracts.Attributes {
	if attrs == nil {
		return contracts.Attributes{}
	}
	out := make(contracts.Attributes, len(attrs))
	for key, value := range attrs {
		out[key] = value
	}
	return out
}

func putStringPtr(record map[string]any, key string, value *string) {
	if value != nil {
		record[key] = *value
	}
}

func putTimePtr(record map[string]any, key string, value *time.Time) {
	if value != nil {
		record[key] = value.UTC()
	}
}

func putFloatPtr(record map[string]any, key string, value *float64) {
	if value != nil {
		record[key] = *value
	}
}

func putStatusPtr(record map[string]any, key string, value *contracts.TraceStatus) {
	if value != nil {
		record[key] = string(*value)
	}
}

func cloneMap(input map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range input {
		out[key] = value
	}
	return out
}

func normalizeRecordDateStrings(record map[string]any) {
	for _, key := range []string{"startedAt", "endedAt", "createdAt", "producedAt", "persistedAt"} {
		value, ok := record[key].(string)
		if !ok {
			continue
		}
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			delete(record, key)
			continue
		}
		parsed, err := time.Parse(time.RFC3339Nano, trimmed)
		if err != nil {
			continue
		}
		record[key] = parsed.UTC()
	}
}

func mapStringValue(input map[string]any, key string) string {
	value, ok := input[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func putMapString(record map[string]any, recordKey string, input map[string]any, inputKey string) {
	value := mapStringValue(input, inputKey)
	if value != "" {
		record[recordKey] = value
	}
}

func mapObjectValue(input map[string]any, key string) map[string]any {
	value, ok := input[key]
	if !ok || value == nil {
		return map[string]any{}
	}
	if object, ok := value.(map[string]any); ok {
		return object
	}
	return map[string]any{}
}

func mapObjectValueWithDefault(input map[string]any, key string) map[string]any {
	value := mapObjectValue(input, key)
	if value == nil {
		return map[string]any{}
	}
	return value
}

func mapArrayValue(input map[string]any, key string) []any {
	value, ok := input[key]
	if !ok || value == nil {
		return []any{}
	}
	switch typed := value.(type) {
	case []any:
		return typed
	case []string:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, item)
		}
		return items
	default:
		return []any{}
	}
}

func firstObject(items []any) map[string]any {
	if len(items) == 0 {
		return map[string]any{}
	}
	if item, ok := items[0].(map[string]any); ok {
		return item
	}
	return map[string]any{}
}

func mapStringValueWithDefault(input map[string]any, key string, fallback string) string {
	value := mapStringValue(input, key)
	if value == "" {
		return fallback
	}
	return value
}

func mapBoolValue(input map[string]any, key string) bool {
	value, ok := input[key]
	if !ok || value == nil {
		return false
	}
	typed, _ := value.(bool)
	return typed
}

func mapIntValue(input map[string]any, key string) int {
	value, ok := input[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func stableRecordID(prefix string, values ...string) string {
	for i, value := range values {
		values[i] = strings.TrimSpace(value)
	}
	joined := strings.Join(values, "-")
	joined = strings.ToLower(strings.NewReplacer(" ", "-", "_", "-").Replace(joined))
	joined = strings.Trim(joined, "-")
	if joined == "" {
		return prefix
	}
	return prefix + "-" + joined
}
