---
title: "Upgrade And Rollback"
description: "Upgrade or roll back CloudGrid Helm deployments using verified release artifacts and digest-pinned values."
sidebar: "Upgrade and rollback"
order: 9
accent: amber
eyebrow: "Handbook - Operations"
updated: 2026-05-19
---

CloudGrid production upgrades use the same Helm chart and OCI images as fresh installs. Treat every upgrade as a release promotion: verify artifacts, render manifests, deploy with digest-pinned values, then record benchmark evidence.

## Upgrade Inputs

Prepare:

- target release `release-manifest.json`;
- target `release-values.yaml`;
- target `cloudgrid-<version>.tgz` or chart OCI version;
- target SBOMs, scan reports, checksums, and signatures;
- environment overlay values;
- current deployed values and Helm revision;
- backup or recovery point for SurrealDB and NATS according to your infrastructure policy.

Do not upgrade production from `latest` or from an unverified chart/image combination.

## Preflight

```sh
helm -n cloudgrid history cloudgrid
helm -n cloudgrid get values cloudgrid --all > cloudgrid-current-values.yaml
kubectl -n cloudgrid get pods
```

Verify the target release:

```sh
sha256sum --check checksums.txt
cosign verify ghcr.io/cloudgrid-dev/cloudgrid-bff@sha256:<target-digest>
```

Render the target manifests:

```sh
helm template cloudgrid oci://ghcr.io/cloudgrid-dev/charts/cloudgrid \
  --version <target-chart-version> \
  -f release-values.yaml \
  -f charts/cloudgrid/profiles/enterprise.yaml \
  -f cloudgrid-prod.yaml
```

Confirm that BFF and collector are the only public ingress candidates, and that NATS and SurrealDB remain private.

If the upgrade changes the SurrealDB image or external database version, confirm
that the target version is approved by the storage spec and that live SurrealDB
adapter checks pass against that exact version before promotion. For the
`v3.1.0` baseline, 3.0.x RocksDB volumes may upgrade in place, but rollback
after writes requires the environment's storage recovery plan rather than only a
Helm image rollback.

## Upgrade

```sh
helm upgrade cloudgrid oci://ghcr.io/cloudgrid-dev/charts/cloudgrid \
  --namespace cloudgrid \
  --version <target-chart-version> \
  -f release-values.yaml \
  -f charts/cloudgrid/profiles/enterprise.yaml \
  -f cloudgrid-prod.yaml \
  --wait \
  --timeout 10m
```

Watch rollout:

```sh
kubectl -n cloudgrid rollout status deployment/cloudgrid-bff
kubectl -n cloudgrid rollout status deployment/cloudgrid-otlp-collector
kubectl -n cloudgrid rollout status deployment/cloudgrid-storage-read
kubectl -n cloudgrid rollout status deployment/cloudgrid-storage-write
```

## Post-Upgrade Checks

- BFF health and readiness are passing.
- Collector health and readiness are passing.
- Storage-read, storage-write, and control-plane are ready.
- Browser SSO login works.
- OTLP emitters can send data.
- GraphQL trace/log/metric reads work.
- No service logs expose session cookies, provider tokens, raw OTLP payloads, or SurrealDB credentials.
- External dashboards that scrape SurrealDB server metrics directly have been
  checked for SurrealDB 3.1 metric-name and public-metrics changes.

Run benchmark probes before declaring the upgraded environment production-ready:

```sh
CLOUDGRID_ENABLE_BENCHMARKS=true \
CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like \
CLOUDGRID_BENCH_REQUIRED=true \
CLOUDGRID_BENCH_ENVIRONMENT_ID=prod-eu-1 \
CLOUDGRID_BENCH_IMAGE_TAG=v1.0.0-beta \
CLOUDGRID_BENCH_GRAPHQL_URL=https://cloudgrid.example.com/graphql \
CLOUDGRID_BENCH_OTLP_TRACES_URL=https://otlp.cloudgrid.example.com/v1/traces \
bun run bench:production
```

Store the JSON result from `tmp/benchmarks/` with the release promotion record.

## Rollback

Use Helm rollback when the previous release is still compatible with the current data state:

```sh
helm -n cloudgrid history cloudgrid
helm -n cloudgrid rollback cloudgrid <revision> --wait --timeout 10m
```

Then verify rollout status and repeat the health checks.

If a release includes data migrations or storage schema changes, use the rollback instructions published with that release. Do not assume that rolling back images is sufficient after irreversible storage changes.

## Image-Only Rollback

If the chart version stays the same and only service images need to roll back, use the previous verified `release-values.yaml`:

```sh
helm upgrade cloudgrid oci://ghcr.io/cloudgrid-dev/charts/cloudgrid \
  --namespace cloudgrid \
  --version <current-chart-version> \
  -f previous-release-values.yaml \
  -f charts/cloudgrid/profiles/enterprise.yaml \
  -f cloudgrid-prod.yaml \
  --wait
```

This should still use image digests, not mutable tags.

## Rollback Record

Record:

- failed release version and digest set;
- rollback revision or replacement digest set;
- reason for rollback;
- health and benchmark results after rollback;
- any manual data recovery action.

## Next Step

Use [Release artifact verification](/handbook/operations/release-verification) before every upgrade and [Sizing and scaling](/handbook/operations/sizing) after capacity-affecting changes.
