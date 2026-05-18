package collector

import (
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	collectormetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

func TestRootSpanUsesOnlyRootWhenAvailableAndEarliestFallback(t *testing.T) {
	parent := "parent"
	start := time.Date(2026, 5, 11, 8, 0, 0, 0, time.UTC)
	root := contracts.Span{ID: "root", StartedAt: start.Add(time.Second)}
	child := contracts.Span{ID: "child", ParentSpanID: &parent, StartedAt: start}

	if got := rootSpan([]contracts.Span{child, root}); got.ID != "root" {
		t.Fatalf("rootSpan() = %q, want only root span", got.ID)
	}

	left := contracts.Span{ID: "left", StartedAt: start.Add(2 * time.Second)}
	right := contracts.Span{ID: "right", StartedAt: start}
	if got := rootSpan([]contracts.Span{left, right}); got.ID != "right" {
		t.Fatalf("rootSpan() fallback = %q, want earliest span", got.ID)
	}
}

func TestSpanKindMapsUnspecifiedToNilAndNamedKindsToLowercase(t *testing.T) {
	if got := spanKind(tracepb.Span_SPAN_KIND_UNSPECIFIED); got != nil {
		t.Fatalf("unspecified span kind = %#v, want nil", *got)
	}
	got := spanKind(tracepb.Span_SPAN_KIND_SERVER)
	if got == nil || *got != "server" {
		t.Fatalf("server span kind = %#v, want server", got)
	}
}

func TestNormalizeMetricsSupportsExponentialHistogramAndSummary(t *testing.T) {
	request := &collectormetricspb.ExportMetricsServiceRequest{
		ResourceMetrics: []*metricspb.ResourceMetrics{{
			Resource: &resourcepb.Resource{Attributes: []*commonpb.KeyValue{
				stringAttr("service.name", "metrics-api"),
				stringAttr("resource.key", "resource-value"),
			}},
			ScopeMetrics: []*metricspb.ScopeMetrics{{
				Scope: &commonpb.InstrumentationScope{
					Name:       "metrics-scope",
					Attributes: []*commonpb.KeyValue{stringAttr("scope.key", "scope-value")},
				},
				Metrics: []*metricspb.Metric{
					{
						Name:        "request.size.exp",
						Description: "request size distribution",
						Unit:        "By",
						Data: &metricspb.Metric_ExponentialHistogram{ExponentialHistogram: &metricspb.ExponentialHistogram{
							AggregationTemporality: metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
							DataPoints: []*metricspb.ExponentialHistogramDataPoint{{
								TimeUnixNano:      1_700_000_010_000_000_000,
								StartTimeUnixNano: 1_700_000_000_000_000_000,
								Count:             4,
								Sum:               ptrFloat64(12.5),
								Min:               ptrFloat64(1.5),
								Max:               ptrFloat64(7.5),
								Positive: &metricspb.ExponentialHistogramDataPoint_Buckets{
									BucketCounts: []uint64{1, 2},
								},
								Negative: &metricspb.ExponentialHistogramDataPoint_Buckets{
									BucketCounts: []uint64{1},
								},
								Attributes: []*commonpb.KeyValue{stringAttr("route", "/metrics")},
							}},
						}},
					},
					{
						Name: "request.latency.summary",
						Unit: "ms",
						Data: &metricspb.Metric_Summary{Summary: &metricspb.Summary{
							DataPoints: []*metricspb.SummaryDataPoint{{
								TimeUnixNano:      1_700_000_020_000_000_000,
								StartTimeUnixNano: 1_700_000_000_000_000_000,
								Count:             8,
								Sum:               360,
								QuantileValues: []*metricspb.SummaryDataPoint_ValueAtQuantile{
									{Quantile: 0.5, Value: 40},
									{Quantile: 0.95, Value: 90},
								},
								Attributes: []*commonpb.KeyValue{stringAttr("route", "/summary")},
							}},
						}},
					},
				},
			}},
		}},
	}

	descriptors, points, err := NormalizeMetrics(request, time.Unix(0, 0))
	if err != nil {
		t.Fatalf("NormalizeMetrics returned error: %v", err)
	}
	if len(descriptors) != 2 || len(points) != 2 {
		t.Fatalf("metrics = %d descriptors and %d points, want 2 and 2", len(descriptors), len(points))
	}

	exp := points[0]
	if exp.Kind != contracts.MetricKindExponentialHistogram || exp.Count == nil || *exp.Count != 4 {
		t.Fatalf("exponential point = %#v", exp)
	}
	if exp.Sum == nil || *exp.Sum != 12.5 || exp.Min == nil || *exp.Min != 1.5 || exp.Max == nil || *exp.Max != 7.5 {
		t.Fatalf("exponential distribution fields = %#v", exp)
	}
	if got := exp.BucketCounts; len(got) != 3 || got[0] != 1 || got[1] != 2 || got[2] != 1 {
		t.Fatalf("exponential bucket counts = %#v", got)
	}
	if exp.ServiceName == nil || *exp.ServiceName != "metrics-api" || exp.ScopeName == nil || *exp.ScopeName != "metrics-scope" {
		t.Fatalf("exponential service/scope = %#v/%#v", exp.ServiceName, exp.ScopeName)
	}

	summary := points[1]
	if summary.Kind != contracts.MetricKindSummary || summary.Count == nil || *summary.Count != 8 {
		t.Fatalf("summary point = %#v", summary)
	}
	if summary.Sum == nil || *summary.Sum != 360 {
		t.Fatalf("summary sum = %#v", summary.Sum)
	}
	if len(summary.QuantileValues) != 2 || summary.QuantileValues[0].Quantile != 0.5 || summary.QuantileValues[1].Value != 90 {
		t.Fatalf("summary quantiles = %#v", summary.QuantileValues)
	}
}
