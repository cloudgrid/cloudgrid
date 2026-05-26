---
id: TEC-FE-011
title: Logs, metrics explorer, and dashboards UX concept
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-22
provenance: user-requested
depends_on: [TEC-FE-009, TEC-FE-010, TEC-BE-017]
---

# Logs, Metrics Explorer, And Dashboards UX Concept

## Intent

This spec defines the product-level UX for `/logs`, `/metrics`, and `/dashboards`.

The routes have separate user jobs:

- `/logs`: search raw and correlated log evidence, then pivot to trace/span context.
- `/metrics`: inspect available project metrics, understand descriptors, query series, and run low-level aggregations without creating a dashboard.
- `/dashboards`: view, create, edit, and manage reusable visual compositions built from metrics, logs, trace/live widgets, and typed alert widgets.

Do not merge these responsibilities into one route. Metrics exploration is technical discovery; dashboards are saved presentation/composition workspaces.

All routes use the global CloudGrid shell, selected project context, flat shadcn styling, neutral controls, independent scroll regions, and project-scoped GraphQL view models.

## Shared Rules

- Frontend talks only to the TypeScript BFF through GraphQL.
- Frontend never computes telemetry query semantics, metric aggregations, rates, percentiles, log correlation, rollups, or counts from raw records.
- Standard controls use neutral shadcn styling. Non-neutral color is reserved for severity, chart series, graph relations, and warnings/errors.
- Navigation entries, toolbar buttons, filter actions, copy actions, widget actions, warning states, and error states use concise lucide icons with accessible labels. Text may accompany primary or secondary actions when it improves clarity; low-emphasis utilities are icon-only.
- Route-primary tables, metric result tables, and dashboards are not wrapped in page cards.
- Drawers are for detail/editor flows. Modals are only for confirmation, warning, information, or error acknowledgement.
- Copy, save, create, update, delete, pin/unpin, and toggle actions must show success and failure feedback. Mutation failures show GraphQL problem details or field validation near the action surface; clipboard and low-risk utility actions may use compact toast/status feedback.
- Server-backed list sorting belongs to GraphQL/backend contracts. Local component sorting is allowed only for bounded detail tables and already-loaded inspector sublists, never for route-primary server-backed lists.
- Route-primary search, filtering, pagination, and table/list sorting for
  `/logs`, `/traces`, and `/metrics` must update GraphQL input variables and
  refetch backend-owned results. Frontend code may use local search only inside
  already-loaded detail or inspector content, such as selected log attributes
  or metric descriptor attribute-key inspection.
- URL state preserves filters, selected records, selected metric, selected dashboard, time range, active inspector, and selected widget where specified.

## `/logs` Log Search Workspace

### User Job

The user opens `/logs` to search logs first, narrow by project-scoped filters, inspect exact log body/attributes, and pivot to trace/span detail when correlation exists.

### Desktop Layout

```text
+--------------------------------------------------------------------------------+
| Logs                                         Time range  Severity  Refresh      |
| Search project logs and pivot to traces.     Copy URL    More filters           |
+--------------------------------------------------------------------------------+
| Search bar: [free text] [service] [severity] [trace id/span id] [More]          |
| Active chips: service=checkout-api  severity=error  trace=trc_92ad6f           |
+-------------------------------------------------------------+------------------+
| Log table                                                   | Log inspector    |
| Timestamp | Severity | Service | Trace/Span | Message       | Selected log     |
| Attributes | Actions | Virtualized rows                      | Body             |
|                                                             | Attributes       |
|                                                             | Pivot actions    |
+-------------------------------------------------------------+------------------+
```

Desktop rules:

- services, severities, trace/span IDs, attribute keys, and correlation options live in the filter bar, `More filters` popover, and active chips; `/logs` does not render a permanent left facet rail;
- log table fills the route workspace height and owns vertical scrolling;
- table header is sticky inside the table scroll container;
- inspector default width is 420px, resizes between 360px and 640px on desktop, and opens when a row is selected or expanded;
- the table/inspector splitter is a keyboard-focusable separator with pointer resize and reset behavior;
- below 1024px, filter controls collapse to a `Filters` sheet and the inspector becomes a bottom sheet;
- populated route body must not rely on page-level scrolling.

