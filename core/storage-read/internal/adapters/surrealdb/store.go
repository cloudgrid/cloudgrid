//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	sdk "github.com/surrealdb/surrealdb.go"
)

type Store struct {
	DB *sdk.DB
}

func (store Store) GetProjectTelemetryOverviews(ctx context.Context, request contracts.ProjectTelemetryOverviewRequest) (contracts.ProjectTelemetryOverviewData, error) {
	items := make([]contracts.ProjectTelemetryOverviewItem, 0, len(request.Projects))
	for _, project := range request.Projects {
		target, err := ResolveProjectTelemetryTarget(project, request.AuthContext)
		if err != nil {
			return contracts.ProjectTelemetryOverviewData{}, err
		}
		queries := BuildProjectTelemetryOverviewQueries(target)
		traceCount, err := store.queryCount(ctx, queries["traces"])
		if err != nil {
			return contracts.ProjectTelemetryOverviewData{}, storageError()
		}
		logCount, err := store.queryCount(ctx, queries["logs"])
		if err != nil {
			return contracts.ProjectTelemetryOverviewData{}, storageError()
		}
		metricCount, err := store.queryCount(ctx, queries["metrics"])
		if err != nil {
			return contracts.ProjectTelemetryOverviewData{}, storageError()
		}
		serviceCount, err := store.queryCount(ctx, queries["services"])
		if err != nil {
			return contracts.ProjectTelemetryOverviewData{}, storageError()
		}
		lastIngestAt, err := store.queryLastIngestAt(ctx, queries["lastIngest"])
		if err != nil {
			return contracts.ProjectTelemetryOverviewData{}, storageError()
		}
		items = append(items, contracts.ProjectTelemetryOverviewItem{
			TenantID:  target.TenantID,
			CompanyID: target.CompanyID,
			ProjectID: target.ProjectID,
			Telemetry: contracts.ProjectTelemetryOverview{
				LastIngestAt: lastIngestAt,
				TraceCount:   traceCount,
				LogCount:     logCount,
				MetricCount:  metricCount,
				ServiceCount: serviceCount,
			},
		})
	}
	return contracts.ProjectTelemetryOverviewData{Items: items}, nil
}

func (store Store) SearchTraces(ctx context.Context, query contracts.TraceSearchQuery) (contracts.TraceSearchData, error) {
	stmt, err := BuildTraceSearchQuery(query)
	if err != nil {
		return contracts.TraceSearchData{}, err
	}
	items, err := queryRows[contracts.TraceSummary](ctx, store.DB, stmt)
	if err != nil {
		return contracts.TraceSearchData{}, storageError()
	}
	if err := store.applyTraceSummaryCounts(ctx, items); err != nil {
		return contracts.TraceSearchData{}, storageError()
	}
	return contracts.TraceSearchData{Items: items}, nil
}

func (store Store) SearchLiveTraceCandidates(ctx context.Context, query contracts.LiveTraceQuery, traceIDs []string) ([]contracts.TraceSummary, error) {
	stmt, err := BuildLiveTraceCandidatesQuery(query, traceIDs)
	if err != nil {
		return nil, err
	}
	items, err := queryRows[contracts.TraceSummary](ctx, store.DB, stmt)
	if err != nil {
		return nil, storageError()
	}
	if err := store.applyTraceSummaryCounts(ctx, items); err != nil {
		return nil, storageError()
	}
	return items, nil
}

func (store Store) GetTraceDetail(ctx context.Context, traceID string, query *contracts.TraceDetailQuery) (*contracts.TraceDetailData, error) {
	traceStmt, err := BuildTraceByIDQuery(traceID)
	if err != nil {
		return nil, err
	}
	traces, err := queryRows[contracts.Trace](ctx, store.DB, traceStmt)
	if err != nil {
		return nil, storageError()
	}
	if len(traces) == 0 {
		return nil, fmt.Errorf("ERR-004 TRACE_NOT_FOUND: Trace was not found")
	}

	spansStmt, err := BuildSpansByTraceIDQuery(traceID)
	if err != nil {
		return nil, err
	}
	spans, err := queryRows[contracts.Span](ctx, store.DB, spansStmt)
	if err != nil {
		return nil, storageError()
	}
	normalizeSpans(spans)

	logsStmt, err := BuildLogsForTraceDetailQuery(traces[0], spans)
	if err != nil {
		return nil, err
	}
	logs, err := queryRows[contracts.LogEvent](ctx, store.DB, logsStmt)
	if err != nil {
		return nil, storageError()
	}
	setLogCorrelations(logs)

	data := buildTraceDetailData(traces[0], spans, logs, query)
	return &data, nil
}

