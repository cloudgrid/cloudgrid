---
title: "Start, Stop, And Reset"
description: "This page covers day-to-day local operation."
order: 1
accent: amber
eyebrow: "Handbook - Operations"
updated: 2026-05-18
---

This page covers day-to-day local operation.

## Start Infrastructure

```sh
bun run dev:infra
```

Equivalent:

```sh
docker compose --env-file .env up -d nats surrealdb
```

Inspect infrastructure:

```sh
docker compose --env-file .env ps
docker compose --env-file .env logs -f nats surrealdb
```

## Start Application Services

Preferred local command:

```sh
bun run dev:all
```

Manual order:

| Step | Service | Command |
| --- | --- | --- |
| 1 | storage-write | `go run -tags surrealdb ./core/storage-write/cmd/storage-write` |
| 2 | storage-read | `go run -tags surrealdb ./core/storage-read/cmd/storage-read` |
| 3 | control-plane | `go run ./core/control-plane/cmd/control-plane` |
| 4 | BFF and frontend | `bun run dev` |
| 5 | OTLP collector | `go run ./core/otlp-collector/cmd/otlp-collector` |

The startup order avoids noisy first-load request timeouts. If the BFF starts before private services subscribe to NATS subjects, early GraphQL requests can fail with `MESSAGE_BRIDGE_TIMEOUT`.

## Stop Services

Stop `dev:all` with `Ctrl+C`.

Stop Docker infrastructure:

```sh
docker compose --env-file .env down
```

## Reset Local Data

This removes NATS JetStream and SurrealDB volumes:

```sh
docker compose --env-file .env down -v
```

Then restart:

```sh
bun run dev:infra
bun run dev:all
```

## Ports Already In Use

| Port | Default owner | Override |
| --- | --- | --- |
| `3000` | BFF | `CLOUDGRID_BFF_PORT` |
| `5173` | frontend dev server | `CLOUDGRID_FRONTEND_DEV_PORT` |
| `4318` | OTLP/HTTP collector | `CLOUDGRID_OTLP_HTTP_ADDR` |
| `4317` | OTLP/gRPC collector | `CLOUDGRID_OTLP_GRPC_ADDR` |
| `4222` | NATS client | `CLOUDGRID_NATS_PORT` in Docker Compose env |
| `8000` | SurrealDB | `CLOUDGRID_SURREALDB_PORT` in Docker Compose env |

## Next Step

Confirm readiness with [Health and readiness](/handbook/operations/health-readiness).
