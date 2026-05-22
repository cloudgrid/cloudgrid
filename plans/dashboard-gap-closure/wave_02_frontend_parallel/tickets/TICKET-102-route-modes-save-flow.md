---
id: TICKET-102
title: Dashboard route modes discard and save flow
wave: 2
status: ready
parallel_group: dashboard_route
depends_on: [TICKET-101]
blocked_by: []
spec_refs:
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
write_scope:
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/lib/i18n.ts
  - apps/frontend/test/dashboards-ux.test.ts
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/02-capabilities/metrics/manage-dashboards.md
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/src/features/dashboards/dashboard-draft-reducer.ts
  - apps/frontend/src/features/dashboards/dashboard-layout.ts
contract_readiness:
  status: ready
  required_contracts:
    - Query.dashboards
    - Mutation.saveDashboard
    - Mutation.deleteDashboard
    - Mutation.setDashboardPinned
    - Dashboard
    - SaveDashboardInput
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Make the dashboard route a composition layer with explicit overview and builder
modes, reducer-backed draft state, consistent discard handling, save success,
and version conflict UI.

## Context Digest

Overview mode is `/dashboards` without `dashboard`. Builder mode is a selected
saved dashboard or an unsaved draft. The route header owns dashboard-level
actions. Widget configuration opens in a drawer or sheet. Dirty route, project,
dashboard, drawer, and browser transitions use one discard model.

execution_semantics: in_process for React rendering; remote_service for
GraphQL query and mutation calls.

## Implementation Approach

Refactor `dashboards-route.tsx` to consume the reducer and layout foundation from
`TICKET-101`. Keep URL state, React Query hooks, mutation hooks, route shell, and
dialog/sheet wiring in the route. Move direct widget array mutation out of the
route.

Docs/examples: approved deferral. This ticket changes internal frontend route
behavior only; user-facing dashboard documentation belongs to a later website
documentation ticket after the UI gap closure is implemented.

## Decision Ledger

- Overview mode does not mount the canvas or editor.
- Builder mode does not render discovery cards.
- New drafts use `/dashboards?mode=edit` without `dashboard`.
- Saved selected widgets use `widget=<widgetId>`.
- Editor drawer uses `inspector=edit`; read-only details use `inspector=details`.
- Successful save clears draft, selected widget, editor mode, conflict, and history.
- Stale version conflict keeps draft open and exposes reload plus save-as-copy.

## Contract Traceability

- Dashboard list and save mutations from GraphQL SDL.
- Route behavior from dashboard implementation contract URL and persistence sections.
- Error display uses GraphQL problem details and `errors.yaml`.

## Tasks

1. Split overview and builder rendering paths in `dashboards-route.tsx`.
2. Wire reducer actions for create, duplicate, edit, add, update, remove, move, resize, discard, save success, and conflict.
3. Add one discard confirmation model for dashboard switch, route switch, project switch, drawer close, and browser navigation.
4. Add stale conflict UI with reload and save-as-copy actions.
5. Update i18n strings and route tests for mode separation and conflict/discard states.

## Acceptance

- Overview mode renders discovery only.
- Builder mode renders selected dashboard or draft only.
- Route does not manually mutate widget arrays.
- Dirty transitions never silently discard edits.
- Save failure keeps draft open.
- Conflict UI offers reload and save-as-copy.
- No backend, core, or contract files change.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Overview and builder separation | `dashboards-ux.test.ts` route/source assertions |
| Reducer-only mutation | source test rejects old route helper names and direct mutation helpers |
| Discard behavior | focused route tests or source assertions for reducer discard actions |
| Conflict actions | focused route tests or source assertions for reload and save-as-copy |
| Type safety | `bun run --cwd apps/frontend typecheck` |

## Verification

```sh
bun test apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

## Non-goals

- No metric editor extraction.
- No renderer extraction.
- No pin sidebar work.
- No rich metric production enablement.

## Handoff

Editor, renderer, touch, and pin tickets can rely on stable route modes and
reducer-backed draft lifecycle.
