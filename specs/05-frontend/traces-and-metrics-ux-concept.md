---
id: TEC-FE-010
title: Traces and metrics UX concept
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
provenance: user-requested
depends_on: [TEC-FE-002, TEC-FE-003, TEC-FE-005, TEC-FE-008, TEC-FE-009, TEC-BE-008]
---

# Traces UX Concept

## Intent

This spec defines the product-level UX for CloudGrid trace workspaces. It is the implementation source of truth for layout, visualization, detail surfaces, live trace receiving, and interaction behavior inside `/traces` and `/traces/:traceId`.

The concept follows the enterprise UX v2 shell from [Enterprise product UX concept](./product-ux-concept.md): global topbar, project sidebar, independent scroll containers, flat shadcn/Tailwind surfaces, no card-in-card composition, and project-scoped GraphQL view models.

## Shared Principles

- Traces are project workspaces. They require `viewer.selectedProject` and never render before project selection.
- Both views use one route-primary workspace surface. The route body is not wrapped in a page card.
- Dense data is presented through tables, timeline rows, panel grids, rails, and inspectors, not decorative dashboard cards.
- Topbar and project sidebar remain visible. The route header, filter/tool rows, primary workspace, rails, and inspectors scroll independently when content overflows.
- Details open in persistent right-side inspectors on desktop and bottom sheets on mobile. Modal dialogs are reserved for confirmation, warning, information, and error acknowledgement.
- Frontend renders GraphQL view models only. It may own URL state, selected row/span, collapsed rows, panel layout draft state, visible legend state, and drawer open state. It must not compute telemetry query semantics, rates, percentiles, rollups, trace structure, service breakdowns, metric descriptors, or score values.

## Visual Language

The visual direction is a quiet engineering command center:

- neutral background;
- bordered workspace surfaces;
- sticky headers and separators for hierarchy;
- standard controls use default shadcn neutral styling;
- non-neutral color appears only in telemetry visualizations, severity labels, warnings, errors, chart series, and graph relationships;
- monospace IDs and metric values;
- no decorative gradients, hero blocks, marketing panels, custom drop shadows, or nested cards.

Status is communicated by label, icon/shape, and color together. Color alone is never sufficient.

## `/traces` Trace Workspace

### User Job

The user opens `/traces` to watch incoming traces, find a historical candidate trace quickly, preserve the investigation query in the URL, and open one trace into a deeper timeline/detail view.

`/traces` owns both historical trace search and live trace receiving. There is no separate `Live` primary navigation entry and no separate `/live` route in the UX concept. Live is a mode of the trace table because the row shape, filters, trace detail navigation, and investigation task are the same.

### Desktop Layout

```text
+--------------------------------------------------------------------------------+
| Route header: Traces                              [History | Live] Refresh/Pause |
| Purpose: Search history or receive traces live in selected project. Copy link   |
+--------------------------------------------------------------------------------+
| Filter bar: [Time range] [Service] [Status] [Duration] [Search query] [More]   |
| Active chips: service=api  status=error  duration>500ms             Clear all   |
+--------------------------+-----------------------------------------------------+
| Facets                   | Trace table workspace                               |
| - Services               | Sticky columns:                                    |
| - Operations             | Service | Operation | Trace ID | Started | Dur.    |
| - Span names             | Status | Spans | Errors | Logs | Services          |
| - Attribute keys         |                                                     |
|                          | Virtualized/scrolling body                          |
+--------------------------+-----------------------------------------------------+
```

Desktop rules:

- Facet rail width is 260px. It collapses to a `Filters` drawer below 1024px.
- The trace table fills remaining height and owns vertical scrolling.
- The table header is sticky inside the table scroll container.
- The page body itself must not scroll in the populated state.
- Facet groups are collapsible. Open/closed state is browser-local presentation state.

### History And Live Modes

The route header contains a neutral segmented control with two modes:

- `History`: default mode. Uses `Query.traces` and `Query.telemetryFacets`.
- `Live`: subscribes to project-scoped live trace events through the existing storage-read live-session GraphQL subscription path.

Mode state is URL state: `mode=history` or `mode=live`. Omit `mode` to mean `history`.

Shared behavior:

- Both modes render the same trace table columns, row interactions, detail route, selected-row styling, filter chips, and facet/filter surfaces.
- Clicking a row in either mode opens `/traces/:traceId`.
- Returning from detail preserves mode and filters.
- Live mode must not create a second trace detail route or a second row component.
- Live mode must not duplicate frontend state for traces already loaded through the history table. The table owns one list state for the active mode only.

