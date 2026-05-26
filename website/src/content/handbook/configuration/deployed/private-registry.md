---
title: "Private Registry And Air-Gapped Installs"
description: "Mirror CloudGrid images, chart artifacts, SBOMs, checksums, and release metadata into private or air-gapped environments."
sidebar: "Private registry"
order: 19
accent: rose
eyebrow: "Handbook - Configuration"
updated: 2026-05-19
---

Private registry and air-gapped installs use the same release artifacts as the public distribution. Mirror artifacts from a verified release, then install the chart from the private registry with digest-pinned values.

## Artifacts To Mirror

Mirror these artifacts as one release set:

| Artifact | Source |
| --- | --- |
| Service images | `ghcr.io/cloudgrid-dev/<image>@sha256:<digest>` from `release-manifest.json`. |
| Helm chart | `oci://ghcr.io/cloudgrid-dev/charts/cloudgrid` and `cloudgrid-<version>.tgz`. |
| Release values | `release-values.yaml`. |
| Release manifest | `release-manifest.json`. |
| Checksums and signatures | `checksums.txt`, `checksums.txt.sig`, and binary checksum signatures. |
| Image SBOMs | `<image>.spdx.json`. |
| Image scan reports | `<image>.grype.sarif`. |
| Chart SBOM | `cloudgrid-chart.spdx.json`. |
| Local Compose bundle | `cloudgrid.compose.yaml`, `cloudgrid.env.example`, `cloudgrid-local.sh` when local evaluation is needed. |
| Binary archives | `<service>_<version>_<os>_<arch>.zip` when direct binary inspection is needed. |

Keep the artifact set together. Do not mix image digests, chart packages, and release manifests from different versions.

## Mirror Service Images

Use digest references from `release-manifest.json` and copy each image to an immutable tag in your registry:

```sh
skopeo copy \
  docker://ghcr.io/cloudgrid-dev/cloudgrid-bff@sha256:<digest> \
  docker://registry.example.com/cloudgrid/cloudgrid-bff:v1.0.0-beta
```

Repeat for every service image listed in the manifest:

- `cloudgrid-bff`
- `cloudgrid-otlp-collector`
- `cloudgrid-storage-read`
- `cloudgrid-storage-write`
- `cloudgrid-control-plane`
- `cloudgrid-ai-eval-runner`
- `cloudgrid-alert-evaluator`
- `cloudgrid-storage-maintenance`

After copying, inspect the mirrored image and record the mirror digest in your internal deployment record:

```sh
skopeo inspect docker://registry.example.com/cloudgrid/cloudgrid-bff:v1.0.0-beta \
  | jq -r '.Digest'
```

Production Helm values should use the mirrored digest.

## Mirror The Helm Chart

```sh
helm pull oci://ghcr.io/cloudgrid-dev/charts/cloudgrid \
  --version <chart-version>

helm push cloudgrid-<chart-version>.tgz \
  oci://registry.example.com/cloudgrid/charts
```

Mirror `release-values.yaml` and update only the registry location and mirrored digests:

```yaml
global:
  imageRegistry: registry.example.com/cloudgrid

bff:
  image:
    repository: cloudgrid-bff
    digest: sha256:<mirrored-digest>
```

Do not replace digest pins with `latest`.

## Registry Pull Secret

```sh
kubectl -n cloudgrid create secret docker-registry cloudgrid-registry \
  --docker-server=registry.example.com \
  --docker-username='<username>' \
  --docker-password='<password>'
```

Use it in values:

```yaml
global:
  imagePullSecrets:
    - name: cloudgrid-registry
```

## Air-Gapped Verification

Before importing artifacts into the isolated environment, verify them on a connected host:

```sh
sha256sum --check checksums.txt
cosign verify ghcr.io/cloudgrid-dev/cloudgrid-bff@sha256:<digest>
cosign verify-blob --signature checksums.txt.sig checksums.txt
```

After import, verify the mirrored digests and retain the original `release-manifest.json`, SBOMs, scan reports, and checksums in your internal release record.

## Air-Gapped Install

```sh
helm upgrade --install cloudgrid oci://registry.example.com/cloudgrid/charts/cloudgrid \
  --namespace cloudgrid \
  --version <chart-version> \
  -f release-values.mirrored.yaml \
  -f charts/cloudgrid/profiles/enterprise.yaml \
  -f cloudgrid-prod.yaml \
  --wait
```

The cluster still needs private NATS and SurrealDB endpoints. In fully isolated environments, those services must also come from internally approved images or managed internal services.

## Next Step

Use [Release artifact verification](/handbook/operations/release-verification) before mirroring, then [Enterprise Helm install](/handbook/configuration/deployed/helm-install) for the deployment flow.
