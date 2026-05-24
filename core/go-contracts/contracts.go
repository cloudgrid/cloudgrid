package contracts

import "time"

type TraceStatus string

const (
	TraceStatusOK    TraceStatus = "ok"
	TraceStatusError TraceStatus = "error"
	TraceStatusUnset TraceStatus = "unset"
)

type LogCorrelation string

const (
	LogCorrelationTrace      LogCorrelation = "trace"
	LogCorrelationSpan       LogCorrelation = "span"
	LogCorrelationContextual LogCorrelation = "contextual"
	LogCorrelationNone       LogCorrelation = "none"
)

type CompanyRole string

const (
	CompanyRoleAdmin CompanyRole = "admin"
	CompanyRoleUser  CompanyRole = "user"
)

type OrganizationInvitationStatus string

const (
	OrganizationInvitationStatusPending  OrganizationInvitationStatus = "pending"
	OrganizationInvitationStatusAccepted OrganizationInvitationStatus = "accepted"
	OrganizationInvitationStatusRevoked  OrganizationInvitationStatus = "revoked"
	OrganizationInvitationStatusExpired  OrganizationInvitationStatus = "expired"
)

type InvitationDeliveryStatus string

const (
	InvitationDeliveryStatusNotConfigured   InvitationDeliveryStatus = "not_configured"
	InvitationDeliveryStatusPending         InvitationDeliveryStatus = "pending"
	InvitationDeliveryStatusSent            InvitationDeliveryStatus = "sent"
	InvitationDeliveryStatusFailedRetryable InvitationDeliveryStatus = "failed_retryable"
	InvitationDeliveryStatusFailedTerminal  InvitationDeliveryStatus = "failed_terminal"
	InvitationDeliveryStatusSuppressed      InvitationDeliveryStatus = "suppressed"
)

type InvitationProjectGrantStatus string

const (
	InvitationProjectGrantStatusPending InvitationProjectGrantStatus = "pending"
	InvitationProjectGrantStatusApplied InvitationProjectGrantStatus = "applied"
	InvitationProjectGrantStatusRevoked InvitationProjectGrantStatus = "revoked"
	InvitationProjectGrantStatusFailed  InvitationProjectGrantStatus = "failed"
)

type ProjectInvitationOutcome string

const (
	ProjectInvitationOutcomeInvitationPending ProjectInvitationOutcome = "invitation_pending"
	ProjectInvitationOutcomeMembershipCreated ProjectInvitationOutcome = "membership_created"
)

type ProjectRole string

const (
	ProjectRoleViewer ProjectRole = "viewer"
	ProjectRoleEditor ProjectRole = "editor"
	ProjectRoleAdmin  ProjectRole = "admin"
)

type ProjectMemberSource string

const (
	ProjectMemberSourceDirect        ProjectMemberSource = "direct"
	ProjectMemberSourceCompanyAdmin  ProjectMemberSource = "company_admin"
	ProjectMemberSourceLocalPersonal ProjectMemberSource = "local_personal"
)

type ProjectStatus string

const (
	ProjectStatusActive   ProjectStatus = "active"
	ProjectStatusReadOnly ProjectStatus = "read_only"
	ProjectStatusDisabled ProjectStatus = "disabled"
)

type ServiceProjectScope string

const (
	ServiceProjectScopeAlertEvaluator     ServiceProjectScope = "alert_evaluator"
	ServiceProjectScopeStorageMaintenance ServiceProjectScope = "storage_maintenance"
)

type RetentionDataClass string

const (
	RetentionDataClassTraces                RetentionDataClass = "TRACES"
	RetentionDataClassLogs                  RetentionDataClass = "LOGS"
	RetentionDataClassMetrics               RetentionDataClass = "METRICS"
	RetentionDataClassAIEvals               RetentionDataClass = "AI_EVALS"
	RetentionDataClassDatasets              RetentionDataClass = "DATASETS"
	RetentionDataClassScorers               RetentionDataClass = "SCORERS"
	RetentionDataClassDashboardHistory      RetentionDataClass = "DASHBOARD_HISTORY"
	RetentionDataClassIngestCredentialAudit RetentionDataClass = "INGEST_CREDENTIAL_AUDIT"
)

type RetentionMode string

const (
	RetentionModeRetain               RetentionMode = "retain"
	RetentionModeDelete               RetentionMode = "delete"
	RetentionModeSoftDeleteThenDelete RetentionMode = "soft_delete_then_delete"
)

type AlertRuleKind string

const (
	AlertRuleKindMetricThreshold AlertRuleKind = "METRIC_THRESHOLD"
	AlertRuleKindMetricAbsence   AlertRuleKind = "METRIC_ABSENCE"
	AlertRuleKindLogMatch        AlertRuleKind = "LOG_MATCH"
	AlertRuleKindLogCount        AlertRuleKind = "LOG_COUNT"
	AlertRuleKindTraceMatch      AlertRuleKind = "TRACE_MATCH"
	AlertRuleKindTraceCount      AlertRuleKind = "TRACE_COUNT"
	AlertRuleKindTraceLatency    AlertRuleKind = "TRACE_LATENCY"
	AlertRuleKindTraceError      AlertRuleKind = "TRACE_ERROR"
)

type AlertSeverity string

const (
	AlertSeverityInfo     AlertSeverity = "INFO"
	AlertSeverityWarning  AlertSeverity = "WARNING"
	AlertSeverityError    AlertSeverity = "ERROR"
	AlertSeverityCritical AlertSeverity = "CRITICAL"
)

type AlertState string

const (
	AlertStateOK       AlertState = "OK"
	AlertStatePending  AlertState = "PENDING"
	AlertStateFiring   AlertState = "FIRING"
	AlertStateResolved AlertState = "RESOLVED"
	AlertStateSilenced AlertState = "SILENCED"
	AlertStateError    AlertState = "ERROR"
)

type MetricChartType string

const (
	MetricChartTypeLine      MetricChartType = "line"
	MetricChartTypeArea      MetricChartType = "area"
	MetricChartTypeBar       MetricChartType = "bar"
	MetricChartTypePie       MetricChartType = "pie"
	MetricChartTypeDonut     MetricChartType = "donut"
	MetricChartTypeStat      MetricChartType = "stat"
	MetricChartTypeRadial    MetricChartType = "radial"
	MetricChartTypeRadar     MetricChartType = "radar"
	MetricChartTypeHeatmap   MetricChartType = "heatmap"
	MetricChartTypeHistogram MetricChartType = "histogram"
	MetricChartTypeTable     MetricChartType = "table"
)

type DashboardVisibility string

const (
	DashboardVisibilityBuiltin  DashboardVisibility = "builtin"
	DashboardVisibilityProject  DashboardVisibility = "project"
	DashboardVisibilityPersonal DashboardVisibility = "personal"
)

type DashboardSaveVisibility string

const (
	DashboardSaveVisibilityProject  DashboardSaveVisibility = "project"
	DashboardSaveVisibilityPersonal DashboardSaveVisibility = "personal"
)

type DashboardWidgetKind string

const (
	DashboardWidgetKindMetricTimeseries DashboardWidgetKind = "metric_timeseries"
	DashboardWidgetKindMetricStat       DashboardWidgetKind = "metric_stat"
	DashboardWidgetKindMetricTable      DashboardWidgetKind = "metric_table"
	DashboardWidgetKindMetricRich       DashboardWidgetKind = "metric_rich"
	DashboardWidgetKindLogTable         DashboardWidgetKind = "log_table"
	DashboardWidgetKindTraceTable       DashboardWidgetKind = "trace_table"
	DashboardWidgetKindLiveTraceTable   DashboardWidgetKind = "live_trace_table"
	DashboardWidgetKindAlertStatus      DashboardWidgetKind = "alert_status"
	DashboardWidgetKindAlertHistory     DashboardWidgetKind = "alert_history"
	DashboardWidgetKindAlertEvidence    DashboardWidgetKind = "alert_evidence"
)

type DashboardMetricFormulaExpressionKind string

const (
	DashboardMetricFormulaExpressionKindRef      DashboardMetricFormulaExpressionKind = "ref"
	DashboardMetricFormulaExpressionKindNumber   DashboardMetricFormulaExpressionKind = "number"
	DashboardMetricFormulaExpressionKindBinary   DashboardMetricFormulaExpressionKind = "binary"
	DashboardMetricFormulaExpressionKindUnary    DashboardMetricFormulaExpressionKind = "unary"
	DashboardMetricFormulaExpressionKindFunction DashboardMetricFormulaExpressionKind = "function"
)

type DashboardMetricFormulaBinaryOperator string

const (
	DashboardMetricFormulaBinaryOperatorAdd      DashboardMetricFormulaBinaryOperator = "add"
	DashboardMetricFormulaBinaryOperatorSubtract DashboardMetricFormulaBinaryOperator = "subtract"
	DashboardMetricFormulaBinaryOperatorMultiply DashboardMetricFormulaBinaryOperator = "multiply"
	DashboardMetricFormulaBinaryOperatorDivide   DashboardMetricFormulaBinaryOperator = "divide"
)

type DashboardMetricFormulaFunction string

const (
	DashboardMetricFormulaFunctionSumSeries     DashboardMetricFormulaFunction = "sum_series"
	DashboardMetricFormulaFunctionAvgSeries     DashboardMetricFormulaFunction = "avg_series"
	DashboardMetricFormulaFunctionMinSeries     DashboardMetricFormulaFunction = "min_series"
	DashboardMetricFormulaFunctionMaxSeries     DashboardMetricFormulaFunction = "max_series"
	DashboardMetricFormulaFunctionRatio         DashboardMetricFormulaFunction = "ratio"
	DashboardMetricFormulaFunctionClampMin      DashboardMetricFormulaFunction = "clamp_min"
	DashboardMetricFormulaFunctionClampMax      DashboardMetricFormulaFunction = "clamp_max"
	DashboardMetricFormulaFunctionMovingAverage DashboardMetricFormulaFunction = "moving_average"
)

type DashboardThresholdSeverity string

const (
	DashboardThresholdSeverityInfo    DashboardThresholdSeverity = "info"
	DashboardThresholdSeverityWarning DashboardThresholdSeverity = "warning"
	DashboardThresholdSeverityError   DashboardThresholdSeverity = "error"
)

type DashboardLogColumn string

const (
	DashboardLogColumnTimestamp         DashboardLogColumn = "timestamp"
	DashboardLogColumnObservedTimestamp DashboardLogColumn = "observed_timestamp"
	DashboardLogColumnSeverity          DashboardLogColumn = "severity"
	DashboardLogColumnService           DashboardLogColumn = "service"
	DashboardLogColumnTraceSpan         DashboardLogColumn = "trace_span"
	DashboardLogColumnBody              DashboardLogColumn = "body"
	DashboardLogColumnAttributes        DashboardLogColumn = "attributes"
)

type DashboardTraceColumn string

const (
	DashboardTraceColumnStartedAt DashboardTraceColumn = "started_at"
	DashboardTraceColumnStatus    DashboardTraceColumn = "status"
	DashboardTraceColumnService   DashboardTraceColumn = "service"
	DashboardTraceColumnOperation DashboardTraceColumn = "operation"
	DashboardTraceColumnDuration  DashboardTraceColumn = "duration"
	DashboardTraceColumnSpanCount DashboardTraceColumn = "span_count"
	DashboardTraceColumnLogCount  DashboardTraceColumn = "log_count"
)

type MetricAggregationTemporality string

const (
	MetricAggregationTemporalityUnspecified MetricAggregationTemporality = "unspecified"
	MetricAggregationTemporalityDelta       MetricAggregationTemporality = "delta"
	MetricAggregationTemporalityCumulative  MetricAggregationTemporality = "cumulative"
)

type LiveTraceEventType string

const (
	LiveTraceEventTypeSnapshot  LiveTraceEventType = "snapshot"
	LiveTraceEventTypeAdded     LiveTraceEventType = "added"
	LiveTraceEventTypeUpdated   LiveTraceEventType = "updated"
	LiveTraceEventTypeHeartbeat LiveTraceEventType = "heartbeat"
)

type Attributes map[string]any

type AttributeFilterOperator string

const (
	AttributeFilterOperatorEQ       AttributeFilterOperator = "eq"
	AttributeFilterOperatorNEQ      AttributeFilterOperator = "neq"
	AttributeFilterOperatorContains AttributeFilterOperator = "contains"
	AttributeFilterOperatorExists   AttributeFilterOperator = "exists"
	AttributeFilterOperatorGT       AttributeFilterOperator = "gt"
	AttributeFilterOperatorGTE      AttributeFilterOperator = "gte"
	AttributeFilterOperatorLT       AttributeFilterOperator = "lt"
	AttributeFilterOperatorLTE      AttributeFilterOperator = "lte"
	AttributeFilterOperatorIN       AttributeFilterOperator = "in"
	AttributeFilterOperatorNotIN    AttributeFilterOperator = "not_in"
)

type TraceSort string

const (
	TraceSortStartedAtDesc TraceSort = "startedAt_desc"
	TraceSortStartedAtAsc  TraceSort = "startedAt_asc"
	TraceSortDurationDesc  TraceSort = "duration_desc"
	TraceSortDurationAsc   TraceSort = "duration_asc"
	TraceSortErrorFirst    TraceSort = "errorFirst"
)

type LogSort string

const (
	LogSortTimestampDesc LogSort = "timestamp_desc"
	LogSortTimestampAsc  LogSort = "timestamp_asc"
	LogSortSeverityDesc  LogSort = "severity_desc"
)

type AttributeFilter struct {
	Key      string                  `json:"key"`
	Operator AttributeFilterOperator `json:"operator"`
	Value    any                     `json:"value,omitempty"`
}

type Trace struct {
	ID                string       `json:"id"`
	ServiceName       *string      `json:"serviceName,omitempty"`
	StartedAt         time.Time    `json:"startedAt"`
	StartedAtUnixNano string       `json:"startedAtUnixNano,omitempty"`
	EndedAt           *time.Time   `json:"endedAt,omitempty"`
	EndedAtUnixNano   *string      `json:"endedAtUnixNano,omitempty"`
	DurationNano      *string      `json:"durationNano,omitempty"`
	DurationMs        *float64     `json:"durationMs,omitempty"`
	RootSpanID        *string      `json:"rootSpanId,omitempty"`
	Status            *TraceStatus `json:"status,omitempty"`
	Attributes        Attributes   `json:"attributes"`
}

type TraceSummary struct {
	Trace
	OperationName  *string `json:"operationName,omitempty"`
	SpanCount      int     `json:"spanCount"`
	ErrorSpanCount int     `json:"errorSpanCount"`
	LogCount       int     `json:"logCount"`
	ServiceCount   int     `json:"serviceCount"`
}

type SpanEvent struct {
	Name              string     `json:"name"`
	Timestamp         time.Time  `json:"timestamp"`
	TimestampUnixNano string     `json:"timestampUnixNano,omitempty"`
	Attributes        Attributes `json:"attributes"`
}

type SpanLinkDirection string

const (
	SpanLinkDirectionForward  SpanLinkDirection = "forward"
	SpanLinkDirectionBackward SpanLinkDirection = "backward"
	SpanLinkDirectionUnknown  SpanLinkDirection = "unknown"
)

type SpanLink struct {
	TraceID    string             `json:"traceId"`
	SpanID     string             `json:"spanId"`
	TraceState *string            `json:"traceState,omitempty"`
	Attributes Attributes         `json:"attributes"`
	Direction  *SpanLinkDirection `json:"direction,omitempty"`
}

