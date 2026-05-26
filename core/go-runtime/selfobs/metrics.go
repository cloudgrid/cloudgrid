package selfobs

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	collectormetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	"google.golang.org/protobuf/encoding/protojson"
)

type MetricKind string

const (
	MetricKindCounter       MetricKind = "counter"
	MetricKindHistogram     MetricKind = "histogram"
	MetricKindUpDownCounter MetricKind = "up_down_counter"
)

type MetricEvent struct {
	Name       string
	Kind       MetricKind
	Value      float64
	Attributes map[string]string
}

type MetricsRecorder interface {
	RecordMetric(event MetricEvent)
	Flush(ctx context.Context) error
	Shutdown(ctx context.Context) error
}

type MetricsExporterConfig struct {
	Enabled               bool
	Endpoint              string
	BearerToken           string
	ExportIntervalSeconds int
	ServiceName           string
	DeploymentMode        string
	CompanyID             string
	ProjectID             string
	MaxBuffer             int
	Client                *http.Client
	Logger                *slog.Logger
	FailureLogLevel       string
	Now                   func() time.Time
}

type OTLPHTTPMetricsExporter struct {
	endpoint        string
	bearerToken     string
	client          *http.Client
	logger          *slog.Logger
	now             func() time.Time
	resource        map[string]string
	maxBuffer       int
	failureLogLevel slog.Level
	failureLogOff   bool
	stop            chan struct{}
	stopOnce        sync.Once

	mu     sync.Mutex
	buffer []MetricEvent
	closed bool
}

func NewOTLPHTTPMetricsExporter(config MetricsExporterConfig) (*OTLPHTTPMetricsExporter, error) {
	if !config.Enabled {
		return nil, nil
	}
	endpoint, err := metricsEndpoint(config.Endpoint)
	if err != nil {
		return nil, err
	}
	client := config.Client
	if client == nil {
		client = &http.Client{Timeout: 2 * time.Second}
	}
	now := config.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	maxBuffer := config.MaxBuffer
	if maxBuffer <= 0 {
		maxBuffer = 1024
	}
	failureLogLevel, failureLogOff := parseFailureLogLevel(config.FailureLogLevel)
	exporter := &OTLPHTTPMetricsExporter{
		endpoint:        endpoint,
		bearerToken:     strings.TrimSpace(config.BearerToken),
		client:          client,
		logger:          config.Logger,
		now:             now,
		maxBuffer:       maxBuffer,
		failureLogLevel: failureLogLevel,
		failureLogOff:   failureLogOff,
		resource: map[string]string{
			"service.name":                            config.ServiceName,
			"service.namespace":                       "cloudgrid",
			"cloudgrid.deployment_mode":               config.DeploymentMode,
			"cloudgrid.self_observability.company_id": config.CompanyID,
			"cloudgrid.self_observability.project_id": config.ProjectID,
		},
		stop: make(chan struct{}),
	}
	interval := time.Duration(config.ExportIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 10 * time.Second
	}
	go exporter.run(interval)
	return exporter, nil
}

func (exporter *OTLPHTTPMetricsExporter) run(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			_ = exporter.Flush(ctx)
			cancel()
		case <-exporter.stop:
			return
		}
	}
}

