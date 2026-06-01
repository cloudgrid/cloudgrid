---
id: TICKET-303
title: Runner external adapter trace-link policy
wave: wave_02_standard_evidence_extraction
status: planned
parallel_group: standard-evidence
depends_on: [TICKET-301]
blocked_by: []
spec_refs:
  - specs/04-backend/ai-eval-runner.md
  - specs/03-flows/ai-eval/skill-optimization-run.md
  - specs/02-capabilities/ai-eval/optimize-skills.md
write_scope:
  - core/ai-eval-runner
read_scope:
  - core/go-contracts
  - specs/04-backend/ai-eval-runner.md
contract_readiness:
  status: ready
  required_contracts:
    - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  ambiguous_phrases: []
---

# TICKET-303: Runner External Adapter Trace-Link Policy

## Goal

Make runner orchestration use HTTP adapter calls for control/status and OTLP
trace refs for optimizer evidence, without requiring custom CloudGrid source
span attributes.

## Context Digest

External business context adapters may be long-running. They preserve W3C trace
context and return terminal `traceId`/`rootSpanId`, while emitting production
OTLP spans during execution.

## Implementation Approach

- Propagate `traceparent` and `tracestate` on external adapter start/poll/cancel
  calls where the adapter contract allows it.
- Accept terminal output or output ref, status, problem, usage/cost/timing, and
  trace refs from the adapter response.
- Wait for the configured trace-link window before building optimizer evidence.
- Exclude items from optimizer reflection when trace evidence is unavailable and
  the objective requires trajectory evidence.
- Do not accept HTTP-returned spans or step lists as primary evidence.

## Decision Ledger

- No open decisions.

## Requirements Traceability

- `TEC-BE-014`: external adapters emit OTLP and runner consumes normalized
  evidence.
- `FLW-AIE-006`: delayed trace persistence and missing trace refs have defined
  recovery behavior.
- `CAP-AIE-011`: skill optimization uses standard-first trace evidence.

Requirement traceability source ids: TEC-BE-014, FLW-AIE-006, CAP-AIE-011.

## Contract Traceability

- Uses existing adapter lifecycle and item-run fields.
- No GraphQL/AsyncAPI changes.

## Tasks

- Add deterministic fake async adapter fixture with delayed terminal status and
  trace refs.
- Implement trace-link wait behavior.
- Implement exclusion from optimizer reflection when trajectory evidence is
  required but missing.
- Add tests for terminal output-ref path.

## Acceptance

- Long-running adapter executions poll until terminal or timeout.
- Terminal trace refs link item runs to stored traces.
- Missing trace refs do not crash the run; the item is scored from terminal
  output when possible and excluded from optimizer reflection when required.
- Adapter-returned spans/step lists are ignored or rejected as primary evidence.
- Success path: async adapter completion links terminal output to OTLP trace
  evidence.
- Failure path: timeout, cancellation, missing trace evidence, and invalid
  terminal responses map to typed item/run problems.

## Acceptance Test Matrix

| Path | Test |
| --- | --- |
| Async adapter success | `go test -tags surrealdb ./core/ai-eval-runner/...` |
| Missing trace evidence | `go test -tags surrealdb ./core/ai-eval-runner/...` |
| Output ref terminal result | `go test -tags surrealdb ./core/ai-eval-runner/...` |

## Operational Path Coverage

- Recovery: timeout, cancellation, missing trace, and delayed trace persistence
  are covered.
- Security/privacy: runner never fetches customer context outside the adapter.
- Observability: adapter calls preserve W3C trace context.

## Verification

```sh
go test -tags surrealdb ./core/ai-eval-runner/...
bun run contracts:check
git diff --check -- core/ai-eval-runner
```

## Non-goals

- Do not implement customer adapter servers.
- Do not add required CloudGrid span attributes.
- Do not change optimizer edit policy.

## Handoff

TICKET-304 and TICKET-305 may rely on this trace-link behavior after it passes.
