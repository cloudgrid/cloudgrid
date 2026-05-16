---
id: CAP-MET-001
title: Ingest OTLP metrics
domain: metrics
layer: capability
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-14
provenance: user-directed
traits:
  interaction: http
  sync_async: sync
  visibility: external
  authentication: prepared
depends_on: [CAP-STO-001, TEC-BE-017]
implements:
  api: [OPR-OTLP-post-v1-metrics, MSG-telemetry-ingest-metrics]
---

# Ingest OTLP Metrics

## Business Intent

Accept standard OpenTelemetry metrics from services, AI harness applications, and infrastructure components so users can inspect project health and AI runtime behavior beside traces and logs.

## Actors

- External OpenTelemetry SDKs and collectors.
- Go OTLP collector service.
- NATS JetStream message bridge.
- Go storage-write service.

## Constraints

- Support OTLP HTTP JSON and protobuf metrics payloads.
- Use the same auth, project routing, content-type, publish-ack, and error behavior as trace/log ingest.
- Return HTTP 200 only after the normalized metrics command is acknowledged by JetStream.
- Do not publish partial commands for oversized or invalid metric exports.
- Do not convert metric points into spans or logs.
- Do not accept tenant, company, or project values from metric attributes.
- Apply metric cardinality policy before persistence.

## Acceptance Criteria

- Given a valid OTLP metric export with one histogram and one counter, the collector publishes `PersistMetricsCommand` to `telemetry.ingest.metrics` and returns the standard OTLP `ExportMetricsServiceResponse`.
- Given missing or invalid bearer credentials when required, the collector rejects the request before reading or decoding the body.
- Given a metric export whose attributes exceed project cardinality limits, storage-write drops or redacts only the disallowed attributes according to policy and records a bounded warning count.
