# Frontend UX Implementation Plan

Status: ready
Source readiness: `specs/.readiness-report.yaml`
Primary contract: `specs/05-frontend/product-experience-contract.md`

## Goal

Execute the approved CloudGrid product experience contract across the React app
with strict frontend ownership, clear route outcomes, focused tests, and visual
QA evidence. This plan turns the approved FEUX remediation input into executable
agent tickets.

## Non-Drift Rules

- Agents start at `specs/spec.md`, then read only the `read_scope` in their
  assigned ticket.
- Agents write only paths listed in the ticket `write_scope`.
- Agents keep the global 56px topbar as the app-wide navigation surface.
- Agents keep Live as a Traces mode and Metrics as the technical explorer.
- Agents render GraphQL view models and presentation state only.
- Agents update source specs before changing contracts, route semantics, error
  behavior, async behavior, or UX states not present in ticket specs.

## Waves

1. `wave_01_source_and_foundation`: source drift confirmation and shared shell,
   route frame, navigation, i18n, dialog, disabled-state, and inspector
   primitives.
2. `wave_02_project_experience`: project picker, project home, project settings,
   ingest setup, retention, AI provider settings, and local-mode admin rules.
3. `wave_03_route_workspaces`: Traces, trace detail, Logs, Metrics,
   Dashboards, AI Chat, AI Eval, and Alerts route migrations in isolated
   frontend scopes.
4. `wave_04_cross_route_qa`: route matrix, responsive visual QA, copy checks,
   keyboard checks, and forbidden-pattern cleanup.

## Parallel Groups

- `TICKET-300` runs first and changes only planning/readiness notes.
- `TICKET-301` runs after `TICKET-300` and owns shared frontend primitives.
- `TICKET-302` runs after `TICKET-301` and owns project/settings surfaces.
- `TICKET-303` through `TICKET-308`, `TICKET-310`, and `TICKET-311` run in parallel after `TICKET-302`; their
  write scopes are route-owned.
- `TICKET-309` runs last and records cross-route QA evidence.

## Requirement Traceability

Requirement coverage maps PEX-001 through PEX-015 and the route-specific UX
concepts into tickets. Shared shell, navigation, action placement, disabled
states, feedback, URL state, empty states, permissions, visual density,
keyboard access, performance, privacy, observability, release, and supply-chain
dispositions are represented in ticket acceptance and verification.

## Path Coverage

Happy path, unhappy path, recovery, permission, disabled, backend unavailable,
loading, empty, filtered empty, populated, destructive confirmation, keyboard,
mobile, tablet, desktop, and production/release evidence paths are assigned to
the route tickets and final QA ticket.

## Default Verification

```sh
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
bun test apps/frontend/test
bun run --cwd apps/frontend smoke
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
node /Users/sebastianwessel/.agents/skills/spec-implementation-planner/references/check_plan.mjs . plans/frontend-ux-implementation specs
```

`bun run contracts:check` is mandatory for generated GraphQL, AsyncAPI, UI
contract, BFF bridge, or Go message contract changes. FEUX tickets are
frontend-only by default; contract changes must stop for a spec update first.

## Completion Rule

The plan is complete when `TICKET-300` through `TICKET-311` are done, default
verification passes, Playwright visual evidence is recorded for the route
matrix, and `plans/frontend-ux-implementation/_status.yaml` records evidence for
every ticket.

## Self-Audit

Assumptions: specs are approved, product experience contract is authoritative,
and route-specific UX concepts remain valid. Evidence: readiness report is
approved with `language: en`, semantic judge status is passed, and FEUX input is
approved planning input. Requirement coverage: PEX-001 through PEX-015 and
route concepts map to tickets in `_registry.yaml`. Path coverage: each ticket
contains success, failure, recovery, security/privacy, observability/logging,
performance/resilience, data-integrity, production/release, and supply-chain
dispositions. NFR ownership: frontend tickets own responsive layout,
accessibility, no secret persistence, bounded local state, build/test evidence,
and release smoke evidence; backend NFRs are unchanged. Fake-work risk: no
ticket permits placeholder production UI, local-only state for persisted
contracts, or contract-free controls. Parallel risk: shared primitives are
serial in `TICKET-301`, route tickets have disjoint write scopes, and final QA
absorbs cross-route defects. Blockers: none for FEUX implementation planning.
