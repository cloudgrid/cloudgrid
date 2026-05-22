//go:build surrealdb

package surrealdb

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	defaultPageLimit           = 50
	defaultLiveLimit           = 100
	maxLiveLimit               = 500
	attributeKeyFacetScanLimit = 5000
)

var maxPageLimit = 200

func ConfigureQueryLimits(maxPageSize int) {
	if maxPageSize > 0 {
		maxPageLimit = maxPageSize
	}
}

const traceSummaryProjection = "traceId AS id, serviceName, operationName, startedAt, startedAtUnixNano, endedAt, endedAtUnixNano, durationNano, durationMs, rootSpanId, status, attributes, spanCount, errorSpanCount, logCount, serviceCount"

type QueryStatement struct {
	SQL    string
	Params map[string]any
	Target TelemetryTarget
}

func BuildProjectTelemetryOverviewQueries(target TelemetryTarget) map[string]QueryStatement {
	params := map[string]any{}
	addOwnershipParams(params, target)
	return map[string]QueryStatement{
		"traces": {
			SQL:    "SELECT count() AS count FROM trace WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND (deletedAt = NONE OR deletedAt = NULL) GROUP ALL;",
			Params: cloneParams(params),
			Target: target,
		},
		"logs": {
			SQL:    "SELECT count() AS count FROM log_event WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND (deletedAt = NONE OR deletedAt = NULL) GROUP ALL;",
			Params: cloneParams(params),
			Target: target,
		},
		"metrics": {
			SQL:    "SELECT count() AS count FROM metric_descriptor WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND (deletedAt = NONE OR deletedAt = NULL) GROUP ALL;",
			Params: cloneParams(params),
			Target: target,
		},
		"services": {
			SQL:    "SELECT count() AS count FROM service WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId GROUP ALL;",
			Params: cloneParams(params),
			Target: target,
		},
		"lastIngest": {
			SQL:    "SELECT completedAt AS lastIngestAt FROM ingest_command WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId ORDER BY completedAt DESC LIMIT 1;",
			Params: cloneParams(params),
			Target: target,
		},
	}
}

func BuildTraceSearchQuery(query contracts.TraceSearchQuery, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	limit, err := normalizedLimit(query.Limit)
	if err != nil {
		return QueryStatement{}, err
	}
	if err := validateTimeRange(query.From, query.To); err != nil {
		return QueryStatement{}, err
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}

	params := map[string]any{"limit": limit + 1}
	addOwnershipParams(params, target)
	conditions := retentionVisibleConditions()
	sortSpec := traceSearchSortSpec(query.Sort)
	if services := normalizedServiceFilters(query.Service, query.Services); len(services) > 0 {
		conditions = append(conditions, "serviceName IN $services")
		params["services"] = services
	}
	if query.Status != nil {
		conditions = append(conditions, "status = $status")
		params["status"] = string(*query.Status)
	}
	if query.From != nil {
		conditions = append(conditions, "startedAt >= $from")
		params["from"] = query.From.UTC()
	}
	if query.To != nil {
		conditions = append(conditions, "startedAt <= $to")
		params["to"] = query.To.UTC()
	}
	if query.MinDurationMs != nil {
		conditions = append(conditions, "durationMs >= $minDurationMs")
		params["minDurationMs"] = *query.MinDurationMs
	}
	if query.MaxDurationMs != nil {
		conditions = append(conditions, "durationMs <= $maxDurationMs")
		params["maxDurationMs"] = *query.MaxDurationMs
	}
	if query.Query != nil && strings.TrimSpace(*query.Query) != "" {
		conditions = append(conditions, "searchText @AND@ $query")
		params["query"] = strings.ToLower(strings.TrimSpace(*query.Query))
	}
	if query.OperationName != nil && strings.TrimSpace(*query.OperationName) != "" {
		conditions = append(conditions, rootSpanNameCondition("$operationName"))
		params["operationName"] = strings.TrimSpace(*query.OperationName)
	}
	if query.SpanName != nil && strings.TrimSpace(*query.SpanName) != "" {
		conditions = append(conditions, spanNameCondition("$spanName"))
		params["spanName"] = strings.TrimSpace(*query.SpanName)
	}
	for index, filter := range query.Attributes {
		condition, err := attributeFilterCondition(filter, index, params)
		if err != nil {
			return QueryStatement{}, err
		}
		conditions = append(conditions, condition)
	}
	if query.Cursor != nil && strings.TrimSpace(*query.Cursor) != "" {
		cursor, err := decodeCursorForSort(*query.Cursor, sortSpec.cursorSort, sortSpec.valueKind)
		if err != nil {
			return QueryStatement{}, err
		}
		conditions = append(conditions, sortSpec.cursorCondition)
		if sortSpec.valueKind == cursorValueTraceErrorFirst {
			value, ok := cursor.LastValue.(traceErrorFirstCursorValue)
			if !ok {
				return QueryStatement{}, cursorError()
			}
			params["cursorErrorFirst"] = value.ErrorFirst
			params["cursorStartedAt"] = value.StartedAt
		} else {
			params["cursorValue"] = cursor.LastValue
		}
		params["cursorId"] = cursor.LastID
	}

	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT " + traceSummaryProjection,
			"FROM trace",
			whereClause(conditions),
			sortSpec.orderBy,
			"LIMIT $limit;",
		}, " "),
		Params: params,
		Target: target,
	}, nil
}

