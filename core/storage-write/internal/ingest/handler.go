package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-write/internal/ports"
)

const (
	StreamName            = "TELEMETRY_INGEST"
	ConsumerName          = "storage-write"
	TraceSubject          = "telemetry.ingest.traces"
	LogSubject            = "telemetry.ingest.logs"
	MetricSubject         = "telemetry.ingest.metrics"
	PersistedTraceSubject = "telemetry.persisted.traces"
	MaxDeliveryAdvisory   = "$JS.EVENT.ADVISORY.CONSUMER.MAX_DELIVERIES.TELEMETRY_INGEST.storage-write"
	MaxInFlight           = 16
	storageWriteService   = "storage-write"
	validationErrorID     = "ERR-001"
	validationErrorCode   = "VALIDATION_FAILED"
	storageErrorID        = "ERR-006"
	storageErrorCode      = "STORAGE_UNAVAILABLE"
	bridgeErrorID         = "ERR-013"
	bridgeErrorCode       = "MESSAGE_BRIDGE_UNAVAILABLE"
)

var (
	AckWait    = 30 * time.Second
	MaxAge     = 7 * 24 * time.Hour
	MaxDeliver = 5
)

type Message interface {
	Subject() string
	Data() []byte
	Attempt() int
	Ack() error
	NakWithDelay(delay time.Duration) error
}

func HandleMessage(ctx context.Context, msg Message, store ports.TelemetryWriteStore, publisher ports.TraceNotificationPublisher, logger *slog.Logger, now func() time.Time) {
	HandleMessageWithMetrics(ctx, msg, store, publisher, logger, now, nil)
}

func HandleMessageWithMetrics(ctx context.Context, msg Message, store ports.TelemetryWriteStore, publisher ports.TraceNotificationPublisher, logger *slog.Logger, now func() time.Time, recorder MetricsRecorder) {
	recorder = metricsRecorderOrNoop(recorder)
	start := now()
	subject := msg.Subject()
	attempt := msg.Attempt()
	signal := signalForSubject(subject)
	result := "error"
	defer func() {
		recordPersistCommandMetrics(recorder, signal, result, now().Sub(start))
	}()

	if subject == MetricSubject {
		metricsStore, ok := store.(ports.MetricsWriteStore)
		if !ok {
			logMetricsCommand(logger, slog.LevelError, "telemetry_ingest_storage_failed", "storage is unavailable", contracts.PersistMetricsCommand{}, subject, attempt, now().Sub(start), storageErrorID, storageErrorCode)
			_ = msg.NakWithDelay(nakDelay(attempt))
			return
		}
		result = handleMetricMessage(ctx, msg, metricsStore, logger, now, start, attempt, recorder)
		return
	}

	command, err := decodeCommand(msg.Data())
	if err != nil {
		result = "rejected"
		logCommand(logger, slog.LevelWarn, "telemetry_ingest_validation_failed", "telemetry ingest validation failed", command, subject, attempt, now().Sub(start), validationErrorID, validationErrorCode)
		_ = msg.Ack()
		return
	}

	if err := validateCommand(command, subject); err != nil {
		result = "rejected"
		logCommand(logger, slog.LevelWarn, "telemetry_ingest_validation_failed", "telemetry ingest validation failed", command, subject, attempt, now().Sub(start), validationErrorID, validationErrorCode)
		_ = msg.Ack()
		return
	}

	exists, err := store.CommandExists(ctx, command)
	if err != nil {
		logCommand(logger, slog.LevelError, "telemetry_ingest_duplicate_check_failed", "storage is unavailable", command, subject, attempt, now().Sub(start), storageErrorID, storageErrorCode)
		_ = msg.NakWithDelay(nakDelay(attempt))
		return
	}
	if exists {
		result = "success"
		logCommand(logger, slog.LevelInfo, "telemetry_ingest_duplicate_acknowledged", "telemetry ingest duplicate acknowledged", command, subject, attempt, now().Sub(start), "", "")
		_ = msg.Ack()
		return
	}

	completedAt := now()
	if err := store.Persist(ctx, command, subject, completedAt); err != nil {
		logCommand(logger, slog.LevelError, "telemetry_ingest_storage_failed", "storage is unavailable", command, subject, attempt, now().Sub(start), storageErrorID, storageErrorCode)
		_ = msg.NakWithDelay(nakDelay(attempt))
		return
	}
	result = "persisted"
	recordTelemetryRecords(recorder, command, result)

	if notification := tracePersistedNotification(command, completedAt); notification != nil {
		if err := publisher.PublishTracePersisted(ctx, *notification); err != nil {
			logCommand(logger, slog.LevelError, "telemetry_ingest_notification_failed", "message bridge is unavailable", command, subject, attempt, now().Sub(start), bridgeErrorID, bridgeErrorCode)
		}
	}

	logCommand(logger, slog.LevelInfo, "telemetry_ingest_persisted", "telemetry ingest persisted", command, subject, attempt, now().Sub(start), "", "")
	_ = msg.Ack()
}

