---
id: TICKET-309
title: Cross-route QA and cleanup
wave: 4
status: ready
parallel_group: feux_cross_route_qa
depends_on: [TICKET-303, TICKET-304, TICKET-305, TICKET-306, TICKET-307, TICKET-308, TICKET-310, TICKET-311]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/traces-and-metrics-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
write_scope:
  - apps/frontend/e2e
  - apps/frontend/test
  - plans/frontend-ux-implementation/_status.yaml
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/traces-and-metrics-ux-concept.md
  - specs/05-frontend/logs-metrics-dashboards-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
  - DESIGN.md
  - apps/frontend/src
  - apps/frontend/test
  - apps/frontend/e2e
contract_readiness:
  status: ready
  required_contracts:
    - ProductExperienceContract
    - PublicGraphQLSchema
    - FrontendRouteMatrix
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Close cross-route frontend UX evidence with a route matrix, responsive
screenshots, keyboard checks, copy checks, forbidden-pattern scans, and final
status updates.

## Context Digest

Route agents own route-local fixes. Final QA validates the integrated frontend
against product experience rules and returns route-local defects to their
owning ticket status.

## Implementation Approach

Run static scans, unit tests, build, smoke, and Playwright checks across the
project workspace route matrix. Add or adjust test coverage in the listed test
paths and update `_status.yaml` with evidence.

## Decision Ledger

- Topbar remains visible across routes.
- Sidebar, content, and inspector scroll independently.
- Dialogs, drawers, popovers, and collapsibles follow product surface taxonomy.
- Route-local defects stay assigned to route owners.

## Requirements Traceability

Requirement id trace: PEX-001 through PEX-015 plus route-specific UX concepts.
This ticket owns final path coverage, visual evidence, keyboard checks,
forbidden-pattern cleanup, and release proof.

## Contract Traceability

Contracts are read-only in final QA. Any contract drift fails QA and returns to
spec-first planning outside this ticket.

## Tasks

1. Run desktop, tablet, and mobile route matrix for projects, settings, traces,
   trace detail, logs, metrics, dashboards, AI Chat, AI Eval, and Alerts.
2. Verify topbar visibility and independent scroll containers.
3. Verify loading, empty, filtered empty, populated, permission, disabled,
   backend unavailable, destructive confirmation, and keyboard states.
4. Run copy-key and forbidden-pattern scans.
5. Record screenshots and command evidence in `_status.yaml`.

## Acceptance

- Success path: every route matrix entry passes at desktop, tablet, and mobile.
- Failure path: visual overlap, raw strings, missing keyboard path, card-in-card
  layout, stale Live route, MetricView residue, or immediate destructive action
  fails QA.
- Remaining defects are assigned to the owning ticket status before final
  closure.
- Final verification commands pass.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Route matrix | Playwright reports and screenshots |
| Static forbidden patterns | `rg` scans |
| Copy and i18n | frontend tests |
| Keyboard and disabled paths | e2e checks |
| Release readiness | typecheck, build, smoke |

## Operational Path Coverage

Success path covers normal navigation and route workflows. Failure path covers
blocked actions, unavailable backend, denied access, empty data, visual overlap,
and stale compatibility. Recovery path covers route-owner defect assignment and
targeted rerun. Security/privacy checks secret display and project scoping.
Observability/logging is evidence capture. Performance/resilience checks layout
stability and bounded route surfaces. Data integrity covers URL state and
discard confirmations. Production/release uses build and smoke. Supply-chain,
SBOM, and provenance are not applicable without dependency changes.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
bun test apps/frontend/test
bun run --cwd apps/frontend smoke
rg -n "window.confirm|MetricView|metricView|viewId|path=\"/live\"|rounded-xl|shadow-sm" apps/frontend/src
```

## Non-goals

- No backend, core, contract, or spec changes.
- No new route behavior beyond route-ticket acceptance.
- No visual redesign outside the approved product experience.

## Handoff

Mark FEUX plan complete only after `_status.yaml` contains final command,
screenshots, and route matrix evidence.
