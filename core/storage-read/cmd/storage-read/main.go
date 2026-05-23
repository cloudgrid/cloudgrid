package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
	storage "github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/ports"
	"github.com/nats-io/nats.go"
)

const (
	startupTimeout              = 5 * time.Second
	storageCloseTimeout         = time.Second
	exporterShutdownTimeout     = 2 * time.Second
	healthReadHeaderTimeout     = 5 * time.Second
	healthServerShutdownTimeout = 10 * time.Second
)

func main() {
	os.Exit(run())
}

func run() int {
	return runWithRuntime(storageReadRuntime{
		output: os.Stdout,
		loadConfig: func() (storage.Config, error) {
			return storage.LoadConfig(storage.OSEnv)
		},
		newAdapter: newTelemetryReadAdapter,
		connectNATS: func(url string) (storageReadNATSConnection, error) {
			nc, err := storage.ConnectNATS(url)
			if err != nil {
				return nil, err
			}
			return storageReadNATSAdapter{conn: nc}, nil
		},
		subscribeHandlers: func(conn storageReadNATSConnection, store ports.TelemetryReadStore, logger *slog.Logger, recorder storage.MetricsRecorder, traceLogRecorder storage.TraceLogRecorder, limits storage.RuntimeLimits) error {
			nc := conn.NATSConn()
			if nc == nil {
				return errors.New("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: invalid NATS connection")
			}
			_, err := storage.SubscribeTelemetryHandlersWithOptions(nc, store, logger, recorder, traceLogRecorder, limits)
			return err
		},
		listen:         net.Listen,
		shutdownSignal: shutdownSignal,
	})
}

type storageReadNATSConnection interface {
	CheckReady(context.Context) error
	NATSConn() *nats.Conn
	Close()
	Drain() error
}

type storageReadNATSAdapter struct {
	conn *nats.Conn
}

func (adapter storageReadNATSAdapter) CheckReady(ctx context.Context) error {
	return checkNATSReady(ctx, adapter.conn)
}

func (adapter storageReadNATSAdapter) NATSConn() *nats.Conn {
	return adapter.conn
}

func (adapter storageReadNATSAdapter) Close() {
	adapter.conn.Close()
}

func (adapter storageReadNATSAdapter) Drain() error {
	return adapter.conn.Drain()
}

type storageReadRuntime struct {
	output            io.Writer
	loadConfig        func() (storage.Config, error)
	newAdapter        func(context.Context, storage.Config) (telemetryReadAdapter, error)
	connectNATS       func(string) (storageReadNATSConnection, error)
	subscribeHandlers func(storageReadNATSConnection, ports.TelemetryReadStore, *slog.Logger, storage.MetricsRecorder, storage.TraceLogRecorder, storage.RuntimeLimits) error
	listen            func(string, string) (net.Listener, error)
	shutdownSignal    func() <-chan os.Signal
}