func BuildLiveTraceCandidatesQuery(query contracts.LiveTraceQuery, traceIDs []string, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	traceIDs = normalizedTraceIDs(traceIDs)
	if len(traceIDs) == 0 {
		return QueryStatement{}, validationError("traceIds are required")
	}
	limit, err := normalizedLiveLimit(query.Limit)
	if err != nil {
		return QueryStatement{}, err
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}

	params := map[string]any{"limit": limit, "traceIds": traceIDs}
	addOwnershipParams(params, target)
	conditions := append(retentionVisibleConditions(), "traceId IN $traceIds")
	if services := normalizedServiceFilters(query.Service, query.Services); len(services) > 0 {
		conditions = append(conditions, participatingSpanServiceCondition())
		params["services"] = services
	}
	if query.Status != nil {
		conditions = append(conditions, "status = $status")
		params["status"] = string(*query.Status)
	}
	if query.From != nil {
		conditions = append(conditions, "startedAt >= $from")
		params["from"] = query.From.UTC()
	}
	if query.MinDurationMs != nil {
		conditions = append(conditions, "durationMs >= $minDurationMs")
		params["minDurationMs"] = *query.MinDurationMs
	}
	if query.MaxDurationMs != nil {
		conditions = append(conditions, "durationMs <= $maxDurationMs")
		params["maxDurationMs"] = *query.MaxDurationMs
	}
	if query.Query != nil && strings.TrimSpace(*query.Query) != "" {
		conditions = append(conditions, "searchText @AND@ $query")
		params["query"] = strings.ToLower(strings.TrimSpace(*query.Query))
	}
	if query.OperationName != nil && strings.TrimSpace(*query.OperationName) != "" {
		conditions = append(conditions, rootSpanNameCondition("$operationName"))
		params["operationName"] = strings.TrimSpace(*query.OperationName)
	}
	if query.SpanName != nil && strings.TrimSpace(*query.SpanName) != "" {
		conditions = append(conditions, spanNameCondition("$spanName"))
		params["spanName"] = strings.TrimSpace(*query.SpanName)
	}
	for index, filter := range query.Attributes {
		condition, err := attributeFilterCondition(filter, index, params)
		if err != nil {
			return QueryStatement{}, err
		}
		conditions = append(conditions, condition)
	}

	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT " + traceSummaryProjection,
			"FROM trace",
			whereClause(conditions),
			"ORDER BY startedAt DESC, traceId ASC",
			"LIMIT $limit;",
		}, " "),
		Params: params,
		Target: target,
	}, nil
}

