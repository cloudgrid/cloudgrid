import { describe, expect, test } from "bun:test";
import {
  buildLogSearchInput,
  buildMetricNameSearchInput,
  buildMetricSeriesInput,
  buildTelemetryFacetInput,
  buildTraceDetailInput,
  buildTraceSearchInput,
  createDefaultLogTimeRange,
  createDefaultMetricTimeRange,
  createDefaultTraceTimeRange,
  defaultLogSort,
  defaultMetricAggregation,
  defaultMetricAggregationForMetricName,
  defaultMetricIntervalForHours,
  defaultMetricNameSort,
  defaultMetricSeriesSort,
  defaultTraceSort,
  LOG_SEARCH_DEFAULT_LIMIT,
  LOG_SEARCH_HARD_LIMIT,
  METRIC_NAME_SEARCH_DEFAULT_LIMIT,
  METRIC_NAME_SEARCH_HARD_LIMIT,
  METRIC_SERIES_DEFAULT_LIMIT,
  METRIC_SERIES_HARD_LIMIT,
  metricNameSortOrDefault,
  metricSeriesSortOrDefault,
  TRACE_RELATED_LOG_DEFAULT_LIMIT,
  TRACE_SEARCH_DEFAULT_LIMIT,
  TRACE_SEARCH_HARD_LIMIT,
} from "../src/telemetry-query";

const descriptor = {
  id: "metric:gen_ai.client.token.usage",
  tenantId: "tenant-1",
  projectId: "project-1",
  name: "gen_ai.client.token.usage",
  description: null,
  unit: "1",
  kind: "sum" as const,
  aggregationTemporality: "delta" as const,
  monotonic: true,
  attributeKeys: ["gen_ai.system", "gen_ai.request.model", "gen_ai.token.type"],
  firstSeenAt: "2026-05-21T16:00:00.000Z",
  lastSeenAt: "2026-05-21T17:00:00.000Z",
};

describe("shared telemetry query contracts", () => {
  test("builds metric series input without tenant or project fields", () => {
    expect(
      buildMetricSeriesInput(descriptor, {
        from: "2026-05-21T16:00:00.000Z",
        to: "2026-05-21T17:00:00.000Z",
        aggregation: "sum",
        interval: "PT1M",
        groupBy: ["gen_ai.system"],
        filters: [{ key: "gen_ai.system", operator: "eq", value: "openai" }],
      }),
    ).toEqual({
      metricName: "gen_ai.client.token.usage",
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
      interval: "PT1M",
      aggregation: "sum",
      groupBy: ["gen_ai.system"],
      filters: [{ key: "gen_ai.system", operator: "eq", value: "openai" }],
      sort: "timestamp_asc",
      limit: METRIC_SERIES_DEFAULT_LIMIT,
    });
  });

  test("centralizes metric defaults for UI controls and AI tool calls", () => {
    const range = createDefaultMetricTimeRange(new Date("2026-05-21T17:00:00.000Z"));

    expect(range).toEqual({
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
    });
    expect(defaultMetricAggregation(descriptor)).toBe("sum");
    expect(defaultMetricAggregationForMetricName("gen_ai.client.token.usage", "show usage")).toBe(
      "sum",
    );
    expect(defaultMetricIntervalForHours(1)).toBe("PT1M");
    expect(defaultMetricIntervalForHours(24)).toBe("PT5M");
    expect(METRIC_SERIES_HARD_LIMIT).toBe(5000);
    expect(defaultMetricNameSort()).toBe("lastSeenAt_desc");
    expect(defaultMetricSeriesSort()).toBe("timestamp_asc");
    expect(metricNameSortOrDefault("name_desc")).toBe("name_desc");
    expect(metricNameSortOrDefault("unknown")).toBe("lastSeenAt_desc");
    expect(metricSeriesSortOrDefault("value_desc")).toBe("value_desc");
    expect(metricSeriesSortOrDefault("unknown")).toBe("timestamp_asc");
    expect(METRIC_NAME_SEARCH_DEFAULT_LIMIT).toBe(50);
    expect(METRIC_NAME_SEARCH_HARD_LIMIT).toBe(200);
  });

  test("builds metric name search input with backend-owned sort and pagination state", () => {
    expect(
      buildMetricNameSearchInput({
        query: "token",
        service: "api",
        from: "2026-05-21T16:00:00.000Z",
        to: "2026-05-21T17:00:00.000Z",
        sort: "name_desc",
        cursor: "cursor-1",
        limit: 500,
      }),
    ).toEqual({
      query: "token",
      service: "api",
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
      sort: "name_desc",
      cursor: "cursor-1",
      limit: METRIC_NAME_SEARCH_HARD_LIMIT,
      services: null,
    });
  });

  test("centralizes log search defaults for UI controls and AI tool calls", () => {
    const range = createDefaultLogTimeRange(new Date("2026-05-21T17:00:00.000Z"));

    expect(range).toEqual({
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
    });
    expect(defaultLogSort()).toBe("timestamp_desc");
    expect(LOG_SEARCH_DEFAULT_LIMIT).toBe(50);
    expect(LOG_SEARCH_HARD_LIMIT).toBe(200);
    expect(
      buildLogSearchInput({
        from: range.from,
        to: range.to,
        service: "api",
        search: "storage unavailable",
        sort: "timestamp_desc",
      }),
    ).toEqual({
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
      service: "api",
      services: null,
      traceId: null,
      spanId: null,
      severity: null,
      search: "storage unavailable",
      attributes: null,
      sort: "timestamp_desc",
      cursor: null,
      limit: LOG_SEARCH_DEFAULT_LIMIT,
    });
  });

  test("centralizes trace search, trace detail, and facet defaults", () => {
    const range = createDefaultTraceTimeRange(new Date("2026-05-21T17:00:00.000Z"));

    expect(range).toEqual({
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
    });
    expect(defaultTraceSort()).toBe("startedAt_desc");
    expect(TRACE_SEARCH_DEFAULT_LIMIT).toBe(50);
    expect(TRACE_SEARCH_HARD_LIMIT).toBe(200);
    expect(TRACE_RELATED_LOG_DEFAULT_LIMIT).toBe(50);
    expect(
      buildTraceSearchInput({
        from: range.from,
        to: range.to,
        service: "api",
        status: "error",
        limit: 500,
      }),
    ).toEqual({
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
      service: "api",
      services: null,
      query: null,
      operationName: null,
      spanName: null,
      status: "error",
      minDurationMs: null,
      maxDurationMs: null,
      attributes: null,
      sort: "startedAt_desc",
      cursor: null,
      limit: TRACE_SEARCH_HARD_LIMIT,
    });
    expect(buildTraceDetailInput({ selectedSpanId: "span-1" })).toEqual({
      selectedSpanId: "span-1",
      spanQuery: null,
      spanService: null,
      spanName: null,
      spanStatus: null,
      minSpanDurationMs: null,
      maxSpanDurationMs: null,
      attributes: null,
      showMatchesOnly: false,
      relatedLogLimit: TRACE_RELATED_LOG_DEFAULT_LIMIT,
      logSearch: null,
    });
    expect(
      buildTelemetryFacetInput({ from: range.from, to: range.to, search: "checkout" }),
    ).toEqual({
      from: "2026-05-21T16:00:00.000Z",
      to: "2026-05-21T17:00:00.000Z",
      service: null,
      services: null,
      signal: "traces",
      search: "checkout",
      limit: 25,
    });
  });
});
