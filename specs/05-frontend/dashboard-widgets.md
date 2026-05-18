---
id: TEC-FE-008
title: Dashboard widgets
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: user-requested
depends_on: [TEC-BE-011, TEC-BE-017]
---

# Dashboard Widgets

This spec defines saved dashboard configuration requirements. Concrete route layout, dashboard rail behavior, widget editor placement, and route acceptance are defined in [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md).

## Intent

Each project can have reusable dashboards made from typed widgets. Dashboards answer common operational questions without forcing users to rebuild metric, log, trace, or live views every time.

## Current Coverage And Required Target

The existing dashboard contract already covers saved dashboards, typed widgets, metric/log/trace/live sources, pinning, built-in dashboards, and a bounded grid layout object. That is not enough for the full dashboard editor target.

The full editor target requires:

- an accessible drag-and-drop widget canvas;
- pointer and keyboard resizing for widget width and height;
- deterministic layout compaction and collision handling;
- a richer visualization catalog built on the existing shadcn/Recharts chart foundation;
- typed multi-query and formula metric widgets owned by storage-read, not by frontend or BFF computation;
- a developer experience that keeps dashboard layout, widget source mapping, and chart rendering in focused modules instead of one monolithic route file.

Until the rich query contracts are generated, production UI must hide rich query controls and continue to save only the currently declared widget input shapes.

## Saved Dashboard Definitions

A saved dashboard belongs to exactly one selected project and contains:

- name, description, tags, visibility, default time window, version, created/updated metadata;
- ordered, positioned widgets with stable IDs and bounded grid layout;
- one typed widget source per widget kind;
- metric widgets with metric name, aggregation, grouping, filters, time window, interval, visualization, legend, max series, and typed thresholds;
- log table widgets with search/filter/sort/column/limit config compatible with `LogSearchInput`;
- trace table widgets with search/filter/sort/column/limit config compatible with `TraceSearchInput`;
- live trace table widgets with bounded filter config compatible with `LiveTraceInput`.

Dashboard definitions are low-volume project configuration stored by control-plane. The frontend must not use browser localStorage as the source of truth for saved dashboards or pins.

## Dashboard Editor Model

The dashboard editor has two local modes:

- View mode: widgets render data, links, refresh actions, expand actions, and selection affordances. Drag handles and resize handles are hidden.
- Edit mode: widgets expose drag handles, resize handles, duplicate/remove/edit actions, and layout focus rings. Editing is local draft state until explicit save.

Builder state is a reducer-owned draft with these responsibilities:

- selected widget ID;
- unsaved dashboard fields;
- widget definitions;
- layout history for undo/redo inside the current draft;
- dirty markers for dashboard metadata, widget data config, widget display config, and layout changes;
- pending discard reason when a project, route, dashboard, or drawer close would drop changes.

The draft reducer must be tested through pure functions. React components call reducer actions and render the resulting draft; they must not manually mutate layout arrays in event handlers.

## Widget Layout And Drag-Resize Behavior

The persisted layout remains a bounded 12-column grid:

- `x`: integer column start, 0 through 11;
- `y`: integer row start, 0 or greater;
- `w`: integer width, 1 through 12;
- `h`: integer height, 1 through 12;
- `minW`: integer minimum width, 1 through 12;
- `minH`: integer minimum height, 1 through 12.

Desktop grid behavior:

- The canvas uses 12 columns with a 72px base row height and 12px gaps.
- Dragging a widget previews its target slot, snaps to grid cells, and does not persist until the pointer or keyboard drag commits.
- Resizing uses handles on the right edge, bottom edge, and lower-right corner. Handles are visible only in edit mode and on selected/hovered widgets.
- Keyboard layout editing is mandatory: focused widgets can move by one grid cell, resize by one grid cell, and jump to the next non-overlapping row through accessible controls.
- Layout operations must enforce `x + w <= 12`, `w >= minW`, `h >= minH`, `h <= 12`, and non-negative `y`.
- When a move or resize collides with another widget, the layout engine pushes affected widgets downward in stable widget order. It must not silently overlap widgets or discard the dragged widget.
- Saving sorts widgets by `y`, then `x`, then existing widget order to keep persisted diffs deterministic.

Responsive behavior:

- Desktop and wide tablet preserve the persisted 12-column layout.
- Narrow tablet renders a 6-column projection from the same persisted layout; edits still write 12-column coordinates by mapping the projected slot back to the 12-column grid.
- Mobile renders a single-column stacked preview. Mobile can edit widget data/display in the sheet, duplicate, remove, and reorder widgets through explicit move up/down actions. Mobile does not expose freeform drag-resize.

Default minimum sizes:

| Widget kind | Default size | Minimum size |
| --- | --- | --- |
| `metric_timeseries` | `w=6 h=4` | `minW=4 minH=3` |
| `metric_stat` | `w=3 h=2` | `minW=2 minH=2` |
| `metric_table` | `w=6 h=4` | `minW=4 minH=3` |
| `log_table` | `w=6 h=4` | `minW=4 minH=3` |
| `trace_table` | `w=6 h=4` | `minW=4 minH=3` |
| `live_trace_table` | `w=6 h=4` | `minW=4 minH=3` |
| rich metric chart | `w=8 h=5` | `minW=5 minH=3` |

## Visualization Catalog

Metric widgets use the local shadcn `Chart` component, Recharts primitives, semantic chart tokens, accessible tooltips, and stable container dimensions. Chart containers must set an explicit height, minimum height, or aspect ratio so `ResponsiveContainer` can measure on first render.

Required metric visualizations:

- line: single or multiple time series;
- area: single or multiple time series, with optional stacking where backend data semantics allow it;
- bar: grouped or stacked categories/time buckets;
- pie and donut: latest-value or bucket-share display for bounded category counts;
- stat: latest value with optional sparkline and trend indicator;
- table: series label, latest value, first value, min, max, and point count;
- radial gauge: bounded percentage, saturation, or utilization values;
- radar: bounded comparison across a small set of named dimensions;
- heatmap: time bucket by dimension, backed by storage-read bucket results;
- histogram: metric histogram buckets when the metric kind supports histogram-style data.

Visualization limits:

- A chart renders at most 20 visible series by default.
- Category charts render at most 12 visible categories before grouping the remainder into `Other`.
- Dense heatmaps render at most 60 time buckets by 20 dimensions.
- Frontend may choose rendering density, colors, legend visibility, and hover state. It must not compute aggregation, bucketing, percentiles, rate, rollup, joins, or formulas from raw telemetry.

## Rich Metric Query Widgets

CloudGrid dashboards support three metric query modes:

- Single query: the existing metric widget shape, backed by one `MetricSeriesInput`.
- Multi-query overlay: several named metric series queries rendered in one widget with a shared time range and interval.
- Formula query: named expressions that reference previous query IDs and are evaluated by storage-read.

Rich queries must be represented as typed data, not executable strings, arbitrary JSON, SQL, SurrealQL, JavaScript, or frontend-only expressions.

Required rich query model for the next contract wave:

- `DashboardMetricQueryInput` contains `timeWindow`, `interval`, `queries`, `formulas`, and `displaySeries`.
- Each query has a stable `id`, `label`, `metricName`, `aggregation`, `groupBy`, `filters`, and optional `maxSeries`.
- Formula expressions use a bounded AST with node types `ref`, `number`, `binary`, `unary`, and `function`.
- Allowed binary operators are `add`, `subtract`, `multiply`, and `divide`.
- Allowed functions are `sum_series`, `avg_series`, `min_series`, `max_series`, `ratio`, `clamp_min`, `clamp_max`, and `moving_average`.
- Division by zero, missing referenced series, incompatible units, and incompatible timestamp alignment return widget-local warnings or `ERR-001` according to whether the definition is invalid or the runtime data is incomplete.
- Storage-read aligns timestamps to the requested interval and computes formulas. The BFF only validates public input and forwards the request. The frontend only renders returned series.

Examples:

- Error rate: query `errors` as `http.server.requests` filtered to error status, query `total` as all requests, formula `ratio(errors,total)`.
- Token cost estimate: query prompt tokens and completion tokens separately, formula `add(prompt,completion)` only if both series share compatible grouping.
- Latency SLO panel: query p50, p95, and p99 duration as separate queries and render a multi-series line or area chart.

## UX Rules

