---
id: NFR-012
title: Release, CI/CD, and distribution
category: delivery
status: draft
provenance: user-requested
target: CloudGrid releases are reproducible, signed, easy to run locally, and customizable for enterprise Kubernetes without weakening service boundaries.
measurement: GitHub Actions quality gates, release workflow artifacts, image vulnerability reports, SBOM/provenance attestations, Helm validation, and documented install paths.
applies_to: [STK-001, CNV-001, TEC-BE-001, NFR-008]
enforcement: blocking-for-public-release
---

# Release, CI/CD, And Distribution

This spec defines the delivery target for CloudGrid. It extends the current
GitHub Actions verification workflow and the local Docker Compose runtime into
a public release model for local users and enterprise Kubernetes operators.

## Current State

The repository already has:

- `.github/workflows/verify.yml`, which runs on pull requests and pushes to
  `main`;
- `.github/workflows/deploy-website.yml`, which deploys the public website to
  GitHub Pages;
- root quality scripts for format, typecheck, lint, tests, contracts, build, Go
  workspace tests, frontend smoke, and backend coverage;
- `compose.yaml` for local NATS and SurrealDB infrastructure only.

The repository now has release workflow, Dockerfile, Helm chart, SBOM,
provenance, signing, and Kubernetes manifest validation definitions. A public
or enterprise distribution is complete only after a tagged release runs the
workflow successfully and publishes the referenced artifacts.

## Delivery Goals

CloudGrid has three supported distribution paths:

1. Local evaluation: one command starts CloudGrid plus private infrastructure
   from OCI images through Docker Compose.
2. Enterprise Kubernetes: operators install a versioned Helm chart that deploys
   CloudGrid services, NATS, and SurrealDB either as bundled dependencies for
   evaluation or as external managed dependencies for production.
3. Developer integrations and inspection tooling: versioned source archives,
   package artifacts, and signed binary archives are available for SDK-like
   packages, examples, optional harness adapter use, and direct service
   inspection.

The primary runtime distribution format is OCI. Git packages are allowed for
developer libraries and examples, not for production service runtime delivery.
Binary archives are convenience artifacts, not the primary production service
delivery path.

## CI Quality Gates

Pull requests and pushes to `main` must run a required `verify` workflow with:

- `bun install --frozen-lockfile`;
- `bun run format:check`;
- `bun run typecheck`;
- `bun run lint`;
- `bun run test`;
- `bun run contracts:check`;
- `bun run build`;
- `bun run go:test`;
- `bun run coverage:backend`;
- `bun run smoke:frontend`;
- `git diff --check`.

Any change to GraphQL, AsyncAPI, UI contracts, generated Go contracts, BFF
bridge code, or storage-read/storage-write message handling must keep
`bun run contracts:check` blocking. CI must fail when generated contracts are
stale.

Optional CI jobs may run only when explicitly enabled by environment or workflow
dispatch:

- Docker-backed local integration;
- SurrealDB query plan tests;
- benchmark profiles;
- real SSO provider integration.

Default PR CI must remain hermetic and must not require external credentials,
cloud services, or a running Docker daemon beyond the workflow runner's normal
tooling.

## Security And Supply Chain Gates

Before release artifacts are published, CI/CD must produce and retain:

- multi-architecture OCI images for `linux/amd64` and `linux/arm64`;
- SBOMs for every service image and Helm chart artifact;
- vulnerability scan reports for every service image;
- signed images and signed provenance attestations;
- checksum files for source archives and binary assets;
- a release manifest listing image names, tags, digests, chart version,
  application version, commit SHA, binary archive checksums, SBOM locations,
  and signatures.

Release publication must fail on critical vulnerabilities in runtime layers
unless a time-bounded exception is recorded in the release manifest with the
package name, CVE, affected image, justification, owner, and expiry date.

The release pipeline must use OIDC-based registry authentication where
available. Long-lived registry credentials must not be required for the default
release workflow.

## OCI Images

Publish one image per deployable service:

| Image | Source | Runtime role |
| --- | --- | --- |
| `cloudgrid-bff` | `apps/backend` plus built frontend assets | Public GraphQL, auth, health, and static frontend serving. |
| `cloudgrid-otlp-collector` | `core/otlp-collector` | Public OTLP HTTP/gRPC ingestion. |
| `cloudgrid-storage-read` | `core/storage-read` | Private telemetry query and live fanout service. |
| `cloudgrid-storage-write` | `core/storage-write` | Private JetStream persistence worker. |
| `cloudgrid-control-plane` | `core/control-plane` | Private company, user, project, dashboard, alert, and retention control service. |
| `cloudgrid-ai-eval-runner` | `core/ai-eval-runner` | Optional private AI evaluation runner. |
| `cloudgrid-alert-evaluator` | `core/alert-evaluator` | Optional private alert rule evaluator. |
| `cloudgrid-storage-maintenance` | `core/storage-maintenance` | Private retention maintenance worker. |

The BFF image is the only image that may contain frontend assets. No image may
contain `.env`, local credentials, test secrets, private keys, dependency cache
directories, or generated artifacts that expose SurrealDB credentials.

