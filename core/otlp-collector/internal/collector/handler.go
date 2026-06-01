package collector

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	"github.com/cloudgrid-dev/cloudgrid/core/otlp-collector/internal/ai"
	collectorlogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

var errRequestBodyTooLarge = errors.New("request body exceeds configured limit")

type suppressSelfObservabilityContextKey struct{}

const (
	SubjectTraceIngest        = "telemetry.ingest.traces"
	SubjectLogIngest          = "telemetry.ingest.logs"
	SubjectMetricIngest       = "telemetry.ingest.metrics"
	SubjectAIProjectionIngest = "telemetry.ingest.ai_projections"

	sourceTraces  = "otlp-traces"
	sourceLogs    = "otlp-logs"
	sourceMetrics = "otlp-metrics"

	contentTypeJSON     = "application/json"
	contentTypeProtobuf = "application/x-protobuf"

	defaultMaxSpansPerRequest        = 10_000
	defaultMaxLogsPerRequest         = 10_000
	defaultMaxMetricPointsPerRequest = 20_000
	defaultPublishAckTimeout         = time.Second
)

type Publisher interface {
	Publish(ctx context.Context, subject string, data []byte) error
}

type handler struct {
	publisher          Publisher
	logger             *slog.Logger
	now                func() time.Time
	deploymentMode     string
	authMode           string
	localProjectID     string
	localProjectTokens map[string]string
	tokenValidator     BearerTokenValidator
	projectCache       *ProjectStatusCache
	maxRequestBytes    int64
	maxSpans           int
	maxLogs            int
	maxMetricPoints    int
	publishTimeout     time.Duration
	metricsRecorder    MetricsRecorder
	selfObservability  SelfObservabilityRecorder
}

type completionResponseWriter struct {
	http.ResponseWriter
	status                    int
	requestID                 string
	errorID                   string
	errorCode                 string
	suppressSelfObservability bool
}