func (store Store) SearchLogs(ctx context.Context, query contracts.LogSearchQuery) (contracts.LogSearchData, error) {
	stmt, err := BuildLogSearchQuery(query)
	if err != nil {
		return contracts.LogSearchData{}, err
	}
	items, err := queryRows[contracts.LogEvent](ctx, store.DB, stmt)
	if err != nil {
		return contracts.LogSearchData{}, storageError()
	}
	setLogCorrelations(items)
	return contracts.LogSearchData{Items: items}, nil
}

func (store Store) GetTelemetryFacets(ctx context.Context, query contracts.TelemetryFacetQuery) (contracts.TelemetryFacetData, error) {
	stmts, err := BuildFacetQueries(query)
	if err != nil {
		return contracts.TelemetryFacetData{}, err
	}
	limit, err := normalizedLimit(query.Limit)
	if err != nil {
		return contracts.TelemetryFacetData{}, err
	}
	services, err := queryRows[contracts.FacetValue](ctx, store.DB, stmts["services"])
	if err != nil {
		return contracts.TelemetryFacetData{}, storageError()
	}
	operations, err := queryRows[contracts.FacetValue](ctx, store.DB, stmts["operations"])
	if err != nil {
		return contracts.TelemetryFacetData{}, storageError()
	}
	spanNames, err := queryRows[contracts.FacetValue](ctx, store.DB, stmts["spanNames"])
	if err != nil {
		return contracts.TelemetryFacetData{}, storageError()
	}
	severities, err := queryRows[contracts.FacetValue](ctx, store.DB, stmts["severities"])
	if err != nil {
		return contracts.TelemetryFacetData{}, storageError()
	}
	attributeKeyRows, err := queryRows[[]string](ctx, store.DB, stmts["attributeKeys"])
	if err != nil {
		return contracts.TelemetryFacetData{}, storageError()
	}
	attributeKeys := facetValuesFromAttributeKeyRows(attributeKeyRows, query.Search, limit)
	return contracts.TelemetryFacetData{
		Services:      services,
		Operations:    operations,
		SpanNames:     spanNames,
		Severities:    severities,
		AttributeKeys: attributeKeys,
	}, nil
}

func facetValuesFromAttributeKeyRows(rows [][]string, search *string, limit int) []contracts.FacetValue {
	searchValue := strings.ToLower(strings.TrimSpace(pointerString(search)))
	counts := map[string]int{}
	for _, row := range rows {
		for _, key := range row {
			if key == "" {
				continue
			}
			if searchValue != "" && !strings.Contains(strings.ToLower(key), searchValue) {
				continue
			}
			counts[key]++
		}
	}
	values := make([]contracts.FacetValue, 0, len(counts))
	for key, count := range counts {
		values = append(values, contracts.FacetValue{Value: key, Count: count})
	}
	sort.Slice(values, func(i int, j int) bool {
		if values[i].Count == values[j].Count {
			return values[i].Value < values[j].Value
		}
		return values[i].Count > values[j].Count
	})
	if len(values) > limit {
		return values[:limit]
	}
	return values
}

func (store Store) SearchMetricNames(ctx context.Context, input contracts.MetricNameSearchInput, authContext *contracts.AuthContext) (contracts.MetricNameSearchData, error) {
	stmt, err := BuildMetricNameSearchQuery(input, authContext)
	if err != nil {
		return contracts.MetricNameSearchData{}, err
	}
	items, err := queryRows[contracts.MetricDescriptor](ctx, store.DB, stmt)
	if err != nil {
		return contracts.MetricNameSearchData{}, storageError()
	}
	normalizeMetricDescriptors(items)
	return contracts.MetricNameSearchData{Items: items}, nil
}

func (store Store) QueryMetricSeries(ctx context.Context, input contracts.MetricSeriesInput, authContext *contracts.AuthContext) (contracts.MetricSeriesData, error) {
	descriptorStmt, err := BuildMetricDescriptorByNameQuery(input.MetricName, authContext)
	if err != nil {
		return contracts.MetricSeriesData{}, err
	}
	descriptors, err := queryRows[contracts.MetricDescriptor](ctx, store.DB, descriptorStmt)
	if err != nil {
		return contracts.MetricSeriesData{}, storageError()
	}
	if len(descriptors) == 0 {
		return contracts.MetricSeriesData{}, validationError("metricName is not known")
	}
	normalizeMetricDescriptors(descriptors)
	descriptor := descriptors[0]

	seriesStmt, resolved, err := BuildMetricSeriesQuery(input, descriptor, authContext)
	if err != nil {
		return contracts.MetricSeriesData{}, err
	}
	rows, err := queryRows[metricBucketRow](ctx, store.DB, seriesStmt)
	if err != nil {
		return contracts.MetricSeriesData{}, storageError()
	}
	return contracts.MetricSeriesData{
		Metric:      descriptor,
		Aggregation: input.Aggregation,
		Interval:    resolved.Interval,
		GroupBy:     input.GroupBy,
		Series:      buildMetricSeries(rows, input.GroupBy),
		Warnings:    []contracts.MetricQueryWarning{},
	}, nil
}

