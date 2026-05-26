//go:build surrealdb

package surrealdb

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

const (
	defaultMetricNameLimit  = 50
	maxMetricNameLimit      = 200
	defaultMetricPointLimit = 1000
	maxMetricGroupByKeys    = 5
	defaultMetricBuckets    = 300
)

var maxMetricPointLimit = 5000

func ConfigureMetricLimits(maxMetricPoints int) {
	if maxMetricPoints > 0 {
		maxMetricPointLimit = maxMetricPoints
	}
}

type ResolvedMetricSeriesQuery struct {
	Interval string
	Limit    int
}

func BuildMetricNameSearchQuery(input contracts.MetricNameSearchInput, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	limit, err := normalizedMetricNameLimit(input.Limit)
	if err != nil {
		return QueryStatement{}, err
	}
	if err := validateTimeRange(input.From, input.To); err != nil {
		return QueryStatement{}, err
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}

	params := map[string]any{"limit": limit + 1}
	addOwnershipParams(params, target)
	conditions := retentionVisibleConditions()
	pointConditions := retentionVisibleConditions()
	sortSpec := metricNameSearchSortSpec(input.Sort)
	if input.Query != nil && strings.TrimSpace(*input.Query) != "" {
		conditions = append(conditions, "searchText @AND@ $query")
		params["query"] = strings.ToLower(strings.TrimSpace(*input.Query))
	}
	if input.From != nil {
		conditions = append(conditions, "lastSeenAt >= $from")
		pointConditions = append(pointConditions, "timestamp >= $from")
		params["from"] = input.From.UTC()
	}
	if input.To != nil {
		conditions = append(conditions, "firstSeenAt <= $to")
		pointConditions = append(pointConditions, "timestamp <= $to")
		params["to"] = input.To.UTC()
	}
	if services := normalizedServiceFilters(input.Service, input.Services); len(services) > 0 {
		pointConditions = append(pointConditions, "serviceName IN $services")
		params["services"] = services
		conditions = append(conditions, "metricName IN (SELECT VALUE metricName FROM metric_point "+whereClause(pointConditions)+")")
	}
	if input.Cursor != nil && strings.TrimSpace(*input.Cursor) != "" {
		cursor, err := decodeCursorForSort(*input.Cursor, sortSpec.cursorSort, sortSpec.valueKind)
		if err != nil {
			return QueryStatement{}, err
		}
		conditions = append(conditions, sortSpec.cursorCondition)
		params["cursorValue"] = cursor.LastValue
		params["cursorId"] = cursor.LastID
	}

	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT metricName AS id, metricName AS name, description, unit, kind, aggregationTemporality, monotonic, attributeKeys, firstSeenAt, lastSeenAt",
			"FROM metric_descriptor",
			whereClause(conditions),
			sortSpec.orderBy,
			"LIMIT $limit;",
		}, " "),
		Params: params,
		Target: target,
	}, nil
}

func BuildMetricDescriptorByNameQuery(metricName string, authContext ...*contracts.AuthContext) (QueryStatement, error) {
	metricName = strings.TrimSpace(metricName)
	if metricName == "" {
		return QueryStatement{}, validationError("metricName is required")
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, err
	}
	params := map[string]any{"metricName": metricName}
	addOwnershipParams(params, target)
	return QueryStatement{
		SQL: strings.Join([]string{
			"SELECT metricName AS id, metricName AS name, description, unit, kind, aggregationTemporality, monotonic, attributeKeys, firstSeenAt, lastSeenAt",
			"FROM metric_descriptor",
			whereClause(append(retentionVisibleConditions(), "metricName = $metricName")),
			"LIMIT 1;",
		}, " "),
		Params: params,
		Target: target,
	}, nil
}

