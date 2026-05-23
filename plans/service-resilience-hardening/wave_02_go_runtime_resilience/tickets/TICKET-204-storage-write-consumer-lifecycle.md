# TICKET-204: Storage-Write Consumer Recovery And Lifecycle Cleanup

Status: ready
Owner: storage-write-agent
Depends on: `TICKET-201`

## Goal

Prevent storage-write from exiting on retryable JetStream fetch failures and
clean up long-lived goroutine lifecycle behavior.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/06-nfr/reliability-ingest-failure.md`
- `specs/06-nfr/performance-and-scaling.md`
- `core/storage-write/internal/ingest`
- `core/storage-write/cmd/storage-write`
- `core/storage-read/internal/nats_adapter.go`

## Write Scope

- `core/storage-write/internal/ingest`
- `core/storage-write/cmd/storage-write`
- `core/storage-read/internal/nats_adapter.go`
- focused Go tests under touched packages
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Classify JetStream fetch errors into normal timeout, retryable transient, and
   fatal configuration/consumer errors.
2. Keep the consumer loop alive for retryable transient errors using bounded
   backoff and structured logs.
3. Preserve existing ack-after-persist and `NakWithDelay` semantics.
4. Treat unknown SurrealDB commit outcomes as retryable and do not ack.
5. Add tests proving duplicate command detection prevents duplicate records
   after redelivery.
6. Add cancellation to long-lived heartbeat/background loops touched by the
   storage-write or storage-read lifecycle.
7. Ensure graceful shutdown stops loops before closing NATS clients.

## Acceptance

- Retryable fetch errors do not make `runWithRuntime` return fatal failure.
- Fatal consumer configuration errors still fail clearly.
- Storage-write redelivery tests still pass.
- Unknown write outcome tests prove no ack and later idempotent duplicate
  handling.
- Heartbeat/background goroutines stop in tests.

## Verification

```sh
go test -tags surrealdb ./core/storage-write/... ./core/storage-read/...
```
