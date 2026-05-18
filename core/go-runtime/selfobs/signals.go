package selfobs

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
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

type SpanEvent struct {
	Name         string
	TraceID      string
	SpanID       string
	ParentSpanID string
	TraceState   string
	Attributes   map[string]string
	Result       string
	StartTime    time.Time
	EndTime      time.Time
}

type LogEvent struct {
	Message      string
	SeverityText string
	Attributes   map[string]string
	Timestamp    time.Time
}

type TraceLogRecorder interface {
	RecordSpan(event SpanEvent)
	RecordLog(event LogEvent)
	Flush(ctx context.Context) error
	Shutdown(ctx context.Context) error
}

type TraceLogExporterConfig struct {
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

type OTLPTraceLogExporter struct {
	tracesEndpoint string
	logsEndpoint   string
	bearerToken    string
	client         *http.Client
	logger         *slog.Logger
	now            func() time.Time
	resource       map[string]string
	maxBuffer      int
	stop           chan struct{}
	stopOnce       sync.Once

	mu     sync.Mutex
	spans  []SpanEvent
	logs   []LogEvent
	closed bool
}

func NewOTLPTraceLogExporter(config TraceLogExporterConfig) (*OTLPTraceLogExporter, error) {
	if !config.Enabled {
		return nil, nil
	}
	tracesEndpoint, err := signalEndpoint(config.Endpoint, "/v1/traces")
	if err != nil {
		return nil, err
	}
	logsEndpoint, err := signalEndpoint(config.Endpoint, "/v1/logs")
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
	exporter := &OTLPTraceLogExporter{
		tracesEndpoint: tracesEndpoint,
		logsEndpoint:   logsEndpoint,
		bearerToken:    strings.TrimSpace(config.BearerToken),
		client:         client,
		logger:         config.Logger,
		now:            now,
		maxBuffer:      maxBuffer,
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

func signalEndpoint(base string, suffix string) (string, error) {
	base = strings.TrimSpace(base)
	if base == "" {
		return "", errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT is required")
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT must be a valid URL")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + suffix
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func (exporter *OTLPTraceLogExporter) run(interval time.Duration) {
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

func (exporter *OTLPTraceLogExporter) RecordSpan(event SpanEvent) {
	if exporter == nil || strings.TrimSpace(event.Name) == "" {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.spans) >= exporter.maxBuffer {
		return
	}
	event.Attributes = copyLabels(event.Attributes)
	exporter.spans = append(exporter.spans, event)
}

func (exporter *OTLPTraceLogExporter) RecordLog(event LogEvent) {
	if exporter == nil || strings.TrimSpace(event.Message) == "" {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.logs) >= exporter.maxBuffer {
		return
	}
	event.Attributes = copyLabels(event.Attributes)
	exporter.logs = append(exporter.logs, event)
}

func (exporter *OTLPTraceLogExporter) Flush(ctx context.Context) error {
	if exporter == nil {
		return nil
	}
	spans, logs := exporter.drain()
	if len(spans) > 0 {
		_ = exporter.post(ctx, exporter.tracesEndpoint, exporter.tracePayload(spans))
	}
	if len(logs) > 0 {
		_ = exporter.post(ctx, exporter.logsEndpoint, exporter.logPayload(logs))
	}
	return nil
}

func (exporter *OTLPTraceLogExporter) Shutdown(ctx context.Context) error {
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

func (exporter *OTLPTraceLogExporter) drain() ([]SpanEvent, []LogEvent) {
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	spans := append([]SpanEvent(nil), exporter.spans...)
	logs := append([]LogEvent(nil), exporter.logs...)
	exporter.spans = nil
	exporter.logs = nil
	return spans, logs
}

func (exporter *OTLPTraceLogExporter) post(ctx context.Context, endpoint string, payload map[string]any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
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
		exporter.logFailure(fmt.Errorf("status %d", response.StatusCode))
	}
	return nil
}

func (exporter *OTLPTraceLogExporter) tracePayload(spans []SpanEvent) map[string]any {
	records := make([]map[string]any, 0, len(spans))
	for _, span := range spans {
		start := span.StartTime
		if start.IsZero() {
			start = exporter.now()
		}
		end := span.EndTime
		if end.IsZero() || end.Before(start) {
			end = start.Add(time.Millisecond)
		}
		attrs := copyLabels(span.Attributes)
		if span.Result != "" {
			attrs["result"] = boundedResult(span.Result)
		}
		traceID := span.TraceID
		if !isLowerHex(traceID, 32) || isAllZero(traceID) {
			traceID = randomHex(16)
		}
		spanID := span.SpanID
		if !isLowerHex(spanID, 16) || isAllZero(spanID) {
			spanID = randomHex(8)
		}
		record := map[string]any{
			"traceId":           traceID,
			"spanId":            spanID,
			"name":              span.Name,
			"kind":              "SPAN_KIND_INTERNAL",
			"startTimeUnixNano": fmt.Sprintf("%d", start.UnixNano()),
			"endTimeUnixNano":   fmt.Sprintf("%d", end.UnixNano()),
			"attributes":        otlpAttributes(attrs),
			"status": map[string]any{
				"code": statusCodeForResult(span.Result),
			},
		}
		if isLowerHex(span.ParentSpanID, 16) && !isAllZero(span.ParentSpanID) {
			record["parentSpanId"] = span.ParentSpanID
		}
		if traceState := validTraceState(span.TraceState); traceState != "" {
			record["traceState"] = traceState
		}
		records = append(records, record)
	}
	return map[string]any{"resourceSpans": []map[string]any{{
		"resource": map[string]any{"attributes": otlpAttributes(exporter.resource)},
		"scopeSpans": []map[string]any{{
			"scope": map[string]any{"name": "cloudgrid.self_observability"},
			"spans": records,
		}},
	}}}
}

func (exporter *OTLPTraceLogExporter) logPayload(logs []LogEvent) map[string]any {
	records := make([]map[string]any, 0, len(logs))
	for _, log := range logs {
		timestamp := log.Timestamp
		if timestamp.IsZero() {
			timestamp = exporter.now()
		}
		records = append(records, map[string]any{
			"timeUnixNano": fmt.Sprintf("%d", timestamp.UnixNano()),
			"severityText": boundedSeverity(log.SeverityText),
			"body":         map[string]any{"stringValue": log.Message},
			"attributes":   otlpAttributes(log.Attributes),
		})
	}
	return map[string]any{"resourceLogs": []map[string]any{{
		"resource": map[string]any{"attributes": otlpAttributes(exporter.resource)},
		"scopeLogs": []map[string]any{{
			"scope":      map[string]any{"name": "cloudgrid.self_observability"},
			"logRecords": records,
		}},
	}}}
}

func (exporter *OTLPTraceLogExporter) logFailure(err error) {
	if exporter.logger == nil || err == nil {
		return
	}
	exporter.logger.Warn("self_observability_export_failed",
		"service", exporter.resource["service.name"],
		"event", "self_observability_export_failed",
		"request_id", "",
		"error_id", "ERR-013",
		"error_code", "MESSAGE_BRIDGE_UNAVAILABLE",
	)
}

func randomHex(size int) string {
	bytes := make([]byte, size)
	if _, err := rand.Read(bytes); err != nil {
		return strings.Repeat("0", size*2)
	}
	return hex.EncodeToString(bytes)
}

func statusCodeForResult(result string) string {
	switch result {
	case "success", "persisted", "accepted", "published":
		return "STATUS_CODE_OK"
	default:
		return "STATUS_CODE_ERROR"
	}
}

func boundedResult(result string) string {
	switch result {
	case "success", "error", "timeout", "dropped", "persisted", "rejected", "accepted", "published":
		return result
	default:
		return "error"
	}
}

func boundedSeverity(severity string) string {
	switch strings.ToUpper(strings.TrimSpace(severity)) {
	case "DEBUG", "INFO", "WARN", "ERROR":
		return strings.ToUpper(strings.TrimSpace(severity))
	default:
		return "INFO"
	}
}
