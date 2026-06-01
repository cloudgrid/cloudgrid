---
id: TEC-FE-016
title: Enterprise product UX concept
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-29
provenance: user-requested
depends_on: [TEC-FE-006, TEC-FE-001, TEC-FE-002, TEC-FE-004, TEC-FE-005, TEC-FE-007, TEC-FE-013, TEC-FE-015, DSY-001]
---

# Enterprise Product UX Concept

## Intent

CloudGrid is an enterprise-focused operational workspace for project-scoped OpenTelemetry traces, logs, metrics, live trace receiving, and AI evaluation workflows. The UI must feel like a real product used repeatedly during incident investigation and agent optimization, not a collection of unrelated route demos.

`product-experience-contract.md` is the concise implementation contract for frontend information architecture, onboarding, route layout, panel behavior, action availability, and interaction patterns. This file remains the expanded UX concept and rationale. When either file conflicts with older frontend prose, update the older file before implementation.

Public website pages in `website/` follow the repo design system but are not product app routes. Their marketing hero treatment is intentionally limited: generated, realistic enterprise/product collage imagery belongs only in the first hero section of non-handbook pages; the rest of the page returns to flat white or neutral sections. Handbook pages and subpages remain plain documentation pages. Website hero text and CTA placement must stay aligned across home, feature, and enterprise routes, and hero art must not be replaced by gradients, procedural SVGs, abstract blobs, generic placeholders, or separate right-side mockup components. Marketing feature lists and related-page navigation should use editorial stacks, alternating image/text rows, ruled lists, or image-led strips instead of generic card grids. Non-handbook marketing pages should introduce the decision-maker or operator problem first, explain CloudGrid's concrete product help, then link to deeper detail instead of repeating the same capability catalog across pages.

Trace search and trace detail behavior is specified in [Traces and metrics UX concept](./traces-and-metrics-ux-concept.md). Log search, metric exploration, and dashboard composition behavior is specified in [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md). Those specs own concrete visualization placement, detail behavior, and route-specific inspectors while this file continues to own the global shell and surface taxonomy.

External product-pattern inputs applied:

- W3C WCAG 2.2 navigation, focus, target-size, redundant-entry, and accessible-authentication criteria.
- Material navigation principles: organize by user tasks, prioritize frequent paths, and keep navigation predictable.
- Atlassian empty-state pattern: empty states must tell users what can happen next.

## Adaptive Input Model

Create, settings, filtering, and setup forms must minimize user decisions and
prevent invalid combinations before submit.

Rules:

- Forms start from a valid draft whenever CloudGrid can infer one from the
  selected source entity, project settings, backend defaults, or domain
  defaults.
- The UI uses constrained controls for constrained data. Users select known
  projects, datasets, splits, statuses, metric presets, target kinds, runtime
  modes, adapters, provider profiles, and enum values from rendered options.
- Text inputs are limited to human-authored names, descriptions, search terms,
  labels, raw JSON/code, and explicit advanced `Custom` branches.
- A controlling selection owns its dependent form shape. For example, choosing a
  JSON value type shows JSON schema controls; choosing text hides them; choosing
  an external adapter shows adapter readiness; choosing managed harness hides
  adapter URL/ref controls.
- Inapplicable fields are hidden. Required-but-unavailable fields are visible
  only when the current task logically needs them, and then show the setup path.
- Changing a controlling field clears or recomputes invalid dependent values
  immediately and explains the change inline.
- Form errors are written for self-service correction: what failed, what value
  is accepted, and where the user can fix it. Error summaries link or focus the
  first invalid visible field.
- Advanced/custom settings are progressive disclosure. They must not appear in
  first-run flows unless the selected option requires them.

This model is mandatory for project creation, project settings, ingest setup,
dashboard editing, AI provider settings, AI Eval datasets/evaluations/
optimizations, alert rules, and adapter settings. Route-specific specs may add
controls and defaults, but they must not weaken this behavior.

## Product Model

CloudGrid has three durable user concepts:

- Company: the administrative ownership boundary. Local single-instance mode has exactly one visible company named `Personal`.
- Project: the telemetry and evaluation workspace boundary. Every trace, log, dashboard, live subscription, and AI-eval entity is scoped to exactly one selected project.
- Investigation: the user task inside a selected project, such as watching live traces in the trace workspace, searching traces, analyzing logs, reading metrics, or running evaluation workflows.

The UI must never make users choose telemetry routes before they have a project context. Project selection is the main entry task.

## User Roles And Primary Jobs

Primary users:

- Local developer: runs CloudGrid locally, creates a `Personal` project, sends OTLP data, and debugs a local service or agent.
- Team engineer: belongs to one or more companies, switches projects, investigates trace/log/metric evidence, and shares URLs with teammates.
- Platform/admin user: creates projects, manages members, checks ingestion setup, and protects company/project boundaries.
- AI-agent engineer: inspects datasets, evaluations, runs, metrics,
  comparisons, trace-backed evidence, and optimization output.

Primary jobs in priority order:

1. Choose or create the project where telemetry belongs.
2. Send the first telemetry signal into that project.
3. Confirm data is arriving.
4. Investigate a live or historical behavior problem.
5. Pivot between trace, log, metric, dashboard, AI Chat, and AI-eval evidence without losing project context.
6. Save reusable dashboard and evaluation views for the project.
7. Manage project/company settings only when needed.

Navigation, onboarding, and empty states must optimize for this order.

## UX V2 Decisions

The approved UX v2 shell is the implementation target for all new frontend work.

Rules:

- CloudGrid uses one global topbar across authenticated views.
- Licensed whitelabel builds may replace visible product identity through the
  code-level brand contract in `whitelabel-customization.md`, but they must
  preserve this shell model, route taxonomy, navigation ordering, and
  project-first behavior.
- Project-scoped work uses a left sidebar for project/domain navigation.
- Project selection is a centered picker, not a full dashboard route with telemetry navigation.
- Project selection cards render only GraphQL `Project.telemetry` values enriched by the BFF from storage-read. They must not use hardcoded zeros, frontend-side telemetry queries, or browser-local telemetry summaries.
- Project settings use dedicated settings pages under the selected project.
- Company/admin settings use a separate admin settings shell.
- Content regions own their own scrolling; the app must not rely on one full-page scroll for dense telemetry surfaces.
- Confirmation, information, warning, and error interruptions use modal dialogs only.
- Local mode uses a `Personal` company and exposes only useful company admin
  surfaces for that durable boundary: projects, members, and AI provider
  settings. It must not expose destructive company deletion, owner-transfer,
  billing, or orphaning flows.

## Information Architecture

### Shell Modes

The app shell has three modes.

Project selection mode:

- Applies when the current route is `/projects` or when a project-scoped route is requested without a selected project.
- Topbar shows CloudGrid identity/home, company dropdown when applicable, project dropdown with `Select project` when no project is selected, command/search button, theme/language controls when implemented, and user menu.
- Telemetry navigation entries `AI Chat`, `Traces`, `Logs`, `Metrics`, `Dashboards`, and `Evaluations` are hidden.
- Main content is a centered project picker with company context, search/filter, rich selectable project cards, create action when authorized, and local onboarding prompt when applicable.
- The project picker must be horizontally centered in the remaining viewport and must not use a left navigation sidebar.

Project workspace mode:

- Applies after `viewer.selectedProject` exists and the route is project-scoped.
- Global topbar shows CloudGrid identity/home, company dropdown, project dropdown, command/search button, help/setup entry, theme/language controls when implemented, and user menu.
- A left project/domain sidebar owns primary project navigation.
- Sidebar order is `AI Chat` when enabled, pinned dashboard shortcuts when present, then `Traces`, `Logs`, `Metrics`, `Dashboards`, `Evaluations` when enabled, and a separated `Project settings` entry.
- The project sidebar must not repeat the selected company/project summary. The global topbar owns company and project context with dropdown selectors.
- Pinned dashboard shortcuts may appear below `AI Chat` and above the primary telemetry navigation when explicit user dashboard preference data exists.
- The `Dashboards` entry may be expanded to show custom dashboards available to the current user; the parent entry still opens the dashboard workspace.
- `Live` is not a primary sidebar entry. Live receiving is a mode inside `/traces` because it uses the same trace row model, filters, and trace detail route.
- The active route uses a selected rail state and text label. Collapsed sidebar state may hide labels on desktop but must preserve tooltips and accessible names.
- Company settings are reached from a compact global topbar action for company
  admins. Company/member administration must not be mixed into project telemetry
  navigation.

Admin settings mode:

- Applies to company and administrative routes: `/organizations`, `/organizations/:organizationId`, `/organizations/:organizationId/projects`, `/organizations/:organizationId/members`, and specified billing/security/audit routes.
- Global topbar remains visible.
- A dedicated admin settings sidebar replaces the project/domain sidebar.
- Admin sidebar groups are `Projects`, `Members`, `AI Provider` when AI Chat is
  enabled, and explicitly specified admin-only sections. The admin sidebar does
  not include separate `Companies` or read-only company overview entries.
- Telemetry navigation remains hidden in admin settings mode.

### Route Groups

Workspace selection routes:

- `/projects`: project selection, project creation entry, local onboarding, and selected-project summary.
- `/projects/new`: project creation page.

Admin settings routes:

- `/organizations`: company list for users in multiple companies.
- `/organizations/:organizationId`: company overview.
- `/organizations/:organizationId/projects`: company-scoped project list and project creation entry.
- `/organizations/:organizationId/members`: company members and roles.
- `/organizations/:organizationId/ai-provider`: company AI Chat provider settings, visible only to company admins.

Project workspace routes:

- `/projects/:projectId`: compatibility redirect that selects the project and navigates to `/traces`.
- `/traces`: trace workspace with `History` and `Live` modes.
- `/traces/:traceId`: trace investigation.
- `/logs`: log search.
- `/metrics`: metric explorer workspace.
- `/dashboards`: dashboard view and editor workspace.
- `/ai-chat`: project-scoped AI Chat assistant, visible when enabled.
- `/alerts`: project alert rules and history workspace. This route remains available by URL, command palette action, alert evidence links, and any explicit alert-management entry points defined by alerting specs, but it is not a primary project sidebar item.
- `/alerts/new`: alert rule creation page.
- `/alerts/:ruleId/settings`: alert rule settings page.
- `/organizations/:organizationId/alert-adapters`: company alert notification
  adapter settings for company admins.
- `/ai-eval`: AI evaluation workspace when enabled.
- `/ai-eval/datasets/new`: dataset creation page when AI Eval is enabled.
- `/ai-eval/datasets/:datasetId/settings`: dataset settings page when AI Eval is enabled.
- `/ai-eval/evaluations/new`: evaluation creation page when AI Eval is enabled.
- `/ai-eval/evaluations/:evaluationId/settings`: evaluation settings page when AI Eval is enabled.
- `/ai-eval/optimizations/new`: optimization creation page when AI Eval is enabled.
- `/ai-eval/optimizations/:optimizationRunId/settings`: optimization settings page when AI Eval is enabled.
- `/projects/:projectId/settings`: project settings page. There is no separate project settings overview subpage.
- `/projects/:projectId/settings/general`: aliases `/projects/:projectId/settings` with the `Identity` tab active when routed explicitly.
- `/projects/:projectId/settings/ingest`: settings item labeled `API Keys`; one concise project setup page with OTLP endpoint, copyable setup snippets, and multiple project ingest API keys.
- `/projects/:projectId/settings/retention`: project-level editable retention policy for each supported data class once backend retention contracts are generated.
- `/projects/:projectId/settings/members`: project-specific members and roles once backend project-membership contracts are generated.
- `/projects/:projectId/settings/ai-providers`: reusable project AI provider profiles and model aliases.
- `/projects/:projectId/settings/ai-eval`: AI Eval policy, budget, sampling, and dataset defaults that reference Project AI Providers.

Route redirects:

- `/` redirects to `/projects` in local mode.
- `/` redirects to `/projects` in deployed mode when authenticated.
- `/` redirects to `/login` in deployed mode when unauthenticated.
- Unknown routes redirect to `/projects` after auth is resolved.

## Global Layout

### Topbar

Desktop topbar:

- Height: 56px.
- Left section width: content-sized, CloudGrid wordmark/home link plus environment badge when not production.
- Center section: company dropdown and project dropdown, each truncating safely, combined minimum width 320px and maximum width 560px, horizontally centered when viewport allows.
- Right section: command button, company settings action for company admins,
  setup/help button, theme/language controls when implemented, user menu.
- The topbar never contains telemetry route tabs in UX v2.

Project selection mode topbar:

- Does not show project telemetry navigation.
- Company selector remains visible when the user belongs to multiple companies.
- Project selector shows `Select project` and opens the centered project picker.

Project workspace left sidebar:

- Width: 240px expanded, 64px collapsed on desktop.
- Contains optional pinned dashboard shortcuts, project/domain navigation, feature-disabled states, and project settings entry. It does not contain a selected project/company summary.
- Does not contain company administration links.
- Owns its own vertical scroll when navigation exceeds viewport height.
- Pinned dashboard shortcuts are shown in a labeled group above primary project navigation, capped at five visible entries, and open `/dashboards?dashboard=<dashboardId>`.
- The `Dashboards` primary entry is collapsible and may reveal custom dashboards the current user can access. Child entries open `/dashboards?dashboard=<dashboardId>`, while the parent opens `/dashboards`.
- Dashboard shortcut pin/unpin state must come from an explicit user preference/read-model contract. Until that contract exists, production UI hides pin/unpin controls and does not persist or imply shared pin state.

Mobile topbar:

- Height: 56px.
- Left: CloudGrid identity and selected project short label.
- Center: omitted.
- Right: command button and menu button.
- Menu opens a left sheet containing company/project switcher first, then route navigation, then settings/help/user actions.

### Page Frame

Every route uses this vertical structure:

1. Topbar.
2. Optional left sidebar in project workspace or admin settings mode.
3. Optional project context strip inside the content region, only when useful for onboarding or setup warnings.
4. Breadcrumb navigation for nested, detail, settings, and multi-step routes.
5. Route header with title, one-line purpose, and primary actions.
6. Route body using one primary working surface.

Breadcrumb rules:

- Breadcrumbs sit above the route headline and below the global topbar/sidebar frame.
- Breadcrumbs are required for detail pages, settings subsections, administration subsections, and any route reached from a list row.
- Breadcrumbs are optional on top-level route entries such as `/projects`, `/traces`, `/logs`, `/metrics`, and `/ai-eval`.
- Breadcrumb entries use domain nouns and current entity labels, such as `Projects / checkout-platform / Settings / API Keys` or `Traces / trc_92ad6f`.
- Project workspace route pages, detail pages, and deep settings subsections use a single navigation row above the headline: icon-only Back button first, breadcrumb second.
- The Back button and the parent breadcrumb entry perform the same parent navigation and preserve URL state.
- Standalone Back buttons must not appear inside unrelated toolbars or at arbitrary panel edges.
- Route toolbars are reserved for actions on the current page or work surface.
- Top-level module create/settings routes may replace the full breadcrumb with a
  compact parent back row when there is exactly one useful parent route, the
  row sits above the headline, and the route header clearly names the entity or
  task. Detail pages and deep administration subsections still render full
  breadcrumbs.

The page frame must not use a card as the route container. Route sections are unframed layout regions. Cards are allowed only for repeated selectable items, contained summaries, and modal/drawer content.

### Grid And Density

Desktop content:

- Page padding: 16px.
- Primary data surfaces fill the remaining viewport height.
- Primary list routes use `minmax(0, 1fr)` grid tracks so tables and timelines scroll internally.
- List headers and timeline headers are sticky inside their scroll container.
- Topbar, sidebar, route header, filter bar, view rail, table body, inspector, and modal body are independent scroll/overflow regions when their content can exceed available space.
- The browser viewport must not become the only scroll container for telemetry tables, waterfalls, metric result surfaces, dashboard grids, logs, or long settings forms.
- Data tables are sortable by default. Every meaningful scalar column exposes a sortable header unless the backing contract explicitly forbids sorting or the column only contains controls/actions. Server-backed list routes sort through their query contract; local detail tables may sort in component state. Sort affordances live in table headers with compact direction icons.
- Server-backed list sorting is backend and contract owned. Frontend local sorting is allowed only for bounded detail tables or already-loaded inspector sublists where the complete sorted set is present in memory.

Tablet:

- Page padding: 12px.
- Secondary panels collapse into sheets or top-of-page collapsibles.

Mobile:

- Page padding: 8px.
- Tables become compact list rows only when columns cannot remain readable.
- Detail panels open in sheets.
- Primary actions remain reachable in the route header or topbar menu.

## Surface Taxonomy

Implementation must use these surface types consistently.

Workspace surface:

- The route's main working area.
- Unframed or uses a single border only when it owns internal scrolling.
- Examples: trace table, trace waterfall, metric panel grid.

Inspector drawer:

- Right-side sheet on desktop and bottom sheet on mobile.
- Used for details or editing related to the current working surface.
- Examples: span detail, log trace preview, metric panel editor, project setup guide.

Modal dialog:

- Used only for focused interruption, confirmation, information, warning, or error states.
- Examples: delete project confirmation, discard unsaved dashboard changes, destructive credential action warning, unrecoverable load error details.
- Dialogs must not contain long multi-section workflows. Use a drawer for those.
- Confirmation, information, warning, and error surfaces must not be implemented as drawers, sheets, inline banners, popovers, or toast-only flows when they require user acknowledgement or a decision.

Create entity page:

- Dedicated route surface for creating a durable entity.
- Required for every new durable entity except adding a row/item inside an existing dataset-like collection.
- Examples: new project, new dataset, new evaluation, and new optimization.
- The create action that starts the flow navigates to the create route. It must not open a drawer, sheet, dialog, popover, or inline expansion for the primary creation workflow.
- The page uses the standard page frame: breadcrumb/back row, route header, one primary working surface, and no card route container.
- The main surface is a wizard-like tabbed form. Tabs group logical topics and show only the active topic's fields.
- Users can navigate by selecting tabs or by using the current step's Back and Continue buttons. Back navigation is always allowed. Forward navigation validates the current and earlier required steps before moving.
- Required fields use visible required markers on the field label and accessible required semantics. Optional fields must not be marked.
- Missing or invalid input renders field-level validation text, sets an invalid field state, and marks the affected tab with an error indicator and accessible label.
- A summary error panel appears above the active tab form when submission or step validation fails and lists the invalid tabs or fields without duplicating long backend error payloads.
- Backend or bridge failures use the canonical inline error panel with problem code, retry when safe, and no raw provider/internal errors.
- Do not add a dedicated review step. The active step should provide clear field-level help and the submit action should stay available in the route header when the current step is the final editable topic.
- Successful creation navigates to the newly created entity's detail/workspace route, or to the run detail route for async starts.
- Unsaved create pages prompt before route/project switch when any user-entered value differs from the default draft.
- Creation pages may include concise domain onboarding copy inside each step. Onboarding must be practical, field-adjacent, and specific to the current topic; it must not become a marketing hero, separate tour, or blocking first-run overlay.
- Create pages do not replace contextual add/edit surfaces for child records. Adding a dataset row remains an in-dataset row editor because it appends to an existing dataset rather than creating a top-level entity.

Settings page:

- Dedicated route surface for durable configuration.
- Entity settings pages use the same topical tab structure as the entity's create page.
- The entity detail page must expose a `Settings` action when the current user can view or edit settings for that entity. The action navigates to the entity settings route; it must not open a drawer, sheet, dialog, popover, or inline expansion for the primary settings workflow.
- Settings tabs must preserve the same order, labels, and conceptual grouping as creation when the same topics exist.
- When settings expose editable fields that do not exist during creation, add them as either new tabs or fields inside the existing tab whose topic owns the behavior. Do not add a miscellaneous or advanced dumping-ground tab for unrelated settings.
- Settings pages load the current persisted entity state, validate field-level and tab-level input using the same required marker/error pattern as creation, and use a summary error panel for validation or save failures.
- Settings pages use direct tab navigation. They do not need create-flow Back
  and Continue controls; Cancel and Save changes remain visible from every tab.
  Validation still marks affected tabs and blocks save when required fields are
  invalid.
