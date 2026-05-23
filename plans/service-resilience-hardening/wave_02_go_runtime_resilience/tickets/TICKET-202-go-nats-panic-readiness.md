# TICKET-202: Go NATS Resilience And Panic Containment

Status: ready
Owner: go-nats-agent
Depends on: `TICKET-201`

## Goal

Harden Go NATS adapters so callback panics, reconnect events, async errors, and
subscription readiness are contained and observable.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/04-backend/backend-architecture.md`
- `specs/04-backend/runtime-configuration.md`
- `core/control-plane/internal/nats_adapter.go`
- `core/storage-read/internal/nats_adapter.go`
- `core/storage-write/cmd/storage-write/nats_adapter.go`
- `core/otlp-collector/internal/collector/nats_publisher.go`
- `core/go-runtime`

## Write Scope

- `core/go-runtime`
- `core/control-plane/internal/nats_adapter.go`
- `core/control-plane/cmd/control-plane`
- `core/storage-read/internal/nats_adapter.go`
- `core/storage-read/cmd/storage-read`
- `core/storage-write/cmd/storage-write/nats_adapter.go`
- `core/storage-write/internal/ingest`
- `core/otlp-collector/internal/collector/nats_publisher.go`
- focused Go tests under touched packages
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Add shared Go helper(s) for NATS connection state, callback logging, flush
   readiness, and panic recovery where reuse is clean.
2. Wrap request/reply handlers in control-plane and storage-read with recover
   logic that logs and responds with a canonical error when possible.
3. Wrap storage-write worker goroutines and NATS advisory/eval responders with
   recover logic.
4. Configure NATS disconnected/reconnected/closed/async-error callbacks and
   readiness state for every Go service.
5. Ensure readiness checks prove connected NATS state and bounded flush, not
   merely `!IsClosed()`.
6. Apply configured reconnect attempts and reconnect wait values.
7. Classify missing reply subjects, no responders, closed connection,
   permission errors, and async subscription errors without panics.

## Acceptance

- A panic in a request/reply handler does not crash the process in unit tests.
- NATS disconnect state makes `/readyz` degraded and reconnect restores it.
- Reconnect exhaustion makes readiness unavailable without corrupting in-flight
  handlers.
- Request/reply handlers without a reply subject log and return without
  panicking.
- Callback logs are structured and bounded.
- Existing message contracts and service boundaries remain unchanged.

## Verification

```sh
go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```