- The project sidebar exposes Dashboards after a project is selected.
- Pinned dashboards appear above primary navigation only when `DashboardListResult.pinnedDashboardIds` or `DashboardPreferences.pinnedDashboardIds` is available.
- The Dashboards sidebar entry may expand to show visible custom dashboards; the parent entry still opens `/dashboards`.
- `/metrics` remains a technical metric explorer and does not show dashboard management.
- `/dashboards` is the saved visual composition workspace.
- Built-in dashboards must use metric names and grouping keys that are present
  in the generated development telemetry. The default built-ins include
  `http.server.request.duration` grouped by `service.name` and
  `gen_ai.client.token.usage` grouped by `gen_ai.token.type`.
- Users can duplicate built-in dashboards into personal or project dashboards.
- Personal dashboards are visible only to the owner. Project dashboards are visible to all company members with selected-project access.
- Saving a dashboard is explicit. Editing a built-in dashboard creates an unsaved draft until the user saves it as personal or project visibility.
- The widget editor uses exactly three groups: `Data`, `Display`, and `Thresholds`.
- The widget grid uses stable responsive slots. Loading, empty, and error states must not resize adjacent widgets.
- Dragging or resizing widgets changes only local draft layout until the user saves the dashboard.
- Widget layout controls are available through pointer and keyboard interaction.
- Widget actions use concise icons with accessible labels: edit, duplicate, remove, pin, unpin, expand, copy link, refresh, filter, and overflow.
- Destructive widget/dashboard removal uses destructive styling only in the confirmation dialog.
- Unsaved edits prompt before project switch, route switch, or drawer close.

## Frontend Data Rules

- Frontend renders GraphQL dashboard and telemetry view models only.
- Frontend may keep local draft state while editing, but save always calls `Mutation.saveDashboard`.
- Frontend must not compute metric rates, percentiles, rollups, trace counts, log counts, or live event semantics from raw telemetry.
- If the dashboard URL does not carry an explicit time range, metric widgets use
  the observed descriptor range for their configured metric names. This keeps
  built-in dashboards useful with local seeded data without requiring manual
  date edits.
- Metric widgets execute through `Query.metricSeries`.
- Log widgets execute through `Query.logs`.
- Trace widgets execute through `Query.traces`.
- Live trace widgets execute through `Subscription.liveTraces`.
- Dashboard pin writes use `Mutation.setDashboardPinned` and `Mutation.reorderDashboardPins`.
- Rich metric widgets execute through the required storage-read-owned rich metric query GraphQL contract. They must not fan out multiple frontend requests and combine the results in React.

## Validation

Saving a dashboard validates widget count, layout bounds, supported widget kind, exactly one matching widget config per kind, metric names, allowed grouping attributes, aggregation compatibility, filters, table columns, time range bounds, and result limits before control-plane persistence. Invalid definitions fail with `ERR-001`.

Additional validation for the full editor:

- layouts must not overlap after compaction;
- widget IDs must remain stable across move, resize, and editor changes;
- widgets must not shrink below their specified minimum size;
- rich query IDs must be unique within the widget;
- formula references must point to a query or formula declared earlier in the same widget;
- formula AST depth is capped at 8;
- rich query widgets are rejected until the matching GraphQL, AsyncAPI, TypeScript, and Go generated contracts exist.

## Frontend Developer Experience

Dashboard implementation must be split into focused modules:

- `features/dashboards/dashboard-layout.ts`: pure grid math, collision detection, compaction, projection, and serialization.
- `features/dashboards/dashboard-draft-reducer.ts`: local draft state, undo/redo, dirty tracking, and discard reasons.
- `features/dashboards/widget-source-mappers.ts`: conversion between dashboard widgets and GraphQL query inputs.
- `features/dashboards/widget-renderers/*`: chart, stat, table, log, trace, and live renderers.
- `features/dashboards/widget-editor/*`: the `Data`, `Display`, and `Thresholds` editor groups.
- route code owns URL state, query hooks, and shell composition only.

Required tests:

- layout solver unit tests for move, resize, collision, compaction, min size, 12-column bounds, mobile projection, and deterministic sorting;
- draft reducer unit tests for edit mode, undo/redo, dirty state, duplicate, remove, discard, and save payload creation;
- widget source mapper tests proving frontend does not send null optional fields where the contracts omit them;
- route tests proving overview and builder remain separate, the editor is a sheet/drawer, and rich controls are hidden until contracts exist;
- chart tests proving each supported visualization renders from backend-returned series without frontend aggregation.
