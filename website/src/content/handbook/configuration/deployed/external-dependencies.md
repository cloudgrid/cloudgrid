---
title: "External NATS And SurrealDB"
description: "Configure production CloudGrid deployments to use private external NATS JetStream and SurrealDB endpoints."
sidebar: "External dependencies"
order: 17
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-19
---

Production CloudGrid deployments should use private NATS JetStream and SurrealDB endpoints. Bundled chart dependencies are useful for evaluation, but production operators are responsible for lifecycle, backup, availability, and access policy for the data services.

## Boundary Rules

- NATS and SurrealDB are private dependencies, not public ingress.
- The frontend and BFF never receive SurrealDB credentials.
- The collector never writes SurrealDB directly.
- `storage-write` is the only service that mutates telemetry storage.
- `storage-read` is the only service that reads telemetry records for GraphQL.
- `control-plane` owns company, user, project, dashboard, alert, and retention control data.
- `storage-maintenance` receives SurrealDB credentials only when retention execution is enabled for the environment.

## NATS

Set one private NATS URL for the service mesh:

```yaml
nats:
  bundled:
    enabled: false
  external:
    url: nats://nats.private:4222
```

This maps to `CLOUDGRID_NATS_URL` in service environments. The URL must point to a private cluster service or private managed endpoint. Do not expose NATS through public ingress.

NATS must provide JetStream because the collector publishes ingest commands and storage-write consumes durable work from JetStream. Configure the NATS max payload at least as high as `CLOUDGRID_OTLP_MAX_REQUEST_BYTES`; CloudGrid defaults to an 8 MiB bundled NATS payload limit for a 4 MiB OTLP request limit. The collector `/readyz` endpoint remains degraded when the connected NATS server advertises a smaller payload limit.

## SurrealDB

Configure SurrealDB as an external endpoint and keep credentials in an existing Kubernetes Secret:

```yaml
surrealdb:
  bundled:
    enabled: false
  external:
    url: http://surrealdb.private:8000/rpc
    existingSecret: cloudgrid-surrealdb
    usernameKey: CLOUDGRID_SURREALDB_USERNAME
    passwordKey: CLOUDGRID_SURREALDB_PASSWORD
  namespace: observability
  database: production
```

Create the Secret:

```sh
kubectl -n cloudgrid create secret generic cloudgrid-surrealdb \
  --from-literal=CLOUDGRID_SURREALDB_USERNAME='<surrealdb-username>' \
  --from-literal=CLOUDGRID_SURREALDB_PASSWORD='<surrealdb-password>'
```

Do not use the local `root` / `root` defaults in production. Do not include SurrealDB credentials in values files, ConfigMaps, frontend assets, release archives, logs, or support bundles.

CloudGrid's bundled evaluation baseline is `surrealdb/surrealdb:v3.1.0`.
Production deployments may use external managed or operator-owned SurrealDB, but
the chosen version must pass CloudGrid's live SurrealDB adapter checks before
promotion. When moving a 3.0.x database to 3.1.0, take the normal backup or
recovery point first; SurrealDB documents the 3.0 to 3.1 catalog and on-disk
layouts as unchanged.

## Credential Mount Scope

The Helm chart is expected to mount SurrealDB credentials only into:

| Service | Why it needs storage credentials |
| --- | --- |
| `cloudgrid-storage-read` | Reads telemetry records for GraphQL and live sessions. |
| `cloudgrid-storage-write` | Persists ingest commands from JetStream. |
| `cloudgrid-control-plane` | Stores control-plane state. |
| `cloudgrid-storage-maintenance` | Executes retention maintenance when enabled. |

The BFF, frontend assets, collector, alert evaluator, AI eval runner, and clients must not receive those credentials.

## Bundled Dependencies For Evaluation

Use bundled dependencies only for isolated evaluation:

```yaml
nats:
  bundled:
    enabled: true

surrealdb:
  bundled:
    enabled: true
```

Bundled NATS and SurrealDB remain private `ClusterIP` services. They are not a production availability or backup plan.

## Readiness Checks

After deployment:

```sh
kubectl -n cloudgrid rollout status deployment/cloudgrid-storage-read
kubectl -n cloudgrid rollout status deployment/cloudgrid-storage-write
kubectl -n cloudgrid rollout status deployment/cloudgrid-control-plane
```

If readiness fails, check the relevant private service logs. Configuration validation failures map to `ERR-009 CONFIG_INVALID`.

## Next Step

Use [Enterprise Helm install](/handbook/configuration/deployed/helm-install) for the full install path, and [Health and readiness](/handbook/operations/health-readiness) for service checks.
