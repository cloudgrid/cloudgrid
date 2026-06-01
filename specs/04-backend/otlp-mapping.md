---
id: TEC-BE-004
title: OTLP mapping
layer: backend
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# OTLP Mapping

## Accepted Inputs

- OTLP HTTP JSON for traces and logs is required.
- OTLP HTTP protobuf for traces and logs is required.
- Unsupported content types return ERR-002.

## Project Routing

Project routing is outside the OTLP telemetry payload. CloudGrid must not read project IDs from OTLP resource attributes, span attributes, log attributes, query parameters, or custom CloudGrid HTTP headers.

OTLP exporters target projects through standard HTTP authorization metadata:

- Deployed mode: `Authorization: Bearer <jwt>` where the validated token carries the authorized company/project claims and ingest scopes.
- Local multi-project mode: `Authorization: Bearer <local-project-token>` where the collector maps the opaque bearer token to one local project.
- Local single-project mode: the collector may use `CLOUDGRID_OTLP_LOCAL_PROJECT_ID`, or `default` when unset.

Routing precedence is:

1. Deployed bearer JWT claims when `CLOUDGRID_DEPLOYMENT_MODE=deployed`.
2. Local bearer token map when `CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS` is
   configured.
3. Local single-project `CLOUDGRID_OTLP_LOCAL_PROJECT_ID` when no token map is
   configured.
4. Local fallback `default` when no token map and no local project ID are
   configured.

CloudGrid self-observability does not change local application-ingest fallback.
Ordinary unauthenticated local OTLP must not silently route to
`cloudgrid-system`. Self-observability reaches `cloudgrid-system` through the
same bearer-token map as any other local multi-project ingest caller.

This keeps OpenTelemetry spans portable and prevents one workload from spoofing another project by setting a mutable telemetry attribute.

## Attribute Mapping

- Resource, scope, and span/log attributes are merged into each derived entity's flat `attributes` object.
- Later groups override earlier duplicate keys in this order: resource, scope, record.
- `service.name` is copied to `serviceName`.
- Source resource, scope, span, event, log, and metric attributes are not
  mutated during ingest. CloudGrid-owned normalization metadata belongs on
  derived records, projection commands, warnings, or internal self-observability
  spans, not on customer-emitted source telemetry.

## Trace Derivation

Trace records are derived from spans grouped by trace ID:

- `startedAt`: minimum span start.
- `endedAt`: maximum span end.
- `durationMs`: end minus start.
- `rootSpanId`: span without parent span ID when exactly one exists; otherwise earliest span ID.
- `status`: `error` if any span status is error, else `ok` if any span status is ok, else `unset`.

Timestamp precision rules:

- The collector must preserve OTLP `startTimeUnixNano`, `endTimeUnixNano`, span
  event `timeUnixNano`, log `timeUnixNano`, and log `observedTimeUnixNano`
  with nanosecond precision internally.
- Storage may persist timestamps as native datetime values, but read contracts
  used for trace waterfall layout must expose enough precision to distinguish
  spans that start within the same second.
- JSON/GraphQL fields that expose raw nanoseconds use decimal strings, not JSON
  numbers, to avoid JavaScript integer precision loss.
- `startedAt`, `endedAt`, and event/log timestamp ISO strings must be emitted
  with millisecond-or-better precision whenever the source timestamp contains
  sub-second precision. Truncating trace detail timestamps to whole seconds is
  invalid.

## Span Event And Link Derivation

- OTLP span events are persisted in `span.events` with name, timestamp, and flat attributes.
- OTLP span links are persisted in `span.links` with linked trace ID, linked span ID, trace state, and flat attributes.
- Exception stack traces remain raw in span event attributes. GraphQL derives parsed `SpanException.frames` best-effort for UI rendering and must preserve raw stack text.

## Log Derivation

- Timestamp preference: OTLP `timeUnixNano`, then `observedTimeUnixNano`, then request receive time.
- Body normalization preserves original type and adds `bodyText` in persistence for search when body can be represented as string.
- Trace/span IDs come from OTLP log record fields first, then attributes `trace_id`, `span_id`, `traceId`, `spanId`.

## Invalid Records

The mapper rejects the whole request when a required span ID, trace ID, or timestamp cannot be mapped. It may accept logs without trace/span IDs.

## Publishing

The Go collector publishes normalized entities as `PersistTelemetryCommand` messages to NATS JetStream:

- Trace payloads publish to `telemetry.ingest.traces`.
- Log payloads publish to `telemetry.ingest.logs`.
- `commandId` is a UUID v7 generated per accepted HTTP request.
- Successful HTTP responses use standard OTLP `200 OK` export responses.
- JSON requests receive JSON protobuf `ExportTraceServiceResponse` or `ExportLogsServiceResponse`.
- Protobuf requests receive binary protobuf `ExportTraceServiceResponse` or `ExportLogsServiceResponse`.
- Successful responses do not include CloudGrid count bodies or `messageId`.