func (store Store) queryCount(ctx context.Context, stmt QueryStatement) (int, error) {
	rows, err := queryRows[countRow](ctx, store.DB, stmt)
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	return rows[0].Count, nil
}

func (store Store) queryLastIngestAt(ctx context.Context, stmt QueryStatement) (*time.Time, error) {
	rows, err := queryRows[lastIngestRow](ctx, store.DB, stmt)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0].LastIngestAt, nil
}

func (store Store) applyTraceSummaryCounts(ctx context.Context, items []contracts.TraceSummary) error {
	if len(items) == 0 {
		return nil
	}
	traceIDs := make([]string, 0, len(items))
	indexByTraceID := map[string]int{}
	for index, item := range items {
		traceIDs = append(traceIDs, item.ID)
		indexByTraceID[item.ID] = index
	}
	target, err := ResolveTelemetryTarget(nil)
	if err != nil {
		return err
	}
	params := map[string]any{"traceIds": traceIDs}
	addOwnershipParams(params, target)

	spanCounts, err := queryRows[traceCountRow](ctx, store.DB, QueryStatement{
		SQL:    "SELECT traceId, count() AS count FROM span WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND traceId IN $traceIds GROUP BY traceId;",
		Params: params,
	})
	if err != nil {
		return err
	}
	for _, row := range spanCounts {
		if index, ok := indexByTraceID[row.TraceID]; ok {
			items[index].SpanCount = row.Count
		}
	}

	errorCounts, err := queryRows[traceCountRow](ctx, store.DB, QueryStatement{
		SQL:    "SELECT traceId, count() AS count FROM span WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND traceId IN $traceIds AND status = 'error' GROUP BY traceId;",
		Params: params,
	})
	if err != nil {
		return err
	}
	for _, row := range errorCounts {
		if index, ok := indexByTraceID[row.TraceID]; ok {
			items[index].ErrorSpanCount = row.Count
		}
	}

	logCounts, err := queryRows[traceCountRow](ctx, store.DB, QueryStatement{
		SQL:    "SELECT traceId, count() AS count FROM log_event WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND traceId IN $traceIds GROUP BY traceId;",
		Params: params,
	})
	if err != nil {
		return err
	}
	for _, row := range logCounts {
		if index, ok := indexByTraceID[row.TraceID]; ok {
			items[index].LogCount = row.Count
		}
	}

	serviceRows, err := queryRows[traceServiceRow](ctx, store.DB, QueryStatement{
		SQL:    "SELECT traceId, serviceName FROM span WHERE tenantId = $tenantId AND companyId = $companyId AND projectId = $projectId AND traceId IN $traceIds AND serviceName != NONE GROUP BY traceId, serviceName;",
		Params: params,
	})
	if err != nil {
		return err
	}
	serviceCounts := map[string]int{}
	for _, row := range serviceRows {
		if strings.TrimSpace(row.ServiceName) != "" {
			serviceCounts[row.TraceID]++
		}
	}
	for traceID, count := range serviceCounts {
		if index, ok := indexByTraceID[traceID]; ok {
			items[index].ServiceCount = count
		}
	}
	return nil
}

type countRow struct {
	Count int `json:"count"`
}

type traceCountRow struct {
	TraceID string `json:"traceId"`
	Count   int    `json:"count"`
}

type traceServiceRow struct {
	TraceID     string `json:"traceId"`
	ServiceName string `json:"serviceName"`
}

type lastIngestRow struct {
	LastIngestAt *time.Time `json:"lastIngestAt,omitempty"`
}

type metricBucketRow struct {
	Bucket    time.Time                  `json:"bucket"`
	Group0    any                        `json:"group0,omitempty"`
	Group1    any                        `json:"group1,omitempty"`
	Group2    any                        `json:"group2,omitempty"`
	Group3    any                        `json:"group3,omitempty"`
	Group4    any                        `json:"group4,omitempty"`
	Value     any                        `json:"value"`
	Count     any                        `json:"count,omitempty"`
	Exemplars []contracts.MetricExemplar `json:"exemplars,omitempty"`
}

