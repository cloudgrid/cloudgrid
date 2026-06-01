---
title: Implementation Evidence Closure
status: complete
updated: 2026-05-28
---

# Implementation Evidence Closure

## Scope

This evidence pass closes the repository-local implementation, evidence, and
planning gaps that remained after the enterprise spec readiness review.

## Closed Items

| Item | Closure evidence |
| --- | --- |
| FEUX planning | `plans/frontend-ux-implementation/` now contains an executable implementation plan, registry, dependency graph, status file, scope file, four wave plans, and twelve tickets. `node /Users/sebastianwessel/.agents/skills/spec-implementation-planner/references/check_plan.mjs . plans/frontend-ux-implementation specs` passed. |
| IR-001 retention | SurrealDB adapter query execution now passes live SurrealDB v3 coverage for every executable retention data class, soft delete/final delete, dry-run mutation checks, audit rows, and lease contention/reacquire. |
| IR-009 self-observability | BFF, collector, control-plane, storage-read, storage-write, and AI-eval runner trace/log exporter and failure-log tests pass. The normal Logs UI now has focused coverage for CloudGrid service log rows and trace/span pivots. |
| AI provider and AI Chat response contracts | Named AsyncAPI response contracts now have matching Go response types, control-plane NATS handlers return those response types, and `contracts:check` guards the response type presence. |
| Error taxonomy drift guard | `contracts:check` now parses every `errors.yaml` entry and requires matching runtime problem and backend bridge-schema literals. Runtime and bridge tests cover AI Eval taxonomy mapping. |
| IR-011 SurrealDB 3.1 baseline | Local Compose, release Compose, Helm bundled evaluation values, env examples, README, integration runner defaults, specs, and operator docs now target `surrealdb/surrealdb:v3.1.0`; storage-owning clients bootstrap missing namespaces/databases before schema work; upgrade validation and dashboard metric migration concerns are documented. |

## Commands

```sh
node /Users/sebastianwessel/.agents/skills/spec-implementation-planner/references/check_plan.mjs . plans/frontend-ux-implementation specs
go test -tags surrealdb ./core/storage-maintenance/internal/adapters/surrealdb
CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true go test -count=1 -tags surrealdb ./core/storage-maintenance/internal/adapters/surrealdb
CLOUDGRID_ENABLE_SURREALDB_STORAGE_WRITE_TESTS=true go test -count=1 -tags surrealdb ./core/storage-write/internal/adapters/surrealdb
CLOUDGRID_ENABLE_SURREALDB_CONTROL_TESTS=true go test -count=1 -tags surrealdb ./core/control-plane/internal
go test -tags surrealdb ./core/storage-read/... ./core/storage-maintenance/... ./core/storage-write/internal/adapters/surrealdb ./core/control-plane/internal/adapters/surrealdb
bun test apps/backend/src/self-observability.test.ts apps/frontend/test/logs-route.test.tsx
go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/... ./core/ai-eval-runner/...
bun test tooling/scripts/bench.test.mjs
bun run contracts:check
go test -tags surrealdb ./core/control-plane/... ./core/go-contracts/...
bun test apps/packages/runtime/src/problem.test.ts apps/backend/src/bridge.test.ts
go test -tags surrealdb ./core/ai-eval-runner/internal/runtime
bun run typecheck
bun run lint
git diff --check
```

## Remaining External Evidence

`IR-004` remains `blocked-by-environment`: production benchmark evidence must be
run against the exact deployment being promoted with
`CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like`,
`CLOUDGRID_BENCH_ENVIRONMENT_ID`, and `CLOUDGRID_BENCH_IMAGE_TAG`. The local
benchmark harness tests pass, but they are not production readiness evidence for
a promoted environment.