func BuildTraceDetailQuery(request contracts.TraceDetailRequest) (QueryStatement, error) {
	traceID := strings.TrimSpace(request.TraceID)
	if traceID == "" {
		return QueryStatement{}, validationError("traceId is required")
	}
	target, err := ResolveTelemetryTarget(request.AuthContext)
	if err != nil {
		return QueryStatement{}, err
	}

	sql := strings.Join([]string{
		"LET $trace = SELECT traceId AS id, serviceName, startedAt, startedAtUnixNano, endedAt, endedAtUnixNano, durationNano, durationMs, rootSpanId, status, attributes FROM type::record('trace', $traceId) WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE;",
		"LET $spans = SELECT spanId AS id, traceId, parentSpanId, name, kind, serviceName, startedAt, startedAtUnixNano, endedAt, endedAtUnixNano, durationNano, durationMs, status, attributes, events, links FROM span WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE AND traceId = $traceId ORDER BY startedAt ASC, spanId ASC;",
		"LET $spanIds = $spans.map(|$span| $span.id);",
		"LET $contextFrom = $trace[0].startedAt - 5s;",
		"LET $contextTo = ($trace[0].endedAt ?? $trace[0].startedAt) + 5s;",
		"SELECT logEventId AS id, traceId, spanId, serviceName, severityText, severityNumber, body, timestamp, observedTimestamp, attributes",
		"FROM log_event WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE AND (traceId = $traceId OR spanId IN $spanIds OR (serviceName = $trace[0].serviceName AND timestamp >= $contextFrom AND timestamp <= $contextTo))",
		"ORDER BY timestamp ASC, logEventId ASC;",
	}, " ")

	params := map[string]any{"traceId": traceID}
	addOwnershipParams(params, target)
	return QueryStatement{
		SQL:    sql,
		Params: params,
		Target: target,
	}, nil
}

func BuildTraceByIDQuery(traceID string, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	traceID = strings.TrimSpace(traceID)
	if traceID == "" {
		return QueryStatement{}, validationError("traceId is required")
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}
	params := map[string]any{"traceId": traceID}
	addOwnershipParams(params, target)
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT traceId AS id, serviceName, startedAt, startedAtUnixNano, endedAt, endedAtUnixNano, durationNano, durationMs, rootSpanId, status, attributes",
			"FROM type::record('trace', $traceId)",
			"WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE",
			"LIMIT 1;",
		}, " "),
		Params: params,
		Target: target,
	}, nil
}

func BuildSpansByTraceIDQuery(traceID string, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	traceID = strings.TrimSpace(traceID)
	if traceID == "" {
		return QueryStatement{}, validationError("traceId is required")
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}
	params := map[string]any{"traceId": traceID}
	addOwnershipParams(params, target)
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT spanId AS id, traceId, parentSpanId, name, kind, serviceName, startedAt, startedAtUnixNano, endedAt, endedAtUnixNano, durationNano, durationMs, status, attributes, events, links",
			"FROM span",
			"WHERE traceId = $traceId AND tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE",
			"ORDER BY startedAt ASC, spanId ASC;",
		}, " "),
		Params: params,
		Target: target,
	}, nil
}

func BuildLogsForTraceDetailQuery(trace contracts.Trace, spans []contracts.Span, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	traceID := strings.TrimSpace(trace.ID)
	if traceID == "" {
		return QueryStatement{}, validationError("traceId is required")
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}
	spanIDs := make([]string, 0, len(spans))
	services := make([]string, 0, len(spans)+1)
	seenServices := map[string]bool{}
	if trace.ServiceName != nil && strings.TrimSpace(*trace.ServiceName) != "" {
		services = append(services, *trace.ServiceName)
		seenServices[*trace.ServiceName] = true
	}
	for _, span := range spans {
		spanIDs = append(spanIDs, span.ID)
		if span.ServiceName != nil && strings.TrimSpace(*span.ServiceName) != "" && !seenServices[*span.ServiceName] {
			services = append(services, *span.ServiceName)
			seenServices[*span.ServiceName] = true
		}
	}
	contextFrom := trace.StartedAt.Add(-5 * time.Second)
	contextTo := trace.StartedAt.Add(5 * time.Second)
	if trace.EndedAt != nil {
		contextTo = trace.EndedAt.Add(5 * time.Second)
	}
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT logEventId AS id, traceId, spanId, serviceName, severityText, severityNumber, body, timestamp, observedTimestamp, attributes",
			"FROM log_event",
			"WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE AND (traceId = $traceId OR spanId IN $spanIds OR (serviceName IN $services AND timestamp >= $contextFrom AND timestamp <= $contextTo))",
			"ORDER BY timestamp ASC, logEventId ASC;",
		}, " "),
		Params: withOwnershipParams(map[string]any{
			"traceId":     traceID,
			"spanIds":     spanIDs,
			"services":    services,
			"contextFrom": contextFrom,
			"contextTo":   contextTo,
		}, target),
		Target: target,
	}, nil
}

