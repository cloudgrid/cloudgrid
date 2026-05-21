package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/config"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ingest"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
)

type failingListener struct{}

func (failingListener) Accept() (net.Conn, error) {
	return nil, errors.New("listener stopped")
}

func (failingListener) Close() error {
	return nil
}

func (failingListener) Addr() net.Addr {
	return fakeAddr("127.0.0.1:0")
}

type blockingListener struct {
	done chan struct{}
}

type expectedStopListener struct{}

func (expectedStopListener) Accept() (net.Conn, error) {
	return nil, http.ErrServerClosed
}

func (expectedStopListener) Close() error {
	return nil
}

func (expectedStopListener) Addr() net.Addr {
	return fakeAddr("127.0.0.1:0")
}

func (listener blockingListener) Accept() (net.Conn, error) {
	<-listener.done
	return nil, errors.New("listener closed")
}

func (listener blockingListener) Close() error {
	close(listener.done)
	return nil
}

func (listener blockingListener) Addr() net.Addr {
	return fakeAddr("127.0.0.1:0")
}

type fakeAddr string

func (addr fakeAddr) Network() string {
	return "tcp"
}

func (addr fakeAddr) String() string {
	return string(addr)
}

func TestNewLoggerEmitsKubernetesShape(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logger.Info("service ready",
		"service", "storage-write",
		"event", "startup_ready",
		"request_id", "",
	)

	entry := decodeLogEntry(t, out.Bytes())
	for _, key := range []string{"timestamp", "level", "service", "event", "request_id", "message"} {
		if _, ok := entry[key]; !ok {
			t.Fatalf("log entry missing required key %q: %#v", key, entry)
		}
	}
	if entry["level"] != "info" {
		t.Fatalf("level = %#v, want lowercase info", entry["level"])
	}
	if entry["message"] != "service ready" {
		t.Fatalf("message = %#v", entry["message"])
	}
	if _, ok := entry["time"]; ok {
		t.Fatalf("log entry used slog time key: %#v", entry)
	}
	if _, ok := entry["msg"]; ok {
		t.Fatalf("log entry used slog msg key: %#v", entry)
	}
}

func TestNewLoggerSuppressesDebugByDefaultAndAllowsRuntimeDebug(t *testing.T) {
	var out bytes.Buffer
	newLogger(&out).Debug("hot path",
		"service", "storage-write",
		"event", "telemetry_ingest_persisted",
		"request_id", "req-1",
	)
	if out.Len() != 0 {
		t.Fatalf("default logger emitted debug entry: %s", out.String())
	}

	t.Setenv("CLOUDGRID_LOG_LEVEL", "debug")
	newLogger(&out).Debug("hot path",
		"service", "storage-write",
		"event", "telemetry_ingest_persisted",
		"request_id", "req-1",
	)
	entry := decodeLogEntry(t, out.Bytes())
	if entry["level"] != "debug" {
		t.Fatalf("level = %#v, want debug", entry["level"])
	}
}

func TestRunReturnsFailureWhenRequiredConfigIsMissing(t *testing.T) {
	t.Setenv("CLOUDGRID_STORAGE_ADAPTER", "surrealdb")
	t.Setenv("CLOUDGRID_SURREALDB_URL", "")
	t.Setenv("CLOUDGRID_SURREALDB_USERNAME", "")
	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "")

	if got := run(); got != 1 {
		t.Fatalf("run() = %d, want startup failure exit code 1", got)
	}
}

func TestRunReturnsFailureWhenConfiguredAdapterIsNotCompiledIn(t *testing.T) {
	t.Setenv("CLOUDGRID_STORAGE_ADAPTER", "postgres")
	t.Setenv("CLOUDGRID_SURREALDB_URL", "")
	t.Setenv("CLOUDGRID_SURREALDB_USERNAME", "")
	t.Setenv("CLOUDGRID_SURREALDB_PASSWORD", "")

	if got := run(); got != 1 {
		t.Fatalf("run() = %d, want startup failure exit code 1", got)
	}
}

