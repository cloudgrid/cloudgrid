import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  buildExemplarTraceHref,
  MetricInspector,
  metricInspectorTabOrDefault,
} from "../src/features/metrics/metric-explorer";
import {
  buildMetricSeriesInput,
  defaultMetricQueryState,
  metricRouteCachePredicate,
  sanitizeMetricGroupBy,
  selectedMetricFromSearchParams,
} from "../src/routes/metrics-route";

const routeSource = readFileSync(join(import.meta.dir, "../src/routes/metrics-route.tsx"), "utf8");
const explorerSource = readFileSync(
  join(import.meta.dir, "../src/features/metrics/metric-explorer.tsx"),
  "utf8",
);

const descriptor = {
  id: "metric:gen_ai.client.token.usage",
  name: "gen_ai.client.token.usage",
  description: null,
  unit: "1",
  kind: "sum" as const,
  aggregationTemporality: "delta",
  monotonic: true,
  attributeKeys: ["gen_ai.system", "gen_ai.request.model", "gen_ai.token.type"],
  firstSeenAt: "2026-05-14T08:00:00.000Z",
  lastSeenAt: "2026-05-14T09:00:00.000Z",
};

describe("metrics route helpers", () => {
  test("keeps the approved metric explorer rail, workspace, and inspector proportions", () => {
    expect(routeSource).toContain("xl:grid-cols-[320px_minmax(0,1fr)_420px]");
    expect(routeSource).not.toContain("h-[calc(100vh-5.5rem)]");
    expect(routeSource).not.toContain("Dashboard");
    expect(routeSource).toContain('t("metrics.title")');
    expect(routeSource).not.toContain("RouteBreadcrumb");
    expect(routeSource).toContain("MetricTimeRangePopover");
    expect(routeSource).toContain("withMetricDescriptorDefaults");
    expect(routeSource).toContain("defaultMetricAggregation");
    expect(routeSource).not.toContain('aria-label={t("actions.copyUrl")}');
    expect(routeSource).toContain('params.set("metric"');
    expect(explorerSource).toContain("TelemetryChart");
    expect(explorerSource).toContain("SelectTrigger");
    expect(explorerSource).not.toContain("aria-pressed={active}");
    expect(explorerSource).toContain('t("metrics.inspector.descriptor")');
  });

  test("selects metrics from metric URL state instead of saved dashboard state", () => {
    expect(selectedMetricFromSearchParams(new URLSearchParams("metric=custom.metric"))).toBe(
      "custom.metric",
    );
    expect(selectedMetricFromSearchParams(new URLSearchParams("viewId=old-view"))).toBeNull();
  });

  test("creates a direct metric explorer query from descriptor and controls", () => {
    expect(
      buildMetricSeriesInput(descriptor, {
        from: "2026-05-14T08:00:00.000Z",
        to: "2026-05-14T09:00:00.000Z",
        aggregation: "sum",
        interval: "PT1M",
        groupBy: ["gen_ai.system"],
        filters: [{ key: "gen_ai.system", operator: "eq", value: "openai" }],
      }),
    ).toEqual({
      metricName: "gen_ai.client.token.usage",
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z",
      interval: "PT1M",
      aggregation: "sum",
      groupBy: ["gen_ai.system"],
      filters: [{ key: "gen_ai.system", operator: "eq", value: "openai" }],
      limit: 1000,
    });
  });

  test("defaults metric explorer controls without selecting a dashboard or saved view", () => {
    const state = defaultMetricQueryState(new URLSearchParams("metric=custom.metric"));

    expect(state.metricName).toBe("custom.metric");
    expect(state.aggregation).toBe("avg");
    expect(state.groupBy).toEqual([]);
    expect(state.chartType).toBe("line");
  });

  test("resets only metric explorer caches on project changes", () => {
    expect(metricRouteCachePredicate(["MetricSeries", { metricName: "a" }])).toBe(true);
    expect(metricRouteCachePredicate(["MetricNames", {}])).toBe(true);
    expect(metricRouteCachePredicate(["Dashboards", {}])).toBe(false);
    expect(metricRouteCachePredicate(["TraceSearch", {}])).toBe(false);
  });

  test("sanitizes groupBy to descriptor attribute keys", () => {
    expect(
      sanitizeMetricGroupBy(
        ["gen_ai.system", "invented.dimension", "gen_ai.token.type"],
        descriptor,
      ),
    ).toEqual(["gen_ai.system", "gen_ai.token.type"]);
  });

  test("uses approved inspector tabs and tab URL defaults", () => {
    expect(metricInspectorTabOrDefault("attributes")).toBe("attributes");
    expect(metricInspectorTabOrDefault("series")).toBe("series");
    expect(metricInspectorTabOrDefault("exemplars")).toBe("exemplars");
    expect(metricInspectorTabOrDefault("old")).toBe("descriptor");

    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <MetricInspector
          descriptor={descriptor}
          groupBy={["gen_ai.system"]}
          onGroupByChange={() => {}}
          onTabChange={() => {}}
          result={null}
          tab="descriptor"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain(">Descriptor<");
    expect(markup).toContain(">Attributes<");
    expect(markup).toContain(">Series<");
    expect(markup).toContain(">Exemplars<");
  });

  test("builds exemplar trace and span links", () => {
    expect(buildExemplarTraceHref({ traceId: "trace-1", spanId: "span-2" })).toBe(
      "/traces/trace-1?spanId=span-2",
    );
    expect(buildExemplarTraceHref({ traceId: "trace-1", spanId: null })).toBe("/traces/trace-1");
    expect(buildExemplarTraceHref({ traceId: null, spanId: "span-2" })).toBeNull();
  });
});
