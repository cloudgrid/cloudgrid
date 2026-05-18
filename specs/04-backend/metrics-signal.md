---
id: TEC-BE-017
title: Metrics signal
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-14
provenance: harness-reference
depends_on: [TEC-BE-006, TEC-BE-004, TEC-BE-009]
---

# Metrics Signal

## Intent

CloudGrid ingests OpenTelemetry metrics as a first-class project-scoped signal so dashboards can use counters, gauges, histograms, summaries, exemplars, and AI harness metrics without custom SDKs.

## Ingestion Contract

- Endpoint: OTLP HTTP `POST /v1/metrics`.
- Accepted encodings: OTLP JSON protobuf and binary protobuf.
- Response: standard OTLP `ExportMetricsServiceResponse` encoded like the request.
- Subject: `telemetry.ingest.metrics`.
- Message: `PersistMetricsCommand`.
- Project routing, bearer validation, local token behavior, and fail-closed errors match [OTLP mapping](./otlp-mapping.md#project-routing) and [authentication](./authentication-authorization.md).
- Authentication and authorization finish before body read/decode except method, content-type, and request-size checks.
- HTTP 200 is returned only after JetStream publish acknowledgement. Storage-write persistence remains asynchronous through the durable ingest stream.
- The collector must not translate metrics into spans or logs.

## Mapping Rules

For each OTLP `ResourceMetrics` and `ScopeMetrics` group, the collector produces descriptor and data point records:

- resource attributes and scope attributes are merged into data point attributes in this order: resource, scope, point; later groups override duplicate keys;
- `service.name` is copied to `serviceName`;
- metric name, description, unit, kind, aggregation temporality, and monotonicity become `MetricDescriptor`;
- number, sum, gauge, histogram, exponential histogram, and summary points become `MetricPoint`;
- exemplar trace/span IDs are preserved as exemplar links and never used for project routing;
- point flags are preserved in flexible point metadata when present;
- `tenantId`, `companyId`, and `projectId` come only from `AuthContext`.

## Metric Kinds

Supported kinds:

- `gauge`
- `sum`
- `histogram`
- `exponential_histogram`
- `summary`

Unknown future OTLP metric kinds fail the request with ERR-001 until this spec adds mapping rules.

## Cardinality Policy

Storage-write applies this default policy per project before persistence:

- maximum metric names: 10,000;
- maximum queryable attribute keys per metric: 64;
- maximum distinct values per metric attribute key: 1,000 per rolling 24 hours;
- maximum attributes stored per point after reserved-key filtering: 64;
- maximum exemplars stored per point: 16.

Reserved keys are dropped from metric attributes if supplied by emitters: `tenantId`, `tenant_id`, `companyId`, `company_id`, `projectId`, `project_id`, `cloudgrid.tenant_id`, `cloudgrid.company_id`, `cloudgrid.project_id`, and `authorization`.

When limits are exceeded, storage-write drops only the disallowed attribute keys or exemplar overflow, increments `droppedAttributeCount`, and persists the remaining point. If a request would create a new metric name after the project metric-name budget is exhausted, storage-write rejects that command with ERR-001 and does not partially persist the command.

## Query Semantics

Storage-read owns:

- metric name search and metadata lookup;
- time-range filtering;
- attribute filtering using `AttributeFilterInput`;
- grouping by allowed attribute keys;
- downsampling interval selection;
- `avg`, `sum`, `min`, `max`, `count`, `rate`, `p50`, `p90`, `p95`, and `p99` aggregations;
- exemplar links from metric points to trace/span detail.

Aggregation compatibility:

- `gauge`: `avg`, `min`, `max`, `count`.
- `sum`: `sum`, `rate`, `count`.
- `histogram` and `exponential_histogram`: `avg`, `count`, `sum`, `p50`, `p90`, `p95`, `p99`.
- `summary`: `avg`, `count`, `p50`, `p90`, `p95`, `p99` when quantiles are present.

Unsupported combinations return ERR-001.

## Harness Reference Alignment

The current `puristajs/harness` main emits metrics through OpenTelemetry meter instruments and a handler `ctx.metrics` helper. CloudGrid treats these as ordinary OTLP metrics:

- durations use seconds, not `_ms` metric names;
- `gen_ai.client.token.usage` is a histogram with token counts;
- `gen_ai.client.operation.duration`, `harness.tool.duration`, `harness.run.duration`, `harness.run.errors`, `harness.events.persist_errors`, `harness.permission.denials`, and application-prefixed metrics are queryable by name and attributes;
- application-defined metrics are allowed when they use namespaces outside reserved `cloudgrid.*` internals.

CloudGrid does not require a CloudGrid SDK for those metrics.

## CloudGrid Internal Metrics

CloudGrid services use this same OTLP metrics signal for self-observability as
specified in `self-observability.md`.

Required internal metric names include:

- `cloudgrid.ingest.requests`
- `cloudgrid.ingest.bytes`
- `cloudgrid.ingest.publish.duration`
- `cloudgrid.ingest.commands.published`
- `cloudgrid.storage.persist.commands`
- `cloudgrid.storage.persist.duration`
- `cloudgrid.storage.persist.records`
- `cloudgrid.storage.read.requests`
- `cloudgrid.storage.read.duration`
- `cloudgrid.bff.graphql.operations`
- `cloudgrid.bff.graphql.duration`
- `cloudgrid.message_bridge.requests`
- `cloudgrid.message_bridge.duration`
- `cloudgrid.live.subscriptions`
- `cloudgrid.exporter.failures`

Internal metric labels must be bounded enums or known handler names. They must
not contain tenant IDs, company IDs, project IDs, trace IDs, span IDs, user IDs,
emails, raw request paths with IDs, raw error messages, bearer tokens, cookies,
or provider secrets.

## Verification

- Collector tests cover JSON/protobuf metric decoding, auth-before-decode, unsupported metric kind, and publish acknowledgement.
- Storage-write tests cover idempotent descriptor/point persistence, reserved-key filtering, cardinality budgets, exemplar limits, and command deduplication.
- Storage-read tests cover every aggregation compatibility rule, grouping, filters, interval downsampling, empty results, and exemplar trace links.
- BFF tests prove GraphQL metric resolvers only validate/map/request/reply.
- Frontend tests prove charts render returned series without recomputing backend-owned values.
