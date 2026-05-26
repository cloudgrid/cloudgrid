import type {
  LiveTraceEvent,
  LiveTraceInput,
  LogSearchInput,
  LogSearchResult,
  MetricNameSearchInput,
  MetricNameSearchResult,
  MetricSeriesInput,
  MetricSeriesResult,
  RichMetricSeriesInput,
  RichMetricSeriesResult,
  TelemetryFacetInput,
  TelemetryFacetResult,
  TraceDetail,
  TraceDetailInput,
  TraceSearchInput,
  TraceSearchResult,
} from "@cloudgrid/ui-contracts";
import type { NormalizedAuthContext } from "../auth";

export interface TelemetryQueryBridge {
  searchTraces(
    input: TraceSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceSearchResult>;
  getTraceDetail(
    traceId: string,
    input: TraceDetailInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceDetail | null>;
  searchLogs(input: LogSearchInput, authContext?: NormalizedAuthContext): Promise<LogSearchResult>;
  telemetryFacets(
    input: TelemetryFacetInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TelemetryFacetResult>;
  subscribeLiveTraces(
    input: LiveTraceInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<LiveTraceEvent>;
  health(): Promise<"ok" | "unavailable">;
  close(): Promise<void>;
}

export interface MetricQueryBridge {
  metricNames(
    input: MetricNameSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricNameSearchResult>;
  metricSeries(
    input: MetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricSeriesResult>;
  richMetricSeries(
    input: RichMetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<RichMetricSeriesResult>;
}

export function telemetryQueryPayload(
  input: TraceSearchInput | TraceDetailInput | LogSearchInput | TelemetryFacetInput,
) {
  return { query: compactBridgeInput(input as Record<string, unknown>) };
}

export function telemetryMetricPayload(
  input: MetricNameSearchInput | MetricSeriesInput | RichMetricSeriesInput,
) {
  return { input: compactBridgeInput(input as unknown as Record<string, unknown>) };
}

function compactBridgeInput(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
}
