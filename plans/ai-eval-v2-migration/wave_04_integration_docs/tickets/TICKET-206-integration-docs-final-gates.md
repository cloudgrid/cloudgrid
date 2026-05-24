---
id: TICKET-206
title: AI Eval v2 integration docs and final gates
wave: 4
status: done
parallel_group: ai_eval_v2_integration_serial
depends_on: [TICKET-202, TICKET-203, TICKET-204, TICKET-205]
blocked_by: []
spec_refs:
  - specs/01-domains/ai-eval.md
  - specs/02-capabilities/ai-eval/curate-datasets.md
  - specs/02-capabilities/ai-eval/evaluate-offline.md
  - specs/02-capabilities/ai-eval/optimize-prompts.md
  - specs/04-backend/ai-eval-runner.md
  - specs/05-frontend/ai-eval-views.md
  - website/src/content/handbook
write_scope:
  - apps/backend
  - apps/frontend
  - core
  - website/src/content/handbook
  - skills
  - specs/.readiness-report.yaml
read_scope:
  - specs/spec.md
  - specs/00-vision.md
  - specs/00-conventions.md
  - specs/01-domains/ai-eval.md
  - specs/02-capabilities/ai-eval
  - specs/02-flows/ai-eval
  - specs/04-backend/ai-eval-runner.md
  - specs/05-frontend/ai-eval-views.md
  - website/src/content/handbook
contract_readiness:
  status: ready
  required_contracts:
    - public GraphQL AI Eval v2 fields
    - AsyncAPI AI Eval v2 subjects
    - AI Eval v2 entity schemas
    - generated TypeScript and Go subject metadata
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Prove AI Eval v2 works end to end and publish operator/developer docs for the
implemented basics.

## Context Digest

The first release covers dataset curation, dataset evaluation, optimization,
trace-to-dataset import, external adapter protocol, target snapshots, and
retention defaults. Production measurement remains backlog. Documentation
belongs in `website/src/content/handbook`; skills must be grounded in specs.

execution_semantics: integration tests run local services; docs are static site
content.

## Implementation Approach

Add integration scenarios that cover one complete classification/extraction
dataset evaluation and one optimization quick-shot flow. Update handbook pages
for setup, dataset settings, row curation, trace import, evaluation runs,
optimization, external adapters, and retention.

## Decision Ledger

- Docs explain evaluation as results/metrics/comparisons, not gates. Source:
  domain spec.
- Production measurement is documented as backlog. Source: capability specs.
- External adapter examples use the defined HTTP/webhook and trace context
  protocol. Source: runner spec.
- Default checks are hermetic; external adapter checks are opt-in. Source:
  implementation plan rule.

## Contract Traceability

- GraphQL and AsyncAPI contracts.
- Website handbook pages.
- Integration scenario package.
- Readiness report evidence.

## Tasks

1. Add integration scenario fixtures for dataset evaluation.
2. Add integration scenario fixtures for optimization quick-shot.
3. Add docs for dataset settings, JSON schema validation, import/export,
   evaluations, optimization, target snapshots, external adapters, and retention.
4. Update CloudGrid AI skills only for behavior implemented by prior tickets.
5. Update readiness evidence with exact passing commands.

## Acceptance

- Happy path: local integration scenario creates dataset, evaluates, compares,
  and records metrics.
- Failure path: invalid expected JSON and adapter timeout are covered by tests.
- Docs explain beginner setup through advanced adapter use.
- Readiness report records final command evidence.

## Acceptance Test Matrix

- Integration scenarios: `bun run --cwd apps/packages/integration-scenarios test`.
- Backend/frontend/root gates: `bun run typecheck`, `bun run contracts:check`.
- Go services: root Go workspace test command from AGENTS.md.
- Docs: `bun run --cwd website build`.

## Verification

Default:

```sh
bun run contracts:check
bun run typecheck
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
bun run --cwd website build
```

Opt-in external:

```sh
CLOUDGRID_EVAL_EXTERNAL_ADAPTER_TEST=1 bun run --cwd apps/packages/integration-scenarios test
```

## Non-goals

- No production measurement implementation.
- No new provider credential system.
- No new public REST telemetry reads.

## Handoff

The runtime v2 dataset shape drift has a BFF/storage-read compatibility fix,
Go workspace verification passes, and browser/API acceptance covers the v2 AI
Eval route.

## Completion Evidence

Completed scope:

- AI Eval v2 handbook page rewritten for datasets, evaluations, comparisons,
  optimization, target snapshots, adapters, and retention.
- AI Eval investigation skill updated to v2 vocabulary and service boundaries.
- Integration scenario package now contains AI Eval v2 dataset-evaluation and
  optimization quick-shot fixtures, including invalid expected JSON and adapter
  timeout failure cases.
- Readiness report records final verification evidence.

Passing commands:

- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/packages/integration-scenarios test`
- `PATH="$HOME/.bun/bin:$PATH" bun run --cwd apps/packages/integration-scenarios typecheck`
- `PATH="$HOME/.bun/bin:$PATH" bun run contracts:check`
- `PATH="$HOME/.bun/bin:$PATH" bun run typecheck`
- `PATH="$HOME/.bun/bin:$PATH" bun run skills:check`
- `PATH="$HOME/.bun/bin:$PATH" bun --bun run --cwd website build`
- `PATH="/opt/homebrew/bin:/usr/local/go/bin:$HOME/.bun/bin:$PATH" go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...`
- `PATH="$HOME/.bun/bin:$PATH" bun --bun run --cwd apps/frontend smoke -- ai-eval.e2e.ts`
- `node /Users/sebastianwessel/.agents/skills/spec-architect/scripts/check_specs.mjs specs`
- `node /Users/sebastianwessel/.agents/skills/implementation-planner/references/check_plan.mjs . plans/ai-eval-v2-migration specs`
- `git diff --check -- apps/packages/integration-scenarios apps/packages/public-api-client website skills specs plans/ai-eval-v2-migration`

Final evidence:

- The runtime dataset shape drift has been addressed by normalizing v2 dataset
  versions, settings, ready counts, and item revisions at the BFF/storage-read
  boundary.
- Go workspace tests pass with Go from `/opt/homebrew/bin`.
- Browser/API acceptance passes with the frontend Playwright smoke test.
