---
title: "Image Customization"
description: "Customize CloudGrid service images and base images without weakening runtime boundaries."
sidebar: "Image customization"
order: 18
accent: violet
eyebrow: "Handbook - Configuration"
updated: 2026-05-19
---

CloudGrid releases publish one OCI image per deployable service. The official images are the supported production runtime artifacts; binary archives are convenience artifacts for inspection and direct service testing.

## Service Images

| Image | Runtime role |
| --- | --- |
| `cloudgrid-bff` | Public GraphQL, auth, health, and static frontend serving. |
| `cloudgrid-otlp-collector` | Public OTLP HTTP/gRPC ingestion. |
| `cloudgrid-storage-read` | Private telemetry query and live fanout service. |
| `cloudgrid-storage-write` | Private JetStream persistence worker. |
| `cloudgrid-control-plane` | Private company, user, project, dashboard, alert, and retention control service. |
| `cloudgrid-ai-eval-runner` | Optional private AI evaluation runner. |
| `cloudgrid-alert-evaluator` | Optional private alert rule evaluator. |
| `cloudgrid-storage-maintenance` | Private retention maintenance worker. |

The BFF image is the only image that may contain built frontend assets. No image should contain `.env`, local credentials, test secrets, private keys, dependency caches, or SurrealDB credentials.

## Production Image References

Production values should use digests:

```yaml
global:
  imageRegistry: ghcr.io/cloudgrid-dev

bff:
  image:
    repository: cloudgrid-bff
    digest: sha256:<digest>
    pullPolicy: IfNotPresent
```

Semantic tags such as `v1.0.0-beta` are readable release identifiers, but production rollout values should pin the digest from `release-values.yaml` or `release-manifest.json`. Do not use `latest` for production.

## Runtime Hardening Defaults

CloudGrid runtime images and Kubernetes values are expected to preserve:

- numeric non-root UID/GID;
- read-only root filesystem;
- dropped Linux capabilities;
- disabled privilege escalation;
- owned service ports only;
- health probes on `/livez` and `/readyz` where the service exposes them;
- SurrealDB credentials mounted only into storage-owning services.

## Custom Base Image Build Args

Official Dockerfiles support base image and runtime identity overrides:

| Build arg | Applies to | Purpose |
| --- | --- | --- |
| `CLOUDGRID_GO_BUILDER_IMAGE` | Go services | Builder image with the supported Go toolchain. |
| `CLOUDGRID_GO_RUNTIME_IMAGE` | Go services | Minimal runtime base for compiled Go binaries. |
| `CLOUDGRID_BUN_BUILDER_IMAGE` | BFF | Builder image with Bun and Node-compatible tooling. |
| `CLOUDGRID_BUN_RUNTIME_IMAGE` | BFF | Minimal runtime base for the production BFF bundle. |
| `CLOUDGRID_IMAGE_UID` | all services | Numeric runtime user ID. |
| `CLOUDGRID_IMAGE_GID` | all services | Numeric runtime group ID. |

Example:

```sh
docker buildx build \
  --file deploy/docker/cloudgrid-storage-read.Dockerfile \
  --build-arg CLOUDGRID_GO_BUILDER_IMAGE=registry.example.com/base/go:1.25 \
  --build-arg CLOUDGRID_GO_RUNTIME_IMAGE=registry.example.com/base/static-runtime:2026-05 \
  --build-arg CLOUDGRID_IMAGE_UID=10001 \
  --build-arg CLOUDGRID_IMAGE_GID=10001 \
  --tag registry.example.com/cloudgrid/cloudgrid-storage-read:v1.0.0-beta \
  .
```

Custom bases are supported only when they preserve the runtime contract:

- CA certificates when outbound TLS is used;
- executable service binary or BFF bundle entrypoint;
- writable temporary directory only if the service explicitly requires one;
- no shell requirement at runtime;
- no baked credentials;
- no added public ports.

## Chart Overrides

Use image registry and repository overrides for custom registries:

```yaml
global:
  imageRegistry: registry.example.com/cloudgrid

storageRead:
  image:
    repository: cloudgrid-storage-read
    digest: sha256:<mirrored-digest>
```

If your registry requires authentication, set pull secrets:

```yaml
global:
  imagePullSecrets:
    - name: cloudgrid-registry
```

## Validation

Run the static release validation after Dockerfile or chart image-shape changes:

```sh
bun run release:validate
```

For a complete release gate, run:

```sh
bun run verify
```

## Next Step

For mirrored images and air-gapped installs, use [Private registry and air-gapped installs](/handbook/configuration/deployed/private-registry).
