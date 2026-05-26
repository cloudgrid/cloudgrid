# TICKET-209: BFF WebSocket Limits And Subscription Lifecycle

Status: ready
Owner: bff-agent
Depends on: `TICKET-205`

## Goal

Make GraphQL WebSocket and live subscription handling bounded, cancellable, and
safe during shutdown so one client or one malformed message cannot create
unbounded event-loop work or leave bridge work running after disconnect.

## Read Scope

- `specs/06-nfr/service-resilience-self-healing.md`
- `specs/06-nfr/performance-and-scaling.md`
- `specs/04-backend/backend-architecture.md`
- `specs/04-backend/runtime-configuration.md`
- `apps/backend/src/graphql-ws.ts`
- `apps/backend/src/graphql.ts`
- `apps/backend/src/index.ts`
- `apps/backend/src/bridge.ts`
- `apps/backend/src/bridge/adapters/nats.ts`

## Write Scope

- `apps/backend/src`
- focused BFF tests under `apps/backend/src`
- `plans/service-resilience-hardening/_status.yaml`

## Implementation Approach

1. Add explicit GraphQL WebSocket raw message size and per-socket operation
   limits, using configured service-level defaults where possible.
2. Apply the same query validation posture to WebSocket operations that HTTP
   GraphQL requests receive, including parse/validation failure containment.
3. Ensure every subscription operation owns a cancellation path and that
   `iterator.return()` is awaited or otherwise observed with bounded cleanup.
4. Track active WebSocket operations in the server lifecycle so shutdown stops
   accepting new WebSocket work before the bridge is drained.
5. Classify WebSocket close reasons and log only state changes or bounded
   diagnostic detail for malformed payloads and subscription failures.
6. Add tests for oversized messages, excessive operations, malformed payloads,
   subscription iterator failure, client disconnect, and server shutdown.

## Acceptance

- A single WebSocket client cannot create unbounded operations, unbounded raw
  payload parsing, or unbounded validation/logging work.
- Malformed WebSocket messages close or reject only the affected socket or
  operation and do not surface as process-level unhandled rejections.
- Subscription iterator errors are mapped to canonical GraphQL errors or
  protocol close behavior without leaking bridge resources.
- Server shutdown cancels active WebSocket operations before closing or draining
  the NATS bridge.
- Tests prove disconnect and shutdown cleanup without sleeping for production
  timeout intervals.

## Verification

```sh
bun test apps/backend/src/graphql-ws.test.ts apps/backend/src/bridge.test.ts apps/backend/src/index.test.ts
```
