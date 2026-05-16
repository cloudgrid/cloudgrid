---
id: TEC-FE-011
title: Logs, metrics explorer, and dashboards UX concept
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: user-requested
depends_on: [TEC-FE-009, TEC-FE-010, TEC-BE-017]
---

# Logs, Metrics Explorer, And Dashboards UX Concept

## Intent

This spec defines the product-level UX for `/logs`, `/metrics`, and `/dashboards`.

The routes have separate user jobs:

- `/logs`: search raw and correlated log evidence, then pivot to trace/span context.
- `/metrics`: inspect available project metrics, understand descriptors, query series, and run low-level aggregations without creating a dashboard.
- `/dashboards`: view, create, edit, and manage reusable visual compositions built from metrics, logs, trace/live widgets, and future alert evidence.

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

- Filters map directly to `LogSearchInput`.
- Active filters render as removable chips below the filter bar.
- Manual entry remains available even when facets are unavailable.
- Filter chips update URL state and refetch `Query.logs`.
- Search input submits after debounce and on Enter; Enter must not open the selected row unless focus is on a row.
- Filter suggestions are suggestions only. They do not replace typed filters or create a separate navigation rail.

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

The route has two modes:

- Overview mode: `/dashboards` without a selected dashboard shows a dedicated dashboard overview page. It contains search, grouped dashboard cards for pinned, built-in, personal, and project dashboards, a single create action, and star/pin affordances backed by dashboard pin mutations.
- Builder mode: `/dashboards?dashboard=<dashboardId>` or a new unsaved draft opens the dashboard editor. The editor is a focused WYSIWYG-style canvas with the widget grid as the primary surface. Creating or editing a widget opens a right-side drawer/sheet for widget settings; the builder must not keep a permanent inspector column beside the canvas.

Overview mode must not show the widget editor drawer. Builder mode must not show a second dashboard rail or a permanent widget inspector column; dashboard selection belongs to the overview page and the project sidebar shortcuts.

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
- star/pin action when the dashboard is user-pin eligible;
- dirty marker for active edited dashboard only.

Built-in dashboards are read-only. Editing a built-in creates an unsaved draft and requires duplicate/save before persistence.

### Dashboard Sidebar Shortcuts

The global project sidebar may expose dashboard shortcuts because saved dashboards are a frequent project-level destination.

Rules:

- pinned dashboards appear as a `Pinned dashboards` group at the top of the project sidebar, above the primary project navigation;
- show at most five pinned dashboards in the sidebar; additional pinned dashboards remain available in `/dashboards`;
- pinned entries open `/dashboards?dashboard=<dashboardId>` with the selected dashboard ID in URL state;
- the primary `Dashboards` navigation entry is collapsible and may reveal custom dashboards the current user can access;
- child entries under `Dashboards` open the same `/dashboards?dashboard=<dashboardId>` URL state as pinned entries;
- the parent `Dashboards` entry remains visible and opens the dashboard workspace overview/list;
- pin/unpin controls write through `Mutation.setDashboardPinned`;
- sidebar pin ordering writes through `Mutation.reorderDashboardPins`;
- the frontend must not store pins in browser localStorage except as a transient optimistic state while the mutation is in flight.

### Dashboard Canvas

The canvas is a stable widget grid.

Supported widgets:

- metric time series widget backed by `DashboardMetricWidgetInput` and `Query.metricSeries`;
- metric stat widget backed by `DashboardMetricWidgetInput` and `Query.metricSeries`;
- metric table widget backed by `DashboardMetricWidgetInput` and `Query.metricSeries`;
- log table widget backed by `DashboardLogWidgetInput` and `Query.logs`;
- trace table widget backed by `DashboardTraceWidgetInput` and `Query.traces`;
- live trace table widget backed by `DashboardLiveTraceWidgetInput` and `Subscription.liveTraces`.

Widget rules:

- every widget has one stable ID, one title, one `DashboardWidgetKind`, one layout object, and exactly one matching source config;
- widget layout is a bounded 12-column grid with integer `x`, `y`, `w`, `h`, `minW`, and `minH`;
- metric widgets may render line, area, bar, pie, stat, or table visualizations;
- log and trace widgets are table-first and use compact columns only;
- live widgets display a bounded rolling table and do not persist live events;
- unsupported widget kinds are not shown in production UI.
- the builder exposes one primary `Add widget` action; widget type choices live in the add-widget popover, not as a permanent button column.
- dashboard name and description are edited in place in the dashboard canvas header. Editing an existing or built-in dashboard creates an explicit dirty draft.

Widget actions:

- expand details;
- edit;
- duplicate;
- remove from draft dashboard;
- copy widget link when URL state supports it.

### Widget Inspector And Editor

The right drawer/sheet is used for widget details and editing. It is not a modal and opens only after the user creates or selects a widget for editing.

Metric widget editor groups:

- Data: metric name, aggregation, group-by keys, filters, time window, interval;
- Display: title, chart type, legend visibility, layout size;
- Thresholds: threshold values and severity labels.

Log and trace widget editor groups:

- Data: filter fields, search, sort, limit, and columns;
- Display: title, compact column set, row density, and empty-state copy;
- Thresholds: unavailable and hidden for log/trace widgets until alert contracts exist.

Live trace widget editor groups:

- Data: live trace filters and row limit;
- Display: title, columns, stream status, and pause/resume presentation;
- Thresholds: unavailable and hidden until alert contracts exist.

Dirty behavior:

- saving is explicit;
- closing inspector with dirty edits opens discard confirmation;
- switching project with dirty dashboard edits opens discard confirmation;
- save conflicts show inline version conflict and `Reload dashboard`.

### Dashboard States