func metricsEndpoint(base string) (string, error) {
	base = strings.TrimSpace(base)
	if base == "" {
		return "", errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT is required")
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT must be a valid URL")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/v1/metrics"
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func (exporter *OTLPHTTPMetricsExporter) RecordMetric(event MetricEvent) {
	if exporter == nil || strings.TrimSpace(event.Name) == "" {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.buffer) >= exporter.maxBuffer {
		return
	}
	event.Attributes = copyLabels(event.Attributes)
	exporter.buffer = append(exporter.buffer, event)
}

func (exporter *OTLPHTTPMetricsExporter) Flush(ctx context.Context) error {
	if exporter == nil {
		return nil
	}
	return exporter.flush(ctx, true)
}

func (exporter *OTLPHTTPMetricsExporter) flush(ctx context.Context, logFailures bool) error {
	events := exporter.drain()
	if len(events) == 0 {
		return nil
	}
	payload, err := protojson.Marshal(exporter.payload(events))
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, exporter.endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	if exporter.bearerToken != "" {
		request.Header.Set("Authorization", "Bearer "+exporter.bearerToken)
	}
	response, err := exporter.client.Do(request)
	if err != nil {
		if logFailures {
			exporter.logFailure(err)
		}
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		err := fmt.Errorf("self-observability metrics export failed with status %d", response.StatusCode)
		if logFailures {
			exporter.logFailure(err)
		}
		return err
	}
	return nil
}

func (exporter *OTLPHTTPMetricsExporter) Shutdown(ctx context.Context) error {
	if exporter == nil {
		return nil
	}
	exporter.mu.Lock()
	exporter.closed = true
	exporter.mu.Unlock()
	exporter.stopOnce.Do(func() {
		close(exporter.stop)
	})
	_ = exporter.flush(ctx, false)
	return nil
}

func (exporter *OTLPHTTPMetricsExporter) drain() []MetricEvent {
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	events := append([]MetricEvent(nil), exporter.buffer...)
	exporter.buffer = nil
	return events
}

func (exporter *OTLPHTTPMetricsExporter) payload(events []MetricEvent) *collectormetricspb.ExportMetricsServiceRequest {
	metrics := make([]*metricspb.Metric, 0, len(events))
	for _, event := range events {
		metrics = append(metrics, otlpMetric(event, exporter.now()))
	}
	return &collectormetricspb.ExportMetricsServiceRequest{
		ResourceMetrics: []*metricspb.ResourceMetrics{{
			Resource: &resourcepb.Resource{Attributes: otlpKeyValues(exporter.resource)},
			ScopeMetrics: []*metricspb.ScopeMetrics{{
				Scope:   &commonpb.InstrumentationScope{Name: "cloudgrid.self_observability"},
				Metrics: metrics,
			}},
		}},
	}
}

func otlpMetric(event MetricEvent, timestamp time.Time) *metricspb.Metric {
	point := &metricspb.NumberDataPoint{
		TimeUnixNano: uint64(timestamp.UnixNano()),
		Attributes:   otlpKeyValues(event.Attributes),
		Value:        &metricspb.NumberDataPoint_AsDouble{AsDouble: event.Value},
	}
	switch event.Kind {
	case MetricKindHistogram:
		sum := event.Value
		return &metricspb.Metric{
			Name: event.Name,
			Data: &metricspb.Metric_Histogram{
				Histogram: &metricspb.Histogram{
					AggregationTemporality: metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
					DataPoints: []*metricspb.HistogramDataPoint{{
						TimeUnixNano:   uint64(timestamp.UnixNano()),
						Attributes:     otlpKeyValues(event.Attributes),
						Count:          1,
						Sum:            &sum,
						BucketCounts:   []uint64{1},
						ExplicitBounds: []float64{},
					}},
				},
			},
		}
	case MetricKindUpDownCounter:
		return &metricspb.Metric{
			Name: event.Name,
			Data: &metricspb.Metric_Sum{
				Sum: &metricspb.Sum{
					AggregationTemporality: metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
					IsMonotonic:            false,
					DataPoints:             []*metricspb.NumberDataPoint{point},
				},
			},
		}
	default:
		return &metricspb.Metric{
			Name: event.Name,
			Data: &metricspb.Metric_Sum{
				Sum: &metricspb.Sum{
					AggregationTemporality: metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
					IsMonotonic:            true,
					DataPoints:             []*metricspb.NumberDataPoint{point},
				},
			},
		}
	}
}

func (exporter *OTLPHTTPMetricsExporter) logFailure(err error) {
	if exporter.logger == nil || err == nil {
		return
	}
	if exporter.failureLogOff {
		return
	}
	exporter.logger.Log(context.Background(), exporter.failureLogLevel, "self_observability_metrics_export_failed",
		"service", exporter.resource["service.name"],
		"event", "self_observability_metrics_export_failed",
		"request_id", "",
		"error_id", "ERR-013",
		"error_code", "MESSAGE_BRIDGE_UNAVAILABLE",
	)
}

func copyLabels(labels map[string]string) map[string]string {
	copied := make(map[string]string, len(labels))
	for key, value := range labels {
		copied[key] = value
	}
	return copied
}
