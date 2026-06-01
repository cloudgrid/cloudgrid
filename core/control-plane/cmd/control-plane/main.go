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

	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal"
	secretsurreal "github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/adapters/secrets/surrealdb"
	controlsurreal "github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/adapters/surrealdb"
	"github.com/cloudgrid-dev/cloudgrid/core/control-plane/internal/ports"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/health"
	"github.com/cloudgrid-dev/cloudgrid/core/go-runtime/selfobs"
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
	defaultSecretStoreAdapter  = "surrealdb"
	defaultSecretDBNamespace   = "cloudgrid_secrets"
	defaultSecretDBDatabase    = "dev"
	localSecretEncryptionKey   = "cloudgrid-local-development-secret-store-key"
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

	secretStore, secretAdapter, secretReadiness, secretClose, err := setupSecretStore(context.Background())
	if err != nil {
		logError(logger, "secret_store_unavailable", err, "ERR-006")
		return 1
	}
	defer func() {
		if secretClose != nil {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), storeReadinessTimeout)
			defer cancel()
			if err := secretClose(shutdownCtx); err != nil {
				logError(logger, "secret_store_shutdown_failed", err, "ERR-010")
			}
		}
	}()

	invitationEmailConfig, err := resolveInvitationEmailConfig(os.Getenv)
	if err != nil {
		logError(logger, "invitation_email_config_invalid", err, "ERR-009")
		return 1
	}
	var invitationEmailTransport internal.InvitationEmailTransport
	if invitationEmailConfig.Mode == internal.InvitationEmailModeSMTP {
		invitationEmailTransport = internal.NewSMTPInvitationEmailTransport(invitationEmailConfig)
	}
	service := internal.NewServiceWithOptions(store, time.Now, internal.ServiceOptions{
		InvitationEmail:           invitationEmailConfig,
		EmailTransport:            invitationEmailTransport,
		AlertNotificationAdapters: splitCSV(os.Getenv("CLOUDGRID_ALERT_NOTIFICATION_ADAPTERS")),
		SecretStore:               secretStore,
	})
	stopInvitationEmailWorker := startInvitationEmailWorker(service, invitationEmailConfig, logger)
	defer stopInvitationEmailWorker()
	if err := validateSelfObservabilityProjectConfig(context.Background(), store); err != nil {
		logError(logger, "self_observability_config_invalid", err, "ERR-009")
		return 1
	}
	signalExporter, err := controlPlaneSelfObservabilitySignalExporter(os.Getenv, logger)
	if err != nil {
		logError(logger, "self_observability_config_invalid", err, "ERR-009")
		return 1
	}
	if signalExporter != nil {
		defer func() {
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			_ = signalExporter.Shutdown(shutdownCtx)
		}()
		selfConfig, err := resolveControlPlaneSelfObservabilityConfig(os.Getenv)
		if err != nil {
			logError(logger, "self_observability_config_invalid", err, "ERR-009")
			return 1
		}
		if selfConfig.DBAdapterTracingEnabled && selfConfig.Enabled && selfConfig.TracesEnabled {
			if tracer, ok := store.(interface{ EnableDBAdapterTracing(selfobs.SpanRecorder) }); ok {
				tracer.EnableDBAdapterTracing(controlPlaneDBAdapterSpanRecorder{recorder: signalExporter})
			}
		}
	}
	nc, err := internal.ConnectNATS(valueOrDefault(os.Getenv("CLOUDGRID_NATS_URL"), defaultNATSURL))
	if err != nil {
		logError(logger, "message_bridge_unavailable", err, "ERR-013")
		return 1
	}
	defer nc.Close()

	if _, err := internal.SubscribeControlHandlersWithOptions(nc, service, logger, internal.ControlHandlerOptions{SelfObservability: signalExporter}); err != nil {
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
		if err := validateSelfObservabilityProjectConfig(ctx, store); err != nil {
			checks["self-observability"] = health.Unavailable("ERR-009", "CONFIG_INVALID", "self-observability configuration is invalid")
		} else {
			checks["self-observability"] = health.OK()
		}
		if err := secretReadiness(ctx); err != nil {
			checks["secret-store"] = health.Unavailable("ERR-006", "STORAGE_UNAVAILABLE", "secret store is unavailable")
		} else {
			checks["secret-store"] = health.OK()
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
		"secret_adapter", secretAdapter,
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

func startInvitationEmailWorker(service *internal.Service, config internal.InvitationEmailConfig, logger *slog.Logger) func() {
	if config.Mode != internal.InvitationEmailModeSMTP {
		return func() {}
	}
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			_, err := service.ProcessDueInvitationEmails(ctx, 25)
			if err != nil {
				logError(logger, "invitation_email_delivery_failed", err, "ERR-022")
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
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
	case "ERR-009":
		return "CONFIG_INVALID"
	case "ERR-010":
		return "RUNTIME_COMPOSITION_FAILED"
	case "ERR-013":
		return "MESSAGE_BRIDGE_UNAVAILABLE"
	case "ERR-022":
		return "INVITATION_EMAIL_DELIVERY_FAILED"
	default:
		return "RUNTIME_COMPOSITION_FAILED"
	}
}

type selfObservabilityProjectReader interface {
	GetProject(ctx context.Context, projectID string) (ports.ProjectRecord, bool, error)
}

func validateSelfObservabilityProjectConfig(ctx context.Context, store selfObservabilityProjectReader) error {
	mode := strings.ToLower(valueOrDefault(os.Getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local"))
	enabled, err := selfObservabilityEnabled(mode, os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED"))
	if err != nil {
		return err
	}
	if mode != "deployed" || !enabled {
		return nil
	}
	companyID := strings.TrimSpace(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID"))
	projectID := strings.TrimSpace(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID"))
	endpoint := strings.TrimSpace(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT"))
	token := strings.TrimSpace(os.Getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN"))
	if companyID == "" || projectID == "" || endpoint == "" || token == "" {
		return configInvalidError("deployed self-observability requires company ID, project ID, OTLP endpoint, and bearer token")
	}
	project, ok, err := store.GetProject(ctx, projectID)
	if err != nil {
		return err
	}
	if !ok || project.OrganizationID != companyID {
		return configInvalidError("self-observability project does not exist in the configured company")
	}
	return nil
}

func resolveInvitationEmailConfig(getenv func(string) string) (internal.InvitationEmailConfig, error) {
	mode := strings.ToLower(valueOrDefault(getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local"))
	authMode := strings.ToLower(valueOrDefault(getenv("CLOUDGRID_AUTH_MODE"), "local"))
	config := internal.DefaultInvitationEmailConfig()
	config.Mode = internal.InvitationEmailMode(strings.ToLower(strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_MODE"))))
	if config.Mode == "" {
		if mode == "deployed" && authMode == "sso" {
			config.Mode = internal.InvitationEmailModeSMTP
		} else {
			config.Mode = internal.InvitationEmailModeDisabled
		}
	}
	requireDefault := mode == "deployed" && authMode == "sso"
	requireDelivery, err := invitationEmailBool(getenv("CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY"), requireDefault, "CLOUDGRID_INVITATION_EMAIL_REQUIRE_DELIVERY")
	if err != nil {
		return internal.InvitationEmailConfig{}, err
	}
	config.RequireDelivery = requireDelivery
	config.PublicURL = strings.TrimSpace(getenv("CLOUDGRID_PUBLIC_URL"))
	config.From = strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_FROM"))
	config.ReplyTo = strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_REPLY_TO"))
	config.SMTPHost = strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_SMTP_HOST"))
	config.SMTPPort = strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_SMTP_PORT"))
	config.SMTPUsername = strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_SMTP_USERNAME"))
	config.SMTPPassword = getenv("CLOUDGRID_INVITATION_EMAIL_SMTP_PASSWORD")
	if value := strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_SMTP_TLS")); value != "" {
		config.SMTPTLS = internal.InvitationEmailTLSMode(strings.ToLower(value))
	}
	if value := strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_SMTP_TIMEOUT_MS")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return internal.InvitationEmailConfig{}, configInvalidError("CLOUDGRID_INVITATION_EMAIL_SMTP_TIMEOUT_MS must be an integer")
		}
		config.SMTPTimeout = time.Duration(parsed) * time.Millisecond
	}
	if value := strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_MAX_ATTEMPTS")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return internal.InvitationEmailConfig{}, configInvalidError("CLOUDGRID_INVITATION_EMAIL_MAX_ATTEMPTS must be an integer")
		}
		config.MaxAttempts = parsed
	}
	if value := strings.TrimSpace(getenv("CLOUDGRID_INVITATION_EMAIL_RETRY_BASE_SECONDS")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil {
			return internal.InvitationEmailConfig{}, configInvalidError("CLOUDGRID_INVITATION_EMAIL_RETRY_BASE_SECONDS must be an integer")
		}
		config.RetryBase = time.Duration(parsed) * time.Second
	}
	if err := config.Validate(); err != nil {
		return internal.InvitationEmailConfig{}, err
	}
	return config, nil
}

func invitationEmailBool(value string, fallback bool, name string) (bool, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "":
		return fallback, nil
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, configInvalidError(name + " must be true or false")
	}
}

func selfObservabilityEnabled(mode string, value string) (bool, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "":
		return mode == "local", nil
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, configInvalidError("CLOUDGRID_SELF_OBSERVABILITY_ENABLED must be true or false")
	}
}

func configInvalidError(reason string) error {
	return errors.New("ERR-009 CONFIG_INVALID: " + reason)
}

type controlPlaneSelfObservabilityConfig struct {
	Enabled                 bool
	CompanyID               string
	ProjectID               string
	OTLPEndpoint            string
	OTLPBearerToken         string
	ExportIntervalSeconds   int
	TracesEnabled           bool
	LogsEnabled             bool
	DBAdapterTracingEnabled bool
}

func controlPlaneSelfObservabilitySignalExporter(getenv func(string) string, logger *slog.Logger) (*internal.SelfObservabilitySignalExporter, error) {
	config, err := resolveControlPlaneSelfObservabilityConfig(getenv)
	if err != nil {
		return nil, err
	}
	if !config.Enabled || (!config.TracesEnabled && !config.LogsEnabled) {
		return nil, nil
	}
	mode := strings.ToLower(valueOrDefault(getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local"))
	return internal.NewSelfObservabilitySignalExporter(internal.SelfObservabilitySignalExporterConfig{
		Enabled:               true,
		Endpoint:              config.OTLPEndpoint,
		BearerToken:           config.OTLPBearerToken,
		ExportIntervalSeconds: config.ExportIntervalSeconds,
		ServiceName:           "cloudgrid.control_plane",
		DeploymentMode:        mode,
		CompanyID:             config.CompanyID,
		ProjectID:             config.ProjectID,
		TracesEnabled:         config.TracesEnabled,
		LogsEnabled:           config.LogsEnabled,
		Logger:                logger,
	})
}

type controlPlaneDBAdapterSpanRecorder struct {
	recorder internal.SelfObservabilityRecorder
}

func (recorder controlPlaneDBAdapterSpanRecorder) RecordSpan(event selfobs.SpanEvent) {
	if recorder.recorder == nil {
		return
	}
	recorder.recorder.RecordSpan(internal.SelfObservabilitySpan{
		Name:         event.Name,
		TraceID:      event.TraceID,
		SpanID:       event.SpanID,
		ParentSpanID: event.ParentSpanID,
		TraceState:   event.TraceState,
		Attributes:   event.Attributes,
		StartTime:    event.StartTime,
		EndTime:      event.EndTime,
	})
}

func resolveControlPlaneSelfObservabilityConfig(getenv func(string) string) (controlPlaneSelfObservabilityConfig, error) {
	mode := strings.ToLower(valueOrDefault(getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local"))
	enabled, err := selfObservabilityBool(getenv("CLOUDGRID_SELF_OBSERVABILITY_ENABLED"), mode == "local")
	if err != nil {
		return controlPlaneSelfObservabilityConfig{}, configInvalidError("CLOUDGRID_SELF_OBSERVABILITY_ENABLED must be true or false")
	}
	interval, err := selfObservabilityInterval(getenv("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS"))
	if err != nil {
		return controlPlaneSelfObservabilityConfig{}, err
	}
	config := controlPlaneSelfObservabilityConfig{
		Enabled:               enabled,
		CompanyID:             strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID")),
		ProjectID:             strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID")),
		OTLPEndpoint:          strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_ENDPOINT")),
		OTLPBearerToken:       strings.TrimSpace(getenv("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN")),
		ExportIntervalSeconds: interval,
	}
	if mode == "local" {
		if config.CompanyID == "" {
			config.CompanyID = internal.LocalCompanyID
		}
		if config.ProjectID == "" {
			config.ProjectID = internal.LocalSelfObservabilityProjectID
		}
		if config.OTLPEndpoint == "" {
			config.OTLPEndpoint = "http://localhost:4318"
		}
	}
	config.TracesEnabled, err = selfObservabilityBool(getenv("CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED"), enabled)
	if err != nil {
		return controlPlaneSelfObservabilityConfig{}, configInvalidError("CLOUDGRID_SELF_OBSERVABILITY_TRACES_ENABLED must be true or false")
	}
	config.LogsEnabled, err = selfObservabilityBool(getenv("CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED"), enabled)
	if err != nil {
		return controlPlaneSelfObservabilityConfig{}, configInvalidError("CLOUDGRID_SELF_OBSERVABILITY_LOGS_ENABLED must be true or false")
	}
	config.DBAdapterTracingEnabled, err = selfObservabilityBool(getenv("CLOUDGRID_DB_ADAPTER_TRACING_ENABLED"), false)
	if err != nil {
		return controlPlaneSelfObservabilityConfig{}, configInvalidError("CLOUDGRID_DB_ADAPTER_TRACING_ENABLED must be true or false")
	}
	if mode == "deployed" && config.DBAdapterTracingEnabled {
		return controlPlaneSelfObservabilityConfig{}, configInvalidError("CLOUDGRID_DB_ADAPTER_TRACING_ENABLED is valid only in local mode")
	}
	if !enabled {
		config.TracesEnabled = false
		config.LogsEnabled = false
	}
	if mode == "deployed" && enabled && (config.CompanyID == "" || config.ProjectID == "" || config.OTLPEndpoint == "" || config.OTLPBearerToken == "") {
		return controlPlaneSelfObservabilityConfig{}, configInvalidError("deployed self-observability requires company ID, project ID, OTLP endpoint, and bearer token")
	}
	if mode == "local" && enabled && config.OTLPBearerToken == "" {
		return controlPlaneSelfObservabilityConfig{}, configInvalidError("CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN is required when self-observability is enabled")
	}
	return config, nil
}

func selfObservabilityBool(value string, fallback bool) (bool, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	switch value {
	case "":
		return fallback, nil
	case "true":
		return true, nil
	case "false":
		return false, nil
	default:
		return false, configInvalidError("boolean value must be true or false")
	}
}

func selfObservabilityInterval(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 10, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 || parsed > 300 {
		return 0, configInvalidError("CLOUDGRID_SELF_OBSERVABILITY_EXPORT_INTERVAL_SECONDS must be an integer between 1 and 300")
	}
	return parsed, nil
}

func valueOrDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
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

type controlStoreReadiness func(context.Context) error

type controlStoreClose func(context.Context) error

type secretStoreReadiness func(context.Context) error

type secretStoreClose func(context.Context) error

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

func setupSecretStore(ctx context.Context) (ports.SecretStore, string, secretStoreReadiness, secretStoreClose, error) {
	adapter := valueOrDefault(os.Getenv("CLOUDGRID_SECRET_STORE_ADAPTER"), defaultSecretStoreAdapter)
	if adapter != "surrealdb" {
		return nil, "", nil, nil, configInvalidError("CLOUDGRID_SECRET_STORE_ADAPTER must be surrealdb")
	}
	cfg, err := secretSurrealDBConfig()
	if err != nil {
		return nil, "", nil, nil, err
	}
	initCtx, cancel := context.WithTimeout(ctx, storeInitializationTimeout)
	defer cancel()
	store, err := secretsurreal.Connect(initCtx, cfg)
	if err != nil {
		return nil, "", nil, nil, err
	}
	if err := store.CheckReadiness(initCtx); err != nil {
		_ = store.Close(context.Background())
		return nil, "", nil, nil, err
	}
	readiness := func(ctx context.Context) error {
		checkCtx, cancel := context.WithTimeout(ctx, storeReadinessTimeout)
		defer cancel()
		return store.CheckReadiness(checkCtx)
	}
	return store, adapter, readiness, store.Close, nil
}

func secretSurrealDBConfig() (secretsurreal.Config, error) {
	key := strings.TrimSpace(os.Getenv("CLOUDGRID_SECRET_STORE_ENCRYPTION_KEY"))
	if key == "" {
		key = strings.TrimSpace(os.Getenv("CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY"))
	}
	mode := strings.ToLower(valueOrDefault(os.Getenv("CLOUDGRID_DEPLOYMENT_MODE"), "local"))
	if key == "" {
		if mode == "deployed" {
			return secretsurreal.Config{}, configInvalidError("CLOUDGRID_SECRET_STORE_ENCRYPTION_KEY is required in deployed mode")
		}
		key = localSecretEncryptionKey
	}
	return secretsurreal.Config{
		URL:           valueOrDefault(os.Getenv("CLOUDGRID_SECRET_STORE_SURREALDB_URL"), valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_URL"), defaultSurrealDBURL)),
		Namespace:     valueOrDefault(os.Getenv("CLOUDGRID_SECRET_STORE_SURREALDB_NAMESPACE"), defaultSecretDBNamespace),
		Database:      valueOrDefault(os.Getenv("CLOUDGRID_SECRET_STORE_SURREALDB_DATABASE"), defaultSecretDBDatabase),
		Username:      valueOrDefault(os.Getenv("CLOUDGRID_SECRET_STORE_SURREALDB_USERNAME"), valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_USERNAME"), defaultSurrealDBUsername)),
		Password:      valueOrDefault(os.Getenv("CLOUDGRID_SECRET_STORE_SURREALDB_PASSWORD"), valueOrDefault(os.Getenv("CLOUDGRID_SURREALDB_PASSWORD"), defaultSurrealDBPassword)),
		EncryptionKey: key,
	}, nil
}
