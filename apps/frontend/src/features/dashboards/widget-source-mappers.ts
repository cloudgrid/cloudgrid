import type {
  AlertSummaryInput,
  LiveTraceInput,
  LogSearchInput,
  MetricSeriesInput,
  RichMetricSeriesInput,
  TraceSearchInput,
} from "@cloudgrid/ui-contracts";
import type { DashboardWidgetInput } from "../../lib/dashboard-contracts";

type DateRange = { from: string; to: string };

export function mapMetricSeriesInput(
  widget: DashboardWidgetInput,
  range: DateRange,
): MetricSeriesInput | null {
  const { metric } = widget;
  if (!metric) {
    return null;
  }
  return {
    metricName: metric.metricName,
    from: range.from,
    to: range.to,
    aggregation: metric.aggregation,
    groupBy: metric.groupBy ?? [],
    filters: metric.filters ?? [],
    limit: metric.maxSeries ?? 1000,
    ...(metric.interval ? { interval: metric.interval } : {}),
  };
}

export function mapLogSearchInput(
  widget: DashboardWidgetInput,
  range: DateRange,
): LogSearchInput | null {
  const { logs } = widget;
  if (!logs) {
    return null;
  }
  return {
    service: logs.service ?? null,
    traceId: logs.traceId ?? null,
    spanId: logs.spanId ?? null,
    severity: logs.severity ?? null,
    from: range.from,
    to: range.to,
    search: logs.search ?? null,
    attributes: logs.attributes ?? [],
    sort: logs.sort ?? "timestamp_desc",
    limit: logs.limit ?? 50,
  };
}

export function mapTraceSearchInput(
  widget: DashboardWidgetInput,
  range: DateRange,
): TraceSearchInput | null {
  const { traces } = widget;
  if (!traces) {
    return null;
  }
  return {
    service: traces.service ?? null,
    query: traces.query ?? null,
    operationName: traces.operationName ?? null,
    spanName: traces.spanName ?? null,
    from: range.from,
    to: range.to,
    status: traces.status ?? null,
    minDurationMs: traces.minDurationMs ?? null,
    maxDurationMs: traces.maxDurationMs ?? null,
    attributes: traces.attributes ?? [],
    sort: traces.sort ?? "startedAt_desc",
    limit: traces.limit ?? 50,
  };
}

export function mapLiveTraceInput(
  widget: DashboardWidgetInput,
  range: DateRange,
): LiveTraceInput | null {
  const { liveTraces } = widget;
  if (!liveTraces) {
    return null;
  }
  return {
    service: liveTraces.service ?? null,
    query: liveTraces.query ?? null,
    operationName: liveTraces.operationName ?? null,
    spanName: liveTraces.spanName ?? null,
    from: range.from,
    status: liveTraces.status ?? null,
    minDurationMs: liveTraces.minDurationMs ?? null,
    maxDurationMs: liveTraces.maxDurationMs ?? null,
    attributes: liveTraces.attributes ?? [],
    limit: liveTraces.limit ?? 50,
  };
}

export function mapRichMetricSeriesInput(
  widget: DashboardWidgetInput,
  range: DateRange,
): RichMetricSeriesInput | null {
  const { richMetric } = widget;
  if (!richMetric) {
    return null;
  }
  return {
    from: range.from,
    to: range.to,
    query: richMetric.query,
  };
}

export function mapAlertSummaryInput(
  widget: DashboardWidgetInput,
): AlertSummaryInput | null {
  const { alert } = widget;
  if (!alert || widget.kind !== "alert_status") {
    return null;
  }
  return {
    ruleIds: alert.ruleIds ?? [],
    states: alert.states ?? [],
    severities: alert.severities ?? [],
    signals: alert.signals ?? [],
    timeWindow: alert.timeWindow ?? "PT1H",
    limit: alert.limit ?? 20,
  };
}
