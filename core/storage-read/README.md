# Storage Read Service

Go service that handles private telemetry read queries.

Responsibilities:

- Handle `telemetry.traces.search` request/reply.
- Handle `telemetry.traces.get` request/reply.
- Handle `telemetry.logs.search` request/reply.
- Fetch telemetry from SurrealDB.
- Return typed success responses or `BridgeError`.
- Serve `/livez` and `/readyz` health probes on the private health port.

Forbidden:

- Do not mutate SurrealDB.
- Do not expose public HTTP or GraphQL telemetry APIs.
- Do not parse OTLP payloads.

## Local Operation

Start after Docker infrastructure and `storage-write`, before the BFF and
collector:

```sh
go run -tags surrealdb ./core/storage-read/cmd/storage-read
```

This service handles private NATS request/reply subjects for GraphQL reads:
`telemetry.traces.search`, `telemetry.traces.get`, and `telemetry.logs.search`.
It is the only service that fetches telemetry from SurrealDB.

Health probes are served on `CLOUDGRID_STORAGE_READ_HEALTH_PORT` (`8081` by
default). Readiness checks both NATS and the required SurrealDB schema.

The storage adapter is selected at build time, then validated by
`CLOUDGRID_STORAGE_ADAPTER`. The MVP SurrealDB build uses `-tags surrealdb` and
supports only `surrealdb`.

The MVP has no retention or deletion API. Read results reflect all telemetry
still present in the local SurrealDB database.
