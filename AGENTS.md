# CloudGrid Agent Instructions

CloudGrid is the product name. The public website is https://cloudgrid.dev.

## Source Of Truth

Specs are authoritative. Start at `specs/spec.md`, then read the specific files for your work scope.

Required architecture references:

- `specs/00-vision.md`
- `specs/00-conventions.md`
- `specs/05-frontend/product-ux-concept.md` when touching frontend UX, navigation, onboarding, empty states, route layout, or design
- `specs/04-backend/backend-architecture.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/03-contracts/errors.yaml`

If implementation needs behavior not covered by specs, stop and update the relevant spec first. Do not invent fields, routes, subjects, service boundaries, retry behavior, or error codes.

## Hard Boundaries

- Frontend talks only to the TypeScript BFF.
- TypeScript BFF talks to private services only through NATS message bridge contracts. Queries use request/reply; GraphQL subscriptions use storage-read live-session subjects. The BFF must not consume telemetry ingest or persisted-notification streams directly.
- Go OTLP collector publishes ingest commands to NATS and never writes SurrealDB directly.
- Go storage-write service is the only service that mutates SurrealDB.
- Go storage-read service is the only service that fetches telemetry from SurrealDB.
- Public telemetry reads use GraphQL. Do not add REST telemetry read endpoints.
- SurrealDB credentials must not appear in frontend, BFF, collector, logs, responses, or generated assets.
- Frontend is a dumb telemetry client: render GraphQL view models and keep only presentation state locally.
- TypeScript BFF must not filter, aggregate, correlate, rank, or enrich telemetry records.
- Go storage-read owns telemetry query semantics and must push supported filters, sorting, cursor predicates, counts, grouping, and bounded facets into the database adapter.
- Live telemetry delivery must go through storage-read. Storage-read owns live filter matching, read authorization preparation, and trace event fanout.

## Repository Layout

- `apps/backend`: TypeScript BFF, GraphQL, health, static frontend serving.
- `apps/frontend`: React/Vite frontend.
- `apps/packages/definition`: shared TypeScript domain and contract definitions.
- `apps/packages/otlp`: TypeScript OTLP contract helpers for tooling only.
- `apps/packages/runtime`: TypeScript runtime helpers for the BFF.
- `apps/packages/ui-contracts`: generated GraphQL/UI TypeScript contracts.
- `core/go-contracts`: generated/shared Go contract types.
- `core/go-runtime`: shared Go runtime helpers.
- `website`: public website and the only current target for end-user/operator documentation updates.
- `skills`: skills that help AI agents use, configure, operate, and extend CloudGrid.
- `core/otlp-collector`: Go OTLP HTTP collector.
- `core/control-plane`: Go NATS request/reply service for companies, users, projects, memberships, and project status.
- `core/storage-read`: Go NATS request/reply storage reader.
- `core/storage-write`: Go JetStream storage writer.
- `specs`: source-of-truth implementation specs.
- `tooling`: repository tooling and scripts.

## Ticket Discipline

Parallel agents should work within one ownership boundary at a time:

- BFF agent: `apps/backend`, `apps/packages/runtime`, TypeScript bridge client.
- Frontend agent: `apps/frontend`, `apps/packages/ui-contracts`, `DESIGN.md`.
- Collector agent: `core/otlp-collector`, OTLP decoding and NATS publish.
- Control-plane agent: `core/control-plane`, company, user, project, membership, and project status rules.
- Storage-read agent: `core/storage-read`, SurrealDB read queries.
- Storage-write agent: `core/storage-write`, JetStream consumer and SurrealDB writes.
- Contract agent: `specs/03-contracts`, generated outputs, contract tests.

Do not modify another agent's files unless your ticket explicitly says so.

## Expected Commands

Use these when dependencies and implementations exist:

```sh
bun run typecheck
bun run lint
bun run format
bun run test
bun run contracts:check
```

For backend coverage, use:

```sh
bun test --coverage apps/backend/src
go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/...
go tool cover -func=/tmp/cloudgrid-go-backend.out | tail -1
```

Backend coverage target is >80% for the TypeScript BFF and Go backend services. If the Go aggregate is below target, report the measured percentage and the packages dragging it down instead of claiming completion.

Before claiming completion, run the narrowest relevant checks plus any broader check required by touched shared contracts.

For any GraphQL, AsyncAPI, UI contract, BFF bridge, or Go message contract change, `bun run contracts:check` is mandatory. It validates frontend GraphQL operations against the SDL, required GraphQL input fields against TypeScript UI contracts, and AsyncAPI request fields against Go structs; do not bypass it with syntax-only checks.