func (w *completionResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

type countingReadCloser struct {
	io.ReadCloser
	bytes int64
}

func (reader *countingReadCloser) Read(p []byte) (int, error) {
	n, err := reader.ReadCloser.Read(p)
	reader.bytes += int64(n)
	return n, err
}

func NewHandler(publisher Publisher, logger *slog.Logger) http.Handler {
	return NewHandlerWithOptions(publisher, logger, HandlerOptions{})
}

func NewHandlerWithOptions(publisher Publisher, logger *slog.Logger, options HandlerOptions) http.Handler {
	if logger == nil {
		logger = NewLogger(os.Stdout)
	}
	now := options.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	deploymentMode := strings.TrimSpace(options.DeploymentMode)
	if deploymentMode == "" {
		deploymentMode = DeploymentModeLocal
	}
	authMode := strings.TrimSpace(options.AuthMode)
	if authMode == "" {
		authMode = AuthModeLocal
	}
	return &handler{
		publisher:          publisher,
		logger:             logger,
		now:                now,
		deploymentMode:     deploymentMode,
		authMode:           authMode,
		localProjectID:     options.LocalProjectID,
		localProjectTokens: cloneStringMap(options.LocalProjectTokens),
		tokenValidator:     options.TokenValidator,
		projectCache:       options.ProjectCache,
		maxRequestBytes:    maxRequestBytes(options.MaxRequestBytes),
		maxSpans:           maxPositiveInt(options.MaxSpans, defaultMaxSpansPerRequest),
		maxLogs:            maxPositiveInt(options.MaxLogs, defaultMaxLogsPerRequest),
		maxMetricPoints:    maxPositiveInt(options.MaxMetricPoints, defaultMaxMetricPointsPerRequest),
		publishTimeout:     defaultDuration(options.PublishTimeout, defaultPublishAckTimeout),
		metricsRecorder:    options.MetricsRecorder,
		selfObservability:  options.SelfObservability,
	}
}

func cloneStringMap(value map[string]string) map[string]string {
	if len(value) == 0 {
		return nil
	}
	result := make(map[string]string, len(value))
	for key, item := range value {
		result[key] = item
	}
	return result
}

func maxRequestBytes(configured int64) int64 {
	if configured > 0 {
		return configured
	}
	return defaultMaxRequestBytes
}

func maxPositiveInt(configured int, fallback int) int {
	if configured > 0 {
		return configured
	}
	return fallback
}

func defaultDuration(configured time.Duration, fallback time.Duration) time.Duration {
	if configured > 0 {
		return configured
	}
	return fallback
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := h.now()
	traceContext := selfobs.NewRootTraceContext()
	if parent, ok := selfobs.ParseTraceContext(r.Header.Get(selfobs.TraceParentHeader), r.Header.Get(selfobs.TraceStateHeader)); ok {
		traceContext = selfobs.NewChildTraceContext(parent)
	}
	r = r.WithContext(selfobs.ContextWithTraceContext(r.Context(), traceContext))
	recorder := &completionResponseWriter{ResponseWriter: w, status: http.StatusOK}
	bodyCounter := countRequestBody(r)
	switch r.URL.Path {
	case "/v1/traces":
		h.handleTraces(recorder, r)
	case "/v1/logs":
		h.handleLogs(recorder, r)
	case "/v1/metrics":
		h.handleMetrics(recorder, r)
	default:
		http.NotFound(recorder, r)
	}
	if !recorder.suppressSelfObservability {
		h.recordHTTPSpan(r, recorder, start)
		h.recordHTTPIngestMetrics(r, recorder, requestBodyBytes(r, bodyCounter))
	}
	h.logCompletion(r, recorder, h.now().Sub(start))
}

func countRequestBody(r *http.Request) *countingReadCloser {
	if r.Body == nil {
		return nil
	}
	counter := &countingReadCloser{ReadCloser: r.Body}
	r.Body = counter
	return counter
}

func requestBodyBytes(r *http.Request, counter *countingReadCloser) int64 {
	if counter != nil && counter.bytes > 0 {
		return counter.bytes
	}
	if r.ContentLength > 0 {
		return r.ContentLength
	}
	return 0
}

func (h *handler) handleTraces(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeProblem(w, r, methodNotAllowedProblem(r.Method, r.URL.Path))
		return
	}
	encoding, ok := requestEncoding(r.Header.Get("Content-Type"))
	if !ok {
		h.writeProblem(w, r, unsupportedMediaTypeProblem(r.Header.Get("Content-Type")))
		return
	}
	if problem := h.validateRequestSize(r); problem != nil {
		h.writeProblem(w, r, *problem)
		return
	}
	authContext, authProblem := h.authorizeIngest(r, scopeIngestTraces)
	if authProblem != nil {
		h.writeProblem(w, r, *authProblem)
		return
	}
	var request collectortracepb.ExportTraceServiceRequest
	if err := h.decodeRequestBody(r.Body, encoding, &request); err != nil {
		if errors.Is(err, errRequestBodyTooLarge) {
			h.writeProblem(w, r, requestTooLargeProblem(h.maxRequestBytes))
			return
		}
		h.writeProblem(w, r, decodeProblem(err.Error()))
		return
	}
	publishContext := r.Context()
	if traceRequestIsSelfObservability(&request) {
		suppressCompletionSelfObservability(w)
		publishContext = contextWithSuppressedSelfObservability(publishContext)
	}
	if problem := h.validateTraceCount(&request); problem != nil {
		h.writeProblem(w, r, *problem)
		return
	}
	command, err := h.traceCommand(r, &request, authContext)
	if err != nil {
		h.writeProblem(w, r, validationProblem(err.Error()))
		return
	}
	setCompletionRequestID(w, command.RequestID)
	if err := h.publish(publishContext, SubjectTraceIngest, command); err != nil {
		h.writeProblem(w, r, messageBridgeProblem())
		return
	}
	for _, projection := range ai.ExtractProjections(command.Spans, command.BridgeEnvelope, nil) {
		if err := h.publishJSON(publishContext, SubjectAIProjectionIngest, projection); err != nil {
			h.writeProblem(w, r, messageBridgeProblem())
			return
		}
	}
	h.writeTraceResponse(w, r, encoding)
}

