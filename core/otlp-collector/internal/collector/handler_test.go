package collector

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	collectorlogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	logspb "go.opentelemetry.io/proto/otlp/logs/v1"
	metricspb "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestUnsupportedContentTypeReturnsProblemAndDoesNotPublish(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewBufferString("{}"))
	request.Header.Set("Content-Type", "text/plain")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnsupportedMediaType)
	}
	var body errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if body.Error.ID != "ERR-002" || body.Error.Code != "UNSUPPORTED_MEDIA_TYPE" {
		t.Fatalf("problem = %#v, want ERR-002 UNSUPPORTED_MEDIA_TYPE", body.Error)
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestMethodNotAllowedReturnsProblemAndCompletionLog(t *testing.T) {
	var out bytes.Buffer
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewLogger(&out))

	request := httptest.NewRequest(http.MethodGet, "/v1/traces", nil)
	request.Header.Set("X-Request-Id", "req-method")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
	var body errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if body.Error.ID != "ERR-005" || body.Error.Code != "METHOD_NOT_ALLOWED" {
		t.Fatalf("problem = %#v, want ERR-005 METHOD_NOT_ALLOWED", body.Error)
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
	entry := lastJSONLog(t, out.Bytes())
	if entry["request_id"] != "req-method" || entry["status"] != "error" || entry["error_id"] != "ERR-005" {
		t.Fatalf("completion log = %#v", entry)
	}
}

func TestTraceJSONDecodeNormalizePublishAndResponseEncoding(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json; charset=utf-8")
	request.Header.Set("X-Request-Id", "req-trace-json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	if publisher.callCount() != 1 {
		t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
	}
	call := publisher.calls[0]
	if call.subject != "telemetry.ingest.traces" {
		t.Fatalf("subject = %q, want telemetry.ingest.traces", call.subject)
	}
	var command contracts.PersistTelemetryCommand
	if err := json.Unmarshal(call.data, &command); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}
	if command.RequestID != "req-trace-json" {
		t.Fatalf("requestId = %q, want req-trace-json", command.RequestID)
	}
	if command.CommandID == "" {
		t.Fatal("commandId is empty")
	}
	if command.Source != "otlp-traces" {
		t.Fatalf("source = %q, want otlp-traces", command.Source)
	}
	if len(command.Traces) != 1 || len(command.Spans) != 2 || len(command.Logs) != 0 {
		t.Fatalf("counts traces=%d spans=%d logs=%d, want 1/2/0", len(command.Traces), len(command.Spans), len(command.Logs))
	}

	trace := command.Traces[0]
	if trace.ID != "0102030405060708090a0b0c0d0e0f10" {
		t.Fatalf("trace id = %q", trace.ID)
	}
	if got := deref(trace.ServiceName); got != "checkout-api" {
		t.Fatalf("trace service = %q, want checkout-api", got)
	}
	if got := deref(trace.RootSpanID); got != "1112131415161718" {
		t.Fatalf("root span = %q, want 1112131415161718", got)
	}
	if trace.Status == nil || *trace.Status != contracts.TraceStatusError {
		t.Fatalf("trace status = %#v, want error", trace.Status)
	}
	if trace.DurationMs == nil || *trace.DurationMs != 25 {
		t.Fatalf("trace duration = %#v, want 25", trace.DurationMs)
	}

	root := command.Spans[0]
	if root.ID != "1112131415161718" || root.TraceID != trace.ID || root.Name != "POST /orders" {
		t.Fatalf("root span = %#v", root)
	}
	if got := deref(root.ServiceName); got != "checkout-api" {
		t.Fatalf("span service = %q, want checkout-api", got)
	}
	if root.Attributes["service.name"] != "checkout-api" || root.Attributes["http.method"] != "POST" || root.Attributes["scope.key"] != "scope-value" {
		t.Fatalf("span attributes = %#v", root.Attributes)
	}
	if len(root.Events) != 1 || root.Events[0].Name != "agent.step" || root.Events[0].Attributes["gen_ai.operation.name"] != "chat" {
		t.Fatalf("span events = %#v", root.Events)
	}

	var exportResponse collectortracepb.ExportTraceServiceResponse
	if err := protojson.Unmarshal(response.Body.Bytes(), &exportResponse); err != nil {
		t.Fatalf("response is not JSON ExportTraceServiceResponse: %v", err)
	}
}

