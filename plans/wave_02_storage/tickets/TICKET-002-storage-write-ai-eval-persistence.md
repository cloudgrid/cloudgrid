---
id: TICKET-002
title: Storage-write AI Eval persistence
wave: 2
status: done
parallel_group: storage_parallel
depends_on: [TICKET-001]
blocked_by: []
spec_refs:
  - specs/04-backend/ai-eval-message-contracts.md
  - specs/04-backend/surrealdb-persistence.md
  - specs/03-flows/ai-eval/dataset-curation-and-splits.md
  - specs/03-contracts/entities/ai/dataset-candidate.schema.json
  - specs/03-contracts/entities/ai/eval-result-payload.schema.json
  - specs/03-contracts/entities/ai/scorer-definition.schema.json
write_scope:
  - core/storage-write
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/backend-architecture.md
  - specs/04-backend/ai-eval-message-contracts.md
  - specs/03-contracts/entities/ai
  - core/go-contracts
contract_readiness:
  status: ready
  required_contracts:
    - eval.dataset.create
    - eval.dataset.items.append
    - eval.dataset.item.update
    - eval.dataset.candidates.prepare
    - eval.dataset.candidates.commit
    - eval.scorer.create
    - eval.experiment.create
    - eval.results.persist
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement storage-write AI Eval mutations and persistence invariants as the only SurrealDB mutation path.

## Context Digest

Storage-write owns dataset versions, dataset item mutations, candidate persistence, candidate commit, scorer creation, experiment creation, result persistence, and prompt promotion. Candidate commit creates a new dataset version and records source candidate IDs. Candidate terminal states are committed, dismissed, and superseded. Result payloads validate against `eval-result-payload.schema.json`. Scorer definitions validate against `scorer-definition.schema.json`.

execution_semantics: remote_service for NATS request/reply subjects; data_only for persisted entities.

## Implementation Approach

Add handlers, adapters, and tests inside `core/storage-write`. Persist only approved entity fields. Enforce optimistic dataset version checks, idempotency keys, candidate state transitions, content-treatment provenance, and result payload validation. Documentation/examples: storage behavior is internal and covered by specs; public user documentation is handled by TICKET-008.

## Decision Ledger

- Storage-write is the only AI Eval SurrealDB mutator: source AGENTS.md and backend architecture.
- Candidate commit requires ready candidates and expected dataset version: source `suggest-dataset-candidates.md`.
- Historical manifests remain unchanged after dataset edits: source dataset flow specs.
- Original sensitive values are not persisted after realistic anonymization: source NFR content capture and candidate capability.
- Result problem classes are modelQuality, itemQuality, scorerConfig, infrastructure: source `ai-eval-runner.md`.

## Contract Traceability

- Requests: AsyncAPI AI Eval dataset, scorer, experiment, result subjects.
- Entities: `dataset-item.schema.json`, `dataset-candidate.schema.json`, `scorer.schema.json`, `experiment.schema.json`, `eval-result.schema.json`.
- Go inputs: `core/go-contracts/contracts.go`.
- Consumers: storage-read, BFF, runner, frontend GraphQL views.

## Tasks

1. Add storage-write handlers for candidate prepare write phase and candidate commit.
2. Enforce dataset item update operations and new dataset version persistence.
3. Validate scorer definitions and result payloads before persistence.
4. Persist experiment records with typed solver, baseline, split, and refs.
5. Add idempotency and stale-version failure coverage.

## Acceptance

- Dataset item mutations create new versions and preserve historical manifests.
- Candidate commit rejects stale version, non-ready candidates, cross-project candidates, and stale anonymization provenance.
- Scorer and eval result writes reject schema-invalid payloads.
- Storage-write never reads storage-read query adapters for derivation.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Dataset version mutation invariants | Go unit tests in `core/storage-write` |
| Candidate state and commit idempotency | Go handler/adapter tests |
| Scorer/result schema rejection | Go validation tests |
| Contract handler registration | `go test -tags surrealdb ./core/storage-write/...`; `bun run contracts:check` |

## Verification

Default:

```sh
go test -tags surrealdb ./core/storage-write/...
bun run contracts:check
```

Opt-in: live SurrealDB integration uses the existing surrealdb test tag and local compose services.

## Non-goals

- No storage-read aggregation.
- No runner scheduling.
- No frontend behavior.

## Handoff

Storage-read and runner tickets can rely on persisted candidate, dataset, scorer, experiment, item-run, and eval-result records matching the approved schemas.
