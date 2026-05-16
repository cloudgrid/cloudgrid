---
id: DOM-001
title: Ingestion
layer: domain
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Ingestion

## Purpose

The ingestion domain receives OTLP HTTP payloads in the Go collector, validates accepted content types, parses OpenTelemetry trace, log, and metric structures, normalizes records, and publishes canonical telemetry write commands to NATS JetStream.

## Main Entities

- ENT-001: Trace
- ENT-002: Span
- ENT-003: LogEvent
- ENT-004: SpanEvent
- ENT-MET-001: MetricDescriptor
- ENT-MET-002: MetricPoint

## Key Invariants

- OTLP-specific structures are isolated in `apps/packages/otlp`.
- Accepted payloads are normalized before persistence.
- Invalid payloads fail before publishing a write command.
- The collector never imports SurrealDB clients or storage adapters.

## Boundaries

- Does not own SurrealDB queries or writes.
- Does not own UI view models.
- Does not own gRPC ingest.
- Does not own host, file, journald, Docker, or Kubernetes pod log collection. Those are OpenTelemetry Collector agent responsibilities.
- Metrics ingest behavior is defined in `01-domains/metrics.md` and `04-backend/metrics-signal.md`.

## Capabilities

- CAP-ING-001: Ingest OTLP traces.
- CAP-ING-002: Ingest OTLP logs.
- CAP-ING-003: Normalize OTLP telemetry.
- CAP-MET-001: Ingest OTLP metrics.

## Future Boundaries

- Log-specific ingest control may move to `core/log-ingest` while preserving the public `/v1/logs` endpoint and private message contracts.
