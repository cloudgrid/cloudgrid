---
id: TICKET-104
title: Widget source mappers and renderers
wave: 2
status: ready
parallel_group: dashboard_renderers
depends_on: [TICKET-101]
blocked_by: []
spec_refs:
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/02-flows/metrics/dashboard-query.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/features/dashboards/widget-renderers
  - apps/frontend/src/features/dashboards/widget-source-mappers.ts
  - apps/frontend/test
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/02-flows/metrics/dashboard-query.md
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/features/telemetry/telemetry-chart.tsx
  - apps/frontend/src/lib/query-keys.ts
contract_readiness:
  status: ready
  required_contracts:
    - MetricSeriesResult
    - RichMetricSeriesResult
    - LogSearchResult
    - TraceSearchResult
    - AlertSummary
    - AlertEvent
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Extract widget source mapping and renderer bodies from the dashboard route so
each widget kind has tested, reusable rendering and local state behavior.

## Context Digest

Dashboard widgets call the GraphQL surface matching their kind. Each widget
renders loading, empty, warning, and error states locally. Frontend may derive
display summaries from returned chart-ready series, but must not compute
telemetry query semantics.

execution_semantics: in_process for renderer output; remote_service only for
callers that provide GraphQL results.

## Implementation Approach

Use `widget-source-mappers.ts` from `TICKET-101` and create renderer modules under
`features/dashboards/widget-renderers`. Renderers receive typed result data,
presentation options, and action callbacks. Renderers do not call GraphQL.

## Decision Ledger

- Metric renderers use returned series only.
- Alert status uses `Query.alertSummary`; alert history and evidence use `Query.alertHistory`.
- Error state is widget-local.
- Copy actions do not change selection or navigate.
- Pivot actions preserve selected project context.
- Radial, radar, heatmap, and histogram remain hidden from creation until backend result shapes support them.

## Contract Traceability

- Renderer inputs map to GraphQL result types in `public-schema.graphql`.
- Query keys remain under `apps/frontend/src/lib/query-keys.ts`.
- Source mapper behavior traces to dashboard implementation contract persistence and renderer sections.

## Tasks

1. Create renderer modules for metric, rich metric read-only, log, trace, live trace, alert status, alert history, and alert evidence.
2. Move route renderer bodies into the modules.
3. Keep query hooks in the route or a route-owned composition layer.
4. Add renderer tests for loading, empty, warning, error, retry callback, and stable dimensions.
5. Add source tests proving no frontend aggregation helpers are introduced.

## Acceptance

- Route file no longer contains renderer bodies or source mapping logic.
- Each widget kind has a renderer module.
- Loading, empty, warning, and error states are widget-local.
- Renderers do not call GraphQL directly.
- Frontend does not aggregate telemetry semantics.
- No backend or core files change.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Renderer extraction | source assertions in `dashboards-ux.test.ts` |
| Local widget states | focused renderer tests |
| No GraphQL calls in renderers | import/source tests |
| No frontend telemetry aggregation | source tests rejecting forbidden helper names |
| Build compatibility | `bun run --cwd apps/frontend build` |

## Verification

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

## Non-goals

- No widget editor implementation.
- No route mode refactor.
- No pin UI work.
- No rich metric production enablement.

## Handoff

The route can compose query hooks with extracted renderers and mapper outputs
without owning widget rendering internals.
