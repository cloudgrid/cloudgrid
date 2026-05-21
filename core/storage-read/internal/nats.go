package internal

import (
	"context"
	"encoding/json"
	"log/slog"
	"reflect"
	"strings"
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
	"github.com/cloudgrid-dev/cloudgrid/core/storage-read/internal/ports"
)

const (
	SubjectProjectTelemetryOverview = "telemetry.projects.overview"
	SubjectTraceSearch              = "telemetry.traces.search"
	SubjectTraceGet                 = "telemetry.traces.get"
	SubjectLogSearch                = "telemetry.logs.search"
	SubjectMetricNames              = "telemetry.metrics.names"
	SubjectMetricQuery              = "telemetry.metrics.query"
	SubjectRichMetricQuery          = "telemetry.metrics.rich_query"
	SubjectTelemetryFacets          = "telemetry.facets"
	SubjectLiveTraceStart           = "telemetry.traces.live.start"
	SubjectLiveTraceStop            = "telemetry.traces.live.stop"
	SubjectPersistedTraces          = "telemetry.persisted.traces"
	storageReadService              = "storage-read"
	authModeSSO                     = "sso"
	authModeLocal                   = "local"
	scopeTelemetryRead              = "telemetry:read"
	scopeTelemetryLive              = "telemetry:live"
)

type BridgeMessage interface {
	Subject() string
	Data() []byte
	Respond(response []byte) error
}

type bridgeMessageHandler func(BridgeMessage)

func readHandlerTimeout(timeout time.Duration) time.Duration {
	if timeout > 0 {
		return timeout
	}
	return defaultQueryTimeout
}

func readHandlerContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), timeout)
}

func handleProjectTelemetryOverview(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.ProjectTelemetryOverviewRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.ProjectTelemetryOverviewResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid project telemetry overview request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectProjectTelemetryOverview, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.ProjectTelemetryOverviewResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectProjectTelemetryOverview, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := store.GetProjectTelemetryOverviews(ctx, request)
		if err != nil {
			response := contracts.ProjectTelemetryOverviewResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectProjectTelemetryOverview, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.ProjectTelemetryOverviewResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectProjectTelemetryOverview, response.RequestID, true, start, nil)
	}
}

func handleTraceSearch(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.TraceSearchRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.TraceSearchResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid trace search request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTraceSearch, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.TraceSearchResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTraceSearch, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := store.SearchTraces(ctx, request.Query, request.AuthContext)
		if err != nil {
			response := contracts.TraceSearchResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTraceSearch, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.TraceSearchResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectTraceSearch, response.RequestID, true, start, nil)
	}
}

func handleTraceGet(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.TraceDetailRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.TraceDetailResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid trace detail request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTraceGet, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.TraceDetailResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTraceGet, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := store.GetTraceDetail(ctx, request.TraceID, request.Query, request.AuthContext)
		if err != nil {
			response := contracts.TraceDetailResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTraceGet, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.TraceDetailResponse{RequestID: request.RequestID, OK: true, Data: data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectTraceGet, response.RequestID, true, start, nil)
	}
}

func handleLogSearch(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.LogSearchRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.LogSearchResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid log search request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectLogSearch, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.LogSearchResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectLogSearch, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := store.SearchLogs(ctx, request.Query, request.AuthContext)
		if err != nil {
			response := contracts.LogSearchResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectLogSearch, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.LogSearchResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectLogSearch, response.RequestID, true, start, nil)
	}
}

func handleTelemetryFacets(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.TelemetryFacetRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.TelemetryFacetResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid telemetry facets request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTelemetryFacets, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.TelemetryFacetResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTelemetryFacets, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := store.GetTelemetryFacets(ctx, request.Query, request.AuthContext)
		if err != nil {
			response := contracts.TelemetryFacetResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectTelemetryFacets, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.TelemetryFacetResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectTelemetryFacets, response.RequestID, true, start, nil)
	}
}

