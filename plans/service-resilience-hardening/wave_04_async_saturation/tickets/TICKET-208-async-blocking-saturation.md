# TICKET-208: Async Blocking Saturation And Event-Loop Protection

Status: ready
Owner: async-saturation-agent
Depends on: `TICKET-202`, `TICKET-203`, `TICKET-204`, `TICKET-205`, `TICKET-209`

## Goal

Audit and enforce bounded async/blocking behavior across BFF and Go services so
recovery paths do not introduce process starvation, unbounded queues, runaway
goroutines, or log storms.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/06-nfr/performance-and-scaling.md`
- `specs/04-backend/runtime-configuration.md`
- `apps/backend/src`
- `core/go-runtime`
- `core/otlp-collector`
- `core/control-plane`
- `core/storage-read`
- `core/storage-write`

## Write Scope

- `apps/backend/src`
- `core/go-runtime`
- `core/otlp-collector`
- `core/control-plane`
- `core/storage-read`
- `core/storage-write`
- focused tests under touched packages
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Add or wire runtime parsing for service-level in-flight, health timeout, and
   log state-change interval limits.
2. Verify BFF request parsing, bridge response validation issue logging,
   subscription async queues, watchdog timers, WebSocket operation limits, and
   sink iterator failure paths are bounded after `TICKET-209`.
3. Bound Go request/reply handler concurrency where NATS can dispatch
   callbacks faster than the service can process them.
4. Ensure storage-write worker fan-out, SurrealDB query concurrency, health
   lock waits, reconnect loops, timers, and tickers are all bounded and
   cancellable.
5. Add state-change or rate-limited logging for retry loops and dependency
   outage paths.
6. Add fake-driven tests that force saturation without real Docker/NATS/DB.

## Acceptance

- Oversized BFF request bodies and huge validation issue lists are rejected or
  capped without unbounded CPU/log work.
- BFF subscription queue saturation closes only the affected subscription.
- Go callback concurrency limits return canonical retryable errors or apply
  bounded backpressure.
- Slow readiness and SDK-client lock contention do not starve normal operations
  in tests.
- Retry loops and repeated outage logs are rate-limited or state-change based.
- Timers/tickers are stopped and cancellation tests do not sleep for production
  intervals.

## Verification

```sh
bun test apps/backend/src
go test -tags surrealdb ./core/go-runtime/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```