func TestStorageWriteRunWithRuntimeCoversStartupFailureBranches(t *testing.T) {
	baseConfig := func() config.Config {
		return config.Config{
			StorageAdapter: config.AdapterSurrealDB,
			DeploymentMode: "local",
			NATSURL:        "nats://example.test:4222",
			HealthHost:     "127.0.0.1",
			HealthPort:     "0",
			Consumer: config.ConsumerConfig{
				Mode:           "pull",
				PullBatchSize:  10,
				PullMaxWaitMS:  100,
				AckWaitSeconds: 30,
				MaxDeliver:     3,
				MaxAckPending:  100,
				Concurrency:    1,
			},
		}
	}
	adapter := telemetryWriteAdapter{
		Name: "surrealdb",
		Initialize: func(context.Context) error {
			return nil
		},
		CheckReadiness: func(context.Context) error {
			return nil
		},
		Close: func(context.Context) error {
			return nil
		},
	}
	bridge := messageBridgeAdapter{
		RunConsumer: func(context.Context) error {
			select {}
		},
		IsClosed: func() bool {
			return false
		},
		Drain: func() error {
			return nil
		},
		Close: func() {},
	}
	baseRuntime := func() storageWriteRuntime {
		return storageWriteRuntime{
			output: bytes.NewBuffer(nil),
			loadConfig: func() (config.Config, error) {
				return baseConfig(), nil
			},
			newAdapter: func(context.Context, config.Config) (telemetryWriteAdapter, error) {
				return adapter, nil
			},
			newBridge: func(string, ports.TelemetryWriteStore, *slog.Logger, ingest.MetricsRecorder, ingest.TraceLogRecorder, config.ConsumerConfig) (messageBridgeAdapter, error) {
				return bridge, nil
			},
			listen: func(string, string) (net.Listener, error) {
				return failingListener{}, nil
			},
			signalContext: func() (context.Context, context.CancelFunc) {
				return context.WithCancel(context.Background())
			},
		}
	}

	cases := []struct {
		name   string
		mutate func(*storageWriteRuntime)
	}{
		{
			name: "load config",
			mutate: func(runtime *storageWriteRuntime) {
				runtime.loadConfig = func() (config.Config, error) {
					return config.Config{}, errors.New("bad config")
				}
			},
		},
		{
			name: "adapter",
			mutate: func(runtime *storageWriteRuntime) {
				runtime.newAdapter = func(context.Context, config.Config) (telemetryWriteAdapter, error) {
					return telemetryWriteAdapter{}, errors.New("adapter down")
				}
			},
		},
		{
			name: "initialize",
			mutate: func(runtime *storageWriteRuntime) {
				runtime.newAdapter = func(context.Context, config.Config) (telemetryWriteAdapter, error) {
					failed := adapter
					failed.Initialize = func(context.Context) error {
						return errors.New("schema down")
					}
					return failed, nil
				}
			},
		},
		{
			name: "bridge",
			mutate: func(runtime *storageWriteRuntime) {
				runtime.newBridge = func(string, ports.TelemetryWriteStore, *slog.Logger, ingest.MetricsRecorder, ingest.TraceLogRecorder, config.ConsumerConfig) (messageBridgeAdapter, error) {
					return messageBridgeAdapter{}, errors.New("bridge down")
				}
			},
		},
		{
			name: "listen",
			mutate: func(runtime *storageWriteRuntime) {
				runtime.listen = func(string, string) (net.Listener, error) {
					return nil, errors.New("bind failed")
				}
			},
		},
		{
			name:   "serve",
			mutate: func(runtime *storageWriteRuntime) {},
		},
		{
			name: "consumer",
			mutate: func(runtime *storageWriteRuntime) {
				runtime.newBridge = func(string, ports.TelemetryWriteStore, *slog.Logger, ingest.MetricsRecorder, ingest.TraceLogRecorder, config.ConsumerConfig) (messageBridgeAdapter, error) {
					failed := bridge
					failed.RunConsumer = func(context.Context) error {
						return errors.New("consumer down")
					}
					runtime.listen = func(string, string) (net.Listener, error) {
						return blockingListener{done: make(chan struct{})}, nil
					}
					return failed, nil
				}
			},
		},
	}

	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			runtime := baseRuntime()
			test.mutate(&runtime)
			if got := runWithRuntime(runtime); got != 1 {
				t.Fatalf("runWithRuntime() = %d, want failure", got)
			}
		})
	}
}

