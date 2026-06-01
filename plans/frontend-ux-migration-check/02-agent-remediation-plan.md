---
title: Frontend UX Agent Remediation Plan
status: approved-planning-input
updated: 2026-05-15
---

# Frontend UX Agent Remediation Plan

This plan is approved as planning input. Before execution, copy each ticket into an executable agent ticket with one owner, one write scope, route-specific tests, and visual QA evidence.

## Global Guardrails

- Read `specs/spec.md`, `DESIGN.md`, `.agent/IMPLEMENTATION.md`, and the route-specific UX concept before editing.
- Do not add backend contracts from the frontend.
- Do not reintroduce `Live` as a sidebar entry or route-owned workspace.
- Do not add `MetricView` compatibility.
- Do not use `window.confirm`.
- Do not hard-code user-visible copy in route/components.
- Do not wrap route-primary workspaces in cards.
- Do not leave route-populated pages dependent on browser page scroll.
- Each agent owns only its write scope. Shared files are edited only in FEUX-01.

## Wave Order

1. FEUX-00 verifies planning/spec drift remains resolved.
2. FEUX-01 builds shared shell, frame, navigation, copy, dialog, inspector, and test foundations.
3. FEUX-02 migrates projects and settings.
4. FEUX-03, FEUX-04, FEUX-05, FEUX-06, and FEUX-07 run in parallel after FEUX-01 and FEUX-02.
5. FEUX-08 runs last as cross-route QA and cleanup.

## FEUX-00: Planning Gate And Drift Cleanup

Owner: spec/planning agent.

Depends on: none.

Read scope:

- `specs/.readiness-report.yaml`
- `specs/99-reviews/frontend-ux-v2-migration-plan.md`
- `plans/frontend-ux-migration-check/*`
- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/traces-and-metrics-ux-concept.md`
- `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`

Write scope:

- `specs/.readiness-report.yaml`
- `specs/99-reviews/frontend-ux-v2-migration-plan.md`
- `plans/frontend-ux-migration-check/04-planning-gate-and-spec-drift.md`

Tasks:

- Mark the old UX v2 migration plan as superseded or rewrite it so it no longer contains `Live` as a sidebar route/workspace.
- Confirm the readiness report remains approved for frontend UX implementation planning.
- Confirm the concept files remain the source of truth and this plan is the implementation planning input.

Acceptance:

- No active source-of-truth or executable planning file instructs agents to create a `Live` sidebar entry.
- The old UX v2 review plan is either reduced to a superseded notice or has a top-level superseded notice that blocks execution.
- Readiness report is approved before executable tickets are generated.
- Blocking decisions are empty.

Verification:

- `rg -n "Overview.*, Live|Live Workspace|path=\"/live\"|/live route" specs plans | rg -v "specs/99-reviews/frontend-ux-v2-migration-plan.md|frontend-ux-migration-check"`
- `bun run contracts:check`

## FEUX-01: Shared Shell, Route Frame, And UX Primitives

Owner: frontend foundation agent.

Depends on: FEUX-00 approval.

Read scope:

- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/frontend-application.md`
- `DESIGN.md`
- `apps/frontend/src/routes/app-shell.tsx`
- `apps/frontend/src/components/query-state.tsx`
- `apps/frontend/src/features/navigation/command-palette.tsx`

Write scope:

- `apps/frontend/src/routes/app-shell.tsx`
- `apps/frontend/src/routes/telemetry-project-gate.tsx`
- `apps/frontend/src/components/query-state.tsx`
- New shared components under `apps/frontend/src/components/app/`
- `apps/frontend/src/features/navigation/`
- `apps/frontend/src/lib/i18n.ts`
- `apps/frontend/src/lib/session-state.ts`
- `apps/frontend/src/styles.css`
- `apps/frontend/test/ux-v2-shell*.test.tsx`
- `apps/frontend/e2e/ux-v2-shell.e2e.ts`

Tasks:

- Add shared `RouteFrame`, `RouteHeader`, `BreadcrumbRow`, `WorkspaceSurface`, `InspectorPanel`, `SplitWorkspace`, `ConfirmDialog`, `EvidenceAttributes`, and `FilterChipBar` primitives.
- Keep project sidebar visible for project settings routes.
- Add mobile menu sheet with company/project switcher and route navigation.
- Implement collapsible dashboard sidebar children.
- Normalize topbar, sidebar, and content scrolling so route bodies own populated scroll.
- Add translation keys used by downstream route migrations.
- Add hard-coded-copy test helper for changed frontend files.

