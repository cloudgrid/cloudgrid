---
id: TEC-FE-005
title: UI enhancements and visualization foundation
layer: frontend
status: draft
owner: unknown@example.com
updated: 2026-05-09
provenance: research-informed
---

# UI Enhancements And Visualization Foundation

## Goal

Improve CloudGrid's trace and log investigation UI with better navigation, faceted narrowing, and operational visualizations while preserving the product boundary: CloudGrid remains a focused trace/log investigation tool, not a general APM dashboard suite.

This spec converts the useful Monoscope research findings into CloudGrid-specific implementation requirements. It intentionally avoids copying Monoscope's all-in-one explorer surface, endpoint catalog, anomaly workflow, monitors, or reports into the MVP UI. Product-wide navigation and surface behavior are defined in `05-frontend/product-ux-concept.md`.

## Dependency Decision

Add `recharts` and the shadcn `chart` component for general chart rendering.

Reasons:

- shadcn's official chart component is built around Recharts and fits the existing shadcn/Tailwind/Radix setup.
- Recharts is React-first, TypeScript-friendly, SVG-based, MIT licensed, and actively maintained as of the 2026-05-09 research pass.
- The shadcn chart component keeps chart styling inside owned source code instead of introducing a separate visual design system.
- CloudGrid's near-term visualizations are compact operational charts, not million-point exploratory analytics.

Add `@tanstack/react-virtual` for large span/log/trace row virtualization.

Reasons:

- the existing UX spec requires virtualization above 500 spans;
- TanStack Virtual is headless, React 19-compatible, actively maintained, and lets CloudGrid keep table and waterfall markup aligned with shadcn/Tailwind styles.

Do not add Apache ECharts, Nivo, visx, uPlot, or `@xyflow/react` in this wave.

- Apache ECharts is powerful and maintained, but it brings a separate option/theme model and is only appropriate if metrics dashboards later outgrow Recharts.
- Nivo is a broader chart suite but does not align as directly with shadcn's chart component path.
- visx is useful for custom SVG systems, but React 19 support is not the stable default package path in the reviewed version.
- uPlot is excellent for dense time-series performance, but its React wrapper surface is smaller and less aligned with shadcn composition.
- `@xyflow/react` is a good future candidate for interactive service topology diagrams, but service topology is deferred until CloudGrid has a service graph contract.

Do not add `react-arborist`, `react-accessible-treeview`, `shadcn-treeview`, `react-virtuoso`, or `react-window` for the trace waterfall in this wave.

Research notes from the 2026-05-09 pass:

- `react-arborist` is active, MIT licensed, virtualized, and well suited to file-explorer trees, but it brings drag/drop, rename, controlled tree mutation, and its own tree state model that CloudGrid does not need for immutable trace spans.
- `react-accessible-treeview` and shadcn tree wrappers provide useful ARIA tree behavior, but they do not solve synchronized timeline bars, row virtualization, minimap selection, URL state, or trace-specific filtering.
- `react-virtuoso` and `react-window` are maintained virtualization options, but CloudGrid already selected TanStack Virtual because it is headless, React 19-compatible, and composes cleanly with custom shadcn/Tailwind row markup.

The trace waterfall must therefore be a custom CloudGrid component built on owned view-model code, shadcn primitives, Tailwind tokens, and `@tanstack/react-virtual`. This keeps the dependency surface small while still using a maintained virtualization primitive for the hard performance problem.

## Required shadcn Components

Install or verify these shadcn components before implementation:

- `chart` for Recharts theming, tooltip, and legend composition.
- `command` for app-wide command/search navigation.
- `sheet` for mobile span/log detail surfaces.
- `tooltip` for icon-only rail buttons and visualization controls.
- `toggle-group` for chart mode, table/tree mode, and binary view toggles where appropriate.
- `popover` for filter menus and query preset libraries.
- `badge`, `button`, `card`, `collapsible`, `input`, `resizable`, `scroll-area`, `select`, `separator`, `skeleton`, `table`, and `tabs` remain the base components for the existing telemetry UI.

All component additions must use the project package runner and shadcn CLI. Imported components must use the configured aliases from `apps/frontend/components.json`.

## Visualization Tokens

Visualization code must use semantic CSS variables and `DESIGN.md` tokens:

- chart series colors use `--chart-1` through `--chart-5` mapped to CloudGrid service/severity colors in `apps/frontend/src/styles.css`;
- status and severity markers use existing `success`, `warning`, `error`, and `info` tokens;
- selected trace/span state uses the `trace` token;
- charts must work in light and dark mode without hard-coded dark overrides;
- color is never the only status indicator.

