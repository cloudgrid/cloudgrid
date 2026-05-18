//go:build surrealdb

package surrealdb

import (
	"context"
	"math"
	"strings"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

func TestStoreHelpersNormalizeTelemetryReadModels(t *testing.T) {
	descriptors := []contracts.MetricDescriptor{{Name: "requests"}, {Name: "duration", AttributeKeys: []string{"service"}}}
	normalizeMetricDescriptors(descriptors)
	if descriptors[0].AttributeKeys == nil || len(descriptors[1].AttributeKeys) != 1 {
		t.Fatalf("descriptors = %#v, want initialized attribute keys", descriptors)
	}

	traceID := "trace-1"
	spanID := "span-1"
	logs := []contracts.LogEvent{
		{ID: "log-1", Attributes: nil},
		{ID: "log-2", TraceID: &traceID, Attributes: nil},
		{ID: "log-3", TraceID: &traceID, SpanID: &spanID, Attributes: nil},
	}
	setLogCorrelations(logs)
	if logs[0].Correlation == nil || *logs[0].Correlation != contracts.LogCorrelationNone {
		t.Fatalf("log correlation = %#v", logs[0].Correlation)
	}
	if logs[1].Correlation == nil || *logs[1].Correlation != contracts.LogCorrelationTrace {
		t.Fatalf("log correlation = %#v", logs[1].Correlation)
	}
	if logs[2].Correlation == nil || *logs[2].Correlation != contracts.LogCorrelationSpan {
		t.Fatalf("log correlation = %#v", logs[2].Correlation)
	}
	for _, log := range logs {
		if log.Attributes == nil {
			t.Fatalf("log attributes not initialized: %#v", log)
		}
	}

	spans := []contracts.Span{{
		ID:         "span-1",
		Attributes: nil,
		Events:     []contracts.SpanEvent{{Name: "exception", Attributes: nil}},
		Links:      []contracts.SpanLink{{TraceID: "linked-trace", Attributes: nil, Direction: nil}},
	}}
	normalizeSpans(spans)
	if spans[0].Attributes == nil || spans[0].Events[0].Attributes == nil || spans[0].Links[0].Attributes == nil {
		t.Fatalf("span was not normalized: %#v", spans[0])
	}
	if spans[0].Links[0].Direction == nil || *spans[0].Links[0].Direction != contracts.SpanLinkDirectionUnknown {
		t.Fatalf("link direction = %#v", spans[0].Links[0].Direction)
	}
}

func TestStoreMethodsReturnStorageErrorsWhenDatabaseIsUnavailable(t *testing.T) {
	store := Store{}
	ctx := context.Background()
	auth := &contracts.AuthContext{TenantID: ptrString("tenant-1"), CompanyID: ptrString("company-1"), ProjectID: ptrString("project-1")}
	from := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	limit := 10
	traceID := "trace-1"
	service := "checkout"
	status := contracts.TraceStatusOK

	checks := []struct {
		name string
		fn   func() error
	}{
		{name: "project telemetry overview", fn: func() error {
			_, err := store.GetProjectTelemetryOverviews(ctx, contracts.ProjectTelemetryOverviewRequest{
				Projects: []contracts.ProjectTelemetryOverviewTarget{{TenantID: ptrString("tenant-1"), CompanyID: "company-1", ProjectID: "project-1"}},
			})
			return err
		}},
		{name: "search traces", fn: func() error {
			_, err := store.SearchTraces(ctx, contracts.TraceSearchQuery{Service: &service, Status: &status, From: &from, To: &to, Limit: &limit}, auth)
			return err
		}},
		{name: "live candidates", fn: func() error {
			_, err := store.SearchLiveTraceCandidates(ctx, contracts.LiveTraceQuery{Service: &service, Status: &status, From: &from, Limit: &limit}, []string{"trace-1"}, auth)
			return err
		}},
		{name: "trace detail", fn: func() error {
			_, err := store.GetTraceDetail(ctx, traceID, &contracts.TraceDetailQuery{}, auth)
			return err
		}},
		{name: "search logs", fn: func() error {
			_, err := store.SearchLogs(ctx, contracts.LogSearchQuery{Service: &service, From: &from, To: &to, Limit: &limit}, auth)
			return err
		}},
		{name: "facets", fn: func() error {
			_, err := store.GetTelemetryFacets(ctx, contracts.TelemetryFacetQuery{Search: &service, Limit: &limit}, auth)
			return err
		}},
		{name: "metric names", fn: func() error {
			_, err := store.SearchMetricNames(ctx, contracts.MetricNameSearchInput{Query: &service, From: &from, To: &to, Limit: &limit}, auth)
			return err
		}},
		{name: "metric series", fn: func() error {
			_, err := store.QueryMetricSeries(ctx, contracts.MetricSeriesInput{MetricName: "requests", From: from, To: to, Aggregation: contracts.MetricAggregationSum}, auth)
			return err
		}},
	}

	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			err := check.fn()
			if err == nil || !strings.Contains(err.Error(), "ERR-006") {
				t.Fatalf("error = %v, want storage unavailable", err)
			}
		})
	}
}

func TestFacetAndMetricStoreHelpersCoverSortingAndNumericBranches(t *testing.T) {
	search := "ser"
	values := facetValuesFromAttributeKeyRows([][]string{
		{"service.name", "http.method", ""},
		{"service.name", "deployment.environment"},
		{"service.version"},
	}, &search, 2)
	if len(values) != 2 || values[0].Value != "service.name" || values[0].Count != 2 {
		t.Fatalf("facet values = %#v", values)
	}

	bucket := time.Date(2026, 5, 14, 8, 0, 0, 0, time.UTC)
	labels := metricRowLabels(metricBucketRow{Bucket: bucket, Group0: "api", Group1: "GET"}, []string{"service", "method"})
	if labels["service"] != "api" || labels["method"] != "GET" {
		t.Fatalf("labels = %#v", labels)
	}
	if metricLabelKey(labels, []string{"service", "method"}) != "service=api\x00method=GET" {
		t.Fatalf("metric label key = %q", metricLabelKey(labels, []string{"service", "method"}))
	}
	if metricLabelKey(contracts.Attributes{}, nil) != "{}" {
		t.Fatal("empty metric label key did not use canonical empty object")
	}

	if optionalFloat(float64(math.NaN())) != nil || optionalFloat(float32(math.Inf(1))) != nil {
		t.Fatal("optionalFloat accepted non-finite values")
	}
	for _, value := range []any{int(1), int32(2), int64(3), uint(4), uint32(5), uint64(6), float32(7), float64(8)} {
		if optionalFloat(value) == nil {
			t.Fatalf("optionalFloat(%T) returned nil", value)
		}
	}
}
