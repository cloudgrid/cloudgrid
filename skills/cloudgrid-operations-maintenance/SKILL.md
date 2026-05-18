---
name: cloudgrid-operations-maintenance
description: Operates and maintains CloudGrid runtimes. Use when the user asks to troubleshoot CloudGrid, inspect health/readiness, run or fix CI, validate releases, manage Docker or Helm distribution, check NATS or SurrealDB runtime state, review production readiness, or maintain retention/alerting operations.
---

# CloudGrid Operations And Maintenance

Use this skill for operational tasks after CloudGrid exists: starting, stopping,
checking readiness, debugging runtime failures, validating releases, and
reviewing production readiness.

## Source Order

1. `specs/spec.md`
2. `specs/04-backend/backend-architecture.md`
3. `specs/04-backend/runtime-configuration.md`
4. `specs/06-nfr/release-distribution.md`
5. `specs/06-nfr/integration-test-suite.md`
6. `specs/04-backend/data-retention-policy.md` for retention
7. `specs/04-backend/alerting.md` for alerting
8. `docs/operations/`, `docs/reference/commands.md`, and `docs/reference/ports.md`
9. `.github/workflows/verify.yml`, `.github/workflows/release.yml`, `deploy/`, and `charts/`

If behavior is not specified, report it as an operational gap instead of
inventing a workaround.

## Operational Workflow

1. Identify the runtime: source dev, release Compose, GitHub Actions, or Helm.
2. Read the relevant config and deployment files before changing commands.
3. Check public entrypoints first: BFF health, OTLP collector health, then
   private service readiness.
4. Follow the service boundary. Do not debug by adding public NATS, public
   SurrealDB, direct frontend storage calls, or BFF telemetry aggregation.
5. Map failures to canonical errors from `specs/03-contracts/errors.yaml`.
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
- no mutable `latest` in beta examples unless the release spec changes;
- signed checksums, SBOM/provenance, vulnerability reports, and release manifest
  in the workflow.

GitHub Actions should use the repository token or OIDC where available. Do not
add long-lived registry credentials unless the release spec and repository
secrets policy change.

## Retention And Alerting Boundaries

Retention and alerting are project-scoped control-plane surfaces with private
workers. When they are not fully wired in a runtime, document the gap directly.

Do not invent:

- external notification adapters;
- hidden alert widgets;
- direct frontend rule execution;
- broad storage deletes outside the retention spec;
- scheduler behavior not covered by specs.

## Troubleshooting Checklist

Before finishing:

1. Name the runtime and service boundary involved.
2. Confirm the failure path uses a known error code.
3. Confirm no secret, token, provider raw error, or SurrealDB credential is
   exposed in logs, docs, generated files, or final output.
4. Run focused checks first, then broader gates when shared code or contracts
   changed.
5. If the issue is a documented production gap, say so and link the spec/doc
   area instead of claiming it is implemented.