func handleMetricMessage(ctx context.Context, msg Message, store ports.MetricsWriteStore, logger *slog.Logger, now func() time.Time, start time.Time, attempt int, recorder MetricsRecorder) string {
	subject := msg.Subject()
	command, err := decodeMetricsCommand(msg.Data())
	if err != nil {
		logMetricsCommand(logger, slog.LevelWarn, "telemetry_ingest_validation_failed", "telemetry ingest validation failed", command, subject, attempt, now().Sub(start), validationErrorID, validationErrorCode)
		_ = msg.Ack()
		return "rejected"
	}
	if err := validateMetricsCommand(command, subject); err != nil {
		logMetricsCommand(logger, slog.LevelWarn, "telemetry_ingest_validation_failed", "telemetry ingest validation failed", command, subject, attempt, now().Sub(start), validationErrorID, validationErrorCode)
		_ = msg.Ack()
		return "rejected"
	}
	exists, err := store.MetricsCommandExists(ctx, command)
	if err != nil {
		logMetricsCommand(logger, slog.LevelError, "telemetry_ingest_duplicate_check_failed", "storage is unavailable", command, subject, attempt, now().Sub(start), storageErrorID, storageErrorCode)
		_ = msg.NakWithDelay(nakDelay(attempt))
		return "error"
	}
	if exists {
		logMetricsCommand(logger, slog.LevelInfo, "telemetry_ingest_duplicate_acknowledged", "telemetry ingest duplicate acknowledged", command, subject, attempt, now().Sub(start), "", "")
		_ = msg.Ack()
		return "success"
	}
	completedAt := now()
	if err := store.PersistMetrics(ctx, command, subject, completedAt); err != nil {
		logMetricsCommand(logger, slog.LevelError, "telemetry_ingest_storage_failed", "storage is unavailable", command, subject, attempt, now().Sub(start), storageErrorID, storageErrorCode)
		_ = msg.NakWithDelay(nakDelay(attempt))
		return "error"
	}
	recordMetricRecords(recorder, command, "persisted")
	logMetricsCommand(logger, slog.LevelInfo, "telemetry_ingest_persisted", "telemetry ingest persisted", command, subject, attempt, now().Sub(start), "", "")
	_ = msg.Ack()
	return "persisted"
}

func HandleMaxDeliveryAdvisory(data []byte, logger *slog.Logger) {
	var advisory struct {
		Stream      string `json:"stream"`
		Consumer    string `json:"consumer"`
		StreamSeq   uint64 `json:"stream_seq"`
		ConsumerSeq uint64 `json:"consumer_seq"`
	}
	_ = json.Unmarshal(data, &advisory)
	operation := MaxDeliveryAdvisory
	if advisory.Stream != "" && advisory.Consumer != "" {
		operation = advisory.Stream + "." + advisory.Consumer
	}
	logger.Error("JetStream message reached max deliveries",
		"service", storageWriteService,
		"event", "jetstream_max_delivery_terminal",
		"request_id", "",
		"operation_or_subject", operation,
		"status", "error",
		"duration_ms", int64(0),
		"error_id", bridgeErrorID,
		"error_code", bridgeErrorCode,
		"stream_seq", advisory.StreamSeq,
		"consumer_seq", advisory.ConsumerSeq,
	)
}

