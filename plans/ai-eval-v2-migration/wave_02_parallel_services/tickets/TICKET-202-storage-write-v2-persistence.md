---
id: TICKET-202
title: Storage-write AI Eval v2 persistence
wave: 2
status: done
parallel_group: ai_eval_v2_services_parallel
depends_on: [TICKET-201]
blocked_by: []
spec_refs:
  - specs/01-domains/ai-eval.md
  - specs/03-contracts/entities/ai/dataset.schema.json
  - specs/03-contracts/entities/ai/dataset-version.schema.json
  - specs/03-contracts/entities/ai/dataset-item-revision.schema.json
  - specs/03-contracts/entities/ai/evaluation-run.schema.json
  - specs/03-contracts/entities/ai/metric-result.schema.json
  - specs/04-backend/ai-eval-message-contracts.md
write_scope:
  - core/storage-write
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/backend-architecture.md
  - specs/01-domains/ai-eval.md
  - specs/03-contracts/entities/ai
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - core/go-contracts
  - core/storage-write
contract_readiness:
  status: ready
  required_contracts:
    - Dataset
    - DatasetVersion
    - DatasetItemRevision
    - EvaluationRun
    - EvaluationItemRun
    - MetricResult
    - MetricAggregate
    - EvaluationComparison
    - TargetSnapshot
    - OptimizationRun
    - PromotionRecord
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Persist AI Eval v2 records through storage-write as immutable/versioned data
where specified.

## Context Digest

Storage-write is the only SurrealDB mutator. Dataset versions are immutable and
contain item revision IDs plus digest. Dataset item edits create new revisions.
Evaluation runs, item runs, metric results, comparisons, target snapshots,
optimization runs, and promotion records are durable records. Retention role and
retention profile are stored with runs and item runs.

execution_semantics: NATS request_reply commands mutate storage; JetStream ingest
continues for persisted AI projections.

## Implementation Approach

Update storage-write command handlers, SurrealDB adapters, migrations/fixtures,
and focused tests. Replace legacy experiment/scorer/result tables with v2
records. Preserve stable IDs, digest inputs, idempotency keys, and immutable
version behavior.

## Decision Ledger

- Dataset version digest covers settings snapshot and ordered item revision IDs.
  Source: AI Eval domain spec.
- Dataset item updates append revisions and never mutate old revisions. Source:
  dataset curation flow.
- Metric results are immutable after finalization. Source: domain entity table.
- Scratch/quick-shot retention roles are stored, not inferred later. Source:
  retention NFR.

## Contract Traceability

- Entity schemas under `specs/03-contracts/entities/ai`.
- AsyncAPI mutation subjects under `eval.dataset.*`, `eval.results.persist`,
  `eval.evaluation.comparison.create`, `eval.target.snapshot.create`,
  `eval.target.promote`.
- Go contracts under `core/go-contracts`.

## Tasks

1. Add storage records for v2 entities.
2. Implement dataset create, item append, item update, candidate commit, import
   commit, and version creation as transactional mutations.
3. Implement evaluation result persistence for run, item run, metric result,
   aggregate, comparison, target snapshot, optimization run state, and promotion
   records. Optimization run state is carried in the runner-owned
   `eval.results.persist` payload.
4. Add duplicate idempotency-key tests.
5. Remove storage-write dependencies on legacy scorer/experiment record shapes.

## Acceptance

- Happy path: dataset creation creates version and item revision records.
- Failure path: stale expected dataset version rejects mutation.
- Idempotency returns the original committed record for repeated request key.
- Old dataset item revisions remain readable after update.
- Persisted metric results keep payload, evidence refs, and metadata intact.

## Acceptance Test Matrix

- Dataset version immutability: storage-write focused Go test.
- Idempotency: storage-write focused Go test.
- Metric persistence: storage-write focused Go test.
- Contract conformance: `bun run contracts:check`.

## Verification

Default:

```sh
bun run contracts:check
go test -tags surrealdb ./core/storage-write/...
```

Completed evidence:

```sh
PATH="/opt/homebrew/bin:/usr/local/go/bin:$HOME/.bun/bin:$PATH" go test -tags surrealdb ./core/storage-write/...
PATH="$HOME/.bun/bin:$PATH" bun run contracts:check
PATH="$HOME/.bun/bin:$PATH" bun run typecheck
```

## Non-goals

- No storage-read aggregation.
- No runner execution.
- No frontend changes.

## Handoff

Storage-read and runner agents can rely on persisted v2 records, immutable
dataset versions, and idempotent mutation behavior.
