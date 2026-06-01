---
id: TICKET-305
title: Logs workspace
wave: 3
status: ready
parallel_group: feux_logs
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/04-backend/self-observability.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/logs-route.tsx
  - apps/frontend/src/features/logs
  - apps/frontend/test/logs-route.test.ts
  - apps/frontend/e2e/logs.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/04-backend/self-observability.md
  - specs/03-contracts/graphql/public-schema.graphql
  - plans/frontend-ux-concepts/logs-metrics-dashboards-ux.html
  - apps/frontend/src/routes/logs-route.tsx
  - apps/frontend/src/features/logs
contract_readiness:
  status: ready
  required_contracts:
    - LogSearchInput
    - LogEvent
    - TraceDetail
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Make Logs a normal project-scoped searchable table with URL-addressed selection,
right inspector, correlation actions, disabled-action reasons, and
self-observability inspection support.

## Context Digest

The Logs route reads GraphQL log view models. The self-observability project is
a normal project; service logs appear there through the same OTLP ingest path as
application logs.

## Implementation Approach

Refactor Logs route around shared table and inspector layout, store selected log
state in URL parameters, move copy to i18n, and add correlation actions with
explicit disabled reasons.

## Decision Ledger

- Inspector tabs are Body, Attributes, and Correlation.
- Desktop hides inline row expansion.
- Narrow layouts may use inline expansion for selection context.
- Missing trace/span correlation does not block log inspection.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-004 through PEX-009, PEX-011, PEX-013,
PEX-014, PEX-015 plus log UX and IR-009 UI acceptance. This ticket owns logs
selection, correlation pivots, and self-observability project visibility.

## Contract Traceability

GraphQL `Query.logs` and project-scoped trace pivot contracts are used without
frontend aggregation or enrichment.

## Tasks

1. Convert selected log and inspector tab to URL state.
2. Add Body, Attributes, and Correlation inspector tabs.
3. Add copy actions for log ID, trace ID, span ID, body, attribute key, and
   attribute value.
4. Keep filters in filter bar and active chips.
5. Disable missing-correlation trace actions with reason text.
6. Add desktop and mobile tests plus self-observability project inspection
   smoke coverage.

## Acceptance

- Success path: users search logs, select a row, inspect body and attributes,
  and pivot to trace/span when correlation exists.
- Failure path: missing correlation, backend unavailable, denied access, empty
  project, and filtered empty state render helpful guidance.
- Self-observability project logs use the same Logs route and styling.
- No permanent service rail or frontend-calculated log groups appear.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| URL selected log state | route tests |
| Inspector tabs | route tests |
| Correlation action enablement | interaction tests |
| Self-observability log inspection | smoke or Playwright evidence |
| Responsive layout | screenshots |

## Operational Path Coverage

Success path covers normal and self-observability logs. Failure path covers
empty results, filtered empty results, denied access, missing correlation, and
GraphQL errors. Recovery path covers retry, clear filters, and setup link.
Security/privacy covers no raw credential persistence and project-scoped pivots.
Observability/logging is represented by self-observability route evidence.
Performance/resilience covers bounded table layout. Data integrity covers URL
state. Production/release uses typecheck, build, smoke, and screenshots.
Supply-chain impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/logs-route.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "logs"
```

## Non-goals

- No log ingestion changes.
- No self-observability exporter changes.
- No frontend log aggregation.

## Handoff

Pass self-observability Logs UI evidence to IR-009 status records.
