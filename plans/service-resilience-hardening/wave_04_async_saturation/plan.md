# Wave 04: Async Saturation

Status: ready
Tickets: `TICKET-209`, `TICKET-208`

## Goal

Make BFF subscription lifecycle and cross-service blocking behavior explicit
and bounded after adapter-level resilience is implemented.

## Exit Criteria

- BFF event-loop and subscription queues are bounded.
- BFF WebSocket operation count, message size, cleanup, and shutdown behavior
  are bounded.
- Go NATS callbacks, worker pools, timers, and SurrealDB locks are bounded.
- Saturation returns canonical errors or backpressure instead of unbounded
  latency, memory growth, goroutines, or logs.
