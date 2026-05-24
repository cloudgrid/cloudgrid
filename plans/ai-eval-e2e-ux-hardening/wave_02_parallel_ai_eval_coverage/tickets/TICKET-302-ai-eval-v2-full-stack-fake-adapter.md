---
id: TICKET-302
title: AI Eval v2 full-stack fake adapter scenario
wave: 2
status: ready
parallel_group: ai_eval_e2e_wave2
depends_on: [TICKET-301]
blocked_by: []
spec_refs:
  - specs/06-nfr/integration-test-suite.md
  - specs/01-domains/ai-eval.md
  - specs/04-backend/ai-eval-runner.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
write_scope:
  - tooling/scripts/ai-eval-fake-service-integration.test.mjs
  - apps/packages/integration-scenarios
  - apps/packages/public-api-client/src
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/06-nfr/integration-test-suite.md
  - specs/01-domains/ai-eval.md
  - specs/04-backend/ai-eval-runner.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - apps/packages/integration-scenarios
  - apps/packages/public-api-client/src
  - tooling/scripts/ai-eval-fake-service-integration.test.mjs
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
    - TargetSnapshot
    - cloudgrid-harness-adapter HTTP contract
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Add executable AI Eval v2 full-stack integration coverage that creates a
dataset, runs an evaluation through the deterministic fake adapter, reads
persisted results, and covers the required failure paths.

## Context Digest

AI Eval v2 uses datasets, dataset item revisions, evaluation definitions,
evaluation runs, metric results, comparisons, optimization runs, and target
snapshots. Scorer, Experiment, annotation queue, quality overview, and live
experiment heartbeat are not v2 concepts. Full-stack scenarios use public
GraphQL/HTTP entrypoints and shared public API client operations. The runner
calls the deterministic harness adapter with W3C trace context and stores
actual output, bounded trajectory summary, metric results, aggregates, trace
refs, and live events.

execution_semantics: remote_service for BFF GraphQL and harness HTTP calls;
local_process for disposable full-stack services started by integration-local.

## Implementation Approach

Replace the stale fake-service integration script with an AI Eval v2 scenario
module under `apps/packages/integration-scenarios`. Add or reuse public API
client operation documents for dataset settings, row append, evaluation
definition creation, run start/control/live updates, result reads, comparison
reads, optimization quick-shot startup, and target snapshot reads. Keep the
script path as a thin launcher for the scenario or remove its stale body while
preserving package script compatibility.

Docs and examples are covered by scenario metadata and the local integration
command help.

## Decision Ledger

- Scenario drives CloudGrid through public BFF GraphQL and adapter HTTP only.
  Source: integration-test-suite spec.
- Fake model behavior comes from the shared harness adapter. Source:
  integration-test-suite spec.
- The scenario persists and reads v2 objects only. Source: AI Eval domain and
  frontend specs.
- Invalid raw JSON and adapter timeout are required failure paths. Source:
  integration-test-suite spec.
- Quick-shot stores quick-shot retention-role data separately from full
  validation evidence. Source: integration-test-suite and runner specs.

## Contract Traceability

- Public GraphQL: `specs/03-contracts/graphql/public-schema.graphql`.
- Message bridge lifecycle: `specs/03-contracts/messages/message-bridge.asyncapi.yaml`.
- Public API client operation documents:
  `apps/packages/public-api-client/src`.
- Scenario metadata and assertions: `apps/packages/integration-scenarios`.
- Legacy script compatibility:
  `tooling/scripts/ai-eval-fake-service-integration.test.mjs`.

## Tasks

1. Add AI Eval v2 public API operation descriptors used by the scenario.
2. Create a local-e2e AI Eval v2 scenario that creates dataset settings with
   text input and JSON expected output schema.
3. Append one ready row with input, expected output, reason, split, curation
   status, and source metadata.
4. Create an evaluation definition for the dataset version and target snapshot.
5. Start an evaluation run and consume live updates until completion.
6. Assert the harness adapter received W3C trace context.
7. Read item runs, actual output, bounded trajectory summary, metric results,
   aggregate metrics, trace refs, and run events through GraphQL.
8. Add failure-path scenario steps for invalid raw JSON and adapter timeout.
9. Add quick-shot optimization startup assertions for subset execution and
   quick-shot retention role.
10. Remove stale scorer/experiment assertions from the fake-service script.

## Acceptance

- Happy path: `bun run integration:local` executes the AI Eval v2 scenario
  against disposable infrastructure and the deterministic harness adapter.
- Failure path: invalid row JSON is rejected through public GraphQL with a
  typed error shape.
- Failure path: adapter timeout creates a typed failed item/run state and the
  scenario exits without hanging.
- Observability path: fake adapter request metadata proves W3C trace context
  propagation.
- Contract conformance: no scenario assertion uses Scorer, Experiment,
  annotation queue, quality overview, or live experiment heartbeat fields.

## Acceptance Test Matrix

- Scenario unit metadata:
  `bun run --cwd apps/packages/integration-scenarios test`.
- Public operation contract:
  `bun run contracts:check`.
- Full-stack execution: `bun run integration:local`.
- Failure-path coverage: AI Eval v2 scenario asserts invalid JSON and adapter
  timeout outcomes.
- Legacy removal: source search confirms stale v1 AI Eval terms are absent from
  the fake-service integration scenario.

## Verification

Default:

```sh
bun run --cwd apps/packages/integration-scenarios test
bun run contracts:check
bun run typecheck
git diff --check -- apps/packages/integration-scenarios apps/packages/public-api-client tooling/scripts/ai-eval-fake-service-integration.test.mjs
```

Opt-in local integration:

```sh
bun run integration:local
```

## Non-goals

- No frontend component changes.
- No new service boundary or direct database access.
- No external provider credentials.

## Handoff

The project has executable AI Eval v2 full-stack coverage for fake adapter
evaluation and optimization quick-shot basics.
