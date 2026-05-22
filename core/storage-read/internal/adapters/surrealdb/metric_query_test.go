//go:build surrealdb

package surrealdb

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestBuildMetricNameSearchQueryFiltersAndOrdersDescriptors(t *testing.T) {
	queryText := "duration"
	service := "api"
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	limit := 25

	stmt, err := BuildMetricNameSearchQuery(contracts.MetricNameSearchInput{
		Query:   &queryText,
		Service: &service,
		From:    &from,
		To:      &to,
		Limit:   &limit,
	})
	if err != nil {
		t.Fatalf("BuildMetricNameSearchQuery returned error: %v", err)
	}

	for _, want := range []string{
		"FROM metric_descriptor",
		"deletedAt = NONE",
		"searchText @AND@ $query",
		"lastSeenAt >= $from",
		"firstSeenAt <= $to",
		"metricName IN (SELECT VALUE metricName FROM metric_point",
		"serviceName IN $services",
		"ORDER BY lastSeenAt DESC, metricName ASC",
		"LIMIT $limit",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("metric name SQL missing %q:\n%s", want, stmt.SQL)
		}
	}
	if services, ok := stmt.Params["services"].([]string); !ok || len(services) != 1 || services[0] != service || stmt.Params["query"] != "duration" || stmt.Params["limit"] != limit+1 {
		t.Fatalf("params = %#v, want query/service/limit+1 sentinel", stmt.Params)
	}
}

func TestBuildMetricNameSearchQueryAppliesCursor(t *testing.T) {
	cursorTime := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	cursor := encodeCursor(t, "lastSeenAt_desc_metricName_asc", cursorTime.Format(time.RFC3339Nano), "requests")

	stmt, err := BuildMetricNameSearchQuery(contracts.MetricNameSearchInput{Cursor: &cursor})
	if err != nil {
		t.Fatalf("BuildMetricNameSearchQuery returned error: %v", err)
	}

	for _, want := range []string{
		"lastSeenAt < $cursorValue",
		"lastSeenAt = $cursorValue AND metricName > $cursorId",
		"ORDER BY lastSeenAt DESC, metricName ASC",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("metric name SQL missing %q:\n%s", want, stmt.SQL)
		}
	}
	if stmt.Params["cursorValue"] != cursorTime || stmt.Params["cursorId"] != "requests" {
		t.Fatalf("params = %#v, want decoded cursor", stmt.Params)
	}
}

func TestBuildMetricNameSearchQueryUsesRequestedSortAndCursor(t *testing.T) {
	sort := contracts.MetricNameSortNameAsc
	cursor := encodeCursor(t, "name_asc_metricName_asc", "checkout.duration", "checkout.duration")

	stmt, err := BuildMetricNameSearchQuery(contracts.MetricNameSearchInput{
		Sort:   &sort,
		Cursor: &cursor,
	})
	if err != nil {
		t.Fatalf("BuildMetricNameSearchQuery returned error: %v", err)
	}

	for _, want := range []string{
		"metricName > $cursorValue",
		"ORDER BY metricName ASC",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("metric name SQL missing %q:\n%s", want, stmt.SQL)
		}
	}
}