func BuildMetricSeriesQuery(input contracts.MetricSeriesInput, descriptor contracts.MetricDescriptor, authContext ...*contracts.AuthContext) (QueryStatement, ResolvedMetricSeriesQuery, error) {
	if err := validateMetricSeriesInput(input, descriptor); err != nil {
		return QueryStatement{}, ResolvedMetricSeriesQuery{}, err
	}
	limit, err := normalizedMetricPointLimit(input.Limit)
	if err != nil {
		return QueryStatement{}, ResolvedMetricSeriesQuery{}, err
	}
	interval, err := resolveMetricInterval(input.Interval, input.From, input.To)
	if err != nil {
		return QueryStatement{}, ResolvedMetricSeriesQuery{}, err
	}
	target, err := ResolveTelemetryTarget(firstAuthContext(authContext))
	if err != nil {
		return QueryStatement{}, ResolvedMetricSeriesQuery{}, err
	}

	params := map[string]any{
		"metricName":      strings.TrimSpace(input.MetricName),
		"from":            input.From.UTC(),
		"to":              input.To.UTC(),
		"limit":           limit,
		"intervalSeconds": int64(math.Ceil(interval.Seconds())),
	}
	addOwnershipParams(params, target)
	conditions := append(retentionVisibleConditions(), "metricName = $metricName", "timestamp >= $from", "timestamp <= $to")
	for index, filter := range input.Filters {
		condition, err := attributeFilterCondition(filter, index, params)
		if err != nil {
			return QueryStatement{}, ResolvedMetricSeriesQuery{}, err
		}
		conditions = append(conditions, condition)
	}

	groupSelects := make([]string, 0, len(input.GroupBy))
	groupColumns := []string{"bucket"}
	for index, key := range input.GroupBy {
		param := fmt.Sprintf("groupBy%d", index)
		column := fmt.Sprintf("group%d", index)
		params[param] = key
		groupSelects = append(groupSelects, fmt.Sprintf("attributes[$%s] AS %s", param, column))
		groupColumns = append(groupColumns, column)
	}

	selects := []string{
		fmt.Sprintf("time::floor(timestamp, %s) AS bucket", surrealDurationLiteral(interval)),
	}
	selects = append(selects, groupSelects...)
	selects = append(selects, metricAggregationSelect(input.Aggregation, descriptor.Kind))
	selects = append(selects, "array::flatten(array::group(exemplars)) AS exemplars")
	orderBy := metricSeriesOrderBy(input.Sort, groupColumns[1:])

	return QueryStatement{
			SQL: strings.Join([]string{
				"SELECT " + strings.Join(selects, ", "),
				"FROM metric_point",
				whereClause(conditions),
				"GROUP BY " + strings.Join(groupColumns, ", "),
				orderBy,
				"LIMIT $limit;",
			}, " "),
			Params: params,
			Target: target,
		}, ResolvedMetricSeriesQuery{
			Interval: formatMetricInterval(interval),
			Limit:    limit,
		}, nil
}

func surrealDurationLiteral(duration time.Duration) string {
	seconds := int64(math.Ceil(duration.Seconds()))
	if seconds < 1 {
		seconds = 1
	}
	return fmt.Sprintf("%ds", seconds)
}

func validateMetricSeriesInput(input contracts.MetricSeriesInput, descriptor contracts.MetricDescriptor) error {
	if strings.TrimSpace(input.MetricName) == "" {
		return validationError("metricName is required")
	}
	if input.From.IsZero() || input.To.IsZero() || !input.From.Before(input.To) {
		return validationError("from must be before to")
	}
	if descriptor.Name != "" && descriptor.Name != strings.TrimSpace(input.MetricName) {
		return validationError("metricName does not match descriptor")
	}
	if len(input.GroupBy) > maxMetricGroupByKeys {
		return validationError("groupBy accepts at most 5 keys")
	}
	attributeKeys := map[string]bool{}
	for _, key := range descriptor.AttributeKeys {
		attributeKeys[key] = true
	}
	seenGroup := map[string]bool{}
	for _, key := range input.GroupBy {
		key = strings.TrimSpace(key)
		if key == "" {
			return validationError("groupBy key is required")
		}
		if seenGroup[key] {
			return validationError("groupBy keys must be unique")
		}
		seenGroup[key] = true
		if !attributeKeys[key] {
			return validationError("groupBy key is not available for this metric")
		}
	}
	if !metricAggregationAllowed(descriptor.Kind, input.Aggregation) {
		return validationError("aggregation is not supported for this metric kind")
	}
	return nil
}