type StackTraceFrame struct {
	Raw          string  `json:"raw"`
	FunctionName *string `json:"functionName,omitempty"`
	FileName     *string `json:"fileName,omitempty"`
	LineNumber   *int    `json:"lineNumber,omitempty"`
	ColumnNumber *int    `json:"columnNumber,omitempty"`
	Language     *string `json:"language,omitempty"`
}

type SpanException struct {
	Timestamp  time.Time         `json:"timestamp"`
	Type       *string           `json:"type,omitempty"`
	Message    *string           `json:"message,omitempty"`
	Stacktrace *string           `json:"stacktrace,omitempty"`
	Escaped    *bool             `json:"escaped,omitempty"`
	Attributes Attributes        `json:"attributes"`
	Frames     []StackTraceFrame `json:"frames"`
}

type Span struct {
	ID                string          `json:"id"`
	TraceID           string          `json:"traceId"`
	ParentSpanID      *string         `json:"parentSpanId,omitempty"`
	Name              string          `json:"name"`
	Kind              *string         `json:"kind,omitempty"`
	ServiceName       *string         `json:"serviceName,omitempty"`
	StartedAt         time.Time       `json:"startedAt"`
	StartedAtUnixNano string          `json:"startedAtUnixNano,omitempty"`
	EndedAt           time.Time       `json:"endedAt"`
	EndedAtUnixNano   string          `json:"endedAtUnixNano,omitempty"`
	StartOffsetNano   string          `json:"startOffsetNano,omitempty"`
	DurationNano      string          `json:"durationNano,omitempty"`
	DurationMs        float64         `json:"durationMs"`
	Status            *TraceStatus    `json:"status,omitempty"`
	Attributes        Attributes      `json:"attributes"`
	Depth             int             `json:"depth"`
	ChildCount        int             `json:"childCount"`
	HasError          bool            `json:"hasError"`
	IsCriticalPath    bool            `json:"isCriticalPath"`
	IsOrphan          bool            `json:"isOrphan"`
	IsServiceEntry    bool            `json:"isServiceEntry"`
	ExceptionCount    int             `json:"exceptionCount"`
	Events            []SpanEvent     `json:"events"`
	Links             []SpanLink      `json:"links"`
	Exceptions        []SpanException `json:"exceptions"`
}

type LogEvent struct {
	ID                string          `json:"id"`
	TraceID           *string         `json:"traceId,omitempty"`
	SpanID            *string         `json:"spanId,omitempty"`
	ServiceName       *string         `json:"serviceName,omitempty"`
	SeverityText      *string         `json:"severityText,omitempty"`
	SeverityNumber    *int            `json:"severityNumber,omitempty"`
	Body              any             `json:"body"`
	Timestamp         time.Time       `json:"timestamp"`
	ObservedTimestamp *time.Time      `json:"observedTimestamp,omitempty"`
	Attributes        Attributes      `json:"attributes"`
	Correlation       *LogCorrelation `json:"correlation,omitempty"`
}

type Service struct {
	Name        string     `json:"name"`
	FirstSeenAt *time.Time `json:"firstSeenAt,omitempty"`
	LastSeenAt  time.Time  `json:"lastSeenAt"`
	Attributes  Attributes `json:"attributes,omitempty"`
}

type TraceSearchQuery struct {
	Service       *string           `json:"service,omitempty"`
	Services      []string          `json:"services,omitempty"`
	Query         *string           `json:"query,omitempty"`
	OperationName *string           `json:"operationName,omitempty"`
	SpanName      *string           `json:"spanName,omitempty"`
	From          *time.Time        `json:"from,omitempty"`
	To            *time.Time        `json:"to,omitempty"`
	Status        *TraceStatus      `json:"status,omitempty"`
	MinDurationMs *float64          `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64          `json:"maxDurationMs,omitempty"`
	Attributes    []AttributeFilter `json:"attributes,omitempty"`
	Sort          *TraceSort        `json:"sort,omitempty"`
	Limit         *int              `json:"limit,omitempty"`
	Cursor        *string           `json:"cursor,omitempty"`
}

type LiveTraceQuery struct {
	Service       *string           `json:"service,omitempty"`
	Services      []string          `json:"services,omitempty"`
	Query         *string           `json:"query,omitempty"`
	OperationName *string           `json:"operationName,omitempty"`
	SpanName      *string           `json:"spanName,omitempty"`
	From          *time.Time        `json:"from,omitempty"`
	Status        *TraceStatus      `json:"status,omitempty"`
	MinDurationMs *float64          `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64          `json:"maxDurationMs,omitempty"`
	Attributes    []AttributeFilter `json:"attributes,omitempty"`
	Limit         *int              `json:"limit,omitempty"`
}

type TraceDetailQuery struct {
	SelectedSpanID    *string           `json:"selectedSpanId,omitempty"`
	SpanQuery         *string           `json:"spanQuery,omitempty"`
	SpanService       *string           `json:"spanService,omitempty"`
	SpanName          *string           `json:"spanName,omitempty"`
	SpanStatus        *TraceStatus      `json:"spanStatus,omitempty"`
	MinSpanDurationMs *float64          `json:"minSpanDurationMs,omitempty"`
	MaxSpanDurationMs *float64          `json:"maxSpanDurationMs,omitempty"`
	Attributes        []AttributeFilter `json:"attributes,omitempty"`
	ShowMatchesOnly   *bool             `json:"showMatchesOnly,omitempty"`
	RelatedLogLimit   *int              `json:"relatedLogLimit,omitempty"`
	LogSearch         *string           `json:"logSearch,omitempty"`
}

type LogSearchQuery struct {
	Service    *string           `json:"service,omitempty"`
	Services   []string          `json:"services,omitempty"`
	TraceID    *string           `json:"traceId,omitempty"`
	SpanID     *string           `json:"spanId,omitempty"`
	Severity   *string           `json:"severity,omitempty"`
	From       *time.Time        `json:"from,omitempty"`
	To         *time.Time        `json:"to,omitempty"`
	Search     *string           `json:"search,omitempty"`
	Attributes []AttributeFilter `json:"attributes,omitempty"`
	Sort       *LogSort          `json:"sort,omitempty"`
	Limit      *int              `json:"limit,omitempty"`
	Cursor     *string           `json:"cursor,omitempty"`
}

type TelemetryFacetSignal string

const (
	TelemetryFacetSignalTraces  TelemetryFacetSignal = "traces"
	TelemetryFacetSignalLogs    TelemetryFacetSignal = "logs"
	TelemetryFacetSignalMetrics TelemetryFacetSignal = "metrics"
)

type TelemetryFacetQuery struct {
	From     *time.Time            `json:"from,omitempty"`
	To       *time.Time            `json:"to,omitempty"`
	Service  *string               `json:"service,omitempty"`
	Services []string              `json:"services,omitempty"`
	Signal   *TelemetryFacetSignal `json:"signal,omitempty"`
	Search   *string               `json:"search,omitempty"`
	Limit    *int                  `json:"limit,omitempty"`
}

type DashboardListInput struct {
	IncludeBuiltins *bool                `json:"includeBuiltins,omitempty"`
	Query           *string              `json:"query,omitempty"`
	Tag             *string              `json:"tag,omitempty"`
	Visibility      *DashboardVisibility `json:"visibility,omitempty"`
	PinnedOnly      *bool                `json:"pinnedOnly,omitempty"`
}

type DashboardSaveInput struct {
	ID                *string                  `json:"id,omitempty"`
	Version           *int                     `json:"version,omitempty"`
	Name              string                   `json:"name"`
	Description       *string                  `json:"description,omitempty"`
	Tags              []string                 `json:"tags,omitempty"`
	Visibility        *DashboardSaveVisibility `json:"visibility,omitempty"`
	DefaultTimeWindow *string                  `json:"defaultTimeWindow,omitempty"`
	Widgets           []DashboardWidgetInput   `json:"widgets"`
}

type DashboardWidgetInput struct {
	ID          string                          `json:"id"`
	Title       string                          `json:"title"`
	Description *string                         `json:"description,omitempty"`
	Kind        DashboardWidgetKind             `json:"kind"`
	Layout      DashboardWidgetLayoutInput      `json:"layout"`
	Metric      *DashboardMetricWidgetInput     `json:"metric,omitempty"`
	RichMetric  *DashboardRichMetricWidgetInput `json:"richMetric,omitempty"`
	Logs        *DashboardLogWidgetInput        `json:"logs,omitempty"`
	Traces      *DashboardTraceWidgetInput      `json:"traces,omitempty"`
	LiveTraces  *DashboardLiveTraceWidgetInput  `json:"liveTraces,omitempty"`
	Alert       *DashboardAlertWidgetInput      `json:"alert,omitempty"`
}

type DashboardWidgetLayoutInput struct {
	X    int  `json:"x"`
	Y    int  `json:"y"`
	W    int  `json:"w"`
	H    int  `json:"h"`
	MinW *int `json:"minW,omitempty"`
	MinH *int `json:"minH,omitempty"`
}

type DashboardMetricWidgetInput struct {
	MetricName    string                    `json:"metricName"`
	Aggregation   MetricAggregation         `json:"aggregation"`
	GroupBy       []string                  `json:"groupBy,omitempty"`
	Filters       []AttributeFilter         `json:"filters,omitempty"`
	TimeWindow    *string                   `json:"timeWindow,omitempty"`
	Interval      *string                   `json:"interval,omitempty"`
	Visualization MetricChartType           `json:"visualization"`
	Legend        *bool                     `json:"legend,omitempty"`
	MaxSeries     *int                      `json:"maxSeries,omitempty"`
	Thresholds    []DashboardThresholdInput `json:"thresholds,omitempty"`
}

type DashboardRichMetricWidgetInput struct {
	Query         DashboardMetricQueryInput `json:"query"`
	Visualization MetricChartType           `json:"visualization"`
	Legend        *bool                     `json:"legend,omitempty"`
	MaxSeries     *int                      `json:"maxSeries,omitempty"`
	Thresholds    []DashboardThresholdInput `json:"thresholds,omitempty"`
}

type DashboardMetricQueryInput struct {
	TimeWindow    *string                             `json:"timeWindow,omitempty"`
	Interval      *string                             `json:"interval,omitempty"`
	Queries       []DashboardMetricQueryRowInput      `json:"queries"`
	Formulas      []DashboardMetricFormulaInput       `json:"formulas,omitempty"`
	DisplaySeries []DashboardMetricDisplaySeriesInput `json:"displaySeries,omitempty"`
}

type DashboardMetricQueryRowInput struct {
	ID          string            `json:"id"`
	Label       string            `json:"label"`
	MetricName  string            `json:"metricName"`
	Aggregation MetricAggregation `json:"aggregation"`
	GroupBy     []string          `json:"groupBy,omitempty"`
	Filters     []AttributeFilter `json:"filters,omitempty"`
	MaxSeries   *int              `json:"maxSeries,omitempty"`
}

type DashboardMetricFormulaInput struct {
	ID         string                                `json:"id"`
	Label      string                                `json:"label"`
	Expression DashboardMetricFormulaExpressionInput `json:"expression"`
	Unit       *string                               `json:"unit,omitempty"`
}

type DashboardMetricFormulaExpressionInput struct {
	Kind      DashboardMetricFormulaExpressionKind    `json:"kind"`
	RefID     *string                                 `json:"refId,omitempty"`
	Value     *float64                                `json:"value,omitempty"`
	Operator  *DashboardMetricFormulaBinaryOperator   `json:"operator,omitempty"`
	Left      *DashboardMetricFormulaExpressionInput  `json:"left,omitempty"`
	Right     *DashboardMetricFormulaExpressionInput  `json:"right,omitempty"`
	Function  *DashboardMetricFormulaFunction         `json:"function,omitempty"`
	Arguments []DashboardMetricFormulaExpressionInput `json:"arguments,omitempty"`
}

type DashboardMetricDisplaySeriesInput struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	SourceID string `json:"sourceId"`
	Visible  *bool  `json:"visible,omitempty"`
}

type DashboardLogWidgetInput struct {
	Service    *string              `json:"service,omitempty"`
	TraceID    *string              `json:"traceId,omitempty"`
	SpanID     *string              `json:"spanId,omitempty"`
	Severity   *string              `json:"severity,omitempty"`
	Search     *string              `json:"search,omitempty"`
	Attributes []AttributeFilter    `json:"attributes,omitempty"`
	Sort       *LogSort             `json:"sort,omitempty"`
	Limit      *int                 `json:"limit,omitempty"`
	Columns    []DashboardLogColumn `json:"columns,omitempty"`
}

type DashboardTraceWidgetInput struct {
	Service       *string                `json:"service,omitempty"`
	Query         *string                `json:"query,omitempty"`
	OperationName *string                `json:"operationName,omitempty"`
	SpanName      *string                `json:"spanName,omitempty"`
	Status        *TraceStatus           `json:"status,omitempty"`
	MinDurationMs *float64               `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64               `json:"maxDurationMs,omitempty"`
	Attributes    []AttributeFilter      `json:"attributes,omitempty"`
	Sort          *TraceSort             `json:"sort,omitempty"`
	Limit         *int                   `json:"limit,omitempty"`
	Columns       []DashboardTraceColumn `json:"columns,omitempty"`
}

type DashboardLiveTraceWidgetInput struct {
	Service       *string           `json:"service,omitempty"`
	Query         *string           `json:"query,omitempty"`
	OperationName *string           `json:"operationName,omitempty"`
	SpanName      *string           `json:"spanName,omitempty"`
	Status        *TraceStatus      `json:"status,omitempty"`
	MinDurationMs *float64          `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64          `json:"maxDurationMs,omitempty"`
	Attributes    []AttributeFilter `json:"attributes,omitempty"`
	Limit         *int              `json:"limit,omitempty"`
}

type DashboardAlertWidgetInput struct {
	RuleIDs    []string        `json:"ruleIds,omitempty"`
	States     []AlertState    `json:"states,omitempty"`
	Severities []AlertSeverity `json:"severities,omitempty"`
	Signals    []AlertSignal   `json:"signals,omitempty"`
	TimeWindow *string         `json:"timeWindow,omitempty"`
	Limit      *int            `json:"limit,omitempty"`
}

type DashboardThresholdInput struct {
	Value    float64                    `json:"value"`
	Severity DashboardThresholdSeverity `json:"severity"`
	Label    *string                    `json:"label,omitempty"`
}

type AuthContext struct {
	Mode                   string     `json:"mode"`
	AuthMode               *string    `json:"authMode,omitempty"`
	PrincipalID            *string    `json:"principalId,omitempty"`
	PrincipalName          *string    `json:"principalDisplayName,omitempty"`
	PrincipalEmail         *string    `json:"principalEmail,omitempty"`
	PrincipalEmailVerified *bool      `json:"principalEmailVerified,omitempty"`
	TenantID               *string    `json:"tenantId,omitempty"`
	CompanyID              *string    `json:"companyId,omitempty"`
	ProjectID              *string    `json:"projectId,omitempty"`
	Scopes                 []string   `json:"scopes,omitempty"`
	IngestAllowed          *bool      `json:"ingestAllowed,omitempty"`
	ReadAllowed            *bool      `json:"readAllowed,omitempty"`
	CheckedAt              *time.Time `json:"checkedAt,omitempty"`
}

