---
id: TICKET-308
title: AI Eval alignment
wave: 3
status: ready
parallel_group: feux_ai_eval
depends_on: [TICKET-302]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/ai-eval-route.tsx
  - apps/frontend/src/features/ai-eval
  - apps/frontend/test/ai-eval-view-model.test.ts
  - apps/frontend/test/ai-eval-route.test.tsx
  - apps/frontend/e2e/ai-eval.e2e.ts
read_scope:
  - specs/spec.md
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/ai-eval-route.tsx
  - apps/frontend/src/features/ai-eval
contract_readiness:
  status: ready
  required_contracts:
    - AIEvalDataset
    - AIEvalRun
    - AIEvalResult
    - ProjectAIProviderProfile
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Align AI Eval with the product shell, route frame, URL selection, left rail or
tabs, main workspace, right inspector, feature-disabled state, and no frontend
score or cost calculations.

## Context Digest

AI Eval v2 contracts are implemented. The frontend renders backend view models
and controls only presentation state. Trace pivots preserve project context.

## Implementation Approach

Refactor AI Eval route layout around shared primitives, move visible labels and
status values to i18n, and keep selected run, dataset, scorer, experiment, and
annotation state in the URL.

## Decision Ledger

- AI Eval uses project context and project provider profiles.
- Disabled feature state hides primary navigation and direct route shows an
  explanatory disabled state.
- Score, cost, token, and regression values come from backend view models.
- Trace pivots remain project-scoped.

## Requirements Traceability

Requirement id trace: PEX-001, PEX-004 through PEX-009, PEX-011, PEX-013,
PEX-014, PEX-015 plus AI Eval view acceptance. This ticket owns AI Eval shell,
selection state, disabled state, pivots, and calculation boundaries.

## Contract Traceability

GraphQL AI Eval and project AI provider contracts are authoritative. The route
does not add frontend-derived score, cost, token, or regression semantics.

## Tasks

1. Convert AI Eval to route frame with navigation rail or tabs, main workspace,
   and right inspector.
2. Remove route-primary card wrappers.
3. Store selected run, dataset, scorer, experiment, and annotation in URL state.
4. Move tab status values and labels through i18n.
5. Add feature-disabled state coverage.
6. Add tests for view-model rendering and route behavior.

## Acceptance

- Success path: users inspect datasets, runs, results, comparisons, and trace
  pivots inside the shared product shell.
- Failure path: feature disabled, denied access, empty datasets, backend
  unavailable, and invalid URL selection render clear states.
- No frontend score, cost, token, or regression calculations appear.
- Project context is preserved on trace pivots.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Route frame alignment | route tests |
| URL selection state | interaction tests |
| Disabled feature state | route tests |
| No frontend calculations | view-model tests and static review |
| Responsive layout | Playwright screenshots |

## Operational Path Coverage

Success path covers AI Eval workspace inspection. Failure path covers disabled
feature, denied access, empty data, invalid selection, and GraphQL errors.
Recovery path covers selection reset, retry, and project settings links.
Security/privacy covers provider profile boundaries and project-scoped pivots.
Observability/logging is test evidence. Performance/resilience covers bounded
tables and inspectors. Data integrity covers backend-owned metrics. Production
and release use typecheck, build, smoke, and screenshots. Supply-chain impact is
not applicable.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun test apps/frontend/test/ai-eval-view-model.test.ts apps/frontend/test/ai-eval-route.test.tsx
bun run --cwd apps/frontend build
bun run --cwd apps/frontend smoke --grep "ai-eval"
```

## Non-goals

- No AI Eval backend contract changes.
- No provider settings backend work.
- No frontend calculation semantics.

## Handoff

Pass disabled-state and route screenshots to `TICKET-309`.
