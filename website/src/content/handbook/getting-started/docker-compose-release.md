---
title: "Run The Release Compose Stack"
description: "Run CloudGrid locally from published container images with Docker Compose."
sidebar: "Release Compose"
order: 2
accent: emerald
eyebrow: "Handbook - Getting started"
updated: 2026-05-18
---

Use this path when you want to run CloudGrid from published container images
instead of building the services from source. It is the intended local
evaluation path for release users.

Local release Compose runs in `local` mode: no browser login, one visible
`Personal` company, and the `default` project for anonymous local ingest. Do
not expose this stack to untrusted networks.

## Prerequisites

- Docker with Docker Compose.
- Access to the release artifacts or a local checkout containing
  `deploy/compose/cloudgrid.compose.yaml` and
  `deploy/compose/cloudgrid.env.example`.
- Access to the published images in `ghcr.io/cloudgrid-dev`.

Public images do not require Docker login. Private package visibility requires
GHCR authentication before `docker compose pull`.

## 1. Start CloudGrid

From a release download:

```sh
./cloudgrid-local.sh up
```

From a repository checkout:

```sh
deploy/compose/cloudgrid-local.sh up
```

The script creates `.env` from `cloudgrid.env.example` when it is missing, then
starts the release Compose stack.

For the beta release, the important image values in `.env` are:

```sh
CLOUDGRID_IMAGE_REGISTRY=ghcr.io/cloudgrid-dev
CLOUDGRID_IMAGE_TAG=v1.0.0-beta
```

## Compose Fallback

The script is the preferred entry point. The equivalent raw Compose command is:

```sh
docker compose --env-file .env -f cloudgrid.compose.yaml up -d
```

From a repository checkout, the equivalent raw command is:

```sh
docker compose --env-file .env -f deploy/compose/cloudgrid.compose.yaml up -d
```

This starts:

- BFF with built frontend assets on `http://localhost:3000`;
- OTLP HTTP on `http://localhost:4318`;
- OTLP gRPC on `localhost:4317`;
- storage-read, storage-write, and control-plane on the private Compose
  network;
- NATS JetStream and SurrealDB with local persistent volumes.

NATS and SurrealDB are bound to `127.0.0.1` for local inspection only. They are
not public service endpoints.

## 2. Open CloudGrid

Open:

```text
http://localhost:3000
```

Pick the `Default project`, then send telemetry to the collector.

## 3. Send Telemetry

OTLP HTTP endpoint:

```text
http://localhost:4318
```

OTLP gRPC endpoint:

```text
localhost:4317
```

With the default release Compose env, anonymous local ingest is routed to the
`default` project through `CLOUDGRID_OTLP_LOCAL_PROJECT_ID=default`.

## Optional Profiles

AI eval runner:

```sh
docker compose --env-file .env -f cloudgrid.compose.yaml --profile ai-eval up -d
```

Maintenance shells for alert evaluator and storage-maintenance:

```sh
docker compose --env-file .env -f cloudgrid.compose.yaml --profile maintenance up -d
```

These profiles expose service containers for the implemented service
boundaries. Production scheduling and adapter wiring for alert execution and
retention deletion remain documented operations work.

## Stop Or Reset

Stop services:

```sh
./cloudgrid-local.sh down
```

Remove local NATS and SurrealDB data:

```sh
./cloudgrid-local.sh reset
```

## Artifact Verification

For release downloads, use the release `checksums.txt` and signed checksum
files to verify `cloudgrid.compose.yaml`, `cloudgrid.env.example`, image SBOMs,
and binary archives before running them.

## Next Step

Send your own telemetry with [Send telemetry](/handbook/getting-started/send-telemetry), or use the
source development path in [Local quickstart](/handbook/getting-started/local-quickstart).
