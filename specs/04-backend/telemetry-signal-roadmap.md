---
id: TEC-BE-006
title: Telemetry signal roadmap
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-09
provenance: user-directed
---

# Telemetry Signal Roadmap

## Current MVP Signals

- OTLP HTTP traces through `/v1/traces`.
- OTLP HTTP logs through `/v1/logs`.
- OTLP HTTP metrics through `/v1/metrics` are specified for the metrics implementation wave.

## Metrics Implementation

OpenTelemetry metrics are implementation-ready in:

- [Metrics domain](../01-domains/metrics.md)
- [Metrics signal](./metrics-signal.md)
- [Dashboard widgets](../05-frontend/dashboard-widgets.md)
- [Metric ingest flow](../02-flows/metrics/metric-ingest.md)
- [Dashboard query flow](../02-flows/metrics/dashboard-query.md)

Implementation agents must add collector, storage-write, storage-read, control-plane dashboard management, BFF, frontend, tests, docs, and generated contracts in one metrics/dashboard wave. Partial implementations that expose `/v1/metrics` without GraphQL reads, project-scoped persistence, and dashboard UX are not acceptable.

## Full OTLP Protocol Compatibility

The approved compatibility target is standard OTLP ports and transports for traces, logs, and metrics. The implementation-ready details live in [OTLP gRPC compatibility](./otlp-grpc-compatibility.md).

CloudGrid must support:

- OTLP/HTTP with JSON protobuf encoding on port `4318`;
- OTLP/HTTP with binary protobuf encoding on port `4318`;
- OTLP/gRPC with binary protobuf encoding on port `4317`.

Implementation agents must not add partial gRPC support for only one signal. HTTP protobuf support for currently implemented HTTP endpoints remains required by [OTLP mapping](./otlp-mapping.md) and [Metrics signal](./metrics-signal.md).

## Log Collection Roadmap

CloudGrid receives logs as OTLP logs. Collection of stdout, files, journald, Docker logs, or Kubernetes pod logs is delegated to an OpenTelemetry Collector agent.

CloudGrid should provide tested Collector configuration examples for:

- local development file/stdout log collection,
- regular server/VM collection with the Collector as a systemd service,
- Kubernetes collection with the Collector as a DaemonSet using filelog and Kubernetes metadata enrichment.

CloudGrid should not read Kubernetes pod log files directly from the backend or storage services.

## Future Storage Adapter Research

Monoscope research on 2026-05-09 highlighted demand for cheap long-retention telemetry storage through S3-compatible object storage and for simple local artifacts that agents and CLI tools can inspect. CloudGrid should keep this as future research only; it does not change the SurrealDB-only MVP.

Future object-storage or local-file work must define before implementation:

- whether the adapter is a primary query store, cold archive, export target, or replay/import format;
- the on-disk or object format, with preference for columnar or indexed formats for large telemetry instead of raw JSON as the primary query surface;
- partitioning by tenant/project, signal, service, and time range;
- compaction, retention, lifecycle, and deletion semantics;
- query-path expectations for search, facets, trace reconstruction, and log correlation;
- consistency behavior between hot storage and cold object storage;
- credentials handling that keeps object-store secrets private to storage services;
- adapter build tags and sibling `internal/adapters/<database-or-store>/` packages that preserve the public BFF, frontend, collector, and NATS contracts.

A local JSON backend may be useful as a developer import/export fixture or small offline demo format, but it should not be treated as a durable production store unless a future spec proves acceptable indexing, retention, and corruption-recovery behavior.
