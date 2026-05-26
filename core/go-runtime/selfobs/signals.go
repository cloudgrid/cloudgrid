package selfobs

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	collectorlogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
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
	FailureLogLevel       string
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
	failureLogLevel slog.Level
	failureLogOff   bool
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
	failureLogLevel, failureLogOff := parseFailureLogLevel(config.FailureLogLevel)
	exporter := &OTLPTraceLogExporter{
		tracesEndpoint:  tracesEndpoint,
		logsEndpoint:    logsEndpoint,
		bearerToken:     strings.TrimSpace(config.BearerToken),
		client:          client,
		logger:          config.Logger,
		now:             now,
		maxBuffer:       maxBuffer,
		metrics:         config.MetricsRecorder,
		failureLogLevel: failureLogLevel,
		failureLogOff:   failureLogOff,
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
	exporter.flush(ctx, true)
	return nil
}

func (exporter *OTLPTraceLogExporter) flush(ctx context.Context, logFailures bool) {
	spans, logs := exporter.drain()
	if len(spans) > 0 {
		_ = exporter.post(ctx, exporter.tracesEndpoint, "traces", exporter.tracePayload(spans), logFailures)
	}
	if len(logs) > 0 {
		_ = exporter.post(ctx, exporter.logsEndpoint, "logs", exporter.logPayload(logs), logFailures)
	}
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
	exporter.flush(ctx, false)
	return nil
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

func (exporter *OTLPTraceLogExporter) post(ctx context.Context, endpoint string, signal string, payload proto.Message, logFailures bool) error {
	encoded, err := protojson.Marshal(payload)
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
		if logFailures {
			exporter.logFailure(err, signal)
		}
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if logFailures {
			exporter.logFailure(fmt.Errorf("status %d", response.StatusCode), signal)
		}
	}
	return nil
}

func (exporter *OTLPTraceLogExporter) tracePayload(spans []SpanEvent) *collectortracepb.ExportTraceServiceRequest {
	records := make([]*tracepb.Span, 0, len(spans))
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
		traceIDBytes, _ := hex.DecodeString(traceID)
		spanID := span.SpanID
		if !isLowerHex(spanID, 16) || isAllZero(spanID) {
			spanID = randomHex(8)
		}
		spanIDBytes, _ := hex.DecodeString(spanID)
		record := &tracepb.Span{
			TraceId:           traceIDBytes,
			SpanId:            spanIDBytes,
			Name:              span.Name,
			Kind:              tracepb.Span_SPAN_KIND_INTERNAL,
			StartTimeUnixNano: uint64(start.UnixNano()),
			EndTimeUnixNano:   uint64(end.UnixNano()),
			Attributes:        otlpKeyValues(attrs),
			Status:            &tracepb.Status{Code: traceStatusCodeForResult(span.Result)},
		}
		if isLowerHex(span.ParentSpanID, 16) && !isAllZero(span.ParentSpanID) {
			record.ParentSpanId, _ = hex.DecodeString(span.ParentSpanID)
		}
		if traceState := validTraceState(span.TraceState); traceState != "" {
			record.TraceState = traceState
		}
		records = append(records, record)
	}
	return &collectortracepb.ExportTraceServiceRequest{ResourceSpans: []*tracepb.ResourceSpans{{
		Resource: &resourcepb.Resource{Attributes: otlpKeyValues(exporter.resource)},
		ScopeSpans: []*tracepb.ScopeSpans{{
			Scope: &commonpb.InstrumentationScope{Name: "cloudgrid.self_observability"},
			Spans: records,
		}},
	}}}
}

func (exporter *OTLPTraceLogExporter) logPayload(logs []LogEvent) *collectorlogspb.ExportLogsServiceRequest {
	records := make([]*logspb.LogRecord, 0, len(logs))
	for _, log := range logs {
		timestamp := log.Timestamp
		if timestamp.IsZero() {
			timestamp = exporter.now()
		}
		severityText, severityNumber := boundedSeverityFields(log.SeverityText)
		record := &logspb.LogRecord{
			TimeUnixNano:         uint64(timestamp.UnixNano()),
			ObservedTimeUnixNano: uint64(exporter.now().UnixNano()),
			SeverityText:         severityText,
			SeverityNumber:       logspb.SeverityNumber(severityNumber),
			Body:                 &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: boundedLogBody(log.Message)}},
			Attributes:           otlpKeyValues(sanitizeLogAttributes(log.Attributes, exporter.resource["service.name"])),
		}
		if isLowerHex(log.TraceID, 32) && !isAllZero(log.TraceID) {
			record.TraceId, _ = hex.DecodeString(log.TraceID)
		}
		if isLowerHex(log.SpanID, 16) && !isAllZero(log.SpanID) {
			record.SpanId, _ = hex.DecodeString(log.SpanID)
		}
		records = append(records, record)
	}
	return &collectorlogspb.ExportLogsServiceRequest{ResourceLogs: []*logspb.ResourceLogs{{
		Resource: &resourcepb.Resource{Attributes: otlpKeyValues(exporter.resource)},
		ScopeLogs: []*logspb.ScopeLogs{{
			Scope:      &commonpb.InstrumentationScope{Name: "cloudgrid.self_observability.logs"},
			LogRecords: records,
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
	if exporter.failureLogOff {
		return
	}
	exporter.logger.Log(context.Background(), exporter.failureLogLevel, "self_observability_export_failed",
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

func traceStatusCodeForResult(result string) tracepb.Status_StatusCode {
	switch result {
	case "success", "persisted", "accepted", "published":
		return tracepb.Status_STATUS_CODE_OK
	default:
		return tracepb.Status_STATUS_CODE_ERROR
	}
}

func otlpKeyValues(labels map[string]string) []*commonpb.KeyValue {
	attributes := make([]*commonpb.KeyValue, 0, len(labels))
	for key, value := range labels {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" {
			continue
		}
		attributes = append(attributes, &commonpb.KeyValue{
			Key: key,
			Value: &commonpb.AnyValue{
				Value: &commonpb.AnyValue_StringValue{StringValue: value},
			},
		})
	}
	return attributes
}

func parseFailureLogLevel(value string) (slog.Level, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "warn":
		return slog.LevelWarn, false
	case "debug":
		return slog.LevelDebug, false
	case "info":
		return slog.LevelInfo, false
	case "error":
		return slog.LevelError, false
	case "off", "none", "silent":
		return slog.LevelWarn, true
	default:
		return slog.LevelWarn, false
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
