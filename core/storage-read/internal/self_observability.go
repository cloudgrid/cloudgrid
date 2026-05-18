package internal

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

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

type SpanEvent struct {
	Name         string
	TraceID      string
	SpanID       string
	ParentSpanID string
	TraceState   string
	Attributes   map[string]string
	Result       string
}

type LogEvent struct {
	Message      string
	SeverityText string
	Attributes   map[string]string
}

type TraceLogRecorder interface {
	RecordSpan(event SpanEvent)
	RecordLog(event LogEvent)
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
	tracesEnabled  bool
	logsEnabled    bool
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
	tracesEndpoint, err := otlpEndpoint(config.Endpoint, "/v1/traces")
	if err != nil {
		return nil, err
	}
	logsEndpoint, err := otlpEndpoint(config.Endpoint, "/v1/logs")
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
		tracesEnabled:  config.TracesEnabled,
		logsEnabled:    config.LogsEnabled,
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
	if !exporter.tracesEnabled {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.spans) >= exporter.maxBuffer {
		return
	}
	event.Attributes = copyMetricLabels(event.Attributes)
	exporter.spans = append(exporter.spans, event)
}

func (exporter *OTLPTraceLogExporter) RecordLog(event LogEvent) {
	if exporter == nil || strings.TrimSpace(event.Message) == "" {
		return
	}
	if !exporter.logsEnabled {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.logs) >= exporter.maxBuffer {
		return
	}
	event.Attributes = copyMetricLabels(event.Attributes)
	exporter.logs = append(exporter.logs, event)
}

func (exporter *OTLPTraceLogExporter) Flush(ctx context.Context) error {
	if exporter == nil {
		return nil
	}
	spans, logs := exporter.drain()
	if len(spans) > 0 {
		if err := exporter.post(ctx, exporter.tracesEndpoint, exporter.tracePayload(spans)); err != nil {
			return err
		}
	}
	if len(logs) > 0 {
		if err := exporter.post(ctx, exporter.logsEndpoint, exporter.logPayload(logs)); err != nil {
			return err
		}
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
		err := fmt.Errorf("self-observability export failed with status %d", response.StatusCode)
		exporter.logFailure(err)
		return err
	}
	return nil
}

func (exporter *OTLPTraceLogExporter) logFailure(err error) {
	if exporter.logger == nil {
		return
	}
	exporter.logger.Warn("self-observability export failed",
		"service", "storage-read",
		"event", "self_observability_export_failed",
		"request_id", "",
		"error_id", "ERR-013",
		"error_code", "MESSAGE_BRIDGE_UNAVAILABLE",
	)
}

func (exporter *OTLPTraceLogExporter) tracePayload(spans []SpanEvent) map[string]any {
	otlpSpans := make([]map[string]any, 0, len(spans))
	for _, span := range spans {
		start := exporter.now()
		end := start.Add(time.Millisecond)
		attributes := copyMetricLabels(span.Attributes)
		attributes["result"] = boundedTraceResult(span.Result)
		traceID := span.TraceID
		if !isValidTraceID(traceID) {
			traceID = randomHex(16)
		}
		spanID := span.SpanID
		if !isValidSpanID(spanID) {
			spanID = randomHex(8)
		}
		record := map[string]any{
			"traceId":           traceID,
			"spanId":            spanID,
			"name":              span.Name,
			"kind":              "SPAN_KIND_CONSUMER",
			"startTimeUnixNano": fmt.Sprintf("%d", start.UnixNano()),
			"endTimeUnixNano":   fmt.Sprintf("%d", end.UnixNano()),
			"attributes":        otlpAttributes(attributes),
			"status": map[string]any{
				"code": statusCodeForResult(span.Result),
			},
		}
		if isValidSpanID(span.ParentSpanID) {
			record["parentSpanId"] = span.ParentSpanID
		}
		if traceState := strings.TrimSpace(span.TraceState); traceState != "" && len(traceState) <= 512 {
			record["traceState"] = traceState
		}
		otlpSpans = append(otlpSpans, record)
	}
	return map[string]any{
		"resourceSpans": []map[string]any{{
			"resource": map[string]any{"attributes": otlpAttributes(exporter.resource)},
			"scopeSpans": []map[string]any{{
				"scope": map[string]any{"name": "cloudgrid.self_observability"},
				"spans": otlpSpans,
			}},
		}},
	}
}

func (exporter *OTLPTraceLogExporter) logPayload(logs []LogEvent) map[string]any {
	records := make([]map[string]any, 0, len(logs))
	for _, log := range logs {
		severity := boundedSeverity(log.SeverityText)
		records = append(records, map[string]any{
			"timeUnixNano": fmt.Sprintf("%d", exporter.now().UnixNano()),
			"severityText": severity,
			"body":         map[string]any{"stringValue": log.Message},
			"attributes":   otlpAttributes(log.Attributes),
		})
	}
	return map[string]any{
		"resourceLogs": []map[string]any{{
			"resource": map[string]any{"attributes": otlpAttributes(exporter.resource)},
			"scopeLogs": []map[string]any{{
				"scope":      map[string]any{"name": "cloudgrid.self_observability"},
				"logRecords": records,
			}},
		}},
	}
}

func otlpEndpoint(base string, suffix string) (string, error) {
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

func otlpAttributes(attrs map[string]string) []map[string]any {
	result := make([]map[string]any, 0, len(attrs))
	for key, value := range attrs {
		if strings.TrimSpace(key) == "" || strings.TrimSpace(value) == "" {
			continue
		}
		result = append(result, map[string]any{
			"key":   key,
			"value": map[string]any{"stringValue": value},
		})
	}
	return result
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
	case "success", "persisted":
		return "STATUS_CODE_OK"
	default:
		return "STATUS_CODE_ERROR"
	}
}

