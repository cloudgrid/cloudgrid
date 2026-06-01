---
id: TICKET-302
title: Projects project home and settings
wave: 2
status: ready
parallel_group: feux_projects_settings
depends_on: [TICKET-301]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/04-backend/control-plane.md
  - specs/04-backend/ai-provider-settings.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/control-plane-routes.tsx
  - apps/frontend/src/features/projects
  - apps/frontend/test/ux-v2-projects.test.ts
  - apps/frontend/e2e/projects-settings.e2e.ts
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/04-backend/control-plane.md
  - specs/04-backend/ai-provider-settings.md
  - specs/03-contracts/graphql/public-schema.graphql
  - DESIGN.md
  - apps/frontend/src/routes/control-plane-routes.tsx
  - apps/frontend/src/features/projects
contract_readiness:
  status: ready
  required_contracts:
    - ProjectContracts
    - IngestCredentialContracts
    - RetentionPolicyContracts
    - ProjectAIProviderContracts
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Align the project picker, project home, project settings, ingest setup,
retention, and project AI provider settings with the shared product experience.

## Context Digest

`/projects` is the centered project selection surface. Project settings stay in
the selected-project shell with a secondary settings rail. Local mode exposes
`Personal` as durable admin company and hides unsupported destructive company
flows.

## Implementation Approach

Refactor project and settings views to use `TICKET-301` primitives, keep setup
actions near their empty states, use confirmation dialogs for destructive
actions, and move visible copy through i18n.

## Decision Ledger

- Project picker is operational and not a global stats dashboard.
- Setup empty states link to project ingest settings.
- Ingest secrets are visible once after creation.
- Local mode has no destructive company deletion or owner-transfer UI.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-002, PEX-004 through PEX-009, PEX-011,
PEX-012, PEX-014, PEX-015. This ticket owns project selection, setup guidance,
settings navigation, confirmations, permissions, and local-mode safeguards.

## Contract Traceability

GraphQL SDL owns projects, ingest credentials, retention policy, project AI
provider profiles, and model aliases. The frontend only renders and submits
generated contract shapes.

## Tasks

1. Refine `/projects` search, current selection, create action, project cards,
   and status metadata.
2. Render project settings inside the project shell with breadcrumbs and a
   secondary settings rail.
3. Align ingest setup with endpoint, setup snippet, credential creation,
   one-time secret display, credential list, and revoke confirmation.
4. Keep retention and AI provider settings generated-contract driven.
5. Hide unsupported local-mode destructive admin actions.
6. Add project/settings route tests and Playwright checks.

## Acceptance

- Success path: users can find, select, create, and configure a project with
  clear setup actions.
- Failure path: load errors, denied actions, disabled fields, and revoke
  confirmation states are visible and recoverable.
- One-time secrets never reappear after dismissal.
- No route-primary workspace is card-wrapped.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Project picker behavior | `ux-v2-projects` tests |
| Settings rail and breadcrumbs | route markup tests |
| Ingest credential safety | revoke and one-time secret tests |
| Local mode safeguards | local-mode route tests |
| Responsive setup flow | Playwright screenshots |

## Operational Path Coverage

Success path covers project setup and settings save. Failure path covers denied
permissions, backend unavailable, stale retention version, and revoke
confirmation cancel. Recovery path includes retry, setup link, and version
reload. Security/privacy covers one-time secrets and no token persistence.
Observability/logging is test evidence. Performance/resilience covers bounded
settings forms. Data integrity covers expectedVersion and generated inputs.
Production/release uses typecheck, build, smoke, and screenshots.
Supply-chain impact is not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/ux-v2-projects.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "projects|settings|ingest"
```

## Non-goals

- No new backend contracts.
- No company deletion, billing, owner transfer, or orphaning flows.
- No telemetry route migration.

## Handoff

Route workspace tickets start after project context, setup empty states, and
settings shell evidence are recorded.
