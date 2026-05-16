---
id: TEC-BE-022
title: OTLP gRPC compatibility
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
provenance: user-directed
depends_on: [TEC-BE-006, TEC-BE-007, TEC-BE-017, TEC-BE-009]
---

# OTLP gRPC Compatibility

## Decision

CloudGrid supports full standard OTLP compatibility for implemented signals:

- OTLP/HTTP JSON protobuf on standard port `4318`;
- OTLP/HTTP binary protobuf on standard port `4318`;
- OTLP/gRPC binary protobuf on standard port `4317`.

The compatibility wave covers traces, logs, and metrics together. Partial gRPC support for only one signal is not acceptable.

## Public gRPC Services

The collector exposes the standard OpenTelemetry protobuf services:

- `opentelemetry.proto.collector.trace.v1.TraceService/Export`;
- `opentelemetry.proto.collector.logs.v1.LogsService/Export`;
- `opentelemetry.proto.collector.metrics.v1.MetricsService/Export`.

Request mapping, project routing, auth-before-decode, cardinality limits, NATS publish acknowledgement, and async persistence semantics match the HTTP endpoints.

## Listener Configuration

Required config:

- `CLOUDGRID_OTLP_HTTP_ADDR`, default `0.0.0.0:4318`;
- `CLOUDGRID_OTLP_GRPC_ADDR`, default `0.0.0.0:4317`;
- `CLOUDGRID_OTLP_GRPC_MAX_MESSAGE_BYTES`, default equal to the HTTP body limit;
- `CLOUDGRID_OTLP_GRPC_COMPRESSION`, allowed values `none` and `gzip`, default `gzip`;
- TLS config must be explicit. Local development defaults to plaintext loopback/docker networking; deployed templates must document TLS termination or collector TLS config.

Readiness must report HTTP and gRPC listener status separately.

## Error Mapping

gRPC status mapping:

- invalid OTLP payload or unsupported metric kind: `InvalidArgument` with CloudGrid `ERR-001`;
- missing/invalid auth: `Unauthenticated` with `ERR-015`;
- missing project access or revoked key: `PermissionDenied` with `ERR-016`;
- payload too large: `ResourceExhausted` with `ERR-001`;
- NATS publish timeout: `Unavailable` or `DeadlineExceeded` with `ERR-014`;
- internal service failure: `Internal` with `ERR-006`.

Public error details must not include bearer tokens, project-token values, provider claims, SurrealDB details, or raw telemetry payloads.

## Verification

Required tests:

- OpenTelemetry SDK exporter integration for traces, logs, and metrics over HTTP JSON, HTTP protobuf, and gRPC protobuf;
- OpenTelemetry Collector exporter integration for all supported transports;
- response parity between HTTP encodings and gRPC status behavior;
- auth-before-decode for gRPC metadata bearer tokens;
- standard port documentation and docker compose exposure.