func TestTraceNormalizePreservesSpanLinksWithoutDirection(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", "req-trace-links")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	var command contracts.PersistTelemetryCommand
	if err := json.Unmarshal(publisher.calls[0].data, &command); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}
	if len(command.Spans) == 0 || len(command.Spans[0].Links) != 1 {
		t.Fatalf("root span links = %#v, want one link", command.Spans[0].Links)
	}
	link := command.Spans[0].Links[0]
	if link.TraceID != "f0e0d0c0b0a090807060504030201000" {
		t.Fatalf("link traceId = %q", link.TraceID)
	}
	if link.SpanID != "8070605040302010" {
		t.Fatalf("link spanId = %q", link.SpanID)
	}
	if got := deref(link.TraceState); got != "vendor=value" {
		t.Fatalf("link traceState = %q, want vendor=value", got)
	}
	if link.Attributes["link.kind"] != "follows_from" {
		t.Fatalf("link attributes = %#v", link.Attributes)
	}
	if link.Direction != nil {
		t.Fatalf("link direction = %#v, want nil because direction is UI-derived", link.Direction)
	}
}

func TestTraceIngestPublishesNormalTelemetryAndAIProjection(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		Now: func() time.Time { return time.Unix(1_800_000_000, 0).UTC() },
	})
	payload := mustProtoJSON(t, aiTraceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", "req-ai-projection")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	if publisher.callCount() != 2 {
		t.Fatalf("publisher calls = %d, want normal telemetry and ai projection", publisher.callCount())
	}
	if publisher.calls[0].subject != "telemetry.ingest.traces" {
		t.Fatalf("first subject = %q, want telemetry.ingest.traces", publisher.calls[0].subject)
	}
	if publisher.calls[1].subject != "telemetry.ingest.ai_projections" {
		t.Fatalf("second subject = %q, want telemetry.ingest.ai_projections", publisher.calls[1].subject)
	}

	var telemetry contracts.PersistTelemetryCommand
	if err := json.Unmarshal(publisher.calls[0].data, &telemetry); err != nil {
		t.Fatalf("unmarshal telemetry command: %v", err)
	}
	if telemetry.Spans[0].Attributes["cloudgrid.ai.semconv.flavor"] != "both" {
		t.Fatalf("span semconv flavor = %#v, want both", telemetry.Spans[0].Attributes["cloudgrid.ai.semconv.flavor"])
	}

	var projection contracts.PersistAiProjectionCommand
	if err := json.Unmarshal(publisher.calls[1].data, &projection); err != nil {
		t.Fatalf("unmarshal ai projection command: %v", err)
	}
	if projection.RequestID != "req-ai-projection" || projection.Kind != contracts.AiProjectionKindLLMCall {
		t.Fatalf("projection command = %#v", projection)
	}
	serialized := string(publisher.calls[1].data)
	for _, forbidden := range []string{"secret prompt body", "secret answer body"} {
		if bytes.Contains([]byte(serialized), []byte(forbidden)) {
			t.Fatalf("projection command copied content %q: %s", forbidden, serialized)
		}
	}
}

func TestHTTPCompletionLogUsesJSONShapeAndOmitsPayloads(t *testing.T) {
	var out bytes.Buffer
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewLogger(&out))
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", "req-log-shape")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	entry := lastJSONLog(t, out.Bytes())
	for _, key := range []string{"timestamp", "level", "service", "event", "request_id", "message", "operation_or_subject", "status", "duration_ms"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("log missing key %q: %#v", key, entry)
		}
	}
	if entry["event"] != "http_request_completed" || entry["request_id"] != "req-log-shape" || entry["status"] != "ok" {
		t.Fatalf("completion log = %#v", entry)
	}
	logLine := string(out.Bytes())
	for _, forbidden := range []string{"ResourceSpans", "checkout-api", "POST /orders", "password"} {
		if bytes.Contains([]byte(logLine), []byte(forbidden)) {
			t.Fatalf("completion log contains forbidden payload detail %q: %s", forbidden, logLine)
		}
	}
}

