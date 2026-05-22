# AI Eval Implementation Plan

Status: active
Source specs: `specs/.readiness-report.yaml` scope `ai_evaluation_parallel_agent_finalization`.

## Goal

Implement AI Eval v1 from the finalized specs with parallel agents and explicit progress tracking.

## Progress Model

Progress is tracked in:

- `plans/_status.yaml`: ticket state, owner, current evidence, and next unblocker.
- `plans/_dependencies.yaml`: dependency graph and unblocked tickets.
- `plans/_registry.yaml`: ticket inventory and file locations.
- Each ticket frontmatter: source of truth for local status before registry sync.

Allowed ticket statuses are `ready`, `in_progress`, `review`, `done`, `blocked`, and `skipped`.

## Wave Overview

1. `wave_01_contracts`: contract generation and drift guard foundation.
2. `wave_02_storage`: storage-write and storage-read AI Eval persistence/query slices.
3. `wave_03_runner_harness`: runner orchestration and harness adapter lifecycle.
4. `wave_04_bff`: BFF GraphQL bridge and validation.
5. `wave_05_frontend`: AI Eval frontend views and interaction flows.
6. `wave_06_integration`: end-to-end gates, documentation, and final readiness evidence.

## Parallel Rules

Agents work inside one ownership boundary at a time. Same-wave parallel tickets have disjoint write scopes. Shared contracts are completed before service, BFF, runner, or frontend tickets start.

## Required Global Verification

Default gates are hermetic:

```sh
bun run contracts:check
bun run typecheck
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
```

External provider, durable replay infrastructure, cloud storage, and production benchmark checks are opt-in only and are not part of default completion.

## Completion Rule

The plan is complete when all tickets are `done`, default gates pass, and `plans/_status.yaml` records final evidence for each ticket.