- Do not add a dedicated review tab to settings pages. Explain behavior-affecting changes next to the fields that control them, and use focused confirmation dialogs only for destructive or irreversible actions.
- Settings saves use explicit `Save changes` actions, show success/failure feedback, and prompt before route/project switch when there are unsaved changes.
- Destructive settings actions are not regular tab save actions. They use focused confirmation dialogs and appear only when the relevant backend contract and spec define them.
- Project settings are scoped under `/projects/:projectId/settings/*`.
- Project settings are the settings page for the project entity. The settings root is the tabbed project settings page with `Identity` active by default. It uses tabs that mirror project creation topics `Identity`, `Access`, and `Setup`, plus additional settings-only tabs such as `API Keys`, `Retention`, `AI Providers`, and `AI Eval` when the corresponding contracts are enabled.
- Project settings routes are flat, border-led tabbed forms and tables. Do not wrap settings pages in an outer card when inner sections, tables, setup snippets, or alerts already have their own surface.
- Admin settings are scoped under organization routes and use the admin settings shell.
- AI Chat uses a project route with a route-local conversation history rail and
  transcript, not a settings route. AI provider configuration remains in
  project/company settings.

Popover:

- Used for compact choices anchored to a control.
- Examples: company/project switcher menu, filter operator picker, time range presets.

Collapsible:

- Used only for optional secondary groups inside one surface.
- Examples: facet groups, advanced filters, optional setup checklist section, and dashboard children under the `Dashboards` sidebar entry.
- Collapsible state is local presentation state and must not change route history.

Command palette:

- Global UI surface opened with `mod+k` and a visible button.
- It contains route actions, current-route actions, project switch actions, filter preset actions, and copy-link actions.
- It must not introduce a backend search contract.

## Onboarding And Guidance

Onboarding is contextual and progressive. CloudGrid must not block the app with a large first-run wizard.

### First Run Local Mode

State:

- Company is `Personal`.
- No selected project exists.
- `Personal` is local-only and represents the single visible company for local development.
- Company switching, member administration, billing, and organization security pages are hidden in local mode unless multi-company auth is enabled.
- Local `Personal` project and telemetry rules still follow the same project-scoped GraphQL and BFF boundaries as deployed mode.

Layout:

- `/projects` shows the centered project picker.
- The picker contains search/filter, selectable project cards, current selection, create action, and compact setup guidance.
- The picker must not show global company/project/service stat cards, a separate company rail, nested cards, or decorative marketing tiles.

Required behavior:

- If no projects exist, the primary action is `Create project`.
- Project creation navigates to `/projects/new` and uses the create entity page pattern.
- After project creation succeeds, call `Mutation.selectProject` and navigate to `/traces`.
- The user must never see `AI Chat`, `Traces`, `Logs`, `Metrics`, `Dashboards`, or `Evaluations` topbar navigation before a project is selected.

### Project Home Checklist

Project onboarding is handled by empty telemetry states and `/projects/:projectId/settings/ingest`; `/projects/:projectId` is not a project overview page.

Checklist steps:

1. Confirm project context.
2. Copy OTLP endpoint.
3. Copy or create the project ingest credential when the credential mutation exists.
4. Send trace/log data.
5. Send metric data when metrics ingest is enabled.
6. Open Traces and switch to `Live` mode when watching incoming telemetry.
7. Open Metrics when matching metric descriptors exist.
8. Open Dashboards when saved or built-in dashboards exist.
9. Open AI Eval when enabled and projections exist.

Rules:

- Each step has one primary action and one secondary documentation link.
- Completed state is derived from GraphQL project/telemetry read models when available.
- Dismissed/collapsed checklist state is browser-local presentation state for MVP. It must not be treated as project data.
- The checklist must not duplicate the same counts already shown in the project summary. It shows progress and next actions only.

### Empty States

Every empty state must identify one of these causes:

- no project selected;
- no telemetry ingested yet;
- telemetry exists, but the current filters returned no results;
- route feature is disabled;
- user lacks permission;
- backend/storage is unavailable.

Empty state layout:

- Title: short outcome statement.
- Body: one sentence describing the cause.
- Primary action: exactly one next action.
- Secondary actions: at most two links/actions.
- No decorative illustrations are required. Use a small state icon only when it clarifies the state.

Examples:

- No traces/logs/metrics: primary action `Open ingest setup` linking to `/projects/:projectId/settings/ingest`. Filtered empty states keep `Clear filters` as the primary action.
- No metrics: primary action `Open metrics setup`.
- No filter results: primary action `Clear filters`.
- No project selected: primary action `Select project`.

## Core User Flows

### Flow 1: Select Or Create Project

Entry: `/`, `/projects`, project switcher, no-project telemetry guard.

Steps:

1. User sees companies and projects they can access.
2. User can switch company from the company selector.
3. Project list updates to the selected company.
4. User can navigate to `/projects/new` when authorized.
5. User selects a project.
6. Frontend calls `Mutation.selectProject`.
7. On success, frontend invalidates project-scoped queries and navigates to `/traces`.
8. Project workspace navigation appears.

Failure states:

- unauthorized: show problem code and sign-in action when deployed;
- forbidden: show company/project access message without hidden project names;
- create validation failure: inline field errors;
- storage/control-plane unavailable: inline error with retry.

Project creation page:

- Route: `/projects/new`.
- Entry points: `/projects` primary action, project picker empty state, organization project list create action, command palette when authorized.
- Breadcrumb: `Projects / New project` in project selection mode or `Company settings / Projects / New project` when entered from admin settings.
- Tabs: `Identity`, `Access`.
- `Identity` fields: project name required, project slug required when not auto-derived, optional description when the contract supports it. Field help explains where the name and slug are used.
- `Access` fields: owning company selector when the user can create in more than one company; initial project membership defaults to the creator as project admin. Additional member invite controls appear only when project invitation contracts and authorization allow them.
- Submit calls the project creation contract only after all required tabs validate. On success, the frontend calls `Mutation.selectProject` for the created project and navigates to `/traces`.

Project settings page:

- Route: `/projects/:projectId/settings`.
- Entry points: project sidebar `Project settings`, project switcher/context menu settings action, command palette, and setup/empty-state links.
- Breadcrumb: `Projects / <project name> / Settings`.
- Tabs: `Identity`, `Access`, `Setup`, `API Keys`, `Retention`, `AI Providers`, `AI Eval`.
- `Identity` reuses project creation identity fields and adds editable status when authorized. Fixed local system projects render immutable identity fields with explanatory disabled states.
- `Access` reuses project creation access semantics and expands to project member and pending project invitation management when those contracts are enabled.
- `Setup` reuses project creation setup guidance and shows OTLP endpoint and setup snippets without exposing stored secrets.
- `API Keys` manages project ingest credential metadata and create/revoke flows. Secret values are shown only once on credential creation.
- `Retention`, `AI Providers`, and `AI Eval` appear only when matching contracts/features are enabled and use their existing project settings specs.
- Save uses the relevant project/control-plane contracts per tab. The page must not batch unrelated backend mutations into a fake aggregate mutation unless such a contract exists.

