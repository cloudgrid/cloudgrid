---
title: Frontend UX Gap Audit
status: historical-audit-superseded-by-approved-planning
updated: 2026-05-15
---

# Frontend UX Gap Audit

## Method

I compared the current implementation against the UX source files and the concept HTML prototypes. I also rendered the Vite app at `http://127.0.0.1:5173` for `/projects`, `/projects/default`, `/projects/default/settings/ingest`, `/traces`, `/traces?mode=live`, `/logs`, `/metrics`, and `/dashboards`.

The local render was limited by BFF `502` responses, so populated telemetry screens could not be visually verified end to end. Static code inspection was therefore used as the primary source for populated route behavior.

## Severity

- P0: blocks autonomous implementation because specs/plans conflict or required architecture is unclear.
- P1: visible product UX does not match the approved concept and should be fixed before claiming UX migration complete.
- P2: consistency, polish, accessibility, translation, or maintainability drift.

## P0 Findings

### P0-01: Readiness Gate Blocks Executable Agent Tickets

Resolution:

- Superseded by `plans/frontend-ux-migration-check/04-planning-gate-and-spec-drift.md`.
- `specs/.readiness-report.yaml` is now approved for frontend alignment planning.

Historical impact:

- Autonomous agents previously could not treat this package as ready-to-run tickets.

Current action:

- Generate executable AFK tickets from `02-agent-remediation-plan.md` with one owner, one write scope, route-specific tests, and visual QA.

### P0-02: Existing UX V2 Migration Plan Is Stale And Conflicts With Current Specs

Observed:

- `specs/99-reviews/frontend-ux-v2-migration-plan.md` says the sidebar order includes `Live` and contains a dedicated `Live Workspace` ticket.
- Current source specs say Live is not a primary sidebar entry and is only a mode inside `/traces`.

Spec references:

- `specs/05-frontend/product-ux-concept.md`: project sidebar order is `Overview`, `Traces`, `Logs`, `Metrics`, `Dashboards`, `AI Eval`, with `Project settings` separated.
- `specs/05-frontend/traces-and-metrics-ux-concept.md`: `/traces` owns history and live modes; no separate `/live` route in the UX concept.

Impact:

- Agents following the old review plan will reintroduce stale navigation and route ownership.

Required action:

- Mark the old review plan superseded or rewrite it from this audit before execution.
- Agent tickets must cite the current concept files, not the stale plan.

## Global Shell And Navigation

### P1-01: Project Settings Drops Out Of The Project Sidebar Shell

Observed:

- `apps/frontend/src/routes/app-shell.tsx:83-85` explicitly excludes project settings routes from `showProjectWorkspace`.
- Project settings then renders its own sidebar inside `ProjectSettingsShell`, while the global project/domain sidebar disappears.

Expected:

- Project-scoped work uses the global topbar plus a project/domain sidebar.
- `Project settings` is the separated bottom entry in the project sidebar.
- Settings can have a secondary settings rail inside the route body, but project context navigation must remain stable.

Required migration:

- Remove the project-settings exclusion from the project workspace sidebar.
- Keep project sidebar visible for `/projects/:projectId/settings/*`.
- Render settings sections as a secondary route rail inside the content region, not as a replacement for global project navigation.

### P1-02: Mobile Domain Navigation Is Missing

Observed:

- Project and admin sidebars are `hidden` below `lg` in `apps/frontend/src/routes/app-shell.tsx:315` and `385`.
- There is no mobile menu/sheet containing company/project switcher and route navigation.

Expected:

- Mobile topbar has a menu button.
- The menu opens a left sheet with company/project switcher first, then route navigation, then settings/help/user actions.

Required migration:

- Add a responsive mobile menu sheet in `AppShell`.
- Use the same route list and dashboard shortcut model as desktop.
- Add tests at 390px and 768px widths.

### P1-03: Dashboard Sidebar Children Are Always Expanded, Not Collapsible

Observed:

- `apps/frontend/src/routes/app-shell.tsx:354-367` renders all custom dashboard children whenever data exists.

Expected:

- `Dashboards` primary entry is collapsible.
- Pinned dashboards may appear above primary navigation.
- Collapsed state is local presentation state.

Required migration:

- Add a collapsible dashboard group under the `Dashboards` entry.
- Keep parent `/dashboards` link visible.
- Child entries open `/dashboards?dashboard=<dashboardId>`.

### P1-04: Route Shell Still Allows Page-Level Scrolling As The Normal Container

Observed:

- The main route outlet uses `overflow-y-auto` in `apps/frontend/src/routes/app-shell.tsx:430-438`.
- Multiple routes then also use fixed `h-[calc(100vh-5.5rem)]`.

Expected:

- Topbar, sidebar, route header, filter bars, workspace body, and inspectors scroll independently.
- Populated telemetry routes must not rely on page-level scroll.

Required migration:

- Introduce a shared `RouteFrame` or `WorkspacePage` with stable height from the shell rather than per-route viewport math.
- Route bodies own internal scroll containers.
- Browser viewport scroll should remain stable on populated data routes.

## Visual System And Copy

### P1-05: Hard-Coded User-Visible Copy Remains In Routes

Observed examples:

- `apps/frontend/src/routes/traces-route.tsx:188-196`: `History`, `Live`.
- `apps/frontend/src/routes/metrics-route.tsx:168-170`, `218`, `274-281`, `429-431`, `555-560`: route headings, placeholders, empty states, table labels.
- `apps/frontend/src/routes/dashboards-route.tsx:88`, `100`, `132-179`, `243`, `280-303`, `376-384`, `491`, `533-572`, `619-626`, `644`, `671`.
- `apps/frontend/src/features/logs/log-table.tsx:129-131`, `146-149`, `178`.

Expected:

- All visible copy goes through the frontend translation layer.

Required migration:

- Move all visible route strings to `apps/frontend/src/lib/i18n.ts`.
- Add a lint/test check that fails on raw strings in route files except IDs, metric names, and code snippets.

### P1-06: Native Browser Confirm Is Used Instead Of Dialogs

Observed:

- `apps/frontend/src/routes/dashboards-route.tsx:88` uses `window.confirm` for discarding dashboard edits.
- `apps/frontend/src/routes/dashboards-route.tsx:117` uses `window.confirm` for delete.

Expected:

- Confirmation, warning, information, and error interruptions use modal dialogs only.

Required migration:

- Replace both confirms with shadcn `Dialog`.
- Delete dashboard uses destructive styling only inside the confirmation.
- Discard confirmation is shared for project switch, dashboard switch, and route leave when dirty.

### P1-07: Flat Design Is Undermined By Card Components And Nested Borders

Observed:

- Project cards use shadcn `Card`, whose base class has `rounded-xl` and `shadow-sm`.
- AI Eval uses `Card` for route details at `apps/frontend/src/routes/ai-eval-route.tsx:285-297`.
- Several route-primary or inspector-adjacent surfaces use nested rounded/bordered sections.

Expected:

- Flat, border-led, no custom shadows.
- Route-primary workspaces are not cards.
- Cards are allowed only for repeated selectable items, contained summaries, and modal/drawer content, and radius must stay at 8px or less.

Required migration:

- Either override `Card` for CloudGrid radius/shadow globally or avoid `Card` in app workspaces.
- Keep project cards as selectable repeated items but remove shadow and excessive radius.
- Remove nested card-in-card patterns in AI Eval, dashboards, trace detail, and setup.

## Project Selection, Home, And Settings

### P1-08: Local Default Project Is Present But Not Selected In Fallback Viewer

Observed:

- `createLocalViewer()` creates a `Personal` company and `Default project`, but returns `selectedProject: null` in `apps/frontend/src/lib/session-state.ts:62-94`.
- Direct telemetry routes render the project-required guard even though local mode has one project available.

Expected:

- Project selection remains the main entry task, but single-instance local should feel direct and low friction.
- When a local default project is visible but not selected, the project picker must make the next action obvious and not trap users behind a BFF select failure in fallback mode.

Required migration:

- Decide in spec whether local fallback should auto-select the only project or require explicit select.
- Until the spec is changed, keep explicit selection but ensure the fallback selection flow works without a running BFF or shows one clear setup/unavailable state.

### P1-09: Project Settings Lacks The Required Breadcrumb Pattern

Observed:

- `ProjectSettingsRoute` uses `RouteHeader` only; no navigation row with Back plus breadcrumb.

