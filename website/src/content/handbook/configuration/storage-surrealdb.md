---
title: "SurrealDB Storage"
description: "SurrealDB is the implemented storage adapter for CloudGrid."
order: 2
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-31
---

SurrealDB is the implemented storage adapter for CloudGrid.

CloudGrid local, release Compose, and bundled Helm evaluation defaults use
`surrealdb/surrealdb:v3.1.0`. SurrealDB 3.1.0 is an in-place compatible minor
upgrade from 3.0.x for existing RocksDB volumes, but production operators should
still take the normal backup or recovery point before upgrading the database
dependency.

## Required Variables

```sh
CLOUDGRID_STORAGE_ADAPTER=surrealdb
CLOUDGRID_SURREALDB_URL=http://localhost:8000/rpc
CLOUDGRID_SURREALDB_NAMESPACE=observability
CLOUDGRID_SURREALDB_DATABASE=dev
CLOUDGRID_SURREALDB_USERNAME=root
CLOUDGRID_SURREALDB_PASSWORD=root
```

Use real secrets in deployed environments. The local `root` example is only for the local Docker Compose stack.

For local development, `CLOUDGRID_SURREALDB_PORT` controls the Docker Compose
host port and `CLOUDGRID_SURREALDB_URL` must point to the same port. Run
`bun run setup:local` before `bun run dev:infra` to have CloudGrid select a free
port automatically when another local SurrealDB instance already uses `8000`.

## Build Tags

Storage services must be built or run with the SurrealDB build tag:

```sh
go run -tags surrealdb ./core/storage-read/cmd/storage-read
go run -tags surrealdb ./core/storage-write/cmd/storage-write
```

The control-plane service also uses SurrealDB as its authoritative metadata store.

## Credential Boundary

SurrealDB credentials are private to:

- `core/storage-read`
- `core/storage-write`
- `core/control-plane`

They must not appear in:

- frontend code or bundles;
- BFF responses;
- OTLP collector logs;
- generated assets;
- dashboards;
- public error details.

## Data Ownership

| Service | SurrealDB role |
| --- | --- |
| `storage-write` | Mutates telemetry records. |
| `storage-read` | Reads telemetry records and owns query semantics. |
| `control-plane` | Reads and mutates company, project, user, dashboard, retention, alert, and settings records. |
| BFF | No SurrealDB access. |
| Frontend | No SurrealDB access. |
| OTLP collector | No SurrealDB access. |

## Readiness

Storage and control-plane services must not report ready until they can connect, authenticate, apply required schema, and run bounded readiness checks.

For telemetry reads, storage-read readiness requires indexes that match the full project ownership predicate: `tenantId`, `companyId`, and `projectId` plus the selective field or sort field used by trace, log, metric, and facet queries. Trace list and live-candidate reads use denormalized count fields stored on `trace`; storage-read does not recompute span/log/service counts for every page. Write-side refreshes for one known trace target the deterministic SurrealDB record ID, for example `trace:<traceId>`, instead of scanning the trace table with a `WHERE` update.

When upgrading SurrealDB, run the live SurrealDB integration checks against the
target image before promotion. SurrealDB 3.1 also changes server-side metrics
names and public metrics exposure, so update any external SurrealDB dashboards
that scrape the database directly.

Check readiness with:

```sh
curl -fsS http://localhost:8081/readyz
curl -fsS http://localhost:8082/readyz
curl -fsS http://localhost:8084/readyz
```

## Next Step

After storage is configured, review [Health and readiness](/handbook/operations/health-readiness).
