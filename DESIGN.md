---
version: 2026-05-15
name: CloudGrid Operational Observability
description: CloudGrid's frontend design contract for enterprise project-scoped observability and AI evaluation workflows.
colors:
  background: "#FFFFFF"
  foreground: "#09090B"
  card: "#FFFFFF"
  cardForeground: "#09090B"
  popover: "#FFFFFF"
  popoverForeground: "#09090B"
  primary: "#18181B"
  primaryForeground: "#FAFAFA"
  secondary: "#F4F4F5"
  secondaryForeground: "#18181B"
  muted: "#F4F4F5"
  mutedForeground: "#71717A"
  accent: "#F4F4F5"
  accentForeground: "#18181B"
  destructive: "#DC2626"
  destructiveForeground: "#FAFAFA"
  border: "#E4E4E7"
  input: "#E4E4E7"
  ring: "#18181B"
  info: "#2563EB"
  success: "#16A34A"
  warning: "#D97706"
  error: "#DC2626"
  trace: "#7C3AED"
  serviceA: "#2563EB"
  serviceB: "#16A34A"
  serviceC: "#D97706"
  serviceD: "#7C3AED"
  darkBackground: "#09090B"
  darkForeground: "#FAFAFA"
  darkCard: "#09090B"
  darkCardForeground: "#FAFAFA"
  darkPopover: "#09090B"
  darkPopoverForeground: "#FAFAFA"
  darkPrimary: "#FAFAFA"
  darkPrimaryForeground: "#18181B"
  darkSecondary: "#27272A"
  darkSecondaryForeground: "#FAFAFA"
  darkMuted: "#27272A"
  darkMutedForeground: "#A1A1AA"
  darkAccent: "#27272A"
  darkAccentForeground: "#FAFAFA"
  darkBorder: "#27272A"
  darkInput: "#27272A"
  darkRing: "#D4D4D8"
typography:
  display:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: 0px
  heading:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0px
  body:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0px
  label:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0px
  mono:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0px
rounded:
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  px: 1px
  0: 0px
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
components:
  app-shell:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  topbar:
    height: 56px
    backgroundColor: "{colors.background}"
    borderColor: "{colors.border}"
  context-switcher:
    minWidth: 260px
    maxWidth: 420px
  nav-rail:
    width: 56px
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
  view-rail:
    minWidth: 260px
    maxWidth: 320px
    backgroundColor: "{colors.background}"
    borderColor: "{colors.border}"
  domain-sidebar:
    minWidth: 260px
    maxWidth: 320px
    backgroundColor: "{colors.background}"
    borderColor: "{colors.border}"
  inspector-drawer:
    minWidth: 360px
    maxWidth: 480px
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    rounded: "{rounded.md}"
    height: 36px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondaryForeground}"
    rounded: "{rounded.md}"
    height: 36px
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructiveForeground}"
    rounded: "{rounded.md}"
    height: 36px
  panel:
    backgroundColor: "{colors.card}"
    borderColor: "{colors.border}"
    rounded: "{rounded.lg}"
  trace-row:
    height: 36px
    typography: "{typography.body}"
  span-row:
    height: 32px
    typography: "{typography.body}"
  code-chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
---

# CloudGrid Design Guide

## Overview

CloudGrid is an enterprise operational observability UI for engineers working inside project-scoped telemetry and AI evaluation workspaces. It must feel precise, technical, calm, and fast. The first screen is always the application, not a landing page.

The product personality is quiet and utilitarian: dense information, stable layout, clear hierarchy, low decoration, and strong orientation around company and project context. The UI should help users select the right project, send telemetry, confirm data is arriving, investigate evidence, and pivot between traces, logs, metrics, dashboards, live trace receiving, and AI evaluation without losing context.

Use shadcn/ui primitives, Tailwind utility composition, and the default shadcn theme as the baseline. CloudGrid styling is flat, border-led, and token-driven: prefer semantic CSS variables, neutral surfaces, separators, and focus rings over custom shadows, gradients, or bespoke component chrome. Standard controls use the shadcn white/gray/black theme; do not introduce custom brand colors for buttons, tabs, chips, selected rows, sidebars, forms, cards, or toolbars. This document adds CloudGrid-specific tokens and rules on top of that baseline. When tokens conflict with prose, the token values are normative.