func TestBuildMetricNameSearchQueryUsesEverySupportedSortAndCursor(t *testing.T) {
	cursorTime := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	tests := []struct {
		name       string
		sort       contracts.MetricNameSort
		cursorSort string
		lastValue  string
		wantSQL    []string
	}{
		{
			name:       "last seen asc",
			sort:       contracts.MetricNameSortLastSeenAtAsc,
			cursorSort: "lastSeenAt_asc_metricName_asc",
			lastValue:  cursorTime.Format(time.RFC3339Nano),
			wantSQL:    []string{"lastSeenAt > $cursorValue", "lastSeenAt = $cursorValue AND metricName > $cursorId", "ORDER BY lastSeenAt ASC, metricName ASC"},
		},
		{
			name:       "name desc",
			sort:       contracts.MetricNameSortNameDesc,
			cursorSort: "name_desc_metricName_asc",
			lastValue:  "queue.depth",
			wantSQL:    []string{"metricName < $cursorValue", "ORDER BY metricName DESC"},
		},
		{
			name:       "kind asc",
			sort:       contracts.MetricNameSortKindAsc,
			cursorSort: "kind_asc_metricName_asc",
			lastValue:  string(contracts.MetricKindGauge),
			wantSQL:    []string{"kind > $cursorValue", "kind = $cursorValue AND metricName > $cursorId", "ORDER BY kind ASC, metricName ASC"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cursor := encodeCursor(t, tt.cursorSort, tt.lastValue, "queue.depth")
			stmt, err := BuildMetricNameSearchQuery(contracts.MetricNameSearchInput{Sort: &tt.sort, Cursor: &cursor})
			if err != nil {
				t.Fatalf("BuildMetricNameSearchQuery returned error: %v", err)
			}
			for _, want := range tt.wantSQL {
				if !strings.Contains(stmt.SQL, want) {
					t.Fatalf("metric name SQL missing %q:\n%s", want, stmt.SQL)
				}
			}
		})
	}
}

func TestMetricNamePageReturnsCursor(t *testing.T) {
	now := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	items := []contracts.MetricDescriptor{
		{Name: "requests", LastSeenAt: now},
		{Name: "latency", LastSeenAt: now.Add(-time.Minute)},
	}

	page, cursor := metricNamePage(items, 1, nil)
	if len(page) != 1 || page[0].Name != "requests" || cursor == nil {
		t.Fatalf("metric page = %#v cursor=%v, want first item and cursor", page, cursor)
	}

	decoded, err := decodeCursor(*cursor, "lastSeenAt_desc_metricName_asc")
	if err != nil {
		t.Fatalf("decode cursor: %v", err)
	}
	cursorValue, ok := decoded.LastValue.(time.Time)
	if !ok || !cursorValue.Equal(now) || decoded.LastID != "requests" {
		t.Fatalf("cursor = %#v, want requests at %s", decoded, now)
	}
}

func TestBuildMetricSeriesQueryValidatesDescriptorAndBuildsGroupedBuckets(t *testing.T) {
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	limit := 500
	input := contracts.MetricSeriesInput{
		MetricName:  "http.server.duration",
		From:        from,
		To:          to,
		Aggregation: contracts.MetricAggregationP95,
		GroupBy:     []string{"service.name", "http.method"},
		Filters: []contracts.AttributeFilter{
			{Key: "env", Operator: contracts.AttributeFilterOperatorEQ, Value: "prod"},
		},
		Limit: &limit,
	}
	descriptor := contracts.MetricDescriptor{
		Name:          "http.server.duration",
		Kind:          contracts.MetricKindHistogram,
		AttributeKeys: []string{"service.name", "http.method", "env"},
	}

	stmt, resolved, err := BuildMetricSeriesQuery(input, descriptor)
	if err != nil {
		t.Fatalf("BuildMetricSeriesQuery returned error: %v", err)
	}

	for _, want := range []string{
		"FROM metric_point",
		"deletedAt = NONE",
		"time::floor(timestamp, ",
		"metricName = $metricName",
		"timestamp >= $from",
		"timestamp <= $to",
		"attributes[$attributeKey0] = $attributeValue0",
		"attributes[$groupBy0] AS group0",
		"attributes[$groupBy1] AS group1",
		"percentile",
		"exemplars",
		"GROUP BY bucket, group0, group1",
		"ORDER BY bucket ASC",
		"LIMIT $limit",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("metric series SQL missing %q:\n%s", want, stmt.SQL)
		}
	}
	if resolved.Interval == "" || stmt.Params["intervalSeconds"] == nil {
		t.Fatalf("resolved interval/params = %#v %#v, want interval seconds", resolved, stmt.Params)
	}
	if strings.Contains(stmt.SQL, "$intervalSeconds * 1s") {
		t.Fatalf("metric series SQL must not compute bucket duration from a numeric parameter:\n%s", stmt.SQL)
	}
}

