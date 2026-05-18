package collector

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"strings"
	"testing"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	collectorlogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

func TestGRPCTraceExportPublishesNormalizedTelemetry(t *testing.T) {
	publisher, conn := newGRPCTestServer(t, HandlerOptions{})
	client := collectortracepb.NewTraceServiceClient(conn)
	ctx := metadata.AppendToOutgoingContext(context.Background(), "x-request-id", "req-grpc-trace")

	if _, err := client.Export(ctx, traceRequest()); err != nil {
		t.Fatalf("TraceService.Export returned error: %v", err)
	}

	if publisher.callCount() != 1 {
		t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
	}
	call := publisher.calls[0]
	if call.subject != SubjectTraceIngest {
		t.Fatalf("subject = %q, want %s", call.subject, SubjectTraceIngest)
	}
	var command contracts.PersistTelemetryCommand
	if err := json.Unmarshal(call.data, &command); err != nil {
		t.Fatalf("unmarshal command: %v", err)
	}
	if command.RequestID != "req-grpc-trace" || command.Source != sourceTraces || len(command.Traces) != 1 || len(command.Spans) != 2 {
		t.Fatalf("command = %#v", command)
	}
}

func TestGRPCTraceExportRecordsSelfObservabilitySpan(t *testing.T) {
	recorder := NewInMemorySelfObservabilityRecorder()
	_, conn := newGRPCTestServer(t, HandlerOptions{SelfObservability: recorder})
	client := collectortracepb.NewTraceServiceClient(conn)
	ctx := metadata.AppendToOutgoingContext(context.Background(), "x-request-id", "req-grpc-selfobs")

	if _, err := client.Export(ctx, traceRequest()); err != nil {
		t.Fatalf("TraceService.Export returned error: %v", err)
	}

	if !recorder.HasSpan("otlp.grpc traces") {
		t.Fatalf("spans = %#v, want gRPC trace self-observability span", recorder.Spans())
	}
}

func TestGRPCLogsAndMetricsExportPublishSupportedSignals(t *testing.T) {
	tests := []struct {
		name        string
		export      func(context.Context, *grpc.ClientConn) error
		wantSubject string
		wantSource  string
	}{
		{
			name: "logs",
			export: func(ctx context.Context, conn *grpc.ClientConn) error {
				_, err := collectorlogspb.NewLogsServiceClient(conn).Export(ctx, logsRequest())
				return err
			},
			wantSubject: SubjectLogIngest,
			wantSource:  sourceLogs,
		},
		{
			name: "metrics",
			export: func(ctx context.Context, conn *grpc.ClientConn) error {
				_, err := collectormetricspb.NewMetricsServiceClient(conn).Export(ctx, metricsRequest())
				return err
			},
			wantSubject: SubjectMetricIngest,
			wantSource:  sourceMetrics,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			publisher, conn := newGRPCTestServer(t, HandlerOptions{})
			ctx := metadata.AppendToOutgoingContext(context.Background(), "x-request-id", "req-grpc-"+tt.name)

			if err := tt.export(ctx, conn); err != nil {
				t.Fatalf("Export returned error: %v", err)
			}

			if publisher.callCount() != 1 {
				t.Fatalf("publisher calls = %d, want 1", publisher.callCount())
			}
			call := publisher.calls[0]
			if call.subject != tt.wantSubject {
				t.Fatalf("subject = %q, want %s", call.subject, tt.wantSubject)
			}
			if !strings.Contains(string(call.data), `"source":"`+tt.wantSource+`"`) {
				t.Fatalf("published command did not include source %q: %s", tt.wantSource, string(call.data))
			}
		})
	}
}