For any control-plane message subject change, the implementation must also keep the generated subject list, `ControlSubjects()`, the NATS handler map, BFF bridge payload shape, and focused tests aligned. `go test -tags surrealdb ./core/control-plane/...` must fail if a generated control-plane request/reply subject is not registered by the service. BFF bridge tests must assert AsyncAPI top-level request fields for subjects whose schemas do not use an `input` wrapper.

For any self-observability exporter change, OTLP JSON must follow protobuf JSON mapping. `traceId`, `spanId`, `parentSpanId`, metric exemplar IDs, and log trace/span correlation fields are OTLP `bytes` fields and must be base64-encoded in JSON, not W3C hex strings. Normal exporter failures are bounded and controlled by `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL`; graceful shutdown flushes are best-effort and must not log bridge-unavailable noise after services are stopping. Run `bun test apps/backend/src/self-observability.test.ts` and `go test -tags surrealdb ./core/go-runtime/selfobs`.

Until the repository has a root Go module, use this Go workspace command from the repo root:

```sh
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```

## TypeScript Standards

- Use Bun for runtime, package management, scripts, and tests.
- Use Biome for linting and formatting.
- Use ESM only.
- Support Node-compatible tooling only at Node `24.15` or newer.
- Do not add Jest, Vitest, ESLint, Prettier, tsx, pnpm, npm, or yarn unless a spec explicitly changes the toolchain.

## Local Infrastructure

- Use `compose.yaml` and `.env` for NATS and SurrealDB.
- Start infrastructure with `docker compose --env-file .env up -d nats surrealdb`.
- Keep Docker image versions current and explicit in `.env.example`; update specs/guides when versions change.

## Code Quality

- Prefer clean code with focused modules, explicit contracts, and clear dependency direction.
- Avoid duplicate code; extract shared behavior only when it removes real duplication.
- Avoid bloated files and overengineering.
- Do not introduce generic query DSLs, compatibility layers, or frontend-specific backend shortcuts unless a spec explicitly requires them.
- Do not preserve legacy behavior or backward compatibility unless a spec explicitly requires it.
- Prefer clean breaking changes over compatibility layers while the product is pre-legacy.

## Documentation

- User-facing and operator docs belong in `website/`, primarily under `website/src/content/handbook/`.
- Docs must follow a storyline from easy to expert level.
- Keep topics separated and link back to relevant specs only when useful.
- Update docs when behavior or setup changes.

## Skills

- CloudGrid-specific AI skills belong in `skills/`.
- Skills must help agents use, configure, operate, or extend CloudGrid.
- Skills must be grounded in specs and must not invent product behavior.

## Additional Guidance

Implementation conventions live in `.agent/IMPLEMENTATION.md`.
Frontend design conventions live in `DESIGN.md`.

Frontend UX implementation must follow `specs/05-frontend/product-ux-concept.md`. Do not invent alternate shell modes, navigation ordering, onboarding placement, empty-state structure, modal/drawer/popover usage, or card-based page layouts inside route components.

Approved UX v2 guidance to preserve:

- Use the global 56px topbar as the only app-wide navigation surface.
- Use the left project/domain sidebar for selected-project navigation: optional pinned dashboard shortcuts, Overview, Traces, Logs, Metrics, Dashboards, AI Eval when enabled, with Project settings separated at the bottom. Live trace receiving is a mode inside Traces, not a separate sidebar entry.
- Dashboard sidebar shortcuts and star/pin actions use `Query.dashboards`, `Mutation.setDashboardPinned`, and `Mutation.reorderDashboardPins`. Do not fake persisted dashboard pins in production UI.
- Keep topbar, route header, domain sidebar, primary workspace, and inspector/drawer areas as independent scroll containers where applicable.
- Keep the project picker centered and operational: rich selectable project cards, current selection, status metadata, and authorized create action; no global stats dashboard, company rail, nested cards, or decorative marketing picker.
- Use the admin settings shell for project/company settings; settings are not a primary telemetry tab.
- Use shadcn/ui and Tailwind semantic tokens with flat, border-led styling.
- Preserve primary, secondary, ghost/icon, and destructive button hierarchy.
- Do not build card-in-card layouts or wrap route-primary data surfaces in cards.
- In local mode, `Personal` is the durable visible admin company; do not add destructive company deletion, owner-transfer, billing, or orphaning flows unless specs define them.
- Treat `/metrics` as the technical metric explorer and `/dashboards` as the saved dashboard/widget workspace. Do not add `MetricView` compatibility surfaces.
