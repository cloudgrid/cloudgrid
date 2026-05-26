# TICKET-207: Cross-Service Readiness Startup And Shutdown Lifecycle

Status: ready
Owner: lifecycle-agent
Depends on: `TICKET-202`, `TICKET-203`, `TICKET-204`, `TICKET-205`, `TICKET-210`

## Goal

Make service composition roots consistently implement the resilience spec for
startup dependency behavior, `/livez`, `/readyz`, and shutdown order.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/04-backend/runtime-configuration.md`
- `specs/04-backend/backend-architecture.md`
- `apps/backend/src/graphql.ts`
- `apps/backend/src/health.ts`
- `apps/backend/src/index.ts`
- `core/otlp-collector/cmd/otlp-collector/main.go`
- `core/control-plane/cmd/control-plane/main.go`
- `core/storage-read/cmd/storage-read/main.go`
- `core/storage-write/cmd/storage-write/main.go`

## Write Scope

- `apps/backend/src`
- `core/otlp-collector/cmd/otlp-collector`
- `core/control-plane/cmd/control-plane`
- `core/storage-read/cmd/storage-read`
- `core/storage-write/cmd/storage-write`
- `core/go-runtime`
- `plans/service-resilience-hardening/code-review-findings.md`
- focused tests under touched packages
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Parse and validate `CLOUDGRID_RUNTIME_STARTUP_DEPENDENCY_MODE`.
2. Keep the default behavior fail-fast unless the spec or packaging selects
   `wait-for-ready` for local development.
3. Ensure `/livez` is process-only and `/readyz` checks only local direct
   dependencies.
4. Make readiness checks bounded and side-effect-free.
5. Implement shutdown order: mark unready, stop accepting new work, cancel
   loops, drain NATS, close SurrealDB, flush self-observability best-effort.
6. Prove close/drain/stop calls are idempotent.

## Acceptance

- Health tests prove liveness stays ok while dependencies are degraded.
- Readiness tests prove NATS/SurrealDB degraded and recovered states.
- Shutdown tests prove no loop writes to closed clients after shutdown begins.
- Startup dependency mode tests cover valid defaults and invalid config.

## Verification

```sh
bun test apps/backend/src/health.test.ts apps/backend/src/index.test.ts
go test -tags surrealdb ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```