func TestStorageWriteRunWithRuntimeCoversGracefulSignalShutdown(t *testing.T) {
	var output bytes.Buffer
	drained := false
	cfg := config.Config{
		StorageAdapter: config.AdapterSurrealDB,
		DeploymentMode: "local",
		NATSURL:        "nats://example.test:4222",
		HealthHost:     "127.0.0.1",
		HealthPort:     "0",
		Consumer: config.ConsumerConfig{
			Mode:           "pull",
			PullBatchSize:  10,
			PullMaxWaitMS:  100,
			AckWaitSeconds: 30,
			MaxDeliver:     3,
			MaxAckPending:  100,
			Concurrency:    1,
		},
	}
	runtime := storageWriteRuntime{
		output: &output,
		loadConfig: func() (config.Config, error) {
			return cfg, nil
		},
		newAdapter: func(context.Context, config.Config) (telemetryWriteAdapter, error) {
			return telemetryWriteAdapter{
				Name:           "surrealdb",
				Initialize:     func(context.Context) error { return nil },
				CheckReadiness: func(context.Context) error { return nil },
				Close:          func(context.Context) error { return nil },
			}, nil
		},
		newBridge: func(string, ports.TelemetryWriteStore, *slog.Logger, ingest.MetricsRecorder, ingest.TraceLogRecorder, config.ConsumerConfig) (messageBridgeAdapter, error) {
			return messageBridgeAdapter{
				RunConsumer: func(context.Context) error {
					select {}
				},
				IsClosed: func() bool { return false },
				Drain: func() error {
					drained = true
					return nil
				},
				Close: func() {},
			}, nil
		},
		listen: func(string, string) (net.Listener, error) {
			return blockingListener{done: make(chan struct{})}, nil
		},
		signalContext: func() (context.Context, context.CancelFunc) {
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			return ctx, func() {}
		},
	}

	if got := runWithRuntime(runtime); got != 0 {
		t.Fatalf("runWithRuntime() = %d, want graceful shutdown", got)
	}
	if !drained {
		t.Fatal("runWithRuntime() did not drain the message bridge")
	}
	logs := output.String()
	if !strings.Contains(logs, `"event":"shutdown_started"`) || !strings.Contains(logs, `"event":"shutdown_completed"`) {
		t.Fatalf("shutdown logs missing start or completion event: %s", logs)
	}
}

func TestStorageWriteRunWithRuntimeCoversExpectedHealthStopAndCanceledConsumer(t *testing.T) {
	cfg := config.Config{
		StorageAdapter: config.AdapterSurrealDB,
		DeploymentMode: "local",
		NATSURL:        "nats://example.test:4222",
		HealthHost:     "127.0.0.1",
		HealthPort:     "0",
		Consumer:       config.ConsumerConfig{Mode: "pull", PullBatchSize: 10, PullMaxWaitMS: 100, AckWaitSeconds: 30, MaxDeliver: 3, MaxAckPending: 100, Concurrency: 1},
	}
	baseRuntime := func() storageWriteRuntime {
		return storageWriteRuntime{
			output: bytes.NewBuffer(nil),
			loadConfig: func() (config.Config, error) {
				return cfg, nil
			},
			newAdapter: func(context.Context, config.Config) (telemetryWriteAdapter, error) {
				return telemetryWriteAdapter{
					Name:           "surrealdb",
					Initialize:     func(context.Context) error { return nil },
					CheckReadiness: func(context.Context) error { return nil },
					Close:          func(context.Context) error { return nil },
				}, nil
			},
			newBridge: func(string, ports.TelemetryWriteStore, *slog.Logger, ingest.MetricsRecorder, ingest.TraceLogRecorder, config.ConsumerConfig) (messageBridgeAdapter, error) {
				return messageBridgeAdapter{
					RunConsumer: func(context.Context) error { select {} },
					IsClosed:    func() bool { return false },
					Drain:       func() error { return nil },
					Close:       func() {},
				}, nil
			},
			signalContext: func() (context.Context, context.CancelFunc) {
				return context.WithCancel(context.Background())
			},
		}
	}

	t.Run("health stop", func(t *testing.T) {
		runtime := baseRuntime()
		runtime.listen = func(string, string) (net.Listener, error) {
			return expectedStopListener{}, nil
		}
		if got := runWithRuntime(runtime); got != 0 {
			t.Fatalf("runWithRuntime() = %d, want expected health stop", got)
		}
	})

	t.Run("consumer canceled", func(t *testing.T) {
		runtime := baseRuntime()
		runtime.listen = func(string, string) (net.Listener, error) {
			return blockingListener{done: make(chan struct{})}, nil
		}
		runtime.newBridge = func(string, ports.TelemetryWriteStore, *slog.Logger, ingest.MetricsRecorder, ingest.TraceLogRecorder, config.ConsumerConfig) (messageBridgeAdapter, error) {
			return messageBridgeAdapter{
				RunConsumer: func(context.Context) error { return context.Canceled },
				IsClosed:    func() bool { return false },
				Drain:       func() error { return nil },
				Close:       func() {},
			}, nil
		}
		if got := runWithRuntime(runtime); got != 0 {
			t.Fatalf("runWithRuntime() = %d, want canceled consumer shutdown", got)
		}
	})
}

