---
id: REV-010
title: Frontend UX v2 migration plan
layer: review
status: superseded-by-frontend-ux-migration-check
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
provenance: worker-ux-plan
depends_on: [TEC-FE-001, TEC-FE-002, TEC-FE-004, TEC-FE-016, TEC-BE-001, CNV-001]
---

# Frontend UX v2 Migration Plan

> Superseded: this review plan predates the current traces/logs/metrics/dashboard UX concept files and conflicts with them in route ownership, especially by treating Live as a separate workspace/sidebar item. Do not execute tickets from this file. Use `plans/frontend-ux-migration-check/` as the current migration audit and blocked planning package, then regenerate executable tickets only after `specs/.readiness-report.yaml` is approved.

## Purpose

This plan splits the approved CloudGrid enterprise UX concept into parallel-agent migration tickets. It is a planning artifact only; it does not change product behavior, contracts, route semantics, or implementation specs.

The authoritative UX source is `specs/05-frontend/product-ux-concept.md`. When implementation finds a gap, the agent must stop and update the relevant source spec before changing code.

## Readiness

- `specs/.readiness-report.yaml` is approved and lists the enterprise UX concept wave as approved for implementation planning.
- Gate simulation includes frontend enterprise shell, project onboarding, modal/drawer/popover/collapsible consistency, and responsive/accessibility QA.
- Frontend work must preserve the hard boundaries in `specs/00-conventions.md` and `.agent/IMPLEMENTATION.md`.
- GraphQL, AsyncAPI, and error contracts remain the only sources for public fields, message subjects, and error codes.

## Global Sequencing

1. Run UXV2-01 first. It owns shared shell, route frame, command palette, shared presentation components, translation keys, and shared smoke harness updates.
2. Run UXV2-02 after UXV2-01. It owns project selection, project home, onboarding, setup drawer, and project settings presentation.
3. Run UXV2-03 through UXV2-07 in parallel after UXV2-01 and UXV2-02 are merged. Their write scopes are disjoint by route and feature files.
4. Run UXV2-08 last. It is the cross-route design, responsive, accessibility, and no-drift QA pass. It writes tests and findings only; fixes return to the owning ticket scope.

## Global Anti-Drift Rules

- Do not show `Live`, `Traces`, `Logs`, `Metrics`, or `AI Eval` navigation before a project is selected.
- Keep selected-project sidebar navigation ordered as `Overview`, `Live`, `Traces`, `Logs`, `Metrics`, `AI Eval` when AI Eval is enabled, with `Project settings` separated at the bottom.
- Do not wrap route-primary tables, live streams, trace waterfalls, metric grids, or AI-eval workspaces in cards.
- Use drawers/sheets for contextual details and editors, dialogs only for short confirmations, popovers for anchored choices, and collapsibles only for optional secondary groups.
- Every empty state identifies one cause and has exactly one primary next action.
- All user-visible copy goes through the translation layer.
- Frontend renders GraphQL view models only. It must not derive telemetry counts, facets, trace structure, metric aggregations, AI-eval scores, credential truth, or retention policy.
- Frontend talks only to the TypeScript BFF. It must not call NATS, Go services, OTLP collector endpoints, or SurrealDB.
- Do not add GraphQL fields, NATS subjects, REST telemetry read endpoints, storage tables, error codes, route modes, or settings semantics from route components.
- Do not expose stored ingest credential secrets. Secret values may be shown only once when a credential-creation mutation returns them.
- Do not implement telemetry retention or deletion behavior as part of this UX migration.

## Ticket UXV2-01: Shell, Route Frame, And Shared UX Foundation

**Owner:** Frontend foundation agent.

**Depends on:** none.

**Read scope:**