History mode behavior:

- Time range controls may include closed ranges such as `Last 30 minutes`, custom start/end, and presets.
- Refresh performs a normal refetch.
- Facets use `Query.telemetryFacets`.

Live mode behavior:

- The table is append/prepend updated from live trace events using the same row view model shape used by history rows.
- Header actions are `Pause`, `Resume`, `Clear buffer`, and `Copy live URL` when useful. `Refresh` is hidden or disabled because the subscription owns updates.
- `Pause` stops rendering new rows but keeps the subscription open when the backend subscription supports buffering; otherwise it closes the subscription and shows `Paused`.
- `Resume` restarts or resumes the subscription with the same server filters.
- `Clear buffer` clears only the client-visible live table buffer and does not delete stored traces.
- Live table buffer is bounded to 500 visible traces by default. When the limit is reached, the oldest non-selected rows are dropped from the visible buffer.
- Live mode shows stream status in the header: connecting, live, paused, reconnecting, error. Status changes are announced to assistive technology.
- Time control in live mode is not a closed historical range. It is either hidden or replaced by live window presets such as `Now`/`Last N minutes` only if supported by `LiveTraceInput`.
- Live mode applies server-side filters through the live subscription input. The frontend does not locally filter a broader live stream except for presentation-only text highlighting already backed by loaded rows.
- Facets may remain visible only when backed by historical `telemetryFacets`; they must be labeled as historical facets if shown in live mode. Do not imply they are live aggregate counts unless a backend contract provides live facets.
- Live mode does not compute local aggregate counts.

### Trace Row Visualization

Each trace row contains only high-signal scan data:

- service marker: colored square plus service name;
- operation/root span name as the primary row label;
- trace ID monospace chip with copy action;
- started time;
- duration text and a compact duration bar scaled from backend-provided duration using the loaded page's maximum duration as presentation-only local scale;
- status badge with icon and text;
- span count, error count, log count, and service count as compact numeric cells.

The duration bar is presentation only. It must never be used to rank or filter traces locally. Sorting uses GraphQL variables and storage-read semantics.

Row interactions:

- clicking the row opens `/traces/:traceId`;
- copy trace ID and copy URL actions do not trigger row navigation;
- keyboard focus moves row by row;
- pressing `Enter` on a focused row opens the trace;
- active filters remain encoded in the URL when navigating away and back.

### Filter And Facet Behavior

Primary filters stay inline:

- time range;
- service;
- status;
- duration range;
- free-text query.

Advanced filters open from `More`:

- operation/span name;
- attribute filters;
- sort;
- trace ID exact match.

Facet suggestions come only from `Query.telemetryFacets`. Manual entry remains available when facets are empty or unavailable. Facets show value, bounded count, selected state, and a right-aligned count. Selecting a facet updates URL state and refetches `Query.traces`. Clicking an already selected facet clears that one facet filter and preserves all other active filters.

### States

- Loading: skeleton rows preserve table height and column widths.
- No telemetry: primary action `Copy OTLP setup`.
- No filter results: show active chips and primary action `Clear filters`.
- Facet load failure: keep trace results visible and show a compact inline warning in the facet rail.
- Storage unavailable: show an inline problem panel with retry and problem code.

## `/traces/:traceId` Trace Investigation Workspace

### User Job

The user opens a trace to understand the request path, identify the slow/error span, inspect exact evidence, and pivot to logs or linked traces without losing trace context.

Trace detail is a separate route-level page, not a drawer, overlay, or modal on top of trace search. The detail workspace has too much URL state, scroll state, keyboard navigation, and span inspector behavior for an overlay. Clicking a trace row navigates to `/traces/:traceId`; the `Back` action returns to `/traces` with the previous trace-search filters preserved by URL state.

### Desktop Layout

```text
+--------------------------------------------------------------------------------+
| Trace waterfall workspace                         | Span inspector             |
| Navigation row: back + Traces / trc_92ad6f        | Selected span title        |
| Header: trace context, search, filters            | Resizable panel            |
| View switch: Waterfall / Flow / Fullscreen        | Tabs                       |
| Timeline ticks: 0% 25% 50% 75% 100%               | Attributes Events          |
| Tree rows: service/name/status/duration/timeline  | Exceptions Links           |
| Virtualized row body                              | Tab content scrolls here   |
| Horizontal resize handle                          |                            |
| Logs below waterfall: selected span / whole trace | Tab content scrolls here   |
+---------------------------------------------------+----------------------------+
```

Desktop proportions:

- waterfall min width: 640px;
- inspector default width is 420px and is horizontally resizable on desktop between 360px and 640px;
- inspector remains visible while the waterfall scrolls.

Mobile layout:

- route header remains compact;
- waterfall takes full width;
- selecting a span opens the span inspector as a bottom sheet.

### Trace Context

Trace detail uses the global detail navigation pattern above the trace detail headline:

- a left-aligned icon-only Back button appears first in the navigation row;
- the breadcrumb appears immediately after the Back button;
- the breadcrumb is `Traces / <traceId>`;
- Back and the `Traces` breadcrumb entry both return to `/traces` with previous filters preserved by URL state.

The Back action must not appear again in the trace toolbar. The route toolbar is reserved for actions on the current trace view, such as view mode, fullscreen, and span filters.

Trace identity is shown inside the waterfall header as compact context, not as a separate summary card above the timeline.

The header context contains:

- trace ID;
- operation/root span name;
- status;
- total duration;
- started time;

The trace detail page must not add a separate service-percentage strip above the waterfall. Service-level information belongs in the span rows, span inspector, or a future explicitly specified service-breakdown section. Do not invent unlabeled percentage cards such as `checkout-api 68%` without a contract that defines the denominator and user action.

### Trace View Modes

The trace detail workspace has two synchronized view modes:

- `Waterfall`: default view. Shows the virtualized tree-first waterfall table.
- `Flow`: alternate view. Shows an interactive trace flow map for high-level path comprehension.

The flow map is not embedded inline above the waterfall by default. Users switch to it through the view mode control in the waterfall header. The flow view can also open in a fullscreen overlay from the fullscreen control. Fullscreen is a route-local overlay, not a browser fullscreen API requirement for MVP.

The flow map visualizes the current trace's service/span path as a graph. It is not a service topology graph and not an editable graph. The layout must support branching, converging, and fan-out paths; it must not assume a single left-to-right chain.

Purpose:

- let the user understand the high-level request path before reading dense waterfall rows;
- show where errors, exceptions, events, span links, and log-correlated spans occur;
- provide a fast visual selection surface synchronized with the waterfall and span inspector.

Behavior:

- switching between `Waterfall` and `Flow` preserves selected span, filters, inspector state, and logs scope;
- clicking a node selects the represented span, updates `spanId`, highlights the waterfall row, and updates the span inspector;
- keyboard focus follows the same selection behavior as waterfall rows;
- selected node, selected waterfall row, and inspector title must always refer to the same span;
- nodes use compact service/span labels, duration, and status text;
- ok status renders as plain `ok` text with no colored background;
- error status renders as red text and an error marker, with no pill background;
- event, exception, link, and log indicators render as small icon/marker affordances on the node;
- the flow map is generated from the trace detail GraphQL view model and must not require a new frontend graph query.
- the graph canvas is pannable by pointer drag and keyboard-scrollable when focused;
- zoom controls provide zoom in, zoom out, and reset, bounded between 65% and 160%;
- panning and zooming are presentation state only and must not alter URL state;
- fullscreen flow mode keeps the same node selection, zoom controls, pan behavior, and inspector synchronization.

Dependency rule:

- The first implementation uses owned React/SVG/CSS primitives or the existing visualization stack.
- Do not add `@xyflow/react`/React Flow for this trace-local map unless a later spec replaces this rule. React Flow is better suited to editable or large graph canvases; this map is an immutable trace visualization that must stay tightly synchronized with URL state, waterfall virtualization, and the span inspector.

### Waterfall Visualization

The waterfall is the primary trace visualization. It uses `TraceTreeWaterfall` from the visualization foundation spec and renders a tree-first timeline.

Row columns:

- expand/collapse action;
- depth indentation;
- service marker and service name;
- span name;
- status/kind markers;
- duration text;
- timeline bar.

Timeline details:

- sticky timeline header shows relative ticks at 0%, 25%, 50%, 75%, and 100%;
- bars are scaled against trace duration using percentages;
- selected span uses a high-contrast outline and selected row background;
- focused span uses focus ring without changing selection;
- critical path spans show a distinct left rail marker and bar accent;
- ok spans show plain `ok` text without a badge or background;
- error spans show red `error` text, status marker, and error icon without a badge background;
- event markers are small ticks on the bar;
- exception markers are error ticks;
- link markers appear at the row edge;
- exact-span log markers appear beside row metadata.

The timeline must never place text labels over bars. Labels live in metadata columns before the timeline column.

### Waterfall Controls

Controls live in the waterfall header:

- text search input;
- filter icon button opening the span filter dialog;
- expand selected path;
- collapse to selected path;
- expand all visible when visible rows are at most 2,000;
- density toggle: compact/comfortable;
- copy trace URL.