type BridgeEnvelope struct {
	RequestID    string         `json:"requestId"`
	IssuedAt     time.Time      `json:"issuedAt"`
	TraceContext map[string]any `json:"traceContext,omitempty"`
	AuthContext  *AuthContext   `json:"authContext,omitempty"`
}

type BridgeError struct {
	ID        string         `json:"id"`
	Code      string         `json:"code"`
	Message   string         `json:"message"`
	Retryable bool           `json:"retryable"`
	Details   map[string]any `json:"details,omitempty"`
}

type TraceSearchRequest struct {
	BridgeEnvelope
	Query TraceSearchQuery `json:"query"`
}

type TraceSearchData struct {
	Items      []TraceSummary `json:"items"`
	NextCursor *string        `json:"nextCursor,omitempty"`
}

type TraceSearchResponse struct {
	RequestID string           `json:"requestId"`
	OK        bool             `json:"ok"`
	Data      *TraceSearchData `json:"data,omitempty"`
	Error     *BridgeError     `json:"error,omitempty"`
}

type TraceDetailRequest struct {
	BridgeEnvelope
	TraceID string            `json:"traceId"`
	Query   *TraceDetailQuery `json:"query,omitempty"`
}

type TraceDetailData struct {
	Trace        Trace          `json:"trace"`
	Structure    TraceStructure `json:"structure"`
	Spans        []Span         `json:"spans"`
	SelectedSpan *Span          `json:"selectedSpan,omitempty"`
	SpanMatches  []SpanMatch    `json:"spanMatches"`
	Logs         []LogEvent     `json:"logs"`
	RelatedLogs  []LogEvent     `json:"relatedLogs"`
	Warnings     []TraceWarning `json:"warnings"`
}

type TraceDetailResponse struct {
	RequestID string           `json:"requestId"`
	OK        bool             `json:"ok"`
	Data      *TraceDetailData `json:"data,omitempty"`
	Error     *BridgeError     `json:"error,omitempty"`
}

type LogSearchRequest struct {
	BridgeEnvelope
	Query LogSearchQuery `json:"query"`
}

type LogSearchData struct {
	Items      []LogEvent `json:"items"`
	NextCursor *string    `json:"nextCursor,omitempty"`
}

type LogSearchResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      *LogSearchData `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type TelemetryFacetRequest struct {
	BridgeEnvelope
	Query TelemetryFacetQuery `json:"query"`
}

type TelemetryFacetData struct {
	Services      []FacetValue `json:"services"`
	Operations    []FacetValue `json:"operations"`
	SpanNames     []FacetValue `json:"spanNames"`
	Severities    []FacetValue `json:"severities"`
	AttributeKeys []FacetValue `json:"attributeKeys"`
}

type TelemetryFacetResponse struct {
	RequestID string              `json:"requestId"`
	OK        bool                `json:"ok"`
	Data      *TelemetryFacetData `json:"data,omitempty"`
	Error     *BridgeError        `json:"error,omitempty"`
}

type DashboardWidgetLayout struct {
	X    int `json:"x"`
	Y    int `json:"y"`
	W    int `json:"w"`
	H    int `json:"h"`
	MinW int `json:"minW"`
	MinH int `json:"minH"`
}

type DashboardThreshold struct {
	Value    float64                    `json:"value"`
	Severity DashboardThresholdSeverity `json:"severity"`
	Label    *string                    `json:"label,omitempty"`
}

type DashboardMetricWidget struct {
	MetricName    string               `json:"metricName"`
	Aggregation   MetricAggregation    `json:"aggregation"`
	GroupBy       []string             `json:"groupBy"`
	Filters       []AttributeFilter    `json:"filters"`
	TimeWindow    string               `json:"timeWindow"`
	Interval      *string              `json:"interval,omitempty"`
	Visualization MetricChartType      `json:"visualization"`
	Legend        bool                 `json:"legend"`
	MaxSeries     int                  `json:"maxSeries"`
	Thresholds    []DashboardThreshold `json:"thresholds"`
}

type DashboardRichMetricWidget struct {
	Query         DashboardMetricQuery `json:"query"`
	Visualization MetricChartType      `json:"visualization"`
	Legend        bool                 `json:"legend"`
	MaxSeries     int                  `json:"maxSeries"`
	Thresholds    []DashboardThreshold `json:"thresholds"`
}

type DashboardMetricQuery struct {
	TimeWindow    string                         `json:"timeWindow"`
	Interval      *string                        `json:"interval,omitempty"`
	Queries       []DashboardMetricQueryRow      `json:"queries"`
	Formulas      []DashboardMetricFormula       `json:"formulas"`
	DisplaySeries []DashboardMetricDisplaySeries `json:"displaySeries"`
}

type DashboardMetricQueryRow struct {
	ID          string            `json:"id"`
	Label       string            `json:"label"`
	MetricName  string            `json:"metricName"`
	Aggregation MetricAggregation `json:"aggregation"`
	GroupBy     []string          `json:"groupBy"`
	Filters     []AttributeFilter `json:"filters"`
	MaxSeries   int               `json:"maxSeries"`
}

type DashboardMetricFormula struct {
	ID         string                           `json:"id"`
	Label      string                           `json:"label"`
	Expression DashboardMetricFormulaExpression `json:"expression"`
	Unit       *string                          `json:"unit,omitempty"`
}

type DashboardMetricFormulaExpression struct {
	Kind      DashboardMetricFormulaExpressionKind  `json:"kind"`
	RefID     *string                               `json:"refId,omitempty"`
	Value     *float64                              `json:"value,omitempty"`
	Operator  *DashboardMetricFormulaBinaryOperator `json:"operator,omitempty"`
	Left      *DashboardMetricFormulaExpression     `json:"left,omitempty"`
	Right     *DashboardMetricFormulaExpression     `json:"right,omitempty"`
	Function  *DashboardMetricFormulaFunction       `json:"function,omitempty"`
	Arguments []DashboardMetricFormulaExpression    `json:"arguments"`
}

type DashboardMetricDisplaySeries struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	SourceID string `json:"sourceId"`
	Visible  bool   `json:"visible"`
}

type DashboardLogWidget struct {
	Service    *string              `json:"service,omitempty"`
	TraceID    *string              `json:"traceId,omitempty"`
	SpanID     *string              `json:"spanId,omitempty"`
	Severity   *string              `json:"severity,omitempty"`
	Search     *string              `json:"search,omitempty"`
	Attributes []AttributeFilter    `json:"attributes"`
	Sort       LogSort              `json:"sort"`
	Limit      int                  `json:"limit"`
	Columns    []DashboardLogColumn `json:"columns"`
}

type DashboardTraceWidget struct {
	Service       *string                `json:"service,omitempty"`
	Query         *string                `json:"query,omitempty"`
	OperationName *string                `json:"operationName,omitempty"`
	SpanName      *string                `json:"spanName,omitempty"`
	Status        *TraceStatus           `json:"status,omitempty"`
	MinDurationMs *float64               `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64               `json:"maxDurationMs,omitempty"`
	Attributes    []AttributeFilter      `json:"attributes"`
	Sort          TraceSort              `json:"sort"`
	Limit         int                    `json:"limit"`
	Columns       []DashboardTraceColumn `json:"columns"`
}

type DashboardLiveTraceWidget struct {
	Service       *string           `json:"service,omitempty"`
	Query         *string           `json:"query,omitempty"`
	OperationName *string           `json:"operationName,omitempty"`
	SpanName      *string           `json:"spanName,omitempty"`
	Status        *TraceStatus      `json:"status,omitempty"`
	MinDurationMs *float64          `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64          `json:"maxDurationMs,omitempty"`
	Attributes    []AttributeFilter `json:"attributes"`
	Limit         int               `json:"limit"`
}

type DashboardWidget struct {
	ID          string                     `json:"id"`
	Title       string                     `json:"title"`
	Description *string                    `json:"description,omitempty"`
	Kind        DashboardWidgetKind        `json:"kind"`
	Layout      DashboardWidgetLayout      `json:"layout"`
	Metric      *DashboardMetricWidget     `json:"metric,omitempty"`
	RichMetric  *DashboardRichMetricWidget `json:"richMetric,omitempty"`
	Logs        *DashboardLogWidget        `json:"logs,omitempty"`
	Traces      *DashboardTraceWidget      `json:"traces,omitempty"`
	LiveTraces  *DashboardLiveTraceWidget  `json:"liveTraces,omitempty"`
	Alert       *DashboardAlertWidget      `json:"alert,omitempty"`
}

type DashboardAlertWidget struct {
	RuleIDs    []string        `json:"ruleIds"`
	States     []AlertState    `json:"states"`
	Severities []AlertSeverity `json:"severities"`
	Signals    []AlertSignal   `json:"signals"`
	TimeWindow string          `json:"timeWindow"`
	Limit      int             `json:"limit"`
}

type Dashboard struct {
	ID                string              `json:"id"`
	ProjectID         string              `json:"projectId"`
	Slug              string              `json:"slug"`
	Name              string              `json:"name"`
	Description       *string             `json:"description,omitempty"`
	Tags              []string            `json:"tags"`
	Version           int                 `json:"version"`
	Visibility        DashboardVisibility `json:"visibility"`
	DefaultTimeWindow string              `json:"defaultTimeWindow"`
	Pinned            bool                `json:"pinned"`
	Widgets           []DashboardWidget   `json:"widgets"`
	CreatedAt         time.Time           `json:"createdAt"`
	UpdatedAt         time.Time           `json:"updatedAt"`
	CreatedBy         *string             `json:"createdBy,omitempty"`
	UpdatedBy         *string             `json:"updatedBy,omitempty"`
}

type DashboardListRequest struct {
	BridgeEnvelope
	Input *DashboardListInput `json:"input,omitempty"`
}

type DashboardListData struct {
	Items              []Dashboard `json:"items"`
	PinnedDashboardIDs []string    `json:"pinnedDashboardIds"`
}

type DashboardListResponse struct {
	RequestID string             `json:"requestId"`
	OK        bool               `json:"ok"`
	Data      *DashboardListData `json:"data,omitempty"`
	Error     *BridgeError       `json:"error,omitempty"`
}

type DashboardSaveRequest struct {
	BridgeEnvelope
	Input DashboardSaveInput `json:"input"`
}

type DashboardDeleteRequest struct {
	BridgeEnvelope
	DashboardID string `json:"dashboardId"`
}

type DashboardSaveData struct {
	Dashboard Dashboard `json:"dashboard"`
}

type DashboardSaveResponse struct {
	RequestID string             `json:"requestId"`
	OK        bool               `json:"ok"`
	Data      *DashboardSaveData `json:"data,omitempty"`
	Error     *BridgeError       `json:"error,omitempty"`
}

type DashboardDeleteData struct {
	Deleted bool `json:"deleted"`
}

type DashboardDeleteResponse struct {
	RequestID string               `json:"requestId"`
	OK        bool                 `json:"ok"`
	Data      *DashboardDeleteData `json:"data,omitempty"`
	Error     *BridgeError         `json:"error,omitempty"`
}

type DashboardPinSetRequest struct {
	BridgeEnvelope
	DashboardID string `json:"dashboardId"`
	Pinned      bool   `json:"pinned"`
}

type DashboardPinReorderRequest struct {
	BridgeEnvelope
	DashboardIDs []string `json:"dashboardIds"`
}

type DashboardPreferencesData struct {
	ProjectID          string    `json:"projectId"`
	PinnedDashboardIDs []string  `json:"pinnedDashboardIds"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type DashboardPreferencesResponse struct {
	RequestID string                    `json:"requestId"`
	OK        bool                      `json:"ok"`
	Data      *DashboardPreferencesData `json:"data,omitempty"`
	Error     *BridgeError              `json:"error,omitempty"`
}

type MetricAggregation string

const (
	MetricAggregationAvg   MetricAggregation = "avg"
	MetricAggregationSum   MetricAggregation = "sum"
	MetricAggregationMin   MetricAggregation = "min"
	MetricAggregationMax   MetricAggregation = "max"
	MetricAggregationCount MetricAggregation = "count"
	MetricAggregationRate  MetricAggregation = "rate"
	MetricAggregationP50   MetricAggregation = "p50"
	MetricAggregationP90   MetricAggregation = "p90"
	MetricAggregationP95   MetricAggregation = "p95"
	MetricAggregationP99   MetricAggregation = "p99"
)

type MetricNameSort string

const (
	MetricNameSortLastSeenAtDesc MetricNameSort = "lastSeenAt_desc"
	MetricNameSortLastSeenAtAsc  MetricNameSort = "lastSeenAt_asc"
	MetricNameSortNameAsc        MetricNameSort = "name_asc"
	MetricNameSortNameDesc       MetricNameSort = "name_desc"
	MetricNameSortKindAsc        MetricNameSort = "kind_asc"
)

type MetricSeriesSort string

const (
	MetricSeriesSortTimestampAsc  MetricSeriesSort = "timestamp_asc"
	MetricSeriesSortTimestampDesc MetricSeriesSort = "timestamp_desc"
	MetricSeriesSortValueDesc     MetricSeriesSort = "value_desc"
	MetricSeriesSortValueAsc      MetricSeriesSort = "value_asc"
)

type MetricNameSearchInput struct {
	Query    *string         `json:"query,omitempty"`
	Service  *string         `json:"service,omitempty"`
	Services []string        `json:"services,omitempty"`
	From     *time.Time      `json:"from,omitempty"`
	To       *time.Time      `json:"to,omitempty"`
	Sort     *MetricNameSort `json:"sort,omitempty"`
	Limit    *int            `json:"limit,omitempty"`
	Cursor   *string         `json:"cursor,omitempty"`
}

type MetricNameSearchRequest struct {
	BridgeEnvelope
	Input MetricNameSearchInput `json:"input"`
}

type MetricNameSearchData struct {
	Items      []MetricDescriptor `json:"items"`
	NextCursor *string            `json:"nextCursor,omitempty"`
}

type MetricNameSearchResponse struct {
	RequestID string                `json:"requestId"`
	OK        bool                  `json:"ok"`
	Data      *MetricNameSearchData `json:"data,omitempty"`
	Error     *BridgeError          `json:"error,omitempty"`
}

type MetricSeriesInput struct {
	MetricName  string            `json:"metricName"`
	From        time.Time         `json:"from"`
	To          time.Time         `json:"to"`
	Interval    *string           `json:"interval,omitempty"`
	Aggregation MetricAggregation `json:"aggregation"`
	GroupBy     []string          `json:"groupBy,omitempty"`
	Filters     []AttributeFilter `json:"filters,omitempty"`
	Sort        *MetricSeriesSort `json:"sort,omitempty"`
	Limit       *int              `json:"limit,omitempty"`
}

type MetricSeriesPoint struct {
	Timestamp time.Time        `json:"timestamp"`
	Value     float64          `json:"value"`
	Count     *float64         `json:"count,omitempty"`
	Exemplars []MetricExemplar `json:"exemplars"`
}

type MetricSeries struct {
	Labels Attributes          `json:"labels"`
	Points []MetricSeriesPoint `json:"points"`
}

type MetricQueryWarning struct {
	Code    string  `json:"code"`
	Message string  `json:"message"`
	Field   *string `json:"field,omitempty"`
}

type MetricSeriesData struct {
	Metric      MetricDescriptor     `json:"metric"`
	Aggregation MetricAggregation    `json:"aggregation"`
	Interval    string               `json:"interval"`
	GroupBy     []string             `json:"groupBy"`
	Series      []MetricSeries       `json:"series"`
	Warnings    []MetricQueryWarning `json:"warnings"`
}

type MetricSeriesRequest struct {
	BridgeEnvelope
	Input MetricSeriesInput `json:"input"`
}

type MetricSeriesResponse struct {
	RequestID string            `json:"requestId"`
	OK        bool              `json:"ok"`
	Data      *MetricSeriesData `json:"data,omitempty"`
	Error     *BridgeError      `json:"error,omitempty"`
}

type RichMetricSeriesInput struct {
	From  time.Time                 `json:"from"`
	To    time.Time                 `json:"to"`
	Query DashboardMetricQueryInput `json:"query"`
}

type RichMetricSeries struct {
	ID       string              `json:"id"`
	Label    string              `json:"label"`
	SourceID string              `json:"sourceId"`
	Unit     *string             `json:"unit,omitempty"`
	Labels   Attributes          `json:"labels"`
	Points   []MetricSeriesPoint `json:"points"`
}

type RichMetricDisplaySeries struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	SourceID string `json:"sourceId"`
	Visible  bool   `json:"visible"`
}

