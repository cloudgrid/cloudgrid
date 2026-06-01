---
id: TICKET-304
title: Trace detail workspace
wave: 3
status: ready
parallel_group: feux_trace_detail
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/traces-and-metrics-ux-concept.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/trace-detail-route.tsx
  - apps/frontend/src/features/traces
  - apps/frontend/test/trace-detail-route.test.ts
  - apps/frontend/e2e/trace-detail.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/traces-and-metrics-ux-concept.md
  - specs/03-contracts/graphql/public-schema.graphql
  - plans/frontend-ux-concepts/traces-metrics-ux.html
  - apps/frontend/src/routes/trace-detail-route.tsx
  - apps/frontend/src/features/traces
contract_readiness:
  status: ready
  required_contracts:
    - TraceDetail
    - Span
    - SpanEvent
    - SpanLink
    - LogEvent
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Make trace detail a focused investigation workspace with waterfall, flow graph,
logs split, selected-span inspector, compact evidence browser, and synchronized
URL span state.

## Context Digest

Waterfall is the primary trace detail workspace. Flow graph is an alternate
view with pan, zoom, reset, fullscreen, and span selection sync. Inspector tabs
are Attributes, Events, Exceptions, and Links.

## Implementation Approach

Refactor trace detail route around shared route frame and split workspace,
replace raw JSON attribute display with evidence browser components, and add
tests for span selection, links, logs scope, and view sync.

## Decision Ledger

- Waterfall remains first in the route.
- Trace identity lives in the waterfall header.
- Logs panel supports selected span and whole trace scopes.
- Linked trace pivots stay project-scoped.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-004 through PEX-009, PEX-011, PEX-013,
PEX-014, PEX-015 plus trace-detail UX acceptance. This ticket owns trace detail
selection, inspector, flow graph, logs scope, and evidence browsing.

## Contract Traceability

GraphQL trace detail and related log view models are read-only. The route does
not create new telemetry queries outside the SDL.

## Tasks

1. Add breadcrumb and back row above trace headline.
2. Move trace identity to the waterfall header.
3. Add Waterfall and Flow view switch with pan, zoom, reset, fullscreen, and
   span selection sync.
4. Add resizable waterfall and logs split.
5. Replace inspector tabs with Attributes, Events, Exceptions, and Links.
6. Add compact grouped searchable copyable evidence browser.
7. Add tests and visual checks for synchronized state.

## Acceptance

- Success path: selecting a span updates waterfall, flow graph, URL `spanId`,
  logs scope, and inspector.
- Failure path: missing trace, denied access, missing selected span, empty
  events, and empty links render stable states.
- Flow graph renders nonblank and remains interactive in fullscreen.
- No cross-project linked-trace search occurs.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Span selection sync | unit tests |
| Inspector tab content | route tests |
| Log scope switching | route tests |
| Flow graph rendering | Playwright pixel check |
| Project-scoped pivots | link action tests |

## Operational Path Coverage

Success path covers span investigation and pivots. Failure path covers missing
trace, empty related data, denied access, and GraphQL errors. Recovery path
covers back navigation and span reset. Security/privacy keeps project context
and no raw secret persistence. Observability/logging is test evidence.
Performance/resilience covers bounded graph rendering and resizable panes. Data
integrity covers URL span state. Production/release uses typecheck, build,
smoke, and screenshots. Supply-chain impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/trace-detail-route.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "trace-detail"
```

## Non-goals

- No trace search route work.
- No backend trace-detail query changes.
- No cross-project pivots.

## Handoff

Record flow graph and waterfall screenshots for `TICKET-309`.