Acceptance:

- `/projects` has no telemetry sidebar/nav.
- Project workspace routes show the project sidebar including pinned dashboards, primary routes, collapsible dashboard children, and project settings.
- Mobile widths expose the same navigation through a sheet.
- Project settings routes preserve global project context.
- Shared components do not use card wrappers for route workspaces.

Verification:

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/ux-v2-shell*.test.tsx apps/frontend/test/session-state.test.ts`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke`

## FEUX-02: Projects, Project Home, And Settings

Owner: frontend project/settings agent.

Depends on: FEUX-01.

Read scope:

- `specs/05-frontend/product-ux-concept.md`
- `specs/04-backend/control-plane.md`
- `specs/03-contracts/graphql/public-schema.graphql`
- `apps/frontend/src/routes/control-plane-routes.tsx`
- `apps/frontend/src/features/projects/`

Write scope:

- `apps/frontend/src/routes/control-plane-routes.tsx`
- `apps/frontend/src/features/projects/`
- Project/settings tests under `apps/frontend/test/`
- Project/settings e2e specs under `apps/frontend/e2e/`

Tasks:

- Keep centered project picker but remove excessive card chrome and align card dimensions/buttons.
- Add breadcrumbs for project settings subsections.
- Keep global project sidebar visible and render project settings as a secondary settings rail inside content.
- Add revoke ingest credential confirmation dialog.
- Ensure local mode hides destructive organization/admin affordances that can orphan the single local admin/company.
- Ensure no-telemetry empty states link to `/projects/:projectId/settings/ingest`.
- Keep API key creation one-time-secret behavior and never show stored secrets again.

Acceptance:

- `/projects` is centered, focused, and has search, company context, project cards, and create action.
- `/projects/:projectId/settings/ingest` has one concise setup page with endpoint, copyable setup snippet, credential creation, credential list, one-time secret display, and revoke confirmation.
- Destructive actions are never immediate.
- Settings has breadcrumbs and stable project context.

Verification:

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/ux-v2-projects*.test.ts`
- `bun run --cwd apps/frontend build`
- `bun run --cwd apps/frontend smoke --grep "projects|settings|ingest"`

## FEUX-03: Trace Search And Live Mode

Owner: frontend traces agent.

Depends on: FEUX-01, FEUX-02.

Read scope:

- `specs/05-frontend/product-ux-concept.md`
- `specs/05-frontend/traces-and-metrics-ux-concept.md`
- `specs/03-flows/observability/live-trace-subscription.md`
- `apps/frontend/src/routes/traces-route.tsx`
- `apps/frontend/src/routes/live-route.tsx`
- `apps/frontend/src/features/traces/`
- `apps/frontend/src/features/telemetry/`

Write scope:

- `apps/frontend/src/routes/traces-route.tsx`
- `apps/frontend/src/routes/live-route.tsx`
- `apps/frontend/src/features/traces/`
- `apps/frontend/src/features/telemetry/facet-panel.tsx`
- `apps/frontend/src/lib/url-filters.ts`
- Trace/live tests and e2e specs.

Tasks:

- Remove route-visible preset strip and facet distribution chart from `/traces`.
- Build one shared trace table used by History and Live.
- Add operation/root span column, trace ID copy, compact duration bar, keyboard `Enter`, and copy URL actions.
- Move live controls into trace route header: stream status, pause/resume, clear buffer, copy live URL.
- Use active removable filter chips in both modes.
- Keep live filters server-side through `LiveTraceInput`.

Acceptance:

- `/traces` has `History`/`Live` mode control and one table model.
- Live mode does not render a second route header or unrelated event table columns.
- No separate live nav or route is introduced.
- No local aggregate counts are computed.

Verification:

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/live-route.test.ts apps/frontend/src/features/telemetry/query-presets.test.ts`
- `bun run --cwd apps/frontend build`
- Playwright at 390px, 768px, 1024px, 1440px for `/traces` and `/traces?mode=live`.

## FEUX-04: Trace Detail Workspace

Owner: frontend trace-investigation agent.

Depends on: FEUX-01, FEUX-02.

Read scope:

