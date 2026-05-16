package collector

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"strings"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/otlp-collector/internal/ai"
	collectorlogspb "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetricspb "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	_ "google.golang.org/grpc/encoding/gzip"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/tap"
	"google.golang.org/protobuf/proto"
)

const (
	grpcTraceExportMethod   = "/opentelemetry.proto.collector.trace.v1.TraceService/Export"
	grpcLogsExportMethod    = "/opentelemetry.proto.collector.logs.v1.LogsService/Export"
	grpcMetricsExportMethod = "/opentelemetry.proto.collector.metrics.v1.MetricsService/Export"
)

type grpcAuthContextKey struct{}

type GRPCOptions struct {
	MaxMessageBytes int
	Compression     string
}

type grpcTraceServer struct {
	collectortracepb.UnimplementedTraceServiceServer
	handler *handler
	limit   int
}

type grpcLogsServer struct {
	collectorlogspb.UnimplementedLogsServiceServer
	handler *handler
	limit   int
}

type grpcMetricsServer struct {
	collectormetricspb.UnimplementedMetricsServiceServer
	handler *handler
	limit   int
}

func NewGRPCServer(publisher Publisher, logger *slog.Logger) *grpc.Server {
	return NewGRPCServerWithOptions(publisher, logger, HandlerOptions{}, GRPCOptions{})
}

func NewGRPCServerWithOptions(publisher Publisher, logger *slog.Logger, handlerOptions HandlerOptions, grpcOptions GRPCOptions) *grpc.Server {
	if logger == nil {
		logger = NewLogger(os.Stdout)
	}
	collectorHandler := NewHandlerWithOptions(publisher, logger, handlerOptions).(*handler)
	maxMessageBytes := grpcOptions.MaxMessageBytes
	if maxMessageBytes <= 0 {
		maxMessageBytes = int(collectorHandler.maxRequestBytes)
	}
	receiveLimit := 100*1024*1024 + 1024
	if maxMessageBytes > receiveLimit {
		receiveLimit = maxMessageBytes
	}
	server := grpc.NewServer(
		grpc.MaxRecvMsgSize(receiveLimit),
		grpc.InTapHandle(collectorHandler.grpcAuthTap),
	)
	collectortracepb.RegisterTraceServiceServer(server, &grpcTraceServer{handler: collectorHandler, limit: maxMessageBytes})
	collectorlogspb.RegisterLogsServiceServer(server, &grpcLogsServer{handler: collectorHandler, limit: maxMessageBytes})
	collectormetricspb.RegisterMetricsServiceServer(server, &grpcMetricsServer{handler: collectorHandler, limit: maxMessageBytes})
	return server
}

func (h *handler) grpcAuthTap(ctx context.Context, info *tap.Info) (context.Context, error) {
	requiredScope, ok := grpcRequiredScope(info.FullMethodName)
	if !ok {
		return ctx, nil
	}
	authContext, problem := h.authorizeIngestContext(ctx, grpcAuthorization(ctx), requiredScope)
	if problem != nil {
		return ctx, grpcProblem(*problem)
	}
	return context.WithValue(ctx, grpcAuthContextKey{}, authContext), nil
}

func grpcRequiredScope(method string) (string, bool) {
	switch method {
	case grpcTraceExportMethod:
		return scopeIngestTraces, true
	case grpcLogsExportMethod:
		return scopeIngestLogs, true
	case grpcMetricsExportMethod:
		return scopeIngestMetrics, true
	default:
		return "", false
	}
}

