# CloudGrid Implementation Guide

Version: 2026-05-08

## Product Identity

- Product: CloudGrid.
- Website: https://cloudgrid.dev.
- Package scope: `@cloudgrid`.
- Go module base: `github.com/cloudgrid-dev/cloudgrid`.
- TypeScript runtime/package manager/test runner: Bun.
- TypeScript lint/format: Biome.
- Module format: ESM only.
- Node compatibility floor: 24.15.

## Architecture Summary

CloudGrid is a multi-service TypeScript and Go system.

- TypeScript BFF exposes GraphQL queries, GraphQL subscriptions, and health.
- React frontend talks only to the BFF.
- Go OTLP collector accepts OTLP HTTP and publishes through the message bridge stream publisher. The v1 adapter is NATS JetStream.
- Go storage-write consumes message bridge streams through an adapter and mutates SurrealDB.
- Go storage-read handles message bridge request/reply, trace/log/metric query semantics, live trace sessions, and SurrealDB reads.
- Go control-plane owns companies, users, projects, ingest credential metadata, dashboards, and dashboard pins.

All telemetry reads and writes cross message bridge ports. Public and ingress-facing services do not access SurrealDB.

Telemetry reads follow a dumb-client, smart-backend model:

- Frontend renders GraphQL view models and owns only presentation state.
- TypeScript BFF validates, maps, sends message bridge request/reply through an adapter, validates replies, and maps errors.
- TypeScript BFF does not filter, aggregate, rank, correlate, or enrich telemetry records.
- Go storage-read owns query semantics and view-model derivation.
- Go storage-read owns log search/detail correlation and metric name/series query semantics, including aggregation compatibility, grouping, filters, exemplars, and bounded results.
- Go control-plane owns dashboard persistence and pins through first-class `Dashboard` and `DashboardWidget` contracts. Do not add `MetricView`, `MetricViewPanel`, `metricViews`, `saveMetricView`, or `deleteMetricView` compatibility aliases.
- Go storage-read owns live trace matching, read authorization preparation, and realtime fanout.
- Storage-read database adapters push supported filters, sorting, cursor predicates, grouping, counts, and bounded facet aggregation into the database.
- Code-side derivation is limited to the explicit exceptions in `specs/04-backend/telemetry-query-semantics.md`.

Live telemetry follows the same boundary:

- Frontend uses GraphQL `Subscription.liveTraces`.
- BFF owns only GraphQL WebSocket transport, validation, message bridge start/stop mapping, event decoding, and cleanup.
- BFF must not consume `TELEMETRY_INGEST`, `telemetry.ingest.*`, or `telemetry.persisted.traces`.
- Storage-write publishes post-persist trace ID notifications only after successful persistence.
- Storage-read consumes post-persist notifications, resolves matching `TraceSummary` records through read semantics, and emits live events to BFF-owned sink subjects.

## Module Organization

Keep files focused. Split before a file mixes transport, validation, mapping, persistence, and presentation.

TypeScript:

- `src/config`: config loading and validation.
- `src/graphql`: schema loading, resolvers, error mapping.
- `src/bridge`: typed message bridge clients and adapter interfaces. NATS-specific code lives under `src/bridge/adapters/nats`.
- `src/http`: Hono server, middleware, health, static serving.
- `src/logging`: structured logging helpers.

Go services:

- `cmd/<service>/main.go`: composition only.
- `internal/config`: config loading and validation.
- `internal/adapters/nats`: NATS clients, consumers, and transport mapping. Business handlers depend on portable bridge interfaces, not NATS types.
- `internal/otlp`: collector-only OTLP decoding and normalization.
- `internal/storage`: storage service SurrealDB code only.
- `internal/logging`: structured logging helpers.

## Naming

- TypeScript files: kebab-case.
- TypeScript types/interfaces/classes: PascalCase.
- TypeScript functions/variables: camelCase.
- Go packages: lowercase, no underscores.
- Go exported names: PascalCase.
- Message bridge subjects: exactly as defined in `specs/03-contracts/messages/message-bridge.asyncapi.yaml`.
- Error codes: exactly as defined in `specs/03-contracts/errors.yaml`.

## TypeScript Toolchain

- Use Bun `1.3.13` or newer.
- Use `bun install`, `bun run`, and `bun test`.
- Use Biome `2.4.14` for linting and formatting.
- Use ESM only. Do not add CommonJS modules.
- Do not add pnpm, npm, yarn, ESLint, Prettier, Jest, Vitest, or tsx.
- Keep package scripts compatible with Bun.

