import type {
  DashboardWidgetInput,
  DashboardWidgetKind,
  DashboardWidgetLayout,
  DashboardWidgetLayoutInput,
  SaveDashboardInput,
} from "../../lib/dashboard-contracts";

export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_GRID_ROW_HEIGHT = 72;
const MAX_WIDGET_HEIGHT = 12;

const DEFAULT_WIDGET_LAYOUTS: Record<
  DashboardWidgetKind,
  Pick<DashboardWidgetLayout, "w" | "h" | "minW" | "minH">
> = {
  metric_timeseries: { w: 6, h: 4, minW: 4, minH: 3 },
  metric_stat: { w: 3, h: 2, minW: 2, minH: 2 },
  metric_table: { w: 6, h: 4, minW: 4, minH: 3 },
  metric_rich: { w: 8, h: 5, minW: 5, minH: 3 },
  log_table: { w: 6, h: 4, minW: 4, minH: 3 },
  trace_table: { w: 6, h: 4, minW: 4, minH: 3 },
  live_trace_table: { w: 6, h: 4, minW: 4, minH: 3 },
  alert_status: { w: 4, h: 3, minW: 3, minH: 2 },
  alert_history: { w: 6, h: 4, minW: 4, minH: 3 },
  alert_evidence: { w: 6, h: 3, minW: 4, minH: 2 },
};

type IndexedWidget = {
  widget: DashboardWidgetInput;
  index: number;
};

export function normalizeDashboardLayout(
  layout: DashboardWidgetLayoutInput,
): DashboardWidgetLayout {
  const minW = clampInteger(layout.minW ?? 1, 1, DASHBOARD_GRID_COLUMNS);
  const minH = clampInteger(layout.minH ?? 1, 1, MAX_WIDGET_HEIGHT);
  const w = clampInteger(layout.w, minW, DASHBOARD_GRID_COLUMNS);
  const h = clampInteger(layout.h, minH, MAX_WIDGET_HEIGHT);
  const x = clampInteger(layout.x, 0, DASHBOARD_GRID_COLUMNS - w);
  const y = Math.max(0, integerOr(layout.y, 0));

  return { x, y, w, h, minW, minH };
}

export function defaultDashboardWidgetLayout(
  kind: DashboardWidgetKind,
  slot = 1,
): DashboardWidgetLayout {
  const baseLayout = DEFAULT_WIDGET_LAYOUTS[kind];
  const columnSlots = Math.max(1, Math.floor(DASHBOARD_GRID_COLUMNS / baseLayout.w));
  const slotIndex = Math.max(0, integerOr(slot, 1) - 1);

  return normalizeDashboardLayout({
    ...baseLayout,
    x: (slotIndex % columnSlots) * baseLayout.w,
    y: Math.floor(slotIndex / columnSlots) * baseLayout.h,
  });
}

export function compactDashboardLayout(
  widgets: DashboardWidgetInput[],
  priorityWidgetId?: string,
): DashboardWidgetInput[] {
  const indexedWidgets = widgets.map((widget, index) => ({
    widget: cloneWidgetWithLayout(widget, normalizeDashboardLayout(widget.layout)),
    index,
  }));
  const orderedWidgets = orderWidgetsForCompaction(indexedWidgets, priorityWidgetId);
  const placedWidgets: IndexedWidget[] = [];

  for (const item of orderedWidgets) {
    const widget = cloneWidgetWithLayout(item.widget, item.widget.layout);

    while (true) {
      const blocker = placedWidgets.find((placed) =>
        layoutsOverlap(widget.layout, placed.widget.layout),
      );

      if (!blocker) {
        break;
      }

      widget.layout = {
        ...widget.layout,
        y: blocker.widget.layout.y + blocker.widget.layout.h,
      };
    }

    placedWidgets.push({ widget, index: item.index });
  }

  return sortIndexedWidgetsForSave(placedWidgets).map((item) => item.widget);
}

