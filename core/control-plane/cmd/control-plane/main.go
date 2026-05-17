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

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal"
	controlsurreal "github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/adapters/surrealdb"
	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
)

const (
	defaultNATSURL             = "nats://localhost:4222"
	defaultHealthHost          = "0.0.0.0"
	defaultHealthPort          = "8084"
	defaultSurrealDBURL        = "http://localhost:8000/rpc"
	defaultSurrealDBNamespace  = "observability"
	defaultSurrealDBDatabase   = "dev"
	defaultSurrealDBUsername   = "root"
	defaultSurrealDBPassword   = "root"
	storeReadinessTimeout      = 5 * time.Second
	storeInitializationTimeout = 15 * time.Second
)

func main() {
	os.Exit(run())
}

func run() int {
	logger := newLogger(os.Stdout)

	store, adapter, storeReadiness, storeClose, err := setupControlStore(context.Background())
	if err != nil {
		logError(logger, "control_store_unavailable", err, "ERR-006")
		return 1
	}
	defer func() {
		if storeClose != nil {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), storeReadinessTimeout)
			defer cancel()
			if err := storeClose(shutdownCtx); err != nil {
				logError(logger, "control_store_shutdown_failed", err, "ERR-010")
			}
		}
	}()

	service := internal.NewService(store, time.Now)
	nc, err := internal.ConnectNATS(valueOrDefault(os.Getenv("CLOUDGRID_NATS_URL"), defaultNATSURL))
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "ERR-013")
		return 1
	}
	defer nc.Close()

	if _, err := internal.SubscribeControlHandlers(nc, service, logger); err != nil {
		logError(logger, "message_bridge_subscribe_failed", err, "ERR-013")
		return 1
	}

	probes := health.NewState("control-plane", func(ctx context.Context) map[string]health.Check {
		checks := map[string]health.Check{}
		if nc.IsClosed() {
			checks["nats"] = health.Unavailable("ERR-013", "MESSAGE_BRIDGE_UNAVAILABLE", "message bridge is unavailable")
		} else {
			checks["nats"] = health.OK()
		}
		if err := storeReadiness(ctx); err != nil {
			checks["control-store"] = health.Unavailable("ERR-006", "STORAGE_UNAVAILABLE", "control store is unavailable")
		} else {
			checks["control-store"] = health.OK()
		}
		return checks
	})
	healthServer := &http.Server{
		Addr:              net.JoinHostPort(valueOrDefault(os.Getenv("CLOUDGRID_CONTROL_PLANE_HEALTH_HOST"), defaultHealthHost), valueOrDefault(os.Getenv("CLOUDGRID_CONTROL_PLANE_HEALTH_PORT"), defaultHealthPort)),
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

	logger.Info("control plane service ready",
		"service", "control-plane",
		"event", "startup_ready",
		"request_id", "",
		"adapter", adapter,
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
		logger.Info("control plane shutdown started",
			"service", "control-plane",
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
		logger.Info("control plane shutdown completed",
			"service", "control-plane",
			"event", "shutdown_completed",
			"request_id", "",
			"signal", signal.String(),
		)
	}
	return 0
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
		"service", "control-plane",
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

type controlStoreReadiness func(context.Context) error

type controlStoreClose func(context.Context) error

func setupControlStore(ctx context.Context) (ports.ControlStore, string, controlStoreReadiness, controlStoreClose, error) {
	initCtx, cancel := context.WithTimeout(ctx, storeInitializationTimeout)
	defer cancel()
	client, err := controlsurreal.Connect(initCtx, controlSurrealDBConfig())
	if err != nil {
		return nil, "", nil, nil, err
	}
	if err := client.ApplySchema(initCtx); err != nil {
		_ = client.Close(context.Background())
		return nil, "", nil, nil, err
	}
	if err := client.CheckReadiness(initCtx); err != nil {
		_ = client.Close(context.Background())
		return nil, "", nil, nil, err
	}
	readiness := func(ctx context.Context) error {
		checkCtx, cancel := context.WithTimeout(ctx, storeReadinessTimeout)
		defer cancel()
		return client.CheckReadiness(checkCtx)
	}
	return controlsurreal.NewStore(client), "surrealdb", readiness, client.Close, nil
}

func controlSurrealDBConfig() controlsurreal.Config {
	return controlsurreal.Config{
		URL:       valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_URL"), defaultSurrealDBURL),
		Namespace: valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_NAMESPACE"), defaultSurrealDBNamespace),
		Database:  valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_DATABASE"), defaultSurrealDBDatabase),
		Username:  valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_USERNAME"), defaultSurrealDBUsername),
		Password:  valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_PASSWORD"), defaultSurrealDBPassword),
	}
}
