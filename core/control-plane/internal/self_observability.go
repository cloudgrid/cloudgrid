package internal

import (
	"bytes"
	"context"
	"crypto/sha256"
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
	collectorlogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

type SelfObservabilityRecorder interface {
	RecordSpan(SelfObservabilitySpan)
	RecordLog(SelfObservabilityLog)
	Flush(context.Context) error
	Shutdown(context.Context) error
}

type SelfObservabilitySpan struct {
	Name         string
	TraceID      string
	SpanID       string
	ParentSpanID string
	TraceState   string
	StartTime    time.Time
	EndTime      time.Time
	Attributes   map[string]string
}

type SelfObservabilityLog struct {
	Timestamp    time.Time
	SeverityText string
	Body         string
	Attributes   map[string]string
}

type SelfObservabilitySignalExporterConfig struct {
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

type SelfObservabilitySignalExporter struct {
	tracesEndpoint string
	logsEndpoint   string
	bearerToken    string
	client         *http.Client
	logger         *slog.Logger
	now            func() time.Time
	resource       *resourcepb.Resource
	tracesEnabled  bool
	logsEnabled    bool
	maxBuffer      int
	stop           chan struct{}
	stopOnce       sync.Once

	mu     sync.Mutex
	spans  []SelfObservabilitySpan
	logs   []SelfObservabilityLog
	closed bool
}

func NewSelfObservabilitySignalExporter(config SelfObservabilitySignalExporterConfig) (*SelfObservabilitySignalExporter, error) {
	if !config.Enabled {
		return nil, nil
	}
	tracesEndpoint, err := selfObservabilitySignalEndpoint(config.Endpoint, "/v1/traces")
	if err != nil {
		return nil, err
	}
	logsEndpoint, err := selfObservabilitySignalEndpoint(config.Endpoint, "/v1/logs")
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
	exporter := &SelfObservabilitySignalExporter{
		tracesEndpoint: tracesEndpoint,
		logsEndpoint:   logsEndpoint,
		bearerToken:    strings.TrimSpace(config.BearerToken),
		client:         client,
		logger:         config.Logger,
		now:            now,
		maxBuffer:      maxBuffer,
		tracesEnabled:  config.TracesEnabled,
		logsEnabled:    config.LogsEnabled,
		stop:           make(chan struct{}),
		resource: &resourcepb.Resource{Attributes: selfObservabilityKeyValues(map[string]string{
			"service.name":                            config.ServiceName,
			"service.namespace":                       "cloudgrid",
			"cloudgrid.deployment_mode":               config.DeploymentMode,
			"cloudgrid.self_observability.company_id": config.CompanyID,
			"cloudgrid.self_observability.project_id": config.ProjectID,
		})},
	}
	interval := time.Duration(config.ExportIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 10 * time.Second
	}
	go exporter.run(interval)
	return exporter, nil
}

func selfObservabilitySignalEndpoint(base string, suffix string) (string, error) {
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

func (exporter *SelfObservabilitySignalExporter) run(interval time.Duration) {
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

func (exporter *SelfObservabilitySignalExporter) RecordSpan(span SelfObservabilitySpan) {
	if exporter == nil || !exporter.tracesEnabled || strings.TrimSpace(span.Name) == "" {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.spans) >= exporter.maxBuffer {
		return
	}
	span.Attributes = copyStringMap(span.Attributes)
	exporter.spans = append(exporter.spans, span)
}

func (exporter *SelfObservabilitySignalExporter) RecordLog(log SelfObservabilityLog) {
	if exporter == nil || !exporter.logsEnabled || strings.TrimSpace(log.Body) == "" {
		return
	}
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	if exporter.closed || len(exporter.logs) >= exporter.maxBuffer {
		return
	}
	log.Attributes = copyStringMap(log.Attributes)
	exporter.logs = append(exporter.logs, log)
}

func (exporter *SelfObservabilitySignalExporter) Flush(ctx context.Context) error {
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

func (exporter *SelfObservabilitySignalExporter) Shutdown(ctx context.Context) error {
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

func (exporter *SelfObservabilitySignalExporter) drain() ([]SelfObservabilitySpan, []SelfObservabilityLog) {
	exporter.mu.Lock()
	defer exporter.mu.Unlock()
	spans := append([]SelfObservabilitySpan(nil), exporter.spans...)
	logs := append([]SelfObservabilityLog(nil), exporter.logs...)
	exporter.spans = nil
	exporter.logs = nil
	return spans, logs
}

func (exporter *SelfObservabilitySignalExporter) tracePayload(spans []SelfObservabilitySpan) proto.Message {
	otlpSpans := make([]*tracepb.Span, 0, len(spans))
	for _, span := range spans {
		otlpSpans = append(otlpSpans, selfObservabilityOTLPSpan(span, exporter.now()))
	}
	return &collectortracepb.ExportTraceServiceRequest{ResourceSpans: []*tracepb.ResourceSpans{{
		Resource: exporter.resource,
		ScopeSpans: []*tracepb.ScopeSpans{{
			Scope: &commonpb.InstrumentationScope{Name: "cloudgrid.self_observability"},
			Spans: otlpSpans,
		}},
	}}}
}

func (exporter *SelfObservabilitySignalExporter) logPayload(logs []SelfObservabilityLog) proto.Message {
	records := make([]*logspb.LogRecord, 0, len(logs))
	for _, log := range logs {
		records = append(records, selfObservabilityOTLPLog(log, exporter.now()))
	}
	return &collectorlogspb.ExportLogsServiceRequest{ResourceLogs: []*logspb.ResourceLogs{{
		Resource: exporter.resource,
		ScopeLogs: []*logspb.ScopeLogs{{
			Scope:      &commonpb.InstrumentationScope{Name: "cloudgrid.self_observability"},
			LogRecords: records,
		}},
	}}}
}

func (exporter *SelfObservabilitySignalExporter) post(ctx context.Context, endpoint string, message proto.Message) error {
	payload, err := protojson.Marshal(message)
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	if exporter.bearerToken != "" {
		request.Header.Set("Authorization", "Bearer "+exporter.bearerToken)
	}
	response, err := exporter.client.Do(request)
	if err != nil {
		exporter.logFailure()
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		exporter.logFailure()
		return fmt.Errorf("self-observability export failed with status %d", response.StatusCode)
	}
	return nil
}

func selfObservabilityOTLPSpan(span SelfObservabilitySpan, fallback time.Time) *tracepb.Span {
	start := span.StartTime
	if start.IsZero() {
		start = fallback
	}
	end := span.EndTime
	if end.IsZero() || end.Before(start) {
		end = start
	}
	traceID, spanID := selfObservabilityIDs("span", span.Name, start)
	if isValidTraceID(span.TraceID) {
		traceID, _ = hex.DecodeString(span.TraceID)
	}
	if isValidSpanID(span.SpanID) {
		spanID, _ = hex.DecodeString(span.SpanID)
	}
	otlpSpan := &tracepb.Span{
		TraceId:           traceID,
		SpanId:            spanID,
		Name:              span.Name,
		Kind:              tracepb.Span_SPAN_KIND_INTERNAL,
		StartTimeUnixNano: uint64(start.UnixNano()),
		EndTimeUnixNano:   uint64(end.UnixNano()),
		Attributes:        selfObservabilityKeyValues(span.Attributes),
	}
	if isValidSpanID(span.ParentSpanID) {
		otlpSpan.ParentSpanId, _ = hex.DecodeString(span.ParentSpanID)
	}
	if traceState := strings.TrimSpace(span.TraceState); traceState != "" && len(traceState) <= 512 {
		otlpSpan.TraceState = traceState
	}
	return otlpSpan
}

func selfObservabilityOTLPLog(log SelfObservabilityLog, fallback time.Time) *logspb.LogRecord {
	timestamp := log.Timestamp
	if timestamp.IsZero() {
		timestamp = fallback
	}
	severity := logspb.SeverityNumber_SEVERITY_NUMBER_INFO
	switch strings.ToUpper(strings.TrimSpace(log.SeverityText)) {
	case "WARN", "WARNING":
		severity = logspb.SeverityNumber_SEVERITY_NUMBER_WARN
	case "ERROR":
		severity = logspb.SeverityNumber_SEVERITY_NUMBER_ERROR
	}
	return &logspb.LogRecord{
		TimeUnixNano:   uint64(timestamp.UnixNano()),
		SeverityNumber: severity,
		SeverityText:   strings.ToUpper(strings.TrimSpace(log.SeverityText)),
		Body:           &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: log.Body}},
		Attributes:     selfObservabilityKeyValues(log.Attributes),
	}
}

func selfObservabilityIDs(parts ...any) ([]byte, []byte) {
	hash := sha256.Sum256([]byte(fmt.Sprint(parts...)))
	return hash[:16], hash[16:24]
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

func selfObservabilityKeyValues(labels map[string]string) []*commonpb.KeyValue {
	items := make([]*commonpb.KeyValue, 0, len(labels))
	for key, value := range labels {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" || value == "" {
			continue
		}
		items = append(items, &commonpb.KeyValue{
			Key:   key,
			Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: value}},
		})
	}
	return items
}

func (exporter *SelfObservabilitySignalExporter) logFailure() {
	if exporter.logger == nil {
		return
	}
	exporter.logger.Warn("self_observability_export_failed",
		"service", controlPlaneService,
		"event", "self_observability_export_failed",
		"request_id", "",
		"error_id", "ERR-013",
		"error_code", "MESSAGE_BRIDGE_UNAVAILABLE",
	)
}

type InMemorySelfObservabilityRecorder struct {
	mu    sync.Mutex
	spans []SelfObservabilitySpan
	logs  []SelfObservabilityLog
}

func NewInMemorySelfObservabilityRecorder() *InMemorySelfObservabilityRecorder {
	return &InMemorySelfObservabilityRecorder{}
}

func (recorder *InMemorySelfObservabilityRecorder) RecordSpan(span SelfObservabilitySpan) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	span.Attributes = copyStringMap(span.Attributes)
	recorder.spans = append(recorder.spans, span)
}

func (recorder *InMemorySelfObservabilityRecorder) RecordLog(log SelfObservabilityLog) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	log.Attributes = copyStringMap(log.Attributes)
	recorder.logs = append(recorder.logs, log)
}

