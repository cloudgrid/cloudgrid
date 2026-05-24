---
id: TICKET-303
title: AI Eval frontend UX label and action placement corrections
wave: 2
status: ready
parallel_group: ai_eval_e2e_wave2
depends_on: [TICKET-301]
blocked_by: []
spec_refs:
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/product-ux-concept.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend/src/routes/ai-eval-route.tsx
  - apps/frontend/src/features/ai-eval
  - apps/frontend/src/routes/traces-route.tsx
  - apps/frontend/src/features/traces
  - apps/frontend/src/lib/i18n.ts
  - apps/frontend/test
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/frontend/src/routes/ai-eval-route.tsx
  - apps/frontend/src/features/ai-eval
  - apps/frontend/src/routes/traces-route.tsx
  - apps/frontend/src/features/traces
  - apps/frontend/test
contract_readiness:
  status: ready
  required_contracts:
    - Dataset
    - DatasetExtractionSettings
    - EvaluationDefinition
    - EvaluationRun
    - Trace
    - Span
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Correct AI Eval frontend labels and action placement so Datasets manage
datasets, Traces own trace-to-dataset import actions, and Evaluations use clear
create/run/comparison/optimization actions.

## Context Digest

AI Eval route navigation contains only Datasets and Evaluations. Dataset list
uses `New dataset`. Dataset detail uses `Add row`, exposes `Dataset settings`,
and can open `Create evaluation from dataset` with the dataset preselected.
`Add trace to dataset` appears only in Traces trace detail, span actions, and
trace overview bulk actions. The Traces dataset picker lists only datasets with
extraction settings. Evaluation list uses `New evaluation`; evaluation detail
uses `Run evaluation`, `Create comparison`, and `Start optimization`.

execution_semantics: remote_service for GraphQL calls; in_process for route
state, labels, filters, and form validation.

## Implementation Approach

Update AI Eval route composition, feature components, trace route actions, i18n
labels, and focused frontend tests. Preserve the global topbar and project
sidebar rules from the product UX concept. Keep dataset settings in dataset
detail and trace import in Traces. Use existing shadcn/Tailwind semantic tokens
and no card-in-card route layouts.

Docs and examples are not changed by this ticket because the work changes the
application UX, not public developer documentation.

## Decision Ledger

- Trace-to-dataset import is a Traces action. Source: AI Eval views spec.
- Dataset settings are opened from dataset detail. Source: AI Eval views spec.
- `Add row` is the dataset detail row creation label. Source: AI Eval views
  spec.
- `New evaluation`, `Run evaluation`, `Create comparison`, and `Start
  optimization` are the evaluation action labels. Source: AI Eval views spec.
- AI Eval route-level navigation remains Datasets and Evaluations only. Source:
  AI Eval views spec.

## Contract Traceability

- AI Eval route and feature components:
  `apps/frontend/src/routes/ai-eval-route.tsx` and
  `apps/frontend/src/features/ai-eval`.
- Trace route and feature actions:
  `apps/frontend/src/routes/traces-route.tsx` and
  `apps/frontend/src/features/traces`.
- Labels: `apps/frontend/src/lib/i18n.ts`.
- GraphQL dataset extraction settings and trace/span objects:
  `specs/03-contracts/graphql/public-schema.graphql`.

## Tasks

1. Remove `Add trace to dataset` from dataset list and dataset detail surfaces.
2. Add trace-to-dataset actions to trace detail, span context actions, and trace
   overview bulk actions.
3. Filter the Traces dataset picker to datasets with extraction settings.
4. Add or expose `Dataset settings` from dataset detail.
5. Rename dataset detail row creation to `Add row`.
6. Rename dataset list creation to `New dataset`.
7. Replace dataset-detail nested evaluation navigation with `Create evaluation
   from dataset`.
8. Rename evaluation creation and run actions to `New evaluation` and `Run
   evaluation`.
9. Add `Create comparison` and `Start optimization` labels on the relevant
   evaluation surfaces.
10. Update focused route/component tests and Playwright smoke coverage for the
    corrected labels and action placement.

## Acceptance

- Happy path: a user can open dataset detail, open dataset settings, add a row,
  and create an evaluation from that dataset without seeing `Add dataset` inside
  detail.
- Trace path: trace detail and trace overview expose trace-to-dataset import,
  and the picker lists only datasets with extraction settings.
- Evaluation path: evaluation list/detail use `New evaluation`, `Run
  evaluation`, `Create comparison`, and `Start optimization`.
- Negative path: Datasets views do not show `Add trace to dataset`.
- Navigation path: AI Eval route-level navigation contains only Datasets and
  Evaluations.

## Acceptance Test Matrix

- AI Eval labels and dataset settings:
  `bun run --cwd apps/frontend test -- ai-eval`.
- Trace action placement:
  frontend route/component tests covering trace detail and overview actions.
- Browser smoke:
  `bun --bun run --cwd apps/frontend smoke -- ai-eval.e2e.ts`.
- Contract conformance: `bun run contracts:check`.
- Type conformance: `bun run --cwd apps/frontend typecheck`.

## Verification

Default:

```sh
bun run contracts:check
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend test -- ai-eval
bun --bun run --cwd apps/frontend smoke -- ai-eval.e2e.ts
git diff --check -- apps/frontend
```

Browser verification after visual changes:

```sh
bun run --cwd apps/frontend dev
```

Then open the local app and verify desktop and mobile AI Eval plus Traces action
placement.

## Non-goals

- No backend resolver changes.
- No GraphQL schema changes.
- No production measurement UI.

## Handoff

The frontend AI Eval and Traces UX matches the spec language and is ready for
the AI Eval v2 E2E coverage to exercise the corrected surfaces.
