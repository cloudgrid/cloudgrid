---
id: CAP-OBS-006
title: Subscribe to live traces
domain: observability-data
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-10
provenance: user-directed
traits:
  interaction: websocket
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [CAP-STO-002]
implements:
  api: [GQL-Subscription-liveTraces, MSG-telemetry-traces-live-start, MSG-telemetry-traces-live-stop, MSG-telemetry-traces-live-events, MSG-telemetry-persisted-traces]
  events_published: [LiveTraceEvent]
  events_consumed: [TracePersistedNotification]
  jobs: []
  webhooks: []
  streams: []
invariants:
  idempotent: false
  side_effects_reversible: true
  tenant_scoped: prepared
sla:
  p99_ms: 3000
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-OBS-006-01
    kind: happy-path
    given: A GraphQL client opens Subscription.liveTraces with service and status filters
    when: Storage-write persists a matching trace and publishes TracePersistedNotification
    then: Storage-read resolves the trace through read query semantics and the client receives one LiveTraceEvent containing TraceSummary
  - id: AC-CAP-OBS-006-02
    kind: boundary
    given: A GraphQL live subscription is active
    when: The BFF handles the subscription
    then: The BFF only uses telemetry.traces.live.start, a storage-read ephemeral sink subject, and telemetry.traces.live.stop; it does not consume TELEMETRY_INGEST or telemetry.persisted.traces
  - id: AC-CAP-OBS-006-03
    kind: future-security
    given: Future read authorization denies a principal access to the requested project or filter scope
    when: The client starts Subscription.liveTraces
    then: The BFF returns GraphQL error ERR-016 FORBIDDEN and storage-read does not register the live subscription
---

# Subscribe To Live Traces

## Business Intent

Let engineers watch traces appear in realtime while keeping all telemetry read semantics and future read authorization inside storage-read.

## Public Contract

The only public realtime API is GraphQL `Subscription.liveTraces(input: LiveTraceInput = {}): LiveTraceEvent!`.

`LiveTraceInput` uses concise field names aligned with `TraceSearchInput`:

- `service`
- `query`
- `operationName`
- `spanName`
- `from`
- `status`
- `minDurationMs`
- `maxDurationMs`
- `attributes`
- `limit`

`LiveTraceInput` does not include `to`, `sort`, or `cursor`. Historical closed-range exploration uses `Query.traces`.

If `from` is omitted, storage-read does not synthesize a subscription-start
`startedAt` filter. The live stream is bounded by volatile post-persist
notifications rather than historical notification replay, so freshly persisted
OTLP traces are eligible even when their span timestamps predate the WebSocket
subscription by a small exporter or batching delay.

`LiveTraceEvent` fields:

- `type`: `snapshot`, `added`, `updated`, or `heartbeat`
- `seq`: monotonically increasing per subscription
- `receivedAt`: storage-read event timestamp in UTC
- `trace`: present for `snapshot`, `added`, and `updated`; absent for `heartbeat`

## Internal Contract

1. BFF validates the GraphQL input and creates a BFF-local ephemeral NATS sink subject.
2. BFF sends `LiveTraceStartRequest` to `telemetry.traces.live.start` with `subscriptionId`, `sinkSubject`, normalized `query`, and normalized `authContext`.
3. Storage-read validates the query, applies read authorization when auth context is present or auth mode is not disabled, registers the subscription, optionally sends a bounded `snapshot`, and responds with `LiveTraceStartData`.
4. Storage-write publishes volatile `TracePersistedNotification` messages to core NATS subject `telemetry.persisted.traces` only after trace persistence succeeds.
5. Storage-read receives currently delivered `telemetry.persisted.traces` hints, narrows by trace ID, reuses trace search semantics to load matching `TraceSummary` records, assigns `seq`, and publishes `LiveTraceEvent` to the sink subject.
6. BFF forwards events to the GraphQL subscription stream and sends `LiveTraceStopRequest` when the GraphQL operation ends.

## Filter Changes

The frontend changes live server filters by starting a new `liveTraces` subscription operation on the existing GraphQL WebSocket connection when supported by the GraphQL client. The previous operation is stopped with `telemetry.traces.live.stop`.

The UI may preserve a bounded local display buffer across operation restarts. Newly delivered events must always match the active server-side `LiveTraceInput` evaluated by storage-read.

## Security Preparation

CloudGrid will enforce two separate decisions later:

- Ingestion authorization: whether a principal or token may publish OTLP telemetry into a tenant/project.
- Read authorization: whether a principal may query or subscribe to telemetry for a tenant/project and filter scope.

Live trace subscriptions are read operations. The BFF attaches read claims to `BridgeEnvelope.authContext`; storage-read verifies those claims before registering the subscription and before emitting events whenever auth context is present or auth mode is not disabled. Denials map to ERR-015 or ERR-016.

## Non-Goals

- No public Server-Sent Events endpoint.
- No frontend NATS connection.
- No BFF JetStream consumer for ingest or persisted notifications. Persisted trace notifications are volatile live hints, not durable telemetry state.
- No replay by `seq` in MVP.
- No live logs subscription until a separate GraphQL field and message contract are specified.