func buildMetricSeries(rows []metricBucketRow, groupBy []string) []contracts.MetricSeries {
	if len(rows) == 0 {
		return []contracts.MetricSeries{}
	}
	seriesByKey := map[string]int{}
	series := []contracts.MetricSeries{}
	for _, row := range rows {
		labels := metricRowLabels(row, groupBy)
		key := metricLabelKey(labels, groupBy)
		index, exists := seriesByKey[key]
		if !exists {
			index = len(series)
			seriesByKey[key] = index
			series = append(series, contracts.MetricSeries{Labels: labels, Points: []contracts.MetricSeriesPoint{}})
		}
		exemplars := row.Exemplars
		if exemplars == nil {
			exemplars = []contracts.MetricExemplar{}
		}
		for exemplarIndex := range exemplars {
			if exemplars[exemplarIndex].Attributes == nil {
				exemplars[exemplarIndex].Attributes = contracts.Attributes{}
			}
		}
		count := optionalFloat(row.Count)
		series[index].Points = append(series[index].Points, contracts.MetricSeriesPoint{
			Timestamp: row.Bucket.UTC(),
			Value:     requiredFloat(row.Value),
			Count:     count,
			Exemplars: exemplars,
		})
	}
	return series
}

func requiredFloat(value any) float64 {
	out := optionalFloat(value)
	if out == nil {
		return 0
	}
	return *out
}

func optionalFloat(value any) *float64 {
	switch typed := value.(type) {
	case nil:
		return nil
	case float64:
		return &typed
	case float32:
		out := float64(typed)
		return &out
	case int:
		out := float64(typed)
		return &out
	case int64:
		out := float64(typed)
		return &out
	case int32:
		out := float64(typed)
		return &out
	case uint:
		out := float64(typed)
		return &out
	case uint64:
		out := float64(typed)
		return &out
	case uint32:
		out := float64(typed)
		return &out
	default:
		return nil
	}
}

func metricRowLabels(row metricBucketRow, groupBy []string) contracts.Attributes {
	labels := contracts.Attributes{}
	values := []any{row.Group0, row.Group1, row.Group2, row.Group3, row.Group4}
	for index, key := range groupBy {
		if index < len(values) {
			labels[key] = values[index]
		}
	}
	return labels
}

func metricLabelKey(labels contracts.Attributes, groupBy []string) string {
	if len(groupBy) == 0 {
		return "{}"
	}
	parts := make([]string, 0, len(groupBy))
	for _, key := range groupBy {
		parts = append(parts, fmt.Sprintf("%s=%v", key, labels[key]))
	}
	return strings.Join(parts, "\x00")
}

func normalizeMetricDescriptors(items []contracts.MetricDescriptor) {
	for index := range items {
		if items[index].AttributeKeys == nil {
			items[index].AttributeKeys = []string{}
		}
	}
}

func setLogCorrelations(logs []contracts.LogEvent) {
	for index := range logs {
		if logs[index].Attributes == nil {
			logs[index].Attributes = contracts.Attributes{}
		}
		correlation := contracts.LogCorrelationNone
		if logs[index].TraceID != nil {
			correlation = contracts.LogCorrelationTrace
		}
		if logs[index].SpanID != nil {
			correlation = contracts.LogCorrelationSpan
		}
		logs[index].Correlation = &correlation
	}
}

func normalizeSpans(spans []contracts.Span) {
	for index := range spans {
		if spans[index].Attributes == nil {
			spans[index].Attributes = contracts.Attributes{}
		}
		if spans[index].Events == nil {
			spans[index].Events = []contracts.SpanEvent{}
		}
		if spans[index].Links == nil {
			spans[index].Links = []contracts.SpanLink{}
		}
		for linkIndex := range spans[index].Links {
			if spans[index].Links[linkIndex].Attributes == nil {
				spans[index].Links[linkIndex].Attributes = contracts.Attributes{}
			}
			if spans[index].Links[linkIndex].Direction == nil {
				direction := contracts.SpanLinkDirectionUnknown
				spans[index].Links[linkIndex].Direction = &direction
			}
		}
		for eventIndex := range spans[index].Events {
			if spans[index].Events[eventIndex].Attributes == nil {
				spans[index].Events[eventIndex].Attributes = contracts.Attributes{}
			}
		}
	}
}

func queryRows[T any](ctx context.Context, db *sdk.DB, stmt QueryStatement) ([]T, error) {
	if db == nil {
		return nil, fmt.Errorf("storage database is not configured")
	}
	results, err := sdk.Query[[]T](ctx, db, stmt.SQL, stmt.Params)
	if err != nil {
		return nil, err
	}
	if results == nil || len(*results) == 0 {
		return nil, fmt.Errorf("empty SurrealDB query result")
	}
	result := (*results)[0]
	if result.Error != nil {
		return nil, result.Error
	}
	if result.Result == nil {
		return []T{}, nil
	}
	return result.Result, nil
}

func storageError() error {
	return fmt.Errorf("ERR-006 STORAGE_UNAVAILABLE: Storage is unavailable")
}
