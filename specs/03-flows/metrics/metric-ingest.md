---
id: FLW-MET-001
title: Metric ingest flow
layer: flow
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-14
provenance: user-directed
depends_on: [CAP-MET-001, MSG-telemetry-ingest-metrics]
---

# Metric Ingest Flow

1. Client sends OTLP HTTP `POST /v1/metrics`.
2. Collector validates method, content type, request size, and ingest authorization before body decode.
3. Collector decodes OTLP metrics and normalizes resource, scope, descriptor, and data point records.
4. Collector publishes `PersistMetricsCommand` to `telemetry.ingest.metrics`.
5. Storage-write consumes the command, applies cardinality policy, persists metric descriptors and points, records the ingest command, and acknowledges the JetStream message.
6. Collector returns the OTLP `ExportMetricsServiceResponse` after publish acknowledgement.

Storage-write failure follows existing JetStream retry semantics. No BFF or frontend component participates in ingest.