- `specs/spec.md`
- `specs/00-vision.md`
- `specs/00-conventions.md`
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/frontend-execution-spec.md`
- `specs/05-frontend/views.md`
- `DESIGN.md`
- `.agent/IMPLEMENTATION.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/errors.yaml`

**Write scope:**

- `apps/frontend/src/routes/app-shell.tsx`
- `apps/frontend/src/routes/telemetry-project-gate.tsx`
- `apps/frontend/src/features/navigation/`
- `apps/frontend/src/components/query-state.tsx`
- `apps/frontend/src/components/ui/`
- `apps/frontend/src/lib/i18n.ts`
- `apps/frontend/src/lib/session-state.ts`
- `apps/frontend/src/lib/query-keys.ts`
- `apps/frontend/src/lib/url-filters.ts`
- `apps/frontend/src/styles.css`
- `apps/frontend/e2e/smoke.e2e.ts`
- New foundation tests under `apps/frontend/test/ux-v2-shell*.test.ts`

No other ticket may write these files unless this ticket explicitly creates a subdirectory contract for later route-owned files.

**Implementation approach:**

- Implement project selection mode and project workspace mode in the app shell.
- Implement or normalize `PageFrame`, shared route header conventions, `DataState`, `InspectorDrawer`, command palette entry points, context switcher behavior, and no-project route guards.
- Add translation keys needed by UXV2-02 through UXV2-07 so later route tickets do not edit `i18n.ts`.
- Normalize URL/query helper APIs used by Live, Traces, Logs, Metrics, and trace detail before route agents begin.
- Keep command palette frontend-only; it must not add backend search.

**Acceptance criteria:**

- With no selected project, telemetry navigation is hidden and guarded routes send the user to `/projects` with a project-required state.
- With a selected project, the topbar shows company/project dropdown context and the left project sidebar shows project navigation in the approved order.
- Project switching calls the existing `Mutation.selectProject` path and resets project-scoped query state through existing frontend cache boundaries.
- Shared data state renders loading, empty, no-filter-results, error-with-retry, and populated slots without forcing cards around route-primary surfaces.
- Command palette opens from visible UI and `mod+k`, contains route and copy-link actions only, and uses no backend search contract.
- All new shell/shared copy uses the translation layer.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun run --cwd apps/frontend build`
- `bun test apps/frontend/test/session-state.test.ts apps/frontend/test/ux-v2-shell*.test.ts`
- `bun run --cwd apps/frontend smoke`

**Anti-drift checks:**

- Search for telemetry nav labels in no-project render tests.
- Search for raw user-visible strings in changed shell/shared files.
- Confirm no imports from SurrealDB, NATS, Go service code, OTLP collector code, or non-BFF endpoints.

## Ticket UXV2-02: Project Selection, Project Home, Onboarding, And Setup

**Owner:** Frontend project workspace agent.

**Depends on:** UXV2-01.

**Read scope:**

- UXV2-01 changed files
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/views.md`
- `specs/04-backend/control-plane.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/errors.yaml`
- `DESIGN.md`

**Write scope:**

- `apps/frontend/src/routes/control-plane-routes.tsx`
- New files under `apps/frontend/src/features/projects/`
- New tests under `apps/frontend/test/ux-v2-projects*.test.ts`
- New Playwright spec `apps/frontend/e2e/ux-v2-projects.e2e.ts`

**Implementation approach:**

- Reshape `/projects` into project selection mode with project list, selected-project summary, and setup guidance.
- Route `/projects/:projectId` as a compatibility selector that redirects to `/traces`.
- Use `/projects/new` for project creation and a drawer/sheet only for setup guidance.
- Keep checklist collapsed/dismissed state browser-local only.
- Render current ingest credential metadata exactly as exposed by current GraphQL contracts; do not add multi-key create/rotate/disable behavior.

**Acceptance criteria:**

- `/projects` never shows telemetry topbar navigation before project selection.
- No-project state has primary action `Create project` when no project exists and `Select project` when projects exist.
- Project creation uses `/projects/new`, validates through the create entity page pattern, calls existing project creation/select behavior, and navigates to `/traces`.
- Project onboarding lives in empty telemetry states and `/projects/:projectId/settings/ingest`.
- Setup drawer copies only project-scoped endpoint/config snippets and never exposes SurrealDB, NATS, session, or stored credential secrets.
- Project settings shows ingest credential metadata and explicit copy that stored secrets are never displayed.
- Empty, loading, forbidden, unavailable, and populated states use one primary next action.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun run --cwd apps/frontend build`
- `bun test apps/frontend/test/ux-v2-projects*.test.ts`
- `bun run --cwd apps/frontend smoke --grep "projects|project home|setup"`