Every fixed-format visualization must define stable dimensions with `height`, `min-height`, `aspect-ratio`, or grid constraints so loading, tooltip, marker, and label states do not resize the layout.

## Navigation Enhancements

### App Shell

The app shell has project selection mode and project workspace mode as defined in `05-frontend/product-ux-concept.md`.

Project selection mode shows no telemetry navigation.

Project workspace mode shows this primary navigation order:

- Overview
- Live
- Traces
- Logs
- Metrics
- AI Eval when enabled

Enhance the shell with:

- a compact project workspace topbar using the routes above;
- tooltips for icon-only navigation;
- visible active route state;
- keyboard reachable route controls;
- a command palette opened by `mod+k` and by a visible search/action button.

Do not add dashboard, endpoint catalog, monitor, report, or generic settings routes as primary telemetry navigation.

### Command Palette

The command palette is local UI state only. It does not add a backend search contract.

It must support:

- route actions: go to Traces, Logs, current trace detail when applicable;
- query actions: clear filters, copy current investigation URL, open GraphQL UI when enabled;
- preset actions: apply static trace/log query presets defined in frontend code;
- keyboard navigation and escape-to-close behavior.

Preset actions update URL state and existing GraphQL variables. They must not invent a KQL-like query language. Presets use the current GraphQL filter fields: service, status, severity, trace ID, span ID, time range, duration range, and attribute filters.

## Faceted Filtering Enhancements

Add a reusable `FacetPanel` for `/traces` and `/logs`.

Data source:

- `Query.telemetryFacets` only.
- Facets are suggestions and may be incomplete.
- Manual filter entry remains available when facets are empty.

Facet groups:

- service,
- operation,
- span name,
- severity,
- attribute key.

Behavior:

- facet values show count, label, and selected state;
- selecting a facet updates URL state and refetches the relevant route query;
- selected facets appear as removable filter chips;
- facet counts must be visually compact and right-aligned for scanning;
- facet groups are collapsible and preserve open/closed state in local UI state;
- no facet group may trigger unbounded raw payload scans.

The frontend must debounce facet refetches from text input. The debounce duration is 250 milliseconds.

## Query Presets

Add static, local query presets for common trace/log investigations:

- error traces;
- slow traces;
- logs with severity error or warn;
- logs correlated to a trace ID when one is present in context;
- spans with exceptions;
- service-specific filter from selected service context.

Preset definitions live in `apps/frontend/src/features/telemetry/query-presets.ts`.

Each preset defines:

- `id`,
- translated label key,
- target route (`traces`, `logs`, or `trace-detail`),
- GraphQL-compatible filter patch,
- optional required context keys.

Presets with missing required context are hidden, not disabled.

## Visualization Components

### `TelemetryChart`

`TelemetryChart` is the shared wrapper around shadcn `ChartContainer` and Recharts primitives.

Responsibilities:

- own CloudGrid chart config construction;
- provide consistent tooltip, legend, empty, loading, and error states;
- expose an accessible text summary below or beside the chart for screen readers;
- accept only already-shaped view-model data, not raw GraphQL result objects.

### Facet And Service Summary Scope

Trace, log, and metric routes use compact filter chips, tables, inspectors, and trace waterfall or
flow views as the primary analysis surface. Do not add route-level facet distribution charts or a
service-breakdown strip to the current UI. Facet values remain available through bounded filter
controls, and service contribution is represented through the selected trace's waterfall, flow view,
logs, attributes, and linked spans.

Future service topology diagrams may evaluate `@xyflow/react` after a service graph contract exists.
Until then, CloudGrid must not add a graph editor dependency for a visual that the backend cannot
populate.

### `TraceOverviewMinimap`

Shows a compact trace shape overview above the waterfall.

Data source:

- `TraceDetail.trace`,
- `TraceDetail.spans`,
- `TraceDetail.spanMatches`,
- `TraceDetail.structure.criticalPathSpanIds`.

Implementation:

- use custom React/SVG or CSS grid primitives, not Recharts;
- render total duration scale, selected span marker, error markers, critical-path markers, and search-match markers;
- stay synchronized with `spanId`;
- selecting a marker updates `spanId` without full navigation.

Rationale: a trace minimap is timeline and hierarchy-specific. Recharts is appropriate for aggregate charts, but the waterfall/minimap needs precise row and marker control.