func (h *handler) handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeProblem(w, r, methodNotAllowedProblem(r.Method, r.URL.Path))
		return
	}
	encoding, ok := requestEncoding(r.Header.Get("Content-Type"))
	if !ok {
		h.writeProblem(w, r, unsupportedMediaTypeProblem(r.Header.Get("Content-Type")))
		return
	}
	if problem := h.validateRequestSize(r); problem != nil {
		h.writeProblem(w, r, *problem)
		return
	}
	authContext, authProblem := h.authorizeIngest(r, scopeIngestLogs)
	if authProblem != nil {
		h.writeProblem(w, r, *authProblem)
		return
	}
	var request collectorlogspb.ExportLogsServiceRequest
	if err := h.decodeRequestBody(r.Body, encoding, &request); err != nil {
		if errors.Is(err, errRequestBodyTooLarge) {
			h.writeProblem(w, r, requestTooLargeProblem(h.maxRequestBytes))
			return
		}
		h.writeProblem(w, r, decodeProblem(err.Error()))
		return
	}
	publishContext := r.Context()
	if logRequestIsSelfObservability(&request) {
		suppressCompletionSelfObservability(w)
		publishContext = contextWithSuppressedSelfObservability(publishContext)
	}
	if problem := h.validateLogCount(&request); problem != nil {
		h.writeProblem(w, r, *problem)
		return
	}
	command, err := h.logCommand(r, &request, authContext)
	if err != nil {
		h.writeProblem(w, r, validationProblem(err.Error()))
		return
	}
	setCompletionRequestID(w, command.RequestID)
	if err := h.publish(publishContext, SubjectLogIngest, command); err != nil {
		h.writeProblem(w, r, messageBridgeProblem())
		return
	}
	h.writeLogsResponse(w, r, encoding)
}

func (h *handler) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		h.writeProblem(w, r, methodNotAllowedProblem(r.Method, r.URL.Path))
		return
	}
	encoding, ok := requestEncoding(r.Header.Get("Content-Type"))
	if !ok {
		h.writeProblem(w, r, unsupportedMediaTypeProblem(r.Header.Get("Content-Type")))
		return
	}
	if problem := h.validateRequestSize(r); problem != nil {
		h.writeProblem(w, r, *problem)
		return
	}
	authContext, authProblem := h.authorizeIngest(r, scopeIngestMetrics)
	if authProblem != nil {
		h.writeProblem(w, r, *authProblem)
		return
	}
	var request collectormetricspb.ExportMetricsServiceRequest
	if err := h.decodeRequestBody(r.Body, encoding, &request); err != nil {
		if errors.Is(err, errRequestBodyTooLarge) {
			h.writeProblem(w, r, requestTooLargeProblem(h.maxRequestBytes))
			return
		}
		h.writeProblem(w, r, decodeProblem(err.Error()))
		return
	}
	publishContext := r.Context()
	if metricRequestIsSelfObservability(&request) {
		suppressCompletionSelfObservability(w)
		publishContext = contextWithSuppressedSelfObservability(publishContext)
	}
	if problem := h.validateMetricPointCount(&request); problem != nil {
		h.writeProblem(w, r, *problem)
		return
	}
	command, err := h.metricCommand(r, &request, authContext)
	if err != nil {
		h.writeProblem(w, r, validationProblem(err.Error()))
		return
	}
	setCompletionRequestID(w, command.RequestID)
	if err := h.publishJSON(publishContext, SubjectMetricIngest, command); err != nil {
		h.writeProblem(w, r, messageBridgeProblem())
		return
	}
	h.writeMetricsResponse(w, r, encoding)
}

func (h *handler) traceCommand(r *http.Request, request *collectortracepb.ExportTraceServiceRequest, authContext *contracts.AuthContext) (contracts.PersistTelemetryCommand, error) {
	return h.traceCommandForRequestID(requestID(r, ""), request, authContext)
}

func (h *handler) traceCommandForRequestID(requestID string, request *collectortracepb.ExportTraceServiceRequest, authContext *contracts.AuthContext) (contracts.PersistTelemetryCommand, error) {
	receivedAt := h.now()
	spans, traces, err := NormalizeTraces(request, receivedAt)
	if err != nil {
		return contracts.PersistTelemetryCommand{}, err
	}
	commandID := newUUIDV7Like(receivedAt)
	if requestID == "" {
		requestID = commandID
	}
	return contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   requestID,
			IssuedAt:    receivedAt,
			AuthContext: authContext,
		},
		CommandID: commandID,
		Source:    sourceTraces,
		Traces:    traces,
		Spans:     spans,
		Logs:      []contracts.LogEvent{},
	}, nil
}

func (h *handler) logCommand(r *http.Request, request *collectorlogspb.ExportLogsServiceRequest, authContext *contracts.AuthContext) (contracts.PersistTelemetryCommand, error) {
	return h.logCommandForRequestID(requestID(r, ""), request, authContext)
}