func TestNewTelemetryWriteAdapterRejectsUncompiledAdapterName(t *testing.T) {
	_, err := newTelemetryWriteAdapter(context.Background(), config.Config{StorageAdapter: "postgres"})
	if err == nil {
		t.Fatal("newTelemetryWriteAdapter() error = nil")
	}
	if !strings.Contains(err.Error(), "storage-write binary was built with adapter") {
		t.Fatalf("newTelemetryWriteAdapter() error = %v", err)
	}
}

func TestStorageWriteHealthServerUsesConfiguredAddressAndTimeout(t *testing.T) {
	server := storageWriteHealthServer(config.Config{
		HealthHost: "127.0.0.1",
		HealthPort: "18082",
	}, http.NewServeMux())

	if server.Addr != "127.0.0.1:18082" {
		t.Fatalf("Addr = %q, want configured host and port", server.Addr)
	}
	if server.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout = %s, want 5s", server.ReadHeaderTimeout)
	}
}

func TestStorageWriteHealthChecksReportBridgeAndAdapterReadiness(t *testing.T) {
	var readinessCalls int
	checks := storageWriteHealthChecks(messageBridgeAdapter{
		IsClosed: func() bool { return false },
	}, telemetryWriteAdapter{
		Name: "surrealdb",
		CheckReadiness: func(context.Context) error {
			readinessCalls++
			return nil
		},
	})(context.Background())

	assertHealthCheckAvailable(t, checks["nats"])
	assertHealthCheckAvailable(t, checks["surrealdb"])
	if readinessCalls != 1 {
		t.Fatalf("readiness calls = %d, want 1", readinessCalls)
	}
}

func TestStorageWriteHealthChecksUseFallbackStorageNameAndUnavailableStates(t *testing.T) {
	checks := storageWriteHealthChecks(messageBridgeAdapter{
		IsClosed: func() bool { return true },
	}, telemetryWriteAdapter{
		CheckReadiness: func(context.Context) error {
			return errors.New("provider down")
		},
	})(context.Background())

	assertHealthCheckUnavailable(t, checks["nats"], "ERR-013")
	assertHealthCheckUnavailable(t, checks["storage"], "ERR-006")
	if _, ok := checks[""]; ok {
		t.Fatalf("checks included empty adapter name: %#v", checks)
	}
}

func TestConsumerOptionsMapsConfigDurationsAndLimits(t *testing.T) {
	options := consumerOptions(config.ConsumerConfig{
		PullBatchSize:  7,
		PullMaxWaitMS:  250,
		AckWaitSeconds: 30,
		MaxDeliver:     5,
		MaxAckPending:  99,
		Concurrency:    3,
		Mode:           "pull",
	})

	if options.PullBatchSize != 7 ||
		options.PullMaxWait != 250*time.Millisecond ||
		options.AckWait != 30*time.Second ||
		options.MaxDeliver != 5 ||
		options.MaxAckPending != 99 ||
		options.Concurrency != 3 ||
		options.ConsumerMode != "pull" {
		t.Fatalf("consumer options = %#v, want mapped config", options)
	}
}

func TestNewMessageBridgeAdapterReturnsErrorForInvalidNATSURL(t *testing.T) {
	_, err := newMessageBridgeAdapterWithSelfObservability("://not-a-url", nil, newLogger(&bytes.Buffer{}), nil, nil, config.ConsumerConfig{})
	if err == nil {
		t.Fatal("newMessageBridgeAdapterWithSelfObservability() error = nil")
	}
}