func BuildFacetQueries(query contracts.TelemetryFacetQuery, authContext ...*contracts.AuthContext) (map[string]QueryStatement, error) {
	limit, err := normalizedLimit(query.Limit)
	if err != nil {
		return nil, err
	}
	if err := validateTimeRange(query.From, query.To); err != nil {
		return nil, err
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return nil, err
	}

	params := map[string]any{"limit": limit}
	addOwnershipParams(params, target)
	spanConditions := facetSpanConditions(query, params, true)
	attributeSpanConditions := facetSpanConditions(query, params, false)
	logConditions := facetLogConditions(query, params)
	serviceFacetStatement := serviceFacetQuery(query, params, target)
	params["attributeScanLimit"] = attributeKeyFacetScanLimit

	return map[string]QueryStatement{
		"services": serviceFacetStatement,
		"operations": {
			SQL: strings.Join([]string{
				"SELECT name AS value, count() AS count",
				"FROM span",
				whereClause(append(spanConditions, "parentSpanId = NONE", "name != NONE")),
				"GROUP BY name",
				"ORDER BY count DESC, value ASC",
				"LIMIT $limit;",
			}, " "),
			Params: cloneParams(params),
			Target: target,
		},
		"spanNames": {
			SQL: strings.Join([]string{
				"SELECT name AS value, count() AS count",
				"FROM span",
				whereClause(append(spanConditions, "name != NONE")),
				"GROUP BY name",
				"ORDER BY count DESC, value ASC",
				"LIMIT $limit;",
			}, " "),
			Params: cloneParams(params),
			Target: target,
		},
		"severities": {
			SQL: strings.Join([]string{
				"SELECT severityText AS value, count() AS count",
				"FROM log_event",
				whereClause(append(logConditions, "severityText != NONE")),
				"GROUP BY severityText",
				"ORDER BY count DESC, value ASC",
				"LIMIT $limit;",
			}, " "),
			Params: cloneParams(params),
			Target: target,
		},
		"attributeKeys": {
			SQL: strings.Join([]string{
				"SELECT VALUE object::keys(attributes)",
				"FROM span",
				whereClause(attributeSpanConditions),
				"LIMIT $attributeScanLimit;",
			}, " "),
			Params: cloneParams(params),
			Target: target,
		},
	}, nil
}

func facetSpanConditions(query contracts.TelemetryFacetQuery, params map[string]any, includeSearch bool) []string {
	conditions := retentionVisibleConditions()
	if services := normalizedServiceFilters(query.Service, query.Services); len(services) > 0 {
		conditions = append(conditions, "serviceName IN $services")
		params["services"] = services
	}
	if query.From != nil {
		conditions = append(conditions, "startedAt >= $from")
		params["from"] = query.From.UTC()
	}
	if query.To != nil {
		conditions = append(conditions, "startedAt <= $to")
		params["to"] = query.To.UTC()
	}
	if includeSearch && query.Search != nil && strings.TrimSpace(*query.Search) != "" {
		conditions = append(conditions, "(string::lowercase(name) CONTAINS $search OR string::lowercase(serviceName) CONTAINS $search)")
		params["search"] = strings.ToLower(strings.TrimSpace(*query.Search))
	}
	return conditions
}

func facetLogConditions(query contracts.TelemetryFacetQuery, params map[string]any) []string {
	conditions := retentionVisibleConditions()
	if services := normalizedServiceFilters(query.Service, query.Services); len(services) > 0 {
		conditions = append(conditions, "serviceName IN $services")
		params["services"] = services
	}
	if query.From != nil {
		conditions = append(conditions, "timestamp >= $from")
		params["from"] = query.From.UTC()
	}
	if query.To != nil {
		conditions = append(conditions, "timestamp <= $to")
		params["to"] = query.To.UTC()
	}
	if query.Search != nil && strings.TrimSpace(*query.Search) != "" {
		conditions = append(conditions, "string::lowercase(severityText) CONTAINS $search")
		params["search"] = strings.ToLower(strings.TrimSpace(*query.Search))
	}
	return conditions
}