### Search And Filters

Primary filters:

- free-text search against backend-supported log search;
- time range;
- service;
- severity;
- trace ID;
- span ID.

Advanced filters:

- attribute filters;
- observed timestamp range when supported;
- exact log ID;
- sort.

Behavior:

- Filters map directly to `LogSearchInput`, including multi-service selections through the `services` filter when more than one service is selected.
- Active filters render as removable chips below the filter bar.
- Service selection uses bounded backend facet suggestions with removable chips, and manual entry remains available even when facets are unavailable. `/logs` requests `Query.telemetryFacets` with `signal: logs`; `/metrics` requests it with `signal: metrics`, so service suggestions are not mixed across telemetry signals.
- Filter chips update URL state and refetch `Query.logs`.
- Search input submits after debounce and on Enter; Enter must not open the selected row unless focus is on a row.
- Filter suggestions are suggestions only. They do not replace typed filters or create a separate navigation rail.
- Search, filters, cursor pagination, and sortable log columns are always
  backend-driven through `Query.logs` and `LogSearchInput`. The log table must
  not filter or reorder the loaded page in React for route-primary behavior.

### Log Table

Columns:

- timestamp, with observed timestamp shown in row details when different;
- severity text/number;
- service name;
- trace/span correlation;
- body preview;
- attribute count;
- row actions.

Row behavior:

- clicking a row selects it and opens/updates the log inspector;
- double click or `Enter` on a focused selected row expands inline body preview when the inspector is closed on narrow screens;
- copy actions do not trigger row selection;
- rows with trace ID show `Open trace`;
- rows with trace ID and span ID show `Open span`;
- rows without correlation keep body/attribute inspection but no trace action.

### Log Inspector

The inspector is a resizable detail panel, not a second navigation surface.

The inspector has tabs:

- Body;
- Attributes;
- Correlation.

Body tab:

- shows parsed JSON when `LogEvent.body` is an object or array;
- shows scalar body text in monospace with wrapping;
- copy body action in the section header;
- raw JSON fallback always available.

Attributes tab:

- uses the compact evidence-browser pattern from the trace span inspector;
- one empty `Search attributes` field;
- semantic groups first when known OpenTelemetry prefixes are present;
- raw attributes fallback;
- key/value rows with copy action only;
- no default type column or row-level filter button.

Correlation tab:

- shows trace ID, span ID, service name, timestamp, and correlation status from `LogCorrelation`;
- `Open trace` opens `/traces/:traceId`;
- `Open span` opens `/traces/:traceId?spanId=:spanId`;
- if trace/span is missing, expired, unauthorized, or unavailable, route navigation shows the trace missing state and preserves copied reference actions;
- frontend must never search other projects for a correlated trace/span.

Copy behavior:

- log ID, trace ID, span ID, body, attribute key, and attribute value copy actions are icon buttons with accessible labels;
- copy actions must not select table rows, navigate, or change inspector tab;
- copied values come from the selected log event only and never include hidden credentials or cross-project data.

### Log States

- No logs ingested: explain that no logs exist for the selected project and offer `Copy OTLP setup`.
- No filter results: show active chips and primary action `Clear filters`.
- Storage unavailable: inline problem panel with retry and problem code.
- Large log volume: keep virtualization active and do not render all rows at once.
- Missing correlation: keep the log visible and disable trace/span actions with a short reason.

## `/metrics` Metric Explorer

### User Job

The user opens `/metrics` to discover which metrics exist in the project, inspect descriptors, query a metric, group or filter by attributes, and view returned series/exemplars without building a saved dashboard.

The route header is compact: title, selected metric name when present, time
range, refresh, and filter actions. Do not repeat breadcrumbs, long
descriptions, or duplicate search controls when the selected project context is
already visible in the app shell. When metrics exist and no metric is selected,
the first metric is selected automatically so the route shows a working query
surface immediately. Unless the user explicitly chooses otherwise, the initial
query uses an aggregation valid for the metric descriptor kind and an observed
descriptor time range padded enough to include seeded/local development data.
Group-by selection uses the same dropdown/select control pattern as the other
query controls. It must not appear as an unrelated freeform chip list in the
header controls.