func TestStorageWriteSelfObservabilityExporterHelpersRespectSignalConfiguration(t *testing.T) {
	logger := newLogger(&bytes.Buffer{})
	base := config.Config{
		DeploymentMode: "local",
		SelfObservability: config.SelfObservabilityConfig{
			Enabled:               true,
			ProjectID:             "cloudgrid-system",
			CompanyID:             "local",
			OTLPEndpoint:          "http://localhost:4318",
			ExportIntervalSeconds: 300,
		},
	}

	metrics, err := storageWriteSelfObservabilityMetricsExporter(base, logger)
	if err != nil {
		t.Fatalf("metrics helper error = %v", err)
	}
	if metrics != nil {
		t.Fatal("metrics helper returned exporter when metrics signal is disabled")
	}
	tracesLogs, err := storageWriteSelfObservabilityTraceLogExporter(base, logger)
	if err != nil {
		t.Fatalf("trace/log helper error = %v", err)
	}
	if tracesLogs != nil {
		t.Fatal("trace/log helper returned exporter when trace and log signals are disabled")
	}

	base.SelfObservability.MetricsEnabled = true
	metrics, err = storageWriteSelfObservabilityMetricsExporter(base, logger)
	if err != nil {
		t.Fatalf("metrics helper with enabled metrics error = %v", err)
	}
	if metrics == nil {
		t.Fatal("metrics helper returned nil when metrics signal is enabled")
	}
	_ = metrics.Shutdown(context.Background())

	base.SelfObservability.MetricsEnabled = false
	base.SelfObservability.LogsEnabled = true
	tracesLogs, err = storageWriteSelfObservabilityTraceLogExporter(base, logger)
	if err != nil {
		t.Fatalf("trace/log helper with enabled logs error = %v", err)
	}
	if tracesLogs == nil {
		t.Fatal("trace/log helper returned nil when logs are enabled")
	}
	_ = tracesLogs.Shutdown(context.Background())
}

func TestStorageWriteSelfObservabilityExporterHelpersRejectInvalidEndpointWhenEnabled(t *testing.T) {
	logger := newLogger(&bytes.Buffer{})
	cfg := config.Config{
		DeploymentMode: "local",
		SelfObservability: config.SelfObservabilityConfig{
			Enabled:               true,
			ProjectID:             "cloudgrid-system",
			CompanyID:             "local",
			OTLPEndpoint:          "://bad",
			ExportIntervalSeconds: 300,
			MetricsEnabled:        true,
			LogsEnabled:           true,
		},
	}

	if _, err := storageWriteSelfObservabilityMetricsExporter(cfg, logger); err == nil {
		t.Fatal("metrics helper error = nil for invalid endpoint")
	}
	if _, err := storageWriteSelfObservabilityTraceLogExporter(cfg, logger); err == nil {
		t.Fatal("trace/log helper error = nil for invalid endpoint")
	}
}

func TestLogErrorMapsErrorTaxonomyAndSanitizesProviderError(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logError(logger, "startup_storage_unavailable", errors.New("ERR-006 STORAGE_UNAVAILABLE: SurrealDB rejected password=secret"), "req-123", "ERR-006")

	entry := decodeLogEntry(t, out.Bytes())
	if entry["level"] != "error" {
		t.Fatalf("level = %#v, want error", entry["level"])
	}
	if entry["request_id"] != "req-123" {
		t.Fatalf("request_id = %#v, want req-123", entry["request_id"])
	}
	if entry["error_id"] != "ERR-006" {
		t.Fatalf("error_id = %#v, want ERR-006", entry["error_id"])
	}
	if entry["error_code"] != "STORAGE_UNAVAILABLE" {
		t.Fatalf("error_code = %#v, want STORAGE_UNAVAILABLE", entry["error_code"])
	}
	if entry["message"] != "storage is unavailable" {
		t.Fatalf("message = %#v", entry["message"])
	}
	encoded := string(out.Bytes())
	if strings.Contains(encoded, "password=secret") || strings.Contains(encoded, "SurrealDB rejected") {
		t.Fatalf("log leaked provider error: %s", encoded)
	}
}

func TestLogErrorIncludesRuntimeBindFailureDetail(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logError(logger, "health_server_bind_failed", errors.New("listen tcp :8082: bind: address already in use"), "", "ERR-010", "health_addr", "0.0.0.0:8082")

	entry := decodeLogEntry(t, out.Bytes())
	if entry["error_id"] != "ERR-010" {
		t.Fatalf("error_id = %#v, want ERR-010", entry["error_id"])
	}
	if entry["message"] != "listen tcp :8082: bind: address already in use" {
		t.Fatalf("message = %#v, want bind failure detail", entry["message"])
	}
	if entry["health_addr"] != "0.0.0.0:8082" {
		t.Fatalf("health_addr = %#v", entry["health_addr"])
	}
}