func serviceFacetQuery(query contracts.TelemetryFacetQuery, params map[string]any, target TelemetryTarget) QueryStatement {
	signal := contracts.TelemetryFacetSignalTraces
	if query.Signal != nil {
		signal = *query.Signal
	}
	switch signal {
	case contracts.TelemetryFacetSignalLogs:
		return QueryStatement{
			SQL: strings.Join([]string{
				"SELECT serviceName AS value, count() AS count",
				"FROM log_event",
				whereClause(append(facetLogConditions(query, params), "serviceName != NONE")),
				"GROUP BY serviceName",
				"ORDER BY count DESC, value ASC",
				"LIMIT $limit;",
			}, " "),
			Params: cloneParams(params),
			Target: target,
		}
	case contracts.TelemetryFacetSignalMetrics:
		return QueryStatement{
			SQL: strings.Join([]string{
				"SELECT serviceName AS value, count() AS count",
				"FROM metric_point",
				whereClause(append(facetMetricPointConditions(query, params), "serviceName != NONE")),
				"GROUP BY serviceName",
				"ORDER BY count DESC, value ASC",
				"LIMIT $limit;",
			}, " "),
			Params: cloneParams(params),
			Target: target,
		}
	default:
		return QueryStatement{
			SQL: strings.Join([]string{
				"SELECT serviceName AS value, count() AS count",
				"FROM span",
				whereClause(append(facetSpanConditions(query, params, true), "serviceName != NONE")),
				"GROUP BY serviceName",
				"ORDER BY count DESC, value ASC",
				"LIMIT $limit;",
			}, " "),
			Params: cloneParams(params),
			Target: target,
		}
	}
}

func facetMetricPointConditions(query contracts.TelemetryFacetQuery, params map[string]any) []string {
	conditions := retentionVisibleConditions()
	if services := normalizedServiceFilters(query.Service, query.Services); len(services) > 0 {
		conditions = append(conditions, "serviceName IN $services")
		params["services"] = services
	}
	if query.From != nil {
		conditions = append(conditions, "timestamp >= $from")
		params["from"] = query.From.UTC()
	}
	if query.To != nil {
		conditions = append(conditions, "timestamp <= $to")
		params["to"] = query.To.UTC()
	}
	if query.Search != nil && strings.TrimSpace(*query.Search) != "" {
		conditions = append(conditions, "string::lowercase(serviceName) CONTAINS $search")
		params["search"] = strings.ToLower(strings.TrimSpace(*query.Search))
	}
	return conditions
}

func participatingSpanServiceCondition() string {
	return "traceId IN (SELECT VALUE traceId FROM span WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE AND serviceName IN $services)"
}

func rootSpanNameCondition(nameParam string) string {
	return fmt.Sprintf("traceId IN (SELECT VALUE traceId FROM span WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE AND parentSpanId = NONE AND name = %s)", nameParam)
}

func spanNameCondition(nameParam string) string {
	return fmt.Sprintf("traceId IN (SELECT VALUE traceId FROM span WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND deletedAt = NONE AND name = %s)", nameParam)
}

type querySortSpec struct {
	cursorSort      string
	cursorCondition string
	orderBy         string
	valueKind       cursorValueKind
}

func traceSearchSortSpec(sort *contracts.TraceSort) querySortSpec {
	if sort == nil {
		return querySortSpec{
			cursorSort:      "startedAt_desc_traceId_asc",
			cursorCondition: "(startedAt < $cursorValue OR (startedAt = $cursorValue AND traceId > $cursorId))",
			orderBy:         "ORDER BY startedAt DESC, traceId ASC",
			valueKind:       cursorValueTime,
		}
	}
	switch *sort {
	case contracts.TraceSortStartedAtAsc:
		return querySortSpec{
			cursorSort:      "startedAt_asc_traceId_asc",
			cursorCondition: "(startedAt > $cursorValue OR (startedAt = $cursorValue AND traceId > $cursorId))",
			orderBy:         "ORDER BY startedAt ASC, traceId ASC",
			valueKind:       cursorValueTime,
		}
	case contracts.TraceSortDurationDesc:
		return querySortSpec{
			cursorSort:      "duration_desc_traceId_asc",
			cursorCondition: "(durationMs < $cursorValue OR (durationMs = $cursorValue AND traceId > $cursorId))",
			orderBy:         "ORDER BY durationMs DESC, traceId ASC",
			valueKind:       cursorValueFloat,
		}
	case contracts.TraceSortDurationAsc:
		return querySortSpec{
			cursorSort:      "duration_asc_traceId_asc",
			cursorCondition: "(durationMs > $cursorValue OR (durationMs = $cursorValue AND traceId > $cursorId))",
			orderBy:         "ORDER BY durationMs ASC, traceId ASC",
			valueKind:       cursorValueFloat,
		}
	case contracts.TraceSortErrorFirst:
		return querySortSpec{
			cursorSort:      "errorFirst_startedAt_desc_traceId_asc",
			cursorCondition: "(($cursorErrorFirst = true AND ((status = 'error' AND (startedAt < $cursorStartedAt OR (startedAt = $cursorStartedAt AND traceId > $cursorId))) OR status != 'error')) OR ($cursorErrorFirst = false AND status != 'error' AND (startedAt < $cursorStartedAt OR (startedAt = $cursorStartedAt AND traceId > $cursorId))))",
			orderBy:         "ORDER BY status = 'error' DESC, startedAt DESC, traceId ASC",
			valueKind:       cursorValueTraceErrorFirst,
		}
	default:
		return traceSearchSortSpec(nil)
	}
}

