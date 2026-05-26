---
id: TICKET-101
title: Dashboard reducer layout and mapper foundation
wave: 1
status: ready
parallel_group: dashboard_foundation_serial
depends_on: []
blocked_by: []
spec_refs:
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/02-flows/metrics/dashboard-query.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/features/dashboards
  - apps/frontend/test/dashboard-layout.test.ts
  - apps/frontend/test/dashboard-draft-reducer.test.ts
  - apps/frontend/test/dashboards-ux.test.ts
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/02-flows/metrics/dashboard-query.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/features/dashboards
  - apps/frontend/src/lib/dashboard-contracts.ts
contract_readiness:
  status: ready
  required_contracts:
    - Dashboard
    - DashboardWidget
    - SaveDashboardInput
    - MetricSeriesInput
    - RichMetricSeriesInput
    - LogSearchInput
    - TraceSearchInput
    - LiveTraceInput
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Create the pure dashboard foundation modules for draft state, layout math, and
widget source mapping so later agents can work without duplicating behavior in
the route.

## Context Digest

Dashboard editing is local draft state until explicit save. Persisted layout is
12 columns. Narrow tablet is a 6-column projection. Mobile is stacked and uses
move up/down. Frontend renders GraphQL view models and must not derive telemetry
semantics. Rich metric creation/editing remains production-gated.

execution_semantics: in_process for reducer/layout/mapper functions; remote_service
only for callers that later pass mapped inputs to GraphQL.

## Implementation Approach

Update or create:

- `features/dashboards/dashboard-layout.ts`;
- `features/dashboards/dashboard-draft-reducer.ts`;
- `features/dashboards/widget-source-mappers.ts`;
- focused tests named in `write_scope`.

Keep modules free of React imports and GraphQL client imports. Mapper functions
return typed input objects and strip unsupported optional null fields according
to generated contracts.

## Decision Ledger

- Reducer state fields and actions come from `dashboard-implementation-contract.md`.
- Layout dimensions are fixed at 12 persisted columns, 72px row height, and 12px gap.
- Tablet projection is 6 columns and maps back to deterministic 12-column coordinates.
- Mobile stacked ordering sorts by `y`, then `x`, then existing order.
- Save serialization includes `id` and `version` only for mutable existing dashboards.
- Source mappers never compute rates, formulas, counts, joins, or correlation.

## Contract Traceability

- GraphQL SDL: `Dashboard`, `DashboardWidgetInput`, `SaveDashboardInput`, telemetry query inputs.
- Frontend contracts: `apps/frontend/src/lib/dashboard-contracts.ts` and generated UI contracts.
- Feature modules: dashboard implementation contract target module section.

## Tasks

1. Complete reducer state and actions for draft source, metadata, widgets, dirty markers, history, conflict, and discard.
2. Complete layout helpers for normalize, move, resize, compact, deterministic sort, 6-column projection, stacked ordering, and stacked reorder.
3. Add `widget-source-mappers.ts` for metric, rich metric read-only, log, trace, live trace, alert summary, and alert history inputs.
4. Add unit tests for reducer, layout, and mapper behavior.
5. Update source-string dashboard UX tests only for foundation module presence and route extraction expectations.

## Acceptance

- Reducer supports start new, duplicate, edit existing, update metadata, add, select, editor mode, widget data/display/threshold updates, duplicate, remove, move, resize, stacked reorder, undo, redo, save pending, save success, validation error, conflict, request discard, confirm discard, and cancel discard.
- Layout helpers never produce overlapping compacted layouts.
- Mapper tests prove unsupported optional null fields are stripped.
- Foundation modules have no React or GraphQL client imports.
- No backend, core, or contract files change.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Reducer actions and dirty state | `bun test apps/frontend/test/dashboard-draft-reducer.test.ts` |
| Layout bounds, compaction, projection, stacked reorder | `bun test apps/frontend/test/dashboard-layout.test.ts` |
| Source mapper typed inputs and null stripping | focused mapper tests under `apps/frontend/test` |
| No forbidden imports | static assertions in dashboard UX tests or focused import tests |
| No out-of-scope writes | `git diff --name-only` reviewed against `write_scope` |

## Verification

```sh
bun test apps/frontend/test/dashboard-layout.test.ts apps/frontend/test/dashboard-draft-reducer.test.ts apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
```

## Non-goals

- No route UI rewrite.
- No widget editor UI.
- No renderer extraction.
- No rich metric production enablement.

## Handoff

Later tickets consume reducer actions, layout helpers, and source mappers without
editing their public function contracts.