### Desktop Layout

```text
+--------------------------------------------------------------------------------+
| Metrics                                      Time range  Refresh  Copy URL      |
| Find project metrics and inspect raw series.                                      |
+--------------------------------------------------------------------------------+
| Search metrics: [query] [service] [kind] [temporality]                           |
+--------------------------+----------------------------------+------------------+
| Metric list              | Query preview/results            | Metric inspector |
| Name, kind, unit         | aggregation/group/filter controls| Descriptor       |
| first/last seen          | chart or table                   | Attributes       |
| attribute keys           | exemplar table                   | Exemplars        |
+--------------------------+----------------------------------+------------------+
```

### Metric List

Metric list uses `Query.metricNames`.

Rows show:

- metric name;
- description when available;
- kind;
- unit;
- aggregation temporality;
- monotonic flag when meaningful;
- first seen and last seen;
- attribute key count.

Behavior:

- selecting a metric updates URL `metric=<name>`;
- selection loads descriptor into the inspector and prepares a default query;
- list search updates `MetricNameSearchInput.query`;
- service and time controls map to `MetricNameSearchInput` fields;
- descriptor sorting maps to `MetricNameSearchInput.sort`;
- the list incrementally loads backend cursor pages as the user scrolls;
- the frontend must not filter or page metric descriptors over an already-fetched client subset;
- the frontend must not sort metric descriptors locally for route-primary
  list ordering;
- the list remains readable with hundreds of metrics through virtualization.

### Metric Query Surface

The metric query surface is a technical explorer, not a dashboard editor.

Controls:

- aggregation from GraphQL `MetricAggregation`;
- time range;
- interval;
- group-by keys from `MetricDescriptor.attributeKeys`;
- attribute filters;
- chart type preview: line, area, bar, stat, or table.

Rules:

- query execution uses `Query.metricSeries`;
- controls map directly to `MetricSeriesInput`;
- result ordering maps to `MetricSeriesInput.sort` and is applied by
  storage-read;
- frontend must not invent calculated fields or derived aggregations;
- invalid backend combinations render GraphQL validation errors inline;
- query warnings stay visible in the result header and inspector;
- returned series cap follows backend result limits and the UI does not render more than 20 visible series by default;
- exemplar trace/span links use the same project-scoped pivot behavior as metric dashboards.

### Metric Inspector

Tabs:

- Descriptor;
- Attributes;
- Series;
- Exemplars.

Descriptor tab:

- name, description, unit, kind, temporality, monotonic, first seen, last seen.

Attributes tab:

- list of descriptor attribute keys with search;
- selected group-by keys are visible and removable;
- no arbitrary custom dimensions are allowed beyond descriptor keys.

Series tab:

- returned series labels, point count, first point, latest point, warnings.

Exemplars tab:

- timestamp, value, trace ID, span ID, attributes;
- exemplar trace/span actions open trace detail when IDs are present.

### Metric Explorer States

- No metrics: primary action `Open metrics setup`.
- No matching metrics: primary action `Clear metric search`.
- No series for selected range: keep descriptor visible and offer time range expansion.
- Query error: show retry and problem code without clearing selected metric.

## `/dashboards` Dashboard Workspace

### User Job

The user opens `/dashboards` to view reusable project dashboards, create or edit dashboards, arrange widgets, and combine metric charts with log, trace, and live trace widgets.

Dashboard persistence uses first-class `Dashboard` and `DashboardWidget` contracts. Implementation must remove metric-view compatibility surfaces instead of aliasing them. Saved widgets must map to typed GraphQL dashboard widget inputs and must never store executable code, raw queries, or arbitrary JSON configuration.

The dashboard route header is compact. In builder mode, the selected dashboard
name is the route headline and must not be duplicated again inside the canvas.
Time range, refresh, create/add, duplicate, save, and destructive actions live
in one compact toolbar. If no dashboard time range is explicitly selected,
metric widgets use the observed range of their own metric descriptors so
built-in dashboards render charts immediately in local development and tests.
The time range picker must allow explicit independent start and end dates and
times. Metric chart legends must use readable labels such as `gateway` or
`service.name: gateway`, not raw JSON snippets such as
`{"service.name":"gateway"}`.

