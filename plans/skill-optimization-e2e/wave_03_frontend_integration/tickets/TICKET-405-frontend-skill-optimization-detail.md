---
id: TICKET-405
title: Frontend skill optimization detail
wave: wave_03_frontend_integration
status: planned
parallel_group: frontend_integration
depends_on: [TICKET-404]
blocked_by: []
spec_refs:
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/02-capabilities/ai-eval/optimize-skills.md
write_scope:
  - apps/frontend
read_scope:
  - apps/packages/public-api-client
  - apps/packages/ui-contracts
contract_readiness:
  status: ready
  required_contracts:
    - specs/03-contracts/graphql/public-schema.graphql
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  ambiguous_phrases: []
---

# TICKET-405: Frontend Skill Optimization Detail

## Goal

Render skill optimization setup and detail using public client fields without
route-local GraphQL documents.

## Context Digest

Frontend setup exposes skill mode, but detail rendering does not yet show
accepted/rejected skill steps or file-level diff evidence.

## Implementation Approach

Extend existing AI Eval workspace components and tests only. Use generated
types and public client fields.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `CAP-AIE-011`: inspect diffs and promote explicitly.
- `TEC-FE-007`: AI Eval views expose optimization detail.
- `PEX-020`: self-service validation and action states.

Requirement traceability source ids: CAP-AIE-011, TEC-FE-007, PEX-020.

## Contract Traceability

- Reads existing public client `SkillOptimizationDetail`.
- No contract change.

## Tasks

- Use public client optimization detail fields for `objective`, `searchPolicy`,
  and `skillOptimization`.
- Render accepted/rejected step timeline, file-level diff summary, rejected edit
  reasons, best/current skill digest refs, exported artifact ref, and explicit
  promotion action state.
- Keep adaptive form controls from `TICKET-306` intact.
- Add route tests for disabled promotion without accepted validation evidence
  and explicit promotion visibility.

## Acceptance

- Users can inspect why an edit was rejected or accepted.
- UI does not imply auto-promotion.
- No frontend telemetry derivation is introduced.

Success path: accepted candidate diff and promotion-ready state are visible.
Failure path: rejected step reason and disabled promotion state are visible.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Detail render | `bun run --cwd apps/frontend test -- ai-eval` |
| Promotion state | focused route test |
| Type safety | `bun run --cwd apps/frontend typecheck` |

## Operational Path Coverage

- Accessibility: action state and error summaries remain keyboard reachable.
- Security/privacy: no raw trace payload or secret fields are rendered.
- Supply chain: no new dependency.

## Non-goals

- Do not add route-local GraphQL documents.
- Do not implement backend promotion behavior.

## Handoff

After this passes, UI review can validate the completed skill optimization flow.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend test -- ai-eval
git diff --check -- apps/frontend
```