func TestLogsProtobufDecodeNormalizePublishAndResponseEncoding(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload, err := proto.Marshal(logsRequest())
	if err != nil {
		t.Fatalf("marshal logs request: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/x-protobuf")
	request.Header.Set("X-Request-Id", "req-logs-protobuf")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	if publisher.callCount() != 1 {
		t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
	}
	call := publisher.calls[0]
	if call.subject != "telemetry.ingest.logs" {
		t.Fatalf("subject = %q, want telemetry.ingest.logs", call.subject)
	}
	var command contracts.PersistTelemetryCommand
	if err := json.Unmarshal(call.data, &command); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}
	if command.Source != "otlp-logs" || len(command.Traces) != 0 || len(command.Spans) != 0 || len(command.Logs) != 1 {
		t.Fatalf("command = %#v", command)
	}
	logEvent := command.Logs[0]
	if logEvent.ID == "" {
		t.Fatal("log id is empty")
	}
	if got := deref(logEvent.TraceID); got != "0102030405060708090a0b0c0d0e0f10" {
		t.Fatalf("trace id = %q", got)
	}
	if got := deref(logEvent.SpanID); got != "1112131415161718" {
		t.Fatalf("span id = %q", got)
	}
	if got := deref(logEvent.ServiceName); got != "checkout-api" {
		t.Fatalf("service = %q", got)
	}
	if got := deref(logEvent.SeverityText); got != "INFO" {
		t.Fatalf("severity text = %q", got)
	}
	if logEvent.SeverityNumber == nil || *logEvent.SeverityNumber != int(logspb.SeverityNumber_SEVERITY_NUMBER_INFO) {
		t.Fatalf("severity number = %#v", logEvent.SeverityNumber)
	}
	if logEvent.Body != "order created" {
		t.Fatalf("body = %#v, want order created", logEvent.Body)
	}
	if logEvent.Attributes["service.name"] != "checkout-api" || logEvent.Attributes["log.key"] != "log-value" {
		t.Fatalf("attributes = %#v", logEvent.Attributes)
	}
	if logEvent.Correlation == nil || *logEvent.Correlation != contracts.LogCorrelationSpan {
		t.Fatalf("correlation = %#v, want span", logEvent.Correlation)
	}

	var exportResponse collectorlogspb.ExportLogsServiceResponse
	if err := proto.Unmarshal(response.Body.Bytes(), &exportResponse); err != nil {
		t.Fatalf("response is not protobuf ExportLogsServiceResponse: %v", err)
	}
}

func TestLogsJSONDecodeNormalizePublishAndResponseEncoding(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload := mustProtoJSON(t, logsRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", "req-logs-json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	if publisher.callCount() != 1 {
		t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
	}
	var command contracts.PersistTelemetryCommand
	if err := json.Unmarshal(publisher.calls[0].data, &command); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}
	if command.RequestID != "req-logs-json" || command.Source != "otlp-logs" || len(command.Logs) != 1 {
		t.Fatalf("command = %#v", command)
	}
	var exportResponse collectorlogspb.ExportLogsServiceResponse
	if err := protojson.Unmarshal(response.Body.Bytes(), &exportResponse); err != nil {
		t.Fatalf("response is not JSON ExportLogsServiceResponse: %v", err)
	}
}