`specs/05-frontend/product-ux-concept.md` is the authoritative UX concept. Frontend agents must read it before changing app shell, navigation, onboarding, empty states, route layout, drawers, dialogs, popovers, or collapsibles. Frontend agents changing `/traces` or `/traces/:traceId` must also read `specs/05-frontend/traces-and-metrics-ux-concept.md`. Frontend agents changing `/logs`, `/metrics`, or `/dashboards` must read `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`.

Licensed whitelabel builds use the code-level brand boundary in
`specs/05-frontend/whitelabel-customization.md`. Product identity, light/dark
semantic tokens, fonts, and radius come from `@cloudgrid/brand`; shell behavior,
route layout, component hierarchy, telemetry colors by meaning, and shadcn
primitive behavior remain CloudGrid core.

## Public Website Visual Direction

The public website under `website/` uses a different composition model than the product app, but the same restraint: neutral surfaces, concise copy, and no nested decorative UI. Marketing pages may use a generated hero image as a first-viewport signal; documentation pages do not.

Website rules:

- Use generated realistic enterprise/product collage imagery only in the first hero section of non-handbook pages. The image should feel like a polished product/infrastructure photograph or product-render collage, with observability dashboards, telemetry flows, message bridge/adapters, enterprise SaaS packaging, or cloud infrastructure as the subject.
- Do not use full-page image backgrounds. After the hero, sections return to flat white or neutral recessed surfaces.
- Do not use simple gradients, procedural SVG backgrounds, abstract blobs, bokeh, or generic stock-like filler as hero art.
- Keep home, feature overview, feature detail, enterprise, white-label, and compare hero copy blocks aligned in position and scale so page navigation does not flicker.
- Let the hero background carry the visual weight. Do not add a separate right-side hero mockup, animated canvas, SVG diagram, or card stack beside the headline.
- Handbook pages and handbook subpages remain plain white/neutral documentation pages without marketing hero imagery.
- Do not add decorative pill piles, card-in-card layouts, nested rounded section wrappers, oversized decorative cards, or marketing bloat. Use flat sections, restrained borders, concise typography, and shadcn-like neutral color.
- Marketing feature lists and related-page navigation should not use generic card grids. Use editorial stacks, alternating image/text rows, ruled lists, or image-led strips with generated product collage crops.
- Non-handbook marketing pages lead with audience context: the decision-maker or operator problem, CloudGrid's concrete help, then links to deeper feature, enterprise, comparison, or handbook pages. Avoid repeating the same capability catalog across multiple pages.

## Colors

CloudGrid uses neutral shadcn surfaces with semantic telemetry accents.

- **Neutral base:** Background, foreground, card, popover, muted, border, input, and ring map to shadcn default semantic tokens.
- **Severity:** Use `error`, `warning`, `success`, and `info` for span status, log severity, and alert states.
- **Trace accents:** Use `trace` for selected trace context and service colors only for timeline differentiation.
- **Dark mode:** Use semantic dark tokens instead of hard-coded dark colors.

Do not use decorative gradients, glow effects, or orb backgrounds. Color in the application shell and standard controls is neutral. Non-neutral color is reserved for telemetry meaning: errors, warnings, severity, chart series, graph relations, and other explicit data states. Selection and active navigation use neutral shadcn muted surfaces, borders, and focus rings.

## Typography

Use system sans-serif typography for interface text and monospace for technical values.

- **Display:** Route titles and high-level detail page labels only.
- **Heading:** Panel titles, table section headings, and detail drawer sections.
- **Body:** Tables, filters, logs, and explanatory states.
- **Label:** Compact metadata labels, form labels, badges, and tab labels.
- **Mono:** Trace IDs, span IDs, JSON, attributes, timestamps when precision matters, stack frames, NATS subjects, and query snippets.

Do not scale font size with viewport width. Letter spacing is `0px` unless a component already inherits a shadcn default.

## Layout

The shell has two modes:

- **Project selection mode:** no project is selected or the user is managing companies/projects. The topbar shows CloudGrid identity, company selector, command/search, and user actions. Telemetry navigation is hidden.
- **Project workspace mode:** a project is selected. The topbar shows CloudGrid identity, company/project switcher, command/search, setup/help, theme/language controls when implemented, and user actions.

