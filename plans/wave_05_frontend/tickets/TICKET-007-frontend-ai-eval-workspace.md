---
id: TICKET-007
title: Frontend AI Eval workspace
wave: 5
status: done
parallel_group: frontend_serial
depends_on: [TICKET-006]
blocked_by: []
spec_refs:
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - specs/05-frontend/product-ux-concept.md
  - specs/03-contracts/graphql/public-schema.graphql
write_scope:
  - apps/frontend
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/05-frontend/product-ux-concept.md
  - specs/05-frontend/ai-eval-views.md
  - specs/05-frontend/ai-eval-ux-concept.md
  - apps/packages/ui-contracts
contract_readiness:
  status: ready
  required_contracts:
    - AI Eval GraphQL view models
    - DatasetCandidateSearchResult
    - ExperimentRunSummary
    - EvalResultVisualization
    - ProjectAiSettings
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement AI Eval frontend workflows from GraphQL view models with no frontend-owned telemetry, scoring, run snapshot, candidate, or policy truth.

## Context Digest

AI Eval route is project-scoped and feature-gated. The UI covers first-use setup, datasets, dataset candidates, scorer templates, experiments, run controls, result analytics, optimization, production quality, annotations, import/export, and Project Settings links. Frontend owns route state, tabs, selection, sorting controls, focus, expansion, and virtualization only. Common scorer forms are typed templates; raw JSON is an advanced drawer after template validation.

execution_semantics: in_process for React UI rendering; remote_service for public API client GraphQL calls.

## Implementation Approach

Update frontend route/components/tests under `apps/frontend`. Use public API client operations and UI contracts only. Render typed result visualizations returned by GraphQL. Use cursor pagination/infinite scrolling inputs for large datasets and candidates. Documentation/examples: user-facing workflow documentation and screenshots are finalized in TICKET-008.

## Decision Ledger

- Topbar/sidebar placement follows product UX concept and frontend style tokens.
- Dataset candidate auto-commit is forbidden: source candidate capability.
- Pause/resume/cancel controls are visible only for valid statuses: source frontend spec.
- Scorer template controls are listed per kind: source `ai-eval-views.md`.
- Frontend must not compute score summaries, policy matches, dataset health, or run snapshots: source frontend boundary.

## Contract Traceability

- Public API operations: AI Eval GraphQL queries, mutations, and subscription.
- View models: `Dataset`, `DatasetCandidate`, `Scorer`, `ExperimentRun`, `EvalResult`, `AiQualityOverview`, `ProjectAiSettings`.
- UI rules: `specs/05-frontend/ai-eval-views.md` and `ai-eval-ux-concept.md`.

## Tasks

1. Implement first-use setup and settings links.
2. Implement dataset workbench, item CRUD, import/export, candidate review, and anonymization provenance display.
3. Implement scorer template forms and validation states for each scorer kind.
4. Implement experiment creation, run list, run detail, pause/resume/cancel, live progress, and result analytics.
5. Implement production quality summaries, skipped reasons, segments, and candidate suggestions.
6. Add frontend tests using mocked GraphQL view models.

## Acceptance

- Frontend never calls harness, NATS, SurrealDB, or provider SDKs.
- Dataset and candidate lists use backed query inputs, cursor, and limits.
- Scorer creation uses typed templates as the primary path.
- Result analytics render returned visualization models without recomputing metrics.
- Error states expose one primary next action.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Route and first-use flows | frontend route tests |
| Dataset/candidate pagination | frontend query tests |
| Scorer template forms | component/view-model tests |
| Run controls and live progress | route tests with mocked GraphQL |
| Result visualizations | view-model/render tests |
| No direct forbidden clients | static test or import guard |

## Verification

Default:

```sh
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend build
bun run --cwd apps/frontend test
```

Opt-in: browser visual verification may use local dev server and in-app browser after implementation.

## Non-goals

- No BFF resolver work.
- No service implementation.
- No new visual system outside the approved frontend style tokens.

## Handoff

Integration gates can verify full UI workflows through the public API client and local fake services.
