---
id: TICKET-203
title: Storage-read AI Eval v2 query semantics
wave: 2
status: ready
parallel_group: ai_eval_v2_services_parallel
depends_on: [TICKET-201]
blocked_by: []
spec_refs:
  - specs/01-domains/ai-eval.md
  - specs/04-backend/ai-eval-query-semantics.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
write_scope:
  - core/storage-read
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/backend-architecture.md
  - specs/01-domains/ai-eval.md
  - specs/04-backend/ai-eval-query-semantics.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/entities/ai
  - core/go-contracts
  - core/storage-read
contract_readiness:
  status: ready
  required_contracts:
    - DatasetSearchResult
    - DatasetCandidateSearchResult
    - EvaluationDefinitionSearchResult
    - EvaluationRunSearchResult
    - EvaluationItemRunSearchResult
    - MetricResultSearchResult
    - EvaluationComparisonSearchResult
    - OptimizationRunSearchResult
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement storage-read query semantics for AI Eval v2 GraphQL view models.

## Context Digest

Storage-read owns filters, sorting, cursor predicates, counts, grouping,
aggregates, live filter matching, authorization preparation, and trace event
fanout. BFF and frontend must not compute AI Eval aggregates. Query outputs are
GraphQL view models.

execution_semantics: request_reply query service and live event fanout.

## Implementation Approach

Update storage-read handlers, repository queries, adapters, fixtures, and tests.
Push filtering, pagination, counts, split/curation filters, metric aggregate
queries, and comparison lookups into storage-read adapters.

## Decision Ledger

- Supported splits are `training`, `validation`, and `test`. Source: GraphQL
  enum.
- Curation statuses are `draft`, `needs_expected`, `needs_review`, `ready`,
  `rejected`. Source: GraphQL enum.
- Aggregates are returned as `MetricAggregate`; BFF does not recompute them.
  Source: query semantics spec.
- Trajectory summaries and important steps are returned as stored view fields.
  Source: runner/backend specs.

## Contract Traceability

- GraphQL AI Eval query fields and result objects.
- AsyncAPI query subjects under `eval.dataset.search`,
  `eval.evaluation.search`, `eval.evaluation.run.search`,
  `eval.results.search`, `eval.evaluation.comparison.search`,
  `eval.optimization.search`.
- Entity schemas under `specs/03-contracts/entities/ai`.

## Tasks

1. Implement dataset, version, item, candidate, and health query handlers.
2. Implement evaluation definition/run/item-run/result query handlers.
3. Implement metric aggregate and comparison query handlers.
4. Implement target snapshot, target diff, and optimization query handlers.
5. Add cursor, filter, and bounded facet tests for v2 fields.

## Acceptance

- Happy path: BFF can read all AI Eval v2 GraphQL view models through
  storage-read.
- Failure path: unsupported filter values return contract errors.
- Aggregates are produced by storage-read queries.
- Cursor pagination is stable for dataset items and evaluation item runs.

## Acceptance Test Matrix

- Query filters and pagination: storage-read Go tests.
- Aggregate ownership: storage-read test asserts aggregate values originate from
  adapter query path.
- Contract conformance: `bun run contracts:check`.

## Verification

Default:

```sh
bun run contracts:check
go test -tags surrealdb ./core/storage-read/...
```

## Non-goals

- No storage-write mutations.
- No frontend rendering.
- No runner execution.

## Handoff

BFF and frontend agents can rely on v2 query results and storage-read-owned
metric aggregates.