func isValidTraceID(value string) bool {
	return isValidLowerHex(value, 32) && strings.Trim(value, "0") != ""
}

func isValidSpanID(value string) bool {
	return isValidLowerHex(value, 16) && strings.Trim(value, "0") != ""
}

func isValidLowerHex(value string, length int) bool {
	if len(value) != length {
		return false
	}
	for _, char := range value {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
			return false
		}
	}
	return true
}

func boundedTraceResult(result string) string {
	switch result {
	case "success", "error", "timeout", "dropped", "persisted", "rejected":
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

type TraceLogSnapshot struct {
	Spans []SpanEvent
	Logs  []LogEvent
}

type InMemoryTraceLogRecorder struct {
	mu    sync.Mutex
	spans []SpanEvent
	logs  []LogEvent
}

func NewInMemoryTraceLogRecorder() *InMemoryTraceLogRecorder {
	return &InMemoryTraceLogRecorder{}
}

func (recorder *InMemoryTraceLogRecorder) RecordSpan(event SpanEvent) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	event.Attributes = copyMetricLabels(event.Attributes)
	recorder.spans = append(recorder.spans, event)
}

func (recorder *InMemoryTraceLogRecorder) RecordLog(event LogEvent) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	event.Attributes = copyMetricLabels(event.Attributes)
	recorder.logs = append(recorder.logs, event)
}

func (recorder *InMemoryTraceLogRecorder) Snapshot() TraceLogSnapshot {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	snapshot := TraceLogSnapshot{
		Spans: make([]SpanEvent, 0, len(recorder.spans)),
		Logs:  make([]LogEvent, 0, len(recorder.logs)),
	}
	for _, span := range recorder.spans {
		span.Attributes = copyMetricLabels(span.Attributes)
		snapshot.Spans = append(snapshot.Spans, span)
	}
	for _, log := range recorder.logs {
		log.Attributes = copyMetricLabels(log.Attributes)
		snapshot.Logs = append(snapshot.Logs, log)
	}
	return snapshot
}

type selfObsBridgeMessage struct {
	BridgeMessage
	ok        *bool
	errorID   *string
	errorCode *string
}

func (message selfObsBridgeMessage) Respond(response []byte) error {
	var envelope struct {
		OK    bool                   `json:"ok"`
		Error *contracts.BridgeError `json:"error"`
	}
	if err := json.Unmarshal(response, &envelope); err == nil {
		*message.ok = envelope.OK
		if envelope.Error != nil {
			*message.errorID = envelope.Error.ID
			*message.errorCode = envelope.Error.Code
		}
	}
	return message.BridgeMessage.Respond(response)
}

func withReadSelfObservability(operation string, recorder TraceLogRecorder, handler bridgeMessageHandler) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		if recorder == nil {
			handler(msg)
			return
		}
		start := time.Now()
		ok := false
		errorID := ""
		errorCode := ""
		handler(selfObsBridgeMessage{BridgeMessage: msg, ok: &ok, errorID: &errorID, errorCode: &errorCode})
		result := "error"
		if ok {
			result = "success"
		}
		traceContext := selfobs.NewRootTraceContext()
		if headers, ok := msg.(interface{ Header(string) string }); ok {
			if parent, ok := selfobs.TraceContextFromHeaders(headers); ok {
				traceContext = selfobs.NewChildTraceContext(parent)
			}
		}
		recorder.RecordSpan(SpanEvent{
			Name:         "storage-read nats handler",
			TraceID:      traceContext.TraceID,
			SpanID:       traceContext.SpanID,
			ParentSpanID: traceContext.ParentSpanID,
			TraceState:   traceContext.TraceState,
			Attributes: map[string]string{
				"messaging.system":           "nats",
				"messaging.destination.name": boundedReadOperation(operation),
				"rpc.method":                 boundedReadOperation(operation),
				"duration_ms":                fmt.Sprintf("%d", time.Since(start).Milliseconds()),
			},
			Result: result,
		})
		if !ok {
			recorder.RecordLog(LogEvent{
				Message:      "storage read NATS handler failed",
				SeverityText: "WARN",
				Attributes: map[string]string{
					"operation":  boundedReadOperation(operation),
					"error_id":   boundedErrorID(errorID),
					"error_code": boundedErrorCode(errorCode),
				},
			})
		}
	}
}

func boundedReadOperation(operation string) string {
	switch operation {
	case "project_telemetry_overview", "trace_search", "trace_get", "log_search", "telemetry_facets", "metric_names", "metric_series", "rich_metric_series", "live_trace_start", "live_trace_stop":
		return operation
	default:
		return "unknown"
	}
}

func boundedErrorID(id string) string {
	switch id {
	case "ERR-001", "ERR-003", "ERR-006", "ERR-013", "ERR-014", "ERR-016":
		return id
	default:
		return "ERR-006"
	}
}

func boundedErrorCode(code string) string {
	switch code {
	case "VALIDATION_FAILED", "INVALID_CURSOR", "STORAGE_UNAVAILABLE", "MESSAGE_BRIDGE_UNAVAILABLE", "MESSAGE_BRIDGE_TIMEOUT", "FORBIDDEN":
		return code
	default:
		return "STORAGE_UNAVAILABLE"
	}
}
