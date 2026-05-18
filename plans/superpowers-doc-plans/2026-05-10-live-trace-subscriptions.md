# Live Trace Subscriptions Implementation Plan

> Status: superseded by current implementation. Do not execute the unchecked
> boxes as pending work without first re-auditing `Subscription.liveTraces`,
> storage-read live sessions, and storage-write post-persist notifications. This
> file remains historical planning context only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement trace-level realtime telemetry via GraphQL subscriptions while keeping live matching and authorization preparation in storage-read.

**Architecture:** The frontend opens `Subscription.liveTraces` against the BFF. The BFF validates subscription input, starts a storage-read live session over NATS, forwards storage-read events, and stops the session on unsubscribe. Storage-write publishes post-persist trace notifications; storage-read consumes those notifications, resolves matching `TraceSummary` values through existing read semantics, and emits live events to BFF-owned sink subjects.

**Tech Stack:** Bun, TypeScript, GraphQL Yoga, Hono, NATS, React/Vite, TanStack Query, Go, NATS JetStream.

---

### Task 1: Shared Contracts And Gates

**Files:**
- Modify: `apps/packages/ui-contracts/src/index.ts`
- Modify: `core/go-contracts/contracts.go`
- Modify: `tooling/scripts/check-contracts.mjs`
- Verify: `bun run contracts:check`, `bun run --filter @cloudgrid/ui-contracts typecheck`, `go test ./core/go-contracts/...`

- [ ] Add live trace input/event, auth context, start/stop, persisted notification, and event contract types to shared TS/Go contract outputs.
- [ ] Strengthen contract drift checks so live GraphQL fields, AsyncAPI channels, JSON schema, UI types, and Go types are required.
- [ ] Verify the shared contract packages compile.

### Task 2: Storage-Write Post-Persist Notifications

**Files:**
- Modify: `core/storage-write/internal/ingest/handler.go`
- Modify: `core/storage-write/internal/ingest/consumer.go`
- Modify: `core/storage-write/internal/ingest/handler_test.go`
- Modify as needed: `core/storage-write/internal/ports/*.go`
- Verify: `go test ./core/storage-write/...`

- [ ] Write failing tests proving trace notifications are published only after successful persistence and are not published for duplicates, validation failures, or storage failures.
- [ ] Add a notification publisher abstraction that publishes `TracePersistedNotification` to `telemetry.persisted.traces`.
- [ ] Wire the real NATS publisher in the storage-write consumer path.
- [ ] Keep notification payloads limited to command ID, trace IDs, persisted timestamp, and service-name hints.

### Task 3: Storage-Read Live Registry And Fanout

**Files:**
- Modify: `core/storage-read/internal/nats.go`
- Modify: `core/storage-read/internal/ports/store.go`
- Create: `core/storage-read/internal/live.go`
- Create/modify tests: `core/storage-read/internal/*live*_test.go`
- Modify as needed: `core/storage-read/internal/adapters/surrealdb/query.go`
- Verify: `go test -tags surrealdb ./core/storage-read/...`

- [ ] Write failing tests for live start, stop, heartbeat/event sequencing, notification candidate resolution, filter matching, and subscription limits.
- [ ] Register `telemetry.traces.live.start` and `telemetry.traces.live.stop` request/reply handlers.
- [ ] Add a live subscription registry owned by storage-read.
- [ ] Add notification handling that resolves candidate trace IDs through storage-read query semantics and publishes `LiveTraceEvent` to sink subjects.
- [ ] Ensure stop is idempotent and unknown stop requests succeed.

### Task 4: BFF GraphQL Subscription Transport

**Files:**
- Modify: `apps/backend/src/bridge.ts`
- Modify: `apps/backend/src/graphql.ts`
- Modify: `apps/backend/src/validation.ts`
- Modify/create tests: `apps/backend/src/graphql*.test.ts`, `apps/backend/src/bridge*.test.ts`
- Verify: `bun test apps/backend/src`, `bun run --cwd apps/backend typecheck`

- [ ] Write failing tests proving `liveTraces` validates input, sends live start, yields events, forwards heartbeats, sends stop on iterator return, maps bridge errors, and never uses ingest/persisted stream subjects.
- [ ] Add live start/stop methods to `TelemetryQueryBridge`.
- [ ] Implement a NATS-backed async iterator for storage-read live events.
- [ ] Add `Subscription.liveTraces` resolver in GraphQL Yoga.
- [ ] Keep BFF behavior to validation, mapping, transport lifecycle, and error mapping only.

### Task 5: Frontend Live Trace Route

**Files:**
- Modify: `apps/frontend/src/lib/graphql-client.ts`
- Modify: `apps/frontend/src/routes/app-shell.tsx`
- Modify: `apps/frontend/src/main.tsx`
- Update: `apps/frontend/src/routes/traces-route.tsx` or the current trace workspace route module to add a live mode.
- Create tests under: `apps/frontend/test` or existing route/unit test locations
- Verify: `bun test apps/frontend/test`, `bun run --cwd apps/frontend typecheck`

- [ ] Add a small GraphQL subscription client using the BFF `/graphql` WebSocket endpoint.
- [ ] Add live trace receiving as a mode inside `/traces`; do not add a primary `/live` route or app-shell navigation entry.
- [ ] Render live trace rows with connection states, pause/resume rendering, clear buffer, and server filter restart semantics.
- [ ] Keep the local buffer bounded by `LiveTraceInput.limit`.
- [ ] Add tests for event buffering, pause/resume, and subscription restart on filter changes.

### Task 6: Verification And Coverage

**Files:**
- Modify as needed: root/package scripts, docs, `.agent/IMPLEMENTATION.md`, `AGENTS.md`, `CLAUDE.md`
- Verify: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run contracts:check`, `go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/...`

- [ ] Add coverage commands or documented commands for BFF and Go backend packages.
- [ ] Run focused package coverage and raise backend coverage above 80% where the repository tooling can measure it.
- [ ] Run full typecheck, lint, tests, contract check, and Go workspace tests.
- [ ] Update specs or agent guidance if implementation reveals a gap.
