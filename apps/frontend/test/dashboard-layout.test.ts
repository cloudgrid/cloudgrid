import { describe, expect, test } from "bun:test";
import {
  compactDashboardLayout,
  defaultDashboardWidgetLayout,
  moveDashboardWidget,
  normalizeDashboardLayout,
  resizeDashboardWidget,
  sortDashboardWidgetsForSave,
} from "../src/features/dashboards/dashboard-layout";
import type { DashboardWidgetInput, SaveDashboardInput } from "../src/lib/dashboard-contracts";

function widget(id: string, layout: DashboardWidgetInput["layout"]): DashboardWidgetInput {
  return {
    id,
    title: id,
    kind: "metric_stat",
    layout,
    metric: null,
    richMetric: null,
    logs: null,
    traces: null,
    liveTraces: null,
  };
}

function draft(widgets: DashboardWidgetInput[]): SaveDashboardInput {
  return {
    name: "Dashboard",
    description: null,
    tags: [],
    visibility: "personal",
    defaultTimeWindow: "PT1H",
    widgets,
  };
}

describe("dashboard layout solver", () => {
  test("normalizes layouts to the 12-column dashboard bounds and widget minimums", () => {
    expect(
      normalizeDashboardLayout({
        x: 11,
        y: -4,
        w: 20,
        h: 20,
        minW: 4,
        minH: 3,
      }),
    ).toEqual({
      x: 0,
      y: 0,
      w: 12,
      h: 12,
      minW: 4,
      minH: 3,
    });

    expect(
      normalizeDashboardLayout({
        x: 8,
        y: 2,
        w: 2,
        h: 1,
        minW: 4,
        minH: 3,
      }),
    ).toEqual({
      x: 8,
      y: 2,
      w: 4,
      h: 3,
      minW: 4,
      minH: 3,
    });
  });

  test("pushes colliding widgets downward without overlap", () => {
    const compacted = compactDashboardLayout([
      widget("a", { x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 }),
      widget("b", { x: 3, y: 0, w: 6, h: 4, minW: 4, minH: 3 }),
    ]);

    expect(compacted.map((item) => [item.id, item.layout.x, item.layout.y])).toEqual([
      ["a", 0, 0],
      ["b", 3, 4],
    ]);
  });

  test("keeps the actively moved widget in the requested slot and moves blockers down", () => {
    const next = moveDashboardWidget(
      draft([
        widget("a", { x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 }),
        widget("b", { x: 6, y: 0, w: 6, h: 4, minW: 4, minH: 3 }),
      ]),
      "b",
      -6,
      0,
    );

    expect(next.widgets.map((item) => [item.id, item.layout.x, item.layout.y])).toEqual([
      ["b", 0, 0],
      ["a", 0, 4],
    ]);
  });

  test("resizes widgets with bounds, minimums, and deterministic save order", () => {
    const next = resizeDashboardWidget(
      draft([
        widget("a", { x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 3 }),
        widget("b", { x: 6, y: 0, w: 6, h: 4, minW: 4, minH: 3 }),
      ]),
      "a",
      -10,
      -10,
    );

    expect(next.widgets.find((item) => item.id === "a")?.layout).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      minW: 4,
      minH: 3,
    });
    expect(
      sortDashboardWidgetsForSave([
        widget("b", { x: 6, y: 3, w: 6, h: 4, minW: 4, minH: 3 }),
        widget("a", { x: 0, y: 0, w: 4, h: 3, minW: 4, minH: 3 }),
      ]).map((item) => item.id),
    ).toEqual(["a", "b"]);
  });

  test("derives stable default sizes for the supported widget kinds", () => {
    expect(defaultDashboardWidgetLayout("metric_stat", 1)).toMatchObject({
      w: 3,
      h: 2,
      minW: 2,
      minH: 2,
    });
    expect(defaultDashboardWidgetLayout("metric_rich", 1)).toMatchObject({
      w: 8,
      h: 5,
      minW: 5,
      minH: 3,
    });
    expect(defaultDashboardWidgetLayout("trace_table", 2)).toMatchObject({
      x: 6,
      y: 0,
      w: 6,
      h: 4,
      minW: 4,
      minH: 3,
    });
  });
});
