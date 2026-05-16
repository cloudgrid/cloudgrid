---
id: FLW-ING-001
title: Persist trace ingest command
domain: ingestion
layer: flow
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
trigger:
  type: stream-record
  expression: null
  event_id: null
  webhook_id: null
  stream_id: MSG-telemetry-ingest-traces
orchestration: async-fire-forget
delivery_semantics: at-least-once
idempotency:
  key_fields: [commandId]
  dedupe_window: P7D
  store: ingest_command
retry:
  max_attempts: 5
  backoff: exponential
  base_ms: 250
  max_ms: 5000
  retryable_errors: [ERR-006, ERR-012]
  permanent_errors: [ERR-001, ERR-008]
terminal_failure: manual-queue
concurrency:
  max_in_flight: 16
  partition_by: commandId
  ordering: none
sla:
  p50_ms: 500
  p99_ms: 5000
  throughput_per_minute: 600
  data_freshness_max_s: 3
observability:
  trace_span: storage_write.persist_traces
  metrics:
    - name: storage_write_commands_total
      type: counter
      tags: [subject, status]
    - name: storage_write_duration_ms
      type: histogram
      tags: [subject]
  log_fields: [request_id, command_id, subject, trace_count, span_count, error_code]
compensations: []
---

# Persist Trace Ingest Command

## Purpose

Persist normalized trace and span entities from `telemetry.ingest.traces` through the Go storage-write service.

## Steps

### Step 1 - Receive

- **Action**: Receive a JetStream message from durable consumer `storage-write`.
- **Success**: Continue to Step 2.
- **Retryable error**: NATS redelivery per policy.
- **Permanent error**: Continue to Step 99.

### Step 2 - Validate

- **Action**: Validate `PersistTelemetryCommand` against the AsyncAPI schema.
- **Success**: Continue to Step 3.
- **Retryable error**: None.
- **Permanent error**: Log ERR-001 and acknowledge the message because invalid commands cannot be repaired by retry.

### Step 3 - Persist

- **Action**: If `ingest_command.commandId` already exists, acknowledge without rewriting telemetry. Otherwise upsert traces, spans, services, derived counters, and an `ingest_command` completion record in SurrealDB using `commandId` idempotency.
- **Success**: Acknowledge the JetStream message.
- **Retryable error**: Return no ack; JetStream redelivers until max attempts.
- **Permanent error**: Continue to Step 99.

### Step 99 - Terminal Failure

After 5 delivery attempts, the message remains inspectable through the JetStream consumer state and logs include `command_id`, `subject`, `error_code`, and attempt count. Operator action is manual requeue or database repair.
