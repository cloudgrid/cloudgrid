package main

import (
	"context"
	"errors"
	"fmt"
	"io"
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
	"github.com/cloudgrid-dev/cloudgrid/core/storage-maintenance/internal/retention"
)

const (
	defaultHealthHost = "0.0.0.0"
	defaultHealthPort = "8087"
	defaultNATSURL    = "nats://localhost:4222"

	defaultRetentionSchedulerIntervalSeconds = 3600
	defaultRetentionBatchLimit               = 1000
	defaultRetentionLeaseSeconds             = 900
)

func main() {
	os.Exit(run())
}

func run() int {
	logger := newLogger(os.Stdout)
	cfg, err := loadConfig(os.Getenv)
	if err != nil {
		logError(logger, "startup_config_invalid", err, "ERR-009")
		return 1
	}
	if cfg.RetentionScheduler.Enabled {
		cfg.RetentionScheduler.OwnerID = fmt.Sprintf("storage-maintenance-%d", time.Now().UTC().UnixNano())
	}
	store := retention.NewFixtureStore()
	executor := retention.NewExecutor(store, logger, time.Now)
	scheduler := retention.NewScheduler(executor, store, cfg.RetentionScheduler, time.Now)
	if scheduler.Enabled() {
		logger.Info("retention scheduler enabled",
			"service", "storage-maintenance",
			"event", "retention.scheduler_enabled",
			"request_id", "",
			"project_count", len(cfg.RetentionScheduler.ProjectIDs),
			"interval_seconds", int(cfg.RetentionScheduler.Interval.Seconds()),
			"batch_limit", cfg.RetentionScheduler.BatchLimit,
			"lease_seconds", int(cfg.RetentionScheduler.LeaseDuration.Seconds()),
		)
	}
	runtimeService := retention.NewRuntimeService(executor)
	nc, err := retention.ConnectNATS(cfg.NATSURL)
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "ERR-013")
		return 1
	}
	defer nc.Close()
	if _, err := retention.SubscribeHandlers(nc, runtimeService); err != nil {
		logError(logger, "message_bridge_subscribe_failed", err, "ERR-013")
		return 1
	}
	probes := health.NewState("storage-maintenance", func(context.Context) map[string]health.Check {
		checks := map[string]health.Check{"runtime": health.OK()}
		if nc.IsClosed() {
			checks["nats"] = health.Unavailable("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "message bridge is unavailable")
		} else {
			checks["nats"] = health.OK()
		}
		return checks
	})
	healthServer := &http.Server{
		Addr:              net.JoinHostPort(cfg.HealthHost, cfg.HealthPort),
		Handler:           probes.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	listener, err := net.Listen("tcp", healthServer.Addr)
	if err != nil {
		logError(logger, "health_server_bind_failed", err, "ERR-010", "health_addr", healthServer.Addr)
		return 1
	}
	probes.SetReady(true)
	healthErrors := make(chan error, 1)
	go func() {
		healthErrors <- healthServer.Serve(listener)
	}()
	schedulerStop := startRetentionScheduler(context.Background(), scheduler, logger)
	defer schedulerStop()
	logger.Info("storage maintenance service ready",
		"service", "storage-maintenance",
		"event", "startup_ready",
		"request_id", "",
		"subject", retention.SubjectRetentionExecuteBatch,
		"health_addr", healthServer.Addr,
	)
	select {
	case err := <-healthErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logError(logger, "health_server_failed", err, "ERR-010")
			return 1
		}
	case signal := <-shutdownSignal():
		probes.SetReady(false)
		logger.Info("storage maintenance shutdown started",
			"service", "storage-maintenance",
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
	}
	return 0
}

type config struct {
	HealthHost         string
	HealthPort         string
	NATSURL            string
	RetentionScheduler retention.SchedulerConfig
}

func loadConfig(getenv func(string) string) (config, error) {
	schedulerEnabled, err := boolValue(getenv("CLOUDGRID_RETENTION_SCHEDULER_ENABLED"), false, "CLOUDGRID_RETENTION_SCHEDULER_ENABLED")
	if err != nil {
		return config{}, err
	}
	intervalSeconds, err := rangedIntValue(getenv("CLOUDGRID_RETENTION_SCHEDULER_INTERVAL_SECONDS"), defaultRetentionSchedulerIntervalSeconds, 300, 86400, "CLOUDGRID_RETENTION_SCHEDULER_INTERVAL_SECONDS")
	if err != nil {
		return config{}, err
	}
	batchLimit, err := rangedIntValue(getenv("CLOUDGRID_RETENTION_BATCH_LIMIT"), defaultRetentionBatchLimit, 1, 100000, "CLOUDGRID_RETENTION_BATCH_LIMIT")
	if err != nil {
		return config{}, err
	}
	leaseSeconds, err := rangedIntValue(getenv("CLOUDGRID_RETENTION_LEASE_SECONDS"), defaultRetentionLeaseSeconds, 60, 86400, "CLOUDGRID_RETENTION_LEASE_SECONDS")
	if err != nil {
		return config{}, err
	}
	projectIDs := stringListValue(getenv("CLOUDGRID_RETENTION_SCHEDULER_PROJECT_IDS"))
	if schedulerEnabled && len(projectIDs) == 0 {
		return config{}, fmt.Errorf("ERR-009 CONFIG_INVALID: CLOUDGRID_RETENTION_SCHEDULER_PROJECT_IDS is required when retention scheduler is enabled")
	}
	return config{
		HealthHost: valueOrDefault(getenv("CLOUDGRID_STORAGE_MAINTENANCE_HEALTH_HOST"), defaultHealthHost),
		HealthPort: valueOrDefault(getenv("CLOUDGRID_STORAGE_MAINTENANCE_HEALTH_PORT"), defaultHealthPort),
		NATSURL:    valueOrDefault(getenv("CLOUDGRID_NATS_URL"), defaultNATSURL),
		RetentionScheduler: retention.SchedulerConfig{
			Enabled:       schedulerEnabled,
			ProjectIDs:    projectIDs,
			Interval:      time.Duration(intervalSeconds) * time.Second,
			BatchLimit:    batchLimit,
			LeaseDuration: time.Duration(leaseSeconds) * time.Second,
		},
	}, nil
}

func startRetentionScheduler(ctx context.Context, scheduler *retention.Scheduler, logger *slog.Logger) func() {
	if !scheduler.Enabled() {
		return func() {}
	}
	schedulerCtx, cancel := context.WithCancel(ctx)
	go func() {
		ticker := time.NewTicker(scheduler.Interval())
		defer ticker.Stop()
		if _, err := scheduler.Tick(schedulerCtx); err != nil {
			logError(logger, "retention_scheduler_tick_failed", err, "ERR-006")
		}
		for {
			select {
			case <-schedulerCtx.Done():
				return
			case <-ticker.C:
				if _, err := scheduler.Tick(schedulerCtx); err != nil {
					logError(logger, "retention_scheduler_tick_failed", err, "ERR-006")
				}
			}
		}
	}()
	return cancel
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

func logError(logger *slog.Logger, event string, err error, fallbackID string, fields ...any) {
	args := []any{
		"service", "storage-maintenance",
		"event", event,
		"request_id", "",
		"error_id", fallbackID,
		"error_code", errorCodeForID(fallbackID),
	}
	args = append(args, fields...)
	logger.Error(err.Error(), args...)
}

func errorCodeForID(errorID string) string {
	switch errorID {
	case "ERR-013":
		return "MESSAGE_BRIDGE_UNAVAILABLE"
	case "ERR-010":
		return "RUNTIME_COMPOSITION_FAILED"
	case "ERR-009":
		return "CONFIG_INVALID"
	case "ERR-006":
		return "STORAGE_UNAVAILABLE"
	default:
		return "RUNTIME_COMPOSITION_FAILED"
	}
}

func valueOrDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func boolValue(value string, fallback bool, name string) (bool, error) {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return fallback, nil
	}
	switch value {
	case "true", "1", "yes":
		return true, nil
	case "false", "0", "no":
		return false, nil
	default:
		return false, fmt.Errorf("ERR-009 CONFIG_INVALID: %s must be true or false", name)
	}
}

func rangedIntValue(value string, fallback int, min int, max int, name string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < min || parsed > max {
		return 0, fmt.Errorf("ERR-009 CONFIG_INVALID: %s must be an integer between %d and %d", name, min, max)
	}
	return parsed, nil
}

func stringListValue(value string) []string {
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			items = append(items, part)
		}
	}
	return items
}