func (recorder *InMemorySelfObservabilityRecorder) Flush(context.Context) error {
	return nil
}

func (recorder *InMemorySelfObservabilityRecorder) Shutdown(context.Context) error {
	return nil
}

func (recorder *InMemorySelfObservabilityRecorder) Spans() []SelfObservabilitySpan {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return append([]SelfObservabilitySpan(nil), recorder.spans...)
}

func (recorder *InMemorySelfObservabilityRecorder) Logs() []SelfObservabilityLog {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	return append([]SelfObservabilityLog(nil), recorder.logs...)
}

func (recorder *InMemorySelfObservabilityRecorder) HasSpan(name string) bool {
	for _, span := range recorder.Spans() {
		if span.Name == name {
			return true
		}
	}
	return false
}

func (recorder *InMemorySelfObservabilityRecorder) HasLog(event string) bool {
	for _, log := range recorder.Logs() {
		if log.Attributes["event"] == event {
			return true
		}
	}
	return false
}

func copyStringMap(value map[string]string) map[string]string {
	if len(value) == 0 {
		return nil
	}
	copied := make(map[string]string, len(value))
	for key, item := range value {
		copied[key] = item
	}
	return copied
}

type selfObservabilityBridgeMessage struct {
	BridgeMessage
	response     []byte
	traceContext selfobs.TraceContext
}