func (h *handler) logCommandForRequestID(requestID string, request *collectorlogspb.ExportLogsServiceRequest, authContext *contracts.AuthContext) (contracts.PersistTelemetryCommand, error) {
	receivedAt := h.now()
	logs, err := NormalizeLogs(request, receivedAt)
	if err != nil {
		return contracts.PersistTelemetryCommand{}, err
	}
	commandID := newUUIDV7Like(receivedAt)
	if requestID == "" {
		requestID = commandID
	}
	return contracts.PersistTelemetryCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   requestID,
			IssuedAt:    receivedAt,
			AuthContext: authContext,
		},
		CommandID: commandID,
		Source:    sourceLogs,
		Traces:    []contracts.Trace{},
		Spans:     []contracts.Span{},
		Logs:      logs,
	}, nil
}

func (h *handler) metricCommand(r *http.Request, request *collectormetricspb.ExportMetricsServiceRequest, authContext *contracts.AuthContext) (contracts.PersistMetricsCommand, error) {
	return h.metricCommandForRequestID(requestID(r, ""), request, authContext)
}

func (h *handler) metricCommandForRequestID(requestID string, request *collectormetricspb.ExportMetricsServiceRequest, authContext *contracts.AuthContext) (contracts.PersistMetricsCommand, error) {
	receivedAt := h.now()
	descriptors, points, err := NormalizeMetrics(request, receivedAt)
	if err != nil {
		return contracts.PersistMetricsCommand{}, err
	}
	commandID := newUUIDV7Like(receivedAt)
	if requestID == "" {
		requestID = commandID
	}
	return contracts.PersistMetricsCommand{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   requestID,
			IssuedAt:    receivedAt,
			AuthContext: authContext,
		},
		CommandID:   commandID,
		Source:      sourceMetrics,
		Descriptors: descriptors,
		Points:      points,
	}, nil
}

func (h *handler) publish(ctx context.Context, subject string, command contracts.PersistTelemetryCommand) error {
	return h.publishJSON(ctx, subject, command)
}

func (h *handler) publishJSON(ctx context.Context, subject string, command any) error {
	payload, err := json.Marshal(command)
	if err != nil {
		return err
	}
	publishCtx, cancel := context.WithTimeout(ctx, h.publishTimeout)
	defer cancel()
	start := h.now()
	traceContext := selfobs.NewRootTraceContext()
	if parent, ok := selfobs.TraceContextFromContext(ctx); ok {
		traceContext = selfobs.NewChildTraceContext(parent)
	}
	publishCtx = selfobs.ContextWithTraceContext(publishCtx, traceContext)
	err = h.publisher.Publish(publishCtx, subject, payload)
	if !selfObservabilitySuppressed(ctx) {
		h.recordPublishSpan(subject, err, start, traceContext)
		h.recordPublish(subject, err, h.now().Sub(start))
	}
	return err
}

func (h *handler) recordHTTPSpan(r *http.Request, w *completionResponseWriter, start time.Time) {
	if h.selfObservability == nil {
		return
	}
	status := "success"
	if w.status >= 400 {
		status = "error"
	}
	traceContext, _ := selfobs.TraceContextFromContext(r.Context())
	h.selfObservability.RecordSpan(SelfObservabilitySpan{
		Name:         "otlp.http " + r.URL.Path,
		TraceID:      traceContext.TraceID,
		SpanID:       traceContext.SpanID,
		ParentSpanID: traceContext.ParentSpanID,
		TraceState:   traceContext.TraceState,
		StartTime:    start,
		EndTime:      h.now(),
		Attributes: map[string]string{
			"http.route":           r.URL.Path,
			"http.request.method":  r.Method,
			"http.response.status": fmt.Sprintf("%d", w.status),
			"cloudgrid.request_id": completionRequestID(r, w),
			"result":               status,
		},
	})
}

func (h *handler) recordPublishSpan(subject string, err error, start time.Time, traceContext selfobs.TraceContext) {
	if h.selfObservability == nil {
		return
	}
	result := "success"
	if err != nil {
		result = "error"
	}
	h.selfObservability.RecordSpan(SelfObservabilitySpan{
		Name:         "nats publish " + subject,
		TraceID:      traceContext.TraceID,
		SpanID:       traceContext.SpanID,
		ParentSpanID: traceContext.ParentSpanID,
		TraceState:   traceContext.TraceState,
		StartTime:    start,
		EndTime:      h.now(),
		Attributes: map[string]string{
			"messaging.system":           "nats",
			"messaging.destination.name": subject,
			"result":                     result,
		},
	})
}

