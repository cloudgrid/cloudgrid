import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(
  join(import.meta.dir, "../src/routes/dashboards-route.tsx"),
  "utf8",
);

describe("dashboards UX migration", () => {
  test("uses shared dashboard list contract defaults", () => {
    expect(routeSource).toContain("buildDashboardListInput");
    expect(routeSource).toContain("@cloudgrid/ui-contracts");
    expect(routeSource).not.toContain("getDashboards({ includeBuiltins: true");
  });

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
    expect(routeSource).not.toContain("RouteBreadcrumb");
    expect(routeSource).toContain('t("dashboards.editor.data")');
    expect(routeSource).toContain('t("dashboards.editor.display")');
    expect(routeSource).toContain('t("dashboards.editor.thresholds")');
    expect(routeSource).toContain('t("dashboards.name")');
    expect(routeSource).toContain("startDraftForSelectedDashboard");
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
    expect(routeSource).toContain("entries.length === 1");
    expect(routeSource).toContain('visualization === "pie"');
    expect(routeSource).toContain("metricChartTypes.map");
    expect(routeSource).toContain("LogWidgetPreview");
    expect(routeSource).toContain("TraceWidgetPreview");
    expect(routeSource).toContain("LiveTraceWidgetPreview");
    expect(routeSource).toContain("MetricNameCombobox");
    expect(routeSource).not.toContain("metricDescriptorQuery");
    expect(routeSource).not.toContain("metricDescriptorExists");
    expect(routeSource).toContain("telemetryClient.getMetricNames");
    expect(routeSource).toContain("telemetryClient.searchLogs");
    expect(routeSource).toContain("telemetryClient.searchTraces");
    expect(routeSource).toContain("telemetryClient.subscribeLiveTraces");
    expect(routeSource).toContain("updateLogWidget");
    expect(routeSource).toContain("updateTraceWidget");
    expect(routeSource).toContain("updateLiveTraceWidget");
  });

  test("supports alert dashboard widgets through typed contract fields", () => {
    expect(routeSource).toContain('"alert_status"');
    expect(routeSource).toContain('"alert_history"');
    expect(routeSource).toContain('"alert_evidence"');
    expect(routeSource).toContain("AlertStatusWidgetPreview");
    expect(routeSource).toContain("AlertHistoryWidgetPreview");
    expect(routeSource).toContain("AlertEvidenceWidgetPreview");
    expect(routeSource).toContain("AlertWidgetEditor");
    expect(routeSource).toContain("updateAlertWidget");
    expect(routeSource).toContain("getAlertSummary");
    expect(routeSource).toContain("queryKeys.alertSummary");
    expect(routeSource).toContain("getAlertHistory");
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

  test("supports WYSIWYG layout editing with pointer and keyboard controls", () => {
    expect(routeSource).toContain('type: "move_widget"');
    expect(routeSource).toContain('type: "resize_widget"');
    expect(routeSource).toContain("compactDashboardLayout");
    expect(routeSource).toContain("onPointerDown");
    expect(routeSource).toContain("onKeyDown");
    expect(routeSource).toContain('aria-label="Move widget"');
    expect(routeSource).toContain('aria-label="Resize widget"');
    expect(routeSource).toContain("data-dashboard-canvas");
    expect(routeSource).toContain("dashboardObservedMetricRange");
    expect(routeSource).toContain("metricNamesForDashboardWidgets");
    expect(routeSource).toContain("formatDateInput");
    expect(routeSource).toContain("withDatePart");
    expect(routeSource).toContain("data-dashboard-widget-selected");
    expect(routeSource).not.toContain("GRID_POINTER_CELL_WIDTH");
    expect(routeSource).toContain("data-resize-handle");
    expect(routeSource).toContain("getDashboardPointerCell");
  });

  test("exposes full widget draft actions and deterministic save ordering", () => {
    expect(routeSource).toContain("dashboardDraftReducer");
    expect(routeSource).toContain("duplicateWidgetInput");
    expect(routeSource).toContain('type: "remove_widget"');
    expect(routeSource).toContain("sortDashboardWidgetsForSave");
    expect(routeSource).toContain('t("dashboards.duplicate")');
    expect(routeSource).toContain('t("dashboards.delete")');
    expect(routeSource).toContain("saveMutation.mutate(prepareDashboardSaveInput(draft))");
  });

  test("supports rich metric widgets through typed contract fields", () => {
    expect(routeSource).toContain('"metric_rich"');
    expect(routeSource).toContain("richMetric");
    expect(routeSource).toContain("getRichMetricSeries");
    expect(routeSource).toContain("queryKeys.richMetricSeries");
    expect(routeSource).toContain("RichMetricWidgetEditor");
    expect(routeSource).toContain("addRichMetricQueryRow");
    expect(routeSource).toContain("addRichMetricFormula");
    expect(routeSource).toContain("displaySeries");
    expect(routeSource).not.toContain("eval(");
    expect(routeSource).not.toContain("new Function");
  });

  test("gates rich metric creation and editing until the implementation wave is complete", () => {
    expect(routeSource).toContain("RICH_METRIC_EDITING_ENABLED");
    expect(routeSource).toContain("isRichMetricEditingEnabled");
    expect(routeSource).toContain("RichMetricUnsupportedState");
    expect(routeSource).toContain("...(isRichMetricEditingEnabled()");
    expect(routeSource).toContain("!isRichMetricEditingEnabled() ? (");
  });

  test("offers the full dashboard chart catalog", () => {
    expect(routeSource).toContain("const metricChartTypes: MetricChartType[]");
    for (const chartType of [
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
    ]) {
      expect(routeSource).toContain(`"${chartType}"`);
    }
  });

  test("uses structured shadcn dashboard controls instead of raw text placeholders", () => {
    expect(routeSource).toContain("DashboardDateRangeControl");
    expect(routeSource).toContain("../components/ui/calendar");
    expect(routeSource).toContain("../components/ui/command");
    expect(routeSource).toContain("../components/ui/dropdown-menu");
    expect(routeSource).toContain("MetricNameCombobox");
    expect(routeSource).toContain("WidgetActionMenu");
    expect(routeSource).not.toContain('id="dashboard-from"');
    expect(routeSource).not.toContain('id="dashboard-to"');
    expect(routeSource).not.toContain("metricDescriptorExists");
  });
});
