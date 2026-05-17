---
id: STK-001
title: Technology stack
layer: foundation
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: from-user
---

# Technology Stack

## Runtime

- Public backend language: TypeScript on Bun, with Node-compatible tooling requiring Node 24.15 or newer.
- Public backend framework: Hono for HTTP hosting and GraphQL Yoga for GraphQL.
- Frontend language: TypeScript.
- Private service language: Go 1.22 or newer.
- TypeScript runtime, package manager, scripts, and test runner: Bun 1.3.13 or newer.
- TypeScript lint and format: Biome 2.4.14.
- Go module workspace: `go.work`.
- Public API style: GraphQL over HTTP for telemetry reads, GraphQL subscriptions over WebSocket for realtime telemetry reads, and REST over HTTP for health.

## Storage

- Primary DB: SurrealDB.
- Cache: none for MVP.
- Object store: none for MVP.
- Search engine: none for MVP; query filtering is implemented through SurrealDB.

## Messaging

- Message bridge: NATS with JetStream enabled.
- Read pattern: NATS request/reply with explicit timeout and typed query subjects.
- Realtime read pattern: GraphQL subscription through the BFF, storage-read live session request/reply, and storage-read-owned ephemeral NATS event subjects.
- Write pattern: durable JetStream commands consumed by the Go storage-write service.
- Post-persist notification pattern: storage-write publishes trace ID notifications after successful persistence; storage-read consumes them for live trace fanout.
- Public BFF and OTLP collector must not access SurrealDB directly.

## Auth

- Local mode: `CLOUDGRID_DEPLOYMENT_MODE=local` and `CLOUDGRID_AUTH_MODE=local`; no login is required, one local company exists, and multiple projects are supported.
- Deployed mode: `CLOUDGRID_DEPLOYMENT_MODE=deployed` and `CLOUDGRID_AUTH_MODE=sso`; login is required, multiple companies are supported, and SSO providers are GitHub, Google, and Azure Entra ID.
- Token format: JWT bearer token with standard `iss`, `aud`, `sub`, `exp`, and `scope` claims plus CloudGrid-required `tenant_id` and `project_id` or `project_ids` claims.
- Future auth boundary: ingestion authorization at OTLP public ingress; read authorization at TypeScript BFF and storage-read. Storage-read participates in read authorization because it owns telemetry query and live subscription semantics.
- Scope model: `telemetry:read`, `telemetry:live`, `telemetry:ingest:traces`, and `telemetry:ingest:logs`.
- Browser auth: BFF-managed OIDC authorization-code + PKCE with HttpOnly session cookie. The frontend does not store OAuth tokens.
- Organization/project/user management: centralized in `core/control-plane`; BFF exposes it through GraphQL and private NATS request/reply.

## Observability

- Metrics: structured service counters exposed through logs.
- Tracing: services preserve incoming OpenTelemetry trace context when available and include NATS correlation IDs.
- Logs: structured JSON logs to stdout.
- Error tracking: none for MVP.

## Delivery

- CI: GitHub Actions.
- Container runtime: Docker-compatible.
- Primary runtime distribution: signed OCI images.
- Local distribution: Docker Compose with published service images plus NATS and SurrealDB.
- Enterprise distribution: OCI-published Helm chart with configurable images, digests, security contexts, external dependencies, and scaling profiles.
- IAC: none for MVP beyond Docker Compose and Helm chart artifacts.
- Secret manager: environment variables or local config file for MVP.
- Feature flags: none.
- Optional AI evaluation feature flag: `CLOUDGRID_AI_EVAL_ENABLED`.
- Optional AI evaluation runner config: `CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST`,
  `CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT`, and
  `CLOUDGRID_AI_EVAL_HARNESS_URL`.
- AI evaluation harness adapter package: `apps/packages/cloudgrid-harness-adapter`, package name `@cloudgrid/harness-adapter`, Bun ESM only.

## Frontend

- Framework: React.
- Build: Vite.
- Styling: Tailwind CSS with shadcn/ui components.
- State and data fetching: TanStack Query.
- Tables: TanStack Table.
- Testing: Bun test for TypeScript units and Playwright for browser smoke tests.

## Standards

- Time: store and transmit ISO 8601 UTC strings.
- IDs: preserve OpenTelemetry trace IDs and span IDs; generate UUID v7 for internal log event IDs when OTLP does not provide a stable ID.
- Pagination: cursor-based.
- OpenAPI: 3.1 for OTLP ingest and health HTTP contracts.
- GraphQL SDL: public telemetry read and subscription contract.
- AsyncAPI: private NATS message bridge contract. Target state is generated from `apps/packages/definition`; until generation exists, it is hand-maintained and checked by `bun run contracts:check`.
- JSON Schema: draft 2020-12.