func (h *handler) recordHTTPIngestMetrics(r *http.Request, w *completionResponseWriter, requestBytes int64) {
	signal := signalForPath(r.URL.Path)
	if signal == "unknown" || h.metricsRecorder == nil {
		return
	}
	result := "accepted"
	if w.status >= 400 {
		result = "rejected"
	}
	h.metricsRecorder.RecordIngestRequest(signal, "http", result)
	h.metricsRecorder.RecordIngestBytes(signal, "http", result, requestBytes)
}

func (h *handler) recordGRPCIngestMetrics(signal string, result string, bytes int64) {
	if h.metricsRecorder == nil {
		return
	}
	h.metricsRecorder.RecordIngestRequest(signal, "grpc", result)
	h.metricsRecorder.RecordIngestBytes(signal, "grpc", result, bytes)
}

func (h *handler) recordPublish(subject string, err error, duration time.Duration) {
	if h.metricsRecorder == nil {
		return
	}
	signal := signalForSubject(subject)
	result := "published"
	if err != nil {
		result = "error"
	}
	h.metricsRecorder.RecordPublishDuration(signal, result, duration)
	if err == nil {
		h.metricsRecorder.RecordCommandPublished(signal, "published")
	}
}

func (h *handler) writeTraceResponse(w http.ResponseWriter, r *http.Request, encoding payloadEncoding) {
	h.writeOTLPResponse(w, r, encoding, &collectortracepb.ExportTraceServiceResponse{})
}

func (h *handler) writeLogsResponse(w http.ResponseWriter, r *http.Request, encoding payloadEncoding) {
	h.writeOTLPResponse(w, r, encoding, &collectorlogspb.ExportLogsServiceResponse{})
}

func (h *handler) writeMetricsResponse(w http.ResponseWriter, r *http.Request, encoding payloadEncoding) {
	h.writeOTLPResponse(w, r, encoding, &collectormetricspb.ExportMetricsServiceResponse{})
}

