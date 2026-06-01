import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (rel: string) => readFileSync(join(import.meta.dir, "../src", rel), "utf8");

const routeSource = src("routes/dashboards-route.tsx");
const metricRendererSource = src("features/dashboards/widget-renderers/metric-widget-renderer.tsx");
const richMetricRendererSource = src(
  "features/dashboards/widget-renderers/rich-metric-widget-renderer.tsx",
);
const widgetEditorGroupsSource = src("features/dashboards/widget-editor/widget-editor-groups.tsx");
const metricWidgetEditorSource = src("features/dashboards/widget-editor/metric-widget-editor.tsx");
const richMetricEditorSource = src(
  "features/dashboards/widget-editor/rich-metric-widget-editor.tsx",
);
const logEditorSource = src("features/dashboards/widget-editor/log-widget-editor.tsx");
const traceEditorSource = src("features/dashboards/widget-editor/trace-widget-editor.tsx");
const liveTraceEditorSource = src("features/dashboards/widget-editor/live-trace-widget-editor.tsx");
const alertEditorSource = src("features/dashboards/widget-editor/alert-widget-editor.tsx");
const liveTraceRendererSource = src(
  "features/dashboards/widget-renderers/live-trace-widget-renderer.tsx",
);
const metricQueryControlsSource = src("features/metrics/metric-query-controls.tsx");
const sourceMappersSource = src("features/dashboards/widget-source-mappers.ts");
const appShellSource = src("routes/app-shell.tsx");
const uiContractsTelemetrySource = readFileSync(
  join(import.meta.dir, "../../packages/ui-contracts/src/telemetry-query.ts"),
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
    expect(widgetEditorGroupsSource).toContain('t("dashboards.editor.data")');
    expect(widgetEditorGroupsSource).toContain('t("dashboards.editor.display")');
    expect(widgetEditorGroupsSource).toContain('t("dashboards.editor.thresholds")');
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
    // pinned overview group is removed — dashboards appear in their visibility group with a star icon
    expect(routeSource).not.toContain('"pinned"');
    expect(routeSource).toContain('t("dashboards.rail.builtin")');
    expect(routeSource).toContain('t("dashboards.rail.personal")');
    expect(routeSource).toContain('t("dashboards.rail.project")');
    expect(routeSource).toContain("data-dashboard-dirty");
    expect(routeSource).not.toContain("cnDashboardRailRow");
    expect(routeSource).not.toContain("cnDashboardRailButton");
  });

  test("renders typed dashboard widget data instead of metric-only summaries", () => {
    expect(metricRendererSource).toContain("TelemetryChart");
    expect(metricRendererSource).toContain("buildMetricChartData");
    expect(metricRendererSource).toContain("entries.length === 1");
    expect(metricRendererSource).toContain('visualization === "pie"');
    expect(widgetEditorGroupsSource).toContain("metricChartTypes.map");
    expect(routeSource).toContain("LogWidgetPreview");
    expect(routeSource).toContain("TraceWidgetPreview");
    expect(routeSource).toContain("LiveTraceWidgetPreview");
    expect(metricWidgetEditorSource).toContain("MetricNameCombobox");
    expect(routeSource).not.toContain("metricDescriptorQuery");
    expect(routeSource).not.toContain("metricDescriptorExists");
    expect(metricQueryControlsSource).toContain("telemetryClient.getMetricNames");
    expect(routeSource).toContain("telemetryClient.searchLogs");
    expect(routeSource).toContain("telemetryClient.searchTraces");
    expect(liveTraceRendererSource).toContain("telemetryClient.subscribeLiveTraces");
    expect(logEditorSource).toContain("updateLogWidget");
    expect(traceEditorSource).toContain("updateTraceWidget");
    expect(liveTraceEditorSource).toContain("updateLiveTraceWidget");
  });

  test("supports alert dashboard widgets through typed contract fields", () => {
    expect(routeSource).toContain('"alert_status"');
    expect(routeSource).toContain('"alert_history"');
    expect(routeSource).toContain('"alert_evidence"');
    expect(routeSource).toContain("AlertStatusWidgetPreview");
    expect(routeSource).toContain("AlertHistoryWidgetPreview");
    expect(routeSource).toContain("AlertEvidenceWidgetPreview");
    expect(widgetEditorGroupsSource).toContain("AlertWidgetEditor");
    expect(alertEditorSource).toContain("updateAlertWidget");
    expect(routeSource).toContain("getAlertSummary");
    expect(routeSource).toContain("queryKeys.alertSummary");
    expect(routeSource).toContain("getAlertHistory");
  });

  test("routes dashboard widget editor copy through translation keys", () => {
    expect(alertEditorSource).toContain('t("dashboards.editor.ruleIds")');
    expect(alertEditorSource).toContain('t("dashboards.editor.states")');
    expect(alertEditorSource).toContain('t("dashboards.editor.severities")');
    expect(alertEditorSource).toContain('t("dashboards.editor.signals")');
    expect(alertEditorSource).toContain('t("dashboards.editor.timeWindow")');
    expect(alertEditorSource).toContain('t("dashboards.editor.limit")');
    expect(logEditorSource).toContain('t("dashboards.editor.limit")');
    expect(traceEditorSource).toContain('t("dashboards.editor.limit")');
    expect(liveTraceEditorSource).toContain('t("dashboards.editor.limit")');
    expect(richMetricEditorSource).toContain('t("dashboards.richMetric.unsupported")');
    expect(richMetricEditorSource).toContain('t("dashboards.editor.displaySeries")');
    expect(richMetricRendererSource).toContain('t("dashboards.editor.displaySeries")');
  });

  test("does not send null optional metric intervals from dashboard widgets", () => {
    expect(sourceMappersSource).toContain(
      "...(metric.interval ? { interval: metric.interval } : {})",
    );
    expect(sourceMappersSource).not.toContain("interval: metric.interval ?? null");
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
    expect(routeSource).toContain('aria-label={t("dashboards.widget.move")}');
    expect(routeSource).toContain('aria-label={t("dashboards.widget.resize")}');
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
    expect(widgetEditorGroupsSource).toContain("RichMetricWidgetEditor");
    expect(richMetricEditorSource).toContain("addRichMetricQueryRow");
    expect(richMetricEditorSource).toContain("addRichMetricFormula");
    expect(richMetricRendererSource).toContain("displaySeries");
    expect(routeSource).not.toContain("eval(");
    expect(routeSource).not.toContain("new Function");
    expect(richMetricEditorSource).not.toContain("eval(");
    expect(richMetricEditorSource).not.toContain("new Function");
  });

  test("gates rich metric creation and editing until the implementation wave is complete", () => {
    expect(richMetricEditorSource).toContain("RICH_METRIC_EDITING_ENABLED");
    expect(routeSource).toContain("isRichMetricEditingEnabled");
    expect(widgetEditorGroupsSource).toContain("RichMetricUnsupportedState");
    expect(routeSource).toContain("...(isRichMetricEditingEnabled()");
    expect(widgetEditorGroupsSource).toContain("!isRichMetricEditingEnabled() ? (");
  });

  test("offers the full dashboard chart catalog", () => {
    expect(widgetEditorGroupsSource).toContain("const metricChartTypes: MetricChartType[]");
    expect(widgetEditorGroupsSource).toContain("METRIC_CHART_TYPES");
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
      expect(uiContractsTelemetrySource).toContain(`"${chartType}"`);
    }
  });

  test("uses structured shadcn dashboard controls instead of raw text placeholders", () => {
    expect(routeSource).toContain("DashboardDateRangeControl");
    expect(routeSource).toContain("../components/ui/calendar");
    expect(routeSource).toContain("../components/ui/command");
    expect(routeSource).toContain("../components/ui/dropdown-menu");
    expect(metricWidgetEditorSource).toContain("MetricNameCombobox");
    expect(routeSource).toContain("WidgetActionMenu");
    expect(routeSource).not.toContain('id="dashboard-from"');
    expect(routeSource).not.toContain('id="dashboard-to"');
    expect(routeSource).not.toContain("metricDescriptorExists");
  });

  test("persisted pin shortcuts use only GraphQL contract data with no browser storage", () => {
    expect(appShellSource).not.toContain("localStorage");
    expect(appShellSource).not.toContain("sessionStorage");
    expect(appShellSource).toContain("pinnedDashboardIds");
    expect(appShellSource).toContain("client.reorderDashboardPins");
    expect(routeSource).toContain("client.setDashboardPinned");
    expect(routeSource).not.toContain("localStorage");
    expect(routeSource).not.toContain("sessionStorage");
  });

  test("caps visible pinned shortcuts at five", () => {
    expect(appShellSource).toContain(".slice(0, 5)");
  });

  test("exposes accessible reorder controls for pinned shortcuts", () => {
    expect(appShellSource).toContain("reorderDashboardPins");
    expect(appShellSource).toContain("onReorderPin");
    expect(appShellSource).toContain('"up"');
    expect(appShellSource).toContain('"down"');
    expect(appShellSource).toContain('t("dashboards.pin.moveUp")');
    expect(appShellSource).toContain('t("dashboards.pin.moveDown")');
  });
});
