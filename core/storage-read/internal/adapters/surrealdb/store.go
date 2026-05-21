//go:build surrealdb

package surrealdb

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	sdk "github.com/surrealdb/surrealdb.go"
)

type Store struct {
	DB *sdk.DB
}

var queryRowsMu sync.Mutex

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

func (store Store) SearchTraces(ctx context.Context, query contracts.TraceSearchQuery, authContext *contracts.AuthContext) (contracts.TraceSearchData, error) {
	limit, err := normalizedLimit(query.Limit)
	if err != nil {
		return contracts.TraceSearchData{}, err
	}
	stmt, err := BuildTraceSearchQuery(query, authContext)
	if err != nil {
		return contracts.TraceSearchData{}, err
	}
	items, err := queryRows[contracts.TraceSummary](ctx, store.DB, stmt)
	if err != nil {
		return contracts.TraceSearchData{}, storageError()
	}
	normalizeTraceSummaries(items)
	items, nextCursor := tracePage(items, limit)
	return contracts.TraceSearchData{Items: items, NextCursor: nextCursor}, nil
}

func (store Store) SearchLiveTraceCandidates(ctx context.Context, query contracts.LiveTraceQuery, traceIDs []string, authContext *contracts.AuthContext) ([]contracts.TraceSummary, error) {
	stmt, err := BuildLiveTraceCandidatesQuery(query, traceIDs, authContext)
	if err != nil {
		return nil, err
	}
	items, err := queryRows[contracts.TraceSummary](ctx, store.DB, stmt)
	if err != nil {
		return nil, storageError()
	}
	normalizeTraceSummaries(items)
	return items, nil
}

func (store Store) GetTraceDetail(ctx context.Context, traceID string, query *contracts.TraceDetailQuery, authContext *contracts.AuthContext) (*contracts.TraceDetailData, error) {
	traceStmt, err := BuildTraceByIDQuery(traceID, authContext)
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

	spansStmt, err := BuildSpansByTraceIDQuery(traceID, authContext)
	if err != nil {
		return nil, err
	}
	spans, err := queryRows[contracts.Span](ctx, store.DB, spansStmt)
	if err != nil {
		return nil, storageError()
	}
	normalizeSpans(spans)

	logsStmt, err := BuildLogsForTraceDetailQuery(traces[0], spans, authContext)
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

func (store Store) SearchLogs(ctx context.Context, query contracts.LogSearchQuery, authContext *contracts.AuthContext) (contracts.LogSearchData, error) {
	limit, err := normalizedLimit(query.Limit)
	if err != nil {
		return contracts.LogSearchData{}, err
	}
	stmt, err := BuildLogSearchQuery(query, authContext)
	if err != nil {
		return contracts.LogSearchData{}, err
	}
	items, err := queryRows[contracts.LogEvent](ctx, store.DB, stmt)
	if err != nil {
		return contracts.LogSearchData{}, storageError()
	}
	setLogCorrelations(items)
	items, nextCursor := logPage(items, limit)
	return contracts.LogSearchData{Items: items, NextCursor: nextCursor}, nil
}

func tracePage(items []contracts.TraceSummary, limit int) ([]contracts.TraceSummary, *string) {
	if limit < 1 || len(items) <= limit {
		return items, nil
	}
	page := items[:limit]
	last := page[len(page)-1]
	return page, pageCursor("startedAt_desc_traceId_asc", last.StartedAt, last.ID)
}

func logPage(items []contracts.LogEvent, limit int) ([]contracts.LogEvent, *string) {
	if limit < 1 || len(items) <= limit {
		return items, nil
	}
	page := items[:limit]
	last := page[len(page)-1]
	return page, pageCursor("timestamp_desc_logEventId_asc", last.Timestamp, last.ID)
}

func metricNamePage(items []contracts.MetricDescriptor, limit int) ([]contracts.MetricDescriptor, *string) {
	if limit < 1 || len(items) <= limit {
		return items, nil
	}
	page := items[:limit]
	last := page[len(page)-1]
	return page, pageCursor("lastSeenAt_desc_metricName_asc", last.LastSeenAt, last.Name)
}

func (store Store) GetTelemetryFacets(ctx context.Context, query contracts.TelemetryFacetQuery, authContext *contracts.AuthContext) (contracts.TelemetryFacetData, error) {
	stmts, err := BuildFacetQueries(query, authContext)
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
	limit, err := normalizedMetricNameLimit(input.Limit)
	if err != nil {
		return contracts.MetricNameSearchData{}, err
	}
	stmt, err := BuildMetricNameSearchQuery(input, authContext)
	if err != nil {
		return contracts.MetricNameSearchData{}, err
	}
	items, err := queryRows[contracts.MetricDescriptor](ctx, store.DB, stmt)
	if err != nil {
		return contracts.MetricNameSearchData{}, storageError()
	}
	normalizeMetricDescriptors(items)
	items, nextCursor := metricNamePage(items, limit)
	return contracts.MetricNameSearchData{Items: items, NextCursor: nextCursor}, nil
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

type countRow struct {
	Count int `json:"count"`
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
		if finiteNumber(typed) != typed {
			return nil
		}
		return &typed
	case float32:
		out := float64(typed)
		if finiteNumber(out) != out {
			return nil
		}
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

func normalizeTraceSummaries(items []contracts.TraceSummary) {
	for index := range items {
		if items[index].StartedAtUnixNano == "" && !items[index].StartedAt.IsZero() {
			items[index].StartedAtUnixNano = strconv.FormatInt(items[index].StartedAt.UnixNano(), 10)
		}
		if items[index].Attributes == nil {
			items[index].Attributes = contracts.Attributes{}
		}
	}
}

func queryRows[T any](ctx context.Context, db *sdk.DB, stmt QueryStatement) ([]T, error) {
	if db == nil {
		return nil, fmt.Errorf("storage database is not configured")
	}
	queryRowsMu.Lock()
	defer queryRowsMu.Unlock()
	if stmt.Target.Namespace != "" || stmt.Target.Database != "" {
		if err := db.Use(ctx, stmt.Target.Namespace, stmt.Target.Database); err != nil {
			return nil, err
		}
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
