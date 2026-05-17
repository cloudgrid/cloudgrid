package internal

import (
	"time"

	contracts "github.com/cloudgrid-dev/cloudgrid/core/go-contracts"
)

type DashboardVisibility string

const (
	DashboardVisibilityBuiltin  DashboardVisibility = "builtin"
	DashboardVisibilityProject  DashboardVisibility = "project"
	DashboardVisibilityPersonal DashboardVisibility = "personal"
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
)

type DashboardThresholdSeverity string

const (
	DashboardThresholdSeverityInfo    DashboardThresholdSeverity = "info"
	DashboardThresholdSeverityWarning DashboardThresholdSeverity = "warning"
	DashboardThresholdSeverityError   DashboardThresholdSeverity = "error"
)

type DashboardListInput struct {
	IncludeBuiltins *bool                `json:"includeBuiltins,omitempty"`
	Query           *string              `json:"query,omitempty"`
	Tag             *string              `json:"tag,omitempty"`
	Visibility      *DashboardVisibility `json:"visibility,omitempty"`
	PinnedOnly      *bool                `json:"pinnedOnly,omitempty"`
}

type DashboardSaveInput struct {
	ID                *string                `json:"id,omitempty"`
	Version           *int                   `json:"version,omitempty"`
	Name              string                 `json:"name"`
	Description       *string                `json:"description,omitempty"`
	Tags              []string               `json:"tags,omitempty"`
	Visibility        *DashboardVisibility   `json:"visibility,omitempty"`
	DefaultTimeWindow *string                `json:"defaultTimeWindow,omitempty"`
	Widgets           []DashboardWidgetInput `json:"widgets"`
}

type DashboardWidgetLayoutInput struct {
	X    int  `json:"x"`
	Y    int  `json:"y"`
	W    int  `json:"w"`
	H    int  `json:"h"`
	MinW *int `json:"minW,omitempty"`
	MinH *int `json:"minH,omitempty"`
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
}

type DashboardMetricWidgetInput struct {
	MetricName    string                      `json:"metricName"`
	Aggregation   contracts.MetricAggregation `json:"aggregation"`
	GroupBy       []string                    `json:"groupBy"`
	Filters       []contracts.AttributeFilter `json:"filters"`
	TimeWindow    *string                     `json:"timeWindow,omitempty"`
	Interval      *string                     `json:"interval,omitempty"`
	Visualization contracts.MetricChartType   `json:"visualization"`
	Legend        *bool                       `json:"legend,omitempty"`
	MaxSeries     *int                        `json:"maxSeries,omitempty"`
	Thresholds    []DashboardThresholdInput   `json:"thresholds"`
}

type DashboardRichMetricWidgetInput struct {
	Query         DashboardMetricQueryInput `json:"query"`
	Visualization contracts.MetricChartType `json:"visualization"`
	Legend        *bool                     `json:"legend,omitempty"`
	MaxSeries     *int                      `json:"maxSeries,omitempty"`
	Thresholds    []DashboardThresholdInput `json:"thresholds"`
}

type DashboardMetricQueryInput = contracts.DashboardMetricQueryInput
type DashboardMetricQueryRowInput = contracts.DashboardMetricQueryRowInput
type DashboardMetricFormulaInput = contracts.DashboardMetricFormulaInput
type DashboardMetricFormulaExpressionInput = contracts.DashboardMetricFormulaExpressionInput
type DashboardMetricDisplaySeriesInput = contracts.DashboardMetricDisplaySeriesInput
type DashboardMetricFormulaExpressionKind = contracts.DashboardMetricFormulaExpressionKind

const (
	DashboardMetricFormulaExpressionKindRef      DashboardMetricFormulaExpressionKind = contracts.DashboardMetricFormulaExpressionKindRef
	DashboardMetricFormulaExpressionKindNumber   DashboardMetricFormulaExpressionKind = contracts.DashboardMetricFormulaExpressionKindNumber
	DashboardMetricFormulaExpressionKindBinary   DashboardMetricFormulaExpressionKind = contracts.DashboardMetricFormulaExpressionKindBinary
	DashboardMetricFormulaExpressionKindUnary    DashboardMetricFormulaExpressionKind = contracts.DashboardMetricFormulaExpressionKindUnary
	DashboardMetricFormulaExpressionKindFunction DashboardMetricFormulaExpressionKind = contracts.DashboardMetricFormulaExpressionKindFunction
)

type DashboardLogWidgetInput struct {
	Service    *string                     `json:"service,omitempty"`
	TraceID    *string                     `json:"traceId,omitempty"`
	SpanID     *string                     `json:"spanId,omitempty"`
	Severity   *string                     `json:"severity,omitempty"`
	Search     *string                     `json:"search,omitempty"`
	Attributes []contracts.AttributeFilter `json:"attributes"`
	Sort       *contracts.LogSort          `json:"sort,omitempty"`
	Limit      *int                        `json:"limit,omitempty"`
	Columns    []string                    `json:"columns"`
}

