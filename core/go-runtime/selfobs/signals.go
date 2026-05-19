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
	"regexp"
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
	TraceID      string
	SpanID       string
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
	TracesEnabled         bool
	LogsEnabled           bool
	MaxBuffer             int
	Client                *http.Client
	Logger                *slog.Logger
	MetricsRecorder       MetricsRecorder
	Now                   func() time.Time
}

type OTLPTraceLogExporter struct {
	tracesEndpoint  string
	logsEndpoint    string
	bearerToken     string
	client          *http.Client
	logger          *slog.Logger
	now             func() time.Time
	resource        map[string]string
	maxBuffer       int
	metrics         MetricsRecorder
	failureInterval time.Duration
	tracesEnabled   bool
	logsEnabled     bool
	stop            chan struct{}
	stopOnce        sync.Once

	mu             sync.Mutex
	spans          []SpanEvent
	logs           []LogEvent
	closed         bool
	lastFailureLog time.Time
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
	interval := time.Duration(config.ExportIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 10 * time.Second
	}
	tracesEnabled := true
	logsEnabled := true
	if config.TracesEnabled || config.LogsEnabled {
		tracesEnabled = config.TracesEnabled
		logsEnabled = config.LogsEnabled
	}
	exporter := &OTLPTraceLogExporter{
		tracesEndpoint:  tracesEndpoint,
		logsEndpoint:    logsEndpoint,
		bearerToken:     strings.TrimSpace(config.BearerToken),
		client:          client,
		logger:          config.Logger,
		now:             now,
		maxBuffer:       maxBuffer,
		metrics:         config.MetricsRecorder,
		failureInterval: interval,
		tracesEnabled:   tracesEnabled,
		logsEnabled:     logsEnabled,
		resource: map[string]string{
			"service.name":                            config.ServiceName,
			"service.namespace":                       "cloudgrid",
			"cloudgrid.deployment_mode":               config.DeploymentMode,
			"cloudgrid.self_observability.company_id": config.CompanyID,
			"cloudgrid.self_observability.project_id": config.ProjectID,
		},
		stop: make(chan struct{}),
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
	if exporter == nil || !exporter.tracesEnabled || strings.TrimSpace(event.Name) == "" {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.spans) >= exporter.maxBuffer {
		if !exporter.closed && len(exporter.spans) >= exporter.maxBuffer {
			exporter.recordExporterFailure("traces", "dropped")
		}
		return
	}
	event.Attributes = copyLabels(event.Attributes)
	exporter.spans = append(exporter.spans, event)
}

func (exporter *OTLPTraceLogExporter) RecordLog(event LogEvent) {
	if exporter == nil || !exporter.logsEnabled || strings.TrimSpace(event.Message) == "" {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.logs) >= exporter.maxBuffer {
		if !exporter.closed && len(exporter.logs) >= exporter.maxBuffer {
			exporter.recordExporterFailure("logs", "dropped")
		}
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
		_ = exporter.post(ctx, exporter.tracesEndpoint, "traces", exporter.tracePayload(spans))
	}
	if len(logs) > 0 {
		_ = exporter.post(ctx, exporter.logsEndpoint, "logs", exporter.logPayload(logs))
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

func (exporter *OTLPTraceLogExporter) post(ctx context.Context, endpoint string, signal string, payload map[string]any) error {
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
		exporter.logFailure(err, signal)
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		exporter.logFailure(fmt.Errorf("status %d", response.StatusCode), signal)
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
		severityText, severityNumber := boundedSeverityFields(log.SeverityText)
		record := map[string]any{
			"timeUnixNano":         fmt.Sprintf("%d", timestamp.UnixNano()),
			"observedTimeUnixNano": fmt.Sprintf("%d", exporter.now().UnixNano()),
			"severityText":         severityText,
			"severityNumber":       severityNumber,
			"body":                 map[string]any{"stringValue": boundedLogBody(log.Message)},
			"attributes":           otlpAttributes(sanitizeLogAttributes(log.Attributes, exporter.resource["service.name"])),
		}
		if isLowerHex(log.TraceID, 32) && !isAllZero(log.TraceID) {
			record["traceId"] = log.TraceID
		}
		if isLowerHex(log.SpanID, 16) && !isAllZero(log.SpanID) {
			record["spanId"] = log.SpanID
		}
		records = append(records, record)
	}
	return map[string]any{"resourceLogs": []map[string]any{{
		"resource": map[string]any{"attributes": otlpAttributes(exporter.resource)},
		"scopeLogs": []map[string]any{{
			"scope":      map[string]any{"name": "cloudgrid.self_observability.logs"},
			"logRecords": records,
		}},
	}}}
}

func (exporter *OTLPTraceLogExporter) logFailure(err error, signal string) {
	if err == nil {
		return
	}
	exporter.recordExporterFailure(signal, "error")
	if exporter.logger == nil {
		return
	}
	if !exporter.shouldLogFailure() {
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

func (exporter *OTLPTraceLogExporter) shouldLogFailure() bool {
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	now := exporter.now()
	if exporter.lastFailureLog.IsZero() || now.Sub(exporter.lastFailureLog) >= exporter.failureInterval {
		exporter.lastFailureLog = now
		return true
	}
	return false
}

func (exporter *OTLPTraceLogExporter) recordExporterFailure(signal string, result string) {
	if exporter.metrics == nil {
		return
	}
	exporter.metrics.RecordMetric(MetricEvent{
		Name:  "cloudgrid.exporter.failures",
		Kind:  MetricKindCounter,
		Value: 1,
		Attributes: map[string]string{
			"service": exporter.resource["service.name"],
			"signal":  boundedSignal(signal),
			"result":  boundedResult(result),
		},
	})
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
	severityText, _ := boundedSeverityFields(severity)
	return severityText
}

func boundedSeverityFields(severity string) (string, int) {
	switch strings.ToUpper(strings.TrimSpace(severity)) {
	case "DEBUG", "INFO", "WARN", "ERROR":
		value := strings.ToUpper(strings.TrimSpace(severity))
		switch value {
		case "DEBUG":
			return value, 5
		case "WARN":
			return value, 13
		case "ERROR":
			return value, 17
		default:
			return value, 9
		}
	default:
		return "INFO", 9
	}
}

var (
	bearerPattern   = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._~+/=-]+`)
	emailPattern    = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	graphqlPattern  = regexp.MustCompile(`(?is)\b(query|mutation|subscription)\s*\{.*`)
	secretKVPattern = regexp.MustCompile(`(?i)(password|token|secret|api[_-]?key)=\S+`)
)

func boundedLogBody(body string) string {
	body = sanitizeText(body)
	if len(body) <= 512 {
		return body
	}
	return body[:512]
}

func sanitizeText(value string) string {
	value = strings.TrimSpace(value)
	value = bearerPattern.ReplaceAllString(value, "Bearer [redacted]")
	value = emailPattern.ReplaceAllString(value, "[redacted-email]")
	value = secretKVPattern.ReplaceAllString(value, "$1=[redacted]")
	value = graphqlPattern.ReplaceAllString(value, "[redacted-graphql]")
	return value
}

func sanitizeLogAttributes(attrs map[string]string, serviceName string) map[string]string {
	result := map[string]string{
		"cloudgrid.service": serviceName,
	}
	for key, value := range attrs {
		normalizedKey, ok := normalizedLogAttributeKey(key)
		if !ok {
			continue
		}
		value = sanitizeText(value)
		if value == "" {
			continue
		}
		result[normalizedKey] = boundedLogAttributeValue(normalizedKey, value)
	}
	return result
}

func normalizedLogAttributeKey(key string) (string, bool) {
	key = strings.TrimSpace(key)
	switch key {
	case "event", "cloudgrid.event":
		return "cloudgrid.event", true
	case "request_id", "cloudgrid.request_id":
		return "cloudgrid.request_id", true
	case "error_id", "cloudgrid.error_id":
		return "cloudgrid.error_id", true
	case "error_code", "cloudgrid.error_code":
		return "cloudgrid.error_code", true
	case "service", "cloudgrid.service":
		return "cloudgrid.service", true
	case "operation", "cloudgrid.operation":
		return "cloudgrid.operation", true
	case "messaging.destination.name", "http.route", "http.request.method", "http.response.status", "rpc.method":
		return key, true
	default:
		return "", false
	}
}

func boundedLogAttributeValue(key string, value string) string {
	if len(value) > 128 {
		value = value[:128]
	}
	switch key {
	case "cloudgrid.error_id":
		switch value {
		case "ERR-001", "ERR-003", "ERR-004", "ERR-006", "ERR-009", "ERR-010", "ERR-013", "ERR-014", "ERR-016", "ERR-017", "ERR-022":
			return value
		default:
			return "ERR-006"
		}
	case "cloudgrid.error_code":
		switch value {
		case "VALIDATION_FAILED", "INVALID_CURSOR", "NOT_FOUND", "STORAGE_UNAVAILABLE", "CONFIG_INVALID", "RUNTIME_COMPOSITION_FAILED", "MESSAGE_BRIDGE_UNAVAILABLE", "MESSAGE_BRIDGE_TIMEOUT", "FORBIDDEN", "RESOURCE_LIMIT_EXCEEDED", "INVITATION_EMAIL_DELIVERY_FAILED":
			return value
		default:
			return "STORAGE_UNAVAILABLE"
		}
	}
	return value
}

func boundedSignal(signal string) string {
	switch signal {
	case "traces", "logs", "metrics", "ai_projections":
		return signal
	default:
		return "unknown"
	}
}