### Flow 2: Send First Telemetry

Entry: project settings and no-telemetry empty states.

Steps:

1. User opens setup drawer.
2. Drawer shows project-scoped OTLP endpoint and credential metadata.
3. User copies language-neutral OTLP instructions.
4. User sends data from application or fixture.
5. Project home updates recent ingest state from GraphQL read models.
6. User opens Traces and uses `History` or `Live` mode.

Security:

- Stored secrets are never displayed.
- Credential secret values are shown only once at creation when credential creation exists.
- Clipboard actions must copy only project-scoped endpoint/config snippets that do not expose SurrealDB or internal NATS credentials.

### Flow 3: Investigate Incoming Trace Behavior

Entry: `/traces?mode=live`.

Layout:

- Header: `History`/`Live` mode control, stream status, pause/resume, clear buffer, filter action.
- Main surface: the same virtualized trace table used by historical trace search.
- Detail: row opens the normal `/traces/:traceId` route.

Steps:

1. User opens Traces in `Live` mode and watches incoming trace summaries.
2. User pauses rendering without closing the subscription.
3. User applies server filters through `LiveTraceInput`.
4. Subscription restarts with the new server filter.
5. User opens a row into `/traces/:traceId`.

Rules:

- Live is not a separate route or sidebar navigation entry.
- Live mode does not show closed-range history controls.
- Live mode uses the same table columns, row interactions, active filter chips, detail route, and selected-row behavior as history mode.
- Live mode does not compute local aggregate counts.

### Flow 4: Search Historical Traces

Entry: `/traces`, `/traces?mode=history`, command palette.

Layout:

- Header: title, `History`/`Live` mode control, refresh, saved/local presets.
- Filter bar: primary filters inline.
- Facet side panel: collapsible on desktop, drawer on tablet/mobile.
- Main surface: trace table.

Steps:

1. User applies time/service/status/query filters.
2. URL query parameters update.
3. GraphQL `Query.traces` and `Query.telemetryFacets` refetch.
4. User opens a trace row.
5. User returns with filters preserved.

Rules:

- Trace table is not inside a card.
- Active filters are chips below the filter bar.
- Selecting a facet updates the matching query parameter. Clicking an already selected facet clears that facet filter.
- Facet suggestions never replace manual input and must not clear other active filters.

### Flow 5: Trace Investigation

Entry: `/traces/:traceId`.

Layout:

- Header: back, trace identity, status, duration, start time, copy actions.
- Main split:
  - left: trace waterfall workspace;
  - right: span detail inspector drawer/panel.
- Mobile: span detail is a sheet.

Steps:

1. User scans trace waterfall and warnings.
2. User filters spans using the waterfall filter dialog.
3. User selects a span.
4. URL `spanId` updates.
5. Inspector shows tabs: Overview, Attributes, Events, Exceptions, Links, Logs.
6. User pivots to logs or attributes without losing trace context.

Rules:

- Waterfall is the primary visualization; do not place separate card charts above it unless the spec adds distinct data.
- The inspector does not duplicate the same full attribute table in multiple tabs.

### Flow 6: Log Search And Trace Pivot

Entry: `/logs`, trace detail related logs, command palette.

Layout:

- Header: title, refresh, presets.
- Filter bar: query, service, severity, trace/span IDs, time range.
- Main surface: log table.
- Right inspector: resizable selected-log detail panel on desktop and bottom sheet on mobile.
- Row expansion: inline for body/attributes only when the inspector is unavailable on narrow screens.

Steps:

1. User searches logs.
2. User expands a row.
3. User opens trace/span from chips.
4. User can return to logs with filters preserved.

### Flow 7: Metrics And Dashboards

Entry: `/metrics`, `/dashboards`.

Metrics layout:

- Header: metric search context, time range, refresh, copy URL.
- Left rail: metric names from `Query.metricNames`.
- Main surface: query controls and metric series result preview/table.
- Right inspector drawer: descriptor, attributes, series, exemplars.

Dashboards layout:

- Header: selected dashboard name, time range, refresh, duplicate, save/delete when allowed.
- Left dashboard rail: pinned, built-in, personal, and project dashboards, search, create action.
- Main surface: responsive dashboard widget grid.
- Right inspector drawer: widget details or editor.
- Project sidebar: `AI Chat` first when enabled, pinned dashboard shortcuts below it when present, and optional `Dashboards` children from `Query.dashboards`.

Steps:

1. User opens Metrics to discover metric names and descriptors.
2. User selects a metric and runs a query through `Query.metricSeries`.
3. User pivots from exemplars to trace detail when trace/span IDs exist.
4. User opens Dashboards to view built-in or project dashboards.
5. User may open a pinned dashboard shortcut or a child dashboard under the `Dashboards` sidebar entry when available.
6. User pins or unpins a dashboard through `Mutation.setDashboardPinned`.
7. User duplicates a built-in dashboard or creates a project dashboard.
8. Widget editor opens in the right drawer.
9. User edits fields that map directly to typed `DashboardWidgetInput` configs.
10. Save calls `Mutation.saveDashboard`.
11. Delete calls `Mutation.deleteDashboard` after confirmation.

Rules:

- `/metrics` is not a dashboard builder and does not show the dashboard rail.
- `/dashboards` owns saved visual compositions.
- Dashboard grid must not show empty placeholder widgets for metrics that do not exist.
- Log, trace, metric, and live widgets save through typed dashboard widget configs. Alert widgets remain disabled until dashboard alert widget contracts and evaluator-backed alert evidence are specified.
- Pin/unpin dashboard shortcuts must not be implemented as fake shared state or hidden local data.
- Unsaved dashboard draft state is visually explicit.
- Dirty state prompts before route/project switch.
- Widget editor controls are grouped into `Data`, `Display`, and `Thresholds`.
- The dashboard builder has one `Add widget` action. Metric/log/trace/live widget type choices are secondary choices inside that action.
- Dashboard title and description are editable in place in the builder header and create a visible dirty draft before save.

### Flow 8: AI Evaluation Workspace

Entry: `/ai-eval` when enabled.

Layout:

- Header: workspace title, feature status, create/run action when supported.
- Left rail or tabs: Datasets, Evaluations.
- Main surface: selected list/detail workspace.
- Right inspector drawer: optional advanced run, item, adapter, target snapshot,
  or comparison detail.

Steps:

1. User creates or opens a dataset.
2. User adds/imports rows with input, expected output, optional reason, split,
   and curation status.
3. User creates an evaluation for a dataset, split selector, target, and metric
   defaults.
4. UI renders GraphQL-provided metrics, item runs, comparisons, and trajectory
   summaries.
