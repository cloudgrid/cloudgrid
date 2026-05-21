import type {
  AttributeFilterInput,
  LogSearchInput,
  LogSort,
  MetricAggregation,
  MetricChartType,
  MetricDescriptor,
  MetricSeriesInput,
  TelemetryFacetInput,
  TraceDetailInput,
  TraceSearchInput,
  TraceSort,
  TraceStatus,
} from "./index";

export const METRIC_AGGREGATIONS = [
  "avg",
  "sum",
  "min",
  "max",
  "count",
  "rate",
  "p50",
  "p90",
  "p95",
  "p99",
] as const satisfies readonly MetricAggregation[];

export const METRIC_CHART_TYPES = [
  "line",
  "area",
  "bar",
  "pie",
  "donut",
  "stat",
  "radial",
  "radar",
  "heatmap",
  "histogram",
  "table",
] as const satisfies readonly MetricChartType[];

export const METRIC_EXPLORER_CHART_TYPES = [
  "line",
  "area",
  "bar",
  "pie",
  "stat",
  "table",
] as const satisfies readonly MetricChartType[];

export const METRIC_SERIES_DEFAULT_LIMIT = 1000;
export const METRIC_SERIES_HARD_LIMIT = 5000;
export const LOG_SEARCH_DEFAULT_LIMIT = 50;
export const LOG_SEARCH_HARD_LIMIT = 200;
export const TRACE_SEARCH_DEFAULT_LIMIT = 50;
export const TRACE_SEARCH_HARD_LIMIT = 200;
export const TRACE_FACET_DEFAULT_LIMIT = 25;
export const TRACE_RELATED_LOG_DEFAULT_LIMIT = 50;

export interface MetricTimeRange {
  from: string;
  to: string;
}

export interface MetricQueryDefaultsInput extends MetricTimeRange {
  aggregation: MetricAggregation;
  interval: string;
  groupBy: string[];
  filters: AttributeFilterInput[];
  limit?: number | null;
}

export interface LogTimeRange {
  from: string;
  to: string;
}

export interface LogSearchDefaultsInput extends LogTimeRange {
  service?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  severity?: string | null;
  search?: string | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: LogSort | null;
  cursor?: string | null;
  limit?: number | null;
}

export interface TraceTimeRange {
  from: string;
  to: string;
}

export interface TraceSearchDefaultsInput extends TraceTimeRange {
  service?: string | null;
  query?: string | null;
  operationName?: string | null;
  spanName?: string | null;
  status?: TraceStatus | null;
  minDurationMs?: number | null;
  maxDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  sort?: TraceSort | null;
  cursor?: string | null;
  limit?: number | null;
}

export interface TraceDetailDefaultsInput {
  selectedSpanId?: string | null;
  spanQuery?: string | null;
  spanService?: string | null;
  spanName?: string | null;
  spanStatus?: TraceStatus | null;
  minSpanDurationMs?: number | null;
  maxSpanDurationMs?: number | null;
  attributes?: AttributeFilterInput[] | null;
  showMatchesOnly?: boolean | null;
  relatedLogLimit?: number | null;
  logSearch?: string | null;
}

export interface TelemetryFacetDefaultsInput extends TraceTimeRange {
  service?: string | null;
  search?: string | null;
  limit?: number | null;
}

