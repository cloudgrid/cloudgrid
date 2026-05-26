import { describe, expect, test } from "bun:test";
import type { DashboardWidgetInput } from "../src/lib/dashboard-contracts";
import {
  mapAlertSummaryInput,
  mapLiveTraceInput,
  mapLogSearchInput,
  mapMetricSeriesInput,
  mapRichMetricSeriesInput,
  mapTraceSearchInput,
} from "../src/features/dashboards/widget-source-mappers";

const LAYOUT = { x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 };
const RANGE = { from: "2025-01-01T00:00:00Z", to: "2025-01-02T00:00:00Z" };

function baseWidget(overrides: Partial<DashboardWidgetInput> = {}): DashboardWidgetInput {
  return {
    id: "w1",
    title: "Widget",
    kind: "metric_stat",
    layout: LAYOUT,
    metric: null,
    richMetric: null,
    logs: null,
    traces: null,
    liveTraces: null,
    alert: null,
    ...overrides,
  };
}

describe("mapMetricSeriesInput", () => {
  test("returns null when widget has no metric", () => {
    expect(mapMetricSeriesInput(baseWidget(), RANGE)).toBeNull();
  });

  test("maps required fields and applies range", () => {
    const widget = baseWidget({
      metric: {
        metricName: "http.requests",
        aggregation: "sum",
        visualization: "line",
      },
    });
    const result = mapMetricSeriesInput(widget, RANGE);
    expect(result).not.toBeNull();
    expect(result?.metricName).toBe("http.requests");
    expect(result?.aggregation).toBe("sum");
    expect(result?.from).toBe(RANGE.from);
    expect(result?.to).toBe(RANGE.to);
    expect(result?.groupBy).toEqual([]);
    expect(result?.filters).toEqual([]);
    expect(result?.limit).toBe(1000);
  });

  test("omits interval key when interval is null", () => {
    const widget = baseWidget({
      metric: {
        metricName: "m",
        aggregation: "avg",
        visualization: "bar",
        interval: null,
      },
    });
    const result = mapMetricSeriesInput(widget, RANGE);
    expect(result).not.toBeNull();
    expect("interval" in (result ?? {})).toBe(false);
  });

  test("omits interval key when interval is undefined", () => {
    const widget = baseWidget({
      metric: {
        metricName: "m",
        aggregation: "avg",
        visualization: "bar",
      },
    });
    const result = mapMetricSeriesInput(widget, RANGE);
    expect(result).not.toBeNull();
    expect("interval" in (result ?? {})).toBe(false);
  });

  test("passes interval when present", () => {
    const widget = baseWidget({
      metric: {
        metricName: "m",
        aggregation: "avg",
        visualization: "line",
        interval: "PT1M",
      },
    });
    const result = mapMetricSeriesInput(widget, RANGE);
    expect(result?.interval).toBe("PT1M");
  });

  test("maps maxSeries to limit", () => {
    const widget = baseWidget({
      metric: {
        metricName: "m",
        aggregation: "count",
        visualization: "table",
        maxSeries: 25,
      },
    });
    expect(mapMetricSeriesInput(widget, RANGE)?.limit).toBe(25);
  });
});

describe("mapLogSearchInput", () => {
  test("returns null when widget has no logs", () => {
    expect(mapLogSearchInput(baseWidget(), RANGE)).toBeNull();
  });

  test("maps fields with null defaults", () => {
    const widget = baseWidget({ kind: "log_table", logs: {} });
    const result = mapLogSearchInput(widget, RANGE);
    expect(result).not.toBeNull();
    expect(result?.service).toBeNull();
    expect(result?.traceId).toBeNull();
    expect(result?.spanId).toBeNull();
    expect(result?.severity).toBeNull();
    expect(result?.search).toBeNull();
    expect(result?.from).toBe(RANGE.from);
    expect(result?.to).toBe(RANGE.to);
    expect(result?.attributes).toEqual([]);
    expect(result?.sort).toBe("timestamp_desc");
    expect(result?.limit).toBe(50);
  });

  test("passes provided field values through", () => {
    const widget = baseWidget({
      kind: "log_table",
      logs: {
        service: "api",
        search: "error",
        sort: "timestamp_asc",
        limit: 10,
      },
    });
    const result = mapLogSearchInput(widget, RANGE);
    expect(result?.service).toBe("api");
    expect(result?.search).toBe("error");
    expect(result?.sort).toBe("timestamp_asc");
    expect(result?.limit).toBe(10);
  });
});