5. User pivots to trace detail from run/span links.
6. User promotes traces/spans to dataset items when supported.
7. User opens annotation items and updates status when supported.

Rules:

- Frontend must not compute scores, costs, token totals, transcript semantics, or regression summaries.
- Feature disabled state hides primary navigation and direct route shows a feature-disabled state.

AI Eval creation pages:

- `New dataset` navigates to `/ai-eval/datasets/new`.
- `New evaluation` navigates to `/ai-eval/evaluations/new`.
- `Start optimization` navigates to `/ai-eval/optimizations/new` when the start requires user choices. One-click starts are allowed only when all required inputs are already resolved from the current evaluation/run/comparison context and the user still sees the resolved objective before submission.
- AI Eval create routes use the project workspace shell, preserve the selected project, and show breadcrumbs under `AI Eval`.
- Direct access to an AI Eval create route while the feature is disabled renders the feature-disabled state with a settings link for authorized users.
- Dataset row creation remains `Add row` inside dataset detail and does not use a top-level create page.

Dataset creation page:

- Route: `/ai-eval/datasets/new`.
- Entry points: Datasets list primary action, AI Eval first-use checklist, compatible import flow start, command palette when authorized.
- Breadcrumb: `AI Eval / Datasets / New dataset`.
- Tabs: `Purpose`, `Schema`, `Curation`, `Trace intake`.
- `Purpose` fields: dataset name required, evaluation type required as a controlled enum preset backed by `EvaluationFamily`, optional description, and project shown read-only. Labels must use business wording; the enum is compatibility metadata and is not a free-form taxonomy field.
- `Schema` fields: input value type required and defaulted to text, expected value type required, `AI input shape` stacked above `Expected AI result shape`, input JSON schema only when input type is JSON and schema is desired, expected JSON schema required only when expected type is JSON. Labels and helper text describe the LLM/agent/workflow input and expected AI result in user-facing domain language before technical field names. Switching a side to JSON seeds a default object schema when empty.
- `Curation` fields: default split required, default curation status required, anonymization/PII policy required when the backend contract exposes it, retention profile required or defaulted from project settings, and metric defaults selected from supported presets with an explicit custom fallback when needed. Suggested metrics follow evaluation-type/value-type changes until the user explicitly chooses a metric. New datasets default to text input and validation split for the first baseline run.
- `Trace intake` fields: trace intake rules are optional and default to not
  configured; they must be configured before trace overview or trace detail can
  prepare dataset rows. The step explains service and operation/function/span
  matching in business wording, then groups AI input mapping separately from
  expected AI result and observed AI result mapping. Path controls use presets
  with an explicit custom fallback.
- Successful creation navigates to the dataset detail route.

Dataset list and detail readiness:

- Dataset list does not show raw backend health status or a `Schema health`
  column. It shows ready-row count and split coverage as scan-friendly
  indicators.
- Dataset detail owns actionable readiness. It explains any `Dataset.health`
  problem in user-facing wording and places the matching add/import row,
  expected-result edit, mark-ready, AI input/result shape, or settings action
  beside the issue. Evaluation creation from dataset stays disabled until at
  least one ready row exists.

Dataset settings page:

- Route: `/ai-eval/datasets/:datasetId/settings`.
- Entry points: dataset detail `Dataset settings` action, command palette when the dataset is in context, import/export flows, and validation/health warnings that require dataset-level changes.
- Breadcrumb: `AI Eval / Datasets / <dataset name> / Settings`.
- Tabs: `Purpose`, `Schema`, `Curation`, `Trace intake`, `Versions`.
- `Purpose`, `Schema`, `Curation`, and `Trace intake` reuse dataset creation grouping and fields, populated from the current dataset state.
- Persistent settings actions include Cancel, Import settings, Export settings, and Save settings. Import/export applies only to dataset settings JSON; dataset row import/export remains in dataset detail.
- `Versions` is settings-only and shows current version, save conflict guard, version impact, and stale-write context. It must not replace dataset row/version history in dataset detail and must not look like an evaluation version-policy choice.
- Every save that changes behavior-affecting dataset settings sends `expectedDatasetVersionId` and creates a new dataset version according to the dataset contract.

Evaluation creation page:

- Route: `/ai-eval/evaluations/new`.
- Entry points: Evaluations list primary action, dataset detail `Create evaluation from dataset`, AI Eval first-use checklist, command palette when authorized.
- Breadcrumb: `AI Eval / Evaluations / New evaluation`.
- Tabs: `Dataset`, `Target`, `Metrics`, `Run policy`.
- `Dataset` fields: dataset required, split selector required, and eligibility/ready-row feedback from GraphQL read models. Evaluation creation defaults to latest ready dataset content, uses the dataset default split, blocks empty selected splits, and does not expose pinned dataset version policy in the first-run flow.
- `Target` fields: target kind required, target reference required, model alias stored through `EvaluationTargetRef.metadata.modelAlias` when applicable. Labels use user-facing wording such as `CloudGrid prompt`, `External adapter`, and `Prompt or adapter reference`; target snapshot ids remain advanced evidence fields outside first-run creation.
- `Metrics` fields: metric settings default from the dataset and project AI Eval settings; supported presets are shown before custom metric ids; required metric fields must be visible and overridable only where contracts allow.
- `Run policy` fields: retention role/profile, concurrency/budget/sampling controls, and any required adapter/provider choices default from project settings.
- Successful creation navigates to the evaluation definition/detail route. If the user explicitly chose to start immediately, the run starts through `startEvaluationRun` and the user lands on the run detail route.

Evaluation settings page:

- Route: `/ai-eval/evaluations/:evaluationId/settings`.
- Entry points: evaluation definition/detail `Settings` action, run detail source evaluation link action, and command palette when an evaluation is in context.
- Breadcrumb: `AI Eval / Evaluations / <evaluation name> / Settings`.
- Tabs: `Dataset`, `Target`, `Metrics`, `Run policy`, `History`.
- `Dataset`, `Target`, `Metrics`, and `Run policy` reuse evaluation creation grouping and fields, populated from the current evaluation definition. Editable settings save through `updateEvaluationDefinition` and apply only to future runs; existing runs keep their resolved dataset version, target snapshot, metric settings, and run policy evidence.
- `History` is settings-only and shows last run state, resolved dataset version evidence from past runs, and links to recent runs/comparisons without duplicating run result tables.
- Changes affect future runs only. Existing evaluation runs remain reproducible and must continue rendering their resolved dataset version, target snapshot, metric settings, and run policy.

Optimization creation page:

- Route: `/ai-eval/optimizations/new`.
- Entry points: evaluation detail, run detail, comparison view, and command palette only when enough context can be selected.
- Breadcrumb: `AI Eval / Optimizations / New optimization`.
- Tabs: `Source`, `Objective`, `Search`, `Validation`.
- `Source` fields: source evaluation/run/comparison required, candidate baseline target required, and dataset split availability shown from storage-read view models.
- `Objective` fields: primary metric required, secondary metrics optional, hard constraints required or defaulted, tradeoff metrics optional, ranking policy required, and tie-breakers required or defaulted.
- `Search` fields: editable target parts include prompt text and
  few-shot/example selection for prompt optimization, and skill document
  controls when the baseline target exposes an editable `skill` part and the
  search policy is `skill_text_edit`; model config may appear only when
  represented as a target part snapshot; tool, workflow, and agent-configuration
  optimization controls remain hidden in v2.
- `Validation` fields: quick-shot usage, validation split policy, minimum evidence, and test split exclusion. The page must state that quick-shot results are exploratory and cannot be promotion evidence.
- Submit calls `startOptimizationRun`; successful start navigates to the optimization run detail route.

Optimization settings page:

- Route: `/ai-eval/optimizations/:optimizationRunId/settings`.
- Entry points: optimization run detail `Settings` action while the run is configurable, and command palette when an optimization run is in context.
- Breadcrumb: `AI Eval / Optimizations / <optimization run label> / Settings`.
- Tabs: `Source`, `Objective`, `Search`, `Validation`, `Controls`.
- `Source`, `Objective`, `Search`, and `Validation` reuse optimization creation grouping and fields, populated from the resolved run configuration.
- `Controls` is settings-only and contains lifecycle controls that are supported by contracts for the current run state, such as pause, resume, cancel, retry, or budget adjustment. Unsupported lifecycle controls are hidden.
- Settings for completed, failed terminal, canceled terminal, or promoted optimization runs are read-only unless a later spec defines mutable post-run metadata.
- Save/update actions must preserve reproducibility: completed candidate snapshots, quick-shot selections, validation evidence, and promotion records are immutable.

### Flow 9: Company And Member Management

Entry: company switcher, `/organizations`.

Layout:

- Company routes use admin-focused list/detail layouts.
- The company admin sidebar exposes only useful management surfaces: projects,
  members, and AI provider settings. It does not include a company list entry or
  a read-only company overview entry.
- Company project list and member list are dense tables, not dashboard cards.
- Company AI Provider settings uses the same admin shell and is visible only to
  company admins.
- Member mutation actions use dialogs for confirmation and drawers for invite/edit forms.
- Users cannot demote or remove their own account from the company member list.
- The Members route has one primary `Invite member` action for company admins.
  The invite drawer accepts one email address, explains that access activates
  only after SSO sign-in with a matching verified email, and does not expose an
  admin role selector.
- Pending invitations render in the member table or an adjacent dense table with
  status, email, invited by, created time, expiry when present, and a revoke
  action. Pending invitations must not expose promote/demote controls.

Rules:

- Telemetry navigation remains hidden unless a project is selected.
- Member screens do not invent project-specific role controls until granular permissions are specified.

## Component Placement Rules

Button hierarchy:

- Every route or modal has at most one primary button in the visible action group.
- Primary buttons are reserved for the next irreversible or main forward action, such as `Create project`, `Save changes`, `Run evaluation`, or `Delete project` inside a destructive confirmation.
- Secondary buttons are for safe alternatives, such as `Cancel`, `Duplicate`, or `Open docs`.
- Tertiary/ghost/icon buttons are for low-emphasis utilities, overflow menus, copy actions, refresh, and view toggles.
- Buttons, tabs, segmented controls, chips, active navigation entries, forms, sidebars, and toolbars use the default shadcn neutral white/gray/black styling. Do not add custom brand colors to standard controls.
- Form controls must use repository shadcn/Radix components or explicit shadcn wrappers. Production route code must not import or render native `select`, `option`, `textarea`, checkbox input, or unstyled form controls directly. Raw JSON payloads, JSON schemas, and structured JSON settings use the shared JSON editor wrapper with theme support, monospace text, line wrapping, and normal field validation semantics. Date and time inputs use the shared shadcn input/date-control abstraction once available; until then they must still be rendered through the shared shadcn `Input` wrapper, not raw HTML.
- Every button renders an icon. Copy actions are always icon-only with an accessible label and tooltip; they must not use text labels such as `Copy`, `Copy endpoint`, or icon+label variants. Non-copy visible actions use a concise lucide icon plus label. Standard toolbar utilities may be icon-only when the control has an accessible label and tooltip.
- Copy, save, create, update, delete, pin/unpin, and toggle actions must show explicit success or failure feedback. Mutations use inline validation or problem panels for actionable errors and a compact confirmation surface for completed actions; clipboard actions may use a toast/status region, but failure must still be visible and accessible.
- Search fields use the shared shadcn-backed `SearchInput` component with a leading search icon. Route and feature code must not hand-compose absolute search icons next to raw `Input` controls.
- Navigation entries, toolbar buttons, filter actions, pin/unpin actions, warning states, and error states use concise icons with accessible labels; icon-only controls also expose tooltips.
- Destructive actions use destructive styling only at the point of action or confirmation, not on passive navigation entries.
- Disabled buttons must explain the missing prerequisite through adjacent copy, tooltip, or validation text.

Route headers:

- One title.
- One short description.
- Primary action on the right.
- Secondary actions in an overflow menu when there are more than two.

Filter bars:

- Inline primary filters only.
- Advanced filters open in a popover or dialog depending on complexity.
- Active filters render as removable chips immediately below the filter row.

View rails:

- Used for saved views, project lists, or AI-eval workspace sections.
- Width: 260px to 320px desktop.
- Collapses into a sheet on mobile.
- Must not contain unrelated route navigation.

Inspectors:

- Width: 360px to 480px desktop.
- Right side for details/editors tied to the current surface.
- Bottom sheet on mobile.
- Must include title, description, close button, and clear dirty/discard behavior when editable.

Tables:

- Primary telemetry tables use sticky headers.
- Row height: 36px compact default, 44px comfortable only where row actions need space.
- IDs use monospace chips with copy controls.
- Row click opens detail; copy/icon actions must not trigger row navigation.

Charts:

- Charts appear only when there is backend-provided data.
- Loading/empty/error states reserve stable panel height.
- Legends are compact and scrollable.
- Chart actions are icon buttons with tooltips.

## Visual Direction

CloudGrid uses "quiet enterprise command center" styling:

- neutral base surfaces;
- clear table and timeline hierarchy;
- strong focus states;
- restrained status colors;
- no decorative gradients, blobs, oversized hero sections, or nested card stacks.

The app may feel dense, but it must not feel cramped. Density comes from aligned grids, compact typography, and stable scroll regions, not from squeezing unrelated widgets together.

## Copy And Language

Copy rules:

- Use verb-first actions: `Create project`, `Select project`, `Copy endpoint`, `Clear filters`, `Open trace`.
- Avoid implementation terms in user-facing navigation. Use `Company`, `Project`, `Traces`, `Logs`, `Metrics`, `Dashboards`, `AI Chat`, `Evaluations`, and `Settings`. Use `Live` only as a trace workspace mode label, not as a primary navigation entry.
- Technical protocol terms are allowed only inside setup and documentation surfaces: `OTLP`, `OpenTelemetry`, `Bearer token`, `GraphQL`.
- Every user-visible string goes through the translation layer.