Primary project navigation lives in the left project sidebar, ordered AI Chat when enabled, pinned dashboard shortcuts when present, then Traces, Logs, Metrics, Dashboards, and Evaluations when enabled, with Project settings separated at the bottom. Pinned dashboard shortcuts appear below AI Chat and above primary telemetry navigation when returned by `Query.dashboards`, and the Dashboards entry may expand to show visible custom dashboards. The sidebar must not repeat the selected company/project summary; context selection belongs in the global topbar. Company settings use a compact global topbar action for company admins and route into the admin settings shell; they are not project telemetry navigation. The company admin sidebar contains Projects, Members, and AI Provider only, without redundant Companies or read-only Company overview entries. Live trace receiving is a mode inside Traces, not a separate navigation entry.

Every route uses the same frame:

1. Topbar.
2. Optional project context strip for setup warnings or onboarding.
3. Breadcrumb navigation for nested, detail, settings, and administration routes.
4. Route header with title, one-line purpose, and primary actions.
5. One route-primary workspace surface.

Filters, cursors, selected span, active detail tab, and view IDs are URL state where specified. Layout must remain stable when loading, empty, errored, or populated.

### Global Shell

The global topbar is the only app-wide navigation surface. It is 56px high and contains CloudGrid identity/home, company dropdown, project dropdown, command/search, setup/help, theme/language controls when implemented, and user actions. It never contains telemetry route tabs.

Domain sidebars structure the current domain. In project workspace mode, the left sidebar owns project route navigation: AI Chat when enabled, optional pinned dashboard shortcuts, Traces, Logs, Metrics, Dashboards, Evaluations when enabled, and Project settings separated at the bottom. The Dashboards entry may expose a collapsible child list for accessible custom dashboards while the parent remains the route entry. Inside routes, nested rails may still structure saved dashboards, AI Eval sections, or settings subsections. Sidebars are 240px to 320px on desktop, collapse into sheets on mobile, and must not contain unrelated global/account navigation or duplicated selected-project summaries.

The topbar, optional context strip, route header, domain sidebar, route-primary workspace, and inspector drawer use independent scroll containers. The page shell itself should not become the normal scroll surface for populated data routes. Sticky table, timeline, and list headers stick inside the scroll container that owns their content.

## Elevation & Depth

CloudGrid uses tonal layering and borders, not heavy shadows.

- Page background is the base surface.
- Panels use borders and slightly different surfaces.
- Modals, sheets, popovers, and command menus may use standard shadcn shadow.
- Timeline rows, table rows, and log rows are not cards.
- Route-primary workspaces, trace surfaces, flow nodes, repeated panels, sidebars, and inspectors do not use custom drop shadows.

Do not put cards, bordered panels, or card-like rounded sections inside another card or bordered panel. If a component already owns a header, border, or surface, compose it directly in the layout instead of wrapping it in another framed container. Use section boundaries, separators, sticky headers, and scroll containers for hierarchy.

## Shapes

Use restrained radius:

- `2px` for tiny markers and timeline event ticks.
- `4px` for compact chips and status markers.
- `6px` for buttons, inputs, badges, and row controls.
- `8px` maximum for panels, sheets, and repeated cards.
- `9999px` only for circular icons, avatars, and pill-shaped metadata where shadcn already uses it.

Do not mix highly rounded decorative elements with the operational app shell.

## Components

