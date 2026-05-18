---
id: CAP-ING-003
title: Normalize OTLP telemetry
domain: ingestion
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: http
  sync_async: sync
  visibility: internal
  authentication: none
depends_on: []
implements:
  api: []
  events_published: []
  events_consumed: []
  jobs: []
  webhooks: []
  streams: []
invariants:
  idempotent: true
  side_effects_reversible: true
  tenant_scoped: false
sla:
  p99_ms: 250
  throughput_per_minute: 2000
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-ING-003-01
    kind: happy-path
    given: An OTLP resource containing resource attributes, scope attributes, spans, events, and logs
    when: The normalizer maps it
    then: Canonical entities preserve IDs, timestamps, status, service.name, and original attributes
  - id: AC-CAP-ING-003-02
    kind: failure-path
    given: An OTLP record missing required span IDs or timestamps
    when: The normalizer maps it
    then: The mapper returns ERR-001 VALIDATION_FAILED with the invalid record path
---

# Normalize OTLP Telemetry

## Business Intent

Keep OpenTelemetry-specific payload handling separate from product data models while retaining enough original attributes for AI-native modeling.

## Constraints

- `service.name` is read from resource attributes and copied to canonical entities.
- Trace and span IDs must be normalized to lowercase hexadecimal strings.
- OTLP byte IDs are encoded as lowercase hexadecimal without separators.
- OTLP Unix nanosecond timestamps are converted to UTC timestamps.
- Span duration is computed from start and end timestamps.
- Status mapping is `STATUS_CODE_OK -> ok`, `STATUS_CODE_ERROR -> error`, missing or unset to `unset`.
- Span attributes combine resource, scope, and span attributes with later record-level attributes overriding earlier duplicate keys.
- Span events are preserved in `Span.events`.
- Span links are preserved in `Span.links` with lowercase hexadecimal trace and span IDs, trace state, and link attributes.
- Span events using OpenTelemetry exception semantic attributes (`exception.type`, `exception.message`, `exception.stacktrace`, `exception.escaped`) remain in `Span.events`; GraphQL derives `Span.exceptions` from those events.
- Trace records are aggregated from spans by trace ID; `startedAt` is the earliest span start, `endedAt` is the latest span end, `durationMs` is the elapsed milliseconds, `rootSpanId` is the span without a parent when present, and `serviceName` comes from that root span or the first span for the trace.
- Log IDs are deterministic hashes from timestamp, trace ID, span ID, severity text, body, and service name when OTLP does not provide a stable ID.
- OTLP `AnyValue` maps to JSON-compatible values. Bytes map to lowercase hexadecimal strings.
- GenAI semantic convention attributes are preserved in `attributes` and are not promoted to first-class AI entities in MVP.