func grpcAuthorization(ctx context.Context) string {
	values := metadata.ValueFromIncomingContext(ctx, "authorization")
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func grpcRequestID(ctx context.Context) string {
	values := metadata.ValueFromIncomingContext(ctx, "x-request-id")
	if len(values) == 0 {
		return ""
	}
	return strings.TrimSpace(values[0])
}

func grpcAuthContext(ctx context.Context) *contracts.AuthContext {
	authContext, _ := ctx.Value(grpcAuthContextKey{}).(*contracts.AuthContext)
	return authContext
}

func (server *grpcTraceServer) Export(ctx context.Context, request *collectortracepb.ExportTraceServiceRequest) (*collectortracepb.ExportTraceServiceResponse, error) {
	if err := server.validateSize(request); err != nil {
		return nil, err
	}
	command, err := server.handler.traceCommandForRequestID(grpcRequestID(ctx), request, grpcAuthContext(ctx))
	if err != nil {
		return nil, grpcProblem(validationProblem(err.Error()))
	}
	if err := server.handler.publish(ctx, SubjectTraceIngest, command); err != nil {
		return nil, grpcPublishProblem(err)
	}
	for _, projection := range ai.ExtractProjections(command.Spans, command.BridgeEnvelope, nil) {
		if err := server.handler.publishJSON(ctx, SubjectAIProjectionIngest, projection); err != nil {
			return nil, grpcPublishProblem(err)
		}
	}
	return &collectortracepb.ExportTraceServiceResponse{}, nil
}

func (server *grpcLogsServer) Export(ctx context.Context, request *collectorlogspb.ExportLogsServiceRequest) (*collectorlogspb.ExportLogsServiceResponse, error) {
	if err := server.validateSize(request); err != nil {
		return nil, err
	}
	command, err := server.handler.logCommandForRequestID(grpcRequestID(ctx), request, grpcAuthContext(ctx))
	if err != nil {
		return nil, grpcProblem(validationProblem(err.Error()))
	}
	if err := server.handler.publish(ctx, SubjectLogIngest, command); err != nil {
		return nil, grpcPublishProblem(err)
	}
	return &collectorlogspb.ExportLogsServiceResponse{}, nil
}

func (server *grpcMetricsServer) Export(ctx context.Context, request *collectormetricspb.ExportMetricsServiceRequest) (*collectormetricspb.ExportMetricsServiceResponse, error) {
	if err := server.validateSize(request); err != nil {
		return nil, err
	}
	command, err := server.handler.metricCommandForRequestID(grpcRequestID(ctx), request, grpcAuthContext(ctx))
	if err != nil {
		return nil, grpcProblem(validationProblem(err.Error()))
	}
	if err := server.handler.publishJSON(ctx, SubjectMetricIngest, command); err != nil {
		return nil, grpcPublishProblem(err)
	}
	return &collectormetricspb.ExportMetricsServiceResponse{}, nil
}

func (server *grpcTraceServer) validateSize(message proto.Message) error {
	return validateGRPCMessageSize(message, server.limit)
}

func (server *grpcLogsServer) validateSize(message proto.Message) error {
	return validateGRPCMessageSize(message, server.limit)
}

func (server *grpcMetricsServer) validateSize(message proto.Message) error {
	return validateGRPCMessageSize(message, server.limit)
}

func validateGRPCMessageSize(message proto.Message, limit int) error {
	if limit > 0 && proto.Size(message) > limit {
		return status.Error(codes.ResourceExhausted, "ERR-001 VALIDATION_FAILED: request body exceeds configured limit")
	}
	return nil
}

func grpcProblem(problem problemDetails) error {
	return status.Error(grpcCode(problem), problem.ID+" "+problem.Code+": "+problem.Detail)
}

func grpcPublishProblem(err error) error {
	if errors.Is(err, context.DeadlineExceeded) {
		return status.Error(codes.DeadlineExceeded, "ERR-014 MESSAGE_BRIDGE_TIMEOUT: Message bridge publish timed out")
	}
	if errors.Is(err, context.Canceled) {
		return status.Error(codes.Unavailable, "ERR-014 MESSAGE_BRIDGE_UNAVAILABLE: Message bridge publish was canceled")
	}
	return grpcProblem(messageBridgeProblem())
}

func grpcCode(problem problemDetails) codes.Code {
	switch problem.ID {
	case "ERR-015":
		return codes.Unauthenticated
	case "ERR-016":
		return codes.PermissionDenied
	case "ERR-001", "ERR-008":
		if problem.Status == 413 {
			return codes.ResourceExhausted
		}
		return codes.InvalidArgument
	case "ERR-013":
		return codes.Unavailable
	default:
		return codes.Internal
	}
}