func TestBuildMetricSeriesQueryUsesRequestedResultSort(t *testing.T) {
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	sort := contracts.MetricSeriesSortValueDesc
	stmt, _, err := BuildMetricSeriesQuery(contracts.MetricSeriesInput{
		MetricName:  "queue.depth",
		From:        from,
		To:          to,
		Aggregation: contracts.MetricAggregationAvg,
		Sort:        &sort,
	}, contracts.MetricDescriptor{
		Name: "queue.depth",
		Kind: contracts.MetricKindGauge,
	})
	if err != nil {
		t.Fatalf("BuildMetricSeriesQuery returned error: %v", err)
	}
	if !strings.Contains(stmt.SQL, "ORDER BY value DESC, bucket ASC") {
		t.Fatalf("metric series SQL missing backend value sort:\n%s", stmt.SQL)
	}
}

func TestBuildMetricSeriesQueryUsesEverySupportedSortWithGroupTieBreakers(t *testing.T) {
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	descriptor := contracts.MetricDescriptor{
		Name:          "queue.depth",
		Kind:          contracts.MetricKindGauge,
		AttributeKeys: []string{"service.name"},
	}
	tests := []struct {
		name    string
		sort    *contracts.MetricSeriesSort
		wantSQL string
	}{
		{name: "default timestamp asc", wantSQL: "ORDER BY bucket ASC, group0 ASC"},
		{name: "timestamp asc", sort: ptrMetricSeriesSort(contracts.MetricSeriesSortTimestampAsc), wantSQL: "ORDER BY bucket ASC, group0 ASC"},
		{name: "timestamp desc", sort: ptrMetricSeriesSort(contracts.MetricSeriesSortTimestampDesc), wantSQL: "ORDER BY bucket DESC, group0 ASC"},
		{name: "value desc", sort: ptrMetricSeriesSort(contracts.MetricSeriesSortValueDesc), wantSQL: "ORDER BY value DESC, bucket ASC, group0 ASC"},
		{name: "value asc", sort: ptrMetricSeriesSort(contracts.MetricSeriesSortValueAsc), wantSQL: "ORDER BY value ASC, bucket ASC, group0 ASC"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stmt, _, err := BuildMetricSeriesQuery(contracts.MetricSeriesInput{
				MetricName:  "queue.depth",
				From:        from,
				To:          to,
				Aggregation: contracts.MetricAggregationAvg,
				GroupBy:     []string{"service.name"},
				Sort:        tt.sort,
			}, descriptor)
			if err != nil {
				t.Fatalf("BuildMetricSeriesQuery returned error: %v", err)
			}
			if !strings.Contains(stmt.SQL, tt.wantSQL) {
				t.Fatalf("metric series SQL missing %q:\n%s", tt.wantSQL, stmt.SQL)
			}
		})
	}
}

func ptrMetricSeriesSort(sort contracts.MetricSeriesSort) *contracts.MetricSeriesSort {
	return &sort
}

func TestBuildMetricSeriesQueryRejectsUnsupportedAggregationAndGrouping(t *testing.T) {
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	descriptor := contracts.MetricDescriptor{
		Name:          "queue.depth",
		Kind:          contracts.MetricKindGauge,
		AttributeKeys: []string{"env"},
	}

	_, _, err := BuildMetricSeriesQuery(contracts.MetricSeriesInput{
		MetricName:  "queue.depth",
		From:        from,
		To:          to,
		Aggregation: contracts.MetricAggregationRate,
	}, descriptor)
	if err == nil || !strings.Contains(err.Error(), "ERR-001") {
		t.Fatalf("unsupported aggregation error = %v, want ERR-001", err)
	}

	_, _, err = BuildMetricSeriesQuery(contracts.MetricSeriesInput{
		MetricName:  "queue.depth",
		From:        from,
		To:          to,
		Aggregation: contracts.MetricAggregationAvg,
		GroupBy:     []string{"missing"},
	}, descriptor)
	if err == nil || !strings.Contains(err.Error(), "groupBy") {
		t.Fatalf("unsupported groupBy error = %v, want groupBy validation", err)
	}
}