export function moveDashboardWidget(
  draft: SaveDashboardInput,
  widgetId: string,
  deltaX: number,
  deltaY: number,
): SaveDashboardInput {
  if (!draft.widgets.some((widget) => widget.id === widgetId)) {
    return {
      ...draft,
      widgets: compactDashboardLayout(draft.widgets),
    };
  }

  return {
    ...draft,
    widgets: compactDashboardLayout(
      draft.widgets.map((widget) => {
        if (widget.id !== widgetId) {
          return cloneWidgetWithLayout(widget, normalizeDashboardLayout(widget.layout));
        }

        const layout = normalizeDashboardLayout(widget.layout);

        return cloneWidgetWithLayout(
          widget,
          normalizeDashboardLayout({
            ...layout,
            x: layout.x + integerOr(deltaX, 0),
            y: layout.y + integerOr(deltaY, 0),
          }),
        );
      }),
      widgetId,
    ),
  };
}

export function resizeDashboardWidget(
  draft: SaveDashboardInput,
  widgetId: string,
  deltaW: number,
  deltaH: number,
): SaveDashboardInput {
  if (!draft.widgets.some((widget) => widget.id === widgetId)) {
    return {
      ...draft,
      widgets: compactDashboardLayout(draft.widgets),
    };
  }

  return {
    ...draft,
    widgets: compactDashboardLayout(
      draft.widgets.map((widget) => {
        if (widget.id !== widgetId) {
          return cloneWidgetWithLayout(widget, normalizeDashboardLayout(widget.layout));
        }

        const layout = normalizeDashboardLayout(widget.layout);

        return cloneWidgetWithLayout(
          widget,
          normalizeDashboardLayout({
            ...layout,
            w: layout.w + integerOr(deltaW, 0),
            h: layout.h + integerOr(deltaH, 0),
          }),
        );
      }),
      widgetId,
    ),
  };
}

export function sortDashboardWidgetsForSave(
  widgets: DashboardWidgetInput[],
): DashboardWidgetInput[] {
  return sortIndexedWidgetsForSave(
    widgets.map((widget, index) => ({
      widget,
      index,
    })),
  ).map((item) => item.widget);
}

function orderWidgetsForCompaction(
  widgets: IndexedWidget[],
  priorityWidgetId?: string,
): IndexedWidget[] {
  if (!priorityWidgetId) {
    return widgets;
  }

  const priorityWidget = widgets.find((item) => item.widget.id === priorityWidgetId);

  if (!priorityWidget) {
    return widgets;
  }

  return [priorityWidget, ...widgets.filter((item) => item.widget.id !== priorityWidgetId)];
}

function sortIndexedWidgetsForSave(widgets: IndexedWidget[]): IndexedWidget[] {
  return [...widgets].sort((left, right) => {
    const leftLayout = left.widget.layout;
    const rightLayout = right.widget.layout;

    return leftLayout.y - rightLayout.y || leftLayout.x - rightLayout.x || left.index - right.index;
  });
}

function layoutsOverlap(
  left: DashboardWidgetLayoutInput,
  right: DashboardWidgetLayoutInput,
): boolean {
  const leftLayout = normalizeDashboardLayout(left);
  const rightLayout = normalizeDashboardLayout(right);

  return (
    leftLayout.x < rightLayout.x + rightLayout.w &&
    leftLayout.x + leftLayout.w > rightLayout.x &&
    leftLayout.y < rightLayout.y + rightLayout.h &&
    leftLayout.y + leftLayout.h > rightLayout.y
  );
}

function cloneWidgetWithLayout(
  widget: DashboardWidgetInput,
  layout: DashboardWidgetLayoutInput,
): DashboardWidgetInput {
  return {
    ...widget,
    layout: normalizeDashboardLayout(layout),
  };
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, integerOr(value, min)));
}

function integerOr(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.trunc(value);
}
