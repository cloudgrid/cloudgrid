---
id: TICKET-205
title: Frontend AI Eval v2 workspace
wave: 3
status: done
parallel_group: ai_eval_v2_runner_frontend_parallel
depends_on: [TICKET-201]
blocked_by: []
spec_refs:
  - specs/01-domains/ai-eval.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/product-ux-concept.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/app-shell.tsx
  - apps/frontend/src/routes/ai-eval-route.tsx
  - apps/frontend/src/features/ai-eval
  - apps/frontend/src/lib/i18n.ts
  - apps/frontend/test
  - apps/packages/public-api-client/src
  - apps/packages/ui-contracts/src
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/ai-eval-route.tsx
contract_readiness:
  status: ready
  required_contracts:
    - Dataset
    - DatasetItemRevision
    - EvaluationDefinition
    - EvaluationRun
    - MetricResult
    - EvaluationComparison
    - OptimizationRun
    - ProjectAiSettings
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Replace the legacy AI Eval frontend workspace with v2 Dataset Evaluation and
Optimization flows.

## Context Digest

AI Eval appears in the project sidebar when enabled. Primary v2 views are
datasets, evaluations, optimization, run detail, comparison, and dataset import.
Users do not manage Scorers, Checks, Gates, or Experiments. Dataset rows use raw
JSON/text input and expected output, optional reason, split, and curation
status. Trace import shows only datasets with extraction settings.

execution_semantics: remote_service for GraphQL calls; in_process for route
state and form validation.

## Implementation Approach

Extract feature modules under `apps/frontend/src/features/ai-eval` and keep the
route as composition. Replace tab labels, empty states, forms, tables, and
detail drawers with v2 concepts. Use existing shadcn/Tailwind conventions and no
card-in-card layouts.

Docs and examples are an approved deferral to `TICKET-206`.

## Decision Ledger

- Split vocabulary is `training`, `validation`, `test`. Source: GraphQL enum.
- Curation vocabulary is `draft`, `needs_expected`, `needs_review`, `ready`,
  `rejected`. Source: GraphQL enum.
- JSON schema is edited as raw JSON text and validated on input. Source: domain
  spec.
- Production measurement stays out of primary v2 navigation. Source: frontend
  UX spec.

## Contract Traceability

- GraphQL operations in public API client.
- UI contracts under `apps/packages/ui-contracts`.
- Route and feature components under frontend.

## Tasks

1. Replace Scorer/Experiment tabs with Dataset Evaluations and Optimization.
2. Implement dataset settings, raw JSON schema editing, row add/edit, import,
   export, curation, and split controls.
3. Implement evaluation definition create/edit and run start screens.
4. Implement run detail with metric aggregates, item runs, trajectory summary,
   and important steps.
5. Implement comparison and optimization progress/result views.
6. Update route tests and UI contract fixtures.

## Acceptance

- Happy path: user creates dataset, adds row, creates evaluation, starts run,
  views metric results, and starts optimization.
- Failure path: invalid JSON schema and invalid row JSON are shown inline.
- Trace import picker lists only datasets with extraction settings.
- UI contains no primary Scorer, Check, Gate, Experiment, or Production Quality
  v2 tab.

## Acceptance Test Matrix

- Route render and flows: frontend tests for AI Eval route.
- Form validation: focused component tests.
- Type conformance: `bun run --cwd apps/frontend typecheck`.
- Contract conformance: `bun run contracts:check`.

## Verification

Default:

```sh
bun run contracts:check
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend test -- ai-eval
```

Browser verification after visual changes:

```sh
bun run --cwd apps/frontend dev
```

Then open the local app and verify desktop and mobile AI Eval views.

## Non-goals

- No backend resolver implementation.
- No storage behavior.
- No production measurement UI.

## Handoff

Integration agents can rely on v2 user flows and stable frontend operation
documents.

## Completion Evidence

- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/frontend typecheck`
- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/frontend test -- ai-eval`
- `PATH="$HOME/.bun/bin:$PATH" bun run contracts:check`
- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/frontend lint` (passes with
  pre-existing AI Chat non-null assertion warnings outside this ticket)
- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/packages/public-api-client typecheck`
- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/packages/public-api-client lint`
- `git diff --check -- apps/frontend apps/packages/public-api-client apps/packages/ui-contracts plans/ai-eval-v2-migration`
- Browser verification against current BFF schema on desktop and mobile:
  route shell renders. TICKET-206 later resolved the runtime v2 dataset shape
  drift and added Playwright acceptance for v2 dataset/evaluation flows.

Completed at: 2026-05-24T14:21:08Z