func logSearchSortSpec(sort *contracts.LogSort) querySortSpec {
	if sort == nil {
		return querySortSpec{
			cursorSort:      "timestamp_desc_logEventId_asc",
			cursorCondition: "(timestamp < $cursorValue OR (timestamp = $cursorValue AND logEventId > $cursorId))",
			orderBy:         "ORDER BY timestamp DESC, logEventId ASC",
			valueKind:       cursorValueTime,
		}
	}
	switch *sort {
	case contracts.LogSortTimestampAsc:
		return querySortSpec{
			cursorSort:      "timestamp_asc_logEventId_asc",
			cursorCondition: "(timestamp > $cursorValue OR (timestamp = $cursorValue AND logEventId > $cursorId))",
			orderBy:         "ORDER BY timestamp ASC, logEventId ASC",
			valueKind:       cursorValueTime,
		}
	case contracts.LogSortSeverityDesc:
		return querySortSpec{
			cursorSort:      "severity_desc_logEventId_asc",
			cursorCondition: "(severityNumber < $cursorValue OR (severityNumber = $cursorValue AND logEventId > $cursorId))",
			orderBy:         "ORDER BY severityNumber DESC, logEventId ASC",
			valueKind:       cursorValueFloat,
		}
	default:
		return logSearchSortSpec(nil)
	}
}

func cloneParams(params map[string]any) map[string]any {
	cloned := make(map[string]any, len(params))
	for key, value := range params {
		cloned[key] = value
	}
	return cloned
}

func withOwnershipParams(params map[string]any, target TelemetryTarget) map[string]any {
	addOwnershipParams(params, target)
	return params
}

func retentionVisibleConditions() []string {
	return append(ownershipConditions(), "(deletedAt = NONE OR deletedAt = NULL)")
}

func firstAuthContext(values []*contracts.AuthContext) *contracts.AuthContext {
	if len(values) == 0 {
		return nil
	}
	return values[0]
}

func BuildLogSearchQuery(query contracts.LogSearchQuery, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	limit, err := normalizedLimit(query.Limit)
	if err != nil {
		return QueryStatement{}, err
	}
	if err := validateTimeRange(query.From, query.To); err != nil {
		return QueryStatement{}, err
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}

	params := map[string]any{"limit": limit + 1}
	addOwnershipParams(params, target)
	conditions := retentionVisibleConditions()
	sortSpec := logSearchSortSpec(query.Sort)
	if services := normalizedServiceFilters(query.Service, query.Services); len(services) > 0 {
		conditions = append(conditions, "serviceName IN $services")
		params["services"] = services
	}
	if query.TraceID != nil {
		conditions = append(conditions, "traceId = $traceId")
		params["traceId"] = *query.TraceID
	}
	if query.SpanID != nil {
		conditions = append(conditions, "spanId = $spanId")
		params["spanId"] = *query.SpanID
	}
	if query.Severity != nil {
		conditions = append(conditions, "severityText = $severity")
		params["severity"] = *query.Severity
	}
	if query.From != nil {
		conditions = append(conditions, "timestamp >= $from")
		params["from"] = query.From.UTC()
	}
	if query.To != nil {
		conditions = append(conditions, "timestamp <= $to")
		params["to"] = query.To.UTC()
	}
	if query.Search != nil && strings.TrimSpace(*query.Search) != "" {
		conditions = append(conditions, "searchText @AND@ $search")
		params["search"] = strings.ToLower(strings.TrimSpace(*query.Search))
	}
	if query.Cursor != nil && strings.TrimSpace(*query.Cursor) != "" {
		cursor, err := decodeCursorForSort(*query.Cursor, sortSpec.cursorSort, sortSpec.valueKind)
		if err != nil {
			return QueryStatement{}, err
		}
		conditions = append(conditions, sortSpec.cursorCondition)
		params["cursorValue"] = cursor.LastValue
		params["cursorId"] = cursor.LastID
	}

	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT logEventId AS id, traceId, spanId, serviceName, severityText, severityNumber, body, timestamp, observedTimestamp, attributes",
			"FROM log_event",
			whereClause(conditions),
			sortSpec.orderBy,
			"LIMIT $limit;",
		}, " "),
		Params: params,
		Target: target,
	}, nil
}