func decodeCommand(data []byte) (contracts.PersistTelemetryCommand, error) {
	var command contracts.PersistTelemetryCommand
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&command); err != nil {
		return command, err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return command, fmt.Errorf("multiple JSON values")
	}
	return command, nil
}

func decodeMetricsCommand(data []byte) (contracts.PersistMetricsCommand, error) {
	var command contracts.PersistMetricsCommand
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&command); err != nil {
		return command, err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return command, fmt.Errorf("multiple JSON values")
	}
	return command, nil
}

func validateCommand(command contracts.PersistTelemetryCommand, subject string) error {
	if strings.TrimSpace(command.RequestID) == "" {
		return fmt.Errorf("%s %s: requestId is required", validationErrorID, validationErrorCode)
	}
	if strings.TrimSpace(command.CommandID) == "" {
		return fmt.Errorf("%s %s: commandId is required", validationErrorID, validationErrorCode)
	}
	if command.IssuedAt.IsZero() {
		return fmt.Errorf("%s %s: issuedAt is required", validationErrorID, validationErrorCode)
	}
	if err := validateAuthorizedIngestContext(command.AuthContext); err != nil {
		return err
	}
	switch command.Source {
	case "otlp-traces":
		if subject != TraceSubject {
			return fmt.Errorf("%s %s: source does not match subject", validationErrorID, validationErrorCode)
		}
	case "otlp-logs":
		if subject != LogSubject {
			return fmt.Errorf("%s %s: source does not match subject", validationErrorID, validationErrorCode)
		}
	default:
		return fmt.Errorf("%s %s: source is invalid", validationErrorID, validationErrorCode)
	}
	for _, trace := range command.Traces {
		if strings.TrimSpace(trace.ID) == "" {
			return fmt.Errorf("%s %s: trace id is required", validationErrorID, validationErrorCode)
		}
		if trace.StartedAt.IsZero() {
			return fmt.Errorf("%s %s: trace startedAt is required", validationErrorID, validationErrorCode)
		}
	}
	for _, span := range command.Spans {
		if strings.TrimSpace(span.ID) == "" {
			return fmt.Errorf("%s %s: span id is required", validationErrorID, validationErrorCode)
		}
		if strings.TrimSpace(span.TraceID) == "" {
			return fmt.Errorf("%s %s: span traceId is required", validationErrorID, validationErrorCode)
		}
		if strings.TrimSpace(span.Name) == "" {
			return fmt.Errorf("%s %s: span name is required", validationErrorID, validationErrorCode)
		}
		if span.StartedAt.IsZero() {
			return fmt.Errorf("%s %s: span startedAt is required", validationErrorID, validationErrorCode)
		}
		if span.EndedAt.IsZero() {
			return fmt.Errorf("%s %s: span endedAt is required", validationErrorID, validationErrorCode)
		}
		for _, event := range span.Events {
			if strings.TrimSpace(event.Name) == "" {
				return fmt.Errorf("%s %s: span event name is required", validationErrorID, validationErrorCode)
			}
			if event.Timestamp.IsZero() {
				return fmt.Errorf("%s %s: span event timestamp is required", validationErrorID, validationErrorCode)
			}
		}
	}
	for _, log := range command.Logs {
		if strings.TrimSpace(log.ID) == "" {
			return fmt.Errorf("%s %s: log event id is required", validationErrorID, validationErrorCode)
		}
		if log.Body == nil {
			return fmt.Errorf("%s %s: log body is required", validationErrorID, validationErrorCode)
		}
		if log.Timestamp.IsZero() {
			return fmt.Errorf("%s %s: log timestamp is required", validationErrorID, validationErrorCode)
		}
	}
	return nil
}

