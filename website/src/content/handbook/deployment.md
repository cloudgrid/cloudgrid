---
title: Deployment
description: From a laptop to a fleet, in three steps.
order: 3
accent: cyan
eyebrow: Handbook · Deployment
updated: 2026-05-17
---

CloudGrid has two deployment shapes: **local** single-binary (for
development and small-team use) and **deployed** mode (for production).

## Three steps

1. **Local** — single docker compose, all services in one image. Best for
   development, single-user local observability, and demos.
2. **Deployed (Compose)** — independent service containers, dedicated
   SurrealDB and NATS, SSO turned on. Best for small teams and self-hosted
   production.
3. **Deployed (Kubernetes)** — one deployment per service. Independent
   horizontal scale on `otlp-collector`, BFF, and `storage-read`.
   Recommended for production at any meaningful scale.

## Deployment modes

Mode is set by environment variables. Local mode runs everything in one
binary, against an in-process or sibling SurrealDB and NATS. Deployed mode
expects each service to run as its own process with its own scaling unit.

- `CLOUDGRID_DEPLOYMENT_MODE=local` — single binary, local-only auth,
  Personal project auto-created.
- `CLOUDGRID_DEPLOYMENT_MODE=deployed` — services run independently,
  project boundaries enforced.

## Auth modes

Auth is orthogonal to deployment. Local mode supports a stub auth identity
for development; SSO mode wires GitHub, Google, or Microsoft Entra ID
through the BFF.

- `CLOUDGRID_AUTH_MODE=local` — pre-seeded user, project-membership
  enforced but no provider sign-in.
- `CLOUDGRID_AUTH_MODE=sso` — OAuth/OIDC, BFF-managed HttpOnly cookies.

## Scaling guidance

- **otlp-collector** — scale horizontally; stateless, only publishes to
  the bridge.
- **BFF** — scale horizontally; stateless GraphQL, live subscription
  state owned by `storage-read`.
- **storage-read** — scale horizontally; replicas share the live
  subscription consumer pool.
- **storage-write** — scale vertically first. JetStream consumer groups
  can scale horizontally with care.
- **NATS JetStream** — cluster according to your durability and
  throughput targets.
- **SurrealDB** — cluster for HA; provision IOPS-aware storage.

## Observing CloudGrid itself

Every service emits structured JSON logs with trace and span correlation.
CloudGrid is happy to receive its own OTLP traces — pointing the BFF and Go
services at their own OTLP endpoint is a reasonable smoke-test for the
whole pipeline.

## Backups

Telemetry persistence and control-plane state both live in SurrealDB. Back
up SurrealDB through its standard tooling. Retention policies are
configured per project — see the [Configuration page](/handbook/configuration).
