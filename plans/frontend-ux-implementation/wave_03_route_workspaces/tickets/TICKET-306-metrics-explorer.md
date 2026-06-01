---
id: TICKET-306
title: Metrics explorer
wave: 3
status: ready
parallel_group: feux_metrics
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/02-capabilities/metrics/query-metrics.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/metrics-route.tsx
  - apps/frontend/src/features/metrics
  - apps/frontend/test/metrics-route.test.ts
  - apps/frontend/e2e/metrics.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/02-capabilities/metrics/query-metrics.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/metrics-route.tsx
  - apps/frontend/test/metrics-route.test.ts
contract_readiness:
  status: ready
  required_contracts:
    - MetricSeriesInput
    - MetricDescriptor
    - MetricSeries
    - Exemplar
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Keep Metrics as the technical explorer with descriptor list, typed controls,
inspector tabs, exemplar pivots, and direct mapping to `MetricSeriesInput`.

## Context Digest

Dashboards own saved widget composition. Metrics owns technical exploration.
The frontend must not create compatibility surfaces named `MetricView`,
`metricView`, or `viewId`.

## Implementation Approach

Refactor Metrics route into list, controls, chart/table workspace, and
inspector areas using shared primitives. Remove stale compatibility cleanup
logic and move visible copy to i18n.

## Decision Ledger

- Metrics route is not dashboard editing.
- Controls map directly to `MetricSeriesInput`.
- Group-by uses descriptor attribute keys.
- Exemplars pivot to project-scoped traces/spans.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-004 through PEX-009, PEX-011, PEX-013,
PEX-014, PEX-015 plus metric query acceptance. This ticket owns metric list,
filters, inspector, exemplar actions, and stale compatibility removal.

## Contract Traceability

GraphQL metric names, descriptors, series, rich series, and exemplar contracts
are read-only from the frontend. No new metric compatibility contract is added.

## Tasks

1. Remove stale `viewId` cleanup and compatibility surfaces.
2. Add kind and temporality filters.
3. Render metric list rows with descriptor metadata and attribute key count.
4. Convert group-by to descriptor-key multi-select.
5. Add Descriptor, Attributes, Series, and Exemplars inspector tabs.
6. Add exemplar trace/span pivots and setup empty state.

## Acceptance

- Success path: users select metrics, filter by type, group by descriptor
  attributes, inspect series, and pivot from exemplars.
- Failure path: invalid backend combinations, no metrics, filtered empty data,
  denied access, and backend unavailable errors render inline states.
- No frontend-calculated aggregations are introduced.
- Static scan shows no `MetricView`, `metricView`, or `viewId` route residue.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Contract input mapping | metrics route tests |
| Inspector tabs | route tests |
| Exemplar pivots | interaction tests |
| Compatibility removal | static scan |
| Responsive layout | screenshots |

## Operational Path Coverage

Success path covers metric exploration and exemplar pivots. Failure path covers
invalid input combinations, empty states, denied access, and GraphQL errors.
Recovery path covers clear filters and setup link. Security/privacy keeps
project-scoped pivots. Observability/logging is test evidence.
Performance/resilience covers bounded chart and table layout. Data integrity
covers generated input shapes. Production/release uses typecheck, build, smoke,
and screenshots. Supply-chain impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/metrics-route.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "metrics"
rg -n "MetricView|metricView|viewId" apps/frontend/src/routes/metrics-route.tsx apps/frontend/src/features/metrics
```

## Non-goals

- No dashboard editor work.
- No metric query backend changes.
- No frontend aggregation DSL.

## Handoff

Pass compatibility scan and screenshots to `TICKET-309`.