describe("mapTraceSearchInput", () => {
  test("returns null when widget has no traces", () => {
    expect(mapTraceSearchInput(baseWidget(), RANGE)).toBeNull();
  });

  test("maps fields with null/default values", () => {
    const widget = baseWidget({ kind: "trace_table", traces: {} });
    const result = mapTraceSearchInput(widget, RANGE);
    expect(result).not.toBeNull();
    expect(result?.service).toBeNull();
    expect(result?.query).toBeNull();
    expect(result?.status).toBeNull();
    expect(result?.from).toBe(RANGE.from);
    expect(result?.to).toBe(RANGE.to);
    expect(result?.attributes).toEqual([]);
    expect(result?.sort).toBe("startedAt_desc");
    expect(result?.limit).toBe(50);
  });

  test("passes status and duration filters through", () => {
    const widget = baseWidget({
      kind: "trace_table",
      traces: {
        service: "checkout",
        status: "error",
        minDurationMs: 100,
        maxDurationMs: 5000,
      },
    });
    const result = mapTraceSearchInput(widget, RANGE);
    expect(result?.service).toBe("checkout");
    expect(result?.status).toBe("error");
    expect(result?.minDurationMs).toBe(100);
    expect(result?.maxDurationMs).toBe(5000);
  });
});

describe("mapLiveTraceInput", () => {
  test("returns null when widget has no liveTraces", () => {
    expect(mapLiveTraceInput(baseWidget(), RANGE)).toBeNull();
  });

  test("maps fields with null/default values and uses range.from only", () => {
    const widget = baseWidget({ kind: "live_trace_table", liveTraces: {} });
    const result = mapLiveTraceInput(widget, RANGE);
    expect(result).not.toBeNull();
    expect(result?.service).toBeNull();
    expect(result?.query).toBeNull();
    expect(result?.status).toBeNull();
    expect(result?.from).toBe(RANGE.from);
    expect("to" in (result ?? {})).toBe(false);
    expect(result?.attributes).toEqual([]);
    expect(result?.limit).toBe(50);
  });

  test("passes service and status through", () => {
    const widget = baseWidget({
      kind: "live_trace_table",
      liveTraces: { service: "gateway", status: "ok", limit: 100 },
    });
    const result = mapLiveTraceInput(widget, RANGE);
    expect(result?.service).toBe("gateway");
    expect(result?.status).toBe("ok");
    expect(result?.limit).toBe(100);
  });
});

describe("mapRichMetricSeriesInput", () => {
  test("returns null when widget has no richMetric", () => {
    expect(mapRichMetricSeriesInput(baseWidget(), RANGE)).toBeNull();
  });

  test("maps query and range", () => {
    const query = {
      queries: [
        {
          id: "q1",
          label: "A",
          metricName: "cpu",
          aggregation: "avg" as const,
        },
      ],
    };
    const widget = baseWidget({
      kind: "metric_rich",
      richMetric: { query, visualization: "line" },
    });
    const result = mapRichMetricSeriesInput(widget, RANGE);
    expect(result).not.toBeNull();
    expect(result?.from).toBe(RANGE.from);
    expect(result?.to).toBe(RANGE.to);
    expect(result?.query).toBe(query);
  });
});

describe("mapAlertSummaryInput", () => {
  test("returns null when widget has no alert", () => {
    expect(mapAlertSummaryInput(baseWidget())).toBeNull();
  });

  test("returns null for alert_history kind", () => {
    const widget = baseWidget({ kind: "alert_history", alert: {} });
    expect(mapAlertSummaryInput(widget)).toBeNull();
  });

  test("returns null for alert_evidence kind", () => {
    const widget = baseWidget({ kind: "alert_evidence", alert: {} });
    expect(mapAlertSummaryInput(widget)).toBeNull();
  });

  test("maps alert_status fields with defaults", () => {
    const widget = baseWidget({ kind: "alert_status", alert: {} });
    const result = mapAlertSummaryInput(widget);
    expect(result).not.toBeNull();
    expect(result?.ruleIds).toEqual([]);
    expect(result?.states).toEqual([]);
    expect(result?.severities).toEqual([]);
    expect(result?.signals).toEqual([]);
    expect(result?.timeWindow).toBe("PT1H");
    expect(result?.limit).toBe(20);
  });

  test("passes provided alert fields through", () => {
    const widget = baseWidget({
      kind: "alert_status",
      alert: {
        ruleIds: ["r1", "r2"],
        states: ["firing"],
        timeWindow: "PT4H",
        limit: 5,
      },
    });
    const result = mapAlertSummaryInput(widget);
    expect(result?.ruleIds).toEqual(["r1", "r2"]);
    expect(result?.states).toEqual(["firing"]);
    expect(result?.timeWindow).toBe("PT4H");
    expect(result?.limit).toBe(5);
  });
});