func TestMetricsJSONDecodeNormalizePublishAndResponseEncoding(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload := mustProtoJSON(t, metricsRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Request-Id", "req-metrics-json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	if publisher.callCount() != 1 {
		t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
	}
	call := publisher.calls[0]
	if call.subject != "telemetry.ingest.metrics" {
		t.Fatalf("subject = %q, want telemetry.ingest.metrics", call.subject)
	}
	var command map[string]any
	if err := json.Unmarshal(call.data, &command); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}
	if command["requestId"] != "req-metrics-json" || command["source"] != "otlp-metrics" {
		t.Fatalf("command envelope = %#v", command)
	}
	descriptors := command["descriptors"].([]any)
	points := command["points"].([]any)
	if len(descriptors) != 2 || len(points) != 2 {
		t.Fatalf("counts descriptors=%d points=%d, want 2/2", len(descriptors), len(points))
	}
	firstDescriptor := descriptors[0].(map[string]any)
	if firstDescriptor["name"] != "orders.created" || firstDescriptor["kind"] != "sum" || firstDescriptor["aggregationTemporality"] != "cumulative" || firstDescriptor["monotonic"] != true {
		t.Fatalf("sum descriptor = %#v", firstDescriptor)
	}
	firstPoint := points[0].(map[string]any)
	if firstPoint["metricName"] != "orders.created" || firstPoint["kind"] != "sum" || firstPoint["value"] != float64(7) {
		t.Fatalf("sum point = %#v", firstPoint)
	}
	attrs := firstPoint["attributes"].(map[string]any)
	if attrs["service.name"] != "checkout-api" || attrs["scope.key"] != "scope-value" || attrs["route"] != "/orders" {
		t.Fatalf("point attributes = %#v", attrs)
	}
	if firstPoint["serviceName"] != "checkout-api" || firstPoint["scopeName"] != "checkout-meter" {
		t.Fatalf("point service/scope = %#v", firstPoint)
	}
	secondPoint := points[1].(map[string]any)
	exemplars := secondPoint["exemplars"].([]any)
	if len(exemplars) != 1 {
		t.Fatalf("histogram exemplars = %#v, want one", exemplars)
	}
	exemplar := exemplars[0].(map[string]any)
	if exemplar["traceId"] != "0102030405060708090a0b0c0d0e0f10" || exemplar["spanId"] != "1112131415161718" {
		t.Fatalf("exemplar = %#v", exemplar)
	}

	var exportResponse collectormetricspb.ExportMetricsServiceResponse
	if err := protojson.Unmarshal(response.Body.Bytes(), &exportResponse); err != nil {
		t.Fatalf("response is not JSON ExportMetricsServiceResponse: %v", err)
	}
}

func TestMetricsProtobufDecodeNormalizePublishAndResponseEncoding(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload, err := proto.Marshal(metricsRequest())
	if err != nil {
		t.Fatalf("marshal metrics request: %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/x-protobuf")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
	var exportResponse collectormetricspb.ExportMetricsServiceResponse
	if err := proto.Unmarshal(response.Body.Bytes(), &exportResponse); err != nil {
		t.Fatalf("response is not protobuf ExportMetricsServiceResponse: %v", err)
	}
}

func TestMalformedJSONReturnsDecodeProblemAndDoesNotPublish(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())

	request := httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewBufferString("{"))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	var body errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if body.Error.ID != "ERR-008" || body.Error.Code != "OTLP_DECODE_FAILED" {
		t.Fatalf("problem = %#v, want ERR-008 OTLP_DECODE_FAILED", body.Error)
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestMalformedProtobufReturnsDecodeProblemAndDoesNotPublish(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewBufferString("not protobuf"))
	request.Header.Set("Content-Type", "application/x-protobuf")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	var body errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if body.Error.ID != "ERR-008" || body.Error.Code != "OTLP_DECODE_FAILED" {
		t.Fatalf("problem = %#v, want ERR-008 OTLP_DECODE_FAILED", body.Error)
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestOversizedTraceLogAndMetricExportsReturnValidationProblemAndDoNotPublish(t *testing.T) {
	tests := []struct {
		name    string
		path    string
		options HandlerOptions
		payload []byte
	}{
		{
			name:    "traces",
			path:    "/v1/traces",
			options: HandlerOptions{MaxSpans: 1},
			payload: mustProtoJSON(t, traceRequest()),
		},
		{
			name:    "logs",
			path:    "/v1/logs",
			options: HandlerOptions{MaxLogs: 0},
			payload: mustProtoJSON(t, logsRequestWithRecords(2)),
		},
		{
			name:    "metrics",
			path:    "/v1/metrics",
			options: HandlerOptions{MaxMetricPoints: 1},
			payload: mustProtoJSON(t, metricsRequest()),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.name == "logs" {
				tt.options.MaxLogs = 1
			}
			publisher := &recordingPublisher{}
			handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), tt.options)
			request := httptest.NewRequest(http.MethodPost, tt.path, bytes.NewReader(tt.payload))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d body = %s, want 400", response.Code, response.Body.String())
			}
			var body errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatalf("unmarshal error response: %v", err)
			}
			if body.Error.ID != "ERR-001" || body.Error.Code != "VALIDATION_FAILED" {
				t.Fatalf("problem = %#v, want ERR-001 VALIDATION_FAILED", body.Error)
			}
			if publisher.callCount() != 0 {
				t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
			}
		})
	}
}

