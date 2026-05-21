import { describe, expect, test } from "bun:test";
import {
  buildLogSearchInput,
  buildMetricSeriesInput,
  createDefaultLogTimeRange,
  defaultLogSort,
  LOG_SEARCH_DEFAULT_LIMIT,
  LOG_SEARCH_HARD_LIMIT,
  METRIC_SERIES_DEFAULT_LIMIT,
  METRIC_SERIES_HARD_LIMIT,
  createDefaultMetricTimeRange,
  defaultMetricAggregation,
  defaultMetricAggregationForMetricName,
  defaultMetricIntervalForHours,
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
});
