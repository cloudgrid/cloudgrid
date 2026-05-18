---
title: "Kubernetes And Deployment Status"
description: "CloudGrid has a specified enterprise Kubernetes target, but the repository does not yet include a Helm chart or production Kubernetes manifests."
order: 15
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-18
---

CloudGrid has a specified enterprise Kubernetes target, but the repository does not yet include a Helm chart or production Kubernetes manifests.

Treat this page as a deployment-readiness map, not an install command.

## Target Service Set

| Service | Public | Scales horizontally | Needs SurrealDB credentials |
| --- | --- | --- | --- |
| `cloudgrid-bff` | Yes | Yes | No |
| `cloudgrid-otlp-collector` | Yes | Yes | No |
| `cloudgrid-storage-read` | No | Yes | Yes |
| `cloudgrid-storage-write` | No | Planned production pull mode | Yes |
| `cloudgrid-control-plane` | No | Low-volume replicas | Yes |
| `cloudgrid-ai-eval-runner` | No | Optional | No SurrealDB access |
| NATS JetStream | No | Clustered dependency | No |
| SurrealDB | No | Deployment-specific | Owns its credentials |

## Kubernetes Boundary Rules

- Only the BFF and OTLP collector should receive ingress.
- NATS and SurrealDB must be private cluster services or external managed endpoints.
- SurrealDB credentials are mounted only into storage-read, storage-write, and control-plane pods.
- The BFF image may contain built frontend assets.
- The collector, frontend, BFF responses, and generated assets must not expose SurrealDB credentials.
- The chart must not add REST telemetry read endpoints, public NATS, or public SurrealDB.

## Future Helm Values Shape

The release spec requires one OCI Helm chart with values for:

```yaml
global:
  imageRegistry: ghcr.io/cloudgrid-dev

bff:
  replicas: 2
  image:
    repository: cloudgrid-bff
    digest: sha256:...
  env:
    CLOUDGRID_DEPLOYMENT_MODE: deployed
    CLOUDGRID_AUTH_MODE: sso

otlpCollector:
  replicas: 2
  service:
    otlpHttpPort: 4318
    otlpGrpcPort: 4317

storageRead:
  replicas: 2

storageWrite:
  replicas: 1

nats:
  external:
    url: nats://nats.private:4222

surrealdb:
  external:
    url: http://surrealdb.private:8000/rpc
    existingSecret: cloudgrid-surrealdb
```

This is a target shape from the release spec, not an implemented chart.

## Secret Handling

Kubernetes Secrets should hold:

- `CLOUDGRID_SESSION_SECRET`;
- SSO provider client secrets;
- SurrealDB username and password;
- deployed self-observability bearer token;
- optional AI-eval harness credentials when the relevant specs and adapters define them.

ConfigMaps can hold non-secret values such as deployment mode, ports, provider IDs, issuer URLs, and public callback URLs.

## Production Profiles

The release spec defines target profiles:

| Profile | Purpose |
| --- | --- |
| `local` | Single-node evaluation with bundled dependencies. |
| `small` | Team deployment with a few replicas and private dependencies. |
| `enterprise` | HPA-ready services, external NATS and SurrealDB recommended, SSO required. |

These profiles are not implemented yet.

## Next Step

For currently implemented runtime configuration, use [Deployed configuration](/handbook/configuration/deployed) and [SSO overview](/handbook/configuration/deployed/sso).
