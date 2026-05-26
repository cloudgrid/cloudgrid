---
id: TICKET-001
title: AI Eval contracts and drift gates
wave: 1
status: done
parallel_group: contracts_serial
depends_on: []
blocked_by: []
spec_refs:
  - specs/.readiness-report.yaml
  - specs/03-contracts/graphql/public-schema.graphql
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - specs/03-contracts/entities/ai/eval-run-policy.schema.json
  - specs/03-contracts/entities/ai/eval-run-ref.schema.json
  - specs/03-contracts/entities/ai/eval-result-payload.schema.json
  - specs/03-contracts/entities/ai/dataset-candidate.schema.json
  - specs/04-backend/ai-eval-message-contracts.md
write_scope:
  - specs/03-contracts
  - apps/packages/ui-contracts
  - apps/packages/definition
  - core/go-contracts
  - tooling/scripts/check-contracts.mjs
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/03-contracts
  - specs/04-backend/contract-generation.md
  - specs/04-backend/ai-eval-message-contracts.md
contract_readiness:
  status: ready
  required_contracts:
    - public-schema.graphql
    - message-bridge.asyncapi.yaml
    - entities/ai/*.schema.json
    - errors.yaml
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Generate and verify AI Eval GraphQL, AsyncAPI, JSON Schema, TypeScript, and Go contracts so later service agents implement fixed shapes only.

## Context Digest

AI Eval v1 exposes dataset candidates, dataset item updates, scorers, experiments, run control, optimization, result payloads, online policy matching, and typed run summaries. Executable optimizers are `bootstrap_fewshot` and `critic_mutate_judge_pick`. Dataset candidate prepare/search/commit use dedicated AsyncAPI payloads. Pause/resume use `ExperimentRunControlRequest`. Experiment manifests preserve schema, version, digest, canonical immutable snapshot, and replay compatibility.

execution_semantics: data_only for schemas and generated artifacts; remote_service for declared message bridge subjects.

## Implementation Approach

Update contract sources and generated artifacts only. Keep generated TS and Go outputs aligned with GraphQL and AsyncAPI. Extend `contracts:check` for AI Eval subject, required-field, enum, generated artifact, and drift failures. Documentation/examples: contract changes remain documented by the specs and readiness report; no user-facing handbook text is changed in this foundation ticket.

## Decision Ledger

- Optimizer enum has two executable values: source `specs/07-adr/0006-typescript-only-optimization.md`.
- Dataset candidates use dedicated AsyncAPI payloads: source `ai-eval-message-contracts.md`.
- Pause/resume use `ExperimentRunControlRequest`: source `ai-eval-runner.md`.
- Manifest fields include schema, version, digest, canonical immutable snapshot, replay validation: source `ai-eval-message-contracts.md`.
- Contract drift failures belong in `tooling/scripts/check-contracts.mjs`: source AGENTS.md and contract-generation spec.

## Contract Traceability

- GraphQL: `specs/03-contracts/graphql/public-schema.graphql`.
- AsyncAPI: `specs/03-contracts/messages/message-bridge.asyncapi.yaml`.
- JSON Schema: `specs/03-contracts/entities/ai/*.schema.json`.
- TS generated/manual contracts: `apps/packages/ui-contracts`.
- Go contracts: `core/go-contracts`.
- Subject source: `apps/packages/definition/src/index.ts`.

## Tasks

1. Regenerate or update TS/Go contract artifacts from approved contract files.
2. Add contract checker assertions for AI Eval dataset candidate and run-control payloads.
3. Verify no roadmap optimizer appears in executable contracts.
4. Verify GraphQL operations and UI contracts use typed `ExperimentRunSummary`.
5. Sync subject lists and generated subject constants.

## Acceptance

- Contract generation produces TS and Go AI Eval request, response, enum, and entity shapes.
- Missing required AI Eval fields fail `bun run contracts:check`.
- Roadmap optimizer values fail executable contract checks.
- Manifest contract fields remain schema, version, digest, canonical immutable snapshot, and replay-safe.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Generated TS/Go expose AI Eval shapes | `bun run contracts:check`; `bun run --cwd apps/packages/ui-contracts typecheck`; `go test ./core/go-contracts/...` |
| Drift checker rejects missing fields | focused tests or assertions in `tooling/scripts/check-contracts.mjs` |
| Executable optimizer enum is v1-only | `bun run contracts:check` |
| Manifest fields remain durable | contract checker plus schema parse |

## Verification

Default:

```sh
bun run contracts:check
bun run --cwd apps/packages/ui-contracts typecheck
go test ./core/go-contracts/...
```

Opt-in: none.

## Non-goals

- No service implementation.
- No frontend implementation.
- No storage migration.

## Handoff

Storage, runner, BFF, harness, and frontend tickets rely on these generated contracts and the drift checker as their input boundary.