func validateMetricsCommand(command contracts.PersistMetricsCommand, subject string) error {
	if strings.TrimSpace(command.RequestID) == "" {
		return fmt.Errorf("%s %s: requestId is required", validationErrorID, validationErrorCode)
	}
	if strings.TrimSpace(command.CommandID) == "" {
		return fmt.Errorf("%s %s: commandId is required", validationErrorID, validationErrorCode)
	}
	if command.IssuedAt.IsZero() {
		return fmt.Errorf("%s %s: issuedAt is required", validationErrorID, validationErrorCode)
	}
	if err := validateAuthorizedIngestContext(command.AuthContext); err != nil {
		return err
	}
	if command.Source != "otlp-metrics" {
		return fmt.Errorf("%s %s: source is invalid", validationErrorID, validationErrorCode)
	}
	if subject != MetricSubject {
		return fmt.Errorf("%s %s: source does not match subject", validationErrorID, validationErrorCode)
	}
	for _, descriptor := range command.Descriptors {
		if strings.TrimSpace(descriptor.Name) == "" {
			return fmt.Errorf("%s %s: metric descriptor name is required", validationErrorID, validationErrorCode)
		}
		if descriptor.Kind == "" {
			return fmt.Errorf("%s %s: metric descriptor kind is required", validationErrorID, validationErrorCode)
		}
	}
	for _, point := range command.Points {
		if strings.TrimSpace(point.MetricName) == "" {
			return fmt.Errorf("%s %s: metric point metricName is required", validationErrorID, validationErrorCode)
		}
		if point.Kind == "" {
			return fmt.Errorf("%s %s: metric point kind is required", validationErrorID, validationErrorCode)
		}
		if point.Timestamp.IsZero() {
			return fmt.Errorf("%s %s: metric point timestamp is required", validationErrorID, validationErrorCode)
		}
	}
	return nil
}

func validateAuthorizedIngestContext(auth *contracts.AuthContext) error {
	if auth == nil {
		return nil
	}
	authMode := strings.TrimSpace(ingestStringValue(auth.AuthMode))
	if authMode == "" || authMode == "local" {
		return nil
	}
	if authMode != "sso" {
		return fmt.Errorf("%s %s: authMode is invalid", validationErrorID, validationErrorCode)
	}
	if auth.IngestAllowed == nil || !*auth.IngestAllowed ||
		strings.TrimSpace(ingestStringValue(auth.TenantID)) == "" ||
		strings.TrimSpace(ingestStringValue(auth.CompanyID)) == "" ||
		strings.TrimSpace(ingestStringValue(auth.ProjectID)) == "" {
		return fmt.Errorf("%s %s: authorized ingest authContext is required", validationErrorID, validationErrorCode)
	}
	return nil
}

func ingestStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func recordPersistCommandMetrics(recorder MetricsRecorder, signal string, result string, duration time.Duration) {
	labels := map[string]string{
		"signal": signal,
		"result": result,
	}
	recorder.Increment("cloudgrid.storage.persist.commands", 1, labels)
	recorder.Observe("cloudgrid.storage.persist.duration", duration.Seconds(), labels)
}

func recordTelemetryRecords(recorder MetricsRecorder, command contracts.PersistTelemetryCommand, result string) {
	if len(command.Traces) > 0 {
		recordPersistRecords(recorder, "trace", result, len(command.Traces))
	}
	if len(command.Spans) > 0 {
		recordPersistRecords(recorder, "span", result, len(command.Spans))
	}
	if len(command.Logs) > 0 {
		recordPersistRecords(recorder, "log", result, len(command.Logs))
	}
}

func recordMetricRecords(recorder MetricsRecorder, command contracts.PersistMetricsCommand, result string) {
	if len(command.Descriptors) > 0 {
		recordPersistRecords(recorder, "metric_descriptor", result, len(command.Descriptors))
	}
	if len(command.Points) > 0 {
		recordPersistRecords(recorder, "metric_point", result, len(command.Points))
	}
}