The filter dialog contains only span-level filters:

- text search;
- service;
- span name;
- status;
- duration min/max;
- errors only;
- critical path only;
- matches only;
- attribute filters.

Ancestors needed for matched descendants remain visible and are visually muted. Collapse/expand state must not erase URL state.

### Span Inspector

The inspector visualizes the selected span. It is the place for selected-span metadata, attributes, events, exceptions, and links. It is horizontally resizable on desktop and becomes a bottom sheet on mobile.

The inspector does not need a separate `Overview` tab. Summary facts belong in the inspector header and compact summary area so the default tab can be immediately useful.

Inspector header and summary area:

- two-column fact grid for span ID, parent span ID, service, kind, status, started, duration, depth, child count, critical path, orphan/missing-parent;
- copy controls for trace ID and span ID;
- warning callout when the span is orphaned, missing parent, or affected by clock skew.

Tabs:

- Attributes;
- Events;
- Exceptions;
- Links.

Attributes tab:

- attributes are an evidence browser, not an undifferentiated JSON dump;
- top area contains one empty search field with placeholder `Search attributes`. Do not prefill this field and do not place a copy-all button beside it in the default view;
- pinned semantic groups appear first when present, in this order: HTTP (`http.*`, `url.*`, `server.*`, `client.*`), RPC (`rpc.*`), database (`db.*`), messaging (`messaging.*`), AI (`gen_ai.*`), service/resource (`service.*`, `deployment.*`, `telemetry.sdk.*`, `host.*`, `process.*`), and security/user-safe identity fields only when already present in the view model;
- each semantic group has a compact header, count, and typed table rows;
- all unknown/custom keys remain available in a `Raw attributes` section after semantic groups;
- each default row is one compact line containing key, value preview, and a copy action at the right edge;
- do not show a type column in the default row. Type information may appear only in an expanded JSON/details row when it helps interpret nested data;
- do not show a per-row pivot/filter button in the default attributes list. Attribute filter creation belongs in the trace/span filter controls unless a later spec adds an explicit row action pattern;
- large strings and JSON/object/array values render collapsed with explicit expand action and copy raw value action. The expand action appears only for expandable values;
- raw values are rendered exactly as returned by GraphQL `JSON`; the frontend must not redact, rename, normalize, or infer hidden values;
- empty attributes show an inline empty state, not a blank panel;
- search matches across key and scalar value text, locally within the loaded span attributes only;

Attribute table behavior:

- Rows are grouped visually but keep one stable row component so keyboard navigation and copy actions work consistently.
- The semantic grouping is presentation-only. It does not change GraphQL variables, backend filters, or stored data.
- Attribute keys may contain dots, brackets, slashes, or vendor-specific prefixes. The UI treats them as opaque strings except for prefix-based grouping.
- Long keys and values truncate in the row and reveal full content in a popover or expanded row.
- Attribute rows never wrap into multi-line tables by default; expanded values use a monospace JSON/text viewer below the row.

Events tab:

- chronological event list by offset from span start;
- each event row shows offset, event name, attributes preview, and expand action;
- exception events also appear in Exceptions but remain visible here.

Exceptions tab:

- grouped by exception event;
- header shows exception type and message;
- stack trace renders parsed frames when available, raw stack text fallback always available;
- top application frame is highlighted only when returned or inferable from already-present span attributes; no source-map lookup is performed.

Links tab:

- link handling is project-scoped. A span link never grants access to another project and never triggers a cross-project lookup.
- table rows show direction, trace ID, span ID, trace state when present, attributes preview, and available action;
- same-trace links (`link.traceId === currentTraceId`) action is `Select span`; it updates `spanId`, selected waterfall row, flow node, logs, and inspector without route change;
- cross-trace links action is `Open trace`; it navigates to `/traces/:traceId?spanId=:spanId` in the current project and preserves the previous trace route as browser history;
- if the linked trace is not stored in the current project, expired by retention, unauthorized, or otherwise unavailable, the target trace page shows the standard missing-trace state with copied reference actions. The frontend must not silently search other projects or global storage;
- all links have `Copy reference`, copying trace ID, span ID, direction, trace state, and link attributes;
- links with attributes use the same attribute evidence browser pattern as span attributes, scoped to the selected link;
- the Links tab groups rows by `same trace`, `project trace reference`, and `unavailable after navigation` only when that state is known from current route context or the attempted target load. Without a successful lookup, cross-trace links are labeled `trace reference`, not `stored`.

