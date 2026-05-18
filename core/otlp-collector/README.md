# OTLP Collector Service

Go service that exposes OTLP HTTP ingest.

Responsibilities:

- Serve `POST /v1/traces`.
- Serve `POST /v1/logs`.
- Decode OTLP HTTP JSON and protobuf.
- Normalize telemetry into CloudGrid canonical entities.
- Publish `PersistTelemetryCommand` messages to NATS JetStream.
- Serve `/livez` and `/readyz` health probes on the OTLP HTTP listener.

Forbidden:

- Do not import SurrealDB clients.
- Do not write to storage directly.
- Do not implement frontend or GraphQL behavior.

## Local Operation

Start last, after Docker infrastructure, `storage-write`, `storage-read`, and
the BFF are running:

```sh
go run ./core/otlp-collector/cmd/otlp-collector
```

The collector listens on `CLOUDGRID_OTLP_HTTP_ADDR` (`0.0.0.0:4318` by default) and `CLOUDGRID_OTLP_GRPC_ADDR` (`0.0.0.0:4317` by default). It accepts both fixture encodings:

Health probes are served on the same listener at `/livez` and `/readyz`.

```sh
curl -sS -H 'content-type: application/json' \
  --data @fixtures/otlp/traces.json \
  http://localhost:4318/v1/traces

curl -sS -H 'content-type: application/x-protobuf' \
  --data-binary @fixtures/otlp/traces.pb \
  http://localhost:4318/v1/traces
```

If port `4318` is already in use, start with a free port, for example:

```sh
CLOUDGRID_OTLP_HTTP_ADDR=0.0.0.0:14318 go run ./core/otlp-collector/cmd/otlp-collector
```

In local mode, the collector can route to `CLOUDGRID_OTLP_LOCAL_PROJECT_ID` without a token. In deployed mode, machine ingest callers must send a bearer token with the required ingest scope. Keep local mode on a trusted local or internal network.

## Backpressure Limits

The collector rejects oversized payloads before publishing to JetStream. The defaults are intentionally conservative for local development and can be raised within the validated ranges for larger deployments:

```sh
CLOUDGRID_OTLP_MAX_REQUEST_BYTES=4194304
CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST=10000
CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST=10000
CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST=20000
CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS=1000
```

HTTP requests with a `Content-Length` above `CLOUDGRID_OTLP_MAX_REQUEST_BYTES` fail before body decoding. Chunked HTTP requests and gRPC messages are bounded while they are read. Decoded trace, log, and metric exports are rejected as a whole when their configured item limit is exceeded; the collector never publishes a partial ingest command.

In deployed mode, project authorization uses the local JWT validator plus the in-process project status cache:

```sh
CLOUDGRID_PROJECT_STATUS_CACHE_TTL_SECONDS=60
CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS=120
```

The stale boundary must be greater than or equal to the TTL. Once the cached project status is older than the stale boundary, ingest fails closed until the project status is refreshed.