type RichMetricSeriesData struct {
	Interval      string                    `json:"interval"`
	Series        []RichMetricSeries        `json:"series"`
	DisplaySeries []RichMetricDisplaySeries `json:"displaySeries"`
	Warnings      []MetricQueryWarning      `json:"warnings"`
}

type RichMetricSeriesRequest struct {
	BridgeEnvelope
	Input RichMetricSeriesInput `json:"input"`
}

type RichMetricSeriesResponse struct {
	RequestID string                `json:"requestId"`
	OK        bool                  `json:"ok"`
	Data      *RichMetricSeriesData `json:"data,omitempty"`
	Error     *BridgeError          `json:"error,omitempty"`
}

type LiveTraceStartRequest struct {
	BridgeEnvelope
	SubscriptionID string         `json:"subscriptionId"`
	SinkSubject    string         `json:"sinkSubject"`
	Query          LiveTraceQuery `json:"query"`
}

type LiveTraceStartData struct {
	SubscriptionID      string `json:"subscriptionId"`
	HeartbeatIntervalMs int    `json:"heartbeatIntervalMs"`
}

type LiveTraceStartResponse struct {
	RequestID string              `json:"requestId"`
	OK        bool                `json:"ok"`
	Data      *LiveTraceStartData `json:"data,omitempty"`
	Error     *BridgeError        `json:"error,omitempty"`
}

type LiveTraceStopRequest struct {
	BridgeEnvelope
	SubscriptionID string `json:"subscriptionId"`
}

type LiveTraceStopData struct {
	SubscriptionID string `json:"subscriptionId"`
}

type LiveTraceStopResponse struct {
	RequestID string             `json:"requestId"`
	OK        bool               `json:"ok"`
	Data      *LiveTraceStopData `json:"data,omitempty"`
	Error     *BridgeError       `json:"error,omitempty"`
}

type User struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"displayName,omitempty"`
	Email       *string `json:"email,omitempty"`
}

type ProjectTelemetryOverview struct {
	LastIngestAt *time.Time `json:"lastIngestAt,omitempty"`
	TraceCount   int        `json:"traceCount"`
	LogCount     int        `json:"logCount"`
	MetricCount  int        `json:"metricCount"`
	ServiceCount int        `json:"serviceCount"`
}

type ProjectTelemetryOverviewTarget struct {
	TenantID  *string `json:"tenantId,omitempty"`
	CompanyID string  `json:"companyId"`
	ProjectID string  `json:"projectId"`
}

type ProjectTelemetryOverviewRequest struct {
	BridgeEnvelope
	Projects []ProjectTelemetryOverviewTarget `json:"projects"`
}

type ProjectTelemetryOverviewItem struct {
	TenantID  string                   `json:"tenantId"`
	CompanyID string                   `json:"companyId"`
	ProjectID string                   `json:"projectId"`
	Telemetry ProjectTelemetryOverview `json:"telemetry"`
}

type ProjectTelemetryOverviewData struct {
	Items []ProjectTelemetryOverviewItem `json:"items"`
}

type ProjectTelemetryOverviewResponse struct {
	RequestID string                        `json:"requestId"`
	OK        bool                          `json:"ok"`
	Data      *ProjectTelemetryOverviewData `json:"data,omitempty"`
	Error     *BridgeError                  `json:"error,omitempty"`
}

type Project struct {
	ID             string                   `json:"id"`
	OrganizationID string                   `json:"organizationId"`
	Name           string                   `json:"name"`
	Slug           string                   `json:"slug"`
	Status         ProjectStatus            `json:"status"`
	Telemetry      ProjectTelemetryOverview `json:"telemetry"`
}

type Organization struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	Slug     string      `json:"slug"`
	Role     CompanyRole `json:"role"`
	Projects []Project   `json:"projects"`
}

type Viewer struct {
	User            User           `json:"user"`
	Organizations   []Organization `json:"organizations"`
	SelectedProject *Project       `json:"selectedProject,omitempty"`
}

type OrganizationMember struct {
	User User        `json:"user"`
	Role CompanyRole `json:"role"`
}

type OrganizationInvitation struct {
	ID                    string                       `json:"id"`
	OrganizationID        string                       `json:"organizationId"`
	Email                 string                       `json:"email"`
	Role                  CompanyRole                  `json:"role"`
	Status                OrganizationInvitationStatus `json:"status"`
	DeliveryStatus        InvitationDeliveryStatus     `json:"deliveryStatus"`
	LastDeliveryAttemptAt *time.Time                   `json:"lastDeliveryAttemptAt,omitempty"`
	LastDeliveryErrorCode *string                      `json:"lastDeliveryErrorCode,omitempty"`
	LastEmailDeliveryID   *string                      `json:"lastEmailDeliveryId,omitempty"`
	ProjectGrants         []InvitationProjectGrant     `json:"projectGrants"`
	InvitedByUserID       string                       `json:"invitedByUserId"`
	AcceptedByUserID      *string                      `json:"acceptedByUserId,omitempty"`
	CreatedAt             time.Time                    `json:"createdAt"`
	UpdatedAt             time.Time                    `json:"updatedAt"`
	AcceptedAt            *time.Time                   `json:"acceptedAt,omitempty"`
	RevokedAt             *time.Time                   `json:"revokedAt,omitempty"`
	ExpiresAt             *time.Time                   `json:"expiresAt,omitempty"`
}

type InvitationProjectGrant struct {
	ProjectID       string                       `json:"projectId"`
	Role            ProjectRole                  `json:"role"`
	Status          InvitationProjectGrantStatus `json:"status"`
	CreatedAt       time.Time                    `json:"createdAt"`
	CreatedByUserID string                       `json:"createdByUserId"`
	AppliedAt       *time.Time                   `json:"appliedAt,omitempty"`
}

type ViewerGetRequest struct {
	BridgeEnvelope
}

type ViewerGetData struct {
	Viewer *Viewer `json:"viewer,omitempty"`
}

type ViewerGetResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      *ViewerGetData `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type OrganizationListRequest struct {
	BridgeEnvelope
}

type OrganizationListData struct {
	Items []Organization `json:"items"`
}

type OrganizationListResponse struct {
	RequestID string                `json:"requestId"`
	OK        bool                  `json:"ok"`
	Data      *OrganizationListData `json:"data,omitempty"`
	Error     *BridgeError          `json:"error,omitempty"`
}

type OrganizationGetRequest struct {
	BridgeEnvelope
	OrganizationID string `json:"organizationId"`
}

type OrganizationGetData struct {
	Organization *Organization `json:"organization,omitempty"`
}

type OrganizationGetResponse struct {
	RequestID string               `json:"requestId"`
	OK        bool                 `json:"ok"`
	Data      *OrganizationGetData `json:"data,omitempty"`
	Error     *BridgeError         `json:"error,omitempty"`
}

type MemberListRequest struct {
	BridgeEnvelope
	OrganizationID string `json:"organizationId"`
}

type MemberListData struct {
	Items []OrganizationMember `json:"items"`
}

type MemberListResponse struct {
	RequestID string          `json:"requestId"`
	OK        bool            `json:"ok"`
	Data      *MemberListData `json:"data,omitempty"`
	Error     *BridgeError    `json:"error,omitempty"`
}

type ProjectListRequest struct {
	BridgeEnvelope
	OrganizationID *string        `json:"organizationId,omitempty"`
	Status         *ProjectStatus `json:"status,omitempty"`
}

type ProjectListData struct {
	Items []Project `json:"items"`
}

type ProjectListResponse struct {
	RequestID string           `json:"requestId"`
	OK        bool             `json:"ok"`
	Data      *ProjectListData `json:"data,omitempty"`
	Error     *BridgeError     `json:"error,omitempty"`
}

type ProjectListForServiceRequest struct {
	BridgeEnvelope
	ServiceScope ServiceProjectScope `json:"serviceScope"`
	Status       *ProjectStatus      `json:"status,omitempty"`
	Cursor       *string             `json:"cursor,omitempty"`
	Limit        *int                `json:"limit,omitempty"`
}

type ServiceProject struct {
	ProjectID string        `json:"projectId"`
	CompanyID string        `json:"companyId"`
	TenantID  string        `json:"tenantId"`
	Status    ProjectStatus `json:"status"`
	ChangedAt time.Time     `json:"changedAt"`
}

type ProjectListForServiceData struct {
	Items      []ServiceProject `json:"items"`
	NextCursor *string          `json:"nextCursor,omitempty"`
}

type ProjectListForServiceResponse struct {
	RequestID string                     `json:"requestId"`
	OK        bool                       `json:"ok"`
	Data      *ProjectListForServiceData `json:"data,omitempty"`
	Error     *BridgeError               `json:"error,omitempty"`
}

type ProjectGetRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type ProjectGetData struct {
	Project *Project `json:"project,omitempty"`
}

type ProjectGetResponse struct {
	RequestID string          `json:"requestId"`
	OK        bool            `json:"ok"`
	Data      *ProjectGetData `json:"data,omitempty"`
	Error     *BridgeError    `json:"error,omitempty"`
}

type ProjectCreateRequest struct {
	BridgeEnvelope
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
	Slug           string `json:"slug"`
}

type ProjectUpdateRequest struct {
	BridgeEnvelope
	ProjectID string         `json:"projectId"`
	Name      *string        `json:"name,omitempty"`
	Status    *ProjectStatus `json:"status,omitempty"`
}

type ProjectMutationResponse struct {
	RequestID string          `json:"requestId"`
	OK        bool            `json:"ok"`
	Data      *ProjectGetData `json:"data,omitempty"`
	Error     *BridgeError    `json:"error,omitempty"`
}

type ProjectSelectRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type ProjectSelectResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      *ViewerGetData `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type MemberUpdateRequest struct {
	BridgeEnvelope
	OrganizationID string      `json:"organizationId"`
	UserID         string      `json:"userId"`
	Role           CompanyRole `json:"role"`
}

type MemberUpdateData struct {
	Member OrganizationMember `json:"member"`
}

type MemberUpdateResponse struct {
	RequestID string            `json:"requestId"`
	OK        bool              `json:"ok"`
	Data      *MemberUpdateData `json:"data,omitempty"`
	Error     *BridgeError      `json:"error,omitempty"`
}

type MemberRemoveRequest struct {
	BridgeEnvelope
	OrganizationID string `json:"organizationId"`
	UserID         string `json:"userId"`
}

type MemberRemoveData struct {
	Removed bool `json:"removed"`
}

type MemberRemoveResponse struct {
	RequestID string            `json:"requestId"`
	OK        bool              `json:"ok"`
	Data      *MemberRemoveData `json:"data,omitempty"`
	Error     *BridgeError      `json:"error,omitempty"`
}

type InvitationListRequest struct {
	BridgeEnvelope
	OrganizationID string `json:"organizationId"`
}

type InvitationListData struct {
	Items []OrganizationInvitation `json:"items"`
}

type InvitationListResponse struct {
	RequestID string              `json:"requestId"`
	OK        bool                `json:"ok"`
	Data      *InvitationListData `json:"data,omitempty"`
	Error     *BridgeError        `json:"error,omitempty"`
}

type InvitationCreateRequest struct {
	BridgeEnvelope
	OrganizationID string `json:"organizationId"`
	Email          string `json:"email"`
}

type InvitationResendRequest struct {
	BridgeEnvelope
	InvitationID string `json:"invitationId"`
}

type InvitationRevokeRequest struct {
	BridgeEnvelope
	InvitationID string `json:"invitationId"`
}

type InvitationMutationData struct {
	Invitation OrganizationInvitation `json:"invitation"`
}

type InvitationMutationResponse struct {
	RequestID string                  `json:"requestId"`
	OK        bool                    `json:"ok"`
	Data      *InvitationMutationData `json:"data,omitempty"`
	Error     *BridgeError            `json:"error,omitempty"`
}

type ProjectInvitationCreateRequest struct {
	BridgeEnvelope
	ProjectID string      `json:"projectId"`
	Email     string      `json:"email"`
	Role      ProjectRole `json:"role"`
}

type ProjectInvitationData struct {
	Outcome       ProjectInvitationOutcome `json:"outcome"`
	Invitation    *OrganizationInvitation  `json:"invitation,omitempty"`
	ProjectMember *ProjectMember           `json:"projectMember,omitempty"`
}

type ProjectInvitationMutationResponse struct {
	RequestID string                 `json:"requestId"`
	OK        bool                   `json:"ok"`
	Data      *ProjectInvitationData `json:"data,omitempty"`
	Error     *BridgeError           `json:"error,omitempty"`
}

type ProjectMember struct {
	ProjectID       string              `json:"projectId"`
	UserID          string              `json:"userId"`
	Email           *string             `json:"email,omitempty"`
	DisplayName     *string             `json:"displayName,omitempty"`
	Role            ProjectRole         `json:"role"`
	EffectiveRole   ProjectRole         `json:"effectiveRole"`
	Source          ProjectMemberSource `json:"source"`
	CreatedAt       time.Time           `json:"createdAt"`
	CreatedByUserID string              `json:"createdByUserId"`
	UpdatedAt       time.Time           `json:"updatedAt"`
	UpdatedByUserID string              `json:"updatedByUserId"`
}

type ProjectMemberListRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type ProjectMemberListData struct {
	Items []ProjectMember `json:"items"`
}

type ProjectMemberListResponse struct {
	RequestID string                 `json:"requestId"`
	OK        bool                   `json:"ok"`
	Data      *ProjectMemberListData `json:"data,omitempty"`
	Error     *BridgeError           `json:"error,omitempty"`
}

type ProjectMemberUpdateRequest struct {
	BridgeEnvelope
	ProjectID string      `json:"projectId"`
	UserID    string      `json:"userId"`
	Role      ProjectRole `json:"role"`
}

type ProjectMemberData struct {
	Member ProjectMember `json:"member"`
}

type ProjectMemberMutationResponse struct {
	RequestID string             `json:"requestId"`
	OK        bool               `json:"ok"`
	Data      *ProjectMemberData `json:"data,omitempty"`
	Error     *BridgeError       `json:"error,omitempty"`
}

type ProjectMemberRemoveRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
	UserID    string `json:"userId"`
}

type ProjectMemberRemoveData struct {
	Removed bool `json:"removed"`
}

type ProjectMemberRemoveResponse struct {
	RequestID string                   `json:"requestId"`
	OK        bool                     `json:"ok"`
	Data      *ProjectMemberRemoveData `json:"data,omitempty"`
	Error     *BridgeError             `json:"error,omitempty"`
}

type RetentionPolicy struct {
	ProjectID       string          `json:"projectId"`
	Rules           []RetentionRule `json:"rules"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	UpdatedByUserID string          `json:"updatedByUserId"`
	Version         int             `json:"version"`
}

