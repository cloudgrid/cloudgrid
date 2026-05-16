---
id: CAP-ING-001
title: Ingest OTLP traces
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
  api: [OPR-OTLP-post-v1-traces, MSG-telemetry-ingest-traces]
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
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-ING-001-01
    kind: happy-path
    given: A valid OTLP JSON or protobuf trace payload with one resource span and at least one span
    when: A client posts it to POST /v1/traces
    then: The Go collector publishes a PersistTelemetryCommand to telemetry.ingest.traces and returns HTTP 200 with an OTLP ExportTraceServiceResponse body encoded like the request
  - id: AC-CAP-ING-001-02
    kind: failure-path
    given: A request with an unsupported content type
    when: A client posts it to POST /v1/traces
    then: The backend returns ERR-002 UNSUPPORTED_MEDIA_TYPE and persists nothing
---

# Ingest OTLP Traces

## Business Intent

Accept OpenTelemetry traces from local services and AI agents using standard OTLP HTTP endpoints so the product can show trace and span behavior without custom SDKs.

## Actors

- External OpenTelemetry SDKs and collectors.
- Go OTLP collector service.
- NATS JetStream message bridge.
- Go storage-write service.

## Minimum Data Captured

- Trace: `id`, `startedAt`, `endedAt`, `durationMs`, `rootSpanId`, `status`, `serviceName`, `attributes`.
- Span: `id`, `traceId`, `parentSpanId`, `name`, `kind`, `serviceName`, `startedAt`, `endedAt`, `durationMs`, `status`, `attributes`, `events`.

## Constraints

- Support `application/json` OTLP payloads.
- Support `application/x-protobuf` OTLP payloads.
- Duplicate trace/span submissions must overwrite or merge deterministically using trace ID and span ID.
- Return HTTP 200 only after the normalized PersistTelemetryCommand is acknowledged by JetStream.
- JSON requests receive a JSON protobuf `ExportTraceServiceResponse`; protobuf requests receive a binary protobuf `ExportTraceServiceResponse`.
- The collector must not import a SurrealDB client or storage adapter.
- In `CLOUDGRID_AUTH_MODE=sso`, the collector requires an ingest token authorized for the target company/project and rejects missing or unauthorized credentials with ERR-015 or ERR-016.
- Project routing follows [OTLP mapping](../../04-backend/otlp-mapping.md#project-routing).
