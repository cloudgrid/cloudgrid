---
id: TEC-BE-007
title: Log ingestion boundary
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: user-directed
---

# Log Ingestion Boundary

## Decision

Introduce a future dedicated `core/log-ingest` boundary for log-specific control, but keep the current MVP `core/otlp-collector` implementation until the next backend ingestion wave.

## Rationale

Logs have different operational characteristics from traces:

- high volume and burstiness,
- multiline parsing,
- stdout/file/journald/Kubernetes collection concerns,
- redaction and sensitive data handling,
- source-specific enrichment,
- different retry and drop policies.

A dedicated log ingestion service gives CloudGrid a clean place for log-specific validation, redaction, parsing policy, rate limits, and future tenant/project routing without coupling those concerns to trace ingest.

## Target Shape

```text
OTLP traces  -> core/otlp-collector -> telemetry.ingest.traces
OTLP logs    -> core/log-ingest      -> telemetry.ingest.logs
OTLP metrics -> core/otlp-collector -> telemetry.ingest.metrics
```

## MVP Compatibility

Until `core/log-ingest` exists:

- `core/otlp-collector` continues to serve `/v1/logs`.
- The external OTLP HTTP contract remains `/v1/logs`.
- The private JetStream subject remains `telemetry.ingest.logs`.
- Storage-write and storage-read contracts do not change.

When `core/log-ingest` is implemented, use this default migration:

- `core/log-ingest` owns `/v1/logs`.
- `core/otlp-collector` no longer serves `/v1/logs`.
- The public path remains `/v1/logs`, but routing/deployment points that path to `core/log-ingest`.
- The private JetStream subject remains `telemetry.ingest.logs`.

A thin delegating route in `core/otlp-collector` is not allowed unless a later spec proves a deployment compatibility requirement. The migration must update OpenAPI, deployment docs, dev scripts, service health probes, and Docker/compose wiring in the same wave.

## Non-Goals

- Do not build a Kubernetes log file reader inside CloudGrid services.
- Do not add direct filesystem access to the BFF or storage services.
- Do not bypass OTLP log normalization before persistence.
