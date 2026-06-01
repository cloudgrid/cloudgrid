---
id: TICKET-311
title: Alerts workspace alignment
wave: 3
status: ready
parallel_group: feux_alerts
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/alerts-ux-concept.md
  - specs/04-backend/alerting.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/alerts-route.tsx
  - apps/frontend/src/features/alerts
  - apps/frontend/test/alerts-route.test.tsx
  - apps/frontend/e2e/alerts.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/alerts-ux-concept.md
  - specs/04-backend/alerting.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/alerts-route.tsx
  - apps/frontend/src/features/alerts
contract_readiness:
  status: ready
  required_contracts:
    - AlertRule
    - AlertSilence
    - AlertHistory
    - AlertNotificationAdapter
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Align Alerts with the product shell, rule list, rule editor, silences, history,
notification adapter setup states, destructive confirmations, and dashboard
alert evidence pivots.

## Context Digest

Alerting is project-scoped. Rules, silences, history, summary, and notification
adapter availability come from backend view models and contracts. The frontend
must not evaluate alert conditions locally.

## Implementation Approach

Refactor Alerts route and feature components around shared route frame,
filter/action primitives, confirmation dialogs, and typed generated contracts.
Keep adapter setup guidance near disabled notification actions.

## Decision Ledger

- Alert rule evaluation stays backend-owned.
- Notification adapter setup is company-scoped and rendered as availability
  state, not local configuration.
- Destructive alert and silence actions use confirmation dialogs.
- Dashboard alert widgets remain dashboard-owned.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-004 through PEX-011, PEX-013, PEX-014,
PEX-015 plus alert UX acceptance. This ticket owns alert route shell, rule
flows, adapter-disabled states, silences, history, and destructive actions.

## Contract Traceability

GraphQL alert rule, silence, history, summary, and notification adapter
contracts are authoritative. The frontend submits generated input shapes and
renders backend status.

## Tasks

1. Place Alerts in the shared route frame with project breadcrumbs and route
   actions.
2. Align rule list, filters, inspector, create/edit flow, and history.
3. Add notification adapter missing/setup-required disabled states.
4. Replace immediate destructive actions with confirmation dialogs.
5. Move labels and status text through i18n.
6. Add route tests and Playwright checks.

## Acceptance

- Success path: users list rules, create or edit a rule, inspect history,
  create a silence, and view notification adapter state.
- Failure path: missing adapter setup, denied access, validation failure,
  backend unavailable, and destructive cancel states render clear guidance.
- The frontend does not evaluate alert conditions or synthesize alert summary
  counts.
- Destructive actions are never immediate.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Rule list and editor | route tests |
| Adapter setup disabled state | route tests |
| Silence and delete confirmations | interaction tests |
| History and evidence pivots | route tests |
| Responsive alerts workspace | Playwright screenshots |

## Operational Path Coverage

Success path covers rule management and history inspection. Failure path covers
validation, missing adapter setup, denied access, delete cancel, and backend
unavailable states. Recovery path covers retry, setup link, edit correction,
and confirmation cancel. Security/privacy covers no webhook secret display.
Observability/logging is test evidence. Performance/resilience covers bounded
tables and forms. Data integrity covers generated inputs and backend-owned
status. Production/release uses typecheck, build, smoke, and screenshots.
Supply-chain impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/alerts-route.test.tsx
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "alerts"
```

## Non-goals

- No alert evaluator backend changes.
- No notification adapter contract changes.
- No dashboard widget migration.

## Handoff

Pass rule, silence, adapter setup, and history screenshots to `TICKET-309`.
