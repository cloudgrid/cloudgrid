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
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/alert-evaluator/internal/evaluator"
	"github.com/cloudgrid-dev/cloudgrid/core/alert-evaluator/internal/runtime"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
)

const (
	defaultHealthHost = "0.0.0.0"
	defaultHealthPort = "8086"
	defaultNATSURL    = "nats://localhost:4222"
)

func main() {
	os.Exit(run())
}

func run() int {
	logger := newLogger(os.Stdout)
	cfg := loadConfig(os.Getenv)
	if err := cfg.Validate(); err != nil {
		logError(logger, "config_invalid", err, "ERR-009")
		return 1
	}
	nc, err := runtime.ConnectNATS(cfg.NATSURL)
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "ERR-013")
		return 1
	}
	defer nc.Close()
	controlPort := runtime.NewNATSControlPlanePortForProjects(nc, cfg.RequestTimeout, cfg.ProjectIDs)
	if cfg.ProjectDiscoveryEnabled {
		controlPort = runtime.NewNATSControlPlanePortWithDiscovery(nc, cfg.RequestTimeout)
	}
	storagePort := runtime.NewNATSStorageReadPort(nc, cfg.RequestTimeout)
	notificationDispatcher, err := runtime.NewNotificationDispatcher(runtime.NotificationConfig{
		Adapters: cfg.NotificationAdapters,
		Webhooks: cfg.Webhooks,
	})
	if err != nil {
		logError(logger, "notification_config_invalid", err, "ERR-009")
		return 1
	}
	alertEvaluator := evaluator.New(evaluator.EvaluatorConfig{
		StorageRead:   storagePort,
		ControlPlane:  controlPort,
		Notifications: notificationDispatcher,
		Timeout:       cfg.RequestTimeout,
	})
	runtimeService := runtime.NewService(alertEvaluator)
	if _, err := runtime.SubscribeHandlers(nc, runtimeService); err != nil {
		logError(logger, "message_bridge_subscribe_failed", err, "ERR-013")
		return 1
	}
	probes := health.NewState("alert-evaluator", func(context.Context) map[string]health.Check {
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
	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	defer schedulerCancel()
	startAlertScheduler(schedulerCtx, alertEvaluator, logger, cfg)
	logger.Info("alert evaluator service ready",
		"service", "alert-evaluator",
		"event", "startup_ready",
		"request_id", "",
		"subjects", strings.Join([]string{runtime.SubjectTick, runtime.SubjectRuleEvaluate, runtime.SubjectNotificationDispatch}, ","),
		"scheduled_project_count", len(cfg.ProjectIDs),
		"project_discovery_enabled", cfg.ProjectDiscoveryEnabled,
		"notification_adapters", strings.Join(notificationDispatcher.AdapterIDs(), ","),
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
		logger.Info("alert evaluator shutdown started",
			"service", "alert-evaluator",
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
	HealthHost              string
	HealthPort              string
	NATSURL                 string
	RequestTimeout          time.Duration
	ProjectIDs              []string
	ProjectDiscoveryEnabled bool
	NotificationAdapters    []string
	Webhooks                map[string]runtime.WebhookConfig
	Interval                time.Duration
}

func loadConfig(getenv func(string) string) config {
	intervalSeconds := intValue(getenv("CLOUDGRID_ALERT_EVALUATOR_INTERVAL_SECONDS"), 60)
	notificationAdapters := splitCSV(getenv("CLOUDGRID_ALERT_NOTIFICATION_ADAPTERS"))
	webhookTimeout := time.Duration(intValue(getenv("CLOUDGRID_ALERT_WEBHOOK_TIMEOUT_SECONDS"), 10)) * time.Second
	return config{
		HealthHost:              valueOrDefault(getenv("CLOUDGRID_ALERT_EVALUATOR_HEALTH_HOST"), defaultHealthHost),
		HealthPort:              valueOrDefault(getenv("CLOUDGRID_ALERT_EVALUATOR_HEALTH_PORT"), defaultHealthPort),
		NATSURL:                 valueOrDefault(getenv("CLOUDGRID_NATS_URL"), defaultNATSURL),
		RequestTimeout:          1500 * time.Millisecond,
		ProjectIDs:              splitCSV(getenv("CLOUDGRID_ALERT_EVALUATOR_PROJECT_IDS")),
		ProjectDiscoveryEnabled: boolValue(getenv("CLOUDGRID_ALERT_EVALUATOR_PROJECT_DISCOVERY_ENABLED"), false),
		NotificationAdapters:    notificationAdapters,
		Webhooks:                loadWebhookConfigs(getenv, notificationAdapters, webhookTimeout),
		Interval:                time.Duration(intervalSeconds) * time.Second,
	}
}

func (cfg config) Validate() error {
	if cfg.Interval > 0 && !cfg.ProjectDiscoveryEnabled && len(cfg.ProjectIDs) == 0 {
		return errors.New("ERR-009 CONFIG_INVALID: alert evaluator scheduling requires CLOUDGRID_ALERT_EVALUATOR_PROJECT_DISCOVERY_ENABLED=true or CLOUDGRID_ALERT_EVALUATOR_PROJECT_IDS")
	}
	return nil
}

func startAlertScheduler(ctx context.Context, alertEvaluator *evaluator.Evaluator, logger *slog.Logger, cfg config) {
	if cfg.Interval <= 0 {
		logger.Info("alert evaluator scheduler disabled",
			"service", "alert-evaluator",
			"event", "scheduler_disabled",
			"request_id", "",
			"reason", "interval_disabled",
		)
		return
	}
	go func() {
		ticker := time.NewTicker(cfg.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				started := time.Now()
				result, err := alertEvaluator.Tick(ctx, now.UTC())
				if err != nil {
					logError(logger, "scheduler_tick_failed", err, "ERR-021", "duration_ms", time.Since(started).Milliseconds())
					continue
				}
				logger.Info("alert evaluator scheduler tick completed",
					"service", "alert-evaluator",
					"event", "scheduler_tick_completed",
					"request_id", "",
					"duration_ms", time.Since(started).Milliseconds(),
					"evaluated_rules", result.EvaluatedRules,
					"firing_rules", result.FiringRules,
					"error_rules", result.ErrorRules,
				)
			}
		}
	}()
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
		"service", "alert-evaluator",
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
	case "ERR-009":
		return "CONFIG_INVALID"
	case "ERR-021":
		return "ALERT_EVALUATOR_TIMEOUT"
	case "ERR-010":
		return "RUNTIME_COMPOSITION_FAILED"
	default:
		return "RUNTIME_COMPOSITION_FAILED"
	}
}

func boolValue(value string, fallback bool) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes"
}

func valueOrDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func intValue(value string, fallback int) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return fallback
	}
	return parsed
}

func splitCSV(value string) []string {
	items := []string{}
	for _, item := range strings.Split(value, ",") {
		item = strings.TrimSpace(item)
		if item != "" {
			items = append(items, item)
		}
	}
	return items
}

func loadWebhookConfigs(getenv func(string) string, adapterIDs []string, timeout time.Duration) map[string]runtime.WebhookConfig {
	configs := map[string]runtime.WebhookConfig{}
	for _, adapterID := range adapterIDs {
		if adapterID == "in_app" || adapterID == "email" {
			continue
		}
		envID := webhookEnvID(adapterID)
		configs[adapterID] = runtime.WebhookConfig{
			URL:           strings.TrimSpace(getenv("CLOUDGRID_ALERT_WEBHOOK_" + envID + "_URL")),
			SigningSecret: getenv("CLOUDGRID_ALERT_WEBHOOK_" + envID + "_SIGNING_SECRET"),
			Timeout:       timeout,
		}
	}
	return configs
}

func webhookEnvID(adapterID string) string {
	adapterID = strings.ToUpper(strings.TrimSpace(adapterID))
	replacer := strings.NewReplacer("-", "_", ".", "_")
	return replacer.Replace(adapterID)
}