func TestInvalidSpanReturnsValidationProblemAndDoesNotPublish(t *testing.T) {
	publisher := &recordingPublisher{}
	handler := NewHandler(publisher, NewDiscardLogger())
	requestPayload := traceRequest()
	requestPayload.ResourceSpans[0].ScopeSpans[0].Spans[0].TraceId = nil
	payload := mustProtoJSON(t, requestPayload)

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
	var body errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if body.Error.ID != "ERR-001" || body.Error.Code != "VALIDATION_FAILED" {
		t.Fatalf("problem = %#v, want ERR-001 VALIDATION_FAILED", body.Error)
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestNormalizeLogsMapsAnyValueVariantsAndAttributeCorrelation(t *testing.T) {
	receivedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	request := &collectorlogspb.ExportLogsServiceRequest{
		ResourceLogs: []*logspb.ResourceLogs{{
			Resource: &resourcepb.Resource{Attributes: []*commonpb.KeyValue{
				stringAttr("service.name", "worker"),
				stringAttr("trace_id", "ABCDEF0123456789ABCDEF0123456789"),
				stringAttr("span_id", "ABCDEF0123456789"),
				{Key: "bool", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_BoolValue{BoolValue: true}}},
				{Key: "int", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_IntValue{IntValue: 42}}},
				{Key: "double", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_DoubleValue{DoubleValue: 1.5}}},
				{Key: "bytes", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_BytesValue{BytesValue: []byte{0xab, 0xcd}}}},
				{
					Key: "array",
					Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_ArrayValue{ArrayValue: &commonpb.ArrayValue{Values: []*commonpb.AnyValue{
						stringValue("a"),
						&commonpb.AnyValue{Value: &commonpb.AnyValue_IntValue{IntValue: 2}},
					}}}},
				},
				{Key: "kv", Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_KvlistValue{KvlistValue: &commonpb.KeyValueList{Values: []*commonpb.KeyValue{stringAttr("nested", "yes")}}}}},
			}},
			ScopeLogs: []*logspb.ScopeLogs{{
				LogRecords: []*logspb.LogRecord{{
					ObservedTimeUnixNano: uint64(receivedAt.Add(time.Second).UnixNano()),
					Body:                 &commonpb.AnyValue{Value: &commonpb.AnyValue_BoolValue{BoolValue: true}},
				}},
			}},
		}},
	}

	logs, err := NormalizeLogs(request, receivedAt)
	if err != nil {
		t.Fatalf("NormalizeLogs() error = %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("logs = %d, want 1", len(logs))
	}
	logEvent := logs[0]
	if logEvent.Body != true {
		t.Fatalf("body = %#v, want true", logEvent.Body)
	}
	if got := deref(logEvent.TraceID); got != "abcdef0123456789abcdef0123456789" {
		t.Fatalf("trace id = %q", got)
	}
	if got := deref(logEvent.SpanID); got != "abcdef0123456789" {
		t.Fatalf("span id = %q", got)
	}
	if logEvent.Correlation == nil || *logEvent.Correlation != contracts.LogCorrelationSpan {
		t.Fatalf("correlation = %#v, want span", logEvent.Correlation)
	}
	if logEvent.Attributes["bool"] != true || logEvent.Attributes["int"] != int64(42) || logEvent.Attributes["double"] != 1.5 || logEvent.Attributes["bytes"] != "abcd" {
		t.Fatalf("scalar attributes = %#v", logEvent.Attributes)
	}
	array := logEvent.Attributes["array"].([]any)
	if len(array) != 2 || array[0] != "a" || array[1] != int64(2) {
		t.Fatalf("array attribute = %#v", array)
	}
	kv := logEvent.Attributes["kv"].(contracts.Attributes)
	if kv["nested"] != "yes" {
		t.Fatalf("kv attribute = %#v", kv)
	}
}

