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
)

const startupTimeout = 5 * time.Second

func main() {
	os.Exit(run())
}

func run() int {
	logger := newLogger(os.Stdout)
	ctx, cancel := context.WithTimeout(context.Background(), startupTimeout)
	defer cancel()

	cfg, err := storage.LoadConfig(storage.OSEnv)
	if err != nil {
		logError(logger, "startup_config_invalid", err, "ERR-009")
		return 1
	}

	adapter, err := newTelemetryReadAdapter(ctx, cfg)
	if err != nil {
		logError(logger, "startup_storage_unavailable", err, "ERR-006")
		return 1
	}
	defer func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), time.Second)
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
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
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
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer shutdownCancel()
			_ = traceLogExporter.Shutdown(shutdownCtx)
		}()
	}

	nc, err := storage.ConnectNATS(cfg.NATSURL)
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "ERR-013")
		return 1
	}
	defer nc.Close()

	var recorder storage.MetricsRecorder
	if metricsExporter != nil {
		recorder = storage.NewOTLPMetricsRecorder(metricsExporter)
	}
	if _, err := storage.SubscribeTelemetryHandlersWithSelfObservability(nc, adapter.Store, logger, recorder, traceLogExporter); err != nil {
		logError(logger, "message_bridge_subscribe_failed", err, "ERR-013")
		return 1
	}

	probes := health.NewState("storage-read", func(ctx context.Context) map[string]health.Check {
		checks := map[string]health.Check{}
		if nc.IsClosed() {
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
	})
	healthServer := &http.Server{
		Addr:              net.JoinHostPort(cfg.HealthHost, cfg.HealthPort),
		Handler:           probes.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	probes.SetReady(true)
	healthErrors := make(chan error, 1)
	healthListener, err := net.Listen("tcp", healthServer.Addr)
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
	case signal := <-shutdownSignal():
		probes.SetReady(false)
		logger.Info("storage read shutdown started",
			"service", "storage-read",
			"event", "shutdown_started",
			"request_id", "",
			"signal", signal.String(),
		)
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
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
