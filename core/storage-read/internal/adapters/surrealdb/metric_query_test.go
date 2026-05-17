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
		"string::lowercase(metricName) CONTAINS $query",
		"lastSeenAt >= $from",
		"firstSeenAt <= $to",
		"metricName IN (SELECT VALUE metricName FROM metric_point",
		"serviceName = $service",
		"ORDER BY lastSeenAt DESC, metricName ASC",
		"LIMIT $limit",
	} {
		if !strings.Contains(stmt.SQL, want) {
			t.Fatalf("metric name SQL missing %q:\n%s", want, stmt.SQL)
		}
	}
	if stmt.Params["query"] != "duration" || stmt.Params["service"] != service || stmt.Params["limit"] != limit {
		t.Fatalf("params = %#v, want query/service/limit", stmt.Params)
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
