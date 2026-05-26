import { describe, expect, test } from "bun:test";
import {
  dashboardDraftReducer,
  startDashboardDraft,
  toDashboardSaveInput,
} from "../src/features/dashboards/dashboard-draft-reducer";
import type { Dashboard, DashboardWidgetInput } from "../src/lib/dashboard-contracts";

function widget(id: string): DashboardWidgetInput {
  return {
    id,
    title: id,
    kind: "metric_stat",
    layout: { x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
    metric: {
      metricName: "http.server.requests",
      aggregation: "sum",
      groupBy: [],
      filters: [],
      timeWindow: "PT1H",
      interval: "PT1M",
      visualization: "stat",
      legend: false,
      maxSeries: 20,
      thresholds: [],
    },
    richMetric: null,
    logs: null,
    traces: null,
    liveTraces: null,
    alert: null,
  };
}

function dashboard(): Dashboard {
  return {
    id: "dashboard:project_personal_local_latency",
    projectId: "default",
    slug: "latency",
    name: "Latency",
    description: "Latency dashboard",
    tags: ["latency"],
    version: 3,
    visibility: "personal",
    defaultTimeWindow: "PT1H",
    pinned: false,
    widgets: [widget("a")],
    createdAt: "2026-05-22T10:00:00.000Z",
    updatedAt: "2026-05-22T11:00:00.000Z",
    createdBy: "local-user",
    updatedBy: "local-user",
  };
}

describe("dashboard draft reducer", () => {
  test("starts editing an existing dashboard with versioned save payload metadata", () => {
    const state = startDashboardDraft({ source: "edit_existing", dashboard: dashboard() });

    expect(state.source).toBe("edit_existing");
    expect(state.dashboardId).toBe("dashboard:project_personal_local_latency");
    expect(state.version).toBe(3);
    expect(state.dirty).toEqual({
      layout: false,
      metadata: false,
      thresholds: false,
      widgetData: false,
      widgetDisplay: false,
    });
    expect(toDashboardSaveInput(state)).toMatchObject({
      id: "dashboard:project_personal_local_latency",
      version: 3,
      name: "Latency",
      visibility: "personal",
    });
  });

  test("tracks widget changes, supports undo/redo, and clears history on save success", () => {
    const initial = startDashboardDraft({ source: "new" });
    const withWidget = dashboardDraftReducer(initial, { type: "add_widget", widget: widget("a") });
    const moved = dashboardDraftReducer(withWidget, {
      type: "move_widget",
      deltaX: 3,
      deltaY: 1,
      widgetId: "a",
    });

    expect(moved.dirty.layout).toBe(true);
    expect(moved.history.undo.length).toBe(2);
    expect(moved.widgets[0]?.layout).toMatchObject({ x: 3, y: 1 });

    const undone = dashboardDraftReducer(moved, { type: "undo" });
    expect(undone.widgets[0]?.layout).toMatchObject({ x: 0, y: 0 });

    const redone = dashboardDraftReducer(undone, { type: "redo" });
    expect(redone.widgets[0]?.layout).toMatchObject({ x: 3, y: 1 });

    const saved = dashboardDraftReducer(redone, {
      type: "save_success",
      dashboard: { ...dashboard(), widgets: redone.widgets },
    });
    expect(saved.history).toEqual({ redo: [], undo: [] });
    expect(saved.dirty.layout).toBe(false);
  });

  test("keeps dirty draft state on version conflicts and records discard targets", () => {
    const initial = startDashboardDraft({ source: "new" });
    const renamed = dashboardDraftReducer(initial, {
      type: "update_metadata",
      patch: { name: "Checkout latency" },
    });
    const conflicted = dashboardDraftReducer(renamed, {
      type: "save_conflict",
      message: "dashboard version is stale",
    });

    expect(conflicted.dirty.metadata).toBe(true);
    expect(conflicted.conflict?.message).toBe("dashboard version is stale");

    const pending = dashboardDraftReducer(conflicted, {
      type: "request_discard",
      reason: "dashboard_switch",
      target: "dashboard:other",
    });
    expect(pending.pendingDiscard).toEqual({
      reason: "dashboard_switch",
      target: "dashboard:other",
    });
  });
});
