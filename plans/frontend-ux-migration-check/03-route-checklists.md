---
title: Frontend UX Route Checklists
status: approved-planning-input
updated: 2026-05-15
---

# Frontend UX Route Checklists

Use these checklists during implementation review. A route is not complete until every relevant item is checked in tests or visual QA.

## Global Shell

- [ ] Topbar remains visible on every authenticated route.
- [ ] `/projects` has no telemetry sidebar entries.
- [ ] Project workspace sidebar order is `Overview`, `Traces`, `Logs`, `Metrics`, `Dashboards`, `AI Eval` when enabled, then separated `Project settings`.
- [ ] `Live` is not a sidebar entry.
- [ ] Dashboard pins appear above primary navigation only when returned by dashboard contracts.
- [ ] Dashboard children under `Dashboards` are collapsible.
- [ ] Mobile has a menu sheet with company/project switcher first.
- [ ] Project settings routes keep project context navigation.
- [ ] Topbar, sidebar, content, workspace, and inspector scroll independently.
- [ ] All icon-only buttons have accessible labels and tooltips.
- [ ] No route-primary workspace uses shadcn `Card`.
- [ ] No visible copy is hard-coded in changed route files.

## `/projects`

- [ ] Centered project picker with search, company context, project cards, and create action.
- [ ] Project cards use flat borders, stable dimensions, and one primary action.
- [ ] Local company displays as `Personal`.
- [ ] No multi-company/admin affordances appear in local-only mode.
- [ ] No decorative cards, stat dashboards, or telemetry route nav appear before selection.
- [ ] Empty state has exactly one primary action.

## `/projects/:projectId`

- [ ] Project home shows concise status/readiness and onboarding checklist.
- [ ] Checklist has one primary action per step.
- [ ] Checklist does not duplicate project summary counts.
- [ ] Setup action links to project ingest settings.
- [ ] `Watch live` opens `/traces?mode=live`.
- [ ] Completion states are derived from GraphQL read models only.

## Project Settings

- [ ] Breadcrumb row appears above headline.
- [ ] Settings secondary rail does not replace global project sidebar.
- [ ] Ingest setup is a single concise page.
- [ ] API key creation requires a title.
- [ ] Newly created full key is shown once with copy.
- [ ] Stored keys show only preview/title/created/last-used/status.
- [ ] Revoke requires confirmation dialog.
- [ ] Retention policy and project members use generated backend contracts; retention deletion execution is clearly described as pending storage-maintenance support.

## `/traces`

- [ ] Header contains `History`/`Live` segmented mode.
- [ ] Refresh is icon-only in History mode with tooltip.
- [ ] Live mode shows stream status, pause/resume, clear buffer, and copy live URL.
- [ ] Both modes use the same trace table row component.
- [ ] Trace table columns include service, operation/root span, trace ID, started, duration, status, spans, errors, logs, services.
- [ ] Trace ID has copy action.
- [ ] Duration includes compact bar and text.
- [ ] Row click and keyboard `Enter` open detail.
- [ ] Active filter chips are individually removable.
- [ ] Facets are suggestions only and do not replace manual entry.
- [ ] No route-visible preset strip or extra facet distribution chart.
- [ ] No telemetry empty state links to project ingest settings.

## `/traces/:traceId`

- [ ] Back button and breadcrumb row sit above headline.
- [ ] Back and `Traces` breadcrumb preserve trace search URL state.
- [ ] Trace context is compact inside the waterfall header.
- [ ] Waterfall is the default and first primary visualization.
- [ ] Waterfall/Flow switch is available.
- [ ] Flow view supports branching graph layout, pan, zoom in/out/reset, and fullscreen overlay.
- [ ] Flow node selection syncs URL `spanId`, waterfall row, inspector, and logs.
- [ ] Span status: ok is plain text; error is red text plus marker/icon; no pill backgrounds.
- [ ] Logs are below waterfall in a horizontal split.
- [ ] Logs support `Selected span` and `Whole trace` modes.
- [ ] Inspector is resizable on desktop and bottom sheet on mobile.
- [ ] Inspector tabs are only Attributes, Events, Exceptions, Links.
- [ ] Attributes use compact evidence browser with semantic groups and raw fallback.
- [ ] Attribute rows have key, value preview, and copy action only.
- [ ] Links tab supports same-trace select, cross-trace open, unavailable reference, copy reference, and link attributes.
- [ ] No service-percentage strip appears above the waterfall.

## `/logs`

- [ ] Search-first large table layout.
- [ ] Filters include query, service, severity, trace ID, span ID, time range, and More filters.
- [ ] Active chips are removable independently.
- [ ] No permanent left service/facet rail.
- [ ] Right inspector is resizable on desktop and bottom sheet on mobile.
- [ ] Inspector tabs are Body, Attributes, Correlation.
- [ ] Body copy action is icon-only.
- [ ] Attributes use evidence browser pattern.
- [ ] Trace/span pivots open project-scoped trace detail.
- [ ] Selected log ID and inspector tab are URL state.
- [ ] Desktop does not duplicate inspector with inline row expansion.

## `/metrics`

- [ ] Metric list uses `Query.metricNames`.
- [ ] Metric list rows show name, description, kind, unit, temporality, monotonic, first/last seen, and attribute key count.
- [ ] Search, service, kind, temporality, and time controls map to GraphQL inputs.
- [ ] Metric selection is URL state.
- [ ] Query controls map directly to `MetricSeriesInput`.
- [ ] Group-by only allows descriptor attribute keys.
- [ ] Attribute filters do not invent dimensions outside descriptor keys.
- [ ] Inspector tabs are Descriptor, Attributes, Series, Exemplars.
- [ ] Exemplar trace/span links open trace detail.
- [ ] No `viewId` or MetricView compatibility remains.

## `/dashboards`

- [ ] Dashboard rail has search, pinned, built-in, personal, project, and create action.
- [ ] Pins use dashboard pin mutations, not localStorage truth.
- [ ] Header has one primary action and utilities in overflow as needed.
- [ ] Create/edit widget uses right inspector, not a modal.
- [ ] Delete and discard use confirmation dialogs.
- [ ] Built-in dashboards are read-only; edit creates a draft.
- [ ] Dirty draft state is visible.
- [ ] Widget editor has Data, Display, Thresholds groups.
- [ ] Supported widgets: metric time series, metric stat, metric table, log table, trace table, live trace table.
- [ ] Widget grid respects 12-column integer layout.
- [ ] Widget errors are local to widget, not full dashboard failure.
- [ ] No arbitrary JSON or executable widget config is stored.

## `/ai-eval`

- [ ] Feature-disabled state hides nav and direct route shows disabled state.
- [ ] Workspace uses route frame, left rail/tabs, main surface, and right inspector.
- [ ] Selected entity is URL state.
- [ ] Trace pivots preserve project context.
- [ ] No frontend score/cost/token/regression calculation beyond rendering GraphQL view models.
- [ ] No route-primary cards.

## Visual QA Matrix

Run visual checks at these widths:

- 390px mobile.
- 768px tablet.
- 1024px small desktop.
- 1440px desktop.

For each width verify:

- [ ] No overlapping text or controls.
- [ ] Long IDs truncate safely and have copy actions.
- [ ] Topbar remains visible.
- [ ] Sidebars become sheets or stay independently scrollable.
- [ ] Tables and timelines scroll inside their own containers.
- [ ] Error, loading, empty, and populated states keep stable dimensions.
- [ ] Standard controls use neutral shadcn styling.
- [ ] Color appears only for severity, chart series, graph relations, and warnings/errors.
