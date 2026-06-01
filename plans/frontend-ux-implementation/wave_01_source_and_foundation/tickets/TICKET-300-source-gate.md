---
id: TICKET-300
title: FEUX source gate and stale-plan closure
wave: 1
status: ready
parallel_group: feux_source_gate
depends_on: []
blocked_by: []
spec_refs:
  - specs/.readiness-report.yaml
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/99-reviews/frontend-ux-v2-migration-plan.md
  - plans/frontend-ux-migration-check/04-planning-gate-and-spec-drift.md
write_scope:
  - specs/.readiness-report.yaml
  - specs/99-reviews/enterprise-product-spec-readiness-review.md
  - plans/frontend-ux-migration-check/04-planning-gate-and-spec-drift.md
read_scope:
  - specs/spec.md
  - specs/.readiness-report.yaml
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/traces-and-metrics-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/99-reviews/frontend-ux-v2-migration-plan.md
  - plans/frontend-ux-migration-check/02-agent-remediation-plan.md
  - plans/frontend-ux-migration-check/04-planning-gate-and-spec-drift.md
contract_readiness:
  status: ready
  required_contracts:
    - ProductExperienceContract
    - ProductUXConcept
    - ReadinessReport
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Prove the approved frontend UX source order is clean before app code changes
start, and record that older UX v2 planning cannot drive implementation.

## Context Digest

The current frontend source of truth is the product experience contract plus
route-specific UX concepts. Live is a mode inside Traces. Metrics is a technical
explorer. The old review plan is historical only.

## Implementation Approach

Run the source scans listed in verification. Update only the allowed planning
or review files to record proof, stale artifact status, and FEUX plan root
location.

## Decision Ledger

- Product experience source order comes from `specs/.readiness-report.yaml`.
- Older UX v2 review content is superseded by this FEUX plan root.
- App code edits begin in `TICKET-301`.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-002, PEX-003, PEX-004, PEX-011, PEX-015.
Verification traces stale-route and stale-compatibility text before
implementation.

## Contract Traceability

Contracts remain unchanged. This ticket validates frontend spec and planning
authority only.

## Tasks

1. Run the stale Live, `/live`, MetricView, `metricView`, and `viewId` scans.
2. Confirm readiness remains approved with semantic judge status passed.
3. Record this FEUX implementation plan as the executable frontend plan root.
4. Update `_status.yaml` with command evidence.

## Acceptance

- Success path: source scans show no active source instructing a Live sidebar
  route or MetricView compatibility.
- Historical references are labeled as superseded, migration history, or
  explicit forbidden-pattern checks.
- No frontend app code changes in this ticket.
- No contracts change.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Source order approved | readiness report status and semantic judge status |
| Stale Live route blocked | `rg` scan output |
| MetricView compatibility blocked | `rg` scan output |
| Planning root exists | `plans/frontend-ux-implementation/_registry.yaml` |
| No app writes | `git diff --name-only` against `write_scope` |

## Operational Path Coverage

Success path covers clean source proof. Failure path covers stale active
instructions. Recovery path is source-spec repair before app edits. Security and
privacy risk is none because no runtime code changes. Observability/logging is
command evidence. Performance, resilience, data integrity, production, release,
and supply-chain impacts are not applicable.

## Verification

```sh
rg -n "Overview.*, Live|Live Workspace|path=\"/live\"|/live route|MetricView|metricView|viewId" specs plans apps/frontend/src
bun run contracts:check
node /Users/sebastianwessel/.agents/skills/spec-implementation-planner/references/check_plan.mjs . plans/frontend-ux-implementation specs
```

## Non-goals

- No frontend implementation.
- No contract edits.
- No route redesign.

## Handoff

`TICKET-301` starts after this ticket records source-gate evidence in
`_status.yaml`.