func TestGRPCAuthFailureMapsToStatusAndDoesNotPublish(t *testing.T) {
	publisher, conn := newGRPCTestServer(t, HandlerOptions{
		DeploymentMode: DeploymentModeLocal,
		AuthMode:       AuthModeLocal,
		LocalProjectTokens: map[string]string{
			"local-token-for-project-alpha-123456": "project-alpha",
		},
	})
	client := collectortracepb.NewTraceServiceClient(conn)

	_, err := client.Export(context.Background(), traceRequest())

	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("status code = %s, want %s (err=%v)", status.Code(err), codes.Unauthenticated, err)
	}
	if !strings.Contains(status.Convert(err).Message(), "ERR-015") {
		t.Fatalf("status message = %q, want ERR-015", status.Convert(err).Message())
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestGRPCValidationFailureMapsToInvalidArgument(t *testing.T) {
	publisher, conn := newGRPCTestServer(t, HandlerOptions{})
	client := collectortracepb.NewTraceServiceClient(conn)
	request := traceRequest()
	request.ResourceSpans[0].ScopeSpans[0].Spans[0].TraceId = nil

	_, err := client.Export(context.Background(), request)

	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("status code = %s, want %s (err=%v)", status.Code(err), codes.InvalidArgument, err)
	}
	if !strings.Contains(status.Convert(err).Message(), "ERR-001") {
		t.Fatalf("status message = %q, want ERR-001", status.Convert(err).Message())
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestGRPCPayloadTooLargeMapsToResourceExhausted(t *testing.T) {
	publisher := &recordingPublisher{}
	listener := bufconn.Listen(1024 * 1024)
	server := NewGRPCServerWithOptions(publisher, NewDiscardLogger(), HandlerOptions{}, GRPCOptions{MaxMessageBytes: 64})
	t.Cleanup(server.Stop)
	go func() {
		_ = server.Serve(listener)
	}()
	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("grpc dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	client := collectortracepb.NewTraceServiceClient(conn)

	_, err = client.Export(context.Background(), traceRequest())

	if status.Code(err) != codes.ResourceExhausted {
		t.Fatalf("status code = %s, want %s (err=%v)", status.Code(err), codes.ResourceExhausted, err)
	}
	if !strings.Contains(status.Convert(err).Message(), "ERR-001") {
		t.Fatalf("status message = %q, want ERR-001", status.Convert(err).Message())
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
}

func TestGRPCPublishFailureRecordsMetricsAndSelfObservabilityError(t *testing.T) {
	publisher := &recordingPublisher{err: errors.New("nats unavailable")}
	metrics := NewInMemoryMetricsRecorder()
	recorder := NewInMemorySelfObservabilityRecorder()
	_, conn := newGRPCTestServerWithPublisher(t, publisher, HandlerOptions{
		MetricsRecorder:   metrics,
		SelfObservability: recorder,
	})
	client := collectorlogspb.NewLogsServiceClient(conn)
	ctx := metadata.AppendToOutgoingContext(context.Background(), "x-request-id", "req-grpc-publish-error")

	_, err := client.Export(ctx, logsRequest())

	if status.Code(err) != codes.Unavailable {
		t.Fatalf("status code = %s, want %s (err=%v)", status.Code(err), codes.Unavailable, err)
	}
	if !strings.Contains(status.Convert(err).Message(), "ERR-013") {
		t.Fatalf("status message = %q, want ERR-013", status.Convert(err).Message())
	}
	assertMetricRecord(t, metrics.Records(), "cloudgrid.ingest.requests", map[string]string{
		"signal":    "logs",
		"transport": "grpc",
		"result":    "rejected",
	})
	assertMetricRecord(t, metrics.Records(), "cloudgrid.ingest.publish.duration", map[string]string{
		"signal": "logs",
		"result": "error",
	})
	assertNoMetricRecord(t, metrics.Records(), "cloudgrid.ingest.commands.published")
	if !recorder.HasSpan("otlp.grpc logs") || !recorder.HasLog("grpc_request_failed") {
		t.Fatalf("self-observability spans=%#v logs=%#v, want gRPC error span/log", recorder.Spans(), recorder.Logs())
	}
}

func TestGRPCValidationFailureRecordsRejectedMetricsAndNoPublish(t *testing.T) {
	metrics := NewInMemoryMetricsRecorder()
	recorder := NewInMemorySelfObservabilityRecorder()
	publisher, conn := newGRPCTestServer(t, HandlerOptions{
		MetricsRecorder:   metrics,
		SelfObservability: recorder,
	})
	client := collectormetricspb.NewMetricsServiceClient(conn)
	request := metricsRequest()
	request.ResourceMetrics[0].ScopeMetrics[0].Metrics[0].Name = ""

	_, err := client.Export(context.Background(), request)

	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("status code = %s, want %s (err=%v)", status.Code(err), codes.InvalidArgument, err)
	}
	if publisher.callCount() != 0 {
		t.Fatalf("publisher calls = %d, want 0", publisher.callCount())
	}
	assertMetricRecord(t, metrics.Records(), "cloudgrid.ingest.requests", map[string]string{
		"signal":    "metrics",
		"transport": "grpc",
		"result":    "rejected",
	})
	if !recorder.HasLog("grpc_request_failed") {
		t.Fatalf("logs = %#v, want grpc_request_failed log", recorder.Logs())
	}
}

func newGRPCTestServer(t *testing.T, options HandlerOptions) (*recordingPublisher, *grpc.ClientConn) {
	t.Helper()
	publisher := &recordingPublisher{}
	return newGRPCTestServerWithPublisher(t, publisher, options)
}

func newGRPCTestServerWithPublisher(t *testing.T, publisher *recordingPublisher, options HandlerOptions) (*recordingPublisher, *grpc.ClientConn) {
	t.Helper()
	listener := bufconn.Listen(1024 * 1024)
	server := NewGRPCServerWithOptions(publisher, NewDiscardLogger(), options, GRPCOptions{})
	t.Cleanup(server.Stop)
	go func() {
		_ = server.Serve(listener)
	}()

	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return listener.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("grpc dial: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return publisher, conn
}