**Anti-drift checks:**

- Do not add credential mutations, secret display, retention controls, deletion controls, or project-specific role controls.
- Do not store checklist state as project data.
- Do not edit `apps/frontend/src/lib/i18n.ts`; missing copy returns to UXV2-01.

## Ticket UXV2-03: Live Workspace

**Owner:** Frontend live telemetry agent.

**Depends on:** UXV2-01, UXV2-02.

**Read scope:**

- UXV2-01 shared shell and URL helper outputs
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/frontend-execution-spec.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-flows/observability/live-trace-subscription.md`

**Write scope:**

- `apps/frontend/src/routes/live-route.tsx`
- New files under `apps/frontend/src/features/live/`
- `apps/frontend/test/live-route.test.ts`
- New tests under `apps/frontend/test/ux-v2-live*.test.ts`
- New Playwright spec `apps/frontend/e2e/ux-v2-live.e2e.ts`

**Implementation approach:**

- Convert `/live` into the approved workspace surface with stream status, pause/resume, clear buffer, server filter action, and virtualized live trace table.
- Use `Subscription.liveTraces` and `LiveTraceInput` only.
- Keep the bounded local buffer for presentation continuity; do not compute aggregate counts or local substitute filters.

**Acceptance criteria:**

- Live route requires selected project context.
- Live states cover connecting, live, reconnecting, paused, empty, error, and populated.
- Changing server filters restarts the GraphQL subscription operation through existing client behavior.
- Pause/resume affects rendering without adding a second realtime protocol.
- Row navigation opens `/traces/:traceId`.
- No `to`, sort, cursor, or historical pagination controls appear in Live.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/live-route.test.ts apps/frontend/test/ux-v2-live*.test.ts`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke --grep "live"`

**Anti-drift checks:**

- No imports from EventSource, raw WebSocket clients, NATS, OTLP endpoints, or polling helpers.
- No local aggregate counts, local telemetry filtering as a server-filter substitute, or card-wrapped live table.

## Ticket UXV2-04: Trace Search And Log Search Workspaces

**Owner:** Frontend telemetry search agent.

**Depends on:** UXV2-01, UXV2-02.

**Read scope:**

- UXV2-01 shared filter, data-state, and URL helper outputs
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/views.md`
- `specs/05-frontend/frontend-execution-spec.md`
- `specs/02-capabilities/observability/search-traces.md`
- `specs/02-capabilities/observability/search-logs.md`
- `specs/02-capabilities/observability/get-telemetry-facets.md`
- `specs/03-contracts/graphql/public-schema.graphql`

**Write scope:**

- `apps/frontend/src/routes/traces-route.tsx`
- `apps/frontend/src/routes/logs-route.tsx`
- `apps/frontend/src/features/traces/trace-filters.tsx`
- `apps/frontend/src/features/traces/trace-table.tsx`
- `apps/frontend/src/features/logs/`
- `apps/frontend/src/features/telemetry/facet-panel.tsx`
- `apps/frontend/src/features/telemetry/query-preset-bar.tsx`
- `apps/frontend/src/features/telemetry/query-presets.ts`
- `apps/frontend/src/features/telemetry/query-presets.test.ts`
- New tests under `apps/frontend/test/ux-v2-search*.test.ts`
- New Playwright spec `apps/frontend/e2e/ux-v2-search.e2e.ts`

**Implementation approach:**

- Convert `/traces` and `/logs` into unframed workspace surfaces with route headers, filter bars, active filter chips, facet panel behavior, and sticky-header primary tables.
- Keep filters and cursors in URL state using UXV2-01 helpers.
- Keep row copy/icon actions from triggering row navigation.
- Use GraphQL `Query.traces`, `Query.logs`, and `Query.telemetryFacets` view models only.

**Acceptance criteria:**

