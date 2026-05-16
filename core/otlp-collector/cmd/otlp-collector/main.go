package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
	"github.com/cloudgrid-dev/cloudgrid/core/otlp-collector/internal/collector"
	"google.golang.org/grpc"
)

const startupTimeout = 5 * time.Second

func main() {
	os.Exit(run())
}

func run() int {
	logger := collector.NewLogger(os.Stdout)
	natsURL := envOrDefault("CLOUDGRID_NATS_URL", "nats://localhost:4222")
	httpAddr := otlpHTTPAddr(os.Getenv)
	grpcAddr := envOrDefault("CLOUDGRID_OTLP_GRPC_ADDR", "0.0.0.0:4317")
	handlerOptions, err := buildHandlerOptionsFromEnv(context.Background(), os.Getenv, http.DefaultClient)
	if err != nil {
		logStartupError(logger, "auth_config_invalid", "ERR-009", "CONFIG_INVALID", err.Error())
		return 1
	}
	grpcOptions, err := buildGRPCOptionsFromEnv(os.Getenv, handlerOptions.MaxRequestBytes)
	if err != nil {
		logStartupError(logger, "grpc_config_invalid", "ERR-009", "CONFIG_INVALID", err.Error())
		return 1
	}

	bridge, err := collector.ConnectNATSMessageBridge(natsURL, startupTimeout)
	if err != nil {
		logStartupError(logger, "message_bridge_unavailable", "ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "cannot connect to NATS; start Docker infra or set CLOUDGRID_NATS_URL")
		return 1
	}
	defer bridge.Close()

	probes := health.NewState("otlp-collector", func(_ context.Context) map[string]health.Check {
		if bridge.IsClosed() {
			return map[string]health.Check{
				"nats":          health.Unavailable("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "message bridge is unavailable"),
				"http_listener": health.OK(),
				"grpc_listener": health.OK(),
			}
		}
		return map[string]health.Check{
			"nats":          health.OK(),
			"http_listener": health.OK(),
			"grpc_listener": health.OK(),
		}
	})
	mux := http.NewServeMux()
	mux.Handle("/livez", probes.Handler())
	mux.Handle("/readyz", probes.Handler())
	mux.Handle("/", collector.NewHandlerWithOptions(bridge.Publisher(), logger, handlerOptions))
	server := &http.Server{
		Addr:              httpAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	httpListener, err := net.Listen("tcp", httpAddr)
	if err != nil {
		logStartupError(logger, "http_server_bind_failed", "ERR-010", "RUNTIME_COMPOSITION_FAILED", "cannot bind OTLP HTTP listener; the port may already be in use", "addr", httpAddr)
		return 1
	}
	grpcListener, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		_ = httpListener.Close()
		logStartupError(logger, "grpc_server_bind_failed", "ERR-010", "RUNTIME_COMPOSITION_FAILED", "cannot bind OTLP gRPC listener; the port may already be in use", "addr", grpcAddr)
		return 1
	}
	grpcServer := collector.NewGRPCServerWithOptions(bridge.Publisher(), logger, handlerOptions, grpcOptions)
	probes.SetReady(true)
	logger.Info("otlp collector ready",
		"service", "otlp-collector",
		"event", "startup_ready",
		"request_id", "",
		"http_addr", httpAddr,
		"grpc_addr", grpcAddr,
	)
	serverErrors := make(chan serverError, 2)
	go func() {
		serverErrors <- serverError{kind: "http", err: server.Serve(httpListener)}
	}()
	go func() {
		serverErrors <- serverError{kind: "grpc", err: grpcServer.Serve(grpcListener)}
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)

	select {
	case serverErr := <-serverErrors:
		if !expectedServerStop(serverErr.err) {
			probes.SetReady(false)
			logStartupError(logger, serverErr.kind+"_server_failed", "ERR-010", "RUNTIME_COMPOSITION_FAILED", "OTLP "+serverErr.kind+" server stopped unexpectedly")
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer shutdownCancel()
			_ = server.Shutdown(shutdownCtx)
			grpcServer.Stop()
			return 1
		}
		return 0
	case signal := <-signals:
		probes.SetReady(false)
		logger.Info("collector shutdown started",
			"service", "otlp-collector",
			"event", "shutdown_started",
			"request_id", "",
			"signal", signal.String(),
		)
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logStartupError(logger, "http_server_shutdown_failed", "ERR-010", "RUNTIME_COMPOSITION_FAILED", "OTLP HTTP server did not shut down cleanly")
			return 1
		}
		gracefulStopGRPC(shutdownCtx, grpcServer)
		_ = bridge.Drain()
		logger.Info("collector shutdown completed",
			"service", "otlp-collector",
			"event", "shutdown_completed",
			"request_id", "",
			"signal", signal.String(),
		)
	}
	return 0
}

type serverError struct {
	kind string
	err  error
}

func expectedServerStop(err error) bool {
	return err == nil || errors.Is(err, http.ErrServerClosed) || errors.Is(err, grpc.ErrServerStopped)
}

func gracefulStopGRPC(ctx context.Context, server *grpc.Server) {
	done := make(chan struct{})
	go func() {
		server.GracefulStop()
		close(done)
	}()
	select {
	case <-done:
	case <-ctx.Done():
		server.Stop()
	}
}

func otlpHTTPAddr(getenv func(string) string) string {
	if addr := strings.TrimSpace(getenv("CLOUDGRID_OTLP_HTTP_ADDR")); addr != "" {
		return addr
	}
	return net.JoinHostPort(envOr(getenv, "CLOUDGRID_OTLP_HOST", "0.0.0.0"), envOr(getenv, "CLOUDGRID_OTLP_PORT", "4318"))
}

func envOrDefault(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}

func buildHandlerOptionsFromEnv(ctx context.Context, getenv func(string) string, client *http.Client) (collector.HandlerOptions, error) {
	deploymentMode := envOr(getenv, "CLOUDGRID_DEPLOYMENT_MODE", collector.DeploymentModeLocal)
	authMode := envOr(getenv, "CLOUDGRID_AUTH_MODE", collector.AuthModeLocal)
	if deploymentMode == collector.DeploymentModeLocal && authMode != collector.AuthModeLocal {
		return collector.HandlerOptions{}, fmt.Errorf("CLOUDGRID_DEPLOYMENT_MODE=local requires CLOUDGRID_AUTH_MODE=local")
	}
	if deploymentMode == collector.DeploymentModeDeployed && authMode != collector.AuthModeSSO {
		return collector.HandlerOptions{}, fmt.Errorf("CLOUDGRID_DEPLOYMENT_MODE=deployed requires CLOUDGRID_AUTH_MODE=sso")
	}

	options := collector.HandlerOptions{
		DeploymentMode: deploymentMode,
		AuthMode:       authMode,
	}
	maxRequestBytes, err := int64Env(getenv, "CLOUDGRID_OTLP_MAX_REQUEST_BYTES", 4*1024*1024, 65536, 104857600)
	if err != nil {
		return collector.HandlerOptions{}, err
	}
	options.MaxRequestBytes = maxRequestBytes
	if deploymentMode == collector.DeploymentModeLocal && authMode == collector.AuthModeLocal {
		options.LocalProjectID = getenv("CLOUDGRID_OTLP_LOCAL_PROJECT_ID")
		tokens, err := localProjectTokensFromEnv(getenv("CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS"))
		if err != nil {
			return collector.HandlerOptions{}, err
		}
		options.LocalProjectTokens = tokens
		return options, nil
	}

	issuer := getenv("CLOUDGRID_AUTH_ISSUER")
	if issuer == "" {
		return collector.HandlerOptions{}, fmt.Errorf("CLOUDGRID_AUTH_ISSUER is required when CLOUDGRID_AUTH_MODE=sso")
	}
	audience := getenv("CLOUDGRID_AUTH_AUDIENCE")
	if audience == "" {
		return collector.HandlerOptions{}, fmt.Errorf("CLOUDGRID_AUTH_AUDIENCE is required when CLOUDGRID_AUTH_MODE=sso")
	}
	jwksURL := getenv("CLOUDGRID_AUTH_JWKS_URL")
	if jwksURL == "" {
		return collector.HandlerOptions{}, fmt.Errorf("CLOUDGRID_AUTH_JWKS_URL is required when CLOUDGRID_AUTH_MODE=sso")
	}
	validator, err := collector.NewHTTPJWKSBearerTokenValidator(ctx, collector.HTTPJWKSValidatorConfig{
		Issuer:   issuer,
		Audience: audience,
		JWKSURL:  jwksURL,
		Client:   client,
	})
	if err != nil {
		return collector.HandlerOptions{}, err
	}
	options.TokenValidator = validator
	options.ProjectCache = collector.NewProjectStatusCache(collector.ProjectStatusCacheOptions{})
	return options, nil
}

func int64Env(getenv func(string) string, name string, fallback int64, min int64, max int64) (int64, error) {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < min || value > max {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", name, min, max)
	}
	return value, nil
}

func buildGRPCOptionsFromEnv(getenv func(string) string, httpBodyLimit int64) (collector.GRPCOptions, error) {
	maxMessageBytes, err := int64Env(getenv, "CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES", httpBodyLimit, 65536, 104857600)
	if err != nil {
		return collector.GRPCOptions{}, err
	}
	compression := strings.TrimSpace(getenv("CLOUDGRID_OTLP_GRPC_COMPRESSION"))
	if compression == "" {
		compression = "gzip"
	}
	if compression != "gzip" && compression != "none" {
		return collector.GRPCOptions{}, fmt.Errorf("CLOUDGRID_OTLP_GRPC_COMPRESSION must be one of: none, gzip")
	}
	return collector.GRPCOptions{
		MaxMessageBytes: int(maxMessageBytes),
		Compression:     compression,
	}, nil
}

func localProjectTokensFromEnv(value string) (map[string]string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	var tokens map[string]string
	if err := json.Unmarshal([]byte(value), &tokens); err != nil {
		return nil, fmt.Errorf("CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS must be a JSON object")
	}
	result := make(map[string]string, len(tokens))
	for token, projectID := range tokens {
		token = strings.TrimSpace(token)
		projectID = strings.TrimSpace(projectID)
		if len(token) < 32 {
			return nil, fmt.Errorf("CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS keys must be at least 32 characters")
		}
		if projectID == "" {
			return nil, fmt.Errorf("CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS project ids must be non-empty")
		}
		result[token] = projectID
	}
	return result, nil
}

func envOr(getenv func(string) string, name string, fallback string) string {
	value := getenv(name)
	if value == "" {
		return fallback
	}
	return value
}

func logStartupError(logger *slog.Logger, event string, errorID string, errorCode string, detail string, fields ...any) {
	attrs := []any{
		"service", "otlp-collector",
		"event", event,
		"request_id", "",
		"error_id", errorID,
		"error_code", errorCode,
		"detail", detail,
	}
	attrs = append(attrs, fields...)
	logger.Error("collector startup failed: "+detail, attrs...)
}