The implementation in `apps/frontend/src/routes/dashboards-route.tsx` is a partial implementation and must not be treated as finished UX. Agents may reuse its GraphQL wiring and existing components, but the accepted UX target is this section plus `dashboard-widgets.md`.

The route has two modes:

- Overview mode: `/dashboards` without a selected dashboard shows a dedicated dashboard overview page. It contains search, grouped dashboard cards for pinned, built-in, personal, and project dashboards, a single create action, and star/pin affordances backed by dashboard pin mutations.
- Builder mode: `/dashboards?dashboard=<dashboardId>` or a new unsaved draft opens the dashboard editor. The editor is a focused WYSIWYG-style canvas with the widget grid as the primary surface. Creating or editing a widget opens a right-side drawer/sheet for widget settings; the builder must not keep a permanent inspector column beside the canvas.

Overview mode must not show the widget editor drawer. Builder mode must not show a second dashboard rail or a permanent widget inspector column; dashboard selection belongs to the overview page and the project sidebar shortcuts.

Mode resolution:

- `/dashboards` with no `dashboard` and no unsaved draft renders overview mode.
- `/dashboards?dashboard=<dashboardId>` renders builder mode for the matching visible dashboard.
- creating a dashboard renders builder mode with an unsaved draft and removes any stale `dashboard` parameter.
- selecting a different dashboard while dirty opens discard confirmation before changing URL state.
- a missing, inaccessible, or deleted `dashboard` parameter renders a not-found dashboard state with actions `Back to dashboards` and `Retry`; it must not silently choose another dashboard.
- URL `widget=<widgetId>` selects that widget in builder mode when the widget exists; otherwise the widget parameter is ignored and removed on next state update.

### Desktop Layout

```text
+--------------------------------------------------------------------------------+
| Dashboards                                      Time range  Refresh  Create     |
| Shared project dashboards and visualization widgets.                           |
+--------------------------------------------------------------------------------+
| Search dashboards                                                              |
| Pinned dashboards: grouped selectable dashboard cards with star/pin controls   |
| Built-in dashboards: grouped selectable dashboard cards                        |
| Personal/project dashboards: grouped selectable dashboard cards                |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| Selected dashboard                         Time range  Refresh  Duplicate Save |
| Reusable project dashboard.                                      Delete        |
+----------------------------------------------------------+---------------------+
| WYSIWYG dashboard canvas: responsive widget grid          | Widget drawer       |
| Metric, log, trace, and live trace widgets                | Data/Display        |
|                                                          | Thresholds          |
+--------------------------+----------------------------------+------------------+
```

### Dashboard Overview

Uses `Query.dashboards`.

Sections:

- search;
- pinned dashboards;
- built-in dashboards;
- personal dashboards;
- project dashboards;
- create dashboard action.

Cards show:

- dashboard name;
- `Built-in`, `Personal`, or `Project`;
- tags;
- widget count;
- updated timestamp when available;
- owner label only when useful to distinguish personal and project dashboards;
- star/pin action when the dashboard is user-pin eligible;
- dirty marker for active edited dashboard only.

Built-in dashboards are read-only. Editing a built-in creates an unsaved draft and requires duplicate/save before persistence.

Overview interactions:

- search input writes URL `query` and refetches `Query.dashboards(input.query)`;
- empty search results show `No dashboards match these filters` and `Clear search`;
- no-dashboard state shows built-ins when built-ins exist; otherwise it shows one primary `Create dashboard` action;
- pin/unpin is an icon button on the card and does not open the dashboard;
- successful pin/unpin updates `DashboardListResult.pinnedDashboardIds` and invalidates sidebar dashboard query data;
- mutation errors show compact feedback and leave the card state unchanged unless an optimistic state is explicitly rolled back.

### Dashboard Sidebar Shortcuts

The global project sidebar may expose dashboard shortcuts because saved dashboards are a frequent project-level destination.

Rules:

