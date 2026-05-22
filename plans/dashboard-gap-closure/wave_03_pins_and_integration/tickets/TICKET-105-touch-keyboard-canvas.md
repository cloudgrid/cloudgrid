---
id: TICKET-105
title: Tablet touch and keyboard canvas integration
wave: 3
status: ready
parallel_group: dashboard_canvas
depends_on: [TICKET-101, TICKET-102]
blocked_by: []
spec_refs:
  - specs/05-frontend/dashboard-implementation-contract.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/product-ux-concept.md
write_scope:
  - apps/frontend/src/features/dashboards
  - apps/frontend/src/routes/dashboards-route.tsx
  - apps/frontend/test/dashboard-layout.test.ts
  - apps/frontend/test/dashboards-ux.test.ts
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/dashboard-widgets.md
  - specs/05-frontend/dashboard-implementation-contract.md
  - apps/frontend/src/features/dashboards/dashboard-layout.ts
  - apps/frontend/src/features/dashboards/dashboard-draft-reducer.ts
  - apps/frontend/src/routes/dashboards-route.tsx
contract_readiness:
  status: ready
  required_contracts:
    - DashboardWidgetLayoutInput
    - DashboardWidgetInput
    - SaveDashboardInput
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Wire desktop, wide tablet, narrow tablet, mobile stacked, pointer, touch, and
keyboard canvas behavior to the reducer and layout foundation.

## Context Digest

Desktop and wide tablet use persisted 12-column layout. Narrow tablet renders a
6-column projection with edits mapped back to 12-column coordinates. Touch
targets are at least 44px. Mobile uses stacked order and move up/down actions
instead of freeform drag-resize. Keyboard users can move, resize, commit, and
cancel layout operations.

execution_semantics: in_process for UI interaction and reducer dispatch.

## Implementation Approach

Add canvas integration components under `features/dashboards` and wire them from
the dashboard route. Pointer and keyboard operations dispatch reducer actions.
Preview state remains local presentation state and commits only through reducer
actions.

## Decision Ledger

- Drag starts only from the drag handle.
- Resize starts only from right, bottom, or lower-right handles.
- Interactive widget content never starts drag or resize.
- Escape cancels active operation and restores previous layout.
- Enter, Space, pointer up, or explicit keyboard commit commits operation.
- Mobile does not expose freeform drag-resize.
- Tablet controls use at least 44px hit targets.

## Contract Traceability

- Layout constraints trace to `DashboardWidgetLayoutInput`.
- Draft mutation traces to reducer action contract.
- Accessibility behavior traces to dashboard implementation contract and product UX concept.

## Tasks

1. Add canvas components for grid projection, selected widget frame, drag handle, and resize handles.
2. Add pointer preview and commit/cancel handling.
3. Add keyboard move, resize, commit, cancel, Home, and End behavior.
4. Add narrow tablet 6-column projection wiring.
5. Add mobile stacked rendering and move up/down actions.
6. Add focused tests for layout interaction wiring and source-level accessibility requirements.

## Acceptance

- Desktop and wide tablet preserve 12-column layout.
- Narrow tablet renders a 6-column projection and persists 12-column coordinates.
- Mobile renders stacked widgets with move up/down controls.
- Right, bottom, and corner resize handles exist.
- Keyboard move and resize work without pointer input.
- Active operation cancel restores previous layout.
- No backend, core, or contract files change.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| 12-column, 6-column, stacked behavior | `dashboard-layout.test.ts` |
| Handles and keyboard controls | `dashboards-ux.test.ts` and focused interaction tests |
| Touch target class/size rule | source or component test |
| Cancel restores layout | reducer/layout interaction test |
| Type safety | `bun run --cwd apps/frontend typecheck` |

## Verification

```sh
bun test apps/frontend/test/dashboard-layout.test.ts apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
```

## Non-goals

- No metric editor extraction.
- No renderer extraction.
- No pin sidebar work.
- No browser visual validation requirement.

## Handoff

The dashboard canvas supports the specified interaction model for downstream
polish and integration checks.
