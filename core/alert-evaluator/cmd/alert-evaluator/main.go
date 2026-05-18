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
)

const (
	defaultHealthHost = "0.0.0.0"
	defaultHealthPort = "8086"
)

func main() {
	os.Exit(run())
}

func run() int {
	logger := newLogger(os.Stdout)
	cfg := loadConfig(os.Getenv)
	probes := health.NewState("alert-evaluator", func(context.Context) map[string]health.Check {
		return map[string]health.Check{
			"runtime": health.OK(),
		}
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
	logger.Info("alert evaluator service ready",
		"service", "alert-evaluator",
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
	HealthHost string
	HealthPort string
}

func loadConfig(getenv func(string) string) config {
	return config{
		HealthHost: valueOrDefault(getenv("CLOUDGRID_ALERT_EVALUATOR_HEALTH_HOST"), defaultHealthHost),
		HealthPort: valueOrDefault(getenv("CLOUDGRID_ALERT_EVALUATOR_HEALTH_PORT"), defaultHealthPort),
	}
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
		"error_code", "RUNTIME_COMPOSITION_FAILED",
	}
	args = append(args, fields...)
	logger.Error(err.Error(), args...)
}

func valueOrDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