- `specs/05-frontend/traces-and-metrics-ux-concept.md`
- `plans/frontend-ux-concepts/traces-metrics-ux.html`
- `apps/frontend/src/routes/trace-detail-route.tsx`
- `apps/frontend/src/features/traces/`

Write scope:

- `apps/frontend/src/routes/trace-detail-route.tsx`
- `apps/frontend/src/features/traces/`
- Trace detail tests and e2e specs.

Tasks:

- Add breadcrumb/back row above trace headline.
- Move trace identity into waterfall header.
- Remove service breakdown strip from the default layout.
- Add Waterfall/Flow view switch.
- Implement owned trace flow graph with pan, zoom, reset, fullscreen overlay, branching layout, and span selection sync.
- Add horizontally resizable waterfall/log split with logs below waterfall.
- Remove `Overview` and `Logs` inspector tabs.
- Implement inspector tabs `Attributes`, `Events`, `Exceptions`, `Links`.
- Replace raw JSON attributes with compact evidence browser.
- Implement span link grouping/actions/copy behavior.
- Replace ok/error span status badges with spec styling.

Acceptance:

- Waterfall is first and fills the primary workspace.
- Flow graph, waterfall row, URL `spanId`, inspector, and selected-span logs stay synchronized.
- Logs panel supports `Selected span` and `Whole trace`.
- Attributes are compact, grouped, searchable, and copyable.
- Linked traces never search other projects.

Verification:

- `bun run --cwd apps/frontend typecheck`
- Trace-detail unit tests for span selection, link actions, attribute grouping, and logs scope.
- Playwright visual checks for `/traces/:traceId` at 390px, 768px, 1024px, 1440px.
- Canvas/SVG nonblank checks for flow view and fullscreen flow.

## FEUX-05: Logs Workspace

Owner: frontend logs agent.

Depends on: FEUX-01, FEUX-02.

Read scope:

- `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`
- `plans/frontend-ux-concepts/logs-metrics-dashboards-ux.html`
- `apps/frontend/src/routes/logs-route.tsx`
- `apps/frontend/src/features/logs/`

Write scope:

- `apps/frontend/src/routes/logs-route.tsx`
- `apps/frontend/src/features/logs/`
- Shared evidence attribute component only if FEUX-01 exposes it.
- Log tests and e2e specs.

Tasks:

- Convert selected log and inspector tab to URL state.
- Convert inspector to Body/Attributes/Correlation tabs.
- Add copy log ID, trace ID, span ID, body, attribute key, and attribute value actions.
- Hide inline row expansion on desktop; keep it only for narrow layouts.
- Keep filters in filter bar and active chips, with no permanent service rail.
- Move route copy to i18n.

Acceptance:

- `/logs` is a large searchable table with resizable right inspector.
- Selected row updates URL state.
- Correlated trace/span actions open project-scoped trace detail.
- Missing correlation keeps log inspection available and disables trace actions with reason.

Verification:

- `bun run --cwd apps/frontend typecheck`
- Log route and inspector tests.
- Playwright desktop/mobile checks for `/logs`.

## FEUX-06: Metrics Explorer

Owner: frontend metrics agent.

Depends on: FEUX-01, FEUX-02.

Read scope:

- `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`
- `specs/02-capabilities/metrics/query-metrics.md`
- `apps/frontend/src/routes/metrics-route.tsx`
- `apps/frontend/test/metrics-route.test.ts`

Write scope:

- `apps/frontend/src/routes/metrics-route.tsx`
- New components under `apps/frontend/src/features/metrics/`
- Metrics tests and e2e specs.

Tasks:

- Remove `viewId` cleanup.
- Move all copy to i18n.
- Add kind and temporality filters.
- Render metric list rows with descriptor metadata and attribute key count.
- Convert group-by to descriptor-key multi-select.
- Add metric inspector tabs: Descriptor, Attributes, Series, Exemplars.
- Add exemplar trace/span pivots.
- Use setup empty state for no metrics.

Acceptance:

- `/metrics` is a technical explorer, not dashboard editing.
- Controls map directly to `MetricSeriesInput`.
- Invalid backend combinations render inline GraphQL errors.
- No arbitrary frontend-calculated aggregations are introduced.