func TestBuildMetricSeriesNormalizesNonFiniteValues(t *testing.T) {
	series := buildMetricSeries([]metricBucketRow{{
		Bucket: time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC),
		Group0: "checkout",
		Value:  math.NaN(),
		Count:  math.Inf(1),
	}}, []string{"service.name"})

	if len(series) != 1 || len(series[0].Points) != 1 {
		t.Fatalf("series = %#v, want one point", series)
	}
	point := series[0].Points[0]
	if point.Value != 0 || point.Count != nil {
		t.Fatalf("point = %#v, want finite value and omitted count", point)
	}
	if _, err := json.Marshal(series); err != nil {
		t.Fatalf("normalized series must be JSON encodable: %v", err)
	}
}

func TestBuildMetricSeriesQueryUsesFlatAggregatesForGaugeAverage(t *testing.T) {
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	stmt, _, err := BuildMetricSeriesQuery(contracts.MetricSeriesInput{
		MetricName:  "queue.depth",
		From:        from,
		To:          to,
		Aggregation: contracts.MetricAggregationAvg,
	}, contracts.MetricDescriptor{
		Name: "queue.depth",
		Kind: contracts.MetricKindGauge,
	})
	if err != nil {
		t.Fatalf("BuildMetricSeriesQuery returned error: %v", err)
	}
	for _, forbidden := range []string{"math::max([", "math::sum(count), count()", "??"} {
		if strings.Contains(stmt.SQL, forbidden) {
			t.Fatalf("metric series SQL contains nested/null-coalesced aggregate %q:\n%s", forbidden, stmt.SQL)
		}
	}
	if !strings.Contains(stmt.SQL, "math::mean(value) AS value, count() AS count") {
		t.Fatalf("metric series SQL missing flat gauge average:\n%s", stmt.SQL)
	}
}

func TestMetricQueryHelpersCoverSupportedAggregationsAndIntervals(t *testing.T) {
	tests := []struct {
		name        string
		kind        contracts.MetricKind
		aggregation contracts.MetricAggregation
		wantSQL     string
	}{
		{name: "histogram sum", kind: contracts.MetricKindHistogram, aggregation: contracts.MetricAggregationSum, wantSQL: "math::sum(sum) AS value"},
		{name: "sum rate", kind: contracts.MetricKindSum, aggregation: contracts.MetricAggregationRate, wantSQL: "math::sum(value) / $intervalSeconds"},
		{name: "gauge min", kind: contracts.MetricKindGauge, aggregation: contracts.MetricAggregationMin, wantSQL: "math::min(value) AS value"},
		{name: "gauge max", kind: contracts.MetricKindGauge, aggregation: contracts.MetricAggregationMax, wantSQL: "math::max(value) AS value"},
		{name: "summary p99", kind: contracts.MetricKindSummary, aggregation: contracts.MetricAggregationP99, wantSQL: "99) AS value"},
		{name: "count", kind: contracts.MetricKindGauge, aggregation: contracts.MetricAggregationCount, wantSQL: "count() AS value"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !metricAggregationAllowed(tt.kind, tt.aggregation) {
				t.Fatalf("metricAggregationAllowed(%s, %s) = false", tt.kind, tt.aggregation)
			}
			if got := metricAggregationSelect(tt.aggregation, tt.kind); !strings.Contains(got, tt.wantSQL) {
				t.Fatalf("metricAggregationSelect() = %q, want %q", got, tt.wantSQL)
			}
		})
	}

	for _, input := range []string{"5m", "PT1H30M", "PT45S"} {
		interval, err := parseMetricInterval(input)
		if err != nil {
			t.Fatalf("parseMetricInterval(%q) error = %v", input, err)
		}
		if interval <= 0 || surrealDurationLiteral(interval) == "" || formatMetricInterval(interval) == "" {
			t.Fatalf("interval helpers for %q returned %v", input, interval)
		}
	}
	for _, input := range []string{"", "P1D", "PT0S"} {
		if _, err := parseMetricInterval(input); err == nil {
			t.Fatalf("parseMetricInterval(%q) returned nil error", input)
		}
	}
}