- Trace search columns match the approved service, operation/root span, trace ID, started time, duration, status, span count, error span count, log count, and service count vocabulary.
- Log search columns match the approved timestamp, severity, service, trace, span, and body preview vocabulary.
- Empty states distinguish no telemetry from current filters returning no results.
- Sort changes reset cursor.
- Trace and span chips copy or navigate without accidental row navigation.
- Facet suggestions never replace manual text entry.
- Populated table routes keep page scroll stable; the table body scrolls internally with sticky headers.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/src/features/telemetry/query-presets.test.ts apps/frontend/test/ux-v2-search*.test.ts`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke --grep "traces|logs|filters"`

**Anti-drift checks:**

- Do not derive facets, counts, related logs, service breakdowns, or filter results locally.
- Do not add REST telemetry reads.
- Do not edit trace-detail visualization files owned by UXV2-05.

## Ticket UXV2-05: Trace Investigation Workspace

**Owner:** Frontend trace investigation agent.

**Depends on:** UXV2-01, UXV2-02.

**Read scope:**

- UXV2-01 route frame and URL helper outputs
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/frontend-execution-spec.md`
- `specs/05-frontend/trace-investigation-ux.md`
- `specs/05-frontend/ui-enhancements-and-visualizations.md`
- `specs/02-capabilities/frontend/render-trace-detail.md`
- `specs/02-capabilities/frontend/render-span-waterfall.md`
- `specs/03-contracts/graphql/public-schema.graphql`

**Write scope:**

- `apps/frontend/src/routes/trace-detail-route.tsx`
- `apps/frontend/src/features/traces/trace-detail-view.tsx`
- `apps/frontend/src/features/traces/trace-fixtures.ts`
- `apps/frontend/src/features/traces/trace-overview-minimap.tsx`
- `apps/frontend/src/features/traces/trace-service-breakdown.tsx`
- `apps/frontend/src/features/traces/trace-tree-model.ts`
- `apps/frontend/src/features/traces/trace-tree-waterfall.tsx`
- New files under `apps/frontend/src/features/traces/trace-detail/`
- New tests under `apps/frontend/test/ux-v2-trace-detail*.test.ts`
- New Playwright spec `apps/frontend/e2e/ux-v2-trace-detail.e2e.ts`

**Implementation approach:**

- Make the trace waterfall the primary workspace visualization.
- Keep selected span, active tab, and trace-detail filters in URL state.
- Use inspector drawer/panel on desktop and sheet on mobile for span detail.
- Implement keyboard tree navigation, missing-parent rendering, warnings, stack trace fallback, links, and related log grouping from GraphQL read models.

**Acceptance criteria:**

- `/traces/:traceId` has header identity, copy actions, trace status, duration, start time, and back navigation.
- Selecting a span updates `spanId` without full route navigation.
- Span detail tabs are Overview, Attributes, Events, Exceptions, Links, Logs.
- Related logs are grouped as exact span logs, trace logs, then contextual logs when provided.
- Missing parent, missing root, partial trace, clock skew, and large trace warnings render from backend warnings.
- Large trace smoke uses virtualization above 500 visible spans.
- Keyboard can focus, expand/collapse, move, and select visible spans.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/ux-v2-trace-detail*.test.ts`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke --grep "trace detail|waterfall|span"`

**Anti-drift checks:**

- Do not compute critical path, orphan/root structure, service breakdown, related logs, or stack trace semantics beyond rendering GraphQL view models.
- Do not place separate card charts above the waterfall.
- Do not edit trace search table/filter files owned by UXV2-04.

## Ticket UXV2-06: Metrics Workspace

**Owner:** Frontend metrics agent.

**Depends on:** UXV2-01, UXV2-02.

**Read scope:**

- UXV2-01 shared route frame and project-change reset behavior
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/frontend-execution-spec.md`
- `specs/05-frontend/dashboard-widgets.md`
- `specs/02-capabilities/metrics/query-metrics.md`
- `specs/02-capabilities/metrics/manage-dashboards.md`
- `specs/03-contracts/graphql/public-schema.graphql`

**Write scope:**

- `apps/frontend/src/routes/metrics-route.tsx`
- New files under `apps/frontend/src/features/metrics/`
- `apps/frontend/test/metrics-route.test.ts`
- New tests under `apps/frontend/test/ux-v2-metrics*.test.ts`
- New Playwright spec `apps/frontend/e2e/ux-v2-metrics.e2e.ts`