func TestNormalizeLogsUsesReceivedAtAndNoneCorrelationWhenTimestampAndTraceAreAbsent(t *testing.T) {
	receivedAt := time.Date(2026, 5, 8, 8, 0, 0, 0, time.UTC)
	request := &collectorlogspb.ExportLogsServiceRequest{
		ResourceLogs: []*logspb.ResourceLogs{{
			ScopeLogs: []*logspb.ScopeLogs{{
				LogRecords: []*logspb.LogRecord{{Body: stringValue("uncorrelated")}},
			}},
		}},
	}

	logs, err := NormalizeLogs(request, receivedAt)
	if err != nil {
		t.Fatalf("NormalizeLogs() error = %v", err)
	}
	if logs[0].Timestamp != receivedAt {
		t.Fatalf("timestamp = %s, want receivedAt %s", logs[0].Timestamp, receivedAt)
	}
	if logs[0].ObservedTimestamp != nil {
		t.Fatalf("observed timestamp = %#v, want nil", logs[0].ObservedTimestamp)
	}
	if logs[0].Correlation == nil || *logs[0].Correlation != contracts.LogCorrelationNone {
		t.Fatalf("correlation = %#v, want none", logs[0].Correlation)
	}
}

func TestPublishFailureReturnsMessageBridgeProblem(t *testing.T) {
	publisher := &recordingPublisher{err: errors.New("nats unavailable")}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload := mustProtoJSON(t, traceRequest())

	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	var body errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if body.Error.ID != "ERR-013" || body.Error.Code != "MESSAGE_BRIDGE_UNAVAILABLE" {
		t.Fatalf("problem = %#v, want ERR-013 MESSAGE_BRIDGE_UNAVAILABLE", body.Error)
	}
}

func TestHTTP200WaitsForPublishAck(t *testing.T) {
	publisher := &recordingPublisher{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	handler := NewHandler(publisher, NewDiscardLogger())
	payload := mustProtoJSON(t, traceRequest())
	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	done := make(chan struct{})

	go func() {
		handler.ServeHTTP(response, request)
		close(done)
	}()

	select {
	case <-publisher.entered:
	case <-time.After(time.Second):
		t.Fatal("handler did not enter publish")
	}
	select {
	case <-done:
		t.Fatal("handler returned before publish ack")
	case <-time.After(25 * time.Millisecond):
	}
	close(publisher.release)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("handler did not return after publish ack")
	}
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s, want 200", response.Code, response.Body.String())
	}
}

func TestPublishUsesConfiguredAckTimeout(t *testing.T) {
	publisher := &recordingPublisher{
		entered: make(chan struct{}),
		release: make(chan struct{}),
	}
	handler := NewHandlerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{
		PublishTimeout: 10 * time.Millisecond,
	})
	payload := mustProtoJSON(t, traceRequest())
	request := httptest.NewRequest(http.MethodPost, "/v1/traces", bytes.NewReader(payload))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d body = %s, want 503", response.Code, response.Body.String())
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want no acked publish", publisher.callCount())
	}
}

type publishCall struct {
	subject string
	data    []byte
}

type recordingPublisher struct {
	calls   []publishCall
	err     error
	entered chan struct{}
	release chan struct{}
}

func (p *recordingPublisher) Publish(ctx context.Context, subject string, data []byte) error {
	if p.entered != nil {
		close(p.entered)
	}
	if p.release != nil {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-p.release:
		}
	}
	p.calls = append(p.calls, publishCall{subject: subject, data: append([]byte(nil), data...)})
	return p.err
}

func (p *recordingPublisher) callCount() int {
	return len(p.calls)
}