func metricAggregationAllowed(kind contracts.MetricKind, aggregation contracts.MetricAggregation) bool {
	allowed := map[contracts.MetricKind]map[contracts.MetricAggregation]bool{
		contracts.MetricKindGauge: {
			contracts.MetricAggregationAvg: true, contracts.MetricAggregationMin: true, contracts.MetricAggregationMax: true, contracts.MetricAggregationCount: true,
		},
		contracts.MetricKindSum: {
			contracts.MetricAggregationSum: true, contracts.MetricAggregationRate: true, contracts.MetricAggregationCount: true,
		},
		contracts.MetricKindHistogram: {
			contracts.MetricAggregationAvg: true, contracts.MetricAggregationCount: true, contracts.MetricAggregationSum: true, contracts.MetricAggregationP50: true, contracts.MetricAggregationP90: true, contracts.MetricAggregationP95: true, contracts.MetricAggregationP99: true,
		},
		contracts.MetricKindExponentialHistogram: {
			contracts.MetricAggregationAvg: true, contracts.MetricAggregationCount: true, contracts.MetricAggregationSum: true, contracts.MetricAggregationP50: true, contracts.MetricAggregationP90: true, contracts.MetricAggregationP95: true, contracts.MetricAggregationP99: true,
		},
		contracts.MetricKindSummary: {
			contracts.MetricAggregationAvg: true, contracts.MetricAggregationCount: true, contracts.MetricAggregationP50: true, contracts.MetricAggregationP90: true, contracts.MetricAggregationP95: true, contracts.MetricAggregationP99: true,
		},
	}
	return allowed[kind][aggregation]
}

func metricAggregationSelect(aggregation contracts.MetricAggregation, kind contracts.MetricKind) string {
	switch aggregation {
	case contracts.MetricAggregationAvg:
		if kind == contracts.MetricKindHistogram || kind == contracts.MetricKindExponentialHistogram || kind == contracts.MetricKindSummary {
			return "math::sum(sum) / math::sum(count) AS value, math::sum(count) AS count"
		}
		return "math::mean(value) AS value, count() AS count"
	case contracts.MetricAggregationSum:
		if kind == contracts.MetricKindHistogram || kind == contracts.MetricKindExponentialHistogram || kind == contracts.MetricKindSummary {
			return "math::sum(sum) AS value, math::sum(count) AS count"
		}
		return "math::sum(value) AS value, count() AS count"
	case contracts.MetricAggregationMin:
		return "math::min(value) AS value, count() AS count"
	case contracts.MetricAggregationMax:
		return "math::max(value) AS value, count() AS count"
	case contracts.MetricAggregationCount:
		return "count() AS value, count() AS count"
	case contracts.MetricAggregationRate:
		return "(math::sum(value) / $intervalSeconds) AS value, count() AS count"
	case contracts.MetricAggregationP50:
		return "math::percentile(array::flatten(array::group(quantileValues.value)), 50) AS value, math::sum(count) AS count"
	case contracts.MetricAggregationP90:
		return "math::percentile(array::flatten(array::group(quantileValues.value)), 90) AS value, math::sum(count) AS count"
	case contracts.MetricAggregationP95:
		return "math::percentile(array::flatten(array::group(quantileValues.value)), 95) AS value, math::sum(count) AS count"
	case contracts.MetricAggregationP99:
		return "math::percentile(array::flatten(array::group(quantileValues.value)), 99) AS value, math::sum(count) AS count"
	default:
		return "count() AS value, count() AS count"
	}
}

func metricNameSearchSortSpec(sort *contracts.MetricNameSort) querySortSpec {
	if sort == nil {
		return querySortSpec{
			cursorSort:      "lastSeenAt_desc_metricName_asc",
			cursorCondition: "(lastSeenAt < $cursorValue OR (lastSeenAt = $cursorValue AND metricName > $cursorId))",
			orderBy:         "ORDER BY lastSeenAt DESC, metricName ASC",
			valueKind:       cursorValueTime,
		}
	}
	switch *sort {
	case contracts.MetricNameSortLastSeenAtAsc:
		return querySortSpec{
			cursorSort:      "lastSeenAt_asc_metricName_asc",
			cursorCondition: "(lastSeenAt > $cursorValue OR (lastSeenAt = $cursorValue AND metricName > $cursorId))",
			orderBy:         "ORDER BY lastSeenAt ASC, metricName ASC",
			valueKind:       cursorValueTime,
		}
	case contracts.MetricNameSortNameAsc:
		return querySortSpec{
			cursorSort:      "name_asc_metricName_asc",
			cursorCondition: "metricName > $cursorValue",
			orderBy:         "ORDER BY metricName ASC",
			valueKind:       cursorValueString,
		}
	case contracts.MetricNameSortNameDesc:
		return querySortSpec{
			cursorSort:      "name_desc_metricName_asc",
			cursorCondition: "metricName < $cursorValue",
			orderBy:         "ORDER BY metricName DESC",
			valueKind:       cursorValueString,
		}
	case contracts.MetricNameSortKindAsc:
		return querySortSpec{
			cursorSort:      "kind_asc_metricName_asc",
			cursorCondition: "(kind > $cursorValue OR (kind = $cursorValue AND metricName > $cursorId))",
			orderBy:         "ORDER BY kind ASC, metricName ASC",
			valueKind:       cursorValueString,
		}
	default:
		return metricNameSearchSortSpec(nil)
	}
}

