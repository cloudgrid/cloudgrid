# Local Setup Script

`bun run setup:local` prepares local multi-project token routing without printing secrets.

## What It Writes

The script creates or updates `.env` with:

```sh
CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS={...}
CLOUDGRID_OTLP_LOCAL_PROJECT_ID=default
CLOUDGRID_PROJECT_API_KEY=<default-project-token>
CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID=cloudgrid-system
CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID=local
CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN=<cloudgrid-system-token>
```

Token values are opaque URL-safe bearer tokens with at least 32 random bytes of entropy.

## Idempotency

When valid token mappings for `default` and `cloudgrid-system` already exist, the script preserves them. Rotation is not implicit. A future rotation flag must be explicitly documented before implementation.

## Run It

```sh
bun run setup:local
```

Expected output names the configured projects and variables, but not token values:

```text
Updated .env local OTLP token routing for projects: default, cloudgrid-system
Wrote CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS, CLOUDGRID_PROJECT_API_KEY, and CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN
Next: bun run dev:infra && bun run dev:all
```

## Why It Exists

The local setup script makes two local use cases work without hand-editing secrets:

1. normal application telemetry routes to the `default` project;
2. CloudGrid service telemetry routes to the `cloudgrid-system` project.

The collector still ignores project IDs in OTLP attributes. Routing comes only from the validated local bearer token.

## Next Step

Read [Local project-token routing](./project-token-routing.md) for the runtime behavior.
