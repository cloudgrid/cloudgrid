---
title: "Local Setup Script"
description: "bun run setup:local prepares local multi-project token routing without printing secrets."
order: 4
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-31
---

`bun run setup:local` prepares local multi-project token routing and local
Docker ports without printing secrets.

## What It Writes

The script creates or updates `.env` with:

```sh
CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS={...}
CLOUDGRID_OTLP_LOCAL_PROJECT_ID=default
CLOUDGRID_PROJECT_API_KEY=<default-project-token>
CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID=cloudgrid-system
CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID=local
CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN=<cloudgrid-system-token>
CLOUDGRID_NATS_PORT=4222
CLOUDGRID_NATS_MONITOR_PORT=8222
CLOUDGRID_NATS_URL=nats://localhost:4222
CLOUDGRID_SURREALDB_PORT=8000
CLOUDGRID_SURREALDB_URL=http://localhost:8000/rpc
```

Token values are opaque URL-safe bearer tokens with at least 32 random bytes of entropy.
When one of the default local infrastructure ports is already occupied, the
script selects a free localhost port and writes matching URL variables. For
example, if another SurrealDB instance already listens on `8000`, the script
writes a different `CLOUDGRID_SURREALDB_PORT` and the corresponding
`CLOUDGRID_SURREALDB_URL`.

## Idempotency

When valid token mappings for `default` and `cloudgrid-system` already exist, the script preserves them. Rotation is not implicit. A rotation flag must be explicitly documented before implementation.

## Run It

```sh
bun run setup:local
```

Expected output names the configured projects and variables, but not token values:

```text
Updated .env local OTLP token routing for projects: default, cloudgrid-system
Wrote CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS, CLOUDGRID_PROJECT_API_KEY, and CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN
Configured local Docker ports: NATS 4222, NATS monitor 8222, SurrealDB 18000
SurrealDB CLOUDGRID_SURREALDB_PORT port 8000 was unavailable; selected 18000.
Next: bun run dev:infra && bun run dev:all
```

## Why It Exists

The local setup script makes two local use cases work without hand-editing secrets:

1. normal application telemetry routes to the `default` project;
2. CloudGrid service telemetry routes to the `cloudgrid-system` project.

The collector still ignores project IDs in OTLP attributes. Routing comes only from the validated local bearer token.

## Next Step

Read [Local project-token routing](/handbook/configuration/local/project-token-routing) for the runtime behavior.
