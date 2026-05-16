import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(
  join(import.meta.dir, "../src/routes/dashboards-route.tsx"),
  "utf8",
);

describe("dashboards UX migration", () => {
  test("uses shadcn dialog confirmations and sheet-based widget editing", () => {
    expect(routeSource).not.toContain("window.confirm");
    expect(routeSource).toContain("../components/ui/sheet");
    expect(routeSource).toContain("../components/ui/dialog");
    expect(routeSource).toContain("notifyMutationSuccess");
    expect(routeSource).toContain("notifyMutationError");
    expect(routeSource).toContain('t("dashboards.discard.title")');
    expect(routeSource).toContain('t("dashboards.deleteDialog.title")');
  });

  test("splits dashboard overview from the builder inspector", () => {
    expect(routeSource).toContain("DashboardOverview");
    expect(routeSource).toContain("WidgetEditorSheet");
    expect(routeSource).toContain("../components/ui/sheet");
    expect(routeSource).not.toContain("xl:grid-cols-[minmax(0,1fr)_420px]");
    expect(routeSource).not.toContain("xl:grid-cols-[280px_minmax(0,1fr)_420px]");
    expect(routeSource).toContain('searchParams.get("dashboard")');
  });

  test("keeps one right inspector with required editor groups and supported widget creation", () => {
    expect(routeSource).not.toContain("h-[calc(100vh-5.5rem)]");
    expect(routeSource).not.toContain("function WidgetInspector");
    expect(routeSource).toContain("WidgetEditorSheet");
    expect(routeSource).toContain("SheetContent");
    expect(routeSource).toContain("data-dashboard-inspector");
    expect(routeSource).toContain("AddWidgetButton");
    expect(routeSource).not.toContain("WidgetCreateActions");
    expect(routeSource).toContain("../components/ui/popover");
    expect(routeSource).toContain('t("dashboards.widget.add")');
    expect(routeSource).toContain("RouteBreadcrumb");
    expect(routeSource).toContain('t("dashboards.editor.data")');
    expect(routeSource).toContain('t("dashboards.editor.display")');
    expect(routeSource).toContain('t("dashboards.editor.thresholds")');
    expect(routeSource).toContain('t("dashboards.descriptionField")');
    expect(routeSource).toContain("updateDashboardDraft");
    expect(routeSource).toContain('"metric_timeseries"');
    expect(routeSource).toContain('"metric_stat"');
    expect(routeSource).toContain('"metric_table"');
    expect(routeSource).toContain('"log_table"');
    expect(routeSource).toContain('"trace_table"');
    expect(routeSource).toContain('"live_trace_table"');
  });

  test("renders dashboard rail groups and visible dirty draft state", () => {
    expect(routeSource).toContain("Star");
    expect(routeSource).toContain("StarOff");
    expect(routeSource).toContain('t("dashboards.rail.pinned")');
    expect(routeSource).toContain('t("dashboards.rail.builtin")');
    expect(routeSource).toContain('t("dashboards.rail.personal")');
    expect(routeSource).toContain('t("dashboards.rail.project")');
    expect(routeSource).toContain("data-dashboard-dirty");
    expect(routeSource).not.toContain("cnDashboardRailRow");
    expect(routeSource).not.toContain("cnDashboardRailButton");
  });

  test("renders typed dashboard widget data instead of metric-only summaries", () => {
    expect(routeSource).toContain("TelemetryChart");
    expect(routeSource).toContain("buildMetricChartData");
    expect(routeSource).toContain('visualization === "pie"');
    expect(routeSource).toContain('<SelectItem value="pie">pie</SelectItem>');
    expect(routeSource).toContain("LogWidgetPreview");
    expect(routeSource).toContain("TraceWidgetPreview");
    expect(routeSource).toContain("LiveTraceWidgetPreview");
    expect(routeSource).toContain("metricDescriptorQuery");
    expect(routeSource).toContain("metricDescriptorExists");
    expect(routeSource).toContain("telemetryClient.getMetricNames");
    expect(routeSource).toContain("telemetryClient.searchLogs");
    expect(routeSource).toContain("telemetryClient.searchTraces");
    expect(routeSource).toContain("telemetryClient.subscribeLiveTraces");
    expect(routeSource).toContain("updateLogWidget");
    expect(routeSource).toContain("updateTraceWidget");
    expect(routeSource).toContain("updateLiveTraceWidget");
  });

  test("does not send null optional metric intervals from dashboard widgets", () => {
    expect(routeSource).toContain("...(metric.interval ? { interval: metric.interval } : {})");
    expect(routeSource).not.toContain("interval: metric.interval ?? null");
  });

  test("uses shadcn select instead of the native select wrapper", () => {
    expect(routeSource).toContain("../components/ui/select");
    expect(routeSource).not.toContain("NativeSelect");
    expect(routeSource).not.toContain("native-select");
  });
});
