import {
  compactDashboardLayout,
  moveDashboardWidget,
  resizeDashboardWidget,
  sortDashboardWidgetsForSave,
} from "./dashboard-layout";
import type {
  Dashboard,
  DashboardWidgetInput,
  SaveDashboardInput,
} from "../../lib/dashboard-contracts";

type DraftSource = "duplicate" | "edit_existing" | "new";
type EditorMode = "closed" | "details" | "edit";
type DiscardReason = "dashboard_switch" | "drawer_close" | "project_switch" | "route_switch";

export type DashboardDraftDirtyState = {
  layout: boolean;
  metadata: boolean;
  thresholds: boolean;
  widgetData: boolean;
  widgetDisplay: boolean;
};

export type DashboardDraftState = {
  conflict: { message: string } | null;
  dashboardId: string | null;
  dirty: DashboardDraftDirtyState;
  editorMode: EditorMode;
  history: {
    redo: DashboardWidgetInput[][];
    undo: DashboardWidgetInput[][];
  };
  metadata: {
    defaultTimeWindow: string;
    description: string | null;
    name: string;
    tags: string[];
    visibility: "personal" | "project";
  };
  pendingDiscard: { reason: DiscardReason; target: string | null } | null;
  selectedWidgetId: string | null;
  source: DraftSource;
  sourceVisibility: Dashboard["visibility"] | null;
  version: number | null;
  widgets: DashboardWidgetInput[];
};

type StartDraftInput =
  | { source: "new" }
  | { dashboard: Dashboard; source: "duplicate" | "edit_existing" };

export type DashboardDraftAction =
  | { type: "add_widget"; widget: DashboardWidgetInput }
  | { type: "cancel_discard" }
  | { type: "duplicate_widget"; widget: DashboardWidgetInput }
  | { type: "mark_save_pending" }
  | { type: "move_widget"; deltaX: number; deltaY: number; widgetId: string }
  | { type: "redo" }
  | { type: "remove_widget"; widgetId: string }
  | { reason: DiscardReason; target?: string | null; type: "request_discard" }
  | { deltaHeight: number; deltaWidth: number; type: "resize_widget"; widgetId: string }
  | { dashboard: Dashboard; type: "save_success" }
  | { message: string; type: "save_conflict" }
  | { message: string; type: "save_validation_error" }
  | { type: "select_widget"; widgetId: string | null; editorMode?: EditorMode }
  | { patch: Partial<DashboardDraftState["metadata"]>; type: "update_metadata" }
  | { type: "update_widget_data"; widget: DashboardWidgetInput }
  | { type: "update_widget_display"; widget: DashboardWidgetInput }
  | { type: "update_widget_thresholds"; widget: DashboardWidgetInput }
  | { type: "undo" };

const cleanDirtyState: DashboardDraftDirtyState = {
  layout: false,
  metadata: false,
  thresholds: false,
  widgetData: false,
  widgetDisplay: false,
};

export function startDashboardDraft(input: StartDraftInput): DashboardDraftState {
  if (input.source === "new") {
    return {
      conflict: null,
      dashboardId: null,
      dirty: { ...cleanDirtyState },
      editorMode: "closed",
      history: { redo: [], undo: [] },
      metadata: {
        defaultTimeWindow: "PT1H",
        description: null,
        name: "Untitled dashboard",
        tags: [],
        visibility: "personal",
      },
      pendingDiscard: null,
      selectedWidgetId: null,
      source: "new",
      sourceVisibility: null,
      version: null,
      widgets: [],
    };
  }

  const dashboard = input.dashboard;
  return {
    conflict: null,
    dashboardId: input.source === "edit_existing" ? dashboard.id : null,
    dirty: { ...cleanDirtyState },
    editorMode: "closed",
    history: { redo: [], undo: [] },
    metadata: {
      defaultTimeWindow: dashboard.defaultTimeWindow,
      description: dashboard.description ?? null,
      name: input.source === "duplicate" ? `${dashboard.name} Copy` : dashboard.name,
      tags: [...dashboard.tags],
      visibility: dashboard.visibility === "project" ? "project" : "personal",
    },
    pendingDiscard: null,
    selectedWidgetId: null,
    source: input.source,
    sourceVisibility: dashboard.visibility,
    version: input.source === "edit_existing" ? dashboard.version : null,
    widgets: dashboard.widgets.map(toWidgetInput),
  };
}

