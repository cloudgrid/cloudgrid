package selfobs

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
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
	Now                   func() time.Time
}

type OTLPHTTPMetricsExporter struct {
	endpoint    string
	bearerToken string
	client      *http.Client
	logger      *slog.Logger
	now         func() time.Time
	resource    map[string]string
	maxBuffer   int
	stop        chan struct{}
	stopOnce    sync.Once

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
	exporter := &OTLPHTTPMetricsExporter{
		endpoint:    endpoint,
		bearerToken: strings.TrimSpace(config.BearerToken),
		client:      client,
		logger:      config.Logger,
		now:         now,
		maxBuffer:   maxBuffer,
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
	events := exporter.drain()
	if len(events) == 0 {
		return nil
	}
	payload, err := json.Marshal(exporter.payload(events))
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
		exporter.logFailure(err)
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		err := fmt.Errorf("self-observability metrics export failed with status %d", response.StatusCode)
		exporter.logFailure(err)
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
	return exporter.Flush(ctx)
}

func (exporter *OTLPHTTPMetricsExporter) drain() []MetricEvent {
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	events := append([]MetricEvent(nil), exporter.buffer...)
	exporter.buffer = nil
	return events
}

func (exporter *OTLPHTTPMetricsExporter) payload(events []MetricEvent) map[string]any {
	metrics := make([]map[string]any, 0, len(events))
	for _, event := range events {
		metrics = append(metrics, otlpMetric(event, exporter.now()))
	}
	return map[string]any{
		"resourceMetrics": []map[string]any{{
			"resource": map[string]any{
				"attributes": otlpAttributes(exporter.resource),
			},
			"scopeMetrics": []map[string]any{{
				"scope": map[string]any{
					"name": "cloudgrid.self_observability",
				},
				"metrics": metrics,
			}},
		}},
	}
}

func otlpMetric(event MetricEvent, timestamp time.Time) map[string]any {
	point := map[string]any{
		"timeUnixNano": fmt.Sprintf("%d", timestamp.UnixNano()),
		"attributes":   otlpAttributes(event.Attributes),
	}
	switch event.Kind {
	case MetricKindHistogram:
		point["count"] = "1"
		point["sum"] = event.Value
		point["bucketCounts"] = []string{"1"}
		point["explicitBounds"] = []float64{}
		return map[string]any{
			"name": event.Name,
			"histogram": map[string]any{
				"aggregationTemporality": "AGGREGATION_TEMPORALITY_DELTA",
				"dataPoints":             []map[string]any{point},
			},
		}
	case MetricKindUpDownCounter:
		point["asDouble"] = event.Value
		return map[string]any{
			"name": event.Name,
			"sum": map[string]any{
				"aggregationTemporality": "AGGREGATION_TEMPORALITY_DELTA",
				"isMonotonic":            false,
				"dataPoints":             []map[string]any{point},
			},
		}
	default:
		point["asDouble"] = event.Value
		return map[string]any{
			"name": event.Name,
			"sum": map[string]any{
				"aggregationTemporality": "AGGREGATION_TEMPORALITY_DELTA",
				"isMonotonic":            true,
				"dataPoints":             []map[string]any{point},
			},
		}
	}
}

func otlpAttributes(labels map[string]string) []map[string]any {
	attributes := make([]map[string]any, 0, len(labels))
	for key, value := range labels {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" {
			continue
		}
		attributes = append(attributes, map[string]any{
			"key": key,
			"value": map[string]any{
				"stringValue": value,
			},
		})
	}
	return attributes
}

func (exporter *OTLPHTTPMetricsExporter) logFailure(err error) {
	if exporter.logger == nil || err == nil {
		return
	}
	exporter.logger.Warn("self_observability_metrics_export_failed",
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