export function createDefaultMetricTimeRange(now = new Date()): MetricTimeRange {
  const to = new Date(now);
  const from = new Date(to.getTime() - 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function createDefaultLogTimeRange(now = new Date()): LogTimeRange {
  const to = new Date(now);
  const from = new Date(to.getTime() - 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function createDefaultTraceTimeRange(now = new Date()): TraceTimeRange {
  const to = new Date(now);
  const from = new Date(to.getTime() - 60 * 60 * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function createObservedMetricRange(
  descriptor: Pick<MetricDescriptor, "firstSeenAt" | "lastSeenAt">,
): MetricTimeRange {
  const firstSeenAt = Date.parse(descriptor.firstSeenAt);
  const lastSeenAt = Date.parse(descriptor.lastSeenAt);
  if (!Number.isFinite(firstSeenAt) || !Number.isFinite(lastSeenAt)) {
    return createDefaultMetricTimeRange();
  }
  const paddingMs = 10 * 60 * 1000;
  return {
    from: new Date(Math.min(firstSeenAt, lastSeenAt) - paddingMs).toISOString(),
    to: new Date(Math.max(firstSeenAt, lastSeenAt) + paddingMs).toISOString(),
  };
}

export function defaultMetricAggregation(
  descriptor: Pick<MetricDescriptor, "kind">,
): MetricAggregation {
  if (descriptor.kind === "sum") {
    return "sum";
  }
  if (
    descriptor.kind === "histogram" ||
    descriptor.kind === "exponential_histogram" ||
    descriptor.kind === "summary"
  ) {
    return "p95";
  }
  return "avg";
}

export function defaultMetricAggregationForMetricName(
  metricName: string,
  textHint = "",
): MetricAggregation {
  const normalized = textHint.toLowerCase();
  if (/\b(avg|average|mean)\b/.test(normalized)) return "avg";
  if (/\b(max|maximum|peak)\b/.test(normalized)) return "max";
  if (/\b(min|minimum)\b/.test(normalized)) return "min";
  if (/\b(count)\b/.test(normalized)) return "count";
  if (/\b(rate|per second|\/s)\b/.test(normalized)) return "rate";
  if (/\b(p50|median)\b/.test(normalized)) return "p50";
  if (/\bp90\b/.test(normalized)) return "p90";
  if (/\bp95\b/.test(normalized)) return "p95";
  if (/\bp99\b/.test(normalized)) return "p99";
  if (/\b(sum|total|usage|tokens?)\b/.test(normalized) || metricName.includes(".usage")) {
    return "sum";
  }
  return "avg";
}

export function defaultMetricIntervalForHours(hours: number): string {
  if (hours <= 1) return "PT1M";
  if (hours <= 24) return "PT5M";
  if (hours <= 24 * 7) return "PT1H";
  return "PT6H";
}

export function metricAggregationOrDefault(value: string | null): MetricAggregation {
  return METRIC_AGGREGATIONS.includes(value as MetricAggregation)
    ? (value as MetricAggregation)
    : "avg";
}

export function metricChartTypeOrDefault(value: string | null): MetricChartType {
  return METRIC_CHART_TYPES.includes(value as MetricChartType)
    ? (value as MetricChartType)
    : "line";
}

export function defaultLogSort(): LogSort {
  return "timestamp_desc";
}

export function logSortOrDefault(value: string | null): LogSort {
  return value === "timestamp_asc" || value === "severity_desc" ? value : defaultLogSort();
}

export function defaultTraceSort(): TraceSort {
  return "startedAt_desc";
}

export function traceSortOrDefault(value: string | null): TraceSort {
  return value === "startedAt_asc" ||
    value === "duration_desc" ||
    value === "duration_asc" ||
    value === "errorFirst"
    ? value
    : defaultTraceSort();
}

export function buildMetricSeriesInput(
  descriptor: Pick<MetricDescriptor, "name">,
  state: MetricQueryDefaultsInput,
): MetricSeriesInput {
  return {
    metricName: descriptor.name,
    from: state.from,
    to: state.to,
    aggregation: state.aggregation,
    groupBy: state.groupBy,
    filters: state.filters,
    limit: Math.min(
      Math.max(1, Math.trunc(state.limit ?? METRIC_SERIES_DEFAULT_LIMIT)),
      METRIC_SERIES_HARD_LIMIT,
    ),
    ...(state.interval ? { interval: state.interval } : {}),
  };
}

export function buildLogSearchInput(state: LogSearchDefaultsInput): LogSearchInput {
  return {
    service: state.service ?? null,
    traceId: state.traceId ?? null,
    spanId: state.spanId ?? null,
    severity: state.severity ?? null,
    from: state.from,
    to: state.to,
    search: state.search ?? null,
    attributes: state.attributes ?? null,
    sort: state.sort ?? defaultLogSort(),
    cursor: state.cursor ?? null,
    limit: Math.min(
      Math.max(1, Math.trunc(state.limit ?? LOG_SEARCH_DEFAULT_LIMIT)),
      LOG_SEARCH_HARD_LIMIT,
    ),
  };
}

export function buildTraceSearchInput(state: TraceSearchDefaultsInput): TraceSearchInput {
  return {
    service: state.service ?? null,
    query: state.query ?? null,
    operationName: state.operationName ?? null,
    spanName: state.spanName ?? null,
    from: state.from,
    to: state.to,
    status: state.status ?? null,
    minDurationMs: state.minDurationMs ?? null,
    maxDurationMs: state.maxDurationMs ?? null,
    attributes: state.attributes ?? null,
    sort: state.sort ?? defaultTraceSort(),
    cursor: state.cursor ?? null,
    limit: Math.min(
      Math.max(1, Math.trunc(state.limit ?? TRACE_SEARCH_DEFAULT_LIMIT)),
      TRACE_SEARCH_HARD_LIMIT,
    ),
  };
}

export function buildTraceDetailInput(state: TraceDetailDefaultsInput = {}): TraceDetailInput {
  return {
    selectedSpanId: state.selectedSpanId ?? null,
    spanQuery: state.spanQuery ?? null,
    spanService: state.spanService ?? null,
    spanName: state.spanName ?? null,
    spanStatus: state.spanStatus ?? null,
    minSpanDurationMs: state.minSpanDurationMs ?? null,
    maxSpanDurationMs: state.maxSpanDurationMs ?? null,
    attributes: state.attributes ?? null,
    showMatchesOnly: state.showMatchesOnly ?? false,
    relatedLogLimit: Math.min(
      Math.max(1, Math.trunc(state.relatedLogLimit ?? TRACE_RELATED_LOG_DEFAULT_LIMIT)),
      LOG_SEARCH_HARD_LIMIT,
    ),
    logSearch: state.logSearch ?? null,
  };
}

export function buildTelemetryFacetInput(state: TelemetryFacetDefaultsInput): TelemetryFacetInput {
  return {
    from: state.from,
    to: state.to,
    service: state.service ?? null,
    search: state.search ?? null,
    limit: Math.min(
      Math.max(1, Math.trunc(state.limit ?? TRACE_FACET_DEFAULT_LIMIT)),
      TRACE_SEARCH_HARD_LIMIT,
    ),
  };
}