type RetentionRule struct {
	DataClass       RetentionDataClass `json:"dataClass"`
	Mode            RetentionMode      `json:"mode"`
	RetentionDays   *int               `json:"retentionDays,omitempty"`
	SoftDeleteDays  *int               `json:"softDeleteDays,omitempty"`
	UpdatedAt       time.Time          `json:"updatedAt"`
	UpdatedByUserID string             `json:"updatedByUserId"`
	Version         int                `json:"version"`
}

type RetentionRuleInput struct {
	DataClass      RetentionDataClass `json:"dataClass"`
	Mode           RetentionMode      `json:"mode"`
	RetentionDays  *int               `json:"retentionDays,omitempty"`
	SoftDeleteDays *int               `json:"softDeleteDays,omitempty"`
}

type RetentionGetRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type RetentionPolicyData struct {
	Policy RetentionPolicy `json:"policy"`
}

type RetentionGetResponse struct {
	RequestID string               `json:"requestId"`
	OK        bool                 `json:"ok"`
	Data      *RetentionPolicyData `json:"data,omitempty"`
	Error     *BridgeError         `json:"error,omitempty"`
}

type RetentionUpdateRequest struct {
	BridgeEnvelope
	ProjectID       string               `json:"projectId"`
	ExpectedVersion int                  `json:"expectedVersion"`
	Rules           []RetentionRuleInput `json:"rules"`
}

type RetentionUpdateResponse struct {
	RequestID string               `json:"requestId"`
	OK        bool                 `json:"ok"`
	Data      *RetentionPolicyData `json:"data,omitempty"`
	Error     *BridgeError         `json:"error,omitempty"`
}

type RetentionExecuteBatchRequest struct {
	BridgeEnvelope
	ProjectID   string             `json:"projectId"`
	DataClass   RetentionDataClass `json:"dataClass"`
	RequestedAt time.Time          `json:"requestedAt"`
	DryRun      *bool              `json:"dryRun,omitempty"`
	Limit       *int               `json:"limit,omitempty"`
}

type RetentionExecuteBatchData struct {
	ProjectID         string             `json:"projectId"`
	DataClass         RetentionDataClass `json:"dataClass"`
	PolicyVersion     int                `json:"policyVersion"`
	DryRun            bool               `json:"dryRun"`
	MatchedCount      int                `json:"matchedCount"`
	HardDeletedCount  int                `json:"hardDeletedCount"`
	SoftDeletedCount  int                `json:"softDeletedCount"`
	FinalDeletedCount int                `json:"finalDeletedCount"`
	StartedAt         time.Time          `json:"startedAt"`
	CompletedAt       time.Time          `json:"completedAt"`
	Error             *BridgeError       `json:"error,omitempty"`
}

type RetentionExecuteBatchResponse struct {
	RequestID string                     `json:"requestId"`
	OK        bool                       `json:"ok"`
	Data      *RetentionExecuteBatchData `json:"data,omitempty"`
	Error     *BridgeError               `json:"error,omitempty"`
}

type AlertRule struct {
	ID                      string         `json:"id"`
	ProjectID               string         `json:"projectId"`
	Name                    string         `json:"name"`
	Enabled                 bool           `json:"enabled"`
	Kind                    AlertRuleKind  `json:"kind"`
	Severity                AlertSeverity  `json:"severity"`
	Query                   map[string]any `json:"query"`
	Condition               map[string]any `json:"condition"`
	EvaluationWindowSeconds int            `json:"evaluationWindowSeconds"`
	PendingForSeconds       int            `json:"pendingForSeconds"`
	CooldownSeconds         int            `json:"cooldownSeconds"`
	NotificationAdapterIDs  []string       `json:"notificationAdapterIds"`
	CreatedAt               time.Time      `json:"createdAt"`
	UpdatedAt               time.Time      `json:"updatedAt"`
	UpdatedByUserID         string         `json:"updatedByUserId"`
	Version                 int            `json:"version"`
}

type AlertSignal string

const (
	AlertSignalMetric AlertSignal = "METRIC"
	AlertSignalLog    AlertSignal = "LOG"
	AlertSignalTrace  AlertSignal = "TRACE"
)

type AlertRuleSort string

const (
	AlertRuleSortUpdatedAtDesc AlertRuleSort = "updatedAt_desc"
	AlertRuleSortUpdatedAtAsc  AlertRuleSort = "updatedAt_asc"
	AlertRuleSortCreatedAtDesc AlertRuleSort = "createdAt_desc"
	AlertRuleSortCreatedAtAsc  AlertRuleSort = "createdAt_asc"
	AlertRuleSortNameAsc       AlertRuleSort = "name_asc"
	AlertRuleSortNameDesc      AlertRuleSort = "name_desc"
	AlertRuleSortSeverityAsc   AlertRuleSort = "severity_asc"
	AlertRuleSortSeverityDesc  AlertRuleSort = "severity_desc"
	AlertRuleSortKindAsc       AlertRuleSort = "kind_asc"
	AlertRuleSortKindDesc      AlertRuleSort = "kind_desc"
	AlertRuleSortEnabledAsc    AlertRuleSort = "enabled_asc"
	AlertRuleSortEnabledDesc   AlertRuleSort = "enabled_desc"
)

type AlertRuleSearchInput struct {
	Search   *string        `json:"search,omitempty"`
	Status   *AlertState    `json:"status,omitempty"`
	Severity *AlertSeverity `json:"severity,omitempty"`
	Signal   *AlertSignal   `json:"signal,omitempty"`
	Enabled  *bool          `json:"enabled,omitempty"`
	Sort     *AlertRuleSort `json:"sort,omitempty"`
}

type AlertEvent struct {
	ID                 string        `json:"id"`
	ProjectID          string        `json:"projectId"`
	RuleID             string        `json:"ruleId"`
	InstanceID         string        `json:"instanceId"`
	State              AlertState    `json:"state"`
	Severity           AlertSeverity `json:"severity"`
	Summary            string        `json:"summary"`
	DeduplicationKey   string        `json:"deduplicationKey"`
	StartedAt          time.Time     `json:"startedAt"`
	EndedAt            *time.Time    `json:"endedAt,omitempty"`
	CreatedAt          time.Time     `json:"createdAt"`
	EvidenceTraceID    *string       `json:"evidenceTraceId,omitempty"`
	EvidenceSpanID     *string       `json:"evidenceSpanId,omitempty"`
	EvidenceLogID      *string       `json:"evidenceLogId,omitempty"`
	EvidenceMetricName *string       `json:"evidenceMetricName,omitempty"`
}

type AlertSilence struct {
	ID              string    `json:"id"`
	ProjectID       string    `json:"projectId"`
	RuleID          string    `json:"ruleId"`
	Reason          string    `json:"reason"`
	StartsAt        time.Time `json:"startsAt"`
	EndsAt          time.Time `json:"endsAt"`
	CreatedAt       time.Time `json:"createdAt"`
	CreatedByUserID string    `json:"createdByUserId"`
	Active          bool      `json:"active"`
}

type AlertPageInfo struct {
	HasNextPage bool    `json:"hasNextPage"`
	EndCursor   *string `json:"endCursor,omitempty"`
}

type AlertEventConnection struct {
	Items    []AlertEvent  `json:"items"`
	PageInfo AlertPageInfo `json:"pageInfo"`
}

type AlertSummaryInput struct {
	RuleIDs    []string        `json:"ruleIds,omitempty"`
	States     []AlertState    `json:"states,omitempty"`
	Severities []AlertSeverity `json:"severities,omitempty"`
	Signals    []AlertSignal   `json:"signals,omitempty"`
	TimeWindow *string         `json:"timeWindow,omitempty"`
	Limit      *int            `json:"limit,omitempty"`
}

type AlertStateCount struct {
	State AlertState `json:"state"`
	Count int        `json:"count"`
}

type AlertSeverityCount struct {
	Severity AlertSeverity `json:"severity"`
	Count    int           `json:"count"`
}

type AlertSignalCount struct {
	Signal AlertSignal `json:"signal"`
	Count  int         `json:"count"`
}

type AlertSummary struct {
	TotalCount int                  `json:"totalCount"`
	ByState    []AlertStateCount    `json:"byState"`
	BySeverity []AlertSeverityCount `json:"bySeverity"`
	BySignal   []AlertSignalCount   `json:"bySignal"`
}

type AlertRuleCreateInput struct {
	ProjectID               string         `json:"projectId"`
	Name                    string         `json:"name"`
	Enabled                 bool           `json:"enabled"`
	Kind                    AlertRuleKind  `json:"kind"`
	Severity                AlertSeverity  `json:"severity"`
	Query                   map[string]any `json:"query"`
	Condition               map[string]any `json:"condition"`
	EvaluationWindowSeconds int            `json:"evaluationWindowSeconds"`
	PendingForSeconds       int            `json:"pendingForSeconds"`
	CooldownSeconds         int            `json:"cooldownSeconds"`
	NotificationAdapterIDs  []string       `json:"notificationAdapterIds"`
}

type AlertRuleUpdateInput struct {
	ID                      string         `json:"id"`
	Name                    *string        `json:"name,omitempty"`
	Enabled                 *bool          `json:"enabled,omitempty"`
	Kind                    *AlertRuleKind `json:"kind,omitempty"`
	Severity                *AlertSeverity `json:"severity,omitempty"`
	Query                   map[string]any `json:"query,omitempty"`
	Condition               map[string]any `json:"condition,omitempty"`
	EvaluationWindowSeconds *int           `json:"evaluationWindowSeconds,omitempty"`
	PendingForSeconds       *int           `json:"pendingForSeconds,omitempty"`
	CooldownSeconds         *int           `json:"cooldownSeconds,omitempty"`
	NotificationAdapterIDs  []string       `json:"notificationAdapterIds,omitempty"`
	ExpectedVersion         int            `json:"expectedVersion"`
}

type AlertSilenceCreateInput struct {
	ProjectID string    `json:"projectId"`
	RuleID    string    `json:"ruleId"`
	Reason    string    `json:"reason"`
	StartsAt  time.Time `json:"startsAt"`
	EndsAt    time.Time `json:"endsAt"`
}

type AlertRuleListRequest struct {
	BridgeEnvelope
	ProjectID string                `json:"projectId"`
	Input     *AlertRuleSearchInput `json:"input,omitempty"`
}

type AlertRuleListData struct {
	Items []AlertRule `json:"items"`
}

type AlertRuleListResponse struct {
	RequestID string             `json:"requestId"`
	OK        bool               `json:"ok"`
	Data      *AlertRuleListData `json:"data,omitempty"`
	Error     *BridgeError       `json:"error,omitempty"`
}

type AlertRuleCreateRequest struct {
	BridgeEnvelope
	Input AlertRuleCreateInput `json:"input"`
}

type AlertRuleUpdateRequest struct {
	BridgeEnvelope
	Input AlertRuleUpdateInput `json:"input"`
}

type AlertRuleData struct {
	Rule AlertRule `json:"rule"`
}

type AlertRuleMutationResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      *AlertRuleData `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type AlertRuleDeleteRequest struct {
	BridgeEnvelope
	ID string `json:"id"`
}

type AlertDeleteData struct {
	Deleted bool `json:"deleted"`
}

type AlertDeleteResponse struct {
	RequestID string           `json:"requestId"`
	OK        bool             `json:"ok"`
	Data      *AlertDeleteData `json:"data,omitempty"`
	Error     *BridgeError     `json:"error,omitempty"`
}

type AlertSilenceListRequest struct {
	BridgeEnvelope
	ProjectID string  `json:"projectId"`
	RuleID    *string `json:"ruleId,omitempty"`
}

type AlertSilenceListData struct {
	Items []AlertSilence `json:"items"`
}

type AlertSilenceListResponse struct {
	RequestID string                `json:"requestId"`
	OK        bool                  `json:"ok"`
	Data      *AlertSilenceListData `json:"data,omitempty"`
	Error     *BridgeError          `json:"error,omitempty"`
}

type AlertSilenceCreateRequest struct {
	BridgeEnvelope
	Input AlertSilenceCreateInput `json:"input"`
}

type AlertSilenceData struct {
	Silence AlertSilence `json:"silence"`
}

type AlertSilenceCreateResponse struct {
	RequestID string            `json:"requestId"`
	OK        bool              `json:"ok"`
	Data      *AlertSilenceData `json:"data,omitempty"`
	Error     *BridgeError      `json:"error,omitempty"`
}

type AlertSilenceDeleteRequest struct {
	BridgeEnvelope
	ID string `json:"id"`
}

type AlertHistoryListRequest struct {
	BridgeEnvelope
	ProjectID string  `json:"projectId"`
	RuleID    *string `json:"ruleId,omitempty"`
	First     *int    `json:"first,omitempty"`
	After     *string `json:"after,omitempty"`
}

type AlertHistoryListData struct {
	Connection AlertEventConnection `json:"connection"`
}

type AlertHistoryListResponse struct {
	RequestID string                `json:"requestId"`
	OK        bool                  `json:"ok"`
	Data      *AlertHistoryListData `json:"data,omitempty"`
	Error     *BridgeError          `json:"error,omitempty"`
}

type AlertSummaryRequest struct {
	BridgeEnvelope
	ProjectID string             `json:"projectId"`
	Input     *AlertSummaryInput `json:"input,omitempty"`
}

type AlertSummaryData struct {
	Summary AlertSummary `json:"summary"`
}

type AlertSummaryResponse struct {
	RequestID string            `json:"requestId"`
	OK        bool              `json:"ok"`
	Data      *AlertSummaryData `json:"data,omitempty"`
	Error     *BridgeError      `json:"error,omitempty"`
}

type AlertHistoryRecordRequest struct {
	BridgeEnvelope
	Event AlertEvent `json:"event"`
}

type AlertHistoryRecordResponse struct {
	RequestID string          `json:"requestId"`
	OK        bool            `json:"ok"`
	Data      *AlertEventData `json:"data,omitempty"`
	Error     *BridgeError    `json:"error,omitempty"`
}

type AlertEventData struct {
	Event AlertEvent `json:"event"`
}

type AlertEvaluatorTickRequest struct {
	BridgeEnvelope
	RequestedAt time.Time `json:"requestedAt"`
}

type AlertEvaluatorTickResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      map[string]any `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type AlertRuleEvaluateRequest struct {
	BridgeEnvelope
	RuleID    string     `json:"ruleId"`
	ProjectID string     `json:"projectId"`
	Now       *time.Time `json:"now,omitempty"`
}

type AlertRuleEvaluateResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      map[string]any `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type AlertNotificationDispatchRequest struct {
	BridgeEnvelope
	Event AlertEvent `json:"event"`
}

type AlertNotificationDispatchResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      map[string]any `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type ProjectStatusSnapshotRequest struct {
	BridgeEnvelope
	CompanyID string `json:"companyId"`
	ProjectID string `json:"projectId"`
}

