---
id: TICKET-006
title: BFF AI Eval GraphQL bridge
wave: 4
status: done
parallel_group: bff_serial
depends_on: [TICKET-002, TICKET-003, TICKET-004]
blocked_by: []
spec_refs:
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - specs/03-contracts/errors.yaml
  - specs/04-backend/ai-eval-message-contracts.md
write_scope:
  - apps/backend
  - apps/packages/runtime
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/backend-architecture.md
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - apps/packages/ui-contracts
contract_readiness:
  status: ready
  required_contracts:
    - Query.datasets
    - Query.datasetCandidates
    - Query.scorers
    - Query.experiments
    - Query.evalResults
    - Query.aiQualityOverview
    - Mutation.prepareDatasetCandidates
    - Mutation.commitDatasetCandidates
    - Mutation.pauseExperimentRun
    - Mutation.resumeExperimentRun
    - Subscription.liveExperimentRun
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement BFF GraphQL validation, NATS bridge routing, reply validation, and error mapping for AI Eval.

## Context Digest

BFF talks to private services only through NATS message bridge contracts. It does not consume telemetry ingest or persisted-notification streams. It validates GraphQL input, calls approved subjects, validates replies, and maps errors. BFF must not derive dataset health, manifests, policy matches, score summaries, candidate content, or production quality aggregates.

execution_semantics: remote_service for GraphQL resolver calls through NATS request/reply; data_only for validated view models.

## Implementation Approach

Update backend validation schemas, bridge methods, GraphQL resolvers, and tests under `apps/backend`. Route each GraphQL operation to the exact AsyncAPI subject. Keep response parsing strict for typed refs, run summary, run policy, dataset candidates, and result visualization payloads. Documentation/examples: public GraphQL behavior is covered by generated client examples and final documentation in TICKET-008.

## Decision Ledger

- Frontend talks only to BFF: source AGENTS.md.
- BFF does not derive AI Eval aggregates: source query semantics and AGENTS.md.
- Dataset candidates use dedicated AsyncAPI payloads: source message contracts.
- Pause/resume use `ExperimentRunControlRequest`: source runner spec.
- Errors map to `specs/03-contracts/errors.yaml`: source message contracts.

## Contract Traceability

- GraphQL operations: AI Eval queries, mutations, and subscription in public SDL.
- Message subjects: all AI Eval subjects referenced by `ai-eval-message-contracts.md`.
- UI types: `apps/packages/ui-contracts`.
- Runtime helpers: `apps/packages/runtime`.

## Tasks

1. Add strict validation for all AI Eval GraphQL inputs.
2. Add bridge methods for dataset candidates, run control, result queries, settings, and live subscription.
3. Add resolver tests proving each operation routes to the approved subject.
4. Validate bridge responses for typed run summaries, candidates, result visualizations, and settings.
5. Map bridge errors to GraphQL problem extensions.

## Acceptance

- Every AI Eval GraphQL operation calls only the approved NATS subject.
- Invalid input is rejected before NATS calls.
- BFF does not compute aggregate fields from raw rows.
- Repeated pause/resume GraphQL calls are passed as idempotent run-control requests.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Subject routing | Backend resolver/bridge tests |
| Input validation | Backend validation tests |
| Response validation | Bridge parser tests |
| No BFF derivation | focused tests and code ownership check |
| Error mapping | GraphQL tests |

## Verification

Default:

```sh
bun test --coverage apps/backend/src
bun run contracts:check
bun run --cwd apps/backend typecheck
```

Opt-in: none.

## Non-goals

- No storage or runner implementation.
- No frontend UI.
- No new GraphQL operations.

## Handoff

Frontend can use the public API client and GraphQL view models without direct NATS, harness, or storage access.
