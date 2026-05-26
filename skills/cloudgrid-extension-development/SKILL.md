---
name: cloudgrid-extension-development
description: Extends and develops CloudGrid features, services, contracts, adapters, and tests. Use when adding or changing GraphQL fields, AsyncAPI subjects, Go message structs, BFF bridge clients, storage-read/write behavior, OTLP mapping, control-plane workflows, public API clients, integration scenarios, or CloudGrid adapters.
---

# CloudGrid Extension Development

Use this skill for code changes that extend CloudGrid. Keep changes aligned with
checked-in product docs, generated contracts, service ownership, and existing
tests. If behavior is not defined, report the product gap before implementing it.

## Source Order

Always start with `.agent/IMPLEMENTATION.md`, then read only the files needed
for the touched boundary:

| Work | Source files |
| --- | --- |
| Frontend UX | `DESIGN.md`, route implementation, component tests, and related handbook pages. |
| BFF/GraphQL | `apps/backend`, generated UI contracts, public API client operations, and contract checks. |
| Control plane | `core/control-plane`, BFF bridge clients, and related frontend settings routes. |
| OTLP collector | `core/otlp-collector`, `core/go-contracts`, and ingestion tests. |
| Storage-read/write | `core/storage-read`, `core/storage-write`, adapters, and Go tests. |
| AI eval | `core/ai-eval-runner`, AI Eval frontend/BFF code, generated contracts, and handbook guide. |
| Release/distribution | `.github/workflows/`, `deploy/`, `charts/`, and release validation scripts. |

## Boundary Rules

- Frontend talks only to the TypeScript BFF.
- BFF talks to private services only through message bridge contracts.
- Collector publishes ingest commands and never writes SurrealDB directly.
- Storage-write is the telemetry mutator.
- Storage-read is the telemetry reader and live fanout owner.
- Control-plane owns companies, users, memberships, projects, dashboards,
  ingest credentials, invitations, retention, alert records, and AI-eval project
  settings.
- SurrealDB credentials never appear in frontend, BFF responses, logs, docs, or
  generated assets.

## Change Workflow

1. Identify the ownership boundary: BFF, frontend, collector, control-plane,
   storage-read, storage-write, contracts, release, or docs.
2. Read the current implementation and public docs for that boundary.
3. If a new field, enum, route, subject, error, table, retry rule, or UI state is
   needed, update the machine-readable contracts and affected docs first.
4. Implement the smallest coherent slice in the owning module.
5. Add focused tests at the same boundary.
6. Update public docs when setup, configuration, behavior, or operation changes.
7. Run the mandatory checks for the touched surface.

## Contract Change Rule

Run `bun run contracts:check` for any change touching:

- GraphQL SDL or operations;
- AsyncAPI subjects, schemas, or operations;
- generated TypeScript UI contracts;
- generated Go contracts;
- BFF bridge clients/adapters;
- storage-read or storage-write message handling;
- public API client operation documents or integration scenario metadata.

A contract change is not complete until contracts, generated outputs,
implementation, tests, and docs agree.

## Adapter Extension Guidance

Keep adapters behind local ports:

- Storage adapters live under `core/storage-read/internal/adapters/<database>`
  and `core/storage-write/internal/adapters/<database>`.
- Bridge adapters live under each service's adapter boundary and must not leak
  NATS-native types into business logic.
- Auth providers stay BFF-internal and must not expose provider tokens to the
  browser or private services.
- Harness adapters use the HTTP contract and must not put model-provider
  credentials into CloudGrid.

Do not add compatibility layers for pre-legacy names. Prefer clean breaking
changes while product behavior is still pre-legacy.

## Verification Matrix

| Change | Minimum check |
| --- | --- |
| Docs or skills only | `bun run format:check` and `git diff --check`. |
| TypeScript code | `bun run typecheck`, `bun run lint`, focused `bun test`. |
| Frontend route/UX | focused frontend tests and `bun run smoke:frontend` when behavior is visual. |
| Contracts or bridge | `bun run contracts:check` plus focused tests. |
| Go services | `bun run go:test` or focused `go test -tags surrealdb ./core/<service>/...`. |
| Release artifacts | `bun run release:validate`. |
| End-to-end behavior | `bun run integration:local` when a public flow must be proven. |

Before finalizing, state which checks ran and any known residual production
gaps.
