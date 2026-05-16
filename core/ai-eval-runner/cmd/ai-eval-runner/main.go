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

	"github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/orchestrator"
	runnerruntime "github.com/cloudgrid-dev/cloudgrid/core/ai-eval-runner/internal/runtime"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
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
	if _, err := runnerruntime.SubscribeRunnerHandlers(nc, runner, logger); err != nil {
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
	Enabled    bool
	NATSURL    string
	HarnessURL string
	HealthHost string
	HealthPort string
}

func loadConfig(getenv func(string) string) (config, error) {
	cfg := config{
		Enabled:    strings.EqualFold(strings.TrimSpace(getenv("CLOUDGRID_AI_EVAL_ENABLED")), "true"),
		NATSURL:    valueOrDefault(getenv("CLOUDGRID_NATS_URL"), defaultNATSURL),
		HarnessURL: strings.TrimSpace(getenv("CLOUDGRID_AI_EVAL_HARNESS_URL")),
		HealthHost: valueOrDefault(getenv("CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST"), defaultHealthHost),
		HealthPort: valueOrDefault(getenv("CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT"), defaultHealthPort),
	}
	if cfg.Enabled && cfg.HarnessURL == "" {
		return config{}, errors.New("ERR-009 CONFIG_INVALID: CLOUDGRID_AI_EVAL_HARNESS_URL is required when CLOUDGRID_AI_EVAL_ENABLED=true")
	}
	return cfg, nil
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

func valueOrDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