type ProjectStatusSnapshotData struct {
	CompanyID string        `json:"companyId"`
	ProjectID string        `json:"projectId"`
	Status    ProjectStatus `json:"status"`
	ChangedAt time.Time     `json:"changedAt"`
}

type ProjectStatusSnapshotResponse struct {
	RequestID string                     `json:"requestId"`
	OK        bool                       `json:"ok"`
	Data      *ProjectStatusSnapshotData `json:"data,omitempty"`
	Error     *BridgeError               `json:"error,omitempty"`
}

type ProjectStatusChangedNotification struct {
	BridgeEnvelope
	CompanyID string        `json:"companyId"`
	ProjectID string        `json:"projectId"`
	Status    ProjectStatus `json:"status"`
	ChangedAt time.Time     `json:"changedAt"`
}

type TracePersistedNotification struct {
	BridgeEnvelope
	CommandID    string    `json:"commandId"`
	TraceIDs     []string  `json:"traceIds"`
	PersistedAt  time.Time `json:"persistedAt"`
	ServiceNames []string  `json:"serviceNames,omitempty"`
}

type LiveTraceEvent struct {
	SubscriptionID string             `json:"subscriptionId"`
	Type           LiveTraceEventType `json:"type"`
	Seq            int                `json:"seq"`
	ReceivedAt     time.Time          `json:"receivedAt"`
	Trace          *TraceSummary      `json:"trace,omitempty"`
}

type FacetValue struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}

type TraceStructure struct {
	RootSpanIDs         []string                `json:"rootSpanIds"`
	OrphanSpanIDs       []string                `json:"orphanSpanIds"`
	CriticalPathSpanIDs []string                `json:"criticalPathSpanIds"`
	MaxDepth            int                     `json:"maxDepth"`
	ServiceBreakdown    []ServiceTraceBreakdown `json:"serviceBreakdown"`
}

type ServiceTraceBreakdown struct {
	ServiceName            string  `json:"serviceName"`
	SpanCount              int     `json:"spanCount"`
	ErrorSpanCount         int     `json:"errorSpanCount"`
	DurationMs             float64 `json:"durationMs"`
	PercentOfTraceDuration float64 `json:"percentOfTraceDuration"`
}

type SpanMatch struct {
	SpanID string   `json:"spanId"`
	Reason string   `json:"reason"`
	Fields []string `json:"fields"`
}

type TraceWarning struct {
	Code    string  `json:"code"`
	Message string  `json:"message"`
	SpanID  *string `json:"spanId,omitempty"`
}

type PersistTelemetryCommand struct {
	BridgeEnvelope
	CommandID string     `json:"commandId"`
	Source    string     `json:"source"`
	Traces    []Trace    `json:"traces"`
	Spans     []Span     `json:"spans"`
	Logs      []LogEvent `json:"logs"`
}

type IngestCommand struct {
	CommandID        string    `json:"commandId"`
	Source           string    `json:"source"`
	RequestID        string    `json:"requestId"`
	Subject          string    `json:"subject"`
	TraceCount       int       `json:"traceCount"`
	SpanCount        int       `json:"spanCount"`
	LogCount         int       `json:"logCount"`
	MetricPointCount int       `json:"metricPointCount"`
	CompletedAt      time.Time `json:"completedAt"`
}

type MetricKind string

const (
	MetricKindGauge                MetricKind = "gauge"
	MetricKindSum                  MetricKind = "sum"
	MetricKindHistogram            MetricKind = "histogram"
	MetricKindExponentialHistogram MetricKind = "exponential_histogram"
	MetricKindSummary              MetricKind = "summary"
)

type AggregationTemporality string

const (
	AggregationTemporalityUnspecified AggregationTemporality = "unspecified"
	AggregationTemporalityDelta       AggregationTemporality = "delta"
	AggregationTemporalityCumulative  AggregationTemporality = "cumulative"
)

type MetricDescriptor struct {
	ID                     string                  `json:"id"`
	TenantID               string                  `json:"tenantId,omitempty"`
	ProjectID              string                  `json:"projectId,omitempty"`
	Name                   string                  `json:"name"`
	Description            *string                 `json:"description,omitempty"`
	Unit                   string                  `json:"unit"`
	Kind                   MetricKind              `json:"kind"`
	AggregationTemporality *AggregationTemporality `json:"aggregationTemporality,omitempty"`
	Monotonic              *bool                   `json:"monotonic,omitempty"`
	AttributeKeys          []string                `json:"attributeKeys,omitempty"`
	FirstSeenAt            time.Time               `json:"firstSeenAt"`
	LastSeenAt             time.Time               `json:"lastSeenAt"`
}

type QuantileValue struct {
	Quantile float64 `json:"quantile"`
	Value    float64 `json:"value"`
}

type MetricExemplar struct {
	Timestamp  time.Time  `json:"timestamp"`
	Value      float64    `json:"value"`
	TraceID    *string    `json:"traceId,omitempty"`
	SpanID     *string    `json:"spanId,omitempty"`
	Attributes Attributes `json:"attributes"`
}

type MetricPoint struct {
	ID                    string           `json:"id"`
	TenantID              string           `json:"tenantId,omitempty"`
	ProjectID             string           `json:"projectId,omitempty"`
	MetricName            string           `json:"metricName"`
	ServiceName           *string          `json:"serviceName,omitempty"`
	ScopeName             *string          `json:"scopeName,omitempty"`
	Kind                  MetricKind       `json:"kind"`
	Timestamp             time.Time        `json:"timestamp"`
	StartTimestamp        *time.Time       `json:"startTimestamp,omitempty"`
	Value                 *float64         `json:"value,omitempty"`
	Count                 *float64         `json:"count,omitempty"`
	Sum                   *float64         `json:"sum,omitempty"`
	Min                   *float64         `json:"min,omitempty"`
	Max                   *float64         `json:"max,omitempty"`
	BucketCounts          []float64        `json:"bucketCounts,omitempty"`
	ExplicitBounds        []float64        `json:"explicitBounds,omitempty"`
	QuantileValues        []QuantileValue  `json:"quantileValues,omitempty"`
	Attributes            Attributes       `json:"attributes"`
	Exemplars             []MetricExemplar `json:"exemplars"`
	DroppedAttributeCount int              `json:"droppedAttributeCount"`
}

type PersistMetricsCommand struct {
	BridgeEnvelope
	CommandID   string             `json:"commandId"`
	Source      string             `json:"source"`
	Descriptors []MetricDescriptor `json:"descriptors"`
	Points      []MetricPoint      `json:"points"`
}

type AiProjectionKind string

const (
	AiProjectionKindAgentRun       AiProjectionKind = "agent_run"
	AiProjectionKindLLMCall        AiProjectionKind = "llm_call"
	AiProjectionKindToolCall       AiProjectionKind = "tool_call"
	AiProjectionKindRetrievalEvent AiProjectionKind = "retrieval_event"
)

type DatasetSplit string

const (
	DatasetSplitDev          DatasetSplit = "dev"
	DatasetSplitOptimization DatasetSplit = "optimization"
	DatasetSplitValidation   DatasetSplit = "validation"
	DatasetSplitRegression   DatasetSplit = "regression"
	DatasetSplitHoldout      DatasetSplit = "holdout"
)

type DatasetReviewStatus string

const (
	DatasetReviewStatusUnreviewed DatasetReviewStatus = "unreviewed"
	DatasetReviewStatusReviewed   DatasetReviewStatus = "reviewed"
	DatasetReviewStatusRejected   DatasetReviewStatus = "rejected"
)

type ProviderKind string

const (
	ProviderKindOpenAI           ProviderKind = "openai"
	ProviderKindAnthropic        ProviderKind = "anthropic"
	ProviderKindAzureOpenAI      ProviderKind = "azure_openai"
	ProviderKindGoogleVertex     ProviderKind = "google_vertex"
	ProviderKindBedrock          ProviderKind = "bedrock"
	ProviderKindOpenAICompatible ProviderKind = "openai_compatible"
	ProviderKindLocalHarness     ProviderKind = "local_harness"
	ProviderKindCustomHarness    ProviderKind = "custom_harness"
)

type ModelPurpose string

const (
	ModelPurposeJudge     ModelPurpose = "judge"
	ModelPurposeOptimizer ModelPurpose = "optimizer"
	ModelPurposeEmbedding ModelPurpose = "embedding"
	ModelPurposeReplay    ModelPurpose = "replay"
	ModelPurposeDefault   ModelPurpose = "default"
)

type AiProviderKind string

const (
	AiProviderKindAnthropic        AiProviderKind = "anthropic"
	AiProviderKindOpenAI           AiProviderKind = "openai"
	AiProviderKindAzureFoundry     AiProviderKind = "azure_foundry"
	AiProviderKindAWSBedrock       AiProviderKind = "aws_bedrock"
	AiProviderKindOpenAICompatible AiProviderKind = "openai_compatible"
)

type AiModelPurpose string

const (
	AiModelPurposeDefault   AiModelPurpose = "default"
	AiModelPurposeChat      AiModelPurpose = "chat"
	AiModelPurposeJudge     AiModelPurpose = "judge"
	AiModelPurposeOptimizer AiModelPurpose = "optimizer"
	AiModelPurposeEmbedding AiModelPurpose = "embedding"
	AiModelPurposeReplay    AiModelPurpose = "replay"
)

type AiChatConversationStatus string

const (
	AiChatConversationStatusActive   AiChatConversationStatus = "active"
	AiChatConversationStatusArchived AiChatConversationStatus = "archived"
)

type AiChatRunStatus string

const (
	AiChatRunStatusIdle             AiChatRunStatus = "idle"
	AiChatRunStatusQueued           AiChatRunStatus = "queued"
	AiChatRunStatusStreaming        AiChatRunStatus = "streaming"
	AiChatRunStatusCompleted        AiChatRunStatus = "completed"
	AiChatRunStatusFailed           AiChatRunStatus = "failed"
	AiChatRunStatusCancelled        AiChatRunStatus = "cancelled"
	AiChatRunStatusAwaitingApproval AiChatRunStatus = "awaiting_approval"
)

type AiChatRun struct {
	ID                string           `json:"id"`
	ConversationID    string           `json:"conversationId"`
	Status            AiChatRunStatus  `json:"status"`
	ProviderProfileID string           `json:"providerProfileId"`
	Model             string           `json:"model"`
	Artifacts         []map[string]any `json:"artifacts"`
	ActionProposals   []map[string]any `json:"actionProposals"`
	StartedAt         time.Time        `json:"startedAt"`
	CompletedAt       *time.Time       `json:"completedAt,omitempty"`
	Error             *string          `json:"error,omitempty"`
}

type AiChatActionRisk string

const (
	AiChatActionRiskLow         AiChatActionRisk = "low"
	AiChatActionRiskMedium      AiChatActionRisk = "medium"
	AiChatActionRiskHigh        AiChatActionRisk = "high"
	AiChatActionRiskDestructive AiChatActionRisk = "destructive"
)

type AiChatActionStatus string

const (
	AiChatActionStatusProposed  AiChatActionStatus = "proposed"
	AiChatActionStatusApproved  AiChatActionStatus = "approved"
	AiChatActionStatusRejected  AiChatActionStatus = "rejected"
	AiChatActionStatusExecuting AiChatActionStatus = "executing"
	AiChatActionStatusSucceeded AiChatActionStatus = "succeeded"
	AiChatActionStatusFailed    AiChatActionStatus = "failed"
	AiChatActionStatusExpired   AiChatActionStatus = "expired"
)

type PersistAiProjectionCommand struct {
	BridgeEnvelope
	CommandID             string           `json:"commandId"`
	TraceID               string           `json:"traceId"`
	SpanID                string           `json:"spanId"`
	Kind                  AiProjectionKind `json:"kind"`
	Projection            map[string]any   `json:"projection"`
	SourceFlavor          *string          `json:"sourceFlavor,omitempty"`
	NormalizationWarnings []string         `json:"normalizationWarnings,omitempty"`
}

type AiProjectionPersistedNotification struct {
	RequestID     string             `json:"requestId"`
	TenantID      *string            `json:"tenantId,omitempty"`
	ProjectID     *string            `json:"projectId,omitempty"`
	TraceID       string             `json:"traceId"`
	ProjectionIDs []string           `json:"projectionIds"`
	SpanIDs       []string           `json:"spanIds,omitempty"`
	Kinds         []AiProjectionKind `json:"kinds"`
	PersistedAt   time.Time          `json:"persistedAt"`
}

type EvalQueryRequest struct {
	BridgeEnvelope
	Input map[string]any `json:"input,omitempty"`
}

type EvalQueryResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      map[string]any `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type EvalMutationRequest struct {
	BridgeEnvelope
	Input map[string]any `json:"input"`
}

type EvalMutationResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      map[string]any `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type DatasetCreateRequest struct {
	BridgeEnvelope
	ProjectID      string         `json:"projectId"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Input          map[string]any `json:"input"`
}

type DatasetSearchRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type DatasetItemsAppendRequest struct {
	BridgeEnvelope
	ProjectID              string           `json:"projectId"`
	DatasetID              string           `json:"datasetId"`
	ExpectedDatasetVersion int              `json:"expectedDatasetVersion"`
	IdempotencyKey         string           `json:"idempotencyKey"`
	Input                  []map[string]any `json:"input"`
}

type DatasetSettingsUpdateRequest struct {
	BridgeEnvelope
	ProjectID                string         `json:"projectId"`
	DatasetID                string         `json:"datasetId"`
	ExpectedDatasetVersionID string         `json:"expectedDatasetVersionId"`
	IdempotencyKey           string         `json:"idempotencyKey"`
	Input                    map[string]any `json:"input"`
}

type DatasetItemPromoteRequest struct {
	BridgeEnvelope
	ProjectID      string         `json:"projectId"`
	DatasetID      string         `json:"datasetId"`
	SourceRef      map[string]any `json:"sourceRef"`
	IdempotencyKey string         `json:"idempotencyKey"`
}

type DatasetItemUpdateRequest struct {
	BridgeEnvelope
	ProjectID              string         `json:"projectId"`
	DatasetID              string         `json:"datasetId"`
	DatasetItemID          string         `json:"datasetItemId"`
	ExpectedDatasetVersion int            `json:"expectedDatasetVersion"`
	IdempotencyKey         string         `json:"idempotencyKey"`
	Input                  map[string]any `json:"input"`
}

type DatasetVersionGetRequest struct {
	BridgeEnvelope
	ProjectID        string `json:"projectId"`
	DatasetVersionID string `json:"datasetVersionId"`
}

type DatasetHealthRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
	DatasetID string `json:"datasetId"`
}

type DatasetImportPrepareRequest struct {
	BridgeEnvelope
	ProjectID      string `json:"projectId"`
	DatasetID      string `json:"datasetId"`
	StagedUploadID string `json:"stagedUploadId"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type DatasetImportCommitRequest struct {
	BridgeEnvelope
	ProjectID              string `json:"projectId"`
	DatasetID              string `json:"datasetId"`
	ImportJobID            string `json:"importJobId"`
	ExpectedDatasetVersion int    `json:"expectedDatasetVersion"`
	IdempotencyKey         string `json:"idempotencyKey"`
}

type DatasetExportStartRequest struct {
	BridgeEnvelope
	ProjectID        string `json:"projectId"`
	DatasetID        string `json:"datasetId"`
	DatasetVersionID string `json:"datasetVersionId"`
	IdempotencyKey   string `json:"idempotencyKey"`
}

type DatasetTransferGetRequest struct {
	BridgeEnvelope
	ProjectID    string `json:"projectId"`
	TransferID   string `json:"transferId"`
	TransferKind string `json:"transferKind"`
}

type EvaluationCreateRequest struct {
	BridgeEnvelope
	ProjectID      string         `json:"projectId"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Input          map[string]any `json:"input"`
}

type EvaluationUpdateRequest struct {
	BridgeEnvelope
	ProjectID              string         `json:"projectId"`
	EvaluationDefinitionID string         `json:"evaluationDefinitionId"`
	IdempotencyKey         string         `json:"idempotencyKey"`
	Input                  map[string]any `json:"input"`
}

type EvaluationSearchRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type EvaluationRunStartRequest struct {
	BridgeEnvelope
	ProjectID        string `json:"projectId"`
	DatasetVersionID string `json:"datasetVersionId"`
	TargetSnapshotID string `json:"targetSnapshotId"`
	IdempotencyKey   string `json:"idempotencyKey"`
}

type EvaluationRunControlRequest struct {
	BridgeEnvelope
	ProjectID       string `json:"projectId"`
	EvaluationRunID string `json:"evaluationRunId"`
	IdempotencyKey  string `json:"idempotencyKey"`
}

type EvaluationRunSearchRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type EvaluationRunGetRequest struct {
	BridgeEnvelope
	ProjectID       string `json:"projectId"`
	EvaluationRunID string `json:"evaluationRunId"`
}

type EvaluationResultsSearchRequest struct {
	BridgeEnvelope
	ProjectID       string `json:"projectId"`
	EvaluationRunID string `json:"evaluationRunId"`
}

type EvaluationResultsPersistRequest struct {
	BridgeEnvelope
	ProjectID       string         `json:"projectId"`
	EvaluationRunID string         `json:"evaluationRunId"`
	IdempotencyKey  string         `json:"idempotencyKey"`
	Payload         map[string]any `json:"payload"`
}

type EvaluationComparisonCreateRequest struct {
	BridgeEnvelope
	ProjectID      string `json:"projectId"`
	BaselineRunID  string `json:"baselineRunId"`
	CandidateRunID string `json:"candidateRunId"`
	IdempotencyKey string `json:"idempotencyKey"`
}

type EvaluationComparisonSearchRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type TargetSnapshotCreateRequest struct {
	BridgeEnvelope
	ProjectID      string         `json:"projectId"`
	TargetRef      map[string]any `json:"targetRef"`
	IdempotencyKey string         `json:"idempotencyKey"`
	Input          map[string]any `json:"input"`
}

type TargetSnapshotGetRequest struct {
	BridgeEnvelope
	ProjectID        string `json:"projectId"`
	TargetSnapshotID string `json:"targetSnapshotId"`
}

type TargetDiffRequest struct {
	BridgeEnvelope
	ProjectID           string `json:"projectId"`
	BaselineSnapshotID  string `json:"baselineSnapshotId"`
	CandidateSnapshotID string `json:"candidateSnapshotId"`
}

type OptimizationSearchRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type OptimizationGetRequest struct {
	BridgeEnvelope
	ProjectID         string `json:"projectId"`
	OptimizationRunID string `json:"optimizationRunId"`
}

type TargetPromoteRequest struct {
	BridgeEnvelope
	ProjectID           string         `json:"projectId"`
	TargetRef           map[string]any `json:"targetRef"`
	CandidateSnapshotID string         `json:"candidateSnapshotId"`
	ComparisonID        string         `json:"comparisonId"`
	IdempotencyKey      string         `json:"idempotencyKey"`
}

type IngestCredentialListRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type IngestCredentialCreateRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
	Title     string `json:"title"`
}

type IngestCredentialRevokeRequest struct {
	BridgeEnvelope
	CredentialID string `json:"credentialId"`
}

type DatasetCandidateSource struct {
	SourceKind      string  `json:"sourceKind"`
	TraceID         *string `json:"traceId,omitempty"`
	SpanID          *string `json:"spanId,omitempty"`
	EvalResultID    *string `json:"evalResultId,omitempty"`
	ExperimentRunID *string `json:"experimentRunId,omitempty"`
	PolicyID        *string `json:"policyId,omitempty"`
	CoverageGapID   *string `json:"coverageGapId,omitempty"`
	HealthIssueID   *string `json:"healthIssueId,omitempty"`
	ClusterID       *string `json:"clusterId,omitempty"`
}

type DatasetCandidatesPrepareRequest struct {
	BridgeEnvelope
	ProjectID                  string                   `json:"projectId"`
	DatasetID                  *string                  `json:"datasetId,omitempty"`
	Sources                    []DatasetCandidateSource `json:"sources"`
	TargetShape                *string                  `json:"targetShape,omitempty"`
	Split                      *string                  `json:"split,omitempty"`
	ReviewStatus               *string                  `json:"reviewStatus,omitempty"`
	ContentTreatment           *string                  `json:"contentTreatment,omitempty"`
	AnonymizationPolicyID      *string                  `json:"anonymizationPolicyId,omitempty"`
	AnonymizationPolicyVersion *int                     `json:"anonymizationPolicyVersion,omitempty"`
	IdempotencyKey             string                   `json:"idempotencyKey"`
}

type DatasetCandidatesSearchRequest struct {
	BridgeEnvelope
	ProjectID        string  `json:"projectId"`
	DatasetID        *string `json:"datasetId,omitempty"`
	Status           *string `json:"status,omitempty"`
	SourceKind       *string `json:"sourceKind,omitempty"`
	TargetShape      *string `json:"targetShape,omitempty"`
	ContentTreatment *string `json:"contentTreatment,omitempty"`
	ClusterID        *string `json:"clusterId,omitempty"`
	Query            *string `json:"query,omitempty"`
	Limit            *int    `json:"limit,omitempty"`
	Cursor           *string `json:"cursor,omitempty"`
}

type DatasetCandidatesCommitRequest struct {
	BridgeEnvelope
	ProjectID              string   `json:"projectId"`
	DatasetID              string   `json:"datasetId"`
	ExpectedDatasetVersion int      `json:"expectedDatasetVersion"`
	CandidateIDs           []string `json:"candidateIds"`
	Split                  *string  `json:"split,omitempty"`
	ReviewStatus           *string  `json:"reviewStatus,omitempty"`
	IdempotencyKey         string   `json:"idempotencyKey"`
}

type DatasetCandidate struct {
	ID               string                          `json:"id"`
	DatasetID        *string                         `json:"datasetId,omitempty"`
	Status           string                          `json:"status"`
	SourceKind       string                          `json:"sourceKind"`
	Source           map[string]any                  `json:"source"`
	TargetShape      string                          `json:"targetShape"`
	Input            any                             `json:"input,omitempty"`
	Expected         any                             `json:"expected,omitempty"`
	Metadata         map[string]any                  `json:"metadata"`
	Split            string                          `json:"split"`
	ReviewStatus     string                          `json:"reviewStatus"`
	ContentTreatment string                          `json:"contentTreatment"`
	Anonymization    *DatasetAnonymizationProvenance `json:"anonymization,omitempty"`
	Reason           string                          `json:"reason"`
	ClusterID        *string                         `json:"clusterId,omitempty"`
	Warnings         []string                        `json:"warnings"`
	CreatedAt        time.Time                       `json:"createdAt"`
	UpdatedAt        time.Time                       `json:"updatedAt"`
}

type DatasetAnonymizationProvenance struct {
	PolicyID          string                   `json:"policyId"`
	PolicyVersion     int                      `json:"policyVersion"`
	TransformedAt     time.Time                `json:"transformedAt"`
	ConsistencyScope  string                   `json:"consistencyScope"`
	TransformedFields []DatasetAnonymizedField `json:"transformedFields"`
}

type DatasetAnonymizedField struct {
	Path       string `json:"path"`
	EntityType string `json:"entityType"`
	Strategy   string `json:"strategy"`
}

type DatasetCandidatesData struct {
	Items      []DatasetCandidate `json:"items"`
	NextCursor *string            `json:"nextCursor,omitempty"`
}

type DatasetCandidatesResponse struct {
	RequestID string                 `json:"requestId"`
	OK        bool                   `json:"ok"`
	Data      *DatasetCandidatesData `json:"data,omitempty"`
	Error     *BridgeError           `json:"error,omitempty"`
}

type VersionedRef struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

type EvalSolverRef struct {
	Kind              string        `json:"kind"`
	Name              string        `json:"name"`
	PromptVersion     *VersionedRef `json:"promptVersion,omitempty"`
	AgentRef          *string       `json:"agentRef,omitempty"`
	WorkflowRef       *string       `json:"workflowRef,omitempty"`
	SkillSnapshotRef  *string       `json:"skillSnapshotRef,omitempty"`
	ToolSnapshotRef   *string       `json:"toolSnapshotRef,omitempty"`
	ModelAlias        *string       `json:"modelAlias,omitempty"`
	ProviderProfileID *string       `json:"providerProfileId,omitempty"`
}

type EvalBaselineRef struct {
	Kind            string         `json:"kind"`
	ExperimentRunID *string        `json:"experimentRunId,omitempty"`
	PromptVersion   *VersionedRef  `json:"promptVersion,omitempty"`
	SolverRef       *EvalSolverRef `json:"solverRef,omitempty"`
}

type DatasetSplitSelector struct {
	Splits           []string `json:"splits"`
	ReviewedOnly     bool     `json:"reviewedOnly"`
	IncludeSynthetic bool     `json:"includeSynthetic"`
}

type BootstrapFewshotConfig struct {
	CandidateCount          int      `json:"candidateCount"`
	MaxExamplesPerCandidate int      `json:"maxExamplesPerCandidate"`
	SelectionScorerIDs      []string `json:"selectionScorerIds"`
	Seed                    int      `json:"seed"`
	DiversityStrategy       *string  `json:"diversityStrategy,omitempty"`
}

type CriticMutateJudgePickConfig struct {
	CandidateCount       int      `json:"candidateCount"`
	MutationInstructions string   `json:"mutationInstructions"`
	JudgeScorerIDs       []string `json:"judgeScorerIds"`
	Seed                 int      `json:"seed"`
	MaxRounds            int      `json:"maxRounds"`
	KeepTopK             *int     `json:"keepTopK,omitempty"`
}

type OptimizerKind string

const (
	OptimizerKindBootstrapFewshot      OptimizerKind = "bootstrap_fewshot"
	OptimizerKindCriticMutateJudgePick OptimizerKind = "critic_mutate_judge_pick"
)

type OptimizationConfig struct {
	OptimizerKind         OptimizerKind                `json:"optimizerKind"`
	BootstrapFewshot      *BootstrapFewshotConfig      `json:"bootstrapFewshot,omitempty"`
	CriticMutateJudgePick *CriticMutateJudgePickConfig `json:"criticMutateJudgePick,omitempty"`
}

type EvalRunPolicy struct {
	MaxParallelRequests int            `json:"maxParallelRequests"`
	TokenBudget         map[string]any `json:"tokenBudget,omitempty"`
	CostBudget          map[string]any `json:"costBudget,omitempty"`
	RateLimit           map[string]any `json:"rateLimit,omitempty"`
	Retry               map[string]any `json:"retry,omitempty"`
	Timeout             map[string]any `json:"timeout,omitempty"`
	FailureBudget       map[string]any `json:"failureBudget,omitempty"`
	Backpressure        map[string]any `json:"backpressure,omitempty"`
	Checkpoint          map[string]any `json:"checkpoint,omitempty"`
	Quarantine          map[string]any `json:"quarantine,omitempty"`
	WorkspaceQuota      map[string]any `json:"workspaceQuota,omitempty"`
	CleanupRetry        map[string]any `json:"cleanupRetry,omitempty"`
}

type ExperimentStartRequest struct {
	BridgeEnvelope
	ExperimentID  string         `json:"experimentId"`
	SolverRef     *EvalSolverRef `json:"solverRef,omitempty"`
	SplitSelector map[string]any `json:"splitSelector,omitempty"`
	RunPolicy     *EvalRunPolicy `json:"runPolicy,omitempty"`
}

type ExperimentCancelRequest struct {
	BridgeEnvelope
	ExperimentRunID string `json:"experimentRunId"`
}

type ExperimentRunControlRequest struct {
	BridgeEnvelope
	ExperimentRunID        string  `json:"experimentRunId"`
	Command                string  `json:"command"`
	ExpectedManifestDigest *string `json:"expectedManifestDigest,omitempty"`
	IdempotencyKey         *string `json:"idempotencyKey,omitempty"`
}

type OptimizationStartRequest struct {
	BridgeEnvelope
	ProjectID           string              `json:"projectId"`
	DatasetVersionID    string              `json:"datasetVersionId"`
	TargetSnapshotID    string              `json:"targetSnapshotId"`
	IdempotencyKey      string              `json:"idempotencyKey"`
	ExperimentID        string              `json:"experimentId"`
	OptimizerKind       OptimizerKind       `json:"optimizerKind"`
	BasePromptVersionID string              `json:"basePromptVersionId"`
	SplitSelector       map[string]any      `json:"splitSelector,omitempty"`
	Config              *OptimizationConfig `json:"config,omitempty"`
	RunPolicy           *EvalRunPolicy      `json:"runPolicy,omitempty"`
}

type ExperimentStartData struct {
	ExperimentRunID string `json:"experimentRunId"`
	Status          string `json:"status"`
}

type ExperimentStartResponse struct {
	RequestID string               `json:"requestId"`
	OK        bool                 `json:"ok"`
	Data      *ExperimentStartData `json:"data,omitempty"`
	Error     *BridgeError         `json:"error,omitempty"`
}

type EvalLiveStartRequest struct {
	BridgeEnvelope
	SubscriptionID  string `json:"subscriptionId"`
	EvaluationRunID string `json:"evaluationRunId"`
	ExperimentRunID string `json:"experimentRunId"`
	SinkSubject     string `json:"sinkSubject"`
}

type EvalLiveStartData struct {
	SubscriptionID      string `json:"subscriptionId"`
	HeartbeatIntervalMs int    `json:"heartbeatIntervalMs"`
}

type EvalLiveStartResponse struct {
	RequestID string             `json:"requestId"`
	OK        bool               `json:"ok"`
	Data      *EvalLiveStartData `json:"data,omitempty"`
	Error     *BridgeError       `json:"error,omitempty"`
}

type EvalLiveStopRequest struct {
	BridgeEnvelope
	SubscriptionID string `json:"subscriptionId"`
}

type EvalLiveStopData struct {
	SubscriptionID string `json:"subscriptionId"`
}

type EvalLiveStopResponse struct {
	RequestID string            `json:"requestId"`
	OK        bool              `json:"ok"`
	Data      *EvalLiveStopData `json:"data,omitempty"`
	Error     *BridgeError      `json:"error,omitempty"`
}

type ExperimentRunEvent struct {
	Type            string         `json:"type"`
	Seq             int            `json:"seq"`
	ReceivedAt      time.Time      `json:"receivedAt"`
	ExperimentRunID *string        `json:"experimentRunId,omitempty"`
	Run             map[string]any `json:"run,omitempty"`
	ItemRun         map[string]any `json:"itemRun,omitempty"`
}

type ExperimentProgressNotification struct {
	RequestID        string    `json:"requestId"`
	ExperimentRunID  string    `json:"experimentRunId"`
	Type             string    `json:"type"`
	DatasetItemRunID *string   `json:"datasetItemRunId,omitempty"`
	OccurredAt       time.Time `json:"occurredAt"`
}

type ExperimentManifestResolveRequest struct {
	BridgeEnvelope
	ExperimentRunID     string              `json:"experimentRunId"`
	ExperimentID        string              `json:"experimentId"`
	SplitSelector       map[string]any      `json:"splitSelector,omitempty"`
	OptimizerKind       *OptimizerKind      `json:"optimizerKind,omitempty"`
	BasePromptVersionID *string             `json:"basePromptVersionId,omitempty"`
	OptimizationConfig  *OptimizationConfig `json:"optimizationConfig,omitempty"`
}

type ExperimentManifestResolveResponse struct {
	RequestID string                  `json:"requestId"`
	OK        bool                    `json:"ok"`
	Data      *ExperimentManifestData `json:"data,omitempty"`
	Error     *BridgeError            `json:"error,omitempty"`
}

type ExperimentManifestData struct {
	Manifest ExperimentManifest `json:"manifest"`
}

type ExperimentManifest struct {
	Schema              string               `json:"schema"`
	Version             int                  `json:"version"`
	Digest              string               `json:"digest"`
	ExperimentRunID     string               `json:"experimentRunId"`
	ExperimentID        string               `json:"experimentId"`
	DatasetID           string               `json:"datasetId"`
	DatasetVersion      int                  `json:"datasetVersion"`
	SplitSelector       DatasetSplitSelector `json:"splitSelector"`
	DatasetItemIDs      []string             `json:"datasetItemIds"`
	ScorerRefs          []VersionedRef       `json:"scorerRefs"`
	BaselineRef         *EvalBaselineRef     `json:"baselineRef,omitempty"`
	SolverRef           EvalSolverRef        `json:"solverRef"`
	OptimizationConfig  *OptimizationConfig  `json:"optimizationConfig,omitempty"`
	PromptVersionRefs   []string             `json:"promptVersionRefs"`
	SkillSnapshotRefs   []string             `json:"skillSnapshotRefs"`
	ToolSnapshotRefs    []string             `json:"toolSnapshotRefs"`
	ProviderProfileRefs []string             `json:"providerProfileRefs"`
	Budget              map[string]any       `json:"budget"`
	Concurrency         map[string]any       `json:"concurrency"`
	RunPolicy           EvalRunPolicy        `json:"runPolicy"`
	CreatedAt           time.Time            `json:"createdAt"`
}

type ExperimentRunSummary struct {
	ItemCounts     EvalItemCounts          `json:"itemCounts"`
	ScoreSummaries []EvalScoreSummary      `json:"scoreSummaries"`
	ProblemCounts  EvalProblemCounts       `json:"problemCounts"`
	BudgetUsage    EvalBudgetUsage         `json:"budgetUsage"`
	Latency        *EvalLatencySummary     `json:"latency,omitempty"`
	Regressions    []EvalRegressionSummary `json:"regressions"`
}

type EvalItemCounts struct {
	Total       int `json:"total"`
	Passed      int `json:"passed"`
	Failed      int `json:"failed"`
	Errored     int `json:"errored"`
	Skipped     int `json:"skipped"`
	NeedsReview int `json:"needsReview"`
	Quarantined int `json:"quarantined"`
}

type EvalScoreSummary struct {
	ScorerID      string         `json:"scorerId"`
	ScorerVersion int            `json:"scorerVersion"`
	ResultKind    *string        `json:"resultKind,omitempty"`
	PassRate      float64        `json:"passRate"`
	MeanScore     float64        `json:"meanScore"`
	P50           *float64       `json:"p50,omitempty"`
	P95           *float64       `json:"p95,omitempty"`
	Support       int            `json:"support"`
	Visualization map[string]any `json:"visualization,omitempty"`
}

type EvalProblemCounts struct {
	ModelQuality   int `json:"modelQuality"`
	ItemQuality    int `json:"itemQuality"`
	ScorerConfig   int `json:"scorerConfig"`
	Infrastructure int `json:"infrastructure"`
}

type EvalBudgetUsage struct {
	InputTokens  int     `json:"inputTokens"`
	OutputTokens int     `json:"outputTokens"`
	TotalTokens  int     `json:"totalTokens"`
	EstimatedUSD float64 `json:"estimatedUsd"`
}

type EvalLatencySummary struct {
	P50Ms *float64 `json:"p50Ms,omitempty"`
	P95Ms *float64 `json:"p95Ms,omitempty"`
	MaxMs *float64 `json:"maxMs,omitempty"`
}

type EvalRegressionSummary struct {
	Kind    string `json:"kind"`
	Count   int    `json:"count"`
	Blocker *bool  `json:"blocker,omitempty"`
}

type OnlinePolicyMatchesResolveRequest struct {
	BridgeEnvelope
	ProjectID     string             `json:"projectId"`
	TraceID       string             `json:"traceId"`
	ProjectionIDs []string           `json:"projectionIds"`
	SpanIDs       []string           `json:"spanIds,omitempty"`
	Kinds         []AiProjectionKind `json:"kinds"`
	PersistedAt   time.Time          `json:"persistedAt"`
}

type OnlinePolicyMatchesResolveResponse struct {
	RequestID string                          `json:"requestId"`
	OK        bool                            `json:"ok"`
	Data      *OnlinePolicyMatchesResolveData `json:"data,omitempty"`
	Error     *BridgeError                    `json:"error,omitempty"`
}

type OnlinePolicyMatchesResolveData struct {
	Matches    []OnlinePolicyMatch             `json:"matches"`
	Projection OnlinePolicyProjectionReadModel `json:"projection"`
	RunPolicy  *EvalRunPolicy                  `json:"runPolicy,omitempty"`
	Warnings   []string                        `json:"warnings"`
}

type OnlinePolicyMatch struct {
	PolicyID      string                  `json:"policyId"`
	PolicyVersion int                     `json:"policyVersion"`
	PolicyName    string                  `json:"policyName"`
	Target        OnlinePolicyTarget      `json:"target"`
	SampleRate    float64                 `json:"sampleRate"`
	MaxDailyRuns  *int                    `json:"maxDailyRuns,omitempty"`
	ScorerRefs    []OnlinePolicyScorerRef `json:"scorerRefs"`
}

type OnlinePolicyScorerRef struct {
	ScorerID      string `json:"scorerId"`
	ScorerVersion int    `json:"scorerVersion"`
	Kind          string `json:"kind"`
}

type OnlinePolicyTarget struct {
	AgentID         *string                       `json:"agentId,omitempty"`
	AgentName       *string                       `json:"agentName,omitempty"`
	Environment     *string                       `json:"environment,omitempty"`
	ServiceName     *string                       `json:"serviceName,omitempty"`
	Route           *string                       `json:"route,omitempty"`
	RoutePrefix     *string                       `json:"routePrefix,omitempty"`
	ToolName        *string                       `json:"toolName,omitempty"`
	RetrievalSource *string                       `json:"retrievalSource,omitempty"`
	Model           *string                       `json:"model,omitempty"`
	PromptVersionID *string                       `json:"promptVersionId,omitempty"`
	ExperimentRunID *string                       `json:"experimentRunId,omitempty"`
	Attributes      []OnlinePolicyAttributeFilter `json:"attributes,omitempty"`
}

type OnlinePolicyAttributeFilter struct {
	Key      string                  `json:"key"`
	Operator AttributeFilterOperator `json:"operator"`
	Value    any                     `json:"value,omitempty"`
}

type OnlinePolicyProjectionReadModel struct {
	ProjectID       string           `json:"projectId"`
	TraceID         string           `json:"traceId"`
	SpanID          *string          `json:"spanId,omitempty"`
	ProjectionID    string           `json:"projectionId"`
	Kind            AiProjectionKind `json:"kind"`
	AgentID         *string          `json:"agentId,omitempty"`
	AgentName       *string          `json:"agentName,omitempty"`
	Environment     *string          `json:"environment,omitempty"`
	ServiceName     *string          `json:"serviceName,omitempty"`
	Route           *string          `json:"route,omitempty"`
	ToolName        *string          `json:"toolName,omitempty"`
	RetrievalSource *string          `json:"retrievalSource,omitempty"`
	Model           *string          `json:"model,omitempty"`
	PromptVersionID *string          `json:"promptVersionId,omitempty"`
	ExperimentRunID *string          `json:"experimentRunId,omitempty"`
	SafeAttributes  map[string]any   `json:"safeAttributes"`
}

type ProjectAiSettingsGetRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type ProjectAiSettingsGetResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      map[string]any `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type ProjectAiSettingsUpdateRequest struct {
	BridgeEnvelope
	Input           map[string]any `json:"input"`
	ExpectedVersion *int           `json:"expectedVersion,omitempty"`
}

type ProjectAiSettingsUpdateResponse struct {
	RequestID string         `json:"requestId"`
	OK        bool           `json:"ok"`
	Data      map[string]any `json:"data,omitempty"`
	Error     *BridgeError   `json:"error,omitempty"`
}

type ProjectAiProviderSettingsGetRequest struct {
	BridgeEnvelope
	ProjectID string `json:"projectId"`
}

type ProjectAiProviderSettingsUpdateRequest struct {
	BridgeEnvelope
	ProjectID        string           `json:"projectId"`
	ProviderProfiles []map[string]any `json:"providerProfiles"`
	ModelAliases     []map[string]any `json:"modelAliases"`
	ExpectedVersion  int              `json:"expectedVersion"`
}

type CompanyAiProviderSettingsGetRequest struct {
	BridgeEnvelope
	CompanyID string `json:"companyId"`
}

type CompanyAiProviderSettingsUpdateRequest struct {
	BridgeEnvelope
	CompanyID       string         `json:"companyId"`
	ProviderProfile map[string]any `json:"providerProfile"`
	ChatModelAlias  map[string]any `json:"chatModelAlias"`
	ExpectedVersion int            `json:"expectedVersion"`
}

type AiProviderSecretResolveRequest struct {
	BridgeEnvelope
	CredentialRef string `json:"credentialRef"`
}

type AiChatHistoryRequest struct {
	BridgeEnvelope
	CompanyID       string  `json:"companyId"`
	UserID          string  `json:"userId"`
	ProjectID       *string `json:"projectId,omitempty"`
	IncludeArchived bool    `json:"includeArchived,omitempty"`
	First           *int    `json:"first,omitempty"`
	After           *string `json:"after,omitempty"`
}

type AiChatConversationGetRequest struct {
	BridgeEnvelope
	ConversationID string `json:"conversationId"`
}

type AiChatConversationCreateRequest struct {
	BridgeEnvelope
	CompanyID        string  `json:"companyId"`
	ProjectID        string  `json:"projectId"`
	UserID           string  `json:"userId"`
	Title            *string `json:"title,omitempty"`
	FirstUserMessage string  `json:"firstUserMessage"`
}

type AiChatConversationArchiveRequest struct {
	BridgeEnvelope
	ConversationID  string `json:"conversationId"`
	UserID          string `json:"userId"`
	ExpectedVersion int    `json:"expectedVersion"`
}

type AiChatConversationDeleteRequest struct {
	BridgeEnvelope
	ConversationID string `json:"conversationId"`
	UserID         string `json:"userId"`
}

type AiChatMessageAppendRequest struct {
	BridgeEnvelope
	ConversationID string           `json:"conversationId"`
	RunID          string           `json:"runId"`
	Role           string           `json:"role"`
	Parts          []map[string]any `json:"parts"`
}

type AiChatRunCreateRequest struct {
	BridgeEnvelope
	ConversationID      string  `json:"conversationId"`
	ProjectID           string  `json:"projectId"`
	UserID              string  `json:"userId"`
	UserMessageClientID string  `json:"userMessageClientId"`
	IdempotencyKey      string  `json:"idempotencyKey"`
	ProviderKind        string  `json:"providerKind"`
	ProviderProfileID   string  `json:"providerProfileId"`
	Model               string  `json:"model"`
	TraceID             *string `json:"traceId,omitempty"`
}

type AiChatRunUpdateRequest struct {
	BridgeEnvelope
	RunID              string          `json:"runId"`
	Status             AiChatRunStatus `json:"status"`
	ToolCallCount      *int            `json:"toolCallCount,omitempty"`
	SandboxScriptCount *int            `json:"sandboxScriptCount,omitempty"`
	ArtifactCount      *int            `json:"artifactCount,omitempty"`
	InputTokenCount    *int            `json:"inputTokenCount,omitempty"`
	OutputTokenCount   *int            `json:"outputTokenCount,omitempty"`
	EstimatedCostUSD   *float64        `json:"estimatedCostUsd,omitempty"`
	Error              *string         `json:"error,omitempty"`
}

type AiChatRunFinalizeRequest struct {
	BridgeEnvelope
	RunID              string          `json:"runId"`
	Status             AiChatRunStatus `json:"status"`
	ToolCallCount      *int            `json:"toolCallCount,omitempty"`
	SandboxScriptCount *int            `json:"sandboxScriptCount,omitempty"`
	ArtifactCount      *int            `json:"artifactCount,omitempty"`
	InputTokenCount    *int            `json:"inputTokenCount,omitempty"`
	OutputTokenCount   *int            `json:"outputTokenCount,omitempty"`
	EstimatedCostUSD   *float64        `json:"estimatedCostUsd,omitempty"`
	Error              *string         `json:"error,omitempty"`
}

type AiChatRunMutationData struct {
	Run AiChatRun `json:"run"`
}

type AiChatRunMutationResponse struct {
	RequestID string                 `json:"requestId"`
	OK        bool                   `json:"ok"`
	Data      *AiChatRunMutationData `json:"data,omitempty"`
	Error     *BridgeError           `json:"error,omitempty"`
}

type AiChatActionProposeRequest struct {
	BridgeEnvelope
	ConversationID   string         `json:"conversationId"`
	RunID            string         `json:"runId"`
	ProjectID        string         `json:"projectId"`
	Title            string         `json:"title"`
	Description      *string        `json:"description,omitempty"`
	Risk             string         `json:"risk"`
	ActionKind       string         `json:"actionKind"`
	GraphQLMutation  *string        `json:"graphqlMutation,omitempty"`
	InputPreview     map[string]any `json:"inputPreview"`
	RequiresApproval bool           `json:"requiresApproval"`
	IdempotencyKey   string         `json:"idempotencyKey"`
	ExpiresAt        string         `json:"expiresAt"`
}

type AiChatActionApproveRequest struct {
	BridgeEnvelope
	ActionProposalID string  `json:"actionProposalId"`
	IdempotencyKey   string  `json:"idempotencyKey"`
	Approved         bool    `json:"approved"`
	UserID           string  `json:"userId"`
	Reason           *string `json:"reason,omitempty"`
	ExpectedVersion  int     `json:"expectedVersion"`
}

type AiChatActionFinishRequest struct {
	BridgeEnvelope
	ActionProposalID string         `json:"actionProposalId"`
	Status           string         `json:"status"`
	Result           map[string]any `json:"result,omitempty"`
}

type AiChatCompactionSaveRequest struct {
	BridgeEnvelope
	ConversationID     string   `json:"conversationId"`
	SourceMessageCount int      `json:"sourceMessageCount"`
	Summary            string   `json:"summary"`
	RetainedMessageIDs []string `json:"retainedMessageIds"`
	ArtifactSummaries  []string `json:"artifactSummaries"`
	PendingActionIDs   []string `json:"pendingActionIds"`
}
