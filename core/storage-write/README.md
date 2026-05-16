# Storage Write Service

Go service that handles private telemetry write commands.

Responsibilities:

- Consume `telemetry.ingest.traces` from JetStream.
- Consume `telemetry.ingest.logs` from JetStream.
- Mutate SurrealDB.
- Acknowledge messages only after successful persistence.
- Apply idempotency by `commandId` and entity IDs.
- Serve `/livez` and `/readyz` health probes on the private health port.

Forbidden:

- Do not serve public HTTP or GraphQL APIs.
- Do not implement frontend behavior.
- Do not parse raw OTLP HTTP payloads.

## Local Operation

Start first after Docker infrastructure:

```sh
go run -tags surrealdb ./core/storage-write/cmd/storage-write
```

This service owns SurrealDB mutations and the durable JetStream consumer named
`storage-write`. Keep it running before starting the collector so ingested
commands can be persisted promptly.

Health probes are served on `CLOUDGRID_STORAGE_WRITE_HEALTH_PORT` (`8082` by
default). Readiness checks NATS and SurrealDB connectivity after schema
initialization.

The storage adapter is selected at build time, then validated by
`CLOUDGRID_STORAGE_ADAPTER`. The MVP SurrealDB build uses `-tags surrealdb` and
supports only `surrealdb`.

The MVP has no retention policy or deletion API. Telemetry remains in SurrealDB
until an operator resets or deletes the database.