Verification:

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/metrics-route.test.ts`
- Playwright desktop/mobile checks for `/metrics`.

## FEUX-07: Dashboards Workspace

Owner: frontend dashboards agent.

Depends on: FEUX-01, FEUX-02.

Read scope:

- `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`
- `specs/05-frontend/dashboard-widgets.md`
- `specs/02-capabilities/metrics/manage-dashboards.md`
- `apps/frontend/src/routes/dashboards-route.tsx`
- `apps/frontend/src/lib/dashboard-contracts.ts`

Write scope:

- `apps/frontend/src/routes/dashboards-route.tsx`
- New components under `apps/frontend/src/features/dashboards/`
- Dashboard tests and e2e specs.

Tasks:

- Replace all `window.confirm` usage with dialogs.
- Move all copy to i18n.
- Use one right inspector/editor; remove duplicate widget details sheet on desktop.
- Implement dashboard rail with pinned, built-in, personal, and project groups.
- Add widget creation for metric, log, trace, and live trace table widgets.
- Implement Data, Display, Thresholds editor groups.
- Respect 12-column widget layout including `x`, `y`, `w`, `h`, `minW`, and `minH`.
- Add explicit dirty state and discard confirmation on dashboard switch/project switch.

Acceptance:

- Users can view, create, edit, arrange, save, duplicate, delete, pin, and unpin dashboards.
- Built-ins are read-only; editing creates a draft that must be saved as a new dashboard.
- Widget configs remain typed and never store executable code or arbitrary JSON.
- Delete uses destructive confirmation.

Verification:

- `bun run --cwd apps/frontend typecheck`
- Dashboard route tests for save/delete/pin/dirty behavior.
- Playwright desktop/mobile checks for `/dashboards`.

## FEUX-08: AI Eval Alignment

Owner: frontend AI-eval agent.

Depends on: FEUX-01, FEUX-02.

Read scope:

- `specs/05-frontend/ai-eval-views.md`
- `specs/05-frontend/product-ux-concept.md`
- `apps/frontend/src/routes/ai-eval-route.tsx`
- `apps/frontend/src/features/ai-eval/`

Write scope:

- `apps/frontend/src/routes/ai-eval-route.tsx`
- `apps/frontend/src/features/ai-eval/`
- AI Eval tests and e2e specs.

Tasks:

- Convert AI Eval to route frame with left rail/tabs, main workspace, and right inspector.
- Remove route-primary cards.
- Store selected run/dataset/scorer/experiment/annotation in URL state.
- Ensure no frontend score, cost, token, or regression calculations are introduced beyond view model rendering.
- Move all tab status values and labels through i18n.

Acceptance:

- AI Eval follows the same product shell and inspector grammar as telemetry routes.
- Trace pivots preserve project context.
- Feature-disabled state hides primary navigation and direct route shows a disabled state.

Verification:

- `bun run --cwd apps/frontend typecheck`
- `bun test apps/frontend/test/ai-eval-view-model.test.ts`
- Playwright checks for `/ai-eval` when enabled.

## FEUX-09: Cross-Route QA And Cleanup

Owner: frontend QA agent.

Depends on: FEUX-03 through FEUX-08.

Read scope:

- All changed frontend files.
- All UX concept files.
- `DESIGN.md`.

Write scope:

- Tests only unless a defect belongs to no clear owning ticket.
- `apps/frontend/e2e/`
- `apps/frontend/test/`
- QA notes in `plans/frontend-ux-migration-check/`

Tasks:

- Run route matrix at desktop, tablet, and mobile.
- Verify topbar always visible.
- Verify sidebar/content/inspector scroll independently.
- Verify no raw visible strings in changed route files.
- Verify no route-primary card wrappers.
- Verify no `/live` nav entry, no `MetricView`, no `viewId`.
- Verify dialogs, drawers, popovers, collapsibles are used according to surface taxonomy.

Acceptance:

- All route-specific acceptance criteria pass.
- Visual screenshots match the concept direction: flat, focused, no bloat, no card-in-card, no custom control colors.
- Any remaining defects are assigned to owning route agents before completion.

Verification:

- `bun run --cwd apps/frontend typecheck`
- `bun run --cwd apps/frontend build`
- `bun test apps/frontend/test`
- `bun run --cwd apps/frontend smoke`
- `rg -n "window.confirm|MetricView|metricView|viewId|path=\"/live\"|rounded-xl|shadow-sm" apps/frontend/src`
