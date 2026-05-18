---
name: cloudgrid-extension-development
description: Extends and develops CloudGrid features, services, contracts, adapters, and tests. Use when adding or changing GraphQL fields, AsyncAPI subjects, Go message structs, BFF bridge clients, storage-read/write behavior, OTLP mapping, control-plane workflows, public API clients, integration scenarios, or CloudGrid adapters.
---

# CloudGrid Extension Development

Use this skill for code changes that extend CloudGrid. CloudGrid is
spec-first: update the relevant spec before implementing behavior that is not
already defined.

## Source Order

Always start with:

1. `specs/spec.md`
2. `specs/00-conventions.md`
3. `specs/04-backend/backend-architecture.md`
4. `specs/03-contracts/graphql/public-schema.graphql`
5. `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
6. `specs/03-contracts/errors.yaml`
7. `.agent/IMPLEMENTATION.md`

Then read the domain-specific spec:

| Work | Specs |
| --- | --- |
| Frontend UX | `specs/05-frontend/product-ux-concept.md` plus route-specific UX specs. |
| BFF/GraphQL | backend architecture, contract generation, public schema, errors. |
| Control plane | `control-plane.md`, project membership, invitations, email delivery. |
| OTLP collector | ingestion, OTLP mapping, signal roadmap, metrics signal. |
| Storage-read/write | telemetry query semantics, persistence, storage domain, SurrealDB specs. |
| AI eval | AI eval runner, message contracts, query semantics, project settings. |
| Release/distribution | release-distribution and integration-test-suite specs. |

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
2. Read the source specs and current implementation for that boundary.
3. If a new field, enum, route, subject, error, table, retry rule, or UI state is
   needed, update the spec and machine-readable contracts first.
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

A contract change is not complete until specs, contracts, generated outputs,
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
changes while specs and implementation are still pre-legacy.

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