func (h *handler) writeOTLPResponse(w http.ResponseWriter, r *http.Request, encoding payloadEncoding, message proto.Message) {
	payload, err := encodeOTLP(encoding, message)
	if err != nil {
		h.writeProblem(w, r, validationProblem("failed to encode OTLP response"))
		return
	}
	if encoding == payloadJSON {
		w.Header().Set("Content-Type", contentTypeJSON)
	} else {
		w.Header().Set("Content-Type", contentTypeProtobuf)
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func (h *handler) writeProblem(w http.ResponseWriter, r *http.Request, problem problemDetails) {
	setCompletionProblem(w, requestID(r, ""), problem.ID, problem.Code)
	if h.selfObservability != nil && !completionSelfObservabilitySuppressed(w) {
		h.selfObservability.RecordLog(SelfObservabilityLog{
			Timestamp:    h.now(),
			SeverityText: "WARN",
			Body:         "collector request failed",
			Attributes: map[string]string{
				"event":                "request_failed",
				"cloudgrid.request_id": requestID(r, ""),
				"error_id":             problem.ID,
				"error_code":           problem.Code,
			},
		})
	}
	h.logger.Warn(problem.Detail,
		"service", serviceName,
		"event", "request_failed",
		"request_id", requestID(r, ""),
		"error_id", problem.ID,
		"error_code", problem.Code,
	)
	w.Header().Set("Content-Type", contentTypeJSON)
	w.WriteHeader(problem.Status)
	_ = json.NewEncoder(w).Encode(errorResponse{Error: problem})
}

func completionRequestID(r *http.Request, w *completionResponseWriter) string {
	if w != nil && w.requestID != "" {
		return w.requestID
	}
	return requestID(r, "")
}

func (h *handler) validateRequestSize(r *http.Request) *problemDetails {
	if r.ContentLength > h.maxRequestBytes {
		problem := requestTooLargeProblem(h.maxRequestBytes)
		return &problem
	}
	return nil
}

func (h *handler) validateTraceCount(request *collectortracepb.ExportTraceServiceRequest) *problemDetails {
	count := traceSpanCount(request)
	if count > h.maxSpans {
		problem := validationProblem(fmt.Sprintf("trace export has %d spans, exceeds configured limit %d", count, h.maxSpans))
		return &problem
	}
	return nil
}

func (h *handler) validateLogCount(request *collectorlogspb.ExportLogsServiceRequest) *problemDetails {
	count := logRecordCount(request)
	if count > h.maxLogs {
		problem := validationProblem(fmt.Sprintf("log export has %d log records, exceeds configured limit %d", count, h.maxLogs))
		return &problem
	}
	return nil
}

func (h *handler) validateMetricPointCount(request *collectormetricspb.ExportMetricsServiceRequest) *problemDetails {
	count := metricPointCount(request)
	if count > h.maxMetricPoints {
		problem := validationProblem(fmt.Sprintf("metric export has %d points, exceeds configured limit %d", count, h.maxMetricPoints))
		return &problem
	}
	return nil
}

func (h *handler) decodeRequestBody(body io.Reader, encoding payloadEncoding, message proto.Message) error {
	return decodeOTLPWithLimit(body, h.maxRequestBytes, encoding, message)
}

func traceSpanCount(request *collectortracepb.ExportTraceServiceRequest) int {
	count := 0
	for _, resourceSpans := range request.GetResourceSpans() {
		for _, scopeSpans := range resourceSpans.GetScopeSpans() {
			count += len(scopeSpans.GetSpans())
		}
	}
	return count
}

func logRecordCount(request *collectorlogspb.ExportLogsServiceRequest) int {
	count := 0
	for _, resourceLogs := range request.GetResourceLogs() {
		for _, scopeLogs := range resourceLogs.GetScopeLogs() {
			count += len(scopeLogs.GetLogRecords())
		}
	}
	return count
}

func metricPointCount(request *collectormetricspb.ExportMetricsServiceRequest) int {
	count := 0
	for _, resourceMetrics := range request.GetResourceMetrics() {
		for _, scopeMetrics := range resourceMetrics.GetScopeMetrics() {
			for _, metric := range scopeMetrics.GetMetrics() {
				count += len(metric.GetGauge().GetDataPoints())
				count += len(metric.GetSum().GetDataPoints())
				count += len(metric.GetHistogram().GetDataPoints())
				count += len(metric.GetExponentialHistogram().GetDataPoints())
				count += len(metric.GetSummary().GetDataPoints())
			}
		}
	}
	return count
}

func (h *handler) logCompletion(r *http.Request, w *completionResponseWriter, duration time.Duration) {
	status := "ok"
	level := slog.LevelDebug
	if w.status >= 400 {
		status = "error"
		level = slog.LevelWarn
	}
	completionRequestID := w.requestID
	if completionRequestID == "" {
		completionRequestID = requestID(r, "")
	}
	attrs := []any{
		"service", serviceName,
		"event", "http_request_completed",
		"request_id", completionRequestID,
		"operation_or_subject", r.URL.Path,
		"status", status,
		"duration_ms", duration.Milliseconds(),
		"http_status", w.status,
	}
	if w.errorID != "" {
		attrs = append(attrs, "error_id", w.errorID, "error_code", w.errorCode)
	}
	h.logger.Log(context.Background(), level, "collector HTTP request completed", attrs...)
}

func setCompletionRequestID(w http.ResponseWriter, requestID string) {
	if recorder, ok := w.(*completionResponseWriter); ok {
		recorder.requestID = requestID
	}
}

func setCompletionProblem(w http.ResponseWriter, requestID string, errorID string, errorCode string) {
	if recorder, ok := w.(*completionResponseWriter); ok {
		recorder.requestID = requestID
		recorder.errorID = errorID
		recorder.errorCode = errorCode
	}
}

func suppressCompletionSelfObservability(w http.ResponseWriter) {
	if recorder, ok := w.(*completionResponseWriter); ok {
		recorder.suppressSelfObservability = true
	}
}

func completionSelfObservabilitySuppressed(w http.ResponseWriter) bool {
	recorder, ok := w.(*completionResponseWriter)
	return ok && recorder.suppressSelfObservability
}

func contextWithSuppressedSelfObservability(ctx context.Context) context.Context {
	return context.WithValue(ctx, suppressSelfObservabilityContextKey{}, true)
}

func selfObservabilitySuppressed(ctx context.Context) bool {
	suppressed, _ := ctx.Value(suppressSelfObservabilityContextKey{}).(bool)
	return suppressed
}

func traceRequestIsSelfObservability(request *collectortracepb.ExportTraceServiceRequest) bool {
	for _, resourceSpans := range request.GetResourceSpans() {
		if attributesIncludeSelfObservabilityMarker(resourceSpans.GetResource().GetAttributes()) {
			return true
		}
	}
	return false
}

func logRequestIsSelfObservability(request *collectorlogspb.ExportLogsServiceRequest) bool {
	for _, resourceLogs := range request.GetResourceLogs() {
		if attributesIncludeSelfObservabilityMarker(resourceLogs.GetResource().GetAttributes()) {
			return true
		}
	}
	return false
}

func metricRequestIsSelfObservability(request *collectormetricspb.ExportMetricsServiceRequest) bool {
	for _, resourceMetrics := range request.GetResourceMetrics() {
		if attributesIncludeSelfObservabilityMarker(resourceMetrics.GetResource().GetAttributes()) {
			return true
		}
	}
	return false
}

func attributesIncludeSelfObservabilityMarker(attributes []*commonpb.KeyValue) bool {
	for _, attribute := range attributes {
		switch attribute.GetKey() {
		case "cloudgrid.self_observability.project_id", "cloudgrid.self_observability.company_id":
			if strings.TrimSpace(attribute.GetValue().GetStringValue()) != "" {
				return true
			}
		}
	}
	return false
}

type payloadEncoding int

const (
	payloadJSON payloadEncoding = iota
	payloadProtobuf
)

func requestEncoding(contentType string) (payloadEncoding, bool) {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return payloadJSON, false
	}
	switch strings.ToLower(mediaType) {
	case contentTypeJSON:
		return payloadJSON, true
	case contentTypeProtobuf:
		return payloadProtobuf, true
	default:
		return payloadJSON, false
	}
}

func decodeOTLP(reader io.Reader, encoding payloadEncoding, message proto.Message) error {
	payload, err := io.ReadAll(reader)
	if err != nil {
		return fmt.Errorf("read request body")
	}
	switch encoding {
	case payloadJSON:
		if err := protojson.Unmarshal(payload, message); err != nil {
			return fmt.Errorf("invalid JSON OTLP")
		}
	case payloadProtobuf:
		if err := proto.Unmarshal(payload, message); err != nil {
			return fmt.Errorf("invalid protobuf OTLP")
		}
	default:
		return fmt.Errorf("unsupported OTLP encoding")
	}
	return nil
}

func decodeOTLPWithLimit(reader io.Reader, limit int64, encoding payloadEncoding, message proto.Message) error {
	payload, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return fmt.Errorf("read request body")
	}
	if int64(len(payload)) > limit {
		return errRequestBodyTooLarge
	}
	return decodeOTLPPayload(payload, encoding, message)
}