func runWithRuntime(runtime storageReadRuntime) int {
	logger := newLogger(runtime.output)
	ctx, cancel := context.WithTimeout(context.Background(), startupTimeout)
	defer cancel()

	cfg, err := runtime.loadConfig()
	if err != nil {
		logError(logger, "startup_config_invalid", err, "ERR-009")
		return 1
	}

	adapter, err := runtime.newAdapter(ctx, cfg)
	if err != nil {
		logError(logger, "startup_storage_unavailable", err, "ERR-006")
		return 1
	}
	defer func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), storageCloseTimeout)
		defer closeCancel()
		if err := adapter.Close(closeCtx); err != nil {
			logError(logger, "storage_close_failed", err, "ERR-006")
		}
	}()

	if err := adapter.CheckReadiness(ctx); err != nil {
		logError(logger, "schema_readiness_failed", err, "ERR-006")
		return 1
	}
	metricsExporter, err := storageReadSelfObservabilityMetricsExporter(cfg, logger)
	if err != nil {
		logError(logger, "self_observability_config_invalid", err, "ERR-009")
		return 1
	}
	if metricsExporter != nil {
		defer func() {
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), exporterShutdownTimeout)
			defer shutdownCancel()
			_ = metricsExporter.Shutdown(shutdownCtx)
		}()
	}
	traceLogExporter, err := storageReadSelfObservabilityTraceLogExporter(cfg, logger)
	if err != nil {
		logError(logger, "self_observability_config_invalid", err, "ERR-009")
		return 1
	}
	if traceLogExporter != nil {
		defer func() {
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), exporterShutdownTimeout)
			defer shutdownCancel()
			_ = traceLogExporter.Shutdown(shutdownCtx)
		}()
	}

	nc, err := runtime.connectNATS(cfg.NATSURL)
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "ERR-013")
		return 1
	}
	defer nc.Close()

	var recorder storage.MetricsRecorder
	if metricsExporter != nil {
		recorder = storage.NewOTLPMetricsRecorder(metricsExporter)
	}
	if err := runtime.subscribeHandlers(nc, adapter.Store, logger, recorder, traceLogExporter, cfg.Limits); err != nil {
		logError(logger, "message_bridge_subscribe_failed", err, "ERR-013")
		return 1
	}

	probes := health.NewState("storage-read", storageReadHealthChecks(nc.CheckReady, adapter))
	healthServer := storageReadHealthServer(cfg, probes.Handler())
	probes.SetReady(true)
	healthErrors := make(chan error, 1)
	healthListener, err := runtime.listen("tcp", healthServer.Addr)
	if err != nil {
		logError(logger, "health_server_bind_failed", err, "ERR-010", "health_addr", healthServer.Addr)
		return 1
	}
	go func() {
		healthErrors <- healthServer.Serve(healthListener)
	}()

	logger.Info("storage read service ready",
		"service", "storage-read",
		"event", "startup_ready",
		"request_id", "",
		"adapter", adapter.Name,
		"health_addr", healthServer.Addr,
	)
	select {
	case err := <-healthErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logError(logger, "health_server_failed", err, "ERR-010")
			return 1
		}
		return 0
	case signal := <-runtime.shutdownSignal():
		probes.SetReady(false)
		logger.Info("storage read shutdown started",
			"service", "storage-read",
			"event", "shutdown_started",
			"request_id", "",
			"signal", signal.String(),
		)
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), healthServerShutdownTimeout)
		defer shutdownCancel()
		if err := healthServer.Shutdown(shutdownCtx); err != nil {
			logError(logger, "health_server_shutdown_failed", err, "ERR-010")
			return 1
		}
		_ = nc.Drain()
		logger.Info("storage read shutdown completed",
			"service", "storage-read",
			"event", "shutdown_completed",
			"request_id", "",
			"signal", signal.String(),
		)
	}
	return 0
}

func storageReadHealthChecks(checkNATSReady func(context.Context) error, adapter telemetryReadAdapter) health.Checker {
	return func(ctx context.Context) map[string]health.Check {
		checks := map[string]health.Check{}
		if err := checkNATSReady(ctx); err != nil {
			checks["nats"] = health.Unavailable("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "message bridge is unavailable")
		} else {
			checks["nats"] = health.OK()
		}
		storageCheck := adapter.Name
		if storageCheck == "" {
			storageCheck = "storage"
		}
		if err := adapter.CheckReadiness(ctx); err != nil {
			checks[storageCheck] = health.Unavailable("ERR-006", "STORAGE_UNAVAILABLE", "storage is unavailable")
		} else {
			checks[storageCheck] = health.OK()
		}
		return checks
	}
}

func checkNATSReady(ctx context.Context, nc *nats.Conn) error {
	if nc == nil || nc.IsClosed() || nc.IsDraining() {
		return errors.New("ERR-013 MESSAGE_BRIDGE_UNAVAILABLE: invalid NATS connection")
	}
	timeout := time.Second
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining > 0 && remaining < timeout {
			timeout = remaining
		}
	}
	return nc.FlushTimeout(timeout)
}

func storageReadHealthServer(cfg storage.Config, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              net.JoinHostPort(cfg.HealthHost, cfg.HealthPort),
		Handler:           handler,
		ReadHeaderTimeout: healthReadHeaderTimeout,
	}
}

