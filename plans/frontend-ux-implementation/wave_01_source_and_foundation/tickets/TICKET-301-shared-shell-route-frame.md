---
id: TICKET-301
title: Shared shell route frame and UX primitives
wave: 1
status: ready
parallel_group: feux_shared_shell
depends_on: [TICKET-300]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/frontend-application.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/app-shell.tsx
  - apps/frontend/src/routes/telemetry-project-gate.tsx
  - apps/frontend/src/components/query-state.tsx
  - apps/frontend/src/components/app
  - apps/frontend/src/features/navigation
  - apps/frontend/src/lib/i18n.ts
  - apps/frontend/src/lib/session-state.ts
  - apps/frontend/src/styles.css
  - apps/frontend/test/ux-v2-shell.test.tsx
  - apps/frontend/test/session-state.test.ts
  - apps/frontend/e2e/ux-v2-shell.e2e.ts
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/frontend-application.md
  - specs/03-contracts/graphql/public-schema.graphql
  - DESIGN.md
  - .agent/IMPLEMENTATION.md
  - apps/frontend/src/routes/app-shell.tsx
  - apps/frontend/src/routes/telemetry-project-gate.tsx
  - apps/frontend/src/components/query-state.tsx
  - apps/frontend/src/features/navigation
contract_readiness:
  status: ready
  required_contracts:
    - ProductExperienceContract
    - PublicGraphQLSchema
    - DashboardPinContracts
    - ViewerProjectContracts
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Create shared frontend shell, route frame, navigation, query state, disabled
state, dialog, inspector, and i18n foundations for the route tickets.

## Context Digest

CloudGrid uses one global topbar, a selected-project domain sidebar, and flat
route workspaces. Project settings stay in the project context. Route copy must
come from i18n. Persisted dashboard pins use GraphQL contracts.

## Implementation Approach

Add shared components under `components/app`, normalize the shell scroll model,
wire mobile navigation, and add reusable query/empty/error/disabled/dialog
patterns consumed by later tickets.

## Decision Ledger

- Topbar height remains 56px.
- Live navigation is not a sidebar item.
- Dashboard pins use persisted GraphQL data.
- Shared primitives avoid card wrappers for route-primary surfaces.

## Requirements Traceability

Requirement id trace: PEX-001 through PEX-009, PEX-011, PEX-014, PEX-015.
The ticket owns shell, navigation, action, feedback, disabled-state, responsive,
and i18n foundations.

## Contract Traceability

GraphQL contracts are read-only. Required data surfaces are viewer project
selection and dashboard pin list/mutations already present in the SDL.

## Tasks

1. Add `RouteFrame`, `RouteHeader`, `BreadcrumbRow`, `WorkspaceSurface`,
   `InspectorPanel`, `SplitWorkspace`, `ConfirmDialog`, `EvidenceAttributes`,
   and `FilterChipBar`.
2. Keep `/projects` outside telemetry sidebar navigation.
3. Keep project workspace routes inside the project sidebar.
4. Add mobile sheet navigation with company and project context.
5. Normalize route body, sidebar, inspector, and topbar scroll containers.
6. Add i18n keys and test helpers for visible route copy.

## Acceptance

- Success path: project workspace routes render topbar, sidebar, route header,
  workspace, and inspector slots without nested cards.
- Failure path: missing project, backend unavailable, permission denied, and
  disabled actions show reason text plus the enabling path.
- Mobile and desktop expose the same navigation order.
- Shared components do not import backend, core, or private service modules.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Topbar and sidebar layout | shell unit tests |
| Mobile navigation parity | Playwright shell check |
| Disabled action grammar | shared component tests |
| i18n copy foundation | copy-key test helper |
| No contract drift | `bun run contracts:check` on contract edits only |

## Operational Path Coverage

Success path covers loaded project workspace navigation. Failure path covers no
project, denied access, unavailable backend, and disabled actions. Recovery path
uses retry and setup links. Security/privacy covers no token or secret
persistence. Observability/logging is test evidence. Performance/resilience
covers bounded local state and independent scroll. Data integrity covers URL and
session state boundaries. Production/release uses build and smoke. Supply-chain
impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/ux-v2-shell.test.tsx apps/frontend/test/session-state.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke
```

## Non-goals

- No route-specific workspace migration beyond shell wiring.
- No new GraphQL fields.
- No backend or core changes.

## Handoff

Route tickets must reuse these primitives and must not fork alternate shell,
dialog, inspector, or disabled-state patterns.
