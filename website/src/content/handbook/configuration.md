---
title: Configuration
description: Env vars, deployment modes, auth modes, SSO providers, retention.
order: 4
accent: amber
eyebrow: Handbook · Configuration
updated: 2026-05-17
---

CloudGrid is configured through environment variables. The same binary can
run on a laptop in local-stub auth mode and in production with full SSO —
the difference is two env vars.

## Env vars

| Env var | Value | Purpose |
| --- | --- | --- |
| `CLOUDGRID_DEPLOYMENT_MODE` | `local \| deployed` | Selects single-binary vs independent services. |
| `CLOUDGRID_AUTH_MODE` | `local \| sso` | Local-stub auth or full SSO. |
| `CLOUDGRID_AUTH_PROVIDERS` | `github,google,azure` | Comma-separated providers to enable in SSO mode. |
| `CLOUDGRID_GITHUB_CLIENT_ID / _SECRET` | string | GitHub OAuth app. |
| `CLOUDGRID_GOOGLE_CLIENT_ID / _SECRET` | string | Google OAuth app. |
| `CLOUDGRID_AZURE_TENANT_ID / _CLIENT_ID / _SECRET` | string | Microsoft Entra ID app. |
| `CLOUDGRID_BFF_LISTEN` | `:3000` | TypeScript BFF listen address (HTTP + GraphQL). |
| `CLOUDGRID_COLLECTOR_LISTEN` | `:4318` | OTLP HTTP listen address. |
| `NATS_URL` | `nats://nats:4222` | Message bridge endpoint (v1 adapter: NATS JetStream). |
| `SURREALDB_URL` | `ws://surrealdb:8000` | Storage backend endpoint (v1 adapter: SurrealDB). |

## Mode matrix

Deployment mode and auth mode combine into four meaningful configurations.
Only three are recommended:

- `local` + `local`: laptop / dev. Personal project auto-created.
- `deployed` + `local`: *not recommended*. Use SSO in deployed mode.
- `deployed` + `sso`: production. SSO sessions, project memberships
  enforced.
- `local` + `sso`: rarely useful. Local-mode SurrealDB with real OAuth.

## SSO providers

Set `CLOUDGRID_AUTH_PROVIDERS` to enable providers, then supply the
matching client id / secret env vars. The BFF exchanges OAuth codes for
tokens server-side and issues HttpOnly cookies. **Provider tokens never
reach the browser.**

## Projects and isolation

Project is the strict telemetry boundary. Every ingest request carries a
project routing token (created by an admin in the control plane). Every
query and live subscription resolves project membership before returning
data.

## Retention policies

Retention is configured per project in the control plane. `storage-write`
enforces retention on persistence; `storage-read` enforces visibility on
read. Cold-storage offload is a future adapter capability.
