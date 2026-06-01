---
title: SurrealDB 3.1 Baseline Upgrade
status: complete
updated: 2026-05-28
---

# SurrealDB 3.1 Baseline Upgrade

## Source

Official SurrealDB 3.1 release notes identify `v3.1.0` as the latest stable
minor release on 2026-05-26 and state that 3.0 to 3.1 catalog and on-disk
layouts are unchanged.

## Changed Baseline

CloudGrid local, release Compose, bundled Helm evaluation, and disposable
integration infrastructure now default to:

```text
surrealdb/surrealdb:v3.1.0
```

Updated surfaces:

- `.env.example`
- `compose.yaml`
- `deploy/compose/cloudgrid.compose.yaml`
- `deploy/compose/cloudgrid.env.example`
- `charts/cloudgrid/values.yaml`
- `tooling/scripts/integration-local.mjs`
- `README.md`
- `specs/04-backend/surrealdb-persistence.md`
- `specs/06-nfr/release-distribution.md`
- website storage, external dependency, production readiness, and
  upgrade/rollback handbook pages

## Upgrade Rules

- Take the normal SurrealDB/NATS backup or recovery point before a production
  dependency upgrade.
- 3.0.x RocksDB volumes may be upgraded in place to 3.1.0 under the official
  unchanged-layout guarantee.
- Storage-owning services authenticate before selecting a namespace/database
  and explicitly create missing namespaces/databases before schema work because
  SurrealDB 3.1 rejects selecting missing namespaces.
- If writes occur after upgrading, rollback must follow the environment's
  storage recovery plan; do not treat Helm image rollback alone as sufficient.
- SurrealDB server metrics changed in 3.1. External dashboards that scrape
  SurrealDB directly must be reviewed separately from CloudGrid product
  telemetry.

## Validation

Required before promoting this dependency baseline:

```sh
docker manifest inspect surrealdb/surrealdb:v3.1.0
CLOUDGRID_SURREALDB_IMAGE_TAG=v3.1.0 docker compose --env-file .env up -d --force-recreate surrealdb
CLOUDGRID_ENABLE_SURREALDB_RETENTION_TESTS=true go test -count=1 -tags surrealdb ./core/storage-maintenance/internal/adapters/surrealdb
CLOUDGRID_ENABLE_SURREALDB_STORAGE_WRITE_TESTS=true go test -count=1 -tags surrealdb ./core/storage-write/internal/adapters/surrealdb
CLOUDGRID_ENABLE_SURREALDB_CONTROL_TESTS=true go test -count=1 -tags surrealdb ./core/control-plane/internal
go test -tags surrealdb ./core/storage-read/... ./core/storage-maintenance/... ./core/storage-write/internal/adapters/surrealdb ./core/control-plane/internal/adapters/surrealdb
```

If query planner, index, or storage engine behavior changes for a future
SurrealDB release, also run the opt-in query-plan suites and record the result
with release evidence.
