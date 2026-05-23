---
id: TICKET-004
title: Runner AI Eval orchestration
wave: 3
status: done
parallel_group: runner_harness_parallel
depends_on: [TICKET-002, TICKET-003]
blocked_by: []
spec_refs:
  - specs/04-backend/ai-eval-runner.md
  - specs/04-backend/ai-eval-message-contracts.md
  - specs/02-flows/ai-eval/offline-experiment-run.md
  - specs/02-flows/ai-eval/online-evaluation.md
  - specs/02-capabilities/ai-eval/optimize-prompts.md
  - specs/06-nfr/ai-eval-cost-bounds.md
write_scope:
  - core/ai-eval-runner
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/ai-eval-runner.md
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - core/go-contracts
contract_readiness:
  status: ready
  required_contracts:
    - eval.experiment.start
    - eval.experiment.pause
    - eval.experiment.resume
    - eval.experiment.cancel
    - eval.optimization.start
    - eval.results.persist
    - eval.experiment.progress
    - eval.manifest.resolve
    - eval.online.policy_matches.resolve
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement runner orchestration for offline runs, online measurement, optimization, run control, policy enforcement, result persistence, and progress.

## Context Digest

Runner never reads or writes SurrealDB directly. It resolves manifests and online policy matches through storage-read, reads AI settings through control-plane, writes results through storage-write, and calls only harness adapter endpoints for execution/scoring/optimization. Pause/resume use `ExperimentRunControlRequest`; resume never relies on process memory or sandbox filesystem state. Manifest replay preserves schema, version, digest, canonical immutable snapshot, and compatibility validation.

execution_semantics: remote_service for NATS subjects; local_process for runner process; external_provider access only through harness adapter.

## Implementation Approach

Implement state transitions and command handlers inside `core/ai-eval-runner`. Enforce run policy defaults, max parallel requests, budgets, backpressure, retry, timeout, quarantine, cleanup retry, and idempotency. Persist bounded progress and results through message subjects. Documentation/examples: operational behavior is internal; final user docs are handled by TICKET-008.

## Decision Ledger

- Run states and transitions come from `ai-eval-runner.md`.
- Pause/resume idempotency key uses experimentRunId, command, current run version, optional idempotencyKey: source runner spec.
- Resume with stale digest fails with `ERR-AIE-002` before harness call: source runner spec.
- Online measurement default target is within 5 minutes when budgets permit: source online flow.
- Online dedupe key is projectionId, policyId, policyVersion, scorerId, scorerVersion: source online flow.
- Cleanup has no public mutation and is runner-owned: source runner spec.

## Contract Traceability

- Incoming subjects: `eval.experiment.start`, `eval.experiment.pause`, `eval.experiment.resume`, `eval.experiment.cancel`, `eval.optimization.start`, `ai.persisted.projections`.
- Outgoing subjects: `eval.manifest.resolve`, `eval.online.policy_matches.resolve`, `control.ai_settings.get`, `eval.results.persist`, `eval.experiment.progress`.
- Harness endpoints: `/v1/run`, `/v1/score`, `/v1/optimize`, `/v1/sandboxes/start`, `/pause`, `/resume`, `/abort`, `/cleanup`.

## Tasks

1. Implement start, pause, resume, cancel, and optimization handlers with idempotent state transitions.
2. Enforce manifest digest compatibility before resume and result persistence.
3. Enforce run policy for concurrency, budgets, rate limits, backpressure, retry, timeout, and quarantine.
4. Implement online measurement cadence, stale-notification skip, deterministic sampling, and dedupe.
5. Persist results, skipped records, progress events, and cleanup problems through approved subjects.

## Acceptance

- Runner never imports storage adapters or SurrealDB clients.
- Pause/resume repeated commands return current state without duplicate scheduling.
- Resume from terminal state and stale digest fail with specified non-retryable errors.
- Online no-match notifications do not persist results; matched skipped cases produce bounded skipped reasons.
- Result payloads conform to approved result schemas.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| State machine and idempotency | Go runner unit tests |
| Manifest replay safety | Go tests for schema, version, digest, canonical immutable snapshot |
| Online cadence and dedupe | Go notification tests |
| No direct storage mutation | package import test or static assertion |
| Result payload and progress persistence | Go bridge/orchestrator tests |

## Verification

Default:

```sh
go test -tags surrealdb ./core/ai-eval-runner/...
bun run contracts:check
```

Opt-in: provider-backed harness scoring tests require explicit provider/harness environment variables and are skipped by default.

## Non-goals

- No BFF GraphQL resolver implementation.
- No storage adapter implementation.
- No frontend controls.
- No durable replay adapter.

## Handoff

BFF can route run-control GraphQL mutations to runner subjects after this ticket, and integration gates can assert end-to-end run lifecycle behavior.
