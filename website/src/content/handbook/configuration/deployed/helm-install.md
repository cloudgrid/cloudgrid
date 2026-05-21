---
title: "Enterprise Helm Install"
description: "Install CloudGrid in Kubernetes from the versioned Helm chart and signed service images."
sidebar: "Helm install"
order: 16
accent: cyan
eyebrow: "Handbook - Configuration"
updated: 2026-05-19
---

Enterprise deployments use the `cloudgrid` Helm chart published as an OCI chart artifact:

```text
oci://ghcr.io/cloudgrid-dev/charts/cloudgrid
```

Use Helm for Kubernetes installs. Production values should pin image digests from the release `release-values.yaml` or `release-manifest.json`; do not use `latest` or another mutable tag for production.

## Prerequisites

- Kubernetes cluster with ingress or gateway support for the BFF and OTLP collector.
- Helm 3 with OCI registry support.
- Access to `ghcr.io/cloudgrid-dev` or to a mirrored private registry.
- Existing Kubernetes Secrets for the BFF session secret, SSO provider credentials, SurrealDB credentials, and the control-plane provider-secret encryption key.
- Private NATS JetStream and SurrealDB endpoints, unless you are using the bundled dependencies for evaluation only.
- A release artifact set that includes `release-manifest.json`, `release-values.yaml`, `cloudgrid-<version>.tgz`, `checksums.txt`, and `checksums.txt.sig`.

## 1. Verify The Release First

Before installing, verify the release artifacts and image signatures:

```sh
cosign verify ghcr.io/cloudgrid-dev/cloudgrid-bff@sha256:<digest>
sha256sum --check checksums.txt
```

Follow [Release artifact verification](/handbook/operations/release-verification) for the full artifact list. The install commands below assume that `release-values.yaml` came from the same verified release.

## 2. Create Required Secrets

Create a session secret:

```sh
kubectl create namespace cloudgrid
kubectl -n cloudgrid create secret generic cloudgrid-session \
  --from-literal=CLOUDGRID_SESSION_SECRET='<random-32-plus-byte-secret>'
```

Create SurrealDB credentials for the services that own storage access:

```sh
kubectl -n cloudgrid create secret generic cloudgrid-surrealdb \
  --from-literal=CLOUDGRID_SURREALDB_USERNAME='<surrealdb-username>' \
  --from-literal=CLOUDGRID_SURREALDB_PASSWORD='<surrealdb-password>'
```

Add SSO provider secrets according to the provider page:

| Provider | Page |
| --- | --- |
| GitHub | [GitHub SSO](/handbook/configuration/deployed/sso/github) |
| Google | [Google SSO](/handbook/configuration/deployed/sso/google) |
| Azure Entra ID | [Azure Entra ID SSO](/handbook/configuration/deployed/sso/azure) |

Create the control-plane encryption key used for managed AI provider secrets:

```sh
kubectl -n cloudgrid create secret generic cloudgrid-provider-secrets \
  --from-literal=CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY='<long-random-secret>'
```

## 3. Prepare Production Values

Start with the release `release-values.yaml` so service images are pinned by digest. Add an environment-specific overlay such as `cloudgrid-prod.yaml`:

```yaml
deploymentMode: deployed
authMode: sso

global:
  imageRegistry: ghcr.io/cloudgrid-dev

session:
  existingSecret: cloudgrid-session
  secretKey: CLOUDGRID_SESSION_SECRET

nats:
  bundled:
    enabled: false
  external:
    url: nats://nats.private:4222

surrealdb:
  bundled:
    enabled: false
  external:
    url: http://surrealdb.private:8000/rpc
    existingSecret: cloudgrid-surrealdb
    usernameKey: CLOUDGRID_SURREALDB_USERNAME
    passwordKey: CLOUDGRID_SURREALDB_PASSWORD
  namespace: observability
  database: production

controlPlane:
  providerSecretEncryptionKey:
    existingSecret: cloudgrid-provider-secrets
    secretKey: CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY

bff:
  replicas: 2
  env:
    CLOUDGRID_PUBLIC_URL: https://cloudgrid.example.com
    CLOUDGRID_AUTH_PROVIDERS: github
    CLOUDGRID_AUTH_COMPANY_ID: acme
    CLOUDGRID_GRAPHQL_UI: "false"
  ingress:
    enabled: true
    className: nginx
    hosts:
      - host: cloudgrid.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: cloudgrid-bff-tls
        hosts:
          - cloudgrid.example.com

otlpCollector:
  replicas: 2
  serviceTokenAuth:
    issuer: https://tokens.example.com/
    audience: cloudgrid-ingest
    jwksUrl: https://tokens.example.com/.well-known/jwks.json
  ingress:
    enabled: true
    className: nginx
    hosts:
      - host: otlp.cloudgrid.example.com
        paths:
          - path: /
            pathType: Prefix
    tls:
      - secretName: cloudgrid-otlp-tls
        hosts:
          - otlp.cloudgrid.example.com

storageWrite:
  env:
    CLOUDGRID_STORAGE_WRITE_CONSUMER_MODE: pull
```

Keep NATS and SurrealDB private. The chart must not expose either dependency publicly.

The collector service-token settings are required in deployed SSO mode. They
validate OTLP ingest bearer tokens and are intentionally separate from browser
SSO provider settings such as `CLOUDGRID_AUTH_GOOGLE_CLIENT_ID` or
`CLOUDGRID_AUTH_AZURE_CLIENT_ID`; do not rely on browser login provider values
for collector startup.

## 4. Render And Inspect

Render the selected profile and overlays before installing:

```sh
helm template cloudgrid oci://ghcr.io/cloudgrid-dev/charts/cloudgrid \
  --version <chart-version> \
  -f release-values.yaml \
  -f charts/cloudgrid/profiles/enterprise.yaml \
  -f cloudgrid-prod.yaml
```

Check that only the BFF and OTLP collector have ingress, that SurrealDB credentials are mounted only into `storage-read`, `storage-write`, `control-plane`, and `storage-maintenance`, and that `CLOUDGRID_PROVIDER_SECRET_ENCRYPTION_KEY` is mounted only into `control-plane`.

Also check that the collector deployment renders:

```text
CLOUDGRID_AUTH_ISSUER
CLOUDGRID_AUTH_AUDIENCE
CLOUDGRID_AUTH_JWKS_URL
```

Render fails when `authMode=sso` and any of those collector service-token values
are empty.

## 5. Install Or Upgrade

```sh
helm upgrade --install cloudgrid oci://ghcr.io/cloudgrid-dev/charts/cloudgrid \
  --namespace cloudgrid \
  --version <chart-version> \
  -f release-values.yaml \
  -f charts/cloudgrid/profiles/enterprise.yaml \
  -f cloudgrid-prod.yaml \
  --wait \
  --timeout 10m
```

The `enterprise` profile is a starting point: HPA-ready BFF, collector, and storage-read replicas; storage-write pull mode; external NATS and SurrealDB recommended; SSO required. It is not a substitute for environment-specific resources, secrets, ingress, TLS, and benchmark evidence.

## 6. Verify Readiness

```sh
kubectl -n cloudgrid get pods
kubectl -n cloudgrid get ingress
kubectl -n cloudgrid rollout status deployment/cloudgrid-bff
kubectl -n cloudgrid rollout status deployment/cloudgrid-otlp-collector
```

Then run production-like benchmark probes against the deployed URLs before declaring the environment production-ready:

```sh
CLOUDGRID_ENABLE_BENCHMARKS=true \
CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like \
CLOUDGRID_BENCH_ENVIRONMENT_ID=prod-eu-1 \
CLOUDGRID_BENCH_IMAGE_TAG=v1.0.0-beta \
CLOUDGRID_BENCH_GRAPHQL_URL=https://cloudgrid.example.com/graphql \
CLOUDGRID_BENCH_OTLP_TRACES_URL=https://otlp.cloudgrid.example.com/v1/traces \
bun run bench:production
```

## Next Step

Configure [external NATS and SurrealDB](/handbook/configuration/deployed/external-dependencies), then use [Sizing and scaling](/handbook/operations/sizing) to select replicas and limits.