export function dashboardDraftReducer(
  state: DashboardDraftState,
  action: DashboardDraftAction,
): DashboardDraftState {
  switch (action.type) {
    case "add_widget":
      return withWidgetHistory(state, [...state.widgets, action.widget], {
        layout: true,
        widgetData: true,
        widgetDisplay: true,
      });
    case "cancel_discard":
      return { ...state, pendingDiscard: null };
    case "duplicate_widget":
      return withWidgetHistory(state, [...state.widgets, action.widget], {
        layout: true,
        widgetData: true,
        widgetDisplay: true,
      });
    case "mark_save_pending":
      return { ...state, conflict: null };
    case "move_widget":
      return {
        ...withWidgetHistory(
          state,
          moveDashboardWidget(
            toReducerSaveInput(state),
            action.widgetId,
            action.deltaX,
            action.deltaY,
          ).widgets,
          { layout: true },
        ),
        selectedWidgetId: action.widgetId,
      };
    case "redo":
      return redo(state);
    case "remove_widget":
      return withWidgetHistory(
        {
          ...state,
          selectedWidgetId:
            state.selectedWidgetId === action.widgetId ? null : state.selectedWidgetId,
        },
        state.widgets.filter((widget) => widget.id !== action.widgetId),
        { layout: true, widgetData: true, widgetDisplay: true },
      );
    case "request_discard":
      return {
        ...state,
        pendingDiscard: { reason: action.reason, target: action.target ?? null },
      };
    case "resize_widget":
      return {
        ...withWidgetHistory(
          state,
          resizeDashboardWidget(
            toReducerSaveInput(state),
            action.widgetId,
            action.deltaWidth,
            action.deltaHeight,
          ).widgets,
          { layout: true },
        ),
        selectedWidgetId: action.widgetId,
      };
    case "save_conflict":
      return { ...state, conflict: { message: action.message } };
    case "save_success":
      return {
        ...startDashboardDraft({ dashboard: action.dashboard, source: "edit_existing" }),
        history: { redo: [], undo: [] },
      };
    case "save_validation_error":
      return { ...state, conflict: { message: action.message } };
    case "select_widget":
      return {
        ...state,
        editorMode: action.editorMode ?? (action.widgetId ? "details" : "closed"),
        selectedWidgetId: action.widgetId,
      };
    case "undo":
      return undo(state);
    case "update_metadata":
      return {
        ...state,
        conflict: null,
        dirty: { ...state.dirty, metadata: true },
        metadata: { ...state.metadata, ...action.patch },
      };
    case "update_widget_data":
      return replaceWidget(state, action.widget, { widgetData: true });
    case "update_widget_display":
      return replaceWidget(state, action.widget, { widgetDisplay: true });
    case "update_widget_thresholds":
      return replaceWidget(state, action.widget, { thresholds: true });
  }
}

export function toDashboardSaveInput(state: DashboardDraftState): SaveDashboardInput {
  return {
    ...(state.dashboardId ? { id: state.dashboardId } : {}),
    ...(state.version ? { version: state.version } : {}),
    name: state.metadata.name,
    description: state.metadata.description,
    tags: [...state.metadata.tags],
    visibility: state.metadata.visibility,
    defaultTimeWindow: state.metadata.defaultTimeWindow,
    widgets: sortDashboardWidgetsForSave(compactDashboardLayout(state.widgets)),
  };
}

function replaceWidget(
  state: DashboardDraftState,
  widget: DashboardWidgetInput,
  dirty: Partial<DashboardDraftDirtyState>,
) {
  return withWidgetHistory(
    state,
    state.widgets.map((candidate) => (candidate.id === widget.id ? widget : candidate)),
    dirty,
  );
}

function withWidgetHistory(
  state: DashboardDraftState,
  widgets: DashboardWidgetInput[],
  dirty: Partial<DashboardDraftDirtyState>,
): DashboardDraftState {
  return {
    ...state,
    conflict: null,
    dirty: { ...state.dirty, ...dirty },
    history: {
      redo: [],
      undo: [...state.history.undo, state.widgets],
    },
    widgets: compactDashboardLayout(widgets),
  };
}

function undo(state: DashboardDraftState): DashboardDraftState {
  const previous = state.history.undo.at(-1);
  if (!previous) {
    return state;
  }
  return {
    ...state,
    history: {
      redo: [state.widgets, ...state.history.redo],
      undo: state.history.undo.slice(0, -1),
    },
    widgets: previous,
  };
}

function redo(state: DashboardDraftState): DashboardDraftState {
  const next = state.history.redo[0];
  if (!next) {
    return state;
  }
  return {
    ...state,
    history: {
      redo: state.history.redo.slice(1),
      undo: [...state.history.undo, state.widgets],
    },
    widgets: next,
  };
}

function toReducerSaveInput(state: DashboardDraftState): SaveDashboardInput {
  return {
    name: state.metadata.name,
    description: state.metadata.description,
    tags: state.metadata.tags,
    visibility: state.metadata.visibility,
    defaultTimeWindow: state.metadata.defaultTimeWindow,
    widgets: state.widgets,
  };
}

function toWidgetInput(widget: Dashboard["widgets"][number]): DashboardWidgetInput {
  return {
    id: widget.id,
    title: widget.title,
    description: widget.description ?? null,
    kind: widget.kind,
    layout: { ...widget.layout },
    metric: widget.metric ? { ...widget.metric } : null,
    richMetric: widget.richMetric ? { ...widget.richMetric } : null,
    logs: widget.logs ? { ...widget.logs } : null,
    traces: widget.traces ? { ...widget.traces } : null,
    liveTraces: widget.liveTraces ? { ...widget.liveTraces } : null,
    alert: widget.alert ? { ...widget.alert } : null,
  };
}
