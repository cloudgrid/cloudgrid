---
title: Frontend UX Migration Check
status: approved-planning-input
updated: 2026-05-15
owner: frontend-ux-agents
---

# Frontend UX Migration Check

This package audits the current frontend implementation against the approved UX concept files and the browser concept prototypes. It is approved as planning input for executable autonomous tickets.

Implementation tickets may be generated from this package after copying each ticket into an executable plan with one owner, one write scope, route-specific tests, and visual QA evidence.

## Source Inputs

- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/traces-and-metrics-ux-concept.md`
- `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`
- `DESIGN.md`
- `plans/frontend-ux-concepts/traces-metrics-ux.html`
- `plans/frontend-ux-concepts/logs-metrics-dashboards-ux.html`
- Current frontend implementation under `apps/frontend/src`

## Audit Outputs

- `01-gap-audit.md`: implementation gaps, UX drift, stale planning artifacts, and route-level mismatches.
- `02-agent-remediation-plan.md`: blocked autonomous-agent migration plan with exact scopes, sequencing, acceptance criteria, and verification.
- `03-route-checklists.md`: route-by-route migration and QA checklist.
- `04-planning-gate-and-spec-drift.md`: readiness gate status and spec/planning drift controls.

## High-Level Finding

The implementation has the correct general direction, but it is not yet the proposed product UX. The biggest gaps are trace detail, dashboards, shared shell/scroll behavior, untranslated hard-coded route copy, modal/dialog consistency, dashboard sidebar behavior, and route-primary surfaces that still look like implementation demos instead of focused workspaces.

## Non-Negotiable Agent Rules

- Specs win over existing implementation and older review plans.
- Do not use `specs/99-reviews/frontend-ux-v2-migration-plan.md` as an executable plan without first resolving the drift called out in `04-planning-gate-and-spec-drift.md`.
- Do not add compatibility layers for old metric-view behavior.
- Do not invent GraphQL fields, dashboard widget kinds, route modes, persistence fields, error codes, telemetry derivations, or UI states.
- Each route migration must include tests and visual QA before it can be marked complete.
