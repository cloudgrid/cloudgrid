# Dashboard Gap Closure Implementation Plan

Status: ready
Source readiness: `specs/.readiness-report.yaml` section `dashboard_gap_closure`.
Primary contract: `specs/05-frontend/dashboard-implementation-contract.md`.

## Goal

Close the dashboard UX and functionality gaps with autonomous agents working in
strict ownership boundaries. The plan implements the approved dashboard target
without adding product behavior outside the specs.

## Non-Drift Rules

- Agents start at `specs/spec.md`, then read only the `read_scope` listed in
  their assigned ticket.
- Agents write only files listed in the ticket `write_scope`.
- Agents do not add routes, widget kinds, chart kinds, GraphQL fields, NATS
  subjects, error codes, dashboard storage truth, role rules, pin limits, or
  layout dimensions.
- Agents reuse or extract existing Metrics controls for dashboard metric
  widgets.
- Agents keep production rich metric creation/editing gated until `TICKET-107`
  completes.
- Agents stop and update specs first when implementation needs behavior not
  present in the ticket specs.

## Waves

1. `wave_01_frontend_foundation`: pure reducer, layout, and source mapper
   foundation.
2. `wave_02_frontend_parallel`: route state, shared metric editors, and widget
   renderers in parallel after foundation.
3. `wave_03_pins_and_integration`: canvas touch/keyboard integration and
   persisted pin UX after route/editor/renderer work.
4. `wave_04_rich_metric_gate`: enforce and document the rich metric production
   gate; full production enablement remains blocked until contract, storage,
   BFF, and frontend readiness evidence exists.

## Parallel Groups

- `TICKET-101` runs alone.
- `TICKET-102`, `TICKET-103`, and `TICKET-104` run in parallel after `TICKET-101`.
- `TICKET-105` and `TICKET-106` run in parallel after their dependencies.
- `TICKET-107` runs after dashboard frontend work so it can verify the gate
  against the final UI.

## Default Verification

```sh
bun test apps/frontend/test/dashboard-layout.test.ts apps/frontend/test/dashboard-draft-reducer.test.ts apps/frontend/test/dashboards-ux.test.ts
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
bun run --cwd apps/frontend lint
node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs
```

`bun run contracts:check` is mandatory for contract, generated type, BFF bridge,
or rich metric gate changes.

## Completion Rule

The plan is complete when `TICKET-101` through `TICKET-107` are done, default
verification passes, `bun run contracts:check` passes for changed contracts, and
`plans/dashboard-gap-closure/_status.yaml` records evidence for every ticket.