func traceRequest() *collectortracepb.ExportTraceServiceRequest {
	traceID := []byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
	rootSpanID := []byte{17, 18, 19, 20, 21, 22, 23, 24}
	childSpanID := []byte{33, 34, 35, 36, 37, 38, 39, 40}
	return &collectortracepb.ExportTraceServiceRequest{
		ResourceSpans: []*tracepb.ResourceSpans{{
			Resource: &resourcepb.Resource{Attributes: []*commonpb.KeyValue{
				stringAttr("service.name", "checkout-api"),
				stringAttr("cloud.region", "local"),
			}},
			ScopeSpans: []*tracepb.ScopeSpans{{
				Scope: &commonpb.InstrumentationScope{
					Name: "checkout",
					Attributes: []*commonpb.KeyValue{
						stringAttr("scope.key", "scope-value"),
					},
				},
				Spans: []*tracepb.Span{
					{
						TraceId:           traceID,
						SpanId:            rootSpanID,
						Name:              "POST /orders",
						Kind:              tracepb.Span_SPAN_KIND_SERVER,
						StartTimeUnixNano: 1_700_000_000_000_000_000,
						EndTimeUnixNano:   1_700_000_000_010_000_000,
						Attributes:        []*commonpb.KeyValue{stringAttr("http.method", "POST")},
						Status:            &tracepb.Status{Code: tracepb.Status_STATUS_CODE_ERROR},
						Events:            []*tracepb.Span_Event{{Name: "agent.step", TimeUnixNano: 1_700_000_000_005_000_000, Attributes: []*commonpb.KeyValue{stringAttr("gen_ai.operation.name", "chat")}}},
						Links: []*tracepb.Span_Link{{
							TraceId:    []byte{240, 224, 208, 192, 176, 160, 144, 128, 112, 96, 80, 64, 48, 32, 16, 0},
							SpanId:     []byte{128, 112, 96, 80, 64, 48, 32, 16},
							TraceState: "vendor=value",
							Attributes: []*commonpb.KeyValue{stringAttr("link.kind", "follows_from")},
						}},
					},
					{
						TraceId:           traceID,
						SpanId:            childSpanID,
						ParentSpanId:      rootSpanID,
						Name:              "call model",
						Kind:              tracepb.Span_SPAN_KIND_CLIENT,
						StartTimeUnixNano: 1_700_000_000_012_000_000,
						EndTimeUnixNano:   1_700_000_000_025_000_000,
						Status:            &tracepb.Status{Code: tracepb.Status_STATUS_CODE_OK},
					},
				},
			}},
		}},
	}
}

func aiTraceRequest() *collectortracepb.ExportTraceServiceRequest {
	traceID := []byte{49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64}
	spanID := []byte{65, 66, 67, 68, 69, 70, 71, 72}
	return &collectortracepb.ExportTraceServiceRequest{
		ResourceSpans: []*tracepb.ResourceSpans{{
			Resource: &resourcepb.Resource{Attributes: []*commonpb.KeyValue{
				stringAttr("service.name", "ai-api"),
			}},
			ScopeSpans: []*tracepb.ScopeSpans{{
				Spans: []*tracepb.Span{{
					TraceId:           traceID,
					SpanId:            spanID,
					Name:              "chat completion",
					Kind:              tracepb.Span_SPAN_KIND_CLIENT,
					StartTimeUnixNano: 1_800_000_000_000_000_000,
					EndTimeUnixNano:   1_800_000_000_100_000_000,
					Attributes: []*commonpb.KeyValue{
						stringAttr("gen_ai.operation.name", "chat"),
						stringAttr("openinference.span.kind", "LLM"),
						stringAttr("gen_ai.system", "openai"),
						stringAttr("llm.provider", "anthropic"),
						stringAttr("gen_ai.prompt", "secret prompt body"),
						stringAttr("gen_ai.completion", "secret answer body"),
					},
					Status: &tracepb.Status{Code: tracepb.Status_STATUS_CODE_OK},
				}},
			}},
		}},
	}
}

func logsRequest() *collectorlogspb.ExportLogsServiceRequest {
	return logsRequestWithRecords(1)
}

func logsRequestWithRecords(count int) *collectorlogspb.ExportLogsServiceRequest {
	records := make([]*logspb.LogRecord, 0, count)
	for i := 0; i < count; i++ {
		records = append(records, &logspb.LogRecord{
			TimeUnixNano:         1_700_000_001_000_000_000 + uint64(i),
			ObservedTimeUnixNano: 1_700_000_001_100_000_000 + uint64(i),
			TraceId:              []byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16},
			SpanId:               []byte{17, 18, 19, 20, 21, 22, 23, 24},
			SeverityText:         "INFO",
			SeverityNumber:       logspb.SeverityNumber_SEVERITY_NUMBER_INFO,
			Body:                 stringValue("order created"),
			Attributes:           []*commonpb.KeyValue{stringAttr("log.key", "log-value")},
		})
	}
	return &collectorlogspb.ExportLogsServiceRequest{
		ResourceLogs: []*logspb.ResourceLogs{{
			Resource: &resourcepb.Resource{Attributes: []*commonpb.KeyValue{
				stringAttr("service.name", "checkout-api"),
			}},
			ScopeLogs: []*logspb.ScopeLogs{{
				Scope: &commonpb.InstrumentationScope{
					Attributes: []*commonpb.KeyValue{stringAttr("scope.key", "scope-value")},
				},
				LogRecords: records,
			}},
		}},
	}
}

