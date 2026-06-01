---
id: TICKET-303
title: Trace search and live mode
wave: 3
status: ready
parallel_group: feux_traces
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/traces-and-metrics-ux-concept.md
  - specs/03-flows/observability/live-trace-subscription.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/traces-route.tsx
  - apps/frontend/src/routes/live-route.tsx
  - apps/frontend/src/features/traces
  - apps/frontend/src/features/telemetry/facet-panel.tsx
  - apps/frontend/src/lib/url-filters.ts
  - apps/frontend/test/live-route.test.ts
  - apps/frontend/src/features/telemetry/query-presets.test.ts
  - apps/frontend/e2e/traces.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/traces-and-metrics-ux-concept.md
  - specs/03-flows/observability/live-trace-subscription.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/traces-route.tsx
  - apps/frontend/src/routes/live-route.tsx
  - apps/frontend/src/features/traces
  - apps/frontend/src/features/telemetry
contract_readiness:
  status: ready
  required_contracts:
    - TraceSearchInput
    - TraceSummary
    - LiveTraceInput
    - LiveTraceEvent
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Move trace History and Live into one Traces workspace with shared table,
server-side filters, active chips, route-header controls, and project-scoped URL
state.

## Context Digest

Live trace receiving is a Traces mode. The frontend must not compute telemetry
aggregates. The storage-read subscription owns live filter matching and event
fanout.

## Implementation Approach

Refactor `/traces` mode state, retire route-visible live workspace chrome, share
table components across History and Live, and keep live controls in the route
header.

## Decision Ledger

- `/traces?mode=live` is the live UX entry.
- No sidebar Live item is added.
- `LiveTraceInput` carries live filters to GraphQL.
- Trace rows use generated view models only.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-002, PEX-004 through PEX-009, PEX-011,
PEX-013, PEX-014, PEX-015 plus live-trace-subscription flow acceptance. This
ticket owns trace search, live receiving, filter chips, and trace row actions.

## Contract Traceability

GraphQL `Query.traces`, `Subscription.liveTraces`, `TraceSearchInput`, and
`LiveTraceInput` are the only telemetry contracts used.

## Tasks

1. Add History and Live segmented mode in the Traces route header.
2. Reuse one trace table model for historical and live rows.
3. Remove route-visible preset strip and facet distribution chart.
4. Add operation/root span column, trace ID copy, duration bar, keyboard Enter,
   and copy URL actions.
5. Keep pause, resume, clear buffer, stream status, and copy live URL in the
   route header.
6. Add desktop and mobile route tests and screenshots.

## Acceptance

- Success path: users search traces, switch to Live, inspect rows, copy IDs and
  URLs, pause, resume, and clear the live buffer.
- Failure path: subscription failure, backend unavailable, permission denial,
  and incompatible filters render inline states with retry or correction.
- No frontend aggregate counts are introduced.
- No separate live nav route is introduced.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| History and Live mode state | route unit tests |
| Live GraphQL input filters | GraphQL client assertions |
| Trace table row actions | interaction tests |
| Responsive route layout | Playwright screenshots |
| No Live sidebar route | static scan |

## Operational Path Coverage

Success path covers historical and live trace browsing. Failure path covers
invalid filters, denied access, network errors, and subscription closure.
Recovery path covers retry, filter removal, pause/resume, and buffer clear.
Security/privacy keeps project-scoped IDs and no secret persistence.
Observability/logging is test evidence. Performance/resilience covers bounded
live buffer and stable table dimensions. Data integrity covers URL filter state.
Production/release uses typecheck, build, smoke, and screenshots.
Supply-chain impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/live-route.test.ts apps/frontend/src/features/telemetry/query-presets.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "traces"
```

## Non-goals

- No storage-read live matching changes.
- No new GraphQL fields.
- No trace-detail workspace work.

## Handoff

`TICKET-309` validates final route matrix evidence after this route passes
desktop, tablet, and mobile checks.
