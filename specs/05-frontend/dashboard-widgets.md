---
id: TEC-FE-013
title: Dashboard widgets
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-28
provenance: user-requested
depends_on: [TEC-FE-016, TEC-BE-011, TEC-BE-017]
---

# Dashboard Widgets

This spec defines saved dashboard configuration requirements. Concrete route layout, project-sidebar dashboard shortcuts, widget editor placement, and route acceptance are defined in [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md). Agent-facing implementation boundaries, ticket scopes, required reuse points, and verification commands are defined in [Dashboard implementation contract](./dashboard-implementation-contract.md).

## Intent

Each project can have reusable dashboards made from typed widgets. Dashboards answer common operational questions without forcing users to rebuild metric, log, trace, or live views every time.

## Current Coverage And Required Target

The existing dashboard contract already covers saved dashboards, typed widgets, metric/log/trace/live sources, pinning, built-in dashboards, and a bounded grid layout object. That is not enough for the full dashboard editor target.

The current frontend implementation is a partial target implementation. It may be used for contract wiring and visual reference only where it already matches this spec. It is not authoritative for missing behavior, route structure, editor controls, mobile behavior, or accessibility.

The full editor target requires:

- an accessible drag-and-drop widget canvas;
- pointer and keyboard resizing for widget width and height;
- deterministic layout compaction and collision handling;
- a richer visualization catalog built on the existing shadcn/Recharts chart foundation;
- typed multi-query and formula metric widgets owned by storage-read, not by frontend or BFF computation;
- a developer experience that keeps dashboard layout, widget source mapping, and chart rendering in focused modules instead of one monolithic route file.

Until rich metric execution, formula coverage, typed editor controls, generated contract checks, and focused frontend tests are complete, production UI must hide rich query creation/edit controls and continue to save only the fully supported widget input shapes. Existing saved `metric_rich` widgets may render read-only through `Query.richMetricSeries` when that query is available.

## Dashboard UX Acceptance Model

The finished dashboard surface has two route modes and no third shell:

- Overview mode: `/dashboards` with no `dashboard` URL parameter.
- Builder mode: `/dashboards?dashboard=<dashboardId>` or a new unsaved draft.

Overview mode renders dashboard discovery only. It must not mount the widget editor drawer, a widget canvas, a permanent dashboard rail, or a hidden selected dashboard.

Builder mode renders the selected dashboard or draft as the primary canvas. It must not render dashboard discovery cards, a second dashboard rail, or a permanent inspector column. Widget configuration opens only in the drawer/sheet.

The route header is the only place for dashboard-level editing controls. The canvas must not duplicate dashboard name, description, time range, or save controls inside a nested panel.

## Current Implementation Gaps To Close

The following gaps are known and must be closed before claiming dashboard UX completion:

- draft state is route-local `useState`; it must be moved to `features/dashboards/dashboard-draft-reducer.ts`;
- undo/redo history is not implemented;
- dirty markers are coarse; they must distinguish metadata, widget data config, widget display config, thresholds, and layout changes;
- route switch, project switch, drawer close, and browser navigation need consistent discard handling;
- stale version errors need a recoverable conflict state with reload and save-as-copy actions;
- right-edge and bottom-edge resize handles are missing;
- drag and resize previews are missing;
- mobile stacked editing and move up/down controls are missing;
- widget editor controls are incomplete for group-by, filters, columns, density, thresholds, legend, axis, units, display series, alert enum selection, and live stream display;
- rich metric controls are exposed in production even though full formula coverage, complete typed editor controls, and generated contract readiness must be verified before creation/edit exposure;
- renderer modules are embedded in the route file instead of `features/dashboards/widget-renderers/*`;
- widget source mapping is embedded in the route file instead of `features/dashboards/widget-source-mappers.ts`;
- chart catalog rendering maps several chart kinds onto generic fallbacks; every supported chart kind must either render faithfully from backend-returned data or be hidden for that widget shape;
- pin reordering is contract-backed but not exposed as an accessible UI where ordering is editable;
- widget expand, copy link, and cross-view pivot actions are incomplete;
- dashboard route tests and reducer/layout tests do not yet cover the full target.

Autonomous agents must implement these gaps through the scoped ticket contract in [Dashboard implementation contract](./dashboard-implementation-contract.md), or update this spec and that contract first if a gap is intentionally descoped.

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

Draft reducer state shape:

- `source`: `new`, `duplicate`, or `edit_existing`;
- `dashboardId`, `version`, and `sourceVisibility` when editing an existing mutable dashboard;
- `metadata`: name, description, tags, visibility, and default time window;
- `widgets`: normalized `DashboardWidgetInput[]`;
- `selectedWidgetId`;
- `editorMode`: `closed`, `details`, or `edit`;
- `dirty`: booleans for `metadata`, `layout`, `widgetData`, `widgetDisplay`, and `thresholds`;
- `history`: bounded undo and redo stacks for layout and widget mutations in the current unsaved draft;
- `conflict`: stale-version details when save returns a version conflict;
- `pendingDiscard`: reason and target for route, project, dashboard, or drawer transitions.

