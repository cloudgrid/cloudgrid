# CloudGrid

CloudGrid is an AI-native OTLP observability platform for project-scoped traces, spans, logs, metrics, dashboards, ingest API keys, retention policy configuration, and alerting foundations.

Website: https://cloudgrid.dev

## Architecture

CloudGrid uses a public TypeScript backend-for-frontend and private Go services connected through NATS:

- `apps/backend`: TypeScript BFF, GraphQL, health, static frontend serving.
- `apps/frontend`: React/Vite frontend.
- `core/otlp-collector`: Go OTLP HTTP and gRPC collector for traces, logs, and metrics.
- `core/control-plane`: Go NATS service for companies, users, projects, project memberships, project status, ingest credentials, dashboards, retention policies, and alerting foundation data.
- `core/storage-read`: Go NATS request/reply service that reads from SurrealDB.
- `core/storage-write`: Go JetStream consumer that writes to SurrealDB.
- `apps/packages/*`: shared TypeScript and generated contract packages.
- `core/go-contracts`: generated/shared Go contract package.
- `core/go-runtime`: shared Go runtime helpers.
- `docs`: end-user and operator documentation.
- `skills`: skills that help AI agents use, configure, operate, and extend CloudGrid.

Public and ingress-facing services must not access SurrealDB directly. Every telemetry read and write crosses the NATS message bridge.

Local mode is configured with `CLOUDGRID_DEPLOYMENT_MODE=local` and
`CLOUDGRID_AUTH_MODE=local`. Deployed mode uses
`CLOUDGRID_DEPLOYMENT_MODE=deployed`, `CLOUDGRID_AUTH_MODE=sso`,
`CLOUDGRID_AUTH_PROVIDERS`, and provider-specific GitHub, Google, or Azure Entra
ID OAuth/OIDC settings. See [SSO configuration](./docs/configuration/deployed/sso/README.md).

## Source Of Truth

Implementation must follow the specs in [specs/spec.md](./specs/spec.md). Start with:

- [Vision](./specs/00-vision.md)
- [Engineering conventions](./specs/00-conventions.md)
- [Service architecture](./specs/04-backend/backend-architecture.md)
- [GraphQL schema](./specs/03-contracts/graphql/public-schema.graphql)
- [Message bridge contract](./specs/03-contracts/messages/message-bridge.asyncapi.yaml)

## Agent Guidance

- [AGENTS.md](./AGENTS.md) is the repository-level instruction file.
- [CLAUDE.md](./CLAUDE.md) points Claude-compatible agents to the same rules.
- [.agent/IMPLEMENTATION.md](./.agent/IMPLEMENTATION.md) contains implementation conventions.
- [DESIGN.md](./DESIGN.md) contains frontend design rules.

## Local Infrastructure

NATS and SurrealDB run through Docker Compose:

```sh
docker compose --env-file .env up -d nats surrealdb
```

The default `.env` pins:

- NATS Server `2.14.0`
- SurrealDB `3.0.5`

## TypeScript Tooling

CloudGrid uses Bun for TypeScript runtime, package management, scripts, and tests. Biome is used for linting and formatting.

- Bun: `1.3.13` or newer.
- Node compatibility floor for tools that need Node: `24.15` or newer.
- Biome: `2.4.14`.