Placement rule: do not stack `TraceOverviewMinimap` above `TraceTreeWaterfall` on the trace detail page when both present the same trace timeline selection, match, error, and critical-path information. Use the waterfall as the primary trace-detail timeline. A minimap may return later only as a distinct large-trace navigation control inside the waterfall surface, not as a separate card-like panel.

### `TraceTreeWaterfall`

The waterfall becomes a tree-first timeline component named `TraceTreeWaterfall`.

Required dependency:

- `@tanstack/react-virtual`.

Allowed UI primitives:

- shadcn `Button` for expand/collapse, row actions, and compact icon controls;
- shadcn `Tooltip` for icon-only controls and timeline markers;
- shadcn `ScrollArea` only when the implementation can pass the actual viewport element to TanStack Virtual; otherwise use a native scroll container with shadcn-compatible Tailwind styling;
- shadcn `Separator`, `Skeleton`, `Badge`, and `Sheet` for surrounding states and responsive detail presentation.

Do not use shadcn `Collapsible` for every virtualized row. Per-row collapsible components add unnecessary mounted state and can interfere with virtualization. Expansion state must live in a single `Set<spanId>` owned by `TraceTreeWaterfall`.

Do not use an off-the-shelf tree package for the trace waterfall. The component must own the trace-specific flattened-row model described below.

View-model input:

- `traceStartedAt`;
- `traceDurationMs`;
- `spansById`;
- `rootSpanIds`;
- `childrenByParentId`;
- selected span ID;
- matched span IDs;
- critical path span IDs;
- exact-log span IDs;
- span filter state.

Derived row model:

- build a stable depth-first list of visible rows from `rootSpanIds` and `childrenByParentId`;
- preserve ancestor rows for matched descendants and visually mute non-matching ancestors;
- include orphan spans under a deterministic `missing-parent` group row when the backend marks missing parents;
- include synthetic root-candidate handling only when the trace detail contract marks a missing root;
- each visible row includes `spanId`, `parentSpanId`, `depth`, `siblingIndex`, `childCount`, `isExpanded`, `hasVisibleChildren`, `isMutedAncestor`, `isSelected`, `isFocused`, `isCriticalPath`, `hasError`, `hasLogs`, `startOffsetPercent`, and `durationPercent`;
- sorting is stable by span start time, then sibling index, then span ID.

Rules:

- virtualize when visible span count exceeds 500;
- row height is stable at 32px unless `compact=false`, where it may be 40px;
- duration bars are CSS/SVG rectangles scaled against trace duration;
- event, link, log, error, critical-path, selected, and focus markers are separate visual affordances;
- text labels must not overlap duration bars at 320px width.

Tree interaction:

- default expansion opens the root path, the selected span's ancestor path, error-span ancestor paths, and critical-path ancestor paths;
- users can expand or collapse any span with children;
- expanding or collapsing must not change selected span unless the selected span becomes hidden, in which case selection moves to the collapsed parent and URL state updates to that parent span ID;
- search and filters must preserve context by keeping required ancestors visible;
- `Expand all visible` and `Collapse to selected path` actions are available for traces with at most 2,000 visible rows;
- for traces above 2,000 visible rows, `Expand all visible` is hidden and the UI shows a compact large-trace note.
- trace-detail span filters are available as a compact icon action in the waterfall header and open a shadcn `Dialog`; the filter dialog owns text, service, span name, status, duration, errors-only, critical-path-only, and matches-only controls.

Timeline layout:

- each row is a CSS grid with fixed metadata columns and a flexible timeline column;
- desktop grid columns are expand control, service, span name, status/markers, duration, timeline;
- mobile layout keeps expand control, span name, duration, and timeline; secondary metadata moves into row subtext or the detail sheet;
- the timeline header remains sticky inside the waterfall scroll container and shows relative ticks at 0%, 25%, 50%, 75%, and 100%;
- duration bars use transform/width styles derived from percentages and never use absolute pixel positions from raw timestamps in render loops;
- labels render before the timeline column and may not be placed over bars.

Keyboard and accessibility:

- the scroll container exposes `role="tree"` and `aria-label` from translated copy;
- rows expose `role="treeitem"`, `aria-level`, `aria-expanded` when expandable, `aria-selected`, and stable IDs;
- arrow up/down moves focus through visible rows;
- arrow right expands the focused row or moves to the first visible child;
- arrow left collapses the focused row or moves to the parent;
- `Enter` selects the focused row and updates `spanId`;
- `Home` and `End` move to the first and last visible rows;
- focus management must keep the focused row scrolled into view through the virtualizer.

Performance requirements:

- flattening and filtering are memoized and must not run per row render;
- row components are memoized by row identity and visual state;
- virtualizer overscan is 8 rows for compact mode and 5 rows for comfortable mode;
- the component must render no more than viewport rows plus overscan plus sticky headers for traces over 500 visible spans;
- rendering a synthetic fixture with 10,000 spans must keep the browser responsive enough for expand/collapse and keyboard navigation smoke tests.

Testing fixtures:

- balanced trace with 200 spans;
- deep trace with at least 100 nested levels;
- wide trace with at least 2,000 sibling spans;
- large trace with at least 10,000 spans;
- error-heavy trace with collapsed ancestors;
- orphan/missing-parent trace;
- clock-skew trace where child timing starts before parent.

### `LogTracePreview`

Logs with `traceId` may open a trace preview sheet instead of forcing immediate navigation.

Data source:

- `Query.trace(id, input: { selectedSpanId })`.

Rules:

- only render when a log row has `traceId`;
- preselect `spanId` when present;
- show trace summary, selected span summary, and a compact `TraceOverviewMinimap`;
- provide explicit links to open the full trace detail route;
- failed preview loads show inline retry and do not break the log row expansion.

## Table And Tree Modes

`/logs` and `/traces/:traceId` may expose a table/tree segmented control where both modes are supported by existing data.

For `/logs`:

- default remains table;
- tree mode groups visible loaded rows by trace ID when trace IDs are present;
- tree mode must label uncorrelated logs separately;
- tree mode does not fetch additional pages automatically.

For `/traces/:traceId`:

- default remains waterfall tree;
- table mode lists visible filtered spans with sortable columns for service, span name, status, start offset, duration, events, links, logs, and exceptions.

## Explicit Deferrals

Do not implement these in the UI enhancement wave:

- metrics dashboards;
- endpoint catalog;
- anomaly/issues workflow;
- monitors and alert builder;
- scheduled reports;
- persisted query library;
- natural-language query execution;
- service topology graph;
- Apache ECharts migration;
- local JSON or S3 storage UI.

Future service topology diagrams may evaluate `@xyflow/react` after a service graph contract exists. Until then, CloudGrid must not add a graph editor dependency for a visual that the backend cannot populate.

## Implementation Order

1. Add shadcn `chart`, `command`, `sheet`, `tooltip`, `toggle-group`, and `popover` components if absent.
2. Add `recharts` and `@tanstack/react-virtual` dependencies.
3. Add visualization tokens to `apps/frontend/src/styles.css`.
4. Implement `TelemetryChart` only for metric/dashboard widgets that need chart rendering.
5. Implement bounded facet-backed filters without route-level facet chart strips.
6. Implement command palette route and preset actions.
7. Implement `TraceOverviewMinimap` and custom virtualized `TraceTreeWaterfall`.
8. Implement `LogTracePreview`.
9. Add synthetic trace fixtures for 200, 2,000, and 10,000 span cases.
10. Add smoke, accessibility, and visual coverage for chart, facet, command palette, minimap, tree-waterfall, and preview states.

## Acceptance Criteria

- `FacetPanel` renders bounded facet values from `Query.telemetryFacets` and manual filter entry still works when facets are empty.
- Query presets update URL state and GraphQL variables without introducing a new query language.
- `TraceOverviewMinimap` selects spans and reflects selected span, errors, critical path, and search matches.
- `TraceTreeWaterfall` renders expandable/collapsible parent-child span rows while preserving a synchronized timeline column.
- `TraceTreeWaterfall` virtualizes traces over 500 visible spans with bounded DOM rows.
- `TraceTreeWaterfall` supports keyboard tree navigation, URL-synchronized selection, and ancestor-preserving filters.
- Log trace preview fetches `Query.trace` only for rows with trace IDs and degrades locally on error.
- All charts and diagrams support light mode, dark mode, keyboard access, and WCAG 2.2 AA contrast.
- No UI enhancement requires frontend access to NATS, Go services, OTLP collector routes, SurrealDB, S3, or local filesystem data.
- No off-the-shelf tree dependency is added for the trace waterfall without a new spec decision replacing this dependency decision.

## Verification

Default verification:

- `bun run --cwd apps/frontend typecheck`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke`
- `bun run contracts:check`

Visual verification must include Playwright screenshots at:

- 1440px desktop,
- 1024px tablet,
- 390px mobile,
- 320px narrow mobile.

Screenshots must cover:

- `/traces` with facet panel and preset chips,
- `/logs` with facet panel, chart mode, expanded log row, and trace preview,
- `/traces/:traceId` with service breakdown, minimap, waterfall, selected span, and detail sheet on mobile.