Image tags:

- immutable release tag: `vX.Y.Z`;
- immutable commit tag: `sha-<shortsha>`;
- optional pre-release tag: `vX.Y.Z-rc.N`;
- optional beta pre-release tag: `vX.Y.Z-beta` or `vX.Y.Z-beta.N`;
- mutable convenience tag: `latest` only for stable releases.

Helm charts and examples must pin image digests by default in generated release
values. Human-authored examples may show semantic tags for readability but must
explain that production should pin digests.

## Hardened Runtime Image Policy

Runtime images must be small, non-root, and free of build toolchains.

Default base policy:

- Go services build static binaries in a builder stage and run from a minimal
  distroless, scratch-compatible, or Wolfi/Chainguard-style runtime image.
- TypeScript BFF builds in a Bun builder stage and runs from the smallest
  supported Bun runtime image that can execute the production bundle.
- Images run as a numeric non-root UID/GID.
- Root filesystem is read-only in Kubernetes by default.
- Linux capabilities are dropped by default.
- Privilege escalation is disabled.
- Service containers expose only their owned ports.
- Health probes use `/livez` and `/readyz` where available.

Operators must be able to customize base images without forking CloudGrid. The
official build must support documented build arguments:

| Build arg | Applies to | Meaning |
| --- | --- | --- |
| `CLOUDGRID_GO_BUILDER_IMAGE` | Go services | Builder image containing the supported Go toolchain. |
| `CLOUDGRID_GO_RUNTIME_IMAGE` | Go services | Minimal runtime base for compiled Go binaries. |
| `CLOUDGRID_BUN_BUILDER_IMAGE` | BFF | Builder image containing Bun and Node-compatible tooling. |
| `CLOUDGRID_BUN_RUNTIME_IMAGE` | BFF | Minimal runtime base for the production BFF bundle. |
| `CLOUDGRID_IMAGE_UID` | all services | Numeric runtime user ID. |
| `CLOUDGRID_IMAGE_GID` | all services | Numeric runtime group ID. |

Custom base images are supported only when they preserve required runtime
contracts: CA certificates where outbound TLS is used, timezone data only if
needed by a runtime, executable permission for service binaries, writable temp
directory if the service explicitly requires one, and no shell requirement at
runtime.

Alpine is acceptable as a builder base when it does not leak into the runtime
image. It is not the preferred default runtime base for Go services because
static Go binaries can run from smaller shell-free images with fewer runtime
packages.

## Binary Archives

Each release publishes signed checksumed binary archives for the Go services:

- `cloudgrid-otlp-collector`;
- `cloudgrid-storage-read`;
- `cloudgrid-storage-write`;
- `cloudgrid-control-plane`;
- `cloudgrid-ai-eval-runner`;
- `cloudgrid-alert-evaluator`;
- `cloudgrid-storage-maintenance`.

Archives use the name shape
`<service>_<version>_<os>_<arch>.zip` and include the service executable plus a
small README that states the commit, version, and runtime environment
expectations. Supported binary targets are:

- `linux/amd64`;
- `linux/arm64`;
- `darwin/amd64`;
- `darwin/arm64`;
- `windows/amd64`.

The BFF is not distributed as a standalone binary because it depends on the Bun
runtime and built frontend assets; its supported runtime artifact is the
`cloudgrid-bff` OCI image.

## Local Distribution

Local users should be able to run:

```sh
docker compose --env-file .env up -d
```

The local compose distribution must include:

- BFF with built frontend assets;
- OTLP collector;
- storage-read;
- storage-write;
- control-plane;
- optional AI eval runner only when explicitly enabled;
- optional alert evaluator and storage-maintenance service shells only when
  explicitly enabled;
- NATS with JetStream;
- SurrealDB with persistent local volume.

Local defaults may use published images by tag for readability, but release
documentation must include a digest-pinned example. Local mode uses
`CLOUDGRID_DEPLOYMENT_MODE=local` and `CLOUDGRID_AUTH_MODE=local` and must warn
that it is not safe for untrusted networks.

The release workflow must publish:

- `cloudgrid.compose.yaml`;
- `cloudgrid.env.example`;
- `cloudgrid-local.sh`;
- checksums that cover both files.

The release Compose file must use published CloudGrid images, keep NATS and
SurrealDB on localhost-bound ports for inspection, and keep storage-read,
storage-write, control-plane, alert evaluator, and storage-maintenance private
to the Compose network.

The bundled SurrealDB image baseline for local and release Compose is
`surrealdb/surrealdb:v3.1.0`. Dependency upgrades must update the root
`.env.example`, release Compose env example, Helm bundled dependency values,
integration runner defaults, README, website operator docs, and SurrealDB
persistence spec in one change.

The release Compose bundle must provide one primary local entry point:

```sh
./cloudgrid-local.sh up
```

Raw `docker compose` commands may remain documented as the transparent fallback,
but the storyline should lead with the wrapper so release users do not need to
assemble flags by hand.

## Enterprise Kubernetes Distribution

Enterprise deployments use a versioned Helm chart published as an OCI artifact.
The chart must expose stable values for:

- image repository, tag, digest, and pull policy per service;
- global image registry override;
- image pull secrets;
- per-service replica count;
- per-service resource requests and limits;
- node selectors, tolerations, affinities, topology spread constraints, and
  priority classes;
- pod and container security contexts;
- service annotations and labels;
- ingress or gateway configuration for the BFF and collector;
- TLS termination mode;
- external NATS connection;
- external SurrealDB connection;
- bundled dependency enablement for evaluation only;
- existing Kubernetes Secret references for credentials;
- config values through ConfigMaps and secret values through Secrets;
- persistent volume settings for bundled NATS and SurrealDB;
- autoscaling configuration for stateless services and storage workers.

Production chart defaults:

- BFF, collector, storage-read, control-plane, and optional AI eval runner are
  horizontally scalable through replicas or HPA.
- storage-write uses production-scale pull consumer mode when replicas exceed
  one.
- NATS and SurrealDB are private cluster services or external managed
  endpoints, never exposed publicly by the chart.
- Bundled evaluation dependencies default to `surrealdb/surrealdb:v3.1.0` and
  remain evaluation-only unless an environment-specific production dependency
  plan explicitly accepts bundled storage.
- OTLP collector and BFF are the only public ingress candidates.
- SurrealDB credentials are mounted only into storage-read, storage-write,
  control-plane, and storage-maintenance pods.
- BFF, frontend assets, collector, and clients never receive SurrealDB
  credentials.

The chart must not introduce alternate queues, public NATS, public SurrealDB, or
REST telemetry read endpoints.

## Scaling Profiles

The chart must ship named values profiles:

| Profile | Purpose | Defaults |
| --- | --- | --- |
| `local` | Single-node evaluation | One replica per service, bundled NATS and SurrealDB, local auth. |
| `small` | Team deployment | Two BFF replicas, two collectors, one storage-read, one storage-write, external or bundled private dependencies. |
| `enterprise` | Production baseline | HPA-ready BFF/collector/storage-read, storage-write pull mode, external NATS and SurrealDB recommended, SSO required. |

Profiles are examples, not separate charts. Operators customize the same chart
through values overlays.

## Package And Registry Strategy

Publish artifacts to registry locations chosen by release configuration:

- OCI service images: GitHub Container Registry by default,
  `ghcr.io/cloudgrid-dev/<image>`.
- Helm chart OCI artifact: `oci://ghcr.io/cloudgrid-dev/charts/cloudgrid`.
- Service binary archives: GitHub Releases.
- Developer packages: GitHub Packages or npm-compatible registry only for
  packages intended to be consumed as libraries, such as
  `@cloudgrid/harness-adapter`.
- Source archive and release manifest: GitHub Releases.

Git packages may be offered for early private enterprise evaluation, but they
must wrap the same OCI images and Helm chart artifacts. They must not become a
separate production delivery mechanism.

## Release Workflow

Create a `release` workflow triggered by manual dispatch. The workflow creates
the release tag itself after validation, then publishes all release artifacts
from the tagged commit. This avoids accidental releases from ad hoc tag pushes
and keeps version promotion explicit.

Required stages:

1. Validate that the requested version is a supported `vX.Y.Z`,
   `vX.Y.Z-beta`, `vX.Y.Z-beta.N`, or `vX.Y.Z-rc.N` tag.
2. Verify package and chart versions match the requested tag without the
   leading `v`.
3. Run the full `verify` gate.
4. Create the release tag on the selected commit only if it does not already
   exist.
5. Build service images for `linux/amd64` and `linux/arm64`.
6. Generate SBOMs and vulnerability reports.
7. Sign image digests and provenance attestations.
8. Package and lint the Helm chart.
9. Render Helm templates for `local`, `small`, and `enterprise` profiles and
   validate Kubernetes manifests.
10. Build service binary archives for supported targets and generate signed
   checksums.
11. Publish images, chart, source archive, binary archives, checksums, release
   manifest, SBOMs, and signatures.
12. Create or update the GitHub release notes with install commands and artifact
   digests.

The workflow must not publish mutable release artifacts until all gates pass.

## Documentation Requirements

Before public release, docs must include:

- local Docker Compose quickstart;
- enterprise Helm install guide;
- external NATS and SurrealDB configuration guide;
- image customization and custom base image guide;
- air-gapped or private-registry mirroring guide;
- upgrade and rollback guide;
- release artifact verification guide using signatures, checksums, and SBOMs;
- sizing guide aligned with `06-nfr/performance-and-scaling.md`.

Docs must keep local evaluation simple while making production hardening
explicit. Production examples must not use default SurrealDB credentials,
plaintext public endpoints, local auth, or mutable image tags as the recommended
path.

## Non-Goals

- No SaaS deployment workflow is defined here.
- No cloud-specific Terraform, Pulumi, Crossplane, or operator is required for
  the first public release.
- No direct frontend, BFF, or collector access to SurrealDB is allowed.
- No Kubernetes log file reader is added to CloudGrid services.
- No compatibility layer is required for legacy deployment layouts before the
  first public release.
