# Wave 02: Go Runtime Resilience

Status: ready
Tickets: `TICKET-202`, `TICKET-203`, `TICKET-204`

## Goal

Harden Go service adapters and lifecycle code while preserving existing service
boundaries.

## Parallelism

The NATS, SurrealDB, and storage-write consumer tickets can run in parallel
after `TICKET-201`, but agents must coordinate shared helper placement in
`core/go-runtime`.

## Exit Criteria

- Go NATS callbacks recover panics and expose meaningful readiness.
- SurrealDB adapters degrade and recover readiness after reconnect.
- Storage-write does not exit on retryable JetStream fetch errors.
- Long-lived goroutines have explicit cancellation paths.
