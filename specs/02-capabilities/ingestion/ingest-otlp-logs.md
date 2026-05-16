---
id: CAP-ING-002
title: Ingest OTLP logs
domain: ingestion
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: http
  sync_async: sync
  visibility: external
  authentication: prepared
depends_on: [CAP-STO-001]
implements:
  api: [OPR-OTLP-post-v1-logs, MSG-telemetry-ingest-logs]
  events_published: []
  events_consumed: []
  jobs: []
  webhooks: []
  streams: []
invariants:
  idempotent: true
  side_effects_reversible: false
  tenant_scoped: prepared
sla:
  p99_ms: 1000
  throughput_per_minute: 1200
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-ING-002-01
    kind: happy-path
    given: A valid OTLP JSON log payload with trace_id and span_id attributes
    when: A client posts it to POST /v1/logs
    then: The Go collector publishes a PersistTelemetryCommand to telemetry.ingest.logs and returns HTTP 200 with an OTLP ExportLogsServiceResponse body encoded like the request
  - id: AC-CAP-ING-002-02
    kind: failure-path
    given: A malformed OTLP log payload
    when: A client posts it to POST /v1/logs
    then: The backend returns ERR-001 VALIDATION_FAILED and persists nothing
---

# Ingest OTLP Logs

## Business Intent

Accept logs through standard OTLP HTTP so engineers can inspect logs beside traces and spans.

## Actors

- External OpenTelemetry SDKs and collectors.
- Go OTLP collector service.
- NATS JetStream message bridge.
- Go storage-write service.

## Minimum Data Captured

- LogEvent: `id`, `traceId`, `spanId`, `serviceName`, `severityText`, `severityNumber`, `body`, `timestamp`, `observedTimestamp`, `attributes`.

## Constraints

- Logs without `traceId` or `spanId` are still persisted and searchable.
- Log IDs are generated deterministically from observed timestamp, trace ID, span ID, severity, body hash, and resource service name when no OTLP stable ID exists.
- Return HTTP 200 only after the normalized PersistTelemetryCommand is acknowledged by JetStream.
- JSON requests receive a JSON protobuf `ExportLogsServiceResponse`; protobuf requests receive a binary protobuf `ExportLogsServiceResponse`.
- The collector must not import a SurrealDB client or storage adapter.
- In `CLOUDGRID_AUTH_MODE=sso`, the collector requires an ingest token authorized for the target company/project and rejects missing or unauthorized credentials with ERR-015 or ERR-016.
- Project routing follows [OTLP mapping](../../04-backend/otlp-mapping.md#project-routing).