Expected:

- Settings subsections require breadcrumbs above the headline.
- Back button and parent breadcrumb must navigate to the same parent and preserve state.

Required migration:

- Add shared `BreadcrumbRow`.
- Use `Projects / <project> / Settings / <section>` on project settings pages.

### P1-10: Ingest Credential Revoke Is Immediate Destructive Action

Observed:

- `apps/frontend/src/routes/control-plane-routes.tsx:1278-1284` calls `revokeMutation.mutate` directly from a destructive icon button.

Expected:

- Destructive credential revocation requires a confirmation dialog.
- Destructive styling belongs at confirmation/action point.

Required migration:

- Add revoke confirmation dialog with credential title/preview.
- Keep full API key secret hidden except one-time creation state.

## Traces And Live Mode

### P1-11: `/traces` Still Has Extra Demo-Oriented Surfaces

Observed:

- `QueryPresetBar` is rendered directly under filters at `apps/frontend/src/routes/traces-route.tsx:83-90`.
- A facet distribution chart is shown before the facet panel at `apps/frontend/src/routes/traces-route.tsx:139-144`.

Expected:

- `/traces` has route header, History/Live mode, filter bar, active chips, facet rail/drawer, and trace table workspace.
- No extra charts or saved-query demo strip unless explicitly specified by the route concept.

Required migration:

- Remove route-visible preset bar or move preset actions into command palette/overflow if still desired by spec.
- Remove facet distribution chart from trace search.
- Keep facet rail as suggestions only.

### P1-12: Live Mode Does Not Share The Same Trace Table Model

Observed:

- `/traces?mode=live` embeds `LiveRoute` from `apps/frontend/src/routes/traces-route.tsx:70-75`.
- `LiveRoute` renders its own filter grid and event columns in `apps/frontend/src/routes/live-route.tsx:218-366`.

Expected:

- History and Live render the same trace table columns, row interactions, selected-row styling, filter chips, and trace detail route.
- Live-specific controls are stream status, pause/resume, clear buffer, and copy live URL.

Required migration:

- Extract a shared `TraceTable` row/table model used by history and live.
- Move live controls into the `/traces` route header.
- Remove live-only event columns from the primary row table unless the spec adds them.

### P1-13: Trace Table Is Missing High-Signal Row Behavior

Observed:

- `TraceTable` lacks operation/root span column and trace ID copy action.
- Row click navigates, but keyboard `Enter` is not handled.
- Duration is text-only, no compact duration bar.

Expected:

- Service marker, operation/root span, trace ID with copy, started, duration text/bar, status, span/error/log/service counts.
- Keyboard focus opens row with `Enter`.
- Copy action must not trigger row navigation.

Required migration:

- Extend the row component to match the spec.
- Add copy URL/trace ID actions.
- Add keyboard activation and tests.

## Trace Detail

### P1-14: Trace Detail Does Not Use The Approved Breadcrumb/Header Pattern

Observed:

- Header is a bordered section at `apps/frontend/src/features/traces/trace-detail-view.tsx:693-737`.
- Back button sits inside that bordered header and there is no breadcrumb.

Expected:

- Navigation row above headline: icon-only Back first, breadcrumb second.
- Back and `Traces` breadcrumb return to trace search preserving URL state.
- Trace identity appears as compact context inside the waterfall header, not as a separate summary card.

Required migration:

- Add shared breadcrumb/back row.
- Move trace context into the waterfall workspace header.
- Preserve previous search state through URL or history state.

### P1-15: Inspector Tabs Do Not Match The Spec

Observed:

- Detail tabs include `overview` and `logs` at `apps/frontend/src/features/traces/trace-detail-view.tsx:70-72`.
- Logs render inside the span inspector via `RelatedLogsTable`.
- Attributes use raw `JsonViewer`.

Expected:

- Inspector tabs are `Attributes`, `Events`, `Exceptions`, `Links`.
- No `Overview` tab; summary facts belong in the inspector header/summary area.
- Logs live below the waterfall in a horizontally resizable split.
- Attributes use the compact evidence browser with semantic groups and copy-per-row actions.

Required migration:

- Remove `overview` and `logs` inspector tabs.
- Build `SpanEvidenceAttributes` and reuse it for logs.
- Add a dedicated trace logs panel below waterfall with `Selected span` and `Whole trace` modes.