func recordPersistRecords(recorder MetricsRecorder, recordKind string, result string, count int) {
	recorder.Increment("cloudgrid.storage.persist.records", int64(count), map[string]string{
		"record_kind": recordKind,
		"result":      result,
	})
}

func signalForSubject(subject string) string {
	switch subject {
	case TraceSubject:
		return "traces"
	case LogSubject:
		return "logs"
	case MetricSubject:
		return "metrics"
	case AiProjectionSubject:
		return "ai_projections"
	default:
		return "unknown"
	}
}

func nakDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := time.Duration(attempt) * time.Second
	if delay > 5*time.Second {
		return 5 * time.Second
	}
	return delay
}

func tracePersistedNotification(command contracts.PersistTelemetryCommand, persistedAt time.Time) *contracts.TracePersistedNotification {
	if len(command.Traces) == 0 {
		return nil
	}

	traceIDs := make([]string, 0, len(command.Traces))
	serviceNames := make([]string, 0, len(command.Traces))
	seenServices := map[string]struct{}{}
	for _, trace := range command.Traces {
		traceIDs = append(traceIDs, trace.ID)
		if trace.ServiceName == nil {
			continue
		}
		serviceName := strings.TrimSpace(*trace.ServiceName)
		if serviceName == "" {
			continue
		}
		if _, ok := seenServices[serviceName]; ok {
			continue
		}
		seenServices[serviceName] = struct{}{}
		serviceNames = append(serviceNames, serviceName)
	}

	return &contracts.TracePersistedNotification{
		BridgeEnvelope: contracts.BridgeEnvelope{
			RequestID:   command.RequestID,
			IssuedAt:    persistedAt,
			AuthContext: notificationRoutingContext(command.AuthContext),
		},
		CommandID:    command.CommandID,
		TraceIDs:     traceIDs,
		PersistedAt:  persistedAt,
		ServiceNames: serviceNames,
	}
}

func notificationRoutingContext(auth *contracts.AuthContext) *contracts.AuthContext {
	if auth == nil {
		return nil
	}
	routing := &contracts.AuthContext{
		Mode:      auth.Mode,
		AuthMode:  auth.AuthMode,
		TenantID:  auth.TenantID,
		CompanyID: auth.CompanyID,
		ProjectID: auth.ProjectID,
	}
	if routing.Mode == "" {
		routing.Mode = "anonymous"
	}
	return routing
}

func logCommand(logger *slog.Logger, level slog.Level, event string, message string, command contracts.PersistTelemetryCommand, subject string, attempt int, duration time.Duration, errorID string, errorCode string) {
	attrs := []any{
		"service", storageWriteService,
		"event", event,
		"request_id", command.RequestID,
		"operation_or_subject", subject,
		"status", logStatus(errorID),
		"command_id", command.CommandID,
		"subject", subject,
		"trace_count", len(command.Traces),
		"span_count", len(command.Spans),
		"log_count", len(command.Logs),
		"attempt", attempt,
		"duration_ms", duration.Milliseconds(),
	}
	if errorID != "" {
		attrs = append(attrs, "error_id", errorID, "error_code", errorCode)
	}
	logger.Log(context.Background(), level, message, attrs...)
}

func logMetricsCommand(logger *slog.Logger, level slog.Level, event string, message string, command contracts.PersistMetricsCommand, subject string, attempt int, duration time.Duration, errorID string, errorCode string) {
	attrs := []any{
		"service", storageWriteService,
		"event", event,
		"request_id", command.RequestID,
		"operation_or_subject", subject,
		"status", logStatus(errorID),
		"command_id", command.CommandID,
		"subject", subject,
		"metric_descriptor_count", len(command.Descriptors),
		"metric_point_count", len(command.Points),
		"attempt", attempt,
		"duration_ms", duration.Milliseconds(),
	}
	if errorID != "" {
		attrs = append(attrs, "error_id", errorID, "error_code", errorCode)
	}
	logger.Log(context.Background(), level, message, attrs...)
}

func logStatus(errorID string) string {
	if errorID == "" {
		return "ok"
	}
	return "error"
}
