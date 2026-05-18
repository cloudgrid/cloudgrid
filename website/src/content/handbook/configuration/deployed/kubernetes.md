---
title: "Kubernetes And Deployment Status"
description: "CloudGrid includes a Helm chart and release workflow definition; published images and release attestations are produced by the release workflow."
order: 15
accent: amber
eyebrow: "Handbook - Configuration"
updated: 2026-05-18
---

CloudGrid now includes a Helm chart at `charts/cloudgrid` and a release workflow definition. Signed service images, pushed chart artifacts, SBOM/provenance output, and a release manifest are produced only when the release workflow runs.

Treat this page as a deployment-readiness map. The chart is the implemented deployment artifact, but operators still need environment-specific values, secrets, ingress/TLS, and image digests from a completed release.

## Target Service Set

| Service | Public | Scales horizontally | Needs SurrealDB credentials |
| --- | --- | --- | --- |
| `cloudgrid-bff` | Yes | Yes | No |
| `cloudgrid-otlp-collector` | Yes | Yes | No |
| `cloudgrid-storage-read` | No | Yes | Yes |
| `cloudgrid-storage-write` | No | Production target uses pull mode for multiple replicas | Yes |
| `cloudgrid-control-plane` | No | Low-volume replicas | Yes |
| `cloudgrid-alert-evaluator` | No | Scheduler-controlled replicas | No direct SurrealDB access |
| `cloudgrid-storage-maintenance` | No | Maintenance replicas | Yes |
| `cloudgrid-ai-eval-runner` | No | Optional | No SurrealDB access |
| NATS JetStream | No | Clustered dependency | No |
| SurrealDB | No | Deployment-specific | Owns its credentials |

## Production Deployment Boundary

```mermaid
flowchart TB
  subgraph Public["Public network"]
    Users["Browser users"]
    Emitters["OTLP emitters"]
  end
  subgraph Cluster["Kubernetes cluster"]
    Ingress["Ingress or gateway"]
    BFF["cloudgrid-bff"]
    Collector["cloudgrid-otlp-collector"]
    NATS["NATS JetStream\nprivate"]
    Read["cloudgrid-storage-read\nprivate"]
    Write["cloudgrid-storage-write\nprivate"]
    Control["cloudgrid-control-plane\nprivate"]
    Alerts["cloudgrid-alert-evaluator\nprivate"]
    Maintenance["cloudgrid-storage-maintenance\nprivate"]
    Secrets["Kubernetes Secrets"]
  end
  subgraph Data["Private data services"]
    DB["SurrealDB"]
  end
  Users --> Ingress --> BFF
  Emitters --> Ingress --> Collector
  BFF --> NATS
  Collector --> NATS
  NATS --> Read
  NATS --> Write
  NATS --> Control
  NATS --> Alerts
  Read --> DB
  Write --> DB
  Control --> DB
  Maintenance --> DB
  Secrets --> Read
  Secrets --> Write
  Secrets --> Control
  Secrets --> Maintenance
```

## Kubernetes Boundary Rules

- Only the BFF and OTLP collector should receive ingress.
- NATS and SurrealDB must be private cluster services or external managed endpoints.
- SurrealDB credentials are mounted only into storage-read, storage-write, control-plane, and storage-maintenance pods.
- The BFF image may contain built frontend assets.
- The collector, frontend, BFF responses, and generated assets must not expose SurrealDB credentials.
- The chart must not add REST telemetry read endpoints, public NATS, or public SurrealDB.

## Helm Values Shape

The implemented chart uses one CloudGrid Helm release with values for:

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

controlPlane:
  replicas: 1

alertEvaluator:
  enabled: false

storageMaintenance:
  enabled: false

nats:
  external:
    url: nats://nats.private:4222

surrealdb:
  external:
    url: http://surrealdb.private:8000/rpc
    existingSecret: cloudgrid-surrealdb
```

Use `helm lint charts/cloudgrid` and `helm template` with the intended profile before deployment. Profiles live under `charts/cloudgrid/profiles`.

## Secret Handling

Kubernetes Secrets should hold:

- `CLOUDGRID_SESSION_SECRET`;
- SSO provider client secrets;
- SurrealDB username and password;
- deployed self-observability bearer token;
- optional AI-eval harness credentials when the relevant specs and adapters define them.

ConfigMaps can hold non-secret values such as deployment mode, ports, provider IDs, issuer URLs, and public callback URLs.

## Runtime Configuration Checklist

- Set `CLOUDGRID_DEPLOYMENT_MODE=deployed`.
- Set `CLOUDGRID_AUTH_MODE=sso`.
- Configure one or more SSO providers and callback URLs.
- Set `CLOUDGRID_PUBLIC_URL` to the browser URL used in invitation email links.
- Configure SMTP invitation email variables for deployed SSO onboarding.
- Keep `CLOUDGRID_GRAPHQL_UI` disabled unless the environment is trusted.
- Mount SurrealDB credentials only into storage-read, storage-write, control-plane, and storage-maintenance.
- Use external managed NATS and SurrealDB for production unless a chart profile explicitly documents bundled production dependencies.

## Production Profiles

The release spec defines target profiles:

| Profile | Purpose |
| --- | --- |
| `local` | Single-node evaluation with bundled dependencies. |
| `small` | Team deployment with a few replicas and private dependencies. |
| `enterprise` | HPA-ready services, external NATS and SurrealDB recommended, SSO required. |

These profiles are implemented under `charts/cloudgrid/profiles` and are intended as starting points, not complete environment policy.

## Next Step

For currently implemented runtime configuration, use [Deployed configuration](/handbook/configuration/deployed) and [SSO overview](/handbook/configuration/deployed/sso).