- pinned dashboards appear as a `Pinned dashboards` group below `AI Chat` when present and above the primary telemetry navigation;
- show at most five pinned dashboards in the sidebar; additional pinned dashboards remain available in `/dashboards`;
- pinned entries open `/dashboards?dashboard=<dashboardId>` with the selected dashboard ID in URL state;
- the primary `Dashboards` navigation entry is collapsible and may reveal custom dashboards the current user can access;
- child entries under `Dashboards` open the same `/dashboards?dashboard=<dashboardId>` URL state as pinned entries;
- the parent `Dashboards` entry remains visible and opens the dashboard workspace overview/list;
- pin/unpin controls write through `Mutation.setDashboardPinned`;
- sidebar pin ordering writes through `Mutation.reorderDashboardPins`;
- the frontend must not store pins in browser localStorage except as a transient optimistic state while the mutation is in flight.

### Dashboard Canvas

The canvas is a stable WYSIWYG widget grid. It is the primary working surface in builder mode and must not sit inside another page card.

Builder header:

- inline dashboard name field;
- inline dashboard description field;
- visibility control for unsaved drafts and mutable existing dashboards;
- time range control;
- refresh action;
- view/edit mode toggle;
- duplicate action;
- save action;
- discard action when a draft is dirty;
- delete action when the selected dashboard is mutable;
- one primary `Add widget` action.

Header rules:

- view/edit toggle is visible for saved mutable dashboards and unsaved drafts;
- built-in dashboards open in view mode; selecting edit on a built-in creates a duplicate draft;
- save is disabled until name is non-empty, at least one widget exists, layout is valid, and no editor field has a local validation error;
- delete is hidden for built-ins and unavailable to users without permission;
- refresh refetches visible widget data and dashboard list metadata, but it must not discard dirty draft state.

Canvas layout:

- desktop uses a 12-column grid with a 72px base row height and 12px gaps;
- the canvas scrolls internally when widget rows exceed the viewport;
- widgets keep stable dimensions during loading, empty, and error states;
- selected widgets show a neutral focus outline and edit handles in edit mode;
- the grid renders insertion and resize previews while the user drags or resizes;
- no nested card shell wraps the entire dashboard grid.

Supported widgets:

- metric time series widget backed by `DashboardMetricWidgetInput` and `Query.metricSeries`;
- metric stat widget backed by `DashboardMetricWidgetInput` and `Query.metricSeries`;
- metric table widget backed by `DashboardMetricWidgetInput` and `Query.metricSeries`;
- log table widget backed by `DashboardLogWidgetInput` and `Query.logs`;
- trace table widget backed by `DashboardTraceWidgetInput` and `Query.traces`;
- live trace table widget backed by `DashboardLiveTraceWidgetInput` and `Subscription.liveTraces`.

Additional full-editor widget target:

- rich metric query widget backed by the required storage-read-owned rich metric query GraphQL contract. Production UI hides creation/editing for this widget until GraphQL, AsyncAPI, TypeScript, Go, storage-read formula coverage, typed editor controls, and focused tests are complete.

Production widget availability:

- available now: `metric_timeseries`, `metric_stat`, `metric_table`, `log_table`, `trace_table`, `live_trace_table`, `alert_status`, `alert_history`, `alert_evidence`;
- production-hidden for creation/editing until the rich metric implementation wave passes: `metric_rich`;
- unsupported future widget kinds from persisted data render an unsupported widget state with kind, widget ID, and a copy-link action, but cannot be edited or saved without a spec/contract update.

Widget rules:

- every widget has one stable ID, one title, one `DashboardWidgetKind`, one layout object, and exactly one matching source config;
- widget layout is a bounded 12-column grid with integer `x`, `y`, `w`, `h`, `minW`, and `minH`;
- metric widgets may render line, area, bar, pie, donut, stat, radial, radar, heatmap, histogram, or table visualizations where the backend contract can return the required shape;
- log and trace widgets are table-first and use compact columns only;
- live widgets display a bounded rolling table and do not persist live events;
- unsupported widget kinds are not shown in production UI.
- the builder exposes one primary `Add widget` action; widget type choices live in the add-widget popover, not as a permanent button column.
- dashboard name and description are edited from the route header/editor surfaces, not duplicated inside the dashboard canvas. Editing an existing or built-in dashboard creates an explicit dirty draft.

