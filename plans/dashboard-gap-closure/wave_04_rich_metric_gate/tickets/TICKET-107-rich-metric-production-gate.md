---
id: TICKET-107
title: Rich metric production gate enforcement
wave: 4
status: ready
parallel_group: rich_metric_gate
depends_on: [TICKET-102, TICKET-103, TICKET-104]
blocked_by: []
spec_refs:
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/02-flows/metrics/dashboard-query.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
write_scope:
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/features/dashboards
  - apps/frontend/test/dashboards-ux.test.ts
  - specs/05-frontend/dashboard-implementation-contract.md
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/02-flows/metrics/dashboard-query.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/features/dashboards
contract_readiness:
  status: ready
  required_contracts:
    - DashboardRichMetricWidgetInput
    - RichMetricSeriesInput
    - RichMetricSeriesResult
    - Query.richMetricSeries
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Enforce the rich metric production gate after dashboard frontend decomposition.
This ticket does not enable production creation or editing.

## Context Digest

The machine contracts include rich metric widget and query shapes, but the full
production gate requires formula function coverage, generated contract checks,
storage-read execution, BFF forwarding, typed frontend controls, and focused
tests. Until all gate evidence exists, production UI hides creation/editing.
Saved rich widgets may render read-only through `Query.richMetricSeries`.

execution_semantics: in_process for frontend gate rendering; remote_service for
read-only `Query.richMetricSeries` calls.

## Implementation Approach

Audit final dashboard route/editor/renderer state and enforce a single gate
constant or feature flag path in dashboard feature code. Tests prove creation
and editing controls are hidden while read-only saved rendering remains allowed.
Update the dashboard implementation contract only to record exact gate evidence
locations created by this ticket.

## Decision Ledger

- Production add-widget UI hides `metric_rich`.
- Production rich metric editor controls are hidden or disabled with an explicit unavailable reason.
- Saved rich metric widgets render read-only through `Query.richMetricSeries`.
- Unsupported contract state renders when read-only query support is unavailable.
- No frontend fallback combines multiple `Query.metricSeries` responses.
- Full production enablement is a later multi-boundary plan after gate evidence exists.

## Contract Traceability

- GraphQL: `DashboardRichMetricWidgetInput`, `RichMetricSeriesInput`, `RichMetricSeriesResult`, `Query.richMetricSeries`.
- AsyncAPI: rich metric storage-read request/reply schemas.
- Frontend: dashboard implementation contract rich metric gate section.

## Tasks

1. Centralize the production rich metric editing gate in dashboard feature code.
2. Remove production creation and edit paths for `metric_rich`.
3. Preserve read-only rendering of saved rich metric widgets.
4. Add unsupported-contract state for unavailable read-only support.
5. Add tests proving no frontend formula execution and no multi-query frontend fanout fallback exists.
6. Update the implementation contract with gate evidence paths from this ticket.

## Acceptance

- Production UI cannot create a rich metric widget.
- Production UI cannot edit rich metric query rows, formulas, or display series.
- Saved rich metric widgets render read-only when `Query.richMetricSeries` is available.
- Unsupported-contract state appears when read-only support is unavailable.
- Tests reject frontend formula execution and frontend multi-query fanout fallback.
- `bun run contracts:check` is run when this ticket touches contract or generated files.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Creation hidden | `dashboards-ux.test.ts` |
| Editing hidden | `dashboards-ux.test.ts` |
| Read-only saved rendering | focused renderer/source test |
| Unsupported-contract state | focused renderer/source test |
| No frontend formula execution | source test rejecting `eval`, `new Function`, and formula executor helpers |
| Contract drift | `bun run contracts:check` for contract changes |

## Verification

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

Run for contract or generated changes:

```sh
bun run contracts:check
```

## Non-goals

- No storage-read formula implementation.
- No BFF resolver changes.
- No GraphQL or AsyncAPI shape changes.
- No production rich metric editing enablement.

## Handoff

A future rich metric enablement plan must split work by contracts,
storage-read, BFF, and frontend boundaries and may remove this gate only after
all gate evidence passes.
