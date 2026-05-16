import type {
  AttributeFilterInput,
  LogSort,
  MetricAggregation,
  MetricChartType,
  TraceSort,
  TraceStatus,
} from "@cloudgrid/ui-contracts";

export type DashboardVisibility = "builtin" | "project" | "personal";
export type DashboardSaveVisibility = "project" | "personal";
export type DashboardWidgetKind =
  | "metric_timeseries"
  | "metric_stat"
  | "metric_table"
  | "log_table"
  | "trace_table"
  | "live_trace_table";
export type DashboardThresholdSeverity = "info" | "warning" | "error";
export type DashboardLogColumn =
  | "timestamp"
  | "observed_timestamp"
  | "severity"
  | "service"
  | "trace_span"
  | "body"
  | "attributes";
export type DashboardTraceColumn =
  | "started_at"
  | "status"
  | "service"
  | "operation"
  | "duration"
  | "span_count"
  | "log_count";

export interface DashboardListInput {
  includeBuiltins?: boolean | null;
  query?: string | null;
  tag?: string | null;
  visibility?: DashboardVisibility | null;
  pinnedOnly?: boolean | null;
}

export interface DashboardListResult {
  items: Dashboard[];
  pinnedDashboardIds: string[];
}

export interface Dashboard {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description?: string | null;
  tags: string[];
  version: number;
  visibility: DashboardVisibility;
  defaultTimeWindow: string;
  pinned: boolean;
  widgets: DashboardWidget[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface SaveDashboardInput {
  id?: string | null;
  version?: number | null;
  name: string;
  description?: string | null;
  tags?: string[] | null;
  visibility?: DashboardSaveVisibility | null;
  defaultTimeWindow?: string | null;
  widgets: DashboardWidgetInput[];
}

export interface DashboardWidgetInput {
  id: string;
  title: string;
  description?: string | null;
  kind: DashboardWidgetKind;
  layout: DashboardWidgetLayoutInput;
  metric?: DashboardMetricWidgetInput | null;
  logs?: DashboardLogWidgetInput | null;
  traces?: DashboardTraceWidgetInput | null;
  liveTraces?: DashboardLiveTraceWidgetInput | null;
}

export interface DashboardWidgetLayoutInput {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number | null;
  minH?: number | null;
}

export interface DashboardWidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export interface DashboardMetricWidgetInput {
  metricName: string;
  aggregation: MetricAggregation;
  groupBy?: string[] | null;
  filters?: AttributeFilterInput[] | null;
  timeWindow?: string | null;
  interval?: string | null;
  visualization: MetricChartType;
  legend?: boolean | null;
  maxSeries?: number | null;
  thresholds?: DashboardThresholdInput[] | null;
}

export interface DashboardLogWidgetInput {
  service?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  severity?: string | null;
  search?: string | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: LogSort | null;
  limit?: number | null;
  columns?: DashboardLogColumn[] | null;
}

export interface DashboardTraceWidgetInput {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: TraceSort | null;
  limit?: number | null;
  columns?: DashboardTraceColumn[] | null;
}

export type DashboardLiveTraceWidgetInput = Omit<DashboardTraceWidgetInput, "sort" | "columns">;

export interface DashboardThresholdInput {
  value: number;
  severity: DashboardThresholdSeverity;
  label?: string | null;
}

export interface DashboardWidget {
  id: string;
  title: string;
  description?: string | null;
  kind: DashboardWidgetKind;
  layout: DashboardWidgetLayout;
  metric?: DashboardMetricWidget | null;
  logs?: DashboardLogWidget | null;
  traces?: DashboardTraceWidget | null;
  liveTraces?: DashboardLiveTraceWidget | null;
}

export interface DashboardMetricWidget {
  metricName: string;
  aggregation: MetricAggregation;
  groupBy: string[];
  filters: AttributeFilterInput[];
  timeWindow: string;
  interval?: string | null;
  visualization: MetricChartType;
  legend: boolean;
  maxSeries: number;
  thresholds: DashboardThreshold[];
}

export interface DashboardLogWidget {
  service?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  severity?: string | null;
  search?: string | null;
  attributes: AttributeFilterInput[];
  sort: LogSort;
  limit: number;
  columns: DashboardLogColumn[];
}

export interface DashboardTraceWidget {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes: AttributeFilterInput[];
  sort: TraceSort;
  limit: number;
  columns: DashboardTraceColumn[];
}

export type DashboardLiveTraceWidget = Omit<DashboardTraceWidget, "sort" | "columns">;

export interface DashboardThreshold {
  value: number;
  severity: DashboardThresholdSeverity;
  label?: string | null;
}

export interface DashboardPreferences {
  projectId: string;
  pinnedDashboardIds: string[];
  updatedAt: string;
}

export interface SetDashboardPinnedInput {
  dashboardId: string;
  pinned: boolean;
}

export interface ReorderDashboardPinsInput {
  dashboardIds: string[];
}