Drag and resize behavior:

- drag starts from a widget drag handle, not from interactive chart/table content;
- keyboard users can select a widget, move it by grid cell, resize it by grid cell, and commit or cancel the layout change;
- pointer users see a live slot preview and invalid-drop feedback;
- resize handles exist on the right, bottom, and lower-right edges;
- widgets snap to the grid and cannot overlap after compaction;
- collision handling pushes affected widgets downward in stable widget order;
- layout changes remain local draft changes until explicit save;
- undo and redo are available for layout changes inside the current draft;
- mobile builder mode uses stacked widgets with explicit move up/down controls and sheet-based editing rather than freeform drag-resize.

Widget actions:

- expand details;
- edit;
- duplicate;
- remove from draft dashboard;
- copy widget link when URL state supports it.

Widget action behavior:

- edit opens the widget drawer in `edit` mode and starts or updates the local draft;
- expand opens the drawer in `details` mode or a future full-screen detail route only if that route is specified first;
- duplicate creates a new widget ID, offsets layout downward, selects the clone, and marks layout plus widget data dirty;
- remove deletes from local draft only and is undoable;
- copy widget link is enabled only for saved dashboards with stable widget IDs;
- refresh refetches only the selected widget's data when invoked from the widget action menu.

### Widget Inspector And Editor

The right drawer/sheet is used for widget details and editing. It is not a modal and opens only after the user creates or selects a widget for editing.

Metric widget editor groups:

- Data: metric name, aggregation, group-by keys, filters, time window, interval, and rich metric query builder when contracts exist;
- Display: title, chart type, stacking option where supported, legend visibility, y-axis mode, unit display, and layout size;
- Thresholds: threshold values and severity labels.

Metric editor controls:

- metric name uses `Query.metricNames` suggestions and permits manual entry;
- aggregation options come from GraphQL `MetricAggregation` and are validated by backend;
- group-by keys come from the selected `MetricDescriptor.attributeKeys`; manual entry is hidden unless descriptor data is unavailable, in which case manual entries are clearly marked as unverified;
- filters use structured attribute-filter rows with key, operator, and value controls;
- interval accepts explicit ISO duration or supported preset values;
- thresholds support add, edit, remove, severity, value, and label;
- display chart type list hides chart kinds unsupported by the current result shape.

Rich metric query editor behavior:

- The query builder lives inside the `Data` group to preserve the three-group editor rule.
- The editor starts with one query row and can add named query rows.
- Each row uses metric search, aggregation, group-by, filters, and max series controls mapped to typed contracts.
- Formula rows are created through structured controls: choose left operand, operator/function, right operand or numeric constant. The UI must not expose freeform executable expressions.
- Formula validation runs locally for shape feedback and is revalidated by GraphQL/storage-read on save or query execution.
- The preview area renders backend-returned output only; it does not compute combined series in React.
- A widget cannot save rich query configuration while formula coverage, generated contracts, typed editor controls, or focused tests are incomplete.

Log and trace widget editor groups:

- Data: filter fields, search, sort, limit, and columns;
- Display: title, compact column set, row density, and empty-state copy;
- Thresholds: unavailable and hidden for log/trace widgets. Alert behavior is
  represented through the typed alert widgets from `dashboard-widgets.md`, not
  through generic table thresholds.

Live trace widget editor groups:

- Data: live trace filters and row limit;
- Display: title, columns, stream status, and pause/resume presentation;
- Thresholds: unavailable and hidden. Live alert behavior is represented
  through typed alert widgets, not through live table thresholds.

Dirty behavior:

- saving is explicit;
- closing inspector with dirty edits opens discard confirmation;
- switching project with dirty dashboard edits opens discard confirmation;
- save conflicts show inline version conflict and `Reload dashboard`.
- route changes, dashboard selection changes, and project selection changes use the same discard confirmation model.
- successful save clears undo/redo history for the current draft.

Conflict and validation behavior:

- stale version conflict renders an inline problem beside Save and keeps the draft;
- `Reload dashboard` discards the draft only after confirmation;
- `Save as copy` removes `id` and `version`, appends `Copy` to the name, and keeps widgets unchanged;
- field-level validation errors render beside the field and disable save only when the payload would fail known frontend validation;
- backend validation errors without a field path render near Save and keep the drawer open.

