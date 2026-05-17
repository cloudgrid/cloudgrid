# Getting Started

This guide gets CloudGrid running locally with no login, one local company, and multiple projects.

## 1. Install Prerequisites

- Bun `1.3.13` or newer.
- Node `24.15` or newer for Node-compatible tooling.
- Go `1.23` or newer.
- Docker with Docker Compose.

## 2. Install Dependencies

```sh
bun install
```

## 3. Start NATS And SurrealDB

```sh
docker compose --env-file .env up -d nats surrealdb
```

Defaults:

- NATS: `nats://localhost:4222`
- NATS monitor: `http://localhost:8222`
- SurrealDB RPC: `http://localhost:8000/rpc`

## 4. Start CloudGrid

For the normal local path, start every non-Docker service from one terminal:

```sh
bun run dev:all
```

`dev:all` checks required ports, starts the Go services, starts the TypeScript BFF, and starts the Vite frontend. It expects Docker infrastructure to already be running.

Manual startup order, if you want separate terminals:

```sh
go run -tags surrealdb ./core/storage-write/cmd/storage-write
go run -tags surrealdb ./core/storage-read/cmd/storage-read
go run ./core/control-plane/cmd/control-plane
bun run dev
go run ./core/otlp-collector/cmd/otlp-collector
```

Open the frontend at `http://127.0.0.1:5173/`.

GraphiQL is available at `http://localhost:3000/graphql` in development.

## 5. Select Or Create A Project

Local mode skips login but still uses projects. The frontend opens to project selection when no project is selected. Select an existing project before opening traces, logs, metrics, dashboards, or live trace receiving.

All local users are represented as the local company admin. This keeps project management visible without introducing local credentials.

## 6. Send Fixture Telemetry

Use the development seeding script to send the checked-in OTLP fixtures and
generated rich development telemetry through the real collector endpoint and
normal ingest pipeline:

```sh
bun run dev:seed
```

The default seed posts generated development telemetry only: current-time,
multi-service traces with realistic parent-child waterfalls, linked spans,
related logs, and metrics. Use `--signal traces|logs|metrics` or
`--format json` to narrow what is sent.

For live trace UI development, keep a fresh generated telemetry stream running
in a second terminal:

```sh
bun run dev:seed:live
```

This mode sends only generated JSON telemetry, regenerates timestamps and
trace/span IDs on every batch, and defaults to one batch every five seconds.
Use `-- --interval-ms 1000` for faster local live testing or
`-- --max-batches 10` for a bounded run.

If local project-token routing is enabled with
`CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS`, pass the matching token:

```sh
bun run dev:seed -- --token dev-checkout-token-000000000000000001
```

JSON fixtures:

```sh
curl -sS -H 'content-type: application/json' \
  --data @fixtures/otlp/traces.json \
  http://localhost:4318/v1/traces

curl -sS -H 'content-type: application/json' \
  --data @fixtures/otlp/logs.json \
  http://localhost:4318/v1/logs

curl -sS -H 'content-type: application/json' \
  --data @fixtures/otlp/metrics.json \
  http://localhost:4318/v1/metrics
```

Protobuf fixtures:

```sh
curl -sS -H 'content-type: application/x-protobuf' \
  --data-binary @fixtures/otlp/traces.pb \
  http://localhost:4318/v1/traces

curl -sS -H 'content-type: application/x-protobuf' \
  --data-binary @fixtures/otlp/logs.pb \
  http://localhost:4318/v1/logs
```

The checked-in JSON and protobuf payloads are contract fixtures for collector
coverage, not the default UI demo data. Send them explicitly when testing
decoder compatibility:

```sh
bun run dev:seed -- --fixture-set contracts
```

The collector also accepts OTLP HTTP binary protobuf at `/v1/metrics`; this repository currently includes JSON metric fixtures but not a checked-in `metrics.pb` fixture.

OTLP/gRPC exporters use the standard gRPC port:

```sh
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

Default local single-project ingest does not need a project API key. When local
project-token routing is enabled, set the project API key next to the standard
OpenTelemetry endpoint:

```sh
export CLOUDGRID_PROJECT_API_KEY='dev-checkout-token-000000000000000001'
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Successful HTTP ingest returns `200` with the standard empty OTLP export response using the same encoding as the request. Successful gRPC ingest returns the standard empty OTLP export response for the exported signal. After storage-write persists the command, trace, log, and metric data appear in `/traces`, `/traces/:traceId`, `/logs`, `/metrics`, and `/dashboards`. Live trace receiving is a mode inside `/traces`, not a separate `/live` route.

## 7. Verify The Repository

Default checks are hermetic and do not start Docker:

```sh
bun run verify
```

Full local verification includes frontend smoke and backend coverage:

```sh
bun run verify:full
```

Go workspace tests:

```sh
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```

Docker-backed integration is opt-in:

```sh
bun run integration:local
```

## Common First-Run Problems

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `MESSAGE_BRIDGE_TIMEOUT` in BFF logs | BFF started before private services subscribed to NATS subjects | Keep `dev:all` running until all services report ready, or start services in the documented order. |
| Frontend shows “Select a project” | No selected project in the BFF session | Open `/projects` and select a project. |
| OTLP HTTP port `4318` is already in use | Another collector is running | Start CloudGrid collector with `CLOUDGRID_OTLP_HTTP_ADDR=0.0.0.0:14318` and send fixtures to that port. |
| OTLP gRPC port `4317` is already in use | Another collector is running | Start CloudGrid collector with `CLOUDGRID_OTLP_GRPC_ADDR=0.0.0.0:14317` and point gRPC exporters at that port. |
| `STORAGE_UNAVAILABLE` from facets or traces | SurrealDB is not ready or schema readiness failed | Check `docker compose --env-file .env logs -f surrealdb` and storage service `/readyz`. |

Next: read [Core Concepts](../02-core-concepts/README.md) to understand companies, projects, and telemetry views.