**Implementation approach:**

- Convert `/metrics` into left view rail, unframed panel grid, and right inspector drawer.
- Render built-in and project-saved views from GraphQL.
- Keep editable draft state explicit and local until `Mutation.saveDashboard`.
- Prompt before route or project switch when dirty state exists.

**Acceptance criteria:**

- Metrics route requires selected project context and resets metric query/view/draft state when project changes.
- Built-in views can be duplicated before saved edits are made.
- Editor controls map directly to `MetricSeriesInput` fields.
- Delete uses a confirmation dialog; editing uses an inspector drawer.
- Panel grid does not show empty placeholder cards for absent metrics.
- Empty states distinguish no metrics ingested, no data for selected range, and filters removed all series.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/metrics-route.test.ts apps/frontend/test/ux-v2-metrics*.test.ts`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke --grep "metrics"`

**Anti-drift checks:**

- Do not compute metric rates, percentiles, grouping, downsampling, cardinality reduction, or descriptor metadata locally.
- Do not store saved dashboards or dashboard pins only in browser storage.
- Do not add metric query fields outside the GraphQL schema.

## Ticket UXV2-07: AI Eval Workspace

**Owner:** Frontend AI-eval agent.

**Depends on:** UXV2-01, UXV2-02.

**Read scope:**

- UXV2-01 shared route frame and feature-gated navigation behavior
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `specs/05-frontend/frontend-execution-spec.md`
- `specs/05-frontend/ai-eval-views.md`
- `specs/99-reviews/ai-eval-implementation-scope.md`
- `specs/03-contracts/graphql/public-schema.graphql`

**Write scope:**

- `apps/frontend/src/routes/ai-eval-route.tsx`
- `apps/frontend/src/features/ai-eval/`
- `apps/frontend/test/ai-eval-view-model.test.ts`
- New tests under `apps/frontend/test/ux-v2-ai-eval*.test.ts`
- New Playwright spec `apps/frontend/e2e/ux-v2-ai-eval.e2e.ts`

**Implementation approach:**

- Convert `/ai-eval` into feature-gated workspace with Runs, Experiments, Datasets, Scorers, and Annotations sections.
- Use a left rail or tabs per responsive breakpoint and inspector drawers for details.
- Render transcript, timeline, scoreboard, annotation, dataset, scorer, and experiment data from GraphQL only.
- Hide primary navigation when AI Eval is disabled; direct route shows feature-disabled state.

**Acceptance criteria:**

- AI Eval route requires selected project context and resets AI-eval query state when project changes.
- Feature-disabled state has one primary next action and does not expose disabled navigation.
- Run/experiment/detail inspectors use drawer/sheet behavior, not dialogs.
- Trace pivots preserve project context and navigate to trace detail links from GraphQL data.
- Empty, loading, error, and populated states exist for each top-level section.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/ai-eval-view-model.test.ts apps/frontend/test/ux-v2-ai-eval*.test.ts`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke --grep "ai eval|AI Eval"`

**Anti-drift checks:**

- Do not compute scores, costs, token totals, transcript semantics, or regression summaries locally.
- Do not add model-provider credentials or SDKs to frontend code.
- Do not change AI-eval GraphQL contracts.

## Ticket UXV2-08: UX V2 Responsive, Accessibility, And Drift QA

**Owner:** Frontend QA agent.

**Depends on:** UXV2-03, UXV2-04, UXV2-05, UXV2-06, UXV2-07.

**Read scope:**

- All files changed by UXV2-01 through UXV2-07
- `specs/05-frontend/product-ux-concept.md`
- `specs/06-nfr/accessibility-ui.md`
- `DESIGN.md`

**Write scope:**

- New Playwright specs under `apps/frontend/e2e/ux-v2-qa*.e2e.ts`
- New tests under `apps/frontend/test/ux-v2-qa*.test.ts`
- `specs/99-reviews/frontend-ux-v2-qa-findings.md` only if blocking issues remain

This ticket must not fix route implementation files. It files findings against the owning ticket scope when fixes are needed.

**Implementation approach:**

