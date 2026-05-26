# TICKET-203: SurrealDB Reconnect Managers And Readiness

Status: ready
Owner: surrealdb-agent
Depends on: `TICKET-201`

## Goal

Add SurrealDB runtime reconnect behavior behind existing storage/control-plane
adapter boundaries without leaking credentials or changing service ownership.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/04-backend/backend-architecture.md`
- `specs/04-backend/runtime-configuration.md`
- `specs/04-backend/surrealdb-persistence.md`
- `specs/04-backend/surrealdb-tenancy-and-modeling.md`
- `core/control-plane/internal/adapters/surrealdb`
- `core/storage-read/internal/adapters/surrealdb`
- `core/storage-write/internal/adapters/surrealdb`

## Write Scope

- `core/control-plane/internal/adapters/surrealdb`
- `core/storage-read/internal/adapters/surrealdb`
- `core/storage-write/internal/adapters/surrealdb`
- `core/control-plane/cmd/control-plane`
- `core/storage-read/cmd/storage-read`
- `core/storage-write/cmd/storage-write`
- focused Go tests under touched packages
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Add a small reconnecting client manager per adapter package or a shared
   helper only if it does not blur storage/control-plane boundaries.
2. Reopen, authenticate, and select namespace/database as one operation.
3. Return retryable `ERR-006` while reconnecting.
4. Re-run readiness checks before reporting ready.
5. Keep schema initialization idempotent and only in services that own schema
   initialization.
6. Ensure readiness checks are side-effect-free and cannot block normal
   operations indefinitely through global locks.
7. Separate storage-read readiness verification from schema repair.

## Acceptance

- Fake-driven tests prove disconnect, reconnect, auth failure, readiness
  degraded, and readiness recovered states.
- No service falls back to memory or stale cached data.
- SurrealDB credentials are not logged.
- Storage-write does not ack uncertain writes.
- Slow-readiness or lock-contention fakes prove health checks do not starve
  normal query/write operations.
- Reconnect re-runs idempotent schema initialization only in storage-write and
  control-plane.

## Verification

```sh
go test -tags surrealdb ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```
