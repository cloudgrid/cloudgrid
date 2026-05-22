---
id: TEC-FE-004
title: Frontend execution spec
layer: frontend
status: draft
owner: unknown@example.com
updated: 2026-05-09
provenance: implementation-breakdown
---

# Frontend Execution Spec

## Purpose

This is the implementation-ready breakdown for the next frontend wave. It translates the enterprise UX concept, trace investigation UX, GraphQL contract, and `DESIGN.md` into concrete screens and component work.

## Shared Foundations

Implement first:

- `AppShellModes`: project selection mode and project workspace mode exactly as defined in `05-frontend/product-ux-concept.md`.
- `WorkspaceTopbar`: CloudGrid identity, company/project switcher, project workspace navigation, command/help/user actions.
- `PageFrame`: route title, route actions, responsive content area, and one route-primary workspace surface.
- `CommandPalette`: local route, filter, preset, copy-link, and GraphQL-UI actions.
- `ProjectOnboardingChecklist`: project home checklist with browser-local collapsed/dismissed presentation state.
- `InspectorDrawer`: right-side desktop and bottom mobile sheet pattern for span/log/metric/setup/eval details.
- `FilterBar`: search input, facet-backed comboboxes, time range, duration range, status/severity selects, clear button, active filter chips.
- `FacetPanel`: bounded facet groups with counts from `Query.telemetryFacets`.
- `DataState`: loading skeleton, no telemetry, no filter results, inline error with retry, populated slot.
- `AttributeTable`: searchable key/value table, copy action, pivot action.
- `JsonInspector`: collapsed large object viewer with copy action.
- `CopyButton`, `StatusBadge`, `SeverityBadge`, `TraceIdChip`, `SpanIdChip`, `DurationText`, `TimestampText`.
- `TelemetryChart`: chart foundation for metric and dashboard widgets defined in `05-frontend/ui-enhancements-and-visualizations.md`.

All copy must use the translation layer. Components consume `apps/packages/ui-contracts` types only. Route-primary tables, trace waterfall, and metric grids must not be nested inside card components.

## `/projects`

Layout:

- Project selection mode topbar; no telemetry navigation.
- Main workspace split:
  - left/main project list grouped by company;
  - right setup panel with create/select/send/open steps.
- Local mode company label is `Personal`.

Behavior:

- Project selection calls `Mutation.selectProject`.
- Successful project selection navigates to `/projects/:projectId`.
- Project creation opens a drawer/sheet, validates inline, then selects the created project.
- No-project guard states link here.

Playwright states:

- no projects, single project, multiple companies, create drawer, project selection success, create validation error, no-project telemetry guard.

## `/projects/:projectId`

Layout:

- Project workspace topbar with `Overview` active.
- Header: project name, status, selected company, settings action.
- Main workspace:
  - project summary row;
  - onboarding checklist;
  - recent ingest/readiness section;
  - navigation actions to Traces, Logs, Metrics, Dashboards, and Evaluations when enabled.

Behavior:

- Checklist completion uses GraphQL read models when available.
- Dismissed/collapsed checklist state is browser-local presentation state.
- Setup opens the shared setup inspector drawer.

Playwright states:

- no ingest yet, traces/logs present, metrics present, AI Eval disabled, setup drawer open, checklist collapsed.

## `/traces`

Layout:

- Header: title "Trace search" and refresh action.
- FilterBar: `query`, `service`, `operationName`, `spanName`, `status`, `from`, `to`, `minDurationMs`, `maxDurationMs`, `attributes`, `sort`.
- Result table with columns: status, service, operation/root span, trace ID, start time, duration, spans, error spans, logs, services.

Behavior:

- URL state owns every filter and cursor.
- Row click navigates to `/traces/:traceId`.
- Trace ID chip copies without navigating.
- Sort changes reset cursor.
- Empty no-filter state differs from no-telemetry state.

Playwright states:

- loading, no telemetry, no filter results, error, populated, error trace row, long duration row.

## `/traces/:traceId`

Layout:

- Header: back to traces, service/root operation, status, duration, span count, error span count, log count, service count, start time, trace ID copy.
- Investigation toolbar: `spanQuery`, `spanService`, `spanName`, `spanStatus`, duration range, errors-only, critical-path-only, matches-only.
- Main split:
  - left/main: `TraceOverview` above `TraceTreeWaterfall`.
  - right/detail: `SpanDetailPanel`.
- Mobile: detail panel opens as a shadcn sheet after span selection.

Components:

- `TraceOverview`: service breakdown bars, critical path markers, error markers, selected span marker, search match markers.
- `TraceOverviewMinimap`: custom React/SVG or CSS trace overview synchronized with selected span and search matches.
- `TraceTreeWaterfall`: custom flattened trace tree plus timeline rows, expand/collapse, keyboard tree navigation, duration bars, event/link/log markers, selected/focus state, `@tanstack/react-virtual` virtualization above 500 visible spans.
- `SpanDetailPanel`: tabs `Overview`, `Attributes`, `Events`, `Exceptions`, `Links`, `Logs`.
- `StackTraceViewer`: parsed frames plus raw fallback.
- `RelatedLogsPanel`: groups exact span logs, trace logs, contextual logs.
- `TraceWarnings`: missing root, missing parent, clock skew, partial trace, large trace preview.

Behavior:

- `spanId`, active tab, and filters are URL state.
- Selecting a span updates `spanId` without full page navigation.
- Collapsing an ancestor of the selected span selects the collapsed ancestor and updates URL state.
- `Enter` selects focused span; arrow keys move among visible rows; left/right collapse/expand.
- Attribute pivot actions navigate to `/traces` or `/logs` with matching attribute filter.
- Log row with trace/span navigates to `/traces/:traceId?spanId=:spanId`.

Playwright states:

- loading, not found, error, populated, selected span, span with exception stack trace, span with links, related logs, missing parent warning, large trace virtualization smoke.

## `/logs`

Layout:

- Header: title "Log search", refresh action.
- FilterBar: `search`, `service`, `traceId`, `spanId`, `severity`, `from`, `to`, `attributes`, `sort`.
- Result table with columns: timestamp, severity, service, trace, span, body preview.
- Optional row-local `LogTracePreview` sheet for rows with `traceId`, using existing `Query.trace`.

Behavior:

- URL state owns every filter and cursor.
- Rows expand to full body and attributes.
- Trace/span chips navigate to trace detail when present.
- Sort changes reset cursor.

Playwright states:

- loading, no telemetry, no filter results, error, populated, correlated log, uncorrelated log, expanded JSON body.

## Responsive Rules

- Desktop `>= 1200px`: trace investigation uses persistent right detail panel.
- Tablet `768px - 1199px`: detail panel stacks below selected timeline summary or uses resizable sheet.
- Mobile `< 768px`: timeline full width; span details open in a sheet.
- No text may overlap bars, chips, buttons, or neighboring columns at 320px width.

## Implementation Order

1. Shared shell foundations, project selection mode, project workspace topbar, inspector drawer, command palette, shadcn chart/command/sheet/tooltip/toggle-group/popover components, Recharts, TanStack Virtual, visualization tokens, and URL filter helpers.
2. `/projects` project selection, project creation drawer, `/projects/:projectId` redirect to Traces, and project setup under `/projects/:projectId/settings/ingest`.
3. `/traces` table, filters, facet panel, and preset chips.
4. `/logs` table, filters, facet panel, row expansion, and trace preview.
5. Trace detail header, service breakdown, minimap, and virtualized tree waterfall.
6. Span detail tabs, stack traces, links, and related logs.
7. Metrics workspace view rail, panel grid, editor drawer, and dirty-state confirmation.
8. AI Eval workspace frame, section navigation, inspector drawers, and disabled/empty states.
9. Command palette and keyboard navigation polish.
10. Playwright smoke/accessibility expansion and no-nested-card checks.

## Verification

- `bun run --cwd apps/frontend typecheck`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke`
- `bun run verify`