### P1-16: Flow View Is Missing

Observed:

- No flow view mode, graph nodes, zoom/pan controls, or fullscreen overlay exist in `trace-detail-view.tsx`.

Expected:

- Waterfall/Flow view switch.
- Immutable trace graph generated from the trace detail view model.
- Node click syncs selected span, waterfall row, URL `spanId`, logs, and inspector.
- Zoom in/out/reset, pan, and fullscreen overlay.

Required migration:

- Implement owned SVG/CSS trace graph primitives, not React Flow.
- Add sync tests and Playwright visual checks.

### P1-17: Service Breakdown Strip Violates The Trace Detail Concept

Observed:

- `TraceTimelinePanel` renders `TraceServiceBreakdown` above the waterfall at `apps/frontend/src/features/traces/trace-detail-view.tsx:605-615`.

Expected:

- No separate service-percentage strip above the waterfall.
- Service information belongs in span rows, inspector, or a future explicitly specified section.

Required migration:

- Remove the strip from default trace detail.
- If service filtering is still needed, expose it through span filters or inspector context.

### P1-18: Span Status Styling Is Not Aligned

Observed:

- Span rows render status with `Badge` in `trace-tree-waterfall.tsx`.

Expected:

- Ok spans show plain `ok` text with no badge/background.
- Error spans show red text, status marker, and error icon without a badge background.

Required migration:

- Replace span status badges with text-plus-icon styling.
- Keep color accessible in light/dark themes.

### P1-19: Linked Trace/Span Handling Is Too Thin

Observed:

- `LinksTable` only displays trace ID, span ID, and direction.

Expected:

- Same-trace links select span.
- Cross-trace links open current-project trace detail.
- Unavailable links remain copyable references.
- Link attributes use the same evidence browser pattern.
- Link markers in waterfall/flow open Links tab only when marker clicked.

Required migration:

- Implement link grouping and actions from `traces-and-metrics-ux-concept.md`.
- Add tests for same-trace selection and cross-trace navigation.

## Logs

### P1-20: Log Inspector Does Not Use The Required Tabs Or Evidence Browser

Observed:

- `LogInspector` is a vertical set of Body, Attributes, Correlation sections.
- Attributes use raw `JsonViewer`.
- No copy log ID control.
- Several labels are hard-coded.

Expected:

- Inspector tabs: Body, Attributes, Correlation.
- Attributes use compact evidence-browser pattern.
- Copy log ID, trace ID, span ID, body, attribute key, and attribute value actions.

Required migration:

- Convert inspector to tabbed detail panel.
- Add compact attributes component and copy actions.
- Move all copy to i18n.

### P1-21: Selected Log Is Local State Only

Observed:

- `selectedLogId` initializes from URL but `selectLog()` only calls `setSelectedLogId` at `apps/frontend/src/routes/logs-route.tsx:62-64`.

Expected:

- URL state preserves selected log ID and inspector tab.

Required migration:

- Write selected log ID and inspector tab back to query params.
- Preserve filters when pivoting to trace/span and returning.

### P2-01: Log Row Expansion Duplicates Inspector Responsibility

Observed:

- Log rows always offer inline expansion at `apps/frontend/src/features/logs/log-table.tsx:88-116`.

Expected:

- Inline expansion is only for narrow screens when inspector is unavailable.

Required migration:

- Hide inline expand controls on desktop.
- Keep mobile row expansion or bottom sheet behavior.

## Metrics

### P1-22: Metric Explorer Is Structurally Close But Not Product-Ready

Observed:

- Metric route has list, query surface, and inspector, but copy is hard-coded.
- Time inputs are raw ISO text fields.
- Group-by/filter controls are plain text inputs rather than descriptor-key choices.
- Inspector has sections, not the specified tabs.
- Exemplar view is embedded in point rows, not an inspector tab.

Expected:

- Metric list search with service/kind/temporality filters.
- Metric list rows include description, kind, unit, temporality, monotonic, first/last seen, attribute key count.
- Query controls map directly to `MetricSeriesInput`, with group-by limited to descriptor keys.
- Inspector tabs: Descriptor, Attributes, Series, Exemplars.
- No metrics empty state primary action is `Open metrics setup`.