func storageReadSelfObservabilityMetricsExporter(cfg storage.Config, logger *slog.Logger) (*selfobs.OTLPHTTPMetricsExporter, error) {
	self := cfg.SelfObservability
	if !self.Enabled || !self.MetricsEnabled {
		return nil, nil
	}
	return selfobs.NewOTLPHTTPMetricsExporter(selfobs.MetricsExporterConfig{
		Enabled:               true,
		Endpoint:              self.OTLPEndpoint,
		BearerToken:           self.OTLPBearerToken,
		ExportIntervalSeconds: self.ExportIntervalSeconds,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        cfg.DeploymentMode,
		CompanyID:             self.CompanyID,
		ProjectID:             self.ProjectID,
		Logger:                logger,
		FailureLogLevel:       self.ExportFailureLogLevel,
	})
}

func storageReadSelfObservabilityTraceLogExporter(cfg storage.Config, logger *slog.Logger) (*storage.OTLPTraceLogExporter, error) {
	self := cfg.SelfObservability
	if !self.Enabled || (!self.TracesEnabled && !self.LogsEnabled) {
		return nil, nil
	}
	return storage.NewOTLPTraceLogExporter(storage.TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              self.OTLPEndpoint,
		BearerToken:           self.OTLPBearerToken,
		ExportIntervalSeconds: self.ExportIntervalSeconds,
		ServiceName:           "cloudgrid.storage_read",
		DeploymentMode:        cfg.DeploymentMode,
		CompanyID:             self.CompanyID,
		ProjectID:             self.ProjectID,
		TracesEnabled:         self.TracesEnabled,
		LogsEnabled:           self.LogsEnabled,
		Logger:                logger,
		FailureLogLevel:       self.ExportFailureLogLevel,
	})
}

type telemetryReadAdapter struct {
	Name           string
	Store          ports.TelemetryReadStore
	CheckReadiness func(context.Context) error
	Close          func(context.Context) error
}

func shutdownSignal() <-chan os.Signal {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	return signals
}

func newLogger(output io.Writer) *slog.Logger {
	handler := slog.NewJSONHandler(output, &slog.HandlerOptions{
		Level: runtimeLogLevel(),
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			switch attr.Key {
			case slog.TimeKey:
				attr.Key = "timestamp"
			case slog.MessageKey:
				attr.Key = "message"
			case slog.LevelKey:
				attr.Value = slog.StringValue(strings.ToLower(attr.Value.String()))
			}
			return attr
		},
	})
	return slog.New(handler)
}

func runtimeLogLevel() slog.Level {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("CLOUDGRID_LOG_LEVEL"))) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func logError(logger *slog.Logger, event string, err error, fallbackCode string, fields ...any) {
	errorID := fallbackCode
	if errorID == "" {
		errorID = errorIDFromError(err)
	}
	message := safeErrorMessage(err, errorID)
	args := []any{
		"service", "storage-read",
		"event", event,
		"request_id", "",
		"error_id", errorID,
		"error_code", errorCodeForID(errorID),
	}
	args = append(args, fields...)
	logger.Error(message, args...)
}

func safeErrorMessage(err error, code string) string {
	if err == nil {
		return ""
	}
	switch code {
	case "ERR-009", "ERR-001", "ERR-003":
		return err.Error()
	case "ERR-013":
		return "message bridge is unavailable"
	case "ERR-010":
		return err.Error()
	default:
		return "storage is unavailable"
	}
}

func errorIDFromError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	for _, code := range []string{"ERR-009", "ERR-001", "ERR-003", "ERR-013", "ERR-006"} {
		if strings.HasPrefix(message, code) {
			return code
		}
	}
	return "ERR-006"
}

func errorCodeForID(errorID string) string {
	switch errorID {
	case "ERR-001":
		return "VALIDATION_FAILED"
	case "ERR-003":
		return "INVALID_CURSOR"
	case "ERR-006":
		return "STORAGE_UNAVAILABLE"
	case "ERR-009":
		return "CONFIG_INVALID"
	case "ERR-013":
		return "MESSAGE_BRIDGE_UNAVAILABLE"
	case "ERR-010":
		return "RUNTIME_COMPOSITION_FAILED"
	default:
		return "STORAGE_UNAVAILABLE"
	}
}
