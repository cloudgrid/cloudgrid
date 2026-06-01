---
id: TEC-FE-012
title: Dashboard implementation contract
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-28
provenance: user-requested
depends_on: [TEC-FE-013, TEC-FE-016, TEC-FE-011, CAP-MET-003, FLW-MET-002]
---

# Dashboard Implementation Contract

This file is the agent-facing implementation contract for closing dashboard UX
and functionality gaps. Product behavior remains owned by
[Dashboard widgets](./dashboard-widgets.md), shell behavior remains owned by
[Enterprise product UX concept](./product-ux-concept.md), and route-level
behavior remains owned by
[Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md).

Agents must not implement dashboard behavior from the current UI alone. The
current UI is a partial baseline. This contract defines the target work slices,
allowed ownership boundaries, reuse requirements, acceptance criteria, and
verification commands.

## Implementation Readiness Status

Dashboard gap closure is ready to plan and implement in scoped frontend tickets
except for rich metric creation/editing. Rich metric creation/editing is blocked
behind the production gate in [Dashboard widgets](./dashboard-widgets.md).

Allowed now:

- dashboard overview and builder separation;
- reducer-owned dashboard draft state;
- layout math, tablet projection, mobile stacked reordering, pointer and
  keyboard layout editing;
- widget renderer extraction;
- widget source/query mapper extraction;
- reuse and extraction of metric explorer controls;
- complete non-rich widget editors for metric, log, trace, live trace, and
  alert widgets;
- persisted dashboard pins and accessible pin reordering;
- widget expand, copy link, and cross-view pivots.

Blocked until the rich metric gate passes:

- production add-widget entry for `metric_rich`;
- production editing controls for rich metric query rows, formulas, and display
  series;
- saving a newly created rich metric widget from production UI.

Allowed for rich metric saved data:

- read-only rendering of existing saved `metric_rich` widgets through
  `Query.richMetricSeries`;
- unsupported-contract state when the query or generated contracts are absent;
- tests that prove production creation/editing controls are hidden.

## Required Source Reading

Every dashboard implementation ticket must read these files before editing:

