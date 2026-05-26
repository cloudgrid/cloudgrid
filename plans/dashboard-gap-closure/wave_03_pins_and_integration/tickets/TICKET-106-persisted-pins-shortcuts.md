---
id: TICKET-106
title: Persisted pins and dashboard shortcuts
wave: 3
status: ready
parallel_group: dashboard_pins
depends_on: [TICKET-102]
blocked_by: []
spec_refs:
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes
  - apps/frontend/src/features/dashboards
  - apps/frontend/test
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/app-shell.tsx
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/lib/query-keys.ts
contract_readiness:
  status: ready
  required_contracts:
    - Query.dashboards
    - Mutation.setDashboardPinned
    - Mutation.reorderDashboardPins
    - DashboardPreferences
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement dashboard pinned shortcuts and accessible pin reordering using
persisted dashboard preference contracts only.

## Context Digest

Pinned dashboard shortcuts appear below `AI Chat` and above primary telemetry
navigation when explicit dashboard preference data exists. Visible shortcuts are
capped at five. Pin/unpin uses `Mutation.setDashboardPinned`. Reorder uses
`Mutation.reorderDashboardPins`. Browser-local pin truth is forbidden.

execution_semantics: in_process for shell rendering; remote_service for GraphQL
pin mutations.

## Implementation Approach

Use dashboard list/preference data already loaded through GraphQL. Add small
dashboard feature helpers only for pin list derivation and ordering controls.
Keep shell navigation order aligned with product UX concept.

Docs/examples: approved deferral. This ticket changes internal frontend
navigation behavior only; user-facing dashboard documentation belongs to a later
website documentation ticket after the UI gap closure is implemented.

## Decision Ledger

- Pin data comes from dashboard list/preferences contracts only.
- Maximum visible pinned shortcuts is five.
- Parent `Dashboards` entry opens `/dashboards`.
- Shortcut entries open `/dashboards?dashboard=<dashboardId>`.
- Reorder writes the full ordered dashboard ID list through `Mutation.reorderDashboardPins`.
- Pin mutations do not require admin.

## Contract Traceability

- GraphQL fields and mutations: `DashboardListResult.pinnedDashboardIds`,
  `DashboardPreferences`, `setDashboardPinned`, `reorderDashboardPins`.
- UX placement: product UX concept project workspace sidebar section.

## Tasks

1. Add persisted pinned shortcut rendering in the project sidebar.
2. Add pin and unpin actions in dashboard overview and builder where the specs allow them.
3. Add accessible reorder controls for pinned shortcuts.
4. Add tests proving no localStorage/sessionStorage pin truth exists.
5. Add tests for cap at five visible shortcuts and GraphQL mutation usage.

## Acceptance

- Sidebar pinned shortcuts render only from persisted data.
- Visible pinned shortcuts are capped at five.
- Pin/unpin calls `Mutation.setDashboardPinned`.
- Reorder calls `Mutation.reorderDashboardPins`.
- No browser storage is used for pin truth.
- Unauthorized mutation errors render feedback without changing local truth.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Persisted source only | source/import tests rejecting browser storage for pins |
| Cap at five | focused helper/component test |
| Mutation usage | route/component tests or source assertions |
| Sidebar placement | dashboard UX tests |
| Type safety | `bun run --cwd apps/frontend typecheck` |

## Verification

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

## Non-goals

- No control-plane changes.
- No BFF changes.
- No new pin contract fields.
- No rich metric production enablement.

## Handoff

The sidebar and dashboard surfaces expose persisted pins without creating local
truth.