func handleMetricNameSearch(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.MetricNameSearchRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.MetricNameSearchResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid metric name search request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectMetricNames, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.MetricNameSearchResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectMetricNames, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := store.SearchMetricNames(ctx, request.Input, request.AuthContext)
		if err != nil {
			response := contracts.MetricNameSearchResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectMetricNames, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.MetricNameSearchResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectMetricNames, response.RequestID, true, start, nil)
	}
}

func handleMetricSeriesQuery(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.MetricSeriesRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.MetricSeriesResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid metric series request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectMetricQuery, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.MetricSeriesResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectMetricQuery, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := store.QueryMetricSeries(ctx, request.Input, request.AuthContext)
		if err != nil {
			response := contracts.MetricSeriesResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectMetricQuery, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.MetricSeriesResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectMetricQuery, response.RequestID, true, start, nil)
	}
}

func handleRichMetricSeriesQuery(store ports.TelemetryReadStore, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.RichMetricSeriesRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.RichMetricSeriesResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid rich metric series request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectRichMetricQuery, response.RequestID, false, start, response.Error)
			return
		}
		if err := validateTelemetryRead(request.AuthContext); err != nil {
			response := contracts.RichMetricSeriesResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectRichMetricQuery, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := QueryRichMetricSeriesFromMetricSeries(ctx, store, request.Input, request.AuthContext)
		if err != nil {
			response := contracts.RichMetricSeriesResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectRichMetricQuery, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.RichMetricSeriesResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectRichMetricQuery, response.RequestID, true, start, nil)
	}
}

func validateTelemetryRead(auth *contracts.AuthContext) error {
	if auth == nil {
		return nil
	}
	if auth.ReadAllowed != nil && !*auth.ReadAllowed {
		return bridgeError("ERR-016", "FORBIDDEN", "The principal is not allowed to access this telemetry", false)
	}
	authMode := strings.TrimSpace(stringPtrValue(auth.AuthMode))
	if authMode == "" || authMode == authModeLocal {
		return nil
	}
	if authMode != authModeSSO {
		return validationError("authMode is invalid")
	}
	if auth.ReadAllowed != nil && *auth.ReadAllowed {
		return nil
	}
	if authHasScope(auth, scopeTelemetryRead) {
		return nil
	}
	return bridgeError("ERR-016", "FORBIDDEN", "The principal is not allowed to access this telemetry", false)
}

func validateTelemetryLive(auth *contracts.AuthContext) error {
	if err := validateTelemetryRead(auth); err != nil {
		return err
	}
	if auth == nil {
		return nil
	}
	authMode := strings.TrimSpace(stringPtrValue(auth.AuthMode))
	if authMode == "" || authMode == authModeLocal {
		return nil
	}
	if !authHasScope(auth, scopeTelemetryLive) {
		return bridgeError("ERR-016", "FORBIDDEN", "The principal is not allowed to access this telemetry", false)
	}
	return nil
}

func authHasScope(auth *contracts.AuthContext, required string) bool {
	for _, scope := range auth.Scopes {
		if scope == required {
			return true
		}
	}
	return false
}

func stringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func handleLiveTraceStart(registry *LiveTraceRegistry, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.LiveTraceStartRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.LiveTraceStartResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid live trace start request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectLiveTraceStart, response.RequestID, false, start, response.Error)
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		data, err := registry.Start(ctx, request)
		if err != nil {
			response := contracts.LiveTraceStartResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectLiveTraceStart, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.LiveTraceStartResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectLiveTraceStart, response.RequestID, true, start, nil)
	}
}