- No dashboards: show built-ins when available; otherwise primary action `Create dashboard`.
- No metrics for built-in dashboard: omit unavailable panels and explain missing metrics.
- Query error in one widget: show widget-local retry and problem code; do not fail the entire dashboard.
- Delete dashboard: destructive confirmation dialog.

## Cross-View Pivots

- Log-to-trace: `/logs` row opens `/traces/:traceId` or `/traces/:traceId?spanId=:spanId`.
- Trace-to-log: trace detail log actions open `/logs` with trace/span filters.
- Metric-to-trace: metric exemplars open trace detail when IDs are present.
- Dashboard-to-metric: metric widget details can open `/metrics?metric=<metricName>` with query context when representable by `MetricSeriesInput`.
- Dashboard-to-log opens `/logs` with the widget's log filters when representable by `LogSearchInput`.
- Dashboard-to-trace opens `/traces` with the widget's trace filters when representable by `TraceSearchInput`.

## Project Alerting UX

Alerting is a project-level operational workspace at `/alerts`. It is not embedded into dashboard editing and it is not a company-global administration page.

Sidebar placement:

- `/alerts` remains a project-level route, but it is not a primary project sidebar item and must not be inserted into the global project sidebar order;
- the route may be opened directly, from command palette actions, from alert evidence links, and from explicit alert-management entry points specified by alerting specs;
- active firing counts may be shown only on alerting surfaces when GraphQL exposes them; otherwise no synthetic count is rendered.

Layout:

- use the standard route chrome: breadcrumb row, title row, and project content area;
- title is `Alerts`;
- primary action is `Create alert rule` with a plus icon;
- secondary action is icon-only refresh;
- no other header actions are visible in v1;
- content is a two-panel split: left alert rule table, right selected rule/history inspector;
- the table panel is the primary surface and owns scrolling;
- the inspector is resizable, uses the same right-panel behavior as logs and trace details, and is hidden on mobile until a row is selected.

Alert rule table columns:

- status;
- severity;
- rule name;
- kind;
- signal;
- evaluation window;
- last event;
- enabled.

Standard element rules:

- status uses plain text for `OK` and red text only for `FIRING` or `ERROR`;
- severity uses text only, not colored badges, except `CRITICAL` may use red text;
- enabled is a switch only when the viewer can administer project alerts;
- row click selects the rule and updates the inspector;
- table headers are sortable where the backend returns stable sortable fields.

Filters:

- default visible filters are search, status, severity, signal, and enabled;
- advanced filters are behind the existing `More filters` disclosure pattern;
- filter chips are removable independently;
- empty results caused by filters say `No alert rules match these filters` and show `Clear filters`;
- a project with no alert rules says `No alert rules yet` and shows `Create alert rule` only for project admins.

Rule editor:

- create/edit opens a right sheet, not a modal;
- destructive delete uses a confirmation dialog;
- the sheet has sections `Basics`, `Signal query`, `Condition`, `Timing`, and `Notifications`;
- `Basics` contains name, enabled, kind, and severity;
- `Signal query` renders the exact query controls for the selected kind: metric selector for metric rules, log filters for log rules, trace filters for trace rules;
- `Condition` renders only the fields allowed by `04-backend/alerting.md` for the selected kind;
- `Timing` contains evaluation window, pending-for, and cooldown;
- `Notifications` shows the in-app adapter as checked and read-only in v1;
- changing rule kind resets query and condition after a confirmation dialog if either section is dirty.

Inspector tabs:

- `Overview`: current state, severity, kind, enabled state, timing, notification adapters, version, and last update metadata;
- `History`: alert event table backed by `alertHistory`;
- `Silences`: active and scheduled silences backed by `alertSilences`.

History pivots:

- trace evidence opens trace detail;
- span evidence opens trace detail with selected span;
- log evidence opens logs with selected log/trace/span filters;
- metric evidence opens metrics with metric name and representable query context.

Silence behavior:

- create silence is available from the selected rule inspector for project admins;
- delete silence is destructive only when active or future scheduled;
- expired silences are read-only history entries.

Dashboard relationship:

- dashboard threshold display settings are not alert rules;
- dashboards may link to `/alerts?ruleId=<id>` when an alert history widget is later specified;
- v1 dashboard editing must not create, update, or delete alert rules.

## URL State

Logs:

- filters, sort, cursor, selected log ID, inspector tab.

Metrics:

- selected metric name, time range, aggregation, interval, group-by keys, filters, chart preview type, inspector tab.

Dashboards:

- selected dashboard ID or built-in slug, time range, selected widget ID, inspector mode, dirty draft state only when shareable without leaking unsaved data. Otherwise dirty draft state is browser-local.
- expanded/collapsed dashboard sidebar group is presentation state and does not change URL state.

Alerts:

- selected rule ID, filters, sort, inspector tab, and history cursor.

## Acceptance Criteria

- `/logs` renders a searchable log table with filter controls, removable filter chips, resizable selected-log inspector, copy actions, and trace/span pivot actions. It does not render a permanent left facet/service rail.
- `/metrics` renders a metric explorer based on `metricNames` and `metricSeries`, not the dashboard rail.
- `/dashboards` renders saved/built-in dashboards based on `Query.dashboards`, with dashboard rail, widget grid, inspector/editor, and pin/star affordances backed by dashboard pin mutations.
- The project sidebar supports pinned dashboard shortcuts and a collapsible `Dashboards` child list backed by `DashboardListResult.pinnedDashboardIds` and visible dashboard data.
- Live trace receiving remains a mode inside `/traces`, not a dashboard or logs route.
- `/alerts` renders project-scoped alert rules, history, silences, editor, and trace/log/metric pivots after contracts from `04-backend/alerting.md` are generated. Dashboards may show alert evidence only through typed alert widgets or alert-history widgets specified after `04-backend/alerting.md`; generic dashboard thresholds are not alert rules.
