import type {
  AttributeFilterInput,
  MetricAggregation,
  MetricChartType,
  MetricDescriptor,
  MetricSeriesInput,
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

export function createDefaultMetricTimeRange(now = new Date()): MetricTimeRange {
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