func handleLiveTraceStop(registry *LiveTraceRegistry, logger *slog.Logger) bridgeMessageHandler {
	return func(msg BridgeMessage) {
		start := time.Now()
		var request contracts.LiveTraceStopRequest
		if err := json.Unmarshal(msg.Data(), &request); err != nil {
			response := contracts.LiveTraceStopResponse{
				RequestID: "",
				OK:        false,
				Error:     ptr(bridgeErrorFromError(validationError("invalid live trace stop request JSON"))),
			}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectLiveTraceStop, response.RequestID, false, start, response.Error)
			return
		}
		data, err := registry.Stop(request)
		if err != nil {
			response := contracts.LiveTraceStopResponse{RequestID: request.RequestID, OK: false, Error: ptr(bridgeErrorFromError(err))}
			respond(msg, response)
			logHandlerCompletion(logger, SubjectLiveTraceStop, response.RequestID, false, start, response.Error)
			return
		}
		response := contracts.LiveTraceStopResponse{RequestID: request.RequestID, OK: true, Data: &data}
		respond(msg, response)
		logHandlerCompletion(logger, SubjectLiveTraceStop, response.RequestID, true, start, nil)
	}
}

func handleTracePersistedNotification(registry *LiveTraceRegistry, logger *slog.Logger, timeout time.Duration) bridgeMessageHandler {
	timeout = readHandlerTimeout(timeout)
	return func(msg BridgeMessage) {
		start := time.Now()
		var notification contracts.TracePersistedNotification
		if err := json.Unmarshal(msg.Data(), &notification); err != nil {
			logHandlerCompletion(logger, SubjectPersistedTraces, "", false, start, ptr(bridgeErrorFromError(validationError("invalid trace persisted notification JSON"))))
			return
		}
		ctx, cancel := readHandlerContext(timeout)
		defer cancel()
		if err := registry.HandleTracePersisted(ctx, notification); err != nil {
			bridgeError := bridgeErrorFromError(err)
			logHandlerCompletion(logger, SubjectPersistedTraces, notification.RequestID, false, start, &bridgeError)
			return
		}
		logHandlerCompletion(logger, SubjectPersistedTraces, notification.RequestID, true, start, nil)
	}
}

func logHandlerCompletion(logger *slog.Logger, subject string, requestID string, ok bool, start time.Time, bridgeError *contracts.BridgeError) {
	if logger == nil {
		return
	}
	level := slog.LevelDebug
	status := "ok"
	attrs := []any{
		"service", storageReadService,
		"event", "nats_handler_completed",
		"request_id", requestID,
		"operation_or_subject", subject,
		"status", status,
		"duration_ms", time.Since(start).Milliseconds(),
	}
	if !ok {
		level = slog.LevelWarn
		status = "error"
		attrs = []any{
			"service", storageReadService,
			"event", "nats_handler_completed",
			"request_id", requestID,
			"operation_or_subject", subject,
			"status", status,
			"duration_ms", time.Since(start).Milliseconds(),
		}
		if bridgeError != nil {
			attrs = append(attrs, "error_id", bridgeError.ID, "error_code", bridgeError.Code)
		}
	}
	logger.Log(context.Background(), level, "storage read NATS handler completed", attrs...)
}

func respond(msg BridgeMessage, response any) {
	encoded, err := json.Marshal(response)
	if err != nil {
		bridgeError := contracts.BridgeError{
			ID:        "ERR-013",
			Code:      "MESSAGE_BRIDGE_UNAVAILABLE",
			Message:   "Message bridge returned an invalid response",
			Retryable: true,
		}
		encoded, err = ErrorResponseJSON(responseRequestID(response), bridgeError)
		if err != nil {
			return
		}
	}
	_ = msg.Respond(encoded)
}

func responseRequestID(response any) string {
	value := reflect.ValueOf(response)
	if value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return ""
		}
		value = value.Elem()
	}
	if value.Kind() != reflect.Struct {
		return ""
	}
	field := value.FieldByName("RequestID")
	if !field.IsValid() || field.Kind() != reflect.String {
		return ""
	}
	return field.String()
}

func ErrorResponseJSON(requestID string, err contracts.BridgeError) ([]byte, error) {
	response := struct {
		RequestID string                 `json:"requestId"`
		OK        bool                   `json:"ok"`
		Error     *contracts.BridgeError `json:"error,omitempty"`
	}{
		RequestID: requestID,
		OK:        false,
		Error:     &err,
	}
	return json.Marshal(response)
}

func ptr[T any](value T) *T {
	return &value
}