- Add cross-route smoke coverage for 320px mobile, tablet, desktop, and wide desktop.
- Add keyboard reachability and focus restoration checks for topbar, menu sheet, command palette, filters, table rows, drawers, dialogs, and popovers.
- Add no-nested-card and route-primary-surface checks using DOM selectors or stable test IDs created by the owning tickets.
- Add translation coverage checks for user-visible UX v2 strings.

**Acceptance criteria:**

- At 320px width, text does not overlap controls, charts, chips, bars, or neighboring content on all UX v2 routes.
- Keyboard can reach and leave all specified route controls and overlay surfaces.
- Dialogs, sheets, popovers, and command palette trap and restore focus according to the surface taxonomy.
- No route-primary table, waterfall, live stream, metric grid, or AI-eval workspace is nested inside a card.
- Empty states across routes have exactly one primary action.
- Any remaining blocking defect is recorded in `frontend-ux-v2-qa-findings.md` with owning ticket, file, reproduction, and expected fix.

**Verification commands:**

- `bun run --cwd apps/frontend typecheck`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend test`
- `bun run --cwd apps/frontend smoke`
- `bun run verify`

**Anti-drift checks:**

- QA findings must not introduce new UX behavior. They cite the exact source spec and route owner.
- Do not edit implementation files from this ticket.

## Superseded Scope: Multi Ingest API Key Handling

**Status:** backend/security/control-plane work, not part of UX v2 migration.

**Reason for deferral:** Current UX specs allow setup surfaces to show project-scoped endpoint and ingest credential metadata. They do not define a complete multi-key lifecycle contract in GraphQL, AsyncAPI, error taxonomy, authorization policy, storage schema, or one-time-secret handling.

**Backlog items:**

- Define a control-plane spec for multiple project ingest credentials, including display name, created time, last used time, disabled time, creator, rotation, revocation, and audit expectations.
- Define GraphQL mutations and queries for listing metadata, creating a key with one-time secret reveal, disabling a key, and rotating a key.
- Define AsyncAPI control-plane subjects and Go/TypeScript generated contract outputs.
- Define authorization rules for who can create, rotate, disable, and view metadata.
- Define secret hashing, prefix display, redaction, logging, clipboard, and test requirements.
- Add a UI ticket for multiple-key metadata tables and create/rotate/disable drawers only after backend/security contracts are approved.

**UX migration rule:** UXV2 tickets may show current credential metadata and safe setup copy only. They must not add multiple key management UI, fake keys, local-only key state, or new credential GraphQL fields.

## Superseded Scope: Data Retention Policy

**Status:** backend/storage/security work, not part of UX v2 migration.

**Current status:** project retention policy CRUD is implemented through generated contracts and Project Settings. Retention deletion execution remains deferred until the storage-maintenance worker, tenant/project-scoped deletion semantics, and integration tests are implemented.

**Backlog items:**

- Promote retention from NFR target into an implementation-ready backend/storage spec with owner service, worker cadence, batch behavior, tenant/project boundaries, and failure handling.
- Define config validation for `CLOUDGRID_RETENTION_MODE`, `CLOUDGRID_RETENTION_DAYS`, and `CLOUDGRID_RETENTION_BATCH_SIZE`.
- Define GraphQL/control-plane read models for effective retention policy only after backend behavior exists.
- Define docs that explain local indefinite retention and production TTL behavior.
- Add a UI ticket for project/company retention display or controls only after retention worker and authorization contracts are approved.

**UX migration rule:** UXV2 tickets may state that local telemetry is retained until operator deletion when such copy is already defined in documentation and specs. They must not add retention controls, deletion APIs, fake policy state, or frontend-triggered telemetry deletion.

## Final Plan Verification

Before executing this plan as implementation work:

- Confirm every ticket's write scope remains disjoint.
- Confirm UXV2-01 has landed before route agents start.
- Confirm no route ticket needs new GraphQL fields, NATS subjects, error codes, storage tables, or backend behavior.
- Run the narrow ticket commands plus the broader frontend and root verification commands required by touched shared contracts.
- If any implementation needs behavior not covered by the approved specs, stop and update the relevant spec first.