func normalizedLimit(limit *int) (int, error) {
	if limit == nil {
		return defaultPageLimit, nil
	}
	if *limit < 1 || *limit > maxPageLimit {
		return 0, validationError(fmt.Sprintf("limit must be between 1 and %d", maxPageLimit))
	}
	return *limit, nil
}

func normalizedLiveLimit(limit *int) (int, error) {
	if limit == nil {
		return defaultLiveLimit, nil
	}
	if *limit < 1 || *limit > maxLiveLimit {
		return 0, validationError(fmt.Sprintf("limit must be between 1 and %d", maxLiveLimit))
	}
	return *limit, nil
}

func normalizedTraceIDs(traceIDs []string) []string {
	normalized := make([]string, 0, len(traceIDs))
	seen := map[string]bool{}
	for _, traceID := range traceIDs {
		traceID = strings.TrimSpace(traceID)
		if traceID == "" || seen[traceID] {
			continue
		}
		normalized = append(normalized, traceID)
		seen[traceID] = true
	}
	return normalized
}

func normalizedServiceFilters(service *string, services []string) []string {
	normalized := make([]string, 0, len(services)+1)
	seen := map[string]bool{}
	if service != nil {
		value := strings.TrimSpace(*service)
		if value != "" {
			normalized = append(normalized, value)
			seen[value] = true
		}
	}
	for _, service := range services {
		value := strings.TrimSpace(service)
		if value == "" || seen[value] {
			continue
		}
		normalized = append(normalized, value)
		seen[value] = true
	}
	return normalized
}

func attributeFilterCondition(filter contracts.AttributeFilter, index int, params map[string]any) (string, error) {
	key := strings.TrimSpace(filter.Key)
	if key == "" {
		return "", validationError("attribute filter key is required")
	}
	keyParam := fmt.Sprintf("attributeKey%d", index)
	valueParam := fmt.Sprintf("attributeValue%d", index)
	params[keyParam] = key

	switch filter.Operator {
	case contracts.AttributeFilterOperatorExists:
		return fmt.Sprintf("attributes[$%s] != NONE", keyParam), nil
	case contracts.AttributeFilterOperatorEQ:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] = $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorNEQ:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] != $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorContains:
		params[valueParam] = strings.ToLower(fmt.Sprint(filter.Value))
		return fmt.Sprintf("string::lowercase(<string> attributes[$%s]) CONTAINS $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorGT:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] > $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorGTE:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] >= $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorLT:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] < $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorLTE:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] <= $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorIN:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] IN $%s", keyParam, valueParam), nil
	case contracts.AttributeFilterOperatorNotIN:
		params[valueParam] = filter.Value
		return fmt.Sprintf("attributes[$%s] NOT IN $%s", keyParam, valueParam), nil
	default:
		return "", validationError("attribute filter operator is not supported")
	}
}

func validateTimeRange(from *time.Time, to *time.Time) error {
	if from != nil && to != nil && from.After(*to) {
		return validationError("from must be before or equal to to")
	}
	return nil
}

func whereClause(conditions []string) string {
	if len(conditions) == 0 {
		return ""
	}
	return "WHERE " + strings.Join(conditions, " AND ")
}

