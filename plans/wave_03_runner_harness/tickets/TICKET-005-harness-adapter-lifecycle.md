---
id: TICKET-005
title: Harness adapter lifecycle
wave: 3
status: done
parallel_group: runner_harness_parallel
depends_on: [TICKET-001]
blocked_by: []
spec_refs:
  - specs/04-backend/ai-eval-runner.md
  - specs/04-backend/ai-runtime-structure.md
  - specs/04-backend/ai-eval-message-contracts.md
write_scope:
  - apps/packages/cloudgrid-harness-adapter
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/04-backend/ai-eval-runner.md
  - specs/04-backend/ai-runtime-structure.md
  - specs/03-contracts/entities/ai/eval-run-policy.schema.json
contract_readiness:
  status: ready
  required_contracts:
    - /v1/run
    - /v1/score
    - /v1/optimize
    - /v1/sandboxes/start
    - /v1/sandboxes/pause
    - /v1/sandboxes/resume
    - /v1/sandboxes/abort
    - /v1/sandboxes/cleanup
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Implement harness adapter lifecycle endpoints and validation used by runner execution, scoring, optimization, pause/resume, abort, and cleanup.

## Context Digest

Harness adapter is the execution boundary. CloudGrid sends manifest schema, version, digest, canonical immutable snapshot identity, sandbox profile, run policy, W3C trace context, and optional sandbox/checkpoint refs. Ephemeral adapters return `checkpointSupported=false`; pause/resume acknowledge control state and do not preserve process memory. Cleanup responses are bounded and exclude secrets, host paths, raw logs, prompts, provider bodies, NATS subjects, SurrealDB details, cookies, and auth claims.

execution_semantics: local_process for adapter server; external_provider only through adapter-owned provider configuration.

## Implementation Approach

Update adapter contracts, server handlers, validation, and tests under `apps/packages/cloudgrid-harness-adapter`. Keep provider credentials in adapter configuration. Emit bounded lifecycle responses and cleanup summaries. Documentation/examples: adapter local test helper behavior is covered by package tests; final docs are handled by TICKET-008.

## Decision Ledger

- Required sandbox endpoints come from `ai-eval-runner.md`.
- Ephemeral pause/resume does not snapshot memory or filesystem: source `ai-runtime-structure.md`.
- Cleanup retry metadata and bounded cleanup summary are required: source message contracts.
- Durable replay remains out of scope for v1 implementation: source runtime structure.

## Contract Traceability

- Request fields: experimentRunId, manifestDigest, sandboxProfile, runPolicy, trace context, sandboxRef, checkpointRef, cleanup retry metadata.
- Response fields: sandboxRef, sandboxProfile, checkpointSupported, checkpointRef, cleanupRequired, cleanupDeadline, cleanup summary, warnings.
- Consumers: `core/ai-eval-runner`.

## Tasks

1. Add sandbox lifecycle request/response validation.
2. Implement start, pause, resume, abort, and cleanup endpoints.
3. Return ephemeral adapter checkpoint behavior exactly as specified.
4. Add cleanup response redaction tests.
5. Keep run, score, and optimize endpoints compatible with typed solver/config refs.

## Acceptance

- Adapter validates run policy and manifest digest fields on lifecycle calls.
- Ephemeral pause/resume returns successful control acknowledgement without checkpoint support.
- Cleanup response is bounded and redacted.
- Adapter tests run without provider credentials.

## Acceptance Test Matrix

| Criterion | Proof |
| --- | --- |
| Lifecycle endpoint validation | Bun unit tests |
| Ephemeral checkpoint behavior | Bun server tests |
| Cleanup redaction | Bun response tests |
| Provider-free default tests | `bun test apps/packages/cloudgrid-harness-adapter` |

## Verification

Default:

```sh
bun run --cwd apps/packages/cloudgrid-harness-adapter typecheck
bun test apps/packages/cloudgrid-harness-adapter
```

Opt-in: provider-backed adapter tests require explicit provider credentials and are skipped by default.

## Non-goals

- No durable replay adapter.
- No runner state machine.
- No CloudGrid GraphQL or NATS calls from the adapter.

## Handoff

Runner can call lifecycle endpoints and rely on bounded, redacted, policy-aware responses.
