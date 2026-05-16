---
title: Frontend UX Planning Gate And Spec Drift
status: approved-planning-input
updated: 2026-05-15
---

# Planning Gate And Spec Drift

## Current Gate Status

`specs/.readiness-report.yaml` currently allows autonomous implementation planning for the dashboard/widget contract refactor and frontend alignment wave:

- `status: approved`
- `human_approval.status: approved`

This migration check package is approved planning input. Agents still need executable tickets with one owner, one write scope, route-specific tests, and visual QA evidence before implementation.

## Source Of Truth Order

Agents must use this order when files conflict:

1. `specs/spec.md`
2. `specs/05-frontend/product-ux-concept.md`
3. `specs/05-frontend/traces-and-metrics-ux-concept.md`
4. `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`
5. `DESIGN.md`
6. This migration check package
7. Older review/planning files

## Stale Planning Artifact

`specs/99-reviews/frontend-ux-v2-migration-plan.md` is stale for the current UX concept.

Known conflicts:

- It says selected-project sidebar navigation includes `Live`.
- It contains a dedicated `Live Workspace` ticket.
- It treats live as a standalone route migration instead of a mode inside `/traces`.
- It predates the stricter trace detail, logs, metrics explorer, and dashboard concepts.

Required cleanup before implementation:

- Mark the old review plan superseded, or rewrite it from `plans/frontend-ux-migration-check/02-agent-remediation-plan.md`.
- Remove all instructions that tell agents to implement a `Live` sidebar entry or standalone `/live` UX route.
- Re-run a search over specs/plans before execution:

```sh
rg -n "Overview.*, Live|Live Workspace|/live route|path=\"/live\"|MetricView|metricView|viewId" specs plans apps/frontend/src
```

## No Product Decisions Are Open

This audit does not need new product decisions for implementation. The required behavior is already specified in the current UX concept files.

If an implementation agent finds behavior not covered by the current specs, it must stop and update the relevant source spec before writing code.

## Approval Checklist

Before generating executable agent tickets:

- [x] `specs/.readiness-report.yaml` is approved.
- [x] Old `frontend-ux-v2-migration-plan.md` is marked superseded.
- [x] No active planning/spec file may instruct Live as a primary sidebar entry.
- [x] No active planning/spec file may instruct MetricView compatibility.
- [ ] `02-agent-remediation-plan.md` is copied into executable tickets with one owner and one write scope per ticket.
- [ ] Each ticket includes route-specific tests and Playwright visual checks.

## Completion Definition For The Full Migration

The full migration is complete only when:

- All route checklists in `03-route-checklists.md` are satisfied.
- All user-visible copy in changed files uses `t(...)`.
- No route-primary workspace is card-wrapped.
- No `window.confirm` remains.
- No `/live` navigation or standalone live route UX remains.
- No `MetricView`, `metricView`, or `viewId` compatibility remains.
- Desktop, tablet, and mobile screenshots pass for all project workspace routes.
- `bun run --cwd apps/frontend typecheck`, `bun run --cwd apps/frontend build`, `bun test apps/frontend/test`, and `bun run --cwd apps/frontend smoke` pass.