### Dashboard States

- No dashboards: show built-ins when available; otherwise primary action `Create dashboard`.
- No metrics for built-in dashboard: omit unavailable panels and explain missing metrics.
- Query error in one widget: show widget-local retry and problem code; do not fail the entire dashboard.
- Delete dashboard: destructive confirmation dialog.
- Empty dashboard draft: show the canvas empty state with one `Add widget` action.
- Unsupported rich widget creation/edit gate: show a disabled widget type and short unavailable reason only in development builds; production hides creation/edit entry points.
- Layout validation failure: keep the draft open, mark the invalid widget, and show the validation problem near the save action and editor layout controls.
- Missing selected dashboard: show `Dashboard not found` with `Back to dashboards` and `Retry`.
- Permission denied selected dashboard: show a GraphQL problem panel and do not reveal dashboard metadata.
- Dirty route/project switch: show discard confirmation and preserve the user's attempted destination.
- Widget unsupported by current contracts: keep the widget frame stable and show unsupported-contract copy; do not drop it from the draft automatically.

## Cross-View Pivots

- Log-to-trace: `/logs` row opens `/traces/:traceId` or `/traces/:traceId?spanId=:spanId`.
- Trace-to-log: trace detail log actions open `/logs` with trace/span filters.
- Metric-to-trace: metric exemplars open trace detail when IDs are present.
- Dashboard-to-metric: metric widget details can open `/metrics?metric=<metricName>` with query context when representable by `MetricSeriesInput`.
- Dashboard-to-log opens `/logs` with the widget's log filters when representable by `LogSearchInput`.
- Dashboard-to-trace opens `/traces` with the widget's trace filters when representable by `TraceSearchInput`.

## Project Alerting UX

Alerting UX is specified in `specs/05-frontend/alerts-ux-concept.md`.

This dashboard/log/metric spec owns only alert relationships for these views:

- dashboard threshold display settings are not alert rules;
- dashboard alert widgets are read-only evidence/status/history widgets backed
  by alert contracts;
- dashboards may link to `/alerts?ruleId=<id>` from typed alert widgets;
- dashboard editing must not create, update, enable, disable, silence, or delete
  alert rules.

## URL State

Logs:

- filters, sort, cursor, selected log ID, inspector tab.

Metrics:

- selected metric name, time range, aggregation, interval, group-by keys, filters, chart preview type, inspector tab.

Dashboards:

- selected dashboard ID or built-in slug, time range, selected widget ID, inspector mode, dirty draft state only when shareable without leaking unsaved data. Otherwise dirty draft state is browser-local.
- expanded/collapsed dashboard sidebar group is presentation state and does not change URL state.
- route mode is derived from selected dashboard ID or local draft state; do not add a separate URL-only mode that can diverge from these rules.

Alerts:

- selected rule ID, filters, sort, inspector tab, and history cursor.

## Acceptance Criteria

- `/logs` renders a searchable log table with filter controls, removable filter chips, resizable selected-log inspector, copy actions, and trace/span pivot actions. It does not render a permanent left facet/service rail.
- `/metrics` renders a metric explorer based on `metricNames` and `metricSeries`, not the dashboard rail.
- `/dashboards` renders saved/built-in dashboards based on `Query.dashboards`, with overview mode, builder mode, widget grid, drawer/sheet editor, and pin/star affordances backed by dashboard pin mutations.
- The project sidebar supports pinned dashboard shortcuts and a collapsible `Dashboards` child list backed by `DashboardListResult.pinnedDashboardIds` and visible dashboard data.
- Live trace receiving remains a mode inside `/traces`, not a dashboard or logs route.
- `/alerts` renders project-scoped alert rules, history, silences, editor, and trace/log/metric pivots through the generated alert contracts. Dashboards may show alert evidence only through typed alert widgets; generic dashboard thresholds are not alert rules.
- The dashboard implementation passes focused tests for mode resolution, dirty discard, stale conflict handling, rich metric production gating, widget-local query errors, mobile stacked editing, and keyboard layout controls before the dashboard UX can be marked complete.