type DashboardTraceWidgetInput struct {
	Service       *string                     `json:"service,omitempty"`
	Query         *string                     `json:"query,omitempty"`
	OperationName *string                     `json:"operationName,omitempty"`
	SpanName      *string                     `json:"spanName,omitempty"`
	Status        *contracts.TraceStatus      `json:"status,omitempty"`
	MinDurationMs *float64                    `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64                    `json:"maxDurationMs,omitempty"`
	Attributes    []contracts.AttributeFilter `json:"attributes"`
	Sort          *contracts.TraceSort        `json:"sort,omitempty"`
	Limit         *int                        `json:"limit,omitempty"`
	Columns       []string                    `json:"columns"`
}

type DashboardLiveTraceWidgetInput struct {
	Service       *string                     `json:"service,omitempty"`
	Query         *string                     `json:"query,omitempty"`
	OperationName *string                     `json:"operationName,omitempty"`
	SpanName      *string                     `json:"spanName,omitempty"`
	Status        *contracts.TraceStatus      `json:"status,omitempty"`
	MinDurationMs *float64                    `json:"minDurationMs,omitempty"`
	MaxDurationMs *float64                    `json:"maxDurationMs,omitempty"`
	Attributes    []contracts.AttributeFilter `json:"attributes"`
	Limit         *int                        `json:"limit,omitempty"`
}

type DashboardThresholdInput struct {
	Value    float64                    `json:"value"`
	Severity DashboardThresholdSeverity `json:"severity"`
	Label    *string                    `json:"label,omitempty"`
}

type DashboardWidgetLayout struct {
	X    int `json:"x"`
	Y    int `json:"y"`
	W    int `json:"w"`
	H    int `json:"h"`
	MinW int `json:"minW"`
	MinH int `json:"minH"`
}

type DashboardWidget struct {
	ID          string                          `json:"id"`
	Title       string                          `json:"title"`
	Description *string                         `json:"description,omitempty"`
	Kind        DashboardWidgetKind             `json:"kind"`
	Layout      DashboardWidgetLayout           `json:"layout"`
	Metric      *DashboardMetricWidgetInput     `json:"metric,omitempty"`
	RichMetric  *DashboardRichMetricWidgetInput `json:"richMetric,omitempty"`
	Logs        *DashboardLogWidgetInput        `json:"logs,omitempty"`
	Traces      *DashboardTraceWidgetInput      `json:"traces,omitempty"`
	LiveTraces  *DashboardLiveTraceWidgetInput  `json:"liveTraces,omitempty"`
}

type Dashboard struct {
	ID                string              `json:"id"`
	ProjectID         string              `json:"projectId"`
	OrganizationID    string              `json:"organizationId,omitempty"`
	Slug              string              `json:"slug"`
	Name              string              `json:"name"`
	Description       *string             `json:"description,omitempty"`
	Tags              []string            `json:"tags"`
	Version           int                 `json:"version"`
	Visibility        DashboardVisibility `json:"visibility"`
	DefaultTimeWindow string              `json:"defaultTimeWindow"`
	Pinned            bool                `json:"pinned"`
	OwnerUserID       *string             `json:"ownerUserId,omitempty"`
	Widgets           []DashboardWidget   `json:"widgets"`
	CreatedAt         time.Time           `json:"createdAt"`
	UpdatedAt         time.Time           `json:"updatedAt"`
	CreatedBy         *string             `json:"createdBy,omitempty"`
	UpdatedBy         *string             `json:"updatedBy,omitempty"`
}

type DashboardListRequest struct {
	contracts.BridgeEnvelope
	Input *DashboardListInput `json:"input,omitempty"`
}

type DashboardListData struct {
	Items              []Dashboard `json:"items"`
	PinnedDashboardIDs []string    `json:"pinnedDashboardIds"`
}

type DashboardListResponse struct {
	RequestID string                 `json:"requestId"`
	OK        bool                   `json:"ok"`
	Data      *DashboardListData     `json:"data,omitempty"`
	Error     *contracts.BridgeError `json:"error,omitempty"`
}

type DashboardSaveRequest struct {
	contracts.BridgeEnvelope
	Input DashboardSaveInput `json:"input"`
}

type DashboardSaveData struct {
	Dashboard Dashboard `json:"dashboard"`
}

type DashboardSaveResponse struct {
	RequestID string                 `json:"requestId"`
	OK        bool                   `json:"ok"`
	Data      *DashboardSaveData     `json:"data,omitempty"`
	Error     *contracts.BridgeError `json:"error,omitempty"`
}

type DashboardDeleteRequest struct {
	contracts.BridgeEnvelope
	DashboardID string `json:"dashboardId"`
}

type DashboardDeleteData struct {
	Deleted bool `json:"deleted"`
}

type DashboardDeleteResponse struct {
	RequestID string                 `json:"requestId"`
	OK        bool                   `json:"ok"`
	Data      *DashboardDeleteData   `json:"data,omitempty"`
	Error     *contracts.BridgeError `json:"error,omitempty"`
}

type DashboardPinSetRequest struct {
	contracts.BridgeEnvelope
	DashboardID string `json:"dashboardId"`
	Pinned      bool   `json:"pinned"`
}

type DashboardPinReorderRequest struct {
	contracts.BridgeEnvelope
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
	Error     *contracts.BridgeError    `json:"error,omitempty"`
}
