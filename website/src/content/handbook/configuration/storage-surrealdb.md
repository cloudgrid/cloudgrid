---
title: "SurrealDB Storage"
description: "SurrealDB is the implemented storage adapter for CloudGrid."
order: 2
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-18
---

SurrealDB is the implemented storage adapter for CloudGrid.

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

Check readiness with:

```sh
curl -fsS http://localhost:8081/readyz
curl -fsS http://localhost:8082/readyz
curl -fsS http://localhost:8084/readyz
```

## Next Step

After storage is configured, review [Health and readiness](/handbook/operations/health-readiness).
