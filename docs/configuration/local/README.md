# Local Configuration

Local mode is the default CloudGrid development path.

```sh
CLOUDGRID_DEPLOYMENT_MODE=local
CLOUDGRID_AUTH_MODE=local
```

It creates a trusted local workspace with no login and a visible `Personal` company. Do not expose local mode to untrusted networks.

## Local Projects

CloudGrid local mode uses durable local projects:

| Project ID | Name | Purpose |
| --- | --- | --- |
| `default` | `Default project` | Application telemetry and normal local testing. |
| `cloudgrid-system` | `CloudGrid` | CloudGrid service telemetry when self-observability is enabled. |

Both projects are visible in the project picker. The `cloudgrid-system` project is fixed in local mode; attempts to change its name, slug, or status must be rejected.

## Recommended Local Setup

```sh
bun run setup:local
bun run dev:infra
bun run dev:all
```

`setup:local` configures token routing for `default` and `cloudgrid-system`, then `dev:infra` starts NATS and SurrealDB.

## Minimal Local Mode

If you do not configure local project tokens, anonymous local ingest uses:

```sh
CLOUDGRID_OTLP_LOCAL_PROJECT_ID=default
```

This fallback is for single-project development only. It does not route CloudGrid self-observability into `cloudgrid-system`.

## Local Config Files

| File | Purpose |
| --- | --- |
| `.env` | Local values consumed by scripts and Docker Compose. |
| `.env.example` | Example values and image versions. |
| `compose.yaml` | Local NATS and SurrealDB infrastructure. |
| `deploy/compose/cloudgrid.compose.yaml` | Release Compose stack using published CloudGrid images. |
| `deploy/compose/cloudgrid.env.example` | Release Compose environment example. |

## Next Step

Use [Local setup script](./setup-script.md) for repeatable source setup, or [Run the release Compose stack](../../getting-started/docker-compose-release.md) for published images.
