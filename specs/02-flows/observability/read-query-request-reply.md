---
id: FLW-OBS-001
title: Resolve telemetry read query
domain: observability-data
layer: flow
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
trigger:
  type: manual
  expression: null
  event_id: null
  webhook_id: null
  stream_id: null
orchestration: sync
delivery_semantics: at-most-once
idempotency:
  key_fields: []
  dedupe_window: PT0S
  store: none
retry:
  max_attempts: 1
  backoff: none
  base_ms: 0
  max_ms: 0
  retryable_errors: [ERR-013, ERR-014]
  permanent_errors: [ERR-001, ERR-003, ERR-004]
terminal_failure: human-task
concurrency:
  max_in_flight: 64
  partition_by: null
  ordering: none
sla:
  p50_ms: 300
  p99_ms: 2000
  throughput_per_minute: 1200
  data_freshness_max_s: null
observability:
  trace_span: bff.telemetry_query
  metrics:
    - name: bff_graphql_resolver_duration_ms
      type: histogram
      tags: [operation, status]
    - name: nats_request_reply_total
      type: counter
      tags: [subject, status]
  log_fields: [request_id, graphql_operation, nats_subject, error_code]
compensations: []
---

# Resolve Telemetry Read Query

## Purpose

Resolve GraphQL telemetry reads through private NATS request/reply without exposing storage services publicly.

## Steps

### Step 1 - GraphQL Request

- **Action**: Validate GraphQL input and map it to the corresponding NATS request payload.
- **Boundary**: Do not filter, aggregate, correlate, rank, or enrich telemetry records in the BFF.
- **Success**: Continue to Step 2.
- **Retryable error**: None.
- **Permanent error**: Return GraphQL error ERR-001 or ERR-003.

### Step 2 - NATS Request

- **Action**: Send request to `telemetry.traces.search`, `telemetry.traces.get`, `telemetry.logs.search`, or `telemetry.facets` with a 2 second timeout.
- **Success**: Continue to Step 3.
- **Retryable error**: Return ERR-013 or ERR-014 as GraphQL error.
- **Permanent error**: Return mapped BridgeError.

### Step 3 - Storage Read

- **Action**: Go storage-read service validates the message, applies query semantics, pushes supported filters and aggregates into SurrealDB, and returns GraphQL-ready view-model data.
- **Success**: Return typed data response to BFF.
- **Retryable error**: Return BridgeError ERR-006.
- **Permanent error**: Return BridgeError ERR-001, ERR-003, or ERR-004.

### Step 99 - Terminal Failure

The BFF returns a GraphQL error with canonical code and logs request ID, GraphQL operation, NATS subject, and error code.