func decodeOTLPPayload(payload []byte, encoding payloadEncoding, message proto.Message) error {
	switch encoding {
	case payloadJSON:
		if err := protojson.Unmarshal(payload, message); err != nil {
			return fmt.Errorf("invalid JSON OTLP")
		}
	case payloadProtobuf:
		if err := proto.Unmarshal(payload, message); err != nil {
			return fmt.Errorf("invalid protobuf OTLP")
		}
	default:
		return fmt.Errorf("unsupported OTLP encoding")
	}
	return nil
}

func encodeOTLP(encoding payloadEncoding, message proto.Message) ([]byte, error) {
	switch encoding {
	case payloadJSON:
		return protojson.Marshal(message)
	case payloadProtobuf:
		return proto.Marshal(message)
	default:
		return nil, fmt.Errorf("unsupported OTLP encoding")
	}
}

func requestID(r *http.Request, fallback string) string {
	requestID := strings.TrimSpace(r.Header.Get("X-Request-Id"))
	if requestID != "" {
		return requestID
	}
	return fallback
}

func newUUIDV7Like(now time.Time) string {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		nanos := now.UnixNano()
		for index := range bytes {
			bytes[index] = byte(nanos >> (index % 8 * 8))
		}
	}
	millis := uint64(now.UnixMilli())
	bytes[0] = byte(millis >> 40)
	bytes[1] = byte(millis >> 32)
	bytes[2] = byte(millis >> 24)
	bytes[3] = byte(millis >> 16)
	bytes[4] = byte(millis >> 8)
	bytes[5] = byte(millis)
	bytes[6] = (bytes[6] & 0x0f) | 0x70
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16])
}
