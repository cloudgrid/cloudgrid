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
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/config"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ingest"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
)

const startupTimeout = 5 * time.Second

func main() {
	os.Exit(run())
}

func run() int {
	logger := newLogger(os.Stdout)
	ctx, cancel := context.WithTimeout(context.Background(), startupTimeout)
	defer cancel()

	cfg, err := config.Load()
	if err != nil {
		logError(logger, "startup_config_invalid", err, "", "")
		return 1
	}

	adapter, err := newTelemetryWriteAdapter(ctx, cfg)
	if err != nil {
		logError(logger, "startup_storage_unavailable", err, "", "ERR-006")
		return 1
	}
	defer func() {
		closeCtx, closeCancel := context.WithTimeout(context.Background(), time.Second)
		defer closeCancel()
		if err := adapter.Close(closeCtx); err != nil {
			logError(logger, "storage_close_failed", err, "", "ERR-006")
		}
	}()

	if err := adapter.Initialize(ctx); err != nil {
		logError(logger, "schema_init_failed", err, "", "ERR-006")
		return 1
	}
	metricsExporter, err := storageWriteSelfObservabilityMetricsExporter(cfg, logger)
	if err != nil {
		logError(logger, "self_observability_config_invalid", err, "", "ERR-009")
		return 1
	}
	if metricsExporter != nil {
		defer func() {
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer shutdownCancel()
			_ = metricsExporter.Shutdown(shutdownCtx)
		}()
	}
	traceLogExporter, err := storageWriteSelfObservabilityTraceLogExporter(cfg, logger)
	if err != nil {
		logError(logger, "self_observability_config_invalid", err, "", "ERR-009")
		return 1
	}
	if traceLogExporter != nil {
		defer func() {
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer shutdownCancel()
			_ = traceLogExporter.Shutdown(shutdownCtx)
		}()
	}

	var recorder ingest.MetricsRecorder
	if metricsExporter != nil {
		recorder = ingest.NewOTLPMetricsRecorder(metricsExporter)
	}
	var traceLogRecorder ingest.TraceLogRecorder
	if traceLogExporter != nil {
		traceLogRecorder = ingest.NewSignalFilteredTraceLogRecorder(traceLogExporter, cfg.SelfObservability.TracesEnabled, cfg.SelfObservability.LogsEnabled)
	}
	bridge, err := newMessageBridgeAdapterWithSelfObservability(cfg.NATSURL, adapter.Store, logger, recorder, traceLogRecorder, cfg.Consumer)
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "", "ERR-013")
		return 1
	}
	defer bridge.Close()

	probes := health.NewState("storage-write", func(ctx context.Context) map[string]health.Check {
		checks := map[string]health.Check{}
		if bridge.IsClosed() {
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
		logError(logger, "health_server_bind_failed", err, "", "ERR-010", "health_addr", healthServer.Addr)
		return 1
	}
	go func() {
		healthErrors <- healthServer.Serve(healthListener)
	}()

	logger.Info("storage write service ready",
		"service", "storage-write",
		"event", "startup_ready",
		"request_id", "",
		"consumer", "storage-write",
		"consumer_mode", cfg.Consumer.Mode,
		"pull_batch_size", cfg.Consumer.PullBatchSize,
		"max_ack_pending", cfg.Consumer.MaxAckPending,
		"concurrency", cfg.Consumer.Concurrency,
		"adapter", adapter.Name,
		"health_addr", healthServer.Addr,
	)

	runCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	consumerErrors := make(chan error, 1)
	go func() {
		consumerErrors <- bridge.RunConsumer(runCtx)
	}()

	select {
	case err := <-healthErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logError(logger, "health_server_failed", err, "", "ERR-010")
			return 1
		}
	case err := <-consumerErrors:
		if err != nil && !errors.Is(err, context.Canceled) {
			logError(logger, "jetstream_consumer_failed", err, "", "ERR-013")
			return 1
		}
	case <-runCtx.Done():
	}

	probes.SetReady(false)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := healthServer.Shutdown(shutdownCtx); err != nil {
		logError(logger, "health_server_shutdown_failed", err, "", "ERR-010")
		return 1
	}
	_ = bridge.Drain()
	logger.Info("storage write shutdown completed",
		"service", "storage-write",
		"event", "shutdown_completed",
		"request_id", "",
	)
	return 0
}

func storageWriteSelfObservabilityMetricsExporter(cfg config.Config, logger *slog.Logger) (*selfobs.OTLPHTTPMetricsExporter, error) {
	self := cfg.SelfObservability
	if !self.Enabled || !self.MetricsEnabled {
		return nil, nil
	}
	return selfobs.NewOTLPHTTPMetricsExporter(selfobs.MetricsExporterConfig{
		Enabled:               true,
		Endpoint:              self.OTLPEndpoint,
		BearerToken:           self.OTLPBearerToken,
		ExportIntervalSeconds: self.ExportIntervalSeconds,
		ServiceName:           "cloudgrid.storage_write",
		DeploymentMode:        cfg.DeploymentMode,
		CompanyID:             self.CompanyID,
		ProjectID:             self.ProjectID,
		Logger:                logger,
	})
}

func storageWriteSelfObservabilityTraceLogExporter(cfg config.Config, logger *slog.Logger) (*ingest.OTLPTraceLogExporter, error) {
	self := cfg.SelfObservability
	if !self.Enabled || (!self.TracesEnabled && !self.LogsEnabled) {
		return nil, nil
	}
	return ingest.NewOTLPTraceLogExporter(ingest.TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              self.OTLPEndpoint,
		BearerToken:           self.OTLPBearerToken,
		ExportIntervalSeconds: self.ExportIntervalSeconds,
		ServiceName:           "cloudgrid.storage_write",
		DeploymentMode:        cfg.DeploymentMode,
		CompanyID:             self.CompanyID,
		ProjectID:             self.ProjectID,
		Logger:                logger,
	})
}

type telemetryWriteAdapter struct {
	Name           string
	Store          ports.TelemetryWriteStore
	Initialize     func(context.Context) error
	CheckReadiness func(context.Context) error
	Close          func(context.Context) error
}

type messageBridgeAdapter struct {
	RunConsumer func(context.Context) error
	IsClosed    func() bool
	Drain       func() error
	Close       func()
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

func logError(logger *slog.Logger, event string, err error, requestID string, fallbackCode string, fields ...any) {
	errorID := fallbackCode
	if errorID == "" {
		errorID = errorIDFromError(err)
	}
	message := safeErrorMessage(err, errorID)
	args := []any{
		"service", "storage-write",
		"event", event,
		"request_id", requestID,
		"error_id", errorID,
		"error_code", errorCodeForID(errorID),
	}
	args = append(args, fields...)
	logger.Error(message, args...)
}

func safeErrorMessage(err error, errorCode string) string {
	if err == nil {
		return ""
	}
	switch errorCode {
	case "ERR-009", "ERR-001":
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
	msg := err.Error()
	switch {
	case len(msg) >= len("ERR-009") && msg[:len("ERR-009")] == "ERR-009":
		return "ERR-009"
	case len(msg) >= len("ERR-001") && msg[:len("ERR-001")] == "ERR-001":
		return "ERR-001"
	default:
		return "ERR-006"
	}
}

func errorCodeForID(errorID string) string {
	switch errorID {
	case "ERR-001":
		return "VALIDATION_FAILED"
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
