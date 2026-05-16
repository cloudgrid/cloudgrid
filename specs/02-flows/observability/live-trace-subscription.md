---
id: FLW-OBS-002
title: Live trace subscription
domain: observability-data
layer: flow
status: draft
owner: unknown@example.com
updated: 2026-05-10
provenance: user-directed
trigger:
  type: manual
  expression: GraphQL Subscription.liveTraces
  event_id: null
  webhook_id: null
  stream_id: telemetry.persisted.traces
orchestration: async
delivery_semantics: at-most-once
idempotency:
  key_fields: [subscriptionId]
  dedupe_window: PT0S
  store: storage-read-memory
retry:
  max_attempts: 1
  backoff: none
  base_ms: 0
  max_ms: 0
  retryable_errors: [ERR-013, ERR-014, ERR-017]
  permanent_errors: [ERR-001, ERR-015, ERR-016]
terminal_failure: close-subscription
concurrency:
  max_in_flight: 256
  partition_by: subscriptionId
  ordering: per-subscription-seq
sla:
  p50_ms: 1000
  p99_ms: 3000
  throughput_per_minute: 600
  data_freshness_max_s: 3
observability:
  trace_span: bff.live_traces
  metrics:
    - name: bff_graphql_subscription_active
      type: gauge
      tags: [operation]
    - name: storage_read_live_trace_event_total
      type: counter
      tags: [event_type, status]
    - name: storage_read_live_trace_lag_ms
      type: histogram
      tags: [status]
  log_fields: [request_id, subscription_id, graphql_operation, nats_subject, error_code]
compensations:
  - Send LiveTraceStopRequest when a GraphQL subscription operation ends.
---

# Live Trace Subscription

## Purpose

Stream trace-level realtime updates to GraphQL clients without exposing NATS streams or storage implementation details to the frontend or BFF.

## Steps

### Step 1 - GraphQL Subscription Start

- **Action**: Client starts `Subscription.liveTraces` over the BFF GraphQL endpoint.
- **Boundary**: Frontend talks only to GraphQL and does not open NATS, OTLP, or SurrealDB connections.
- **Success**: BFF validates `LiveTraceInput`, creates `subscriptionId`, creates an ephemeral sink subject, and continues to Step 2.
- **Retryable error**: None.
- **Permanent error**: Return GraphQL ERR-001 for invalid input.

### Step 2 - Start Storage-Read Live Session

- **Action**: BFF sends `LiveTraceStartRequest` to `telemetry.traces.live.start` with `subscriptionId`, sink subject, query, and normalized `authContext`.
- **Boundary**: BFF must not subscribe to `TELEMETRY_INGEST`, `telemetry.ingest.*`, or `telemetry.persisted.traces`.
- **Success**: Storage-read validates query and auth context, registers live state, and replies with `LiveTraceStartData`.
- **Retryable error**: Return ERR-013, ERR-014, or ERR-017 as GraphQL setup errors.
- **Permanent error**: Return ERR-001, ERR-015, or ERR-016 as GraphQL setup errors.

### Step 3 - Optional Snapshot

- **Action**: Storage-read may emit bounded `snapshot` events to the sink subject using `LiveTraceInput.from` and `limit`.
- **Boundary**: Snapshot trace summaries are loaded through storage-read query semantics. The BFF does not compute summaries or filters.
- **Success**: BFF forwards each event to GraphQL with unchanged `type`, `seq`, `receivedAt`, and `trace`.
- **Retryable error**: Close subscription with ERR-006 or ERR-013 if storage or message bridge fails.
- **Permanent error**: Close subscription with ERR-016 if authorization is revoked.

### Step 4 - Persisted Trace Notification

- **Action**: Storage-write persists telemetry and publishes `TracePersistedNotification` to `telemetry.persisted.traces` after successful trace persistence.
- **Boundary**: Notification contains trace IDs and non-sensitive hints only. It does not contain spans, logs, attributes, raw OTLP payloads, or credentials.
- **Success**: Storage-read live consumer receives the notification.
- **Retryable error**: NATS redelivery according to `storage-read-live` durable consumer policy.
- **Permanent error**: Log terminal delivery failure with ERR-013.

### Step 5 - Match And Emit Live Events

- **Action**: Storage-read resolves candidate trace IDs with the active live query, read authorization, and the same `TraceSummary` semantics as `Query.traces`.
- **Boundary**: Live filtering, counts, and summaries are storage-read responsibilities.
- **Success**: Storage-read publishes `added` or `updated` `LiveTraceEvent` messages to matching sink subjects.
- **Retryable error**: Skip the event for that notification and log ERR-006 or ERR-013.
- **Permanent error**: If authorization fails, close affected subscriptions with ERR-016.

### Step 6 - Filter Change

- **Action**: Frontend starts a new `liveTraces` GraphQL operation with new variables on the existing WebSocket connection and stops the previous operation.
- **Boundary**: The WebSocket session remains open when supported by the client library; server-side filtering changes only through a new GraphQL subscription operation.
- **Success**: BFF sends stop for the old subscription and start for the new subscription.
- **Retryable error**: Same as Step 2.
- **Permanent error**: Same as Step 2.

### Step 7 - Subscription Stop

- **Action**: On unsubscribe, disconnect, tab close, or BFF shutdown, the BFF sends `LiveTraceStopRequest`.
- **Boundary**: `LiveTraceStopRequest` is idempotent.
- **Success**: Storage-read removes live state and stops publishing to the sink subject.
- **Retryable error**: BFF logs ERR-013 or ERR-014; storage-read idle cleanup remains the fallback.
- **Permanent error**: None.

### Step 99 - Terminal Failure

The BFF maps setup failures to GraphQL errors. After setup, the BFF closes the subscription on terminal storage-read or bridge failure and logs `request_id`, `subscription_id`, operation, subject, and canonical error code.
