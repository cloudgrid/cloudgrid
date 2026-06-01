---
id: TICKET-307
title: Dashboards workspace
wave: 3
status: ready
parallel_group: feux_dashboards
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/features/dashboards
  - apps/frontend/test/dashboards-ux.test.ts
  - apps/frontend/test/dashboard-layout.test.ts
  - apps/frontend/e2e/dashboards.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/lib/dashboard-contracts.ts
contract_readiness:
  status: ready
  required_contracts:
    - Dashboard
    - DashboardWidget
    - SaveDashboardInput
    - DashboardPinMutations
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Make Dashboards the saved dashboard and widget workspace with typed editors,
right inspector, persisted pins, dirty-state protection, and no immediate
destructive browser prompts.

## Context Digest

Metrics exploration and dashboard composition are separate surfaces. Dashboard
widgets store typed configs, not executable code or arbitrary JSON. Built-ins
are read-only; editing creates a saved copy.

## Implementation Approach

Refactor dashboard rail, canvas, inspector/editor, widget creation, dirty-state
flow, and pin actions to use existing contracts and shared primitives.

## Decision Ledger

- `window.confirm` is replaced by shared confirmation dialogs.
- One right inspector/editor is used on desktop.
- Widget layout honors 12-column contract fields.
- Built-ins are read-only until copied.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-004 through PEX-011, PEX-013, PEX-014,
PEX-015 plus dashboard widget acceptance. This ticket owns dashboard list,
pinning, widget editing, layout, destructive actions, and dirty-state recovery.

## Contract Traceability

GraphQL dashboard list/save/delete and pin mutations are authoritative. Widget
config types come from dashboard contract definitions.

## Tasks

1. Replace `window.confirm` with shared confirmation dialogs.
2. Move visible copy to i18n.
3. Use one right inspector/editor and remove duplicate desktop details sheet.
4. Implement dashboard rail groups for pinned, built-in, personal, and project.
5. Add metric, log, trace, and live trace table widget creation.
6. Implement Data, Display, and Thresholds editor groups.
7. Enforce dirty state and discard confirmation on dashboard or project switch.

## Acceptance

- Success path: users can view, create, edit, arrange, save, duplicate, delete,
  pin, and unpin dashboards.
- Failure path: validation errors, save conflicts, denied actions, built-in
  read-only state, and destructive confirmations are visible and recoverable.
- Widget configs remain typed and safe.
- Static scan shows no `window.confirm` in dashboard code.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Save/delete/pin behavior | dashboard route tests |
| Dirty-state protection | interaction tests |
| Widget editor typing | unit tests |
| Layout contract | layout tests |
| Responsive dashboard workspace | screenshots |

## Operational Path Coverage

Success path covers dashboard composition. Failure path covers validation,
conflict, denied access, destructive cancel, and backend unavailable states.
Recovery path covers discard, retry, duplicate built-in, and save conflict
resolution. Security/privacy covers typed widget config and no executable code.
Observability/logging is test evidence. Performance/resilience covers bounded
canvas layout. Data integrity covers version and dirty state. Production/release
uses typecheck, build, smoke, and screenshots. Supply-chain impact is not
applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/dashboards-ux.test.ts apps/frontend/test/dashboard-layout.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "dashboards"
rg -n "window.confirm" apps/frontend/src/routes/dashboards-route.tsx apps/frontend/src/features/dashboards
```

## Non-goals

- No new widget kinds outside specs.
- No backend dashboard contract changes.
- No Metrics explorer rewrite.

## Handoff

Pass dashboard screenshots and forbidden-pattern scan to `TICKET-309`.
