---
name: cloudgrid-operations-maintenance
description: Operates and maintains CloudGrid runtimes. Use when the user asks to troubleshoot CloudGrid, inspect health/readiness, run or fix CI, validate releases, manage Docker or Helm distribution, check NATS or SurrealDB runtime state, review production readiness, or maintain retention/alerting operations.
---

# CloudGrid Operations And Maintenance

Use this skill for operational tasks after CloudGrid exists: starting, stopping,
checking readiness, debugging runtime failures, validating releases, and
reviewing production readiness.

## Source Order

1. `website/src/content/handbook/operations/`
2. `website/src/content/handbook/reference/commands.md`
3. `website/src/content/handbook/reference/ports.md`
4. `website/src/content/handbook/reference/environment-variables.md`
5. `.github/workflows/verify.yml` and `.github/workflows/release.yml`
6. `deploy/`, `charts/`, `.env.example`, and `compose.yaml`
7. Runtime entrypoints and health handlers in the owning service directory

If behavior is not specified, report it as an operational gap instead of
inventing a workaround.

## Operational Workflow

1. Identify the runtime: source dev, release Compose, GitHub Actions, or Helm.
2. Read the relevant config and deployment files before changing commands.
3. Check public entrypoints first: BFF health, OTLP collector health, then
   private service readiness.
4. Follow the service boundary. Do not debug by adding public NATS, public
   SurrealDB, direct frontend storage calls, or BFF telemetry aggregation.
5. Map failures to canonical errors returned by the owning service.
6. Verify with the narrowest command that proves the fix.

## Common Commands

Root quality gate:

```sh
bun run verify
```

Full local gate:

```sh
bun run verify:full
```

Release artifact validation:

```sh
bun run release:validate
```

Go workspace tests:

```sh
bun run go:test
```

Docker-backed integration:

```sh
bun run integration:local
```

Use `bun run integration:local` only when a real end-to-end check is needed; it
starts disposable infrastructure.

## Health And Readiness

- Public BFF owns `/api/health`, `/livez`, `/readyz`, GraphQL, auth routes, and
  static frontend serving.
- OTLP collector owns public OTLP HTTP/gRPC ingest and service health.
- Storage-read, storage-write, control-plane, ai-eval-runner, alert-evaluator,
  and storage-maintenance are private services.
- SurrealDB is private to storage and control-plane services.
- NATS is private message infrastructure.

Readiness failures should explain which dependency or owned schema check failed
without logging credentials or raw provider errors.

## Release And Distribution Maintenance

Release work must preserve:

- one OCI image per deployable service;
- BFF as the only image containing built frontend assets;
- non-root hardened runtime images;
- immutable release and commit tags;
- no mutable `latest` in beta examples unless release policy changes;
- signed checksums, SBOM/provenance, vulnerability reports, and release manifest
  in the workflow.

GitHub Actions should use the repository token or OIDC where available. Do not
add long-lived registry credentials unless repository secrets policy changes.

## Retention And Alerting Boundaries

Retention and alerting are project-scoped control-plane surfaces with private
workers. When they are not fully wired in a runtime, document the gap directly.

Do not invent:

- external notification adapters;
- hidden alert widgets;
- direct frontend rule execution;
- broad storage deletes outside the documented retention behavior;
- scheduler behavior not covered by checked-in code or docs.

## Troubleshooting Checklist

Before finishing:

1. Name the runtime and service boundary involved.
2. Confirm the failure path uses a known error code.
3. Confirm no secret, token, provider raw error, or SurrealDB credential is
   exposed in logs, docs, generated files, or final output.
4. Run focused checks first, then broader gates when shared code or contracts
   changed.
5. If the issue is a documented production gap, say so and link the doc/source
   area instead of claiming it is implemented.