Required migration:

- Build metric list, query, result, and inspector as separate components.
- Convert group-by to descriptor-key multi-select.
- Add exemplar tab and trace/span pivot actions.
- Move all strings to i18n.

### P1-23: Metric Route Still Carries `viewId` Compatibility Cleanup

Observed:

- `selectMetric()` deletes `viewId` at `apps/frontend/src/routes/metrics-route.tsx:156-160`.

Expected:

- MetricView compatibility surfaces must be removed, not aliased.

Required migration:

- Remove `viewId` handling from metrics route and tests.
- Search for remaining `MetricView`, `metricView`, and `viewId` usage.

## Dashboards

### P1-24: Dashboard Editor Does Not Match Drawer/Inspector Contract

Observed:

- Route renders a right `WidgetInspector` and also opens a `Sheet` for widget details at `apps/frontend/src/routes/dashboards-route.tsx:228-251`.
- Widget inspector is mostly summary fields and minimal draft name/visibility fields.

Expected:

- Right inspector is the single details/editor surface.
- Editor groups: Data, Display, Thresholds.
- Closing dirty inspector prompts discard confirmation.

Required migration:

- Remove duplicate widget details `Sheet` on desktop.
- Implement inspector modes for dashboard details and widget editor.
- Use dialogs only for discard/delete confirmations.

### P1-25: Dashboard Widgets Are Not Feature-Complete

Observed:

- `addMetricWidget()` only creates a hard-coded metric widget at `apps/frontend/src/routes/dashboards-route.tsx:663-688`.
- Log, trace, and live trace widgets render only summaries unless already present.
- Widget grid ignores `x`, `y`, `h`, `minW`, and `minH` for arrangement.

Expected:

- Users can create metric time series/stat/table, log table, trace table, and live trace table widgets.
- Saved widgets map to typed input configs only.
- Canvas is a bounded 12-column grid with integer layout fields.

Required migration:

- Add widget creation menu with supported widget kinds only.
- Implement typed editors and previews for metric, log, trace, and live widgets.
- Respect layout object for arrangement and minimum sizes.

### P1-26: Dashboard Actions And Copy Are Not Aligned

Observed:

- Delete button is outline instead of destructive-confirmation flow.
- Duplicate/save/delete/create copy is hard-coded.
- Pin/unpin aria labels are hard-coded.

Expected:

- One primary action per visible action group.
- Destructive styling appears in delete confirmation.
- All visible copy uses i18n.

Required migration:

- Normalize action hierarchy in dashboard route header.
- Move utilities to overflow where needed.
- Translate all copy.

## AI Eval

### P1-27: AI Eval Is Still A Route Demo, Not The Approved Workspace Shape

Observed:

- AI Eval uses top-level tabs and card-style detail blocks.
- Selected state is local, not URL state for detail/inspector.
- No right inspector surface for run/scorer/annotation/experiment detail.

Expected:

- Left rail or tabs for Runs, Experiments, Datasets, Scorers, Annotations.
- Main list/detail workspace.
- Right inspector for detail.
- Frontend must not compute scores/costs/token totals beyond GraphQL view model rendering.

Required migration:

- Rework AI Eval into the same route frame and inspector pattern as other project workspaces.
- Remove cards from route-primary details.
- Preserve selection in URL state.

## Test And QA Gaps

### P1-28: Visual/UX Regression Coverage Is Too Narrow

Observed:

- Existing tests include shell, projects, live, metrics, and smoke basics.
- No comprehensive route visual checks exist for trace detail flow/log split, dashboard editor, logs inspector tabs, metric inspector tabs, mobile sidebar, or breadcrumb behavior.

Expected:

- Playwright visual checks cover desktop/tablet/mobile for `/projects`, project settings, `/traces`, `/traces/:traceId`, `/logs`, `/metrics`, `/dashboards`, and `/ai-eval` when enabled.
- Tests assert no telemetry nav before project selection, no stale `/live` nav, no raw `MetricView` route state, and no hard-coded visible copy in changed files.

Required migration:

- Add route-level Playwright specs and component/unit tests per `02-agent-remediation-plan.md`.
- Add smoke fixtures or mocked GraphQL responses for populated states.