- **Navigation:** Use the global topbar plus project/domain sidebar from `product-ux-concept.md`. Active route must be visually clear and keyboard reachable. Do not show telemetry navigation before a project is selected.
- **Icons:** Use lucide icons for navigation entries, refresh, filter, copy, pin, unpin, edit, duplicate, delete, expand, collapse, search, warning, error, and link actions. Every button includes an icon. Copy actions are icon-only with an accessible label and tooltip; other visible actions use a concise icon plus label unless they are standard icon-only toolbar controls.
- **Search Inputs:** All search fields use the shared shadcn-backed `SearchInput` component with a leading search icon. Do not hand-compose absolute search icons beside raw `Input` controls in route or feature code.
- **Project Switcher:** Company/project switcher is a compact topbar control with company, project name, and overflow-safe truncation. It opens an anchored popover on desktop and appears first in the mobile menu sheet.
- **Project Picker:** The picker is an operational selector, not a dashboard. Use a centered project-card grid with search/filter, current-selection state, status metadata, and a create-project card/action when authorized. Do not show global stat cards, company rails, marketing cards, nested cards, or decorative project tiles.
- **Create Entity Pages:** Creating a durable entity uses a dedicated route page, not a drawer, sheet, dialog, popover, or inline expansion. Use the standard page frame with breadcrumb/back row, route header, wizard-like tabs, required-field markers, field-level and tab-level validation, a summary error panel, Back/Continue controls, field-adjacent help text, and unsaved-change protection. This applies to new project, new dataset, new evaluation, and new optimization. Adding a row inside an existing dataset remains a contextual row editor.
- **Entity Settings Pages:** Settings for a durable entity use a dedicated route page with the same wizard-like tab structure as creation. Detail pages expose a `Settings` action that navigates to the settings route. Settings-only fields are added to the topical tab that owns them or to a new focused tab; do not create miscellaneous settings buckets.
- **Onboarding:** Project setup lives in `/projects/:projectId/settings/ingest` and empty telemetry states link there. `/projects/:projectId` redirects to `/traces`; do not reintroduce a project overview/onboarding page.
- **Admin Settings Shell:** Project and company administration uses a quiet settings shell with a route header, optional domain sidebar for settings sections, one primary working surface, and inspector drawers for long forms. Company project/member lists are dense tables. Project settings use the entity settings page pattern with the `Identity` tab active by default, do not have a separate overview subpage, and must not use outer card wrappers around inner tables, setup snippets, or alerts. Settings must not appear as a primary telemetry tab.
- **Alert Management:** `/alerts` is a project workspace for rule list, filters, selected-rule inspector, history, and silences. Alert rule creation uses `/alerts/new`; alert rule settings use `/alerts/:ruleId/settings`. Do not use a sheet or dialog for the primary alert rule create/settings workflow. Notification adapter selection is ID-based and safe-metadata-only on alert rule pages. Company admins configure Slack, Teams, email, webhook, and other provider adapter instances in company settings from adapter-provided field schemas; secret fields are write-only and never shown back to the UI.
- **Filters:** Use inputs, selects, comboboxes, date/time fields, and removable filter chips. Suggestions may come from `telemetryFacets`, but manual entry remains available.
- **Tables:** Dense, scan-friendly, keyboard navigable. Rows link to details and preserve visible focus. Data tables are sortable by default. Every meaningful scalar column exposes a sortable header unless the backing contract explicitly forbids sorting or the column only contains controls/actions. Server-backed list routes sort through their query contract; local detail tables may sort in component state. Sort affordances live in the table header with compact direction icons, not in separate toolbar controls when header sorting is available.
- **Primary List Tables:** Route-primary telemetry tables use the full available width and remaining viewport height. The page shell must not scroll for the normal populated list state; the table body scrolls inside the route while headers stay sticky.
- **Breadcrumbs:** Project workspace routes, detail pages, settings pages, and admin subsections render a navigation row above the route headline. The row starts with one icon-only Back button, followed by breadcrumbs. Back and the parent breadcrumb entry preserve URL state and navigate to the same parent. Do not place standalone Back buttons inside unrelated toolbars.
- **Trace Overview:** Compact minimap/flamegraph-style summary synchronized with selected span and search matches.
- **Trace Tree Waterfall:** Virtualized above 500 visible spans. Rows show expandable hierarchy, service, span name, status, duration, event markers, link markers, log markers, selected state, and keyboard tree navigation.
- **Span Filters:** Trace-detail span filters open from a compact icon button in the trace tree waterfall header, not from a separate full-width filter panel.
- **Span Detail Panel:** Trace detail inspector tabs are Attributes, Events, Exceptions, and Links. Summary facts stay in the inspector header/body; logs stay in the dedicated logs panel below the waterfall. On mobile this becomes a shadcn sheet.
- **Span Attributes:** Render attributes as a compact evidence browser with one empty search field, semantic OpenTelemetry groups, raw attributes fallback, key/value rows, and a copy action per row. Do not show default type columns, copy-all controls, or per-row filter buttons in the inspector.
- **Span Links:** Same-trace links select the target span. Cross-trace links navigate only within the current project. Unavailable linked targets show the standard missing-trace state and remain copyable references. Never perform cross-project lookup from a span link.
- **Trace Search:** Use the trace UX concept's full-height table workspace with filter bar, active chips, facet rail/drawer, sticky columns, compact duration bar, and no card wrapper.
- **Log Search:** Logs are search-first. Use a full-height table with filter controls, removable filter chips, a resizable selected-log inspector, body/attributes/correlation tabs, compact copy controls, and trace/span pivot actions. Do not render a permanent left service/facet rail on `/logs`; service and correlation choices belong in filters.
- **Metrics Explorer:** Metrics is a technical explorer, not a dashboard builder. Use metric search/list, query controls, result preview/table, descriptor inspector, and exemplar trace pivots.
- **Dashboards:** Dashboards are saved visual compositions. Use dashboard rail, widget grid, and widget inspector/editor. The project sidebar shows pinned dashboard shortcuts below AI Chat and above primary telemetry navigation, plus collapsible dashboard children from dashboard contracts. Dashboard widgets are typed metric, log, trace, or live trace widgets; do not use `MetricView` compatibility surfaces or arbitrary JSON widget configs.
- **Dashboard Workspace Split:** `/dashboards` without a selected dashboard is a dashboard overview with grouped selectable cards and star/pin controls. `/dashboards?dashboard=<id>` or a new draft is the builder view with a WYSIWYG-style widget canvas and right-side widget editor drawer. Do not show the widget editor on the overview page and do not keep a duplicate dashboard rail inside the builder.
- **Dashboard Builder:** Use one primary `Add widget` button with a compact popover for widget types. Creating or editing a widget opens a right-side drawer/sheet instead of a permanent inspector column. Dashboard title and description are edited in place in the builder header. Metric widgets render actual charts for line, area, bar, pie, stat, and table visualizations where the contract allows them.
- **Form Controls:** Production route code uses shadcn/Radix controls for selects, textareas, checkboxes, toggles, dialogs, and form fields. Do not introduce native select/option/textarea/checkbox inputs or unstyled ad hoc controls in route code.
- **Code Blocks:** JSON, YAML, Bash, log snippets, setup commands, and raw structured evidence use the shared Shiki-backed `CodeBlock` component with copy action and light/dark themes. Do not add ad hoc `<pre>` snippets in route or feature code.
- **Stack Trace:** Render parsed frames when available and raw stack text as fallback. Use monospace, copy controls, and non-overlapping line wrapping.
- **Logs:** Show timestamp offset, severity, service, body preview, trace/span chips, and expandable JSON body/attributes.
- **JSON Viewer:** Collapse large objects by default, preserve copy actions, and keep values readable in both themes.
- **States:** Every data route has loading skeletons, no-telemetry empty state, no-filter-results empty state, inline error with retry, and populated state.
- **Inspector Drawers:** Use right-side drawers on desktop and bottom sheets on mobile for span detail, log preview, metric editor, setup guide, and AI-eval detail surfaces.
- **Dialogs:** Use only for short confirmations or focused interruption tasks. Do not use dialogs for long setup, editing, or investigation flows.
- **Popovers:** Use for compact anchored choices such as company/project selection, filter operators, time presets, and overflow actions.
- **Collapsibles:** Use for optional secondary groups such as facets, advanced filters, setup sections, and dashboard children under the Dashboards sidebar entry. Do not hide primary route entries inside collapsibles.
- **Buttons:** Use one primary button for the next best action in a header, empty state, dialog, or drawer. Use secondary or outline buttons for alternatives, ghost/icon buttons for low-emphasis toolbar actions, and destructive buttons only for irreversible or high-risk mutation confirmation. Destructive actions require clear confirmation when they delete projects, revoke credentials, remove members, or discard unsaved work. Copy buttons never render text labels; they use the shared copy icon-only pattern.