Linked trace/span visualization:

- waterfall rows with one or more links show a compact link marker at the row edge;
- flow graph nodes with links show a compact link count marker;
- selecting a linked node or row keeps the inspector open and switches the inspector tab to Links only when the user explicitly clicks the link marker. Plain row/node selection keeps the current inspector tab;
- fullscreen flow mode uses the same link markers and selection behavior.

### Trace Logs Panel

Logs are not a span-inspector tab. They live below the waterfall so users can scroll the waterfall, select a span, and immediately see corresponding logs without leaving the timeline context.

The waterfall/table area and logs area are separated by a horizontal resize handle on desktop. Default proportions are approximately 70% waterfall and 30% logs. The user may resize the split between 45/55 and 85/15. Mobile stacks the logs panel below the waterfall without a draggable handle.

The logs panel has two modes:

- `Selected span`: exact span logs first, then trace logs directly associated with the selected span when available.
- `Whole trace`: all logs for the trace, grouped by timestamp and severity.

Rules:

- Selecting a span in the flow map or waterfall updates the `Selected span` log list.
- The logs panel remains vertically scrollable independent from the waterfall row body.
- Each log row shows timestamp offset from trace start, severity, service, body preview, trace/span chips, and expand action.
- Expanding a log row shows full JSON body and attributes.
- Open-log actions can pivot to `/logs` with trace/span filters.

### Trace Detail States

- Missing trace: show not-found state with back to trace search.
- Missing parent spans: keep affected spans in a deterministic missing-parent group and show warning.
- Missing root: show the earliest span as root candidate only when the backend marks the condition.
- Clock skew: show warning when backend returns skew warning; do not recompute skew in frontend.
- Large trace: hide expand-all visible above 2,000 rows and show compact large-trace note.

## Metrics, Logs, And Dashboards Route Ownership

`/metrics` is no longer a saved-view/dashboard route. The implementation-ready UX split is:

- `/logs`: searchable log table, selected-log inspector, and trace/span pivots.
- `/metrics`: technical metric explorer for metric descriptors, `MetricSeriesInput`, aggregation previews, returned series, and exemplars.
- `/dashboards`: saved visual composition workspace using dashboard rail, widget grid, and widget inspector/editor.

The source of truth for those routes is [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md). Agents must not use older dashboard wording in this file to implement `/metrics` or `/dashboards`.

## Cross-View Pivots

Trace-to-metric pivots are limited to explicit links already present in view models. The frontend must not infer metric queries from trace attributes unless a future contract adds a backend-supported pivot.

Metric-to-trace pivots happen through metric exemplars only. Exemplar trace links preserve the selected project and open the trace detail route.

Trace-to-log pivots use trace ID and span ID filters on `/logs`.

Log-to-trace pivots open trace detail with optional `spanId`.

## URL State

Trace URL state:

- `/traces`: filters, sort, cursor, facet selections, and visible preset;
- `/traces/:traceId`: `spanId`, selected detail tab, span filters, density, and focused service filter.

Logs, metrics, and dashboards URL state is defined in [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md).

## Accessibility And Keyboard

Required keyboard behavior:

- trace table rows are reachable by keyboard and open with `Enter`;
- waterfall rows implement ARIA tree behavior from `TraceTreeWaterfall`;
- inspector tabs are keyboard reachable and preserve focus;
- trace visualizations expose accessible summaries and keyboard-reachable exemplar/link actions where present;
- trace visualizations do not require hover to understand current values;
- time range, filters, and facet rail are reachable in logical tab order.

## Implementation Acceptance

An implementation satisfies this concept only when:

- `/traces` renders the route header, filter bar, active chips, facet rail/drawer, and full-height trace table workspace without topbar telemetry tabs.
- `/traces/:traceId` renders as a separate route-level page with breadcrumb above the headline, waterfall view first, compact trace context in the waterfall header, view switch for Waterfall/Flow, fullscreen flow affordance, resizable span inspector, horizontal waterfall/log split, and logs below the waterfall.
- Waterfall row labels never overlap timeline bars at 320px, 390px, 1024px, or 1440px widths.
- Flow-map node selection, waterfall row selection, URL `spanId`, span inspector, and selected-span logs stay synchronized across view switches and fullscreen flow mode.
- `/logs`, `/metrics`, and `/dashboards` acceptance is defined in [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md).
- Trace and inspector empty/error/loading states preserve layout dimensions.
- All visible copy goes through the frontend translation layer.
- Playwright visual checks cover `/traces` and `/traces/:traceId` at desktop, tablet, and mobile widths.
