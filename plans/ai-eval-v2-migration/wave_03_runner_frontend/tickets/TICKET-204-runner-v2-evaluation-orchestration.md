---
id: TICKET-204
title: AI Eval runner v2 evaluation orchestration
wave: 3
status: ready
parallel_group: ai_eval_v2_runner_frontend_parallel
depends_on: [TICKET-202, TICKET-203]
blocked_by: []
spec_refs:
  - specs/01-domains/ai-eval.md
  - specs/04-backend/ai-eval-runner.md
  - specs/06-nfr/ai-eval-content-capture.md
  - specs/06-nfr/ai-eval-cost-bounds.md
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
write_scope:
  - core/ai-eval-runner
  - core/go-contracts
read_scope:
  - specs/spec.md
  - specs/00-conventions.md
  - specs/01-domains/ai-eval.md
  - specs/04-backend/ai-eval-runner.md
  - specs/06-nfr/ai-eval-content-capture.md
  - specs/06-nfr/ai-eval-cost-bounds.md
  - specs/03-contracts/messages/message-bridge.asyncapi.yaml
  - core/ai-eval-runner
contract_readiness:
  status: ready
  required_contracts:
    - EvaluationRunStartRequest
    - EvaluationRunControlRequest
    - EvaluationResultsPersistRequest
    - EvalLiveStartRequest
    - EvaluationRunEvent
  missing_contracts: []
ticket_readiness:
  status: implementation_ready
  open_decisions: []
  decision_source: spec
  ambiguous_phrases: []
---

## Goal

Replace legacy experiment orchestration with v2 evaluation run orchestration,
including adapter execution, metric results, trajectory capture, quick-shot, and
retention roles.

## Context Digest

Runner executes evaluation runs against dataset item revisions and target
snapshots. External adapters use the specified HTTP/webhook protocol and W3C
trace context. Runner captures full trace refs and bounded row summaries.
Optimization wraps dataset evaluation and quick-shot runs. Runner persists
results through message bridge subjects, not direct database writes.

execution_semantics: async run orchestration with NATS request/reply control and
live event publication.

## Implementation Approach

Update runner runtime handlers, orchestrator ports, harness adapter calls,
result persistence calls, pause/resume/cancel behavior, and tests. Rename public
runtime concepts from experiment to evaluation in active code paths.

## Decision Ledger

- Input/final output evaluation and trajectory capture are both required per
  evaluation item run. Source: domain and runner specs.
- Quick-shot selects a subset and stores `retentionRole: quick_shot`. Source:
  optimization section.
- External adapter calls propagate `traceparent` and `tracestate`. Source:
  runner spec.
- Large traces are summarized and full trace refs are stored. Source: content
  capture NFR.

## Contract Traceability

- AsyncAPI run start/control/live/result subjects.
- Entity schemas for evaluation run, item run, metric result, target snapshot,
  optimization run.
- Go contracts in `core/go-contracts`.

## Tasks

1. Replace experiment start/pause/resume/cancel handlers with evaluation run
   handlers.
2. Resolve dataset version, selected item revisions, and target snapshot before
   execution.
3. Execute internal harness or external adapter and collect actual output.
4. Capture trace refs, trajectory summary, important steps, and conversation ref.
5. Persist item runs, metric results, aggregates, run summary, and live events.
6. Add quick-shot subset execution and optimization validation run support.

## Acceptance

- Happy path: evaluation run completes and persists item runs plus metric
  results.
- Failure path: adapter timeout, invalid actual output, and metric config error
  create typed metric problems.
- Pause/resume uses checkpoint/drain behavior from spec.
- Runner emits v2 live events and no legacy experiment progress events.

## Acceptance Test Matrix

- Run lifecycle: `go test -tags surrealdb ./core/ai-eval-runner/...`.
- Adapter timeout and invalid output: runner focused tests.
- Live events: runtime bridge tests.
- Contract conformance: `bun run contracts:check`.

## Verification

Default:

```sh
bun run contracts:check
go test -tags surrealdb ./core/ai-eval-runner/...
```

Opt-in external:

```sh
CLOUDGRID_EVAL_EXTERNAL_ADAPTER_TEST=1 go test -tags surrealdb ./core/ai-eval-runner/...
```

## Non-goals

- No frontend changes.
- No storage schema ownership changes beyond using existing v2 contracts.
- No production measurement loop.

## Handoff

Integration agents can rely on completed v2 run lifecycle, persisted results,
and live event stream behavior.