func metricsRequest() *collectormetricspb.ExportMetricsServiceRequest {
	traceID := []byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
	spanID := []byte{17, 18, 19, 20, 21, 22, 23, 24}
	return &collectormetricspb.ExportMetricsServiceRequest{
		ResourceMetrics: []*metricspb.ResourceMetrics{{
			Resource: &resourcepb.Resource{Attributes: []*commonpb.KeyValue{
				stringAttr("service.name", "checkout-api"),
			}},
			ScopeMetrics: []*metricspb.ScopeMetrics{{
				Scope: &commonpb.InstrumentationScope{
					Name:       "checkout-meter",
					Attributes: []*commonpb.KeyValue{stringAttr("scope.key", "scope-value")},
				},
				Metrics: []*metricspb.Metric{
					{
						Name:        "orders.created",
						Description: "created orders",
						Unit:        "1",
						Data: &metricspb.Metric_Sum{Sum: &metricspb.Sum{
							AggregationTemporality: metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE,
							IsMonotonic:            true,
							DataPoints: []*metricspb.NumberDataPoint{{
								TimeUnixNano:      1_700_000_000_000_000_000,
								StartTimeUnixNano: 1_699_999_990_000_000_000,
								Attributes:        []*commonpb.KeyValue{stringAttr("route", "/orders")},
								Value:             &metricspb.NumberDataPoint_AsInt{AsInt: 7},
							}},
						}},
					},
					{
						Name: "request.duration",
						Unit: "s",
						Data: &metricspb.Metric_Histogram{Histogram: &metricspb.Histogram{
							AggregationTemporality: metricspb.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
							DataPoints: []*metricspb.HistogramDataPoint{{
								TimeUnixNano:      1_700_000_001_000_000_000,
								StartTimeUnixNano: 1_700_000_000_000_000_000,
								Count:             2,
								Sum:               ptrFloat64(0.75),
								Min:               ptrFloat64(0.25),
								Max:               ptrFloat64(0.5),
								BucketCounts:      []uint64{1, 1},
								ExplicitBounds:    []float64{0.3},
								Exemplars: []*metricspb.Exemplar{{
									TimeUnixNano: 1_700_000_001_000_000_000,
									Value:        &metricspb.Exemplar_AsDouble{AsDouble: 0.5},
									TraceId:      traceID,
									SpanId:       spanID,
								}},
							}},
						}},
					},
				},
			}},
		}},
	}
}

func ptrFloat64(value float64) *float64 {
	return &value
}

func mustProtoJSON(t *testing.T, message proto.Message) []byte {
	t.Helper()
	payload, err := protojson.Marshal(message)
	if err != nil {
		t.Fatalf("marshal proto JSON: %v", err)
	}
	return payload
}

func stringAttr(key string, value string) *commonpb.KeyValue {
	return &commonpb.KeyValue{Key: key, Value: stringValue(value)}
}

func stringValue(value string) *commonpb.AnyValue {
	return &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: value}}
}

func deref[T comparable](value *T) T {
	var zero T
	if value == nil {
		return zero
	}
	return *value
}

func lastJSONLog(t *testing.T, data []byte) map[string]any {
	t.Helper()
	lines := bytes.Split(bytes.TrimSpace(data), []byte("\n"))
	if len(lines) == 0 {
		t.Fatal("no log lines")
	}
	var entry map[string]any
	if err := json.Unmarshal(lines[len(lines)-1], &entry); err != nil {
		t.Fatalf("log entry is not JSON: %v\n%s", err, string(lines[len(lines)-1]))
	}
	return entry
}