## Contracts

Contracts are source-of-truth implementation inputs:

- GraphQL: `specs/03-contracts/graphql/public-schema.graphql`.
- Message bridge: `specs/03-contracts/messages/message-bridge.asyncapi.yaml`.
- HTTP: `specs/03-contracts/api/http-api.openapi.yaml`.
- Entities: `specs/03-contracts/entities/*.schema.json`.
- Errors: `specs/03-contracts/errors.yaml`.

Generated files must say which spec generated them. Do not hand-edit generated files once generation exists.

Contract changes must update all participating layers in one change: GraphQL SDL, AsyncAPI, `apps/packages/ui-contracts`, BFF operation/client code, Go request structs, and focused tests where applicable. `bun run contracts:check` is the drift gate and validates frontend GraphQL operations against the SDL, required GraphQL input fields against UI TypeScript contracts, and AsyncAPI request fields against Go structs. Do not claim a contract change complete without running it.

Message bridge alignment is enforced in service tests, not by convention alone:

- `core/go-contracts/generated_contracts.go` is the generated subject inventory.
- `core/control-plane/internal.ControlSubjects()` must contain exactly the generated control-plane subjects.
- The control-plane NATS handler map must register every generated control-plane request/reply subject. Stream or notification-only subjects may be present in `ControlSubjects()` without a request handler only when the focused test documents the exception.
- The TypeScript BFF bridge payload must match the AsyncAPI request schema exactly. Do not wrap a request in `input` unless the AsyncAPI schema explicitly has an `input` field.
- Add or update focused bridge tests whenever a BFF method maps GraphQL/public input to a message bridge subject, especially for required fields, auth-derived fields, and optimistic concurrency fields.

For control-plane subject work, run:

```sh
bun test apps/backend/src/bridge.test.ts
go test -tags surrealdb ./core/control-plane/...
bun run contracts:check
```

## Self-Observability Alignment

Self-observability exporters must follow `specs/04-backend/self-observability.md` exactly.

- OTLP JSON `bytes` fields are base64 strings. W3C hex trace IDs and span IDs are valid transport context, but they must not be written directly to OTLP JSON `traceId`, `spanId`, `parentSpanId`, exemplar IDs, or log correlation fields.
- Go exporters should build official OTLP protobuf messages and serialize them with `protojson`.
- TypeScript exporters that construct JSON directly must have focused tests proving trace/span byte fields are protobuf-JSON compatible.
- Normal exporter failures are bounded, rate-limited, and controlled by `CLOUDGRID_SELF_OBSERVABILITY_EXPORT_FAILURE_LOG_LEVEL`.
- Graceful shutdown flushes are best-effort and must not log `MESSAGE_BRIDGE_UNAVAILABLE` noise after the collector or bridge has started stopping.

For self-observability exporter work, run:

```sh
bun test apps/backend/src/self-observability.test.ts
go test -tags surrealdb ./core/go-runtime/selfobs
bun run typecheck
```

## Error Handling

- GraphQL errors use `extensions.code` from the error taxonomy.
- HTTP errors use the OpenAPI `ErrorResponse` shape.
- Message bridge replies use `BridgeError`.
- Do not expose raw provider errors.
- Include `request_id` and canonical `error_code` in logs.

## Logging

Logs are structured JSON. Required fields:

- `timestamp`
- `level`
- `service`
- `event`
- `request_id`

Include `trace_id`, `span_id`, `message_subject`, `nats_subject` when the v1 adapter is used, and `command_id` when known. Never log full OTLP payloads or secrets by default.

Level policy:

- `debug`: successful high-frequency GraphQL operations, NATS request/reply calls, NATS handler completions, OTLP HTTP completions, telemetry ingest completions, live trace notifications, and per-request timing diagnostics.
- `info`: low-frequency lifecycle events operators need by default, primarily startup readiness, shutdown, and explicit long-lived mode changes.
- `warn`: validation failures, denied or malformed client actions, recoverable dependency degradation, retryable bridge failures, and configured self-observability export failures.
- `error`: startup failure, required dependency unavailability, terminal processing failure, data loss risk, and unexpected internal failures.

The default threshold is `info`. Do not add steady-state success logs at `info`; production should be quiet after startup while healthy.

## Testing

Required test categories:

- BFF GraphQL resolver unit and integration tests.
- Message bridge request/reply integration tests.
- Stream consumer redelivery and ack tests for the active bridge adapter.
- OTLP JSON and protobuf decode tests.
- SurrealDB read/write integration tests.
- Frontend route smoke tests for loading, empty, error, and populated states.
- Contract tests for GraphQL, AsyncAPI, OpenAPI, JSON Schema, and errors.

## Documentation

- End-user and operator docs live in `website/`, primarily under `website/src/content/handbook/`.
- Do not add or update documentation in `docs/`. That tree is legacy content pending migration and will be removed after outstanding agent work is reconciled.
- Docs are structured from easy to expert level:
  - overview
  - getting started
  - concepts
  - guides
  - configuration
  - operations
  - architecture
  - reference
- Update docs whenever setup, configuration, or user-visible behavior changes.

## Public Website Visual Direction

When changing the public website in `website/`, preserve the current marketing-page visual contract:

- Marketing pages may use generated hero imagery, but only as the background of the first hero section. Do not move those images to the body, the full page, recessed content bands, related-link sections, or handbook pages.
- Hero imagery must be realistic and enterprise/product focused: photographic or polished product-collage compositions with observability dashboards, infrastructure, message-bridge flows, adapter blocks, SaaS packaging, or operational telemetry motifs. Avoid simple gradients, procedural SVGs, abstract waves, generic stock-like backgrounds, and placeholder illustrations.
- Hero layout is shared across home, feature, and enterprise pages. Keep headline, description, eyebrow, and CTA placement stable between routes to avoid navigation flicker.
- Handbook pages and handbook subpages stay documentation-first with simple white/neutral backgrounds.
- Keep the site flat and concise: neutral shadcn-like color, restrained borders, no nested cards, no card-in-card compositions, no decorative pill piles, no marketing bloat, and no separate right-side hero visualization when the hero background already carries the visual weight.
- For marketing feature lists and related-page navigation, avoid generic card grids. Prefer editorial stacks, alternating image/text rows, ruled lists, or image-led strips that reuse generated product collage crops.
- Non-handbook marketing pages should be audience-led: introduce the enterprise decision-maker or operator problem first, explain how CloudGrid solves it with existing product capabilities, then route readers to deeper pages instead of duplicating long capability lists.

## Frontend UX Implementation Rules

Before changing `apps/frontend`, read:

- `specs/05-frontend/product-experience-contract.md`
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/views.md`
- `DESIGN.md`

The enterprise product experience contract and UX concept are authoritative for shell modes, route layout, onboarding, empty states, disabled actions, drawers, dialogs, popovers, collapsibles, navigation ordering, and the approved UX v2 app frame.

Frontend implementation must preserve these rules:

- The global topbar is the only app-wide navigation surface. It is 56px tall and owns CloudGrid identity/home, company dropdown, project dropdown, command/search, setup/help, theme/language controls when implemented, and user menu. It never contains telemetry route tabs.
- No telemetry navigation is visible before a project is selected.
- Project workspace navigation lives in the left project sidebar, ordered AI Chat when enabled, optional pinned dashboard shortcuts, Traces, Logs, Metrics, Dashboards, Evaluations when enabled, with Project settings separated at the bottom. Live trace receiving is a mode inside Traces, not a separate sidebar entry.
- Dashboard sidebar shortcuts and star/pin actions use `Query.dashboards`, `Mutation.setDashboardPinned`, and `Mutation.reorderDashboardPins`. Do not fake persisted dashboard pins in production UI.
- Company/member management and settings are reached from context menus or management routes, not mixed into telemetry navigation.
- `/projects` is the project selection and creation entry point.
- `/projects/new` is the project creation page.
- `/projects/:projectId` selects the project after validation and redirects to `/traces`; project onboarding lives in empty telemetry states and `/projects/:projectId/settings/ingest`.
- Project picker UI is a centered operational selector: project-card grid, company/project context, search/filter, current-selection state, status metadata, and create action when authorized. Do not build global stat dashboards, company rails, nested cards, or decorative marketing tiles.
- Project picker telemetry numbers are real backend view-model data. The BFF must enrich control-plane project records from storage-read via `telemetry.projects.overview`; frontend code must not invent, cache, or recompute trace/log/metric/service counts.
- Durable entity creation uses dedicated route pages with wizard-like tabs, field-level and tab-level validation, a summary error panel, Back/Continue controls, field-adjacent help text, and unsaved-change protection. Do not implement new project, new dataset, new evaluation, or new optimization as a drawer, sheet, dialog, popover, or inline expansion. Adding a row to an existing dataset remains a contextual row editor.
- Durable entity settings use dedicated route pages with the same wizard-like tab structure as creation, plus focused settings-only tabs when an entity has additional editable behavior. Detail pages expose a `Settings` action that navigates to the settings route. Do not implement project, dataset, evaluation, or optimization settings as drawers, sheets, dialogs, popovers, or inline expansions.
- Domain sidebars structure the current domain. In project workspace mode, the left sidebar owns project route navigation and may expose collapsible dashboard children under the Dashboards entry; inside routes, nested rails may structure saved dashboards, AI Eval sections, or settings/admin subsections. They are not global/account navigation.
- Project and company settings use an admin-focused settings shell: route header, optional domain sidebar, one primary working surface, dense tables for project/member lists, drawers for invite/edit/setup forms, and dialogs only for short confirmations. Project settings root `/projects/:projectId/settings` is the tabbed project settings page with `Identity` active by default; do not add a separate overview subpage or card-in-card wrappers.
- Local mode exposes one visible company named `Personal`. Treat `Personal` as a durable local admin boundary: do not add delete-company, owner-transfer, billing, or multi-company safety flows unless the spec explicitly defines them.
- Topbar, context strip, route header, domain sidebar, route-primary workspace, and inspector drawer must be independent scroll containers where applicable. Populated data routes should scroll their table/timeline/grid body, not the whole page shell.
- Route-primary tables, trace waterfalls, metric result surfaces, dashboard grids, and AI-eval workspaces are not wrapped in cards.
- `/logs` is the log search workspace with filter chips, selected-log inspector, and same-project trace/span pivots.
- `/metrics` is the technical metric explorer for descriptors, `MetricSeriesInput`, aggregation previews, returned series, and exemplars. It is not a dashboard editor.
- `/dashboards` is the saved visual composition workspace. The default route is the dashboard overview with grouped selectable cards and star/pin controls. `/dashboards?dashboard=<id>` and unsaved drafts are the builder mode with a WYSIWYG-style widget grid, right-side widget editor drawer, explicit save, built-in duplication, personal/project visibility, and pin mutations.
- Dashboard builder uses one `Add widget` action with widget type choices inside a popover. Dashboard name and description are edited in place in the builder header and create an explicit dirty draft. Widget creation and editing open a right-side drawer/sheet; do not keep a permanent dashboard widget inspector column beside the canvas.
- Dashboard layout uses persisted 12-column `DashboardWidgetLayout` coordinates. Move and resize behavior is local draft state until `Mutation.saveDashboard`; compaction must leave no overlaps and must preserve deterministic widget order.
- Rich metric widgets use `DashboardRichMetricWidgetInput`, `DashboardMetricQueryInput`, and `Query.richMetricSeries`. Query rows, formulas, and display series are typed contract data. Do not fan out `Query.metricSeries` calls in React or the BFF and combine them locally.
- Storage-read owns rich metric timestamp alignment, formula evaluation, result caps, warnings, and chart-ready series. Frontend and BFF may validate public shape and render returned series only.
- Frontend route code uses shadcn/Radix form controls. Do not use native select/option/textarea/checkbox inputs or unstyled form controls outside the shared shadcn UI primitives.
- Frontend route/feature code uses the shared Shiki-backed `CodeBlock` for JSON, YAML, Bash, logs, setup snippets, and raw structured evidence. Do not add ad hoc `<pre>` snippets outside the shared component.
- Dashboard widgets are typed metric, log, trace, or live trace widgets. They must not store executable code, raw queries, arbitrary JSON widget configuration, secrets, or external embeds.
- Retention settings must follow `specs/04-backend/data-retention-policy.md`: project-level editable policies, per-data-class rules, and admin-selected hard delete or soft-delete-then-delete. UI remains non-enforcing until storage-maintenance contracts are implemented.
- Alerting must follow `specs/04-backend/alerting.md` and `specs/05-frontend/alerts-ux-concept.md`: project-scoped rules over metrics, logs, and traces with adapter-based notifications, in-app history as the core reference adapter, `/alerts/new` for creation, and `/alerts/:ruleId/settings` for settings. Threshold UI is not alert execution until alert contracts exist. Alert rule UI selects safe company adapter instance IDs only. Company admin settings collect adapter configuration from adapter-provided schemas; secret fields are write-only, stored company-scoped, and never returned to frontend reads, logs, URL state, review summaries, screenshots, or generated assets.
- Never compose card-in-card layouts. Cards are allowed only for repeated selectable items, contained summaries, and modal/drawer content; route sections remain unframed layout regions.
- Use shadcn/ui primitives and Tailwind semantic tokens with a flat, border-led style. Avoid custom component chrome, heavy shadows, gradients, decorative blobs, and one-off raw colors.
- Licensed whitelabel customization is code-level only and follows `specs/05-frontend/whitelabel-customization.md`. Use `@cloudgrid/brand` and `useBrand()` for visible product identity, keep functional CSS separate from default theme tokens, and do not add brand settings pages or customer-specific route code.
- Button hierarchy must be explicit: one primary next action, secondary/outline for alternatives, ghost or icon buttons for low-emphasis toolbar actions, and destructive only for irreversible or high-risk confirmations.
- Every button must include an icon. Copy actions use the shared icon-only copy pattern with accessible labels and tooltips; non-copy visible actions use a concise icon plus label.
- Search fields use the shared shadcn-backed `SearchInput` component with a leading search icon; do not hand-compose absolute search icons beside raw inputs in route or feature code.
- Use inspector drawers/sheets for contextual detail and editing, dialogs for short confirmations, popovers for anchored choices, and collapsibles for optional secondary groups.
- Empty states have one primary next action and at most two secondary actions.
- All user-visible route and feature copy uses the translation layer. Add keys to `apps/frontend/src/lib/i18n.ts` for labels, helper text, empty states, validation messages, actions, placeholders, titles, accessible names, table headings, toast/status messages, and dialog/sheet copy.
- Hard-coded strings in route or feature components are allowed only for user data, code samples, metric names, attribute keys, protocol literals, IDs, GraphQL/query keys, enum wire values, or test fixtures. When in doubt, use `t(...)`.
- Frontend copy changes must include or update a focused regression scan such as `apps/frontend/test/i18n-copy.test.ts` for the changed surface. Existing source-inspection tests should assert translation-key usage instead of literal English copy.
- Frontend may keep only presentation state locally. It must not duplicate backend-owned telemetry, metric, project, membership, or evaluation truth.

If a requested UI behavior is not covered by the UX concept, update the relevant spec before implementation. Do not let route components invent new interaction patterns.

## Skills

- CloudGrid-specific AI skills live in `skills/`.
- Skills must be task-focused and grounded in specs.
- Skills must not define new product behavior.

## Verification

Run relevant checks before completion:

```sh
bun run typecheck
bun run lint
bun run format
bun run test
bun run contracts:check
```

For frontend route or feature copy changes, also run the focused copy scan:

```sh
bun test apps/frontend/test/i18n-copy.test.ts
```

Backend coverage checks:

```sh
bun test --coverage apps/backend/src
go test -tags surrealdb -coverprofile=/tmp/cloudgrid-go-backend.out ./core/otlp-collector/... ./core/storage-read/... ./core/storage-write/...
go tool cover -func=/tmp/cloudgrid-go-backend.out | tail -1
```

Target: BFF line coverage >80% and aggregate Go backend statement coverage >80%. When a package or aggregate is below target, report the exact measured coverage and add focused tests before claiming the target is met.

Until the repository has a root Go module, use this Go workspace command from the repo root:

```sh
go test -tags surrealdb ./core/go-runtime/... ./core/go-contracts/... ./core/otlp-collector/... ./core/control-plane/... ./core/storage-read/... ./core/storage-write/...
```

If a command cannot run because dependencies are not installed or code is not implemented yet, report that explicitly.

## Anti-Patterns

- Adding REST telemetry read endpoints.
- Computing telemetry filters, counts, facets, service breakdowns, related logs, span matches, or trace structure in the frontend or BFF.
- Fetching broad raw span/log sets into the frontend or BFF to derive GraphQL fields.
- Adding generic query DSLs or SQL/SurrealQL passthrough APIs for public telemetry reads.
- Adding CommonJS code.
- Adding pnpm, npm, yarn, ESLint, Prettier, Jest, Vitest, or tsx.
- Importing SurrealDB clients in `apps/backend`, `apps/frontend`, or `core/otlp-collector`.
- Reading or mutating control-plane state outside `core/control-plane`.
- Calling Go services directly from the frontend.
- Bypassing message bridge ports for reads or writes.
- Adding new message bridge subjects outside the AsyncAPI contract.
- Adding new GraphQL fields outside the GraphQL schema.
- Returning raw provider errors.
- Logging secrets or raw full OTLP payloads.
- Adding compatibility layers for legacy behavior not required by specs.
- Duplicating shared logic instead of extracting a focused helper.

## Convention Drift

No drift recorded yet.