func metricSeriesOrderBy(sort *contracts.MetricSeriesSort, groupTieBreakers []string) string {
	tieBreakers := make([]string, 0, 1+len(groupTieBreakers))
	appendGroupTieBreakers := func(columns []string) []string {
		for _, column := range groupTieBreakers {
			columns = append(columns, column+" ASC")
		}
		return columns
	}
	if sort == nil {
		return "ORDER BY " + strings.Join(appendGroupTieBreakers([]string{"bucket ASC"}), ", ")
	}
	switch *sort {
	case contracts.MetricSeriesSortTimestampDesc:
		return "ORDER BY " + strings.Join(appendGroupTieBreakers([]string{"bucket DESC"}), ", ")
	case contracts.MetricSeriesSortValueDesc:
		tieBreakers = append(tieBreakers, "value DESC", "bucket ASC")
		return "ORDER BY " + strings.Join(appendGroupTieBreakers(tieBreakers), ", ")
	case contracts.MetricSeriesSortValueAsc:
		tieBreakers = append(tieBreakers, "value ASC", "bucket ASC")
		return "ORDER BY " + strings.Join(appendGroupTieBreakers(tieBreakers), ", ")
	default:
		return "ORDER BY " + strings.Join(appendGroupTieBreakers([]string{"bucket ASC"}), ", ")
	}
}

func normalizedMetricNameLimit(limit *int) (int, error) {
	if limit == nil {
		return defaultMetricNameLimit, nil
	}
	if *limit < 1 || *limit > maxMetricNameLimit {
		return 0, validationError(fmt.Sprintf("limit must be between 1 and %d", maxMetricNameLimit))
	}
	return *limit, nil
}

func normalizedMetricPointLimit(limit *int) (int, error) {
	if limit == nil {
		return defaultMetricPointLimit, nil
	}
	if *limit < 1 || *limit > maxMetricPointLimit {
		return 0, validationError(fmt.Sprintf("limit must be between 1 and %d", maxMetricPointLimit))
	}
	return *limit, nil
}

func resolveMetricInterval(input *string, from time.Time, to time.Time) (time.Duration, error) {
	if input != nil && strings.TrimSpace(*input) != "" {
		interval, err := parseMetricInterval(*input)
		if err != nil {
			return 0, err
		}
		if interval <= 0 {
			return 0, validationError("interval must be positive")
		}
		return interval, nil
	}
	seconds := int64(math.Ceil(to.Sub(from).Seconds() / defaultMetricBuckets))
	if seconds < 1 {
		seconds = 1
	}
	return time.Duration(seconds) * time.Second, nil
}

func parseMetricInterval(value string) (time.Duration, error) {
	value = strings.TrimSpace(value)
	if duration, err := time.ParseDuration(value); err == nil {
		return duration, nil
	}
	isoPattern := regexp.MustCompile(`^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$`)
	matches := isoPattern.FindStringSubmatch(strings.ToUpper(value))
	if matches == nil {
		return 0, validationError("interval must be a Go duration or ISO-8601 time duration")
	}
	var duration time.Duration
	for index, unit := range []time.Duration{time.Hour, time.Minute, time.Second} {
		part := matches[index+1]
		if part == "" {
			continue
		}
		amount, err := strconv.Atoi(part)
		if err != nil {
			return 0, validationError("interval is invalid")
		}
		duration += time.Duration(amount) * unit
	}
	if duration <= 0 {
		return 0, validationError("interval must be positive")
	}
	return duration, nil
}

func formatMetricInterval(interval time.Duration) string {
	if interval%time.Hour == 0 {
		return fmt.Sprintf("PT%dH", int(interval/time.Hour))
	}
	if interval%time.Minute == 0 {
		return fmt.Sprintf("PT%dM", int(interval/time.Minute))
	}
	return fmt.Sprintf("PT%dS", int(math.Ceil(interval.Seconds())))
}