func (message *selfObservabilityBridgeMessage) Respond(response []byte) error {
	message.response = append([]byte(nil), response...)
	return message.BridgeMessage.Respond(response)
}

func (message *selfObservabilityBridgeMessage) TraceContext() (selfobs.TraceContext, bool) {
	return message.traceContext, selfobs.FormatTraceParent(message.traceContext) != ""
}

func adaptBridgeHandlerWithSelfObservability(subject string, handler bridgeMessageHandler, recorder SelfObservabilityRecorder) bridgeMessageHandler {
	if recorder == nil {
		return handler
	}
	return func(msg BridgeMessage) {
		start := time.Now().UTC()
		traceContext := selfobs.NewRootTraceContext()
		if headers, ok := msg.(interface{ Header(string) string }); ok {
			if parent, ok := selfobs.TraceContextFromHeaders(headers); ok {
				traceContext = selfobs.NewChildTraceContext(parent)
			}
		}
		capture := &selfObservabilityBridgeMessage{BridgeMessage: msg, traceContext: traceContext}
		handler(capture)
		requestID, ok, bridgeError := responseObservabilityFields(capture.response)
		result := "success"
		if !ok {
			result = "error"
		}
		recorder.RecordSpan(SelfObservabilitySpan{
			Name:         "nats " + subject,
			TraceID:      traceContext.TraceID,
			SpanID:       traceContext.SpanID,
			ParentSpanID: traceContext.ParentSpanID,
			TraceState:   traceContext.TraceState,
			StartTime:    start,
			EndTime:      time.Now().UTC(),
			Attributes: map[string]string{
				"messaging.system":           "nats",
				"messaging.destination.name": boundedControlSubject(subject),
				"cloudgrid.request_id":       requestID,
				"rpc.method":                 boundedControlSubject(subject),
				"result":                     result,
			},
		})
		if bridgeError != nil {
			recorder.RecordLog(SelfObservabilityLog{
				Timestamp:    time.Now().UTC(),
				SeverityText: "WARN",
				Body:         "control plane NATS handler failed",
				Attributes: map[string]string{
					"event":                "nats_handler_failed",
					"cloudgrid.request_id": requestID,
					"error_id":             boundedControlErrorID(bridgeError.ID),
					"error_code":           boundedControlErrorCode(bridgeError.Code),
				},
			})
		}
	}
}

func responseObservabilityFields(payload []byte) (string, bool, *contracts.BridgeError) {
	var response struct {
		RequestID string                 `json:"requestId"`
		OK        bool                   `json:"ok"`
		Error     *contracts.BridgeError `json:"error,omitempty"`
	}
	if len(payload) == 0 || json.Unmarshal(payload, &response) != nil {
		return "", false, nil
	}
	return response.RequestID, response.OK, response.Error
}

func boundedControlSubject(subject string) string {
	if _, ok := ControlSubjects()[subject]; ok {
		return subject
	}
	return "unknown"
}

func boundedControlErrorID(id string) string {
	switch id {
	case "ERR-001", "ERR-003", "ERR-004", "ERR-006", "ERR-013", "ERR-016":
		return id
	default:
		return "ERR-006"
	}
}

func boundedControlErrorCode(code string) string {
	switch code {
	case "VALIDATION_FAILED", "NOT_FOUND", "TRACE_NOT_FOUND", "STORAGE_UNAVAILABLE", "MESSAGE_BRIDGE_UNAVAILABLE", "FORBIDDEN":
		return code
	default:
		return "STORAGE_UNAVAILABLE"
	}
}
