---
id: TICKET-103
title: Shared metric controls and widget editors
wave: 2
status: ready
parallel_group: metric_controls
depends_on: [TICKET-101]
blocked_by: []
spec_refs:
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
write_scope:
  - apps/frontend/src/features/metrics
  - apps/frontend/src/features/dashboards/widget-editor
  - apps/frontend/test
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/dashboard-implementation-contract.md
  - apps/frontend/src/features/metrics/metric-explorer.tsx
  - apps/frontend/src/routes/metrics-route.tsx
  - apps/frontend/src/features/telemetry/telemetry-chart.tsx
  - apps/frontend/src/features/telemetry/service-multi-select.tsx
  - apps/frontend/src/lib/query-keys.ts
contract_readiness:
  status: ready
  required_contracts:
    - MetricDescriptor
    - MetricSeriesInput
    - MetricAggregation
    - MetricChartType
    - DashboardWidgetInput
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Extract shared Metrics controls and implement complete non-rich dashboard widget
editors with exact `Data`, `Display`, and `Thresholds` groups.

## Context Digest

`/metrics` is the technical explorer. `/dashboards` is the saved composition
workspace. Metric query semantics are identical where controls overlap, so
dashboard metric widgets reuse the metric explorer controls and helpers.

execution_semantics: in_process for React controls; remote_service only for
callers that execute GraphQL queries.

## Implementation Approach

Move reusable metric query controls from `metric-explorer.tsx` into a shared
feature module under `features/metrics`. Build dashboard editor components under
`features/dashboards/widget-editor`. Shared controls accept typed props and
callbacks and do not read URL search params.

## Decision Ledger

- Metric name, aggregation, group-by, filters, interval, sort, chart type, and
  `MetricSeriesInput` behavior use shared Metrics code.
- Dashboard editor groups are exactly `Data`, `Display`, and `Thresholds`.
- Thresholds are hidden for log, trace, live trace, and alert widgets.
- Rich metric creation/editing controls stay hidden or disabled with the approved reason.
- Editor changes dispatch reducer actions and do not save until dashboard save.

## Contract Traceability

- Metric controls map to `MetricSeriesInput`.
- Log controls map to `LogSearchInput`.
- Trace controls map to `TraceSearchInput`.
- Live controls map to `LiveTraceInput`.
- Alert controls map to alert summary/history inputs.

## Tasks

1. Extract shared metric controls and helpers from the metric explorer.
2. Update `/metrics` to use the extracted controls without changing semantics.
3. Implement dashboard widget editor modules for metric, log, trace, live trace, and alert widgets.
4. Add tests proving `/metrics` and dashboard metric widgets produce equivalent metric inputs from equivalent state.
5. Add tests proving editor group names and rich metric gate behavior.

## Acceptance

- Dashboard metric widgets and `/metrics` share metric controls.
- Non-rich widget editors expose all controls listed in the dashboard implementation contract.
- Editor components are under `features/dashboards/widget-editor`.
- Shared metric controls do not depend on URL search params.
- Rich metric editor remains gated.
- No backend, core, or contract files change.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Shared metric controls | import/source tests and focused component tests |
| Equivalent metric input | unit test comparing dashboard and `/metrics` state conversion |
| Editor groups | `dashboards-ux.test.ts` |
| Rich metric gate | `dashboards-ux.test.ts` |
| Type safety | `bun run --cwd apps/frontend typecheck` |

## Verification

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

## Non-goals

- No route mode rewrite.
- No widget renderer extraction.
- No storage-read or BFF work.
- No rich metric production enablement.

## Handoff

The route can mount editor modules through drawer/sheet composition and dispatch
reducer actions from editor callbacks.