func validationError(reason string) error {
	return fmt.Errorf("ERR-001 VALIDATION_FAILED: %s", reason)
}

type decodedCursor struct {
	Sort      string `json:"sort"`
	LastValue any    `json:"-"`
	LastID    string `json:"lastId"`
}

type traceErrorFirstCursorValue struct {
	ErrorFirst bool
	StartedAt  time.Time
}

type rawCursor struct {
	Sort      string `json:"sort"`
	LastValue string `json:"lastValue"`
	LastID    string `json:"lastId"`
}

type cursorValueKind string

const (
	cursorValueTime            cursorValueKind = "time"
	cursorValueFloat           cursorValueKind = "float"
	cursorValueString          cursorValueKind = "string"
	cursorValueTraceErrorFirst cursorValueKind = "trace_error_first"
)

func decodeCursor(value string, expectedSort string) (decodedCursor, error) {
	return decodeCursorForSort(value, expectedSort, cursorValueTime)
}

func decodeCursorForSort(value string, expectedSort string, kind cursorValueKind) (decodedCursor, error) {
	payload, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return decodedCursor{}, cursorError()
	}

	var raw rawCursor
	if err := json.Unmarshal(payload, &raw); err != nil {
		return decodedCursor{}, cursorError()
	}
	if raw.Sort != expectedSort || raw.LastValue == "" || strings.TrimSpace(raw.LastID) == "" {
		return decodedCursor{}, cursorError()
	}

	var lastValue any
	switch kind {
	case cursorValueTime:
		parsed, err := time.Parse(time.RFC3339Nano, raw.LastValue)
		if err != nil {
			return decodedCursor{}, cursorError()
		}
		lastValue = parsed.UTC()
	case cursorValueFloat:
		parsed, err := strconv.ParseFloat(raw.LastValue, 64)
		if err != nil {
			return decodedCursor{}, cursorError()
		}
		lastValue = parsed
	case cursorValueString:
		lastValue = raw.LastValue
	case cursorValueTraceErrorFirst:
		parts := strings.SplitN(raw.LastValue, "|", 2)
		if len(parts) != 2 {
			return decodedCursor{}, cursorError()
		}
		parsed, err := time.Parse(time.RFC3339Nano, parts[1])
		if err != nil {
			return decodedCursor{}, cursorError()
		}
		switch parts[0] {
		case "1", "true", "error":
			lastValue = traceErrorFirstCursorValue{ErrorFirst: true, StartedAt: parsed.UTC()}
		case "0", "false", "ok":
			lastValue = traceErrorFirstCursorValue{ErrorFirst: false, StartedAt: parsed.UTC()}
		default:
			return decodedCursor{}, cursorError()
		}
	default:
		return decodedCursor{}, cursorError()
	}

	return decodedCursor{
		Sort:      raw.Sort,
		LastValue: lastValue,
		LastID:    raw.LastID,
	}, nil
}

func cursorError() error {
	return fmt.Errorf("ERR-003 INVALID_CURSOR: Invalid pagination cursor")
}

func pageCursor(sort string, lastValue time.Time, lastID string) *string {
	if lastValue.IsZero() || strings.TrimSpace(lastID) == "" {
		return nil
	}
	payload, err := json.Marshal(rawCursor{
		Sort:      sort,
		LastValue: lastValue.UTC().Format(time.RFC3339Nano),
		LastID:    lastID,
	})
	if err != nil {
		return nil
	}
	value := base64.RawURLEncoding.EncodeToString(payload)
	return &value
}

func pageCursorValue(sort string, lastValue string, lastID string) *string {
	if strings.TrimSpace(lastValue) == "" || strings.TrimSpace(lastID) == "" {
		return nil
	}
	payload, err := json.Marshal(rawCursor{
		Sort:      sort,
		LastValue: lastValue,
		LastID:    lastID,
	})
	if err != nil {
		return nil
	}
	value := base64.RawURLEncoding.EncodeToString(payload)
	return &value
}

func pageCursorTraceErrorFirst(sort string, errorFirst bool, startedAt time.Time, lastID string) *string {
	prefix := "0"
	if errorFirst {
		prefix = "1"
	}
	return pageCursorValue(sort, prefix+"|"+startedAt.UTC().Format(time.RFC3339Nano), lastID)
}