func TestMetricQueryValidationCoversLimitIntervalAndGroupErrors(t *testing.T) {
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	descriptor := contracts.MetricDescriptor{
		Name:          "queue.depth",
		Kind:          contracts.MetricKindGauge,
		AttributeKeys: []string{"env", "region", "host", "zone", "route"},
	}

	tooManyGroups := []string{"env", "region", "host", "zone", "route", "extra"}
	badLimit := 0
	badInterval := "PT0S"
	tests := []contracts.MetricSeriesInput{
		{MetricName: "other", From: from, To: to, Aggregation: contracts.MetricAggregationAvg},
		{MetricName: "queue.depth", From: to, To: from, Aggregation: contracts.MetricAggregationAvg},
		{MetricName: "queue.depth", From: from, To: to, Aggregation: contracts.MetricAggregationAvg, GroupBy: tooManyGroups},
		{MetricName: "queue.depth", From: from, To: to, Aggregation: contracts.MetricAggregationAvg, GroupBy: []string{"env", "env"}},
		{MetricName: "queue.depth", From: from, To: to, Aggregation: contracts.MetricAggregationAvg, GroupBy: []string{" "}},
		{MetricName: "queue.depth", From: from, To: to, Aggregation: contracts.MetricAggregationAvg, Limit: &badLimit},
		{MetricName: "queue.depth", From: from, To: to, Aggregation: contracts.MetricAggregationAvg, Interval: &badInterval},
	}
	for index, input := range tests {
		if _, _, err := BuildMetricSeriesQuery(input, descriptor); err == nil {
			t.Fatalf("BuildMetricSeriesQuery invalid case %d returned nil error", index)
		}
	}

	if _, err := BuildMetricDescriptorByNameQuery(" "); err == nil {
		t.Fatal("BuildMetricDescriptorByNameQuery(blank) returned nil error")
	}
	if _, err := normalizedMetricNameLimit(&badLimit); err == nil {
		t.Fatal("normalizedMetricNameLimit(0) returned nil error")
	}
	if _, err := normalizedMetricPointLimit(&badLimit); err == nil {
		t.Fatal("normalizedMetricPointLimit(0) returned nil error")
	}
}

func TestMetricSeriesBuildsDistinctGroupedSeriesAndExemplars(t *testing.T) {
	attrs := contracts.Attributes{"traceId": "trace-1"}
	series := buildMetricSeries([]metricBucketRow{
		{Bucket: time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC), Group0: "api", Group1: "GET", Value: int64(10), Count: uint32(2), Exemplars: []contracts.MetricExemplar{{TraceID: ptrString("trace-1"), Attributes: nil}}},
		{Bucket: time.Date(2026, 5, 14, 8, 1, 0, 0, time.UTC), Group0: "api", Group1: "POST", Value: uint64(8), Count: int32(1), Exemplars: []contracts.MetricExemplar{{TraceID: ptrString("trace-2"), Attributes: attrs}}},
		{Bucket: time.Date(2026, 5, 14, 8, 2, 0, 0, time.UTC), Group0: "api", Group1: "GET", Value: float32(12), Count: uint(3)},
	}, []string{"service.name", "http.method"})

	if len(series) != 2 {
		t.Fatalf("series = %#v, want two grouped series", series)
	}
	if series[0].Labels["service.name"] != "api" || series[0].Labels["http.method"] != "GET" || len(series[0].Points) != 2 {
		t.Fatalf("first series = %#v", series[0])
	}
	if series[0].Points[0].Exemplars[0].Attributes == nil {
		t.Fatalf("exemplar attributes were not initialized: %#v", series[0].Points[0].Exemplars[0])
	}
	if requiredFloat("not numeric") != 0 || optionalFloat(nil) != nil {
		t.Fatal("numeric helpers did not normalize unsupported values")
	}
}
