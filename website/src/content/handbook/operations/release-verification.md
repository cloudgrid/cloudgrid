---
title: "Release Artifact Verification"
description: "Verify CloudGrid release manifests, signatures, checksums, SBOMs, scan reports, image digests, and binary archives before deployment."
sidebar: "Release verification"
order: 8
accent: rose
eyebrow: "Handbook - Operations"
updated: 2026-05-19
---

Verify release artifacts before running local Compose or installing the Helm chart. A CloudGrid release is one coherent artifact set produced by the release workflow; do not mix files from different versions.

## Release Artifact Set

The release workflow publishes these artifacts:

| Artifact | Purpose |
| --- | --- |
| `release-manifest.json` | Version, commit SHA, image names, immutable tags, image digests, SBOM names, scan report names, chart path, compose path, and binary checksum path. |
| `cloudgrid-<version>.tgz` | Helm chart package. |
| `release-values.yaml` | Digest-pinned image values generated from the release manifest. |
| `checksums.txt` and `checksums.txt.sig` | Signed checksums for chart, manifest, Compose files, and binary archives. |
| `cloudgrid-chart.spdx.json` | Helm chart SBOM. |
| `cloudgrid.compose.yaml` | Local release Compose stack. |
| `cloudgrid.env.example` | Local release Compose environment example. |
| `cloudgrid-local.sh` | Local release wrapper. |
| `<image>.spdx.json` | Image SBOM for each service image. |
| `<image>.grype.sarif` | Image vulnerability scan report for each service image. |
| `<service>_<version>_<os>_<arch>.zip` | Convenience binary archive for each Go service target, such as `cloudgrid-storage-read_v1.0.0-beta_linux_amd64.zip`. |

Images are published to `ghcr.io/cloudgrid-dev/<image>` with immutable release tags such as `v1.0.0-beta` and commit tags such as `sha-<shortsha>`. Production deployment should use image digests, not mutable tags.

## 1. Verify Checksums

Download the release assets for one version into a clean directory, then run:

```sh
sha256sum --check checksums.txt
```

The checksum file covers release archives and generated release files. If a checksum fails, stop and replace the local artifact set.

## 2. Verify Signed Checksum Files

CloudGrid signs checksum blobs with `cosign sign-blob` in the release workflow:

```sh
cosign verify-blob \
  --signature checksums.txt.sig \
  checksums.txt
```

Use the binary checksum signature in the same way when verifying binary archive checksums.

## 3. Inspect The Release Manifest

Use the manifest as the deployment source of truth:

```sh
jq '.version, .commit, .images[] | {image, versionTag, commitTag, digest, sbom, scan}' release-manifest.json
```

Confirm:

- the version matches the intended release;
- the commit matches the approved release commit;
- every service image has a digest;
- every image lists an SBOM and vulnerability scan report;
- `release-values.yaml` was generated from the same manifest.

## 4. Verify Image Signatures And Provenance

Verify each service image by digest:

```sh
cosign verify ghcr.io/cloudgrid-dev/cloudgrid-bff@sha256:<digest>
```

Repeat for:

- `cloudgrid-bff`
- `cloudgrid-otlp-collector`
- `cloudgrid-storage-read`
- `cloudgrid-storage-write`
- `cloudgrid-control-plane`
- `cloudgrid-ai-eval-runner`
- `cloudgrid-alert-evaluator`
- `cloudgrid-storage-maintenance`

The workflow also publishes provenance attestations for image digests. Keep the signature and attestation verification output with your deployment record.

## 5. Review SBOMs And Scan Reports

Review these files before promotion:

```text
cloudgrid-bff.spdx.json
cloudgrid-bff.grype.sarif
cloudgrid-chart.spdx.json
```

Repeat for every service image. The release workflow fails on critical runtime-layer vulnerabilities unless a time-bounded exception is recorded in the release manifest with package, CVE, affected image, justification, owner, and expiry.

## 6. Verify Helm Chart Values

Open `release-values.yaml` and confirm that each service uses an image digest:

```yaml
bff:
  image:
    repository: cloudgrid-bff
    digest: sha256:<digest>
```

Do not deploy production values that use `latest`. Human-readable release tags are acceptable in notes and local examples, but production rollout values should pin digests.

## 7. Verify Local Compose Files

For local evaluation releases:

```sh
sha256sum --check checksums.txt
./cloudgrid-local.sh pull
```

Local Compose is not a production deployment path. It runs with local auth and local defaults and must not be exposed to untrusted networks.

## Promotion Record

For every promoted environment, record:

- CloudGrid version and commit SHA;
- Helm chart version;
- `release-manifest.json`;
- `release-values.yaml` or mirrored equivalent;
- image digests actually deployed;
- SBOM and scan report review outcome;
- production benchmark JSON result used for readiness.

## Next Step

After verification, use [Enterprise Helm install](/handbook/configuration/deployed/helm-install) or [Private registry and air-gapped installs](/handbook/configuration/deployed/private-registry).
