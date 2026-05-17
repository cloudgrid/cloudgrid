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

The collector listens on `CLOUDGRID_OTLP_PORT` (`4318` by default). It accepts
both fixture encodings:

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

In local mode, the collector can route to `CLOUDGRID_OTLP_LOCAL_PROJECT_ID` without a token. In deployed mode, machine ingest callers must send a project API key as a bearer token. Keep local mode on a trusted local or internal network.