## Accessibility

Accessibility requirements:

- WCAG 2.2 AA is the target.
- Keyboard focus must remain visible and not be obscured by sticky headers, drawers, or bottom bars.
- Interactive targets are at least 24x24 CSS px; primary controls should be at least 32px high on desktop and 40px on touch layouts.
- Dialogs, sheets, popovers, and command palette trap focus while open and restore focus on close.
- Icon-only controls require tooltips and `aria-label`.
- Status changes from saves, deletes, filter results, live subscription state, and retries must be available to assistive technology.
- Any drag/reorder customization must provide keyboard-accessible alternatives before it ships.

## Data And State Ownership

Frontend may own:

- selected tab;
- open/closed drawer;
- active local filter draft before submit;
- URL query parameters;
- table column sizing and visibility;
- dismissed/collapsed onboarding checklist state;
- unsaved dashboard draft state;
- legend visibility and panel expansion.

Frontend must not own:

- project/company membership truth;
- telemetry counts;
- metric rates/percentiles;
- evaluation scores/summaries;
- ingest credential secrets;
- saved personal/project dashboards after save;
- backend authorization decisions.

## Responsive Behavior

Desktop `>= 1200px`:

- Global topbar controls are visible.
- Project/domain navigation is visible in the left sidebar for project workspace routes.
- View rails and inspector drawers may be persistent.
- Primary data surfaces fill remaining viewport height.

Tablet `768px - 1199px`:

- Sidebar navigation may become compact or move into controlled overflow.
- View rails collapse to a sheet.
- Inspector may be resizable or sheet-based.

Mobile `< 768px`:

- Topbar route navigation is in a menu sheet.
- Primary tables may become compact evidence rows.
- Inspectors and editors are sheets.
- Filter bar shows search plus filter button; full filters are in a sheet.

## Quality Gates

Frontend implementation must pass these UX gates before completion:

- No telemetry route navigation appears when no project is selected.
- `Live` does not appear as a primary project sidebar route; live trace receiving is reachable from the `Traces` route mode control.
- The global topbar is present across authenticated project, project-picker, and admin settings views.
- Project workspace routes use the project/domain left sidebar, not topbar telemetry tabs.
- The project picker is centered and remains usable without telemetry navigation.
- Project settings and admin settings use dedicated settings shells/pages.
- Dense telemetry and settings surfaces use independent scroll regions where required.
- Confirmation, information, warning, and error acknowledgement/decision flows use modal dialogs.
- Button hierarchy follows the primary/secondary/tertiary/destructive rules in this spec.
- Non-neutral color is reserved for telemetry meaning: errors, warnings, severity, chart series, graph relations, and explicit data states. Standard UI selection uses neutral muted surfaces and borders.
- Local mode exposes `Personal` as the only visible company and hides unsupported company administration.
- No route-primary table, waterfall, metric result surface, or dashboard grid is nested inside a card.
- Every route has loading, empty, no-filter-results when applicable, error, and populated states.
- Every empty state has exactly one primary next action.
- Durable entity creation uses dedicated create pages with wizard-like tabs, validation, field-adjacent help, and unsaved-change protection.
- Durable entity settings use dedicated settings pages with the same tab groups as creation plus focused settings-only tabs.
- Company/project switcher is visible in project workspace mode.
- Project changes reset project-scoped telemetry/metric/eval query state.
- Modal/dialog/sheet/popover usage follows this spec's surface taxonomy.
- At 320px width, text does not overlap controls, charts, chips, bars, or neighboring content.
- Keyboard can reach topbar, filters, table rows, drawers, dialogs, command palette, and primary actions.
- `bun run --cwd apps/frontend typecheck`, `bun run --cwd apps/frontend build`, and frontend smoke tests must pass for implementation waves.

## Implementation Slices

Implementation agents must split UI work by ownership boundary:

1. Shell and navigation: global topbar with company/project dropdowns, centered project picker, project/domain sidebar, command palette route inventory, route guard behavior.
2. Project selection and onboarding: `/projects`, `/projects/new`, ingest setup, project empty states.
3. Telemetry workspaces: Traces with History/Live modes, Logs, trace detail route frames, filters, facets, and primary surfaces.
4. Metrics and dashboards: metric explorer, dashboard rail, widget grid, editor drawer, dirty state, save/delete dialogs.
5. Project settings: general settings at the settings root, API Keys, retention, members, AI Providers, and AI Eval settings.
6. AI Chat: project assistant route with per-user history grouped by project, BFF streaming, approved action proposals, and json-render artifacts.
7. Admin settings shell: organization overview, project list, member list, AI Provider, and admin navigation.
8. AI Eval workspace: feature-gated layout, section rail/tabs, dataset/evaluation/optimization create and settings pages, inspector drawers, trace pivots.
9. Design QA: responsive checks, accessibility checks, no nested-card checks, translation coverage.

## Remaining Feature Backlog

These items are intentionally not frontend-owned product decisions. Contracts and
backend ownership must exist before a route claims the behavior as enforcing.

- Multi ingest API keys: listing, titled creation, one-time secret display,
  revocation, and last-used metadata are implemented as project-scoped ingest
  credential management. Stored secrets are never displayed after creation.
- Data retention policy: Project Settings renders and mutates project-level
  retention policies through generated contracts. Storage-maintenance owns
  batch execution and scheduling; the production completion package is the
  SurrealDB retention adapter plus storage-read soft-delete filtering described in
  `04-backend/data-retention-policy.md`. The UI must not imply that a saved
  policy has deleted telemetry until that production adapter is enabled.
- Alerting: Project-scoped alert rule, silence, history management, evaluator
  runtime handlers, project discovery, adapter definition registration,
  company-scoped adapter instance settings, and dashboard alert/evidence
  widgets are defined by generated contracts and the alerting spec.
  Provider-specific notification services such as Slack, Teams, email,
  webhooks, WhatsApp, SMS, or incident-management tools integrate through
  adapter definitions and bridge-backed delivery adapters. The frontend manages
  rules and company adapter settings through GraphQL, but alert rule pages
  select only safe adapter instance IDs and never own delivery execution logic.
- Full OTLP protocol compatibility: setup snippets may describe OTLP/HTTP
  JSON/protobuf on `4318` and OTLP/gRPC protobuf on `4317` for traces, logs, and
  metrics when the collector is used with the current implementation.
- Project members: Project Settings uses real project-specific membership and
  roles through generated contracts. Pending project grants from invitations are
  not active memberships until accepted.

Agents must not choose alternative IA, modal behavior, navigation ordering, onboarding placement, or empty-state structure without updating this spec first.