All user-visible product copy, navigation labels, filters, states, and errors go through the frontend translation layer.

## Enterprise UX Flow Rules

- `/` routes to `/projects` after auth.
- `/projects` is the project selection entry point; `/projects/new` is the project creation page.
- `/projects/:projectId` selects the project and redirects to `/traces`.
- `AI Chat`, `Traces`, `Logs`, `Metrics`, `Dashboards`, and `Evaluations` require selected project context. Live trace receiving is a Traces mode and shares the same project context.
- Switching project calls `Mutation.selectProject` and resets project-scoped query state.
- Empty states have one primary action and at most two secondary actions.
- No route-primary table, trace waterfall, metric result surface, dashboard grid, or AI-eval workspace is placed inside a card.
- Create entity pages, entity settings pages, drawers, dialogs, popovers, and collapsibles follow the surface taxonomy in `specs/05-frontend/product-ux-concept.md`.
- Local single-instance mode has exactly one visible company named `Personal`. Treat `Personal` as a real administrative boundary: do not expose destructive organization actions, owner-transfer flows, billing-style management, or multi-company affordances that could imply the local admin company can be deleted or orphaned.

## Main View Mockups

High-fidelity main-view mockups live in `design/mockups/`. The SVG files are the source images; PNG previews in `design/mockups/png/` are generated from the SVGs for quick review. Regenerate both with:

```sh
node design/mockups/cloudgrid-main-view-mockups.mjs
for f in design/mockups/*.svg; do base=$(basename "$f" .svg); sips -s format png "$f" --out "design/mockups/png/$base.png" >/dev/null; done
```

These mockups translate the public website's UI-like visual language into the product app: thin technical borders, muted row density, compact semantic accents, trace/metric/eval evidence as the primary visual content, and neutral shadcn controls. They intentionally do not reuse the website's marketing gradients, glowing surfaces, large cards, or hero composition inside the app.

Current mockup inventory:

- `trace-overview.svg`: `/traces` history/live table with filter bar, active chips, collapsible facet rail, sortable table header, compact duration bars, and status chips.
- `trace-detail.svg`: `/traces/:traceId` route-level investigation with breadcrumb/back row, trace waterfall, synchronized span inspector, and correlated logs below the waterfall.
- `metrics.svg`: `/metrics` technical explorer with metric list, query controls, chart/result preview, series table, and descriptor inspector.
- `logs.svg`: `/logs` search-first workspace with filter bar, selected-log table, and right-side body/attributes/correlation inspector.
- `ai-eval-dataset-overview.svg`: `/ai-eval` Datasets section with route-local Datasets/Evaluations switch, dataset table, health, version, split coverage, and create/import actions.
- `ai-eval-dataset-detail.svg`: dataset detail route state with dataset health summary, row table, `Add row`, `Import`, `Dataset settings`, and `Create evaluation` actions.
- `ai-eval-evaluations-overview.svg`: `/ai-eval` Evaluations section with evaluation definition table, last-run state, primary metric, and comparison entry point.
- `ai-eval-evaluation-detail-result.svg`: evaluation detail/result view with run metrics, item result table, trace links, result inspector, problem callout, and optimization/comparison actions.

Use these images as the starting visual target for frontend implementation tickets, but keep specs authoritative. If implementation discovers missing behavior, update the relevant spec first instead of copying invented mockup details into production code.

Screen-specific guidance:

- Trace overview keeps the facet rail as secondary support. The trace table is the primary surface and should remain useful when the facet rail collapses into a drawer.
- Trace detail gives the waterfall the largest uninterrupted area. The inspector is persistent on desktop and becomes a sheet on mobile; logs remain below the waterfall, not inside inspector tabs.
- Logs do not use a permanent facet sidebar. Search, service, severity, trace/span, time, and advanced filters stay in the filter bar, chips, popovers, or sheets.
- Metrics separates metric discovery, query execution, and descriptor inspection. `/metrics` must not look like a saved dashboard builder.
- AI Eval uses only route-local `Datasets` and `Evaluations` sections. Dataset and evaluation details are route states with breadcrumbs, not nested tabs inside a table row.
- Evaluation result screens should show the next meaningful action near the result evidence: compare, optimize, open traces, or rerun. Promotion belongs to explicit promotion flows after validation evidence exists.

Recommended missing mockups before broad implementation:

- Project picker, first-project empty state, and `/projects/new` creation wizard, because project creation is the main entry mutation and must not become a drawer or stats dashboard.
- Dashboard overview and dashboard builder, because `/metrics` and `/dashboards` have intentionally different jobs.
- Dataset, evaluation, and optimization creation/settings wizards, because these durable AI Eval entities must share the create and settings page patterns.
- Trace `Add to dataset` picker and import preview, because it connects observability evidence to AI Eval without adding dataset actions to the dataset list.
- Project API key/setup page, because telemetry empty states depend on this path for their primary action.

## Rendered Webapp Design Prototype