- `specs/spec.md`;
- `specs/00-vision.md`;
- `specs/00-conventions.md`;
- `specs/05-frontend/product-ux-concept.md`;
- `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`;
- `specs/05-frontend/dashboard-widgets.md`;
- `specs/05-frontend/dashboard-implementation-contract.md`;
- `specs/02-capabilities/metrics/manage-dashboards.md`;
- `specs/03-flows/metrics/dashboard-query.md`;
- `specs/03-contracts/graphql/public-schema.graphql`;
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`;
- `specs/03-contracts/errors.yaml`;
- `DESIGN.md`;
- `.agent/IMPLEMENTATION.md`.

Frontend tickets that touch metric widget controls must also inspect:

- `apps/frontend/src/features/metrics/metric-explorer.tsx`;
- `apps/frontend/src/routes/metrics-route.tsx`;
- `apps/frontend/src/features/telemetry/telemetry-chart.tsx`;
- `apps/frontend/src/features/telemetry/service-multi-select.tsx`;
- `apps/frontend/src/lib/query-keys.ts`.

## Non-Negotiable Agent Rules

- Do not add routes, widget kinds, chart kinds, GraphQL fields, NATS subjects,
  error codes, dashboard storage locations, role rules, pin limits, or layout
  dimensions outside the specs.
- Do not add `MetricView` or compatibility surfaces.
- Do not store saved dashboards or pins in browser storage.
- Do not build a second metric editor for dashboards when the metric explorer
  already has reusable controls or helper logic.
- Do not compute metric semantics, rich metric formulas, log counts, trace
  counts, alert counts, rates, percentiles, rollups, joins, or correlation in
  React or in the BFF.
- Do not expose production rich metric creation/editing unless the rich metric
  gate passes and `bun run contracts:check` covers the generated surfaces.
- Do not hide missing behavior behind placeholder controls. If a control is not
  implemented, it must be disabled with a precise reason or removed from
  production UI according to this contract.
- Do not keep large route-local helper functions when this contract names a
  feature module for that behavior.

## Ownership Boundaries

Use one boundary per ticket.

| Boundary | Write scope | Must not write |
| --- | --- | --- |
| Frontend dashboard state/layout | `apps/frontend/src/features/dashboards`, focused dashboard tests | `apps/backend`, `core`, `specs/03-contracts` |
| Frontend route/shell | `apps/frontend/src/routes/dashboards-route.tsx`, route tests, i18n strings | `apps/backend`, `core`, `specs/03-contracts` |
| Frontend metric-control reuse | `apps/frontend/src/features/metrics`, `apps/frontend/src/features/dashboards/widget-editor`, focused tests | `apps/backend`, `core` |
| Frontend renderers/mappers | `apps/frontend/src/features/dashboards/widget-renderers`, `apps/frontend/src/features/dashboards/widget-source-mappers.ts`, focused tests | `apps/backend`, `core` |
| Contract/rich metric gate | `specs/03-contracts`, generated TS/Go contracts, contract tests | unrelated frontend restyling |
| BFF dashboard bridge | `apps/backend`, `apps/packages/runtime`, BFF tests | `apps/frontend`, `core/storage-read`, `core/storage-write` |
| Control-plane dashboards | `core/control-plane`, Go control-plane tests | `apps/frontend`, `apps/backend` except generated contract alignment |
| Storage-read rich metrics | `core/storage-read`, Go storage-read tests | `apps/frontend`, `apps/backend` except generated contract alignment |

If a ticket needs files outside its boundary, stop and update the plan or split
the ticket. Do not widen scope opportunistically.

## Target Module Contract

The dashboard route must become a composition layer. It owns URL state, query
hooks, mutation hooks, and route shell wiring only.

Required modules:

- `features/dashboards/dashboard-layout.ts`
  - pure grid normalization, collision detection, compaction, move, resize,
    deterministic sort, desktop 12-column layout, tablet 6-column projection,
    mobile stacked ordering, mobile reorder, and drag/resize preview math;
  - no React imports;
  - no GraphQL client imports.
- `features/dashboards/dashboard-draft-reducer.ts`
  - local draft state, source metadata, selected widget, editor mode, dirty
    markers, bounded undo/redo, conflict state, pending discard state, and save
    input serialization;
  - no React imports;
  - no GraphQL client imports.
- `features/dashboards/widget-source-mappers.ts`
  - maps dashboard widget definitions to `MetricSeriesInput`,
    `RichMetricSeriesInput`, `LogSearchInput`, `TraceSearchInput`,
    `LiveTraceInput`, `AlertSummaryInput`, and alert history input;
  - strips unsupported optional null fields where generated contracts omit
    them;
  - never derives telemetry semantics.
- `features/dashboards/widget-renderers/*`
  - renders metric, rich metric read-only, log table, trace table, live trace
    table, alert status, alert history, alert evidence, local loading, empty,
    warning, and error states;
  - each renderer receives GraphQL result data and presentation options;
  - renderers do not call GraphQL directly.
- `features/dashboards/widget-editor/*`
  - owns the `Data`, `Display`, and `Thresholds` editor groups;
  - uses shared metric controls and helpers from `features/metrics` where
    behavior overlaps with `/metrics`;
  - mutates local draft through reducer actions only.
- `routes/dashboards-route.tsx`
  - composes overview mode, builder mode, drawer/sheet state, query hooks,
    mutations, and URL params;
  - must not contain layout solver logic, widget source mapping, renderer
    bodies, or editor field groups.

Feature files that exceed 500 hand-written lines must be split unless they are
generated declarations.

## Shared Metrics Reuse Contract

Metric dashboard widgets must reuse the metric explorer's shared behavior rather
than duplicating it.

Existing reusable sources:

- `buildMetricSeriesInput` from `@cloudgrid/ui-contracts`;
- `buildMetricNameSearchInput` from `@cloudgrid/ui-contracts`;
- `createDefaultMetricTimeRange`, `createObservedMetricRange`,
  `defaultMetricAggregation`, and `METRIC_AGGREGATIONS` from
  `@cloudgrid/ui-contracts`;
- `sanitizeMetricGroupBy` from `features/metrics/metric-explorer.tsx`;
- `MetricQueryControls`, `MetricSearchField`, and group-by/filter selection
  behavior from `features/metrics/metric-explorer.tsx`;
- `TelemetryChart` from `features/telemetry/telemetry-chart.tsx`;
- `ServiceMultiSelect` from `features/telemetry/service-multi-select.tsx`;
- `queryKeys.metricNames`, `queryKeys.metricSeries`, and
  `queryKeys.richMetricSeries`.

Required extraction before dashboard editor completion:

- Move reusable metric query controls from `metric-explorer.tsx` into a shared
  feature module, for example `features/metrics/metric-query-controls.tsx`.
- Keep `/metrics` and dashboard metric editors using the same control
  components for metric name, aggregation, group-by, filter, interval, sort, and
  chart type selection where the semantics are identical.
- Keep route-specific layout separate: `/metrics` may keep its explorer layout;
  dashboard widgets use the drawer `Data`, `Display`, `Thresholds` grouping.
- Shared helpers must accept typed inputs and callbacks. They must not read or
  mutate URL search params directly.
- Shared controls must support a compact drawer mode for dashboards and a wider
  explorer mode for `/metrics` without changing semantics.

Acceptance:

- Changing the allowed metric aggregations, chart type list, or group-by
  sanitization affects both `/metrics` and dashboard metric widgets through one
  shared source.
- Dashboard metric widgets and `/metrics` produce equivalent
  `MetricSeriesInput` for the same metric descriptor and selected query
  controls.
- Tests prove invalid group-by keys are removed through the shared sanitizer.

## Dashboard Modes And URL Contract

Overview mode:

- URL: `/dashboards` without `dashboard`.
- Shows discovery/search/create only.
- Groups cards exactly in this order: pinned, built-in, personal, project.
- Does not mount widget canvas, widget editor, permanent dashboard rail, or
  selected dashboard data fetches beyond the dashboard list.

Builder mode:

- URL for saved dashboard: `/dashboards?dashboard=<dashboardId>`.
- URL for selected widget: `/dashboards?dashboard=<dashboardId>&widget=<widgetId>`.
- URL for editor drawer: add `inspector=edit`.
- URL for read-only widget details: add `inspector=details`.
- New unsaved drafts use `/dashboards?mode=edit` without `dashboard`.
- Builder shows the selected dashboard or draft as the primary canvas.
- Builder does not render overview discovery cards or a second dashboard rail.

Route transitions:

- Changing `dashboard`, selected project, route path, or browser history while a
  draft is dirty must request discard through the same reducer state and the
  same confirmation dialog.
- Confirm discard clears draft, selected widget, editor mode, conflict, and
  pending discard state before navigation.
- Cancel discard keeps focus in the current editing surface.

## Draft State Contract

Reducer state fields:

- `source`: `new`, `duplicate`, or `edit_existing`;
- `dashboardId`: saved dashboard ID only when editing an existing mutable
  dashboard;
- `version`: saved dashboard version only when editing an existing mutable
  dashboard;
- `sourceVisibility`: original visibility when editing or duplicating;
- `metadata`: name, description, tags, visibility, default time window;
- `widgets`: normalized `DashboardWidgetInput[]`;
- `selectedWidgetId`: selected local widget ID or null;
- `editorMode`: `closed`, `details`, or `edit`;
- `dirty`: booleans for `metadata`, `layout`, `widgetData`, `widgetDisplay`,
  and `thresholds`;
- `history`: bounded undo and redo stacks for layout and widget changes;
- `conflict`: stale-version problem details and server version when available;
- `pendingDiscard`: reason and target for project, route, dashboard, drawer, or
  browser navigation.

Reducer action requirements:

- start new;
- start duplicate;
- start edit existing;
- update metadata;
- add widget;
- select widget;
- open editor mode;
- close editor mode;
- update widget data;
- update widget display;
- update widget thresholds;
- duplicate widget;
- remove widget;
- move widget;
- resize widget;
- reorder stacked widget;
- undo;
- redo;
- mark save pending;
- mark save success;
- mark save validation error;
- mark save conflict;
- request discard;
- confirm discard;
- cancel discard.

Save input serialization:

- includes `id` and `version` only for mutable existing dashboards;
- never includes built-in dashboard IDs when duplicating;
- sorts and compacts widgets before save;
- preserves widget IDs across title, data, display, threshold, move, and resize
  changes;
- strips unsupported optional null fields where generated contracts omit them.

Undo/redo:

- applies to layout, add, duplicate, remove, widget data, widget display, and
  thresholds;
- successful save clears undo and redo stacks;
- discard clears undo and redo stacks;
- metadata changes may mark dirty without character-by-character undo.

## Layout And Touch Contract

Desktop and wide tablet:

- 12 persisted columns;
- 72px row height;
- 12px gap;
- right, bottom, and lower-right resize handles;
- drag starts only from the drag handle;
- resize starts only from resize handles;
- interactive widget content never starts drag or resize.

Narrow tablet:

- renders a 6-column projection from persisted 12-column layout;
- pointer/touch drag and resize controls must have at least 44px hit targets;
- edits map back to deterministic 12-column persisted coordinates;
- no separate tablet persistence model exists.

Mobile:

- renders a stacked single-column preview;
- no freeform drag-resize;
- supports duplicate, remove, edit, and move up/down;
- move up/down rewrites deterministic 12-column coordinates using stacked order;
- editor opens as a bottom sheet with the same `Data`, `Display`, and
  `Thresholds` groups.

Keyboard:

- widget frame is focusable in edit mode;
- Arrow keys move by one cell;
- Shift plus Arrow resizes by one cell;
- Home and End move to first and last valid row in the current column;
- Enter or Space commits an active keyboard operation;
- Escape cancels an active operation and restores the previous layout;
- screen-reader status announces committed move/resize result.

Layout solver acceptance:

- rejects or normalizes out-of-bounds coordinates;
- enforces `x + w <= 12`, `w >= minW`, `h >= minH`, `h <= 12`, `y >= 0`;
- pushes colliding widgets downward in stable order;
- never overlaps widgets after compaction;
- never drops the actively moved/resized widget;
- deterministic sort is `y`, then `x`, then existing order.

## Widget Editor Contract

Every widget editor uses exactly three groups:

- `Data`;
- `Display`;
- `Thresholds`.

Thresholds is hidden for log, trace, live trace, and alert widgets.

Metric widget `Data` controls:

- metric name search via `Query.metricNames`;
- aggregation from `METRIC_AGGREGATIONS`;
- group-by keys from `MetricDescriptor.attributeKeys`;
- attribute filters compatible with `MetricSeriesInput.filters`;
- time window and interval.

Metric widget `Display` controls:

- title;
- description;
- visualization from the allowed chart list for the widget kind;
- legend;
- max series;
- unit display;
- axis display where supported;
- table density for table visualization.

Metric widget `Thresholds` controls:

- zero or more typed thresholds;
- severity `info`, `warning`, or `error`;
- numeric comparison value;
- label;
- remove action.

Log widget `Data` controls:

- search;
- service;
- severity;
- trace ID;
- span ID;
- attribute filters;
- sort;
- limit.

Log widget `Display` controls:

- title;
- description;
- visible columns;
- density;
- copy link and pivot actions.

Trace widget `Data` controls:

- query;
- service;
- operation name;
- span name;
- status;
- min and max duration;
- attribute filters;
- sort;
- limit.

Live trace widget `Data` controls:

- query;
- service;
- operation name;
- span name;
- status;
- min and max duration;
- attribute filters;
- limit.

Alert widget `Data` controls:

- rule IDs;
- states;
- severities;
- signals;
- time window;
- limit.

Alert widget `Display` controls:

- title;
- description;
- table/timeline/summary density where applicable.

Rich metric editor:

- hidden in production until the rich metric gate passes;
- existing saved rich widgets show read-only summary plus unavailable reason
  when editing is gated;
- no frontend fallback may combine multiple `Query.metricSeries` results.

## Widget Renderer Contract

All widgets:

- render inside stable dimensions;
- have local loading, empty, warning, and error states;
- retry only their own query;
- never collapse the dashboard canvas on query error;
- expose edit, duplicate, remove, expand, copy link, and pivot actions according
  to mode and saved/draft state;
- keep accessible names on icon buttons.

Metric renderers:

- line, area, and bar render time-bucketed series returned by GraphQL;
- pie and donut render latest backend-returned value for bounded categories;
- stat renders latest value, timestamp, unit, optional sparkline, and warning;
- table renders label, latest, first, min, max, and point count from returned
  series only;
- radial, radar, heatmap, and histogram are hidden from creation until backend
  result shapes provide chart-ready dimensions.

Log and trace renderers:

- render bounded rows returned by GraphQL;
- copy actions do not change selection or navigate;
- pivots preserve selected project context and use URL mappings from
  `logs-metrics-dashboards-ux-concept.md`.

Alert renderers:

- `alert_status` uses `Query.alertSummary`;
- `alert_history` and `alert_evidence` use `Query.alertHistory`;
- frontend does not compute alert counts from an incomplete history page.

## Persistence And Error Contract

Dashboard mutations:

- list: `Query.dashboards`;
- save: `Mutation.saveDashboard`;
- delete: `Mutation.deleteDashboard`;
- pin/unpin: `Mutation.setDashboardPinned`;
- reorder pins: `Mutation.reorderDashboardPins`.

Save behavior:

- explicit user action only;
- sends deterministic compacted widget order;
- successful save clears draft, selected widget, editor mode, conflict, and
  history;
- failed save leaves draft untouched;
- field validation errors render near save action and near the editor field when
  the field is known.

Version conflict:

- stale save keeps draft open;
- shows conflict state near save action;
- offers `Reload dashboard`;
- offers `Save as copy`;
- `Reload dashboard` discards local draft only after confirmation;
- `Save as copy` removes saved ID/version and saves a new personal or project
  dashboard according to selected visibility.

Pins:

- pin data comes only from dashboard list/preferences contracts;
- maximum visible pinned dashboard shortcuts is five;
- reorder UI writes through `Mutation.reorderDashboardPins`;
- no browser-local pin truth.

## Required Test Matrix

Default frontend verification:

```sh
bun test apps/frontend/test/dashboard-layout.test.ts apps/frontend/test/dashboard-draft-reducer.test.ts apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

Required tests by work type:

| Work type | Required tests |
| --- | --- |
| Layout solver | unit tests for normalize, move, resize, collision, compaction, sort, 6-column projection, stacked reorder, keyboard deltas |
| Draft reducer | unit tests for start new, duplicate, edit existing, dirty markers, undo, redo, discard, conflict, save payload |
| Widget source mappers | unit tests for each widget kind and no unsupported null optional fields |
| Metric control reuse | tests proving `/metrics` and dashboard metric widgets create equivalent `MetricSeriesInput` from equivalent state |
| Route mode | route/source tests proving overview and builder are separate and rich metric creation/editing is hidden |
| Widget renderers | tests for loading, empty, warning, error, retry, stable chart dimensions, and no frontend aggregation |
| Accessibility | focused tests for keyboard move/resize, drawer focus restoration, discard dialog focus trap, mobile move up/down controls |
| Contracts, BFF, rich metric gate | `bun run contracts:check` plus focused BFF/storage-read tests |

Lint:

```sh
bun run --cwd apps/frontend lint
```

Existing unrelated warnings do not block a dashboard ticket, but new dashboard
warnings do block completion.

Contract changes:

```sh
bun run contracts:check
```

This is mandatory for any GraphQL, AsyncAPI, generated contract, BFF bridge, Go
message contract, dashboard widget input, rich metric input, or dashboard pin
contract change.

## Ticket Backlog Contract

Autonomous planners must use these tickets unless this spec changes first.

### DASH-FE-1: Reducer-Owned Draft And Save Flow

Owner boundary: frontend dashboard state/layout.

Read scope:

- dashboard specs in this contract's required source reading;
- `apps/frontend/src/routes/dashboards-route.tsx`;
- `apps/frontend/src/features/dashboards/dashboard-draft-reducer.ts`.

Write scope:

- `apps/frontend/src/features/dashboards/dashboard-draft-reducer.ts`;
- reducer tests;
- dashboard route integration only where required to consume reducer state.

Acceptance:

- all local dashboard edits go through reducer actions;
- undo/redo works for widget/layout mutations;
- dirty markers distinguish metadata, layout, widget data, widget display, and
  thresholds;
- save success and stale conflict states are represented;
- discard reasons cover project, route, dashboard, drawer, and browser
  transitions;
- route does not manually mutate widget arrays.

Verification:

```sh
bun test apps/frontend/test/dashboard-draft-reducer.test.ts apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
```

### DASH-FE-2: Layout, Tablet, Touch, And Keyboard Editing

Owner boundary: frontend dashboard state/layout.

Write scope:

- `apps/frontend/src/features/dashboards/dashboard-layout.ts`;
- layout tests;
- route/canvas code required to wire handles and keyboard controls.

Acceptance:

- right, bottom, and corner resize handles exist;
- drag/resize preview exists;
- 12-column desktop, 6-column tablet projection, and stacked mobile behavior are
  implemented;
- touch targets on tablet controls are at least 44px;
- mobile has move up/down instead of freeform drag-resize;
- keyboard move/resize/cancel/commit works.

Verification:

```sh
bun test apps/frontend/test/dashboard-layout.test.ts apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
```

### DASH-FE-3: Shared Metric Controls And Complete Widget Editors

Owner boundary: frontend metric-control reuse.

Write scope:

- `apps/frontend/src/features/metrics`;
- `apps/frontend/src/features/dashboards/widget-editor`;
- focused widget editor tests;
- route wiring required to use the editor modules.

Acceptance:

- metric controls shared between `/metrics` and dashboard metric widgets;
- all non-rich widget editor controls in this contract exist;
- editor groups are exactly `Data`, `Display`, and `Thresholds`;
- rich metric creation/editing remains gated;
- no dashboard-only duplicate metric query semantics.

Verification:

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

### DASH-FE-4: Widget Source Mappers And Renderers

Owner boundary: frontend renderers/mappers.

Write scope:

- `apps/frontend/src/features/dashboards/widget-source-mappers.ts`;
- `apps/frontend/src/features/dashboards/widget-renderers`;
- focused renderer/mapper tests;
- dashboard route wiring required to use the modules.

Acceptance:

- route file no longer owns source mapping or renderer bodies;
- each widget kind has a mapper and renderer;
- local loading, empty, warning, and error states are widget-scoped;
- copy link, expand, and cross-view pivots are wired according to saved/draft
  state;
- frontend does not aggregate telemetry.

Verification:

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

### DASH-FE-5: Dashboard Pins And Sidebar Shortcuts

Owner boundary: frontend route/shell.

Write scope:

- dashboard sidebar/route components;
- dashboard pin tests;
- BFF/control-plane tests only if existing contracts are not wired.

Acceptance:

- pinned shortcuts appear only from persisted preferences;
- visible shortcuts are capped at five;
- pin/unpin uses `Mutation.setDashboardPinned`;
- reorder uses `Mutation.reorderDashboardPins`;
- no browser-local pin truth;
- accessible keyboard reordering works wherever reorder UI is exposed.

Verification:

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
```

### DASH-RICH-1: Rich Metric Production Gate

Owner boundary: contract/rich metric gate, storage-read rich metrics, BFF
dashboard bridge, and frontend metric-control reuse. This ticket must be split
by boundary before implementation.

Acceptance before enabling production creation/editing:

- GraphQL inputs/outputs for rich metric widgets and rich metric series are
  generated into TypeScript UI contracts;
- AsyncAPI request/reply schemas are generated into Go contracts;
- storage-read supports every allowed binary operator and function;
- storage-read owns timestamp alignment, formula execution, warnings, and
  result caps;
- BFF validates and forwards without deriving;
- frontend typed controls can build every allowed expression shape;
- focused tests cover validation, warnings, display series, and rendering;
- `bun run contracts:check` passes.

Until all acceptance items pass, production UI keeps `metric_rich` creation and
editing hidden or disabled.
