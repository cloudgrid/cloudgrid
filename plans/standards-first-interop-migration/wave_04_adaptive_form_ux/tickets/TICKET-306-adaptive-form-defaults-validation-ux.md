---
id: TICKET-306
title: Adaptive form defaults and validation UX
wave: wave_04_adaptive_form_ux
status: planned
parallel_group: null
depends_on: [TICKET-304]
blocked_by: []
spec_refs:
  - specs/05-frontend/product-experience-contract.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/frontend-execution-spec.md
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/99-reviews/adaptive-form-ux-review.md
write_scope:
  - apps/frontend
  - apps/packages/ui-contracts
  - plans/standards-first-interop-migration
read_scope:
  - specs/03-contracts/graphql/public-schema.graphql
  - apps/packages/ui-contracts
contract_readiness:
  status: ready
  required_contracts:
    - specs/03-contracts/graphql/public-schema.graphql
    - apps/packages/ui-contracts/src/index.ts
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  ambiguous_phrases: []
---

# TICKET-306: Adaptive Form Defaults And Validation UX

## Goal

Implement adaptive defaults, constrained controls, dependency-aware fields, and
self-service validation across product create/settings flows, with focused
coverage for AI Eval datasets, evaluations, optimizations, and adapter setup.

## Context Digest

PEX-017 through PEX-020 define product-wide form behavior. AI Eval specs define
concrete controlling selections for value types, evaluation family, target kind,
optimizer kind, and runtime mode.

## Implementation Approach

- Audit existing create/settings forms in `apps/frontend` for free-form fields
  that represent enums, IDs, refs, presets, or finite option sets.
- Replace those fields with existing shadcn/select/combobox/radio/segmented
  controls backed by generated UI contract values or GraphQL read models.
- Add deterministic default drafts for dataset, evaluation, optimization,
  project/settings, and adapter forms covered by the current UI.
- Implement dependency-aware visibility and reset behavior for controlling
  selections.
- Map frontend and backend validation errors to visible fields, tab indicators,
  and summary panels.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `PEX-017`: default draft values.
- `PEX-018`: constrained controls before free-form inputs.
- `PEX-019`: dependency-aware fields, tabs, and validation rules.
- `PEX-020`: self-service validation and summary focus.
- `TEC-FE-007`: AI Eval view-specific defaults and dependencies.
- `TEC-FE-008`: AI Eval UX adaptive input model.
- `REV-012`: review proof for adaptive form behavior.

Requirement traceability source ids: PEX-017, PEX-018, PEX-019, PEX-020,
TEC-FE-007, TEC-FE-008, REV-012.

## Contract Traceability

- Uses existing generated UI contract enums and GraphQL read models.
- No GraphQL, AsyncAPI, OpenAPI, or entity schema changes.

## Tasks

- Add or update shared form helpers for default draft creation, dependent field
  reset, tab error state, and summary focus behavior.
- Update AI Eval dataset creation/settings forms:
  - defaults for input/expected value type, split, curation status, and metric
    preset;
  - JSON schema controls visible only for JSON value types;
  - closed expected-result options rendered as select or multi-select.
- Update AI Eval evaluation creation/settings forms:
  - dataset context preselection;
  - target kind controls filter target/model/profile fields;
  - metric settings reset when dataset or target compatibility changes.
- Update AI Eval optimization creation/settings forms:
  - source context preselection;
  - optimizer kind controls editable parts and skill package/runtime fields;
  - runtime mode controls external adapter readiness fields.
- Update project/settings and adapter forms covered by current frontend modules
  with constrained controls and self-service validation where they use the same
  shared form primitives.
- Add tests for default drafts, dependent field visibility, invalid dependent
  value reset, hidden fields not blocking submit, backend problem mapping, and
  summary focus.

## Acceptance

- Success path: users can create or configure supported entities from valid
  defaults and controlled options without entering IDs or enum literals.
- Failure path: missing prerequisites, invalid JSON, incompatible metric
  settings, missing adapter readiness, and backend validation problems show
  field/tab/summary guidance that names the corrective action.
- Hidden fields do not block submit.
- Changing a controlling field clears or recomputes invalid dependent values and
  displays an inline note.
- First-run AI Eval dataset/evaluation/optimization flows show only fields that
  apply to the current selections.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Default drafts | focused frontend form tests |
| Constrained controls | focused frontend form tests |
| Dependent visibility/reset | focused frontend form tests |
| Validation summary/focus | focused frontend form tests |
| AI Eval flows | existing AI Eval frontend tests plus new cases |

## Operational Path Coverage

- Accessibility: labels, invalid state, summary links, and focus targets are
  keyboard reachable.
- Security/privacy: forms do not expose provider secrets, adapter credentials,
  raw tokens, or source trace payloads.
- Performance: dependency recalculation stays local to draft state and does not
  fetch broad datasets.
- Resilience/recovery: backend validation problems remain visible after retry
  and do not lose the user's valid draft values.
- Data integrity: hidden invalid fields are cleared before submit.
- Production/release/supply chain: no new dependency is required.

## Verification

```sh
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend test -- ai-eval
bun run contracts:check
git diff --check -- apps/frontend apps/packages/ui-contracts plans/standards-first-interop-migration
```

## Non-goals

- Do not add new GraphQL fields or mutations.
- Do not build a visual JSON builder.
- Do not change backend validation authority.
- Do not implement new adapter runtime behavior.

## Handoff

After this ticket and TICKET-305 pass, the migration may be marked complete.