The primary visual direction now lives in `design/webapp-mockups/`. Unlike the SVG sketches, this is a real browser-rendered HTML/CSS/JS prototype with code-native tables, panels, controls, charts, navigation state, and inspector layouts. Use these screenshots as the main visual target for app implementation and use the SVG set only as a lightweight earlier sketch.

Run locally:

```sh
python3 -m http.server 4177 --directory design/webapp-mockups
```

Open `http://127.0.0.1:4177/#trace-overview` and switch screens from the left navigation, or use these hash routes:

- `#trace-overview`
- `#trace-detail`
- `#logs`
- `#metrics`
- `#dashboards`
- `#dataset-overview`
- `#dataset-detail`
- `#evaluations`
- `#evaluation-detail`

Export the high-resolution PNG screenshots:

```sh
python3 -m http.server 4177 --directory design/webapp-mockups
node design/webapp-mockups/capture-screenshots.mjs
```

Rendered screenshots are written to `design/webapp-mockups/screenshots/`.

Design direction:

- Treat the app as an enterprise evidence cockpit, not a generic admin dashboard.
- Preserve the website's best visual cues: soft desktop-window framing, command-path chrome, live status, muted blue-gray typography, monospace evidence, rounded but restrained panels, and calm technical density.
- Do not copy the website's marketing composition directly. The app prototype introduces a product-grade context rail, command row, active workspace, right-side evidence/setting inspectors, and large uninterrupted data surfaces.
- Keep the standard shadcn neutral theme as the product baseline: white surfaces, neutral borders, black primary buttons, semantic status chips, compact table rows, and no custom brand-colored controls.
- Use non-neutral color only for telemetry meaning: series, severity, status, live state, exemplar marks, and evaluation deltas.
- Prefer one strong workspace composition per route over many small decorative cards. Metric summary tiles are acceptable when they summarize run or dataset health; route-primary telemetry data remains table, timeline, chart, or inspector content.
- Keep app UI code-native. Do not ship screenshots as UI, rasterize text, or replace route tables/charts with static images.

Prototype-specific route notes:

- Trace overview uses a three-lane cockpit: server facet suggestions, trace stream, and investigation queue.
- Trace detail gives the trace waterfall a wide evidence lane, keeps the span inspector persistent, and places correlated logs below as route evidence.
- Logs use a search-first table plus a correlation inspector, with no permanent service facet sidebar.
- Metrics keeps catalog, query result, and descriptor inspector visible at once.
- Dashboards are saved typed widgets; they borrow the website's clean chart widgets but keep dashboard editing actions explicit.
- Dataset and evaluation routes use the same cockpit shell, but local tabs switch only between `Datasets` and `Evaluations`.
- Evaluation result puts run metrics, item results, metric deltas, problem callout, and next actions in one review workspace.

## Do's and Don'ts

- Do use shadcn/ui primitives before custom controls.
- Do use semantic CSS variables and Tailwind tokens instead of raw colors in components.
- Do keep styling flat, token-driven, and shadcn-compatible.
- Do make trace/span/log evidence scannable before making it decorative.
- Do keep selected span and filters shareable in the URL.
- Do support light mode, dark mode, keyboard navigation, and WCAG 2.2 AA contrast.
- Do keep company/project context visible in project workspace mode.
- Do use independent scroll containers for topbar, route header, route-primary workspace, domain sidebar, and inspector layouts.
- Do use onboarding and empty states to move the user to the next product action.
- Do use icons for copy, expand/collapse, filter, search, error, link, logs, stack trace, and theme controls when lucide has a suitable icon.
- Do make stateful action controls describe the action that will happen on click. Expand/collapse labels, icons, tooltips, and `aria-label`s must switch with state; they must not describe only the current state.
- Don't show telemetry navigation before a project is selected.
- Don't build marketing heroes, decorative illustrations, gradient backgrounds, or oversized cards inside the app.
- Don't use cards as page containers, route-primary workspace wrappers, or nested card-in-card compositions.
- Don't replace the global topbar with a permanent app-wide sidebar. Project telemetry route navigation belongs in the project sidebar after project selection, not in topbar tabs.
- Don't hard-code product copy directly in React components.
- Don't render thousands of trace rows or span rows without virtualization.
- Don't hide raw exception or JSON data behind visual summaries.
- Don't use color alone for status, severity, selection, or critical path.