Required reducer actions:

- start new dashboard;
- start duplicate from saved or built-in dashboard;
- start edit existing dashboard;
- update metadata;
- add widget;
- select widget;
- update widget data;
- update widget display;
- update widget thresholds;
- duplicate widget;
- remove widget;
- move widget;
- resize widget;
- reorder mobile widget;
- undo;
- redo;
- mark save pending;
- mark save success;
- mark save validation error;
- mark save conflict;
- request discard;
- confirm discard;
- cancel discard.

Undo/redo scope:

- undo and redo apply only to the current unsaved draft;
- successful save clears history;
- switching dashboards after confirming discard clears history;
- metadata text entry does not need character-by-character undo, but committed metadata field changes must mark dirty;
- layout and widget add/duplicate/remove/update operations must be undoable.

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

Pointer interaction details:

- drag starts only from the widget drag handle;
- resize starts only from right, bottom, or lower-right handles;
- interactive chart, table, menu, link, and form content must not start dragging;
- Escape cancels an active pointer or keyboard layout operation and restores the previous layout;
- commit happens on pointer up, Enter, Space, or explicit keyboard commit action;
- invalid movement shows a neutral invalid-slot preview and leaves the draft unchanged.

Keyboard interaction details:

- widget frame is focusable in edit mode;
- Arrow keys move by one cell;
- Shift plus Arrow resizes by one cell;
- Home and End move to the first and last valid row in the current column;
- keyboard controls expose accessible names that include widget title and current layout;
- screen-reader text announces move/resize result after commit.

Responsive behavior:

- Desktop and wide tablet preserve the persisted 12-column layout.
- Narrow tablet renders a 6-column projection from the same persisted layout; edits still write 12-column coordinates by mapping the projected slot back to the 12-column grid.
- Mobile renders a single-column stacked preview. Mobile can edit widget data/display in the sheet, duplicate, remove, and reorder widgets through explicit move up/down actions. Mobile does not expose freeform drag-resize.

Mobile stacking rules:

- sort by persisted `y`, then `x`, then existing widget order;
- each widget fills the available width;
- move up/down swaps the widget with the previous or next stacked widget and writes deterministic 12-column coordinates on save;
- the drawer opens as a bottom sheet with the same `Data`, `Display`, and `Thresholds` groups;
- add-widget choices remain in a popover or sheet, not in a permanent vertical button list.

Default minimum sizes:

| Widget kind | Default size | Minimum size |
| --- | --- | --- |
| `metric_timeseries` | `w=6 h=4` | `minW=4 minH=3` |
| `metric_stat` | `w=3 h=2` | `minW=2 minH=2` |
| `metric_table` | `w=6 h=4` | `minW=4 minH=3` |
| `log_table` | `w=6 h=4` | `minW=4 minH=3` |
| `trace_table` | `w=6 h=4` | `minW=4 minH=3` |
| `live_trace_table` | `w=6 h=4` | `minW=4 minH=3` |
| `alert_status` | `w=4 h=3` | `minW=3 minH=2` |
| `alert_history` | `w=6 h=4` | `minW=4 minH=3` |
| `alert_evidence` | `w=4 h=3` | `minW=3 minH=2` |
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

Chart rendering requirements:

- `line`, `area`, and `bar` render time-bucketed series returned by GraphQL;
- `pie` and `donut` render the latest backend-returned value for each visible bounded category;
- `stat` renders latest value, timestamp, unit, optional sparkline, and warning state;
- `table` renders series label, latest value, first value, min, max, and point count using values already returned by GraphQL or values derived only from the returned chart-ready series for display summary, not telemetry semantics;
- `radial`, `radar`, `heatmap`, and `histogram` remain hidden for widget creation until the backend result shape supplies the required chart-ready dimensions for those visualizations;
- chart legends use readable labels derived from backend labels or `seriesLabel`, such as `gateway` or `service.name: gateway`; they must not show raw JSON snippets in normal labels;
- warnings returned by metric or rich metric queries render in the widget header and detail drawer.

## Rich Metric Query Widgets

CloudGrid dashboards support three metric query modes:

- Single query: the existing metric widget shape, backed by one `MetricSeriesInput`.
- Multi-query overlay: several named metric series queries rendered in one widget with a shared time range and interval.
- Formula query: named expressions that reference previous query IDs and are evaluated by storage-read.

Rich queries must be represented as typed data, not executable strings, arbitrary JSON, SQL, SurrealQL, JavaScript, or frontend-only expressions.

Required rich query model for the complete implementation wave:

- `DashboardMetricQueryInput` contains `timeWindow`, `interval`, `queries`, `formulas`, and `displaySeries`.
- Each query has a stable `id`, `label`, `metricName`, `aggregation`, `groupBy`, `filters`, and optional `maxSeries`.
- Formula expressions use a bounded AST with node types `ref`, `number`, `binary`, `unary`, and `function`.
- Allowed binary operators are `add`, `subtract`, `multiply`, and `divide`.
- Allowed functions are `sum_series`, `avg_series`, `min_series`, `max_series`, `ratio`, `clamp_min`, `clamp_max`, and `moving_average`.
- Division by zero, missing referenced series, incompatible units, and incompatible timestamp alignment return widget-local warnings or `ERR-001` according to whether the definition is invalid or the runtime data is incomplete.
- Storage-read aligns timestamps to the requested interval and computes formulas. The BFF only validates public input and forwards the request. The frontend only renders returned series.

Rich metric production gate:

- production add-widget UI hides `metric_rich` until the rich metric implementation wave is complete;
- development builds may show a disabled rich metric entry with a short unavailable reason;
- saved dashboards containing `metric_rich` from fixture or test data render read-only through `Query.richMetricSeries` when available and render an unsupported-contract state when the query is unavailable;
- rich metric editing remains disabled until storage-read supports every allowed formula function, frontend typed controls can build each allowed expression shape, and focused tests prove warnings, validation, display series, and rendering behavior;
- no frontend fallback may execute multiple `Query.metricSeries` calls and combine them to simulate rich metric behavior.

Examples:

- Error rate: query `errors` as `http.server.requests` filtered to error status, query `total` as all requests, formula `ratio(errors,total)`.
- Token cost estimate: query prompt tokens and completion tokens separately, formula `add(prompt,completion)` only if both series share compatible grouping.
- Latency SLO panel: query p50, p95, and p99 duration as separate queries and render a multi-series line or area chart.

## Alert Widgets

Alert widgets are dashboard readers backed by the project alerting contracts in
`04-backend/alerting.md`. They do not create, update, enable, disable, silence,
or delete alert rules.

Supported alert widget kinds:

- `alert_status`: summary counts grouped by state, severity, and signal;
- `alert_history`: bounded alert event table or timeline;
- `alert_evidence`: one selected alert event with evidence links.

Widget source fields:

- optional `ruleIds`, max 20;
- optional `states`, values from `AlertState`;
- optional `severities`, values from `AlertSeverity`;
- optional `signals`, values from `AlertSignal`;
- `timeWindow`, using the dashboard time-window model;
- `limit`, integer `1..100`, default `20`.

`alert_history` and `alert_evidence` use `Query.alertHistory`. `alert_status`
uses `Query.alertSummary` when aggregate counts are needed; the frontend must
not compute status counts from an incomplete alert history page. Evidence links
route to existing trace, log, metric, and alert rule surfaces in the selected
project.

## UX Rules

- The project sidebar exposes Dashboards after a project is selected.
- Pinned dashboards appear below `AI Chat` and above primary telemetry navigation only when `DashboardListResult.pinnedDashboardIds` or `DashboardPreferences.pinnedDashboardIds` is available.
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
- Save and delete actions are dashboard-level actions and live in the route header toolbar.
- Widget remove is draft-local and uses an undoable draft action; it does not call `Mutation.saveDashboard` until the dashboard save action.
- Widget expand opens a drawer/detail state or route URL state without changing dashboard selection.
- Copy widget link copies `/dashboards?dashboard=<dashboardId>&widget=<widgetId>` for saved dashboards; unsaved drafts show disabled copy with a short reason.
- Cross-view pivots use the route mappings in `logs-metrics-dashboards-ux-concept.md` and preserve selected project context.

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

Route file limit:

- `routes/dashboards-route.tsx` composes the page, route URL state, queries, mutations, and high-level mode selection only.
- Pure layout math, draft mutation, widget input mapping, renderer bodies, and editor field groups must live outside the route file.
- A dashboard feature file that exceeds 500 lines must be split unless the extra length is generated type declarations.

Required tests:

- layout solver unit tests for move, resize, collision, compaction, min size, 12-column bounds, mobile projection, and deterministic sorting;
- draft reducer unit tests for edit mode, undo/redo, dirty state, duplicate, remove, discard, and save payload creation;
- widget source mapper tests proving frontend does not send null optional fields where the contracts omit them;
- route tests proving overview and builder remain separate, the editor is a sheet/drawer, and rich creation/edit controls are hidden until the complete rich metric implementation gate passes;
- chart tests proving each supported visualization renders from backend-returned series without frontend aggregation.
- accessibility tests or focused interaction tests proving keyboard move, keyboard resize, focus restoration after drawer close, discard dialog focus trapping, and mobile move up/down controls.
