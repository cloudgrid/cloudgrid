# TICKET-210: Go Health Config And Panic Safety

Status: ready
Owner: lifecycle-agent
Depends on: `TICKET-202`, `TICKET-203`, `TICKET-204`

## Goal

Make Go service health checks and composition-root resilience configuration
consistent, bounded, and panic-safe across collector, control-plane,
storage-read, and storage-write.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/04-backend/runtime-configuration.md`
- `core/go-runtime/health`
- `core/otlp-collector/cmd/otlp-collector`
- `core/control-plane/cmd/control-plane`
- `core/storage-read/cmd/storage-read`
- `core/storage-write/cmd/storage-write`
- `core/control-plane/internal/config`
- `core/storage-read/internal/config`
- `core/storage-write/internal/config`
- `core/otlp-collector/internal/config`

## Write Scope

- `core/go-runtime/health`
- `core/otlp-collector/cmd/otlp-collector`
- `core/control-plane/cmd/control-plane`
- `core/storage-read/cmd/storage-read`
- `core/storage-write/cmd/storage-write`
- `core/control-plane/internal/config`
- `core/storage-read/internal/config`
- `core/storage-write/internal/config`
- `core/otlp-collector/internal/config`
- focused Go tests under touched packages
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Parse the resilience runtime configuration variables defined in
   `specs/04-backend/runtime-configuration.md` in every Go service that owns a
   local dependency or health endpoint.
2. Replace hard-coded health check deadlines with configured bounded timeouts
   and tested defaults.
3. Add panic recovery inside health checker execution so a checker bug returns
   an unhealthy readiness result and structured log instead of relying on
   `net/http` panic behavior.
4. Ensure readiness checks are side-effect-free, use direct local dependencies
   only, and cannot wait indefinitely behind normal SurrealDB or NATS work.
5. Add tests for slow health checks, panicking health checks, invalid config,
   local dependency degraded/recovered transitions, and health requests during
   SDK lock contention.

## Acceptance

- `/livez` remains process-only and does not call NATS, SurrealDB, or other
  services.
- `/readyz` uses configured bounded timeouts and direct local dependency checks.
- A panicking readiness checker returns a controlled unhealthy response and does
  not crash the service.
- Invalid resilience config fails startup with a clear error.
- Health tests cover NATS degraded/recovered and SurrealDB degraded/recovered
  state without requiring another CloudGrid service to be healthy.

## Verification

```sh
go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```