func TestLogErrorDerivesFallbackCodeWhenNotProvided(t *testing.T) {
	var out bytes.Buffer
	logger := newLogger(&out)

	logError(logger, "startup_config_invalid", errors.New("ERR-009 CONFIG_INVALID: missing"), "req-1", "")

	entry := decodeLogEntry(t, out.Bytes())
	if entry["request_id"] != "req-1" {
		t.Fatalf("request_id = %#v, want req-1", entry["request_id"])
	}
	if entry["error_id"] != "ERR-009" || entry["error_code"] != "CONFIG_INVALID" {
		t.Fatalf("derived error fields = %#v", entry)
	}
	if entry["message"] != "ERR-009 CONFIG_INVALID: missing" {
		t.Fatalf("message = %#v", entry["message"])
	}
}

func TestSafeErrorMessageAllowsOnlyOperatorActionableDetails(t *testing.T) {
	tests := []struct {
		name string
		err  error
		code string
		want string
	}{
		{name: "nil error", err: nil, code: "ERR-006", want: ""},
		{name: "config error", err: errors.New("ERR-009 CONFIG_INVALID: missing nats url"), code: "ERR-009", want: "ERR-009 CONFIG_INVALID: missing nats url"},
		{name: "validation error", err: errors.New("ERR-001 VALIDATION_FAILED: invalid command"), code: "ERR-001", want: "ERR-001 VALIDATION_FAILED: invalid command"},
		{name: "message bridge error", err: errors.New("nats: authorization violation token=secret"), code: "ERR-013", want: "message bridge is unavailable"},
		{name: "runtime composition error", err: errors.New("listen tcp :8082: bind: address already in use"), code: "ERR-010", want: "listen tcp :8082: bind: address already in use"},
		{name: "provider storage error", err: errors.New("surrealdb password=secret"), code: "ERR-006", want: "storage is unavailable"},
		{name: "unknown error code defaults to storage message", err: errors.New("provider leaked detail"), code: "ERR-999", want: "storage is unavailable"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := safeErrorMessage(test.err, test.code); got != test.want {
				t.Fatalf("safeErrorMessage() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestErrorIDFromErrorRecognizesStorageWriteTaxonomyPrefixes(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{name: "nil error", err: nil, want: ""},
		{name: "config", err: errors.New("ERR-009 CONFIG_INVALID: missing"), want: "ERR-009"},
		{name: "validation", err: errors.New("ERR-001 VALIDATION_FAILED: bad"), want: "ERR-001"},
		{name: "fallback", err: errors.New("plain provider failure"), want: "ERR-006"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := errorIDFromError(test.err); got != test.want {
				t.Fatalf("errorIDFromError() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestErrorCodeForIDMapsKnownAndUnknownIDs(t *testing.T) {
	tests := map[string]string{
		"ERR-001": "VALIDATION_FAILED",
		"ERR-006": "STORAGE_UNAVAILABLE",
		"ERR-009": "CONFIG_INVALID",
		"ERR-010": "RUNTIME_COMPOSITION_FAILED",
		"ERR-013": "MESSAGE_BRIDGE_UNAVAILABLE",
		"ERR-999": "STORAGE_UNAVAILABLE",
	}

	for id, want := range tests {
		if got := errorCodeForID(id); got != want {
			t.Fatalf("errorCodeForID(%q) = %q, want %q", id, got, want)
		}
	}
}

func decodeLogEntry(t *testing.T, data []byte) map[string]any {
	t.Helper()
	var entry map[string]any
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("log entry is not JSON: %v\n%s", err, string(data))
	}
	return entry
}

func assertHealthCheckAvailable(t *testing.T, check health.Check) {
	t.Helper()
	if check.Status != "ok" {
		t.Fatalf("health check = %#v, want available", check)
	}
}

func assertHealthCheckUnavailable(t *testing.T, check health.Check, errorID string) {
	t.Helper()
	if check.Status != "unavailable" || check.Error == nil || check.Error.Error.ID != errorID {
		t.Fatalf("health check = %#v, want unavailable %s", check, errorID)
	}
}
