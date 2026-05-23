# Service Resilience Hardening Code Review Findings

Date: 2026-05-23
Status: planning input

This review focused on robustness, self-healing, recovery, async/blocking
behavior, and health semantics in the TypeScript BFF and Go services. It did
not attempt to fix the reported dashboard validation bug directly.

## Highest-Risk Findings

1. BFF bridge response validation failures are still too close to transport
   failures.
   `apps/backend/src/bridge.ts` maps unexpected bridge failures through a broad
   timeout/unavailable path, and response schema drift can surface as
   `MESSAGE_BRIDGE_UNAVAILABLE`. This hides whether the service is down or the
   response contract is invalid.

2. NATS readiness is weak in several composition roots.
   `apps/backend/src/bridge/adapters/nats.ts`,
   `core/control-plane/cmd/control-plane/main.go`,
   `core/storage-read/cmd/storage-read/main.go`, and
   `core/storage-write/cmd/storage-write/main.go` mostly check whether the
   connection is closed. That does not prove the connection is currently
   operational, flushed, reconnected, or able to serve request/reply traffic.

3. Go NATS callbacks lack a consistent panic boundary.
   `core/control-plane/internal/nats_adapter.go`,
   `core/storage-read/internal/nats_adapter.go`, and
   `core/storage-write/cmd/storage-write/nats_adapter.go` adapt NATS callbacks
   directly. A handler panic can threaten the service process or leave the
   request without a canonical error response.

4. SurrealDB clients do not currently have an explicit reconnect manager.
   Storage-read, storage-write, and control-plane open SDK clients at startup
   and use readiness checks, but reconnect and degraded/recovered state
   transitions are not modeled as first-class behavior.

5. Storage-write consumer failure classification is too coarse.
   `core/storage-write/internal/ingest/nats_consumer.go` treats non-timeout
   fetch failures as fatal. Temporary JetStream or NATS disconnects can exit the
   consumer loop instead of entering degraded state and recovering.

6. BFF GraphQL WebSocket work is not sufficiently bounded.
   `apps/backend/src/graphql-ws.ts` has no explicit raw message size limit,
   per-socket operation limit, subscription depth/complexity guard, or awaited
   iterator cleanup. A single client can create many long-lived async loops and
   increase event-loop pressure.

7. Health endpoints can perform work that contends with normal traffic.
   Go health checks call SDK-backed readiness methods. In control-plane and
   storage-write, SDK operations are protected by broad mutexes, so readiness
   can queue behind normal traffic or schema work. Health should be bounded,
   side-effect-free, and avoid becoming another overload vector.

8. Several background loops do not have explicit cancellation or panic
   containment.
   Examples include storage-read live trace heartbeats, control-plane invitation
   email worker ticks, storage-write advisory responders, and self-observability
   exporter loops. Most have partial context or stop-channel handling, but the
   implementation is inconsistent and not fully tested.

9. In-flight request limits are missing at service boundaries.
   OTLP HTTP/gRPC handlers have size and decoded-count limits, but not explicit
   in-flight concurrency limits. Go NATS request/reply handlers and BFF
   WebSocket subscriptions also need bounded concurrency or backpressure.

10. Shutdown ordering needs stronger proof.
    Services should mark unready, stop accepting new work, cancel loops, drain
    NATS, close SurrealDB, and flush self-observability best-effort. The current
    code has pieces of this behavior, but not consistently or with tests that
    prove no goroutine writes to closed clients after shutdown starts.

## BFF Review Notes

- `apps/backend/src/index.ts` stops the HTTP server and closes the bridge, but
  active WebSocket operations are not tracked as a shutdown resource with a
  bounded close deadline.
- `apps/backend/src/graphql-ws.ts` stores operations in an unbounded map, parses
  client-provided query text directly, and starts one async loop per operation.
- `apps/backend/src/bridge/adapters/nats.ts` does not configure reconnect
  callbacks, state-change logging, flush-based readiness, or subscription
  callback error reporting.
- `apps/backend/src/bridge.ts` already has subscription queue/watchdog logic,
  but the bridge still needs clearer classification for response validation,
  transport closed, no responders, timeout, and malformed payload.
- `apps/backend/src/health.ts` delegates to bridge health, so readiness quality
  depends on making bridge health operational instead of closed/not-closed.

## Go Service Review Notes

- `core/otlp-collector` has stronger payload bounds than the other services,
  but still needs explicit in-flight limits and local NATS recovery semantics.
- `core/control-plane` startup is fail-fast on SurrealDB and NATS. Readiness
  also validates self-observability project config by querying local storage in
  deployed mode, which should be bounded and not turn health into a heavy path.
- `core/storage-read` starts live trace heartbeat work without an obvious
  service-lifecycle cancellation handle.
- `core/storage-write` exits the process on consumer non-context errors from a
  goroutine. Temporary NATS/JetStream failures should degrade readiness and
  retry with bounded backoff unless classified fatal.
- SurrealDB adapter mutexes currently serialize SDK use across normal
  operations and readiness. That is defensible if the SDK requires it, but the
  plan needs tests around contention, timeouts, and health starvation.

## Plan Coverage Added From This Review

- `TICKET-209` covers BFF WebSocket limits, subscription lifecycle, and shutdown
  cleanup.
- `TICKET-210` covers Go health checker panic recovery, configurable readiness
  timeouts, health-side contention, and composition-root config plumbing.
- `TICKET-208` remains the cross-service async/blocking saturation ticket and
  should verify the concrete risks listed above after adapter-level tickets are
  implemented.
- `TICKET-206` must include recovery scenarios that distinguish transport
  outage, schema/contract drift, dependency timeout, and overload/backpressure.
