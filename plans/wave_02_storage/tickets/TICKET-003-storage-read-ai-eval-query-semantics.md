---
id: TICKET-003
title: Storage-read AI Eval query semantics
wave: 2
status: done
parallel_group: storage_parallel
depends_on: [TICKET-001]
blocked_by: []
spec_refs:
  - specs/04-backend/ai-eval-query-semantics.md
  - specs/04-backend/ai-eval-message-contracts.md
  - specs/03-flows/ai-eval/online-evaluation.md
  - specs/03-contracts/entities/ai/eval-aggregation.schema.json
  - specs/03-contracts/entities/ai/dataset-candidate.schema.json
write_scope:
  - core/storage-read
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/backend-architecture.md
  - specs/04-backend/ai-eval-query-semantics.md
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - core/go-contracts
contract_readiness:
  status: ready
  required_contracts:
    - eval.dataset.search
    - eval.dataset.candidates.search
    - eval.dataset.candidates.prepare
    - eval.manifest.resolve
    - eval.online.policy_matches.resolve
    - eval.quality.overview
    - eval.experiment.search
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement storage-read AI Eval read models, manifest resolution, online policy matching, dataset candidate search, and aggregate summaries.

## Context Digest

Storage-read owns AI Eval query semantics and all derivations. BFF and frontend render returned view models only. Manifest resolution produces schema, version, digest, canonical immutable snapshot, and replay-safe references. Online matching uses project settings, enabled policies, scorer requirements, content allowance, provider constraints, budget, latency, and safety class. Candidate search ordering is newest `updatedAt`, then `id`.

execution_semantics: remote_service for NATS request/reply subjects; data_only for GraphQL-ready view models.

## Implementation Approach

Add storage-read handlers and adapter queries inside `core/storage-read`. Push filters, cursor predicates, counts, and aggregate rows into the SurrealDB adapter. Produce typed run summaries from `eval-aggregation.schema.json`. Documentation/examples: internal service behavior is documented in specs; public user documentation is handled by TICKET-008.

## Decision Ledger

- Policy matching is storage-read only: source online flow and AGENTS.md.
- BFF/frontend do not compute aggregate values: source query semantics.
- Online dedupe key is projectionId, policyId, policyVersion, scorerId, scorerVersion: source online flow.
- Manifest digest uses canonical payload and stable ordering: source message contracts.
- Candidate search uses cursor pagination, not offset pagination: source message contracts.

## Contract Traceability

- Query subjects: AsyncAPI `eval.*.search`, `eval.manifest.resolve`, `eval.online.policy_matches.resolve`, `eval.quality.overview`.
- Entity schemas: `eval-aggregation.schema.json`, `experiment-manifest.schema.json`, `dataset-candidate.schema.json`.
- GraphQL consumers: datasets, candidates, experiments, run summaries, quality overview.

## Tasks

1. Implement dataset candidate search and read-derived candidate preparation source models.
2. Implement manifest resolution with schema, version, digest, canonical immutable snapshot, and replay validation inputs.
3. Implement online policy matching with scorer requirement validation and warnings.
4. Implement experiment run summaries and production quality overview aggregates.
5. Add cursor, filter, and no-BFF-derivation test coverage.

## Acceptance

- Storage-read returns GraphQL-ready aggregates without BFF derivation.
- Manifest digest is stable for equivalent canonical input and changes for semantic input changes.
- Online policy matching rejects invalid targets and returns warnings for disallowed scorers.
- Candidate search supports backed filters and cursor pagination.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Manifest digest and replay safety | Go tests in `core/storage-read` |
| Online policy matching ownership | Go query/handler tests |
| Candidate search ordering and filters | Go adapter tests |
| Aggregation view model schema | Go tests plus `bun run contracts:check` |

## Verification

Default:

```sh
go test -tags surrealdb ./core/storage-read/...
bun run contracts:check
```

Opt-in: live SurrealDB integration uses the existing surrealdb test tag and local compose services.

## Non-goals

- No storage-write mutation.
- No runner scheduling.
- No frontend rendering.

## Handoff

Runner and BFF tickets can rely on storage-read for manifest resolution, online policy matching, candidate evidence, and aggregate view models.
