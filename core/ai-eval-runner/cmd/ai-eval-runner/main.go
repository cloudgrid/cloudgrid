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

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/orchestrator"
	runnerruntime "github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/runtime"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
)

const (
	defaultNATSURL    = "nats://localhost:4222"
	defaultHealthHost = "0.0.0.0"
	defaultHealthPort = "8085"
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
	if !cfg.Enabled {
		logger.Info("AI evaluation runner disabled",
			"service", "ai-eval-runner",
			"event", "startup_disabled",
			"request_id", "",
		)
		return 0
	}
	traceLogExporter, err := aiEvalSelfObservabilityTraceLogExporter(cfg, logger)
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

	nc, err := runnerruntime.ConnectNATS(cfg.NATSURL)
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "ERR-013")
		return 1
	}
	defer nc.Close()
	requester := runnerruntime.NATSRequester{Conn: nc}
	runner := orchestrator.NewRunner(orchestrator.RunnerConfig{
		StorageReader:     runnerruntime.NATSStorageReader{Requester: requester},
		StorageWriter:     runnerruntime.NATSStorageWriter{Requester: requester},
		ControlPlane:      runnerruntime.NATSControlPlane{Requester: requester},
		HarnessAdapter:    runnerruntime.HarnessHTTPAdapter{BaseURL: cfg.HarnessURL},
		ProgressPublisher: runnerruntime.NATSProgressPublisher{Publisher: requester},
	})
	if _, err := runnerruntime.SubscribeRunnerHandlersWithOptions(nc, runner, logger, runnerruntime.RunnerServiceOptions{SelfObservability: traceLogExporter}); err != nil {
		logError(logger, "message_bridge_subscribe_failed", err, "ERR-013")
		return 1
	}

	probes := health.NewState("ai-eval-runner", func(context.Context) map[string]health.Check {
		checks := map[string]health.Check{}
		if nc.IsClosed() {
			checks["nats"] = health.Unavailable("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "message bridge is unavailable")
		} else {
			checks["nats"] = health.OK()
		}
		checks["harness-adapter"] = health.OK()
		return checks
	})
	healthServer := &http.Server{
		Addr:              net.JoinHostPort(cfg.HealthHost, cfg.HealthPort),
		Handler:           probes.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	healthListener, err := net.Listen("tcp", healthServer.Addr)
	if err != nil {
		logError(logger, "health_server_bind_failed", err, "ERR-010", "health_addr", healthServer.Addr)
		return 1
	}
	probes.SetReady(true)
	healthErrors := make(chan error, 1)
	go func() {
		healthErrors <- healthServer.Serve(healthListener)
	}()

	logger.Info("AI evaluation runner ready",
		"service", "ai-eval-runner",
		"event", "startup_ready",
		"request_id", "",
		"health_addr", healthServer.Addr,
	)
	if traceLogExporter != nil {
		traceLogExporter.RecordLog(selfObservabilityLogEvent("startup_ready", "AI evaluation runner ready", "INFO", map[string]string{"operation": "startup"}))
	}
	select {
	case err := <-healthErrors:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logError(logger, "health_server_failed", err, "ERR-010")
			return 1
		}
		return 0
	case signal := <-shutdownSignal():
		probes.SetReady(false)
		logger.Info("AI evaluation runner shutdown started",
			"service", "ai-eval-runner",
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
		logger.Info("AI evaluation runner shutdown completed",
			"service", "ai-eval-runner",
			"event", "shutdown_completed",
			"request_id", "",
			"signal", signal.String(),
		)
	}
	return 0
}

type config struct {
	Enabled           bool
	NATSURL           string
	HarnessURL        string
	HealthHost        string
	HealthPort        string
	DeploymentMode    string
	SelfObservability selfObservabilityConfig
}

type selfObservabilityConfig struct {
	Enabled               bool
	CompanyID             string
	ProjectID             string
	OTLPEndpoint          string
	OTLPBearerToken       string
	ExportIntervalSeconds int
	TracesEnabled         bool
	LogsEnabled           bool
	ExportFailureLogLevel string
}

func loadConfig(getenv func(string) string) (config, error) {
	deploymentMode := strings.ToLower(valueOrDefault(getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local"))
	if deploymentMode != "local" && deploymentMode != "deployed" {
		return config{}, errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_DEPLOYMENT_MODE must be local or deployed")
	}
	self, err := loadSelfObservabilityConfig(getenv, deploymentMode)
	if err != nil {
		return config{}, err
	}
	cfg := config{
		Enabled:           strings.EqualFold(strings.TrimSpace(getenv("CLOUDGRID_AI_EVAL_ENABLED")), "true"),
		NATSURL:           valueOrDefault(getenv("CLOUDGRID_NATS_URL"), defaultNATSURL),
		HarnessURL:        strings.TrimSpace(getenv("CLOUDGRID_AI_EVAL_HARNESS_URL")),
		HealthHost:        valueOrDefault(getenv("CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST"), defaultHealthHost),
		HealthPort:        valueOrDefault(getenv("CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT"), defaultHealthPort),
		DeploymentMode:    deploymentMode,
		SelfObservability: self,
	}
	if cfg.Enabled && cfg.HarnessURL == "" {
		return config{}, errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_AI_EVAL_HARNESS_URL is required when CLOUDGRID_AI_EVAL_ENABLED=true")
	}
	return cfg, nil
}

func loadSelfObservabilityConfig(getenv func(string) string, deploymentMode string) (selfObservabilityConfig, error) {
	defaultEnabled := deploymentMode == "local"
	enabled, err := strictBool(valueOrDefault(getenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED"), boolString(defaultEnabled)), "CLOUDGRID_SELF_OBSERVABILITY_ENABLED")
	if err != nil {
		return selfObservabilityConfig{}, err
	}
	interval, err := intervalSeconds(getenv("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS"))
	if err != nil {
		return selfObservabilityConfig{}, err
	}
	cfg := selfObservabilityConfig{
		Enabled:               enabled,
		CompanyID:             strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID")),
		ProjectID:             strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID")),
		OTLPEndpoint:          strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT")),
		OTLPBearerToken:       strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN")),
		ExportIntervalSeconds: interval,
	}
	cfg.ExportFailureLogLevel, err = selfObservabilityFailureLogLevel(getenv("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL"))
	if err != nil {
		return selfObservabilityConfig{}, err
	}
	if deploymentMode == "local" {
		if cfg.CompanyID == "" {
			cfg.CompanyID = "local"
		}
		if cfg.ProjectID == "" {
			cfg.ProjectID = "cloudgrid-system"
		}
		if cfg.OTLPEndpoint == "" {
			cfg.OTLPEndpoint = "http://localhost:4318"
		}
	}
	cfg.TracesEnabled, err = strictBool(valueOrDefault(getenv("CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED"), boolString(enabled)), "CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED")
	if err != nil {
		return selfObservabilityConfig{}, err
	}
	cfg.LogsEnabled, err = strictBool(valueOrDefault(getenv("CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED"), boolString(enabled)), "CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED")
	if err != nil {
		return selfObservabilityConfig{}, err
	}
	if !enabled {
		cfg.TracesEnabled = false
		cfg.LogsEnabled = false
	}
	if deploymentMode == "deployed" && enabled && (cfg.CompanyID == "" || cfg.ProjectID == "" || cfg.OTLPEndpoint == "" || cfg.OTLPBearerToken == "") {
		return selfObservabilityConfig{}, errors.New("ERR-009 CONFIG_INVALID: deployed self-observability requires company ID, project ID, OTLP endpoint, and bearer token")
	}
	if deploymentMode == "local" && enabled && cfg.OTLPBearerToken == "" {
		return selfObservabilityConfig{}, errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN is required when self-observability is enabled")
	}
	return cfg, nil
}

func aiEvalSelfObservabilityTraceLogExporter(cfg config, logger *slog.Logger) (*selfobs.OTLPTraceLogExporter, error) {
	self := cfg.SelfObservability
	if !self.Enabled || (!self.TracesEnabled && !self.LogsEnabled) {
		return nil, nil
	}
	return selfobs.NewOTLPTraceLogExporter(selfobs.TraceLogExporterConfig{
		Enabled:               true,
		Endpoint:              self.OTLPEndpoint,
		BearerToken:           self.OTLPBearerToken,
		ExportIntervalSeconds: self.ExportIntervalSeconds,
		ServiceName:           "cloudgrid.ai_eval_runner",
		DeploymentMode:        cfg.DeploymentMode,
		CompanyID:             self.CompanyID,
		ProjectID:             self.ProjectID,
		TracesEnabled:         self.TracesEnabled,
		LogsEnabled:           self.LogsEnabled,
		Logger:                logger,
		FailureLogLevel:       self.ExportFailureLogLevel,
	})
}

func selfObservabilityFailureLogLevel(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return "warn", nil
	}
	switch value {
	case "debug", "info", "warn", "error", "off":
		return value, nil
	default:
		return "", errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL must be debug, info, warn, error, or off")
	}
}

func selfObservabilityLogEvent(event string, message string, severity string, attrs map[string]string) selfobs.LogEvent {
	copied := make(map[string]string, len(attrs)+1)
	for key, value := range attrs {
		copied[key] = value
	}
	copied["event"] = event
	return selfobs.LogEvent{Message: message, SeverityText: severity, Attributes: copied}
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

func logError(logger *slog.Logger, event string, err error, fallbackID string, fields ...any) {
	args := []any{
		"service", "ai-eval-runner",
		"event", event,
		"request_id", "",
		"error_id", fallbackID,
		"error_code", errorCodeForID(fallbackID),
	}
	args = append(args, fields...)
	logger.Error(safeErrorMessage(err, fallbackID), args...)
}

func safeErrorMessage(err error, errorID string) string {
	if err == nil {
		return ""
	}
	switch errorID {
	case "ERR-013":
		return "message bridge is unavailable"
	default:
		return err.Error()
	}
}

func errorCodeForID(errorID string) string {
	switch errorID {
	case "ERR-009":
		return "CONFIG_INVALID"
	case "ERR-010":
		return "RUNTIME_COMPOSITION_FAILED"
	case "ERR-013":
		return "MESSAGE_BRIDGE_UNAVAILABLE"
	default:
		return "RUNTIME_COMPOSITION_FAILED"
	}
}

func strictBool(value string, name string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, errors.New("ERR-009 CONFIG_INVALID: " + name + " must be true or false")
	}
}

func intervalSeconds(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 10, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 || parsed > 300 {
		return 0, errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS must be an integer between 1 and 300")
	}
	return parsed, nil
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

func valueOrDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
