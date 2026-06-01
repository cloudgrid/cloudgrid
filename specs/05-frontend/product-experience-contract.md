---
id: TEC-FE-006
title: Enterprise product experience contract
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-29
provenance: user-requested
depends_on: [TEC-FE-001, TEC-FE-002, TEC-FE-010, TEC-FE-011, TEC-FE-007, TEC-FE-008, TEC-FE-009, TEC-FE-013, TEC-FE-015, DSY-001, NFR-005]
---

# Enterprise Product Experience Contract

## Purpose

This is the concise implementation contract for CloudGrid product UX. It
centralizes the frontend behavior that every route must share so agents can
implement route work without inventing navigation, onboarding, empty states,
disabled states, action placement, or visual grammar.

Detailed route concepts remain in:

- [Enterprise product UX concept](./product-ux-concept.md)
- [Traces and metrics UX concept](./traces-and-metrics-ux-concept.md)
- [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md)
- [AI evaluation UX concept](./ai-eval-ux-concept.md)
- [AI Chat views](./ai-chat-views.md)
- [Alerts UX concept](./alerts-ux-concept.md)

When this contract and route-specific detail conflict, global shell,
navigation, onboarding, action, disabled-state, feedback, and surface-taxonomy
rules in this contract win. Route-specific specs own only their route's data
columns, panels, filters, visualization internals, and domain copy.

## Product Outcomes

CloudGrid routes must help users complete these jobs in this order:

1. Select or create the project where telemetry belongs.
2. Send the first telemetry signal into that project.
3. Confirm data is arriving.
4. Investigate live or historical behavior using traces, logs, metrics, and
   dashboards without losing project context.
5. Configure AI Chat, AI Eval, alerts, retention, and provider settings only
   when the user's current task needs those settings.
6. Save, share, or return to useful project evidence.

## Experience Requirements

| ID | Requirement | Verification |
| --- | --- | --- |
| PEX-001 | Project context is required before project telemetry navigation is visible. `/projects` is the centered selection surface, and `/projects/:projectId` selects the project then redirects to `/traces`. | Shell tests assert no telemetry nav before selection and stable selected-project context after selection. |
| PEX-002 | The global 56px topbar is the only app-wide navigation surface. Project-domain navigation lives in the left project sidebar, and admin navigation lives in the admin settings sidebar. | Desktop and mobile screenshots plus shell tests for project, admin, and no-project modes. |
| PEX-003 | Primary route workspaces are flat, border-led working surfaces. Route containers, telemetry tables, waterfalls, metric grids, dashboard canvases, AI Eval workspaces, and chat transcripts are not wrapped in cards. | Visual review and static scan for route-primary card wrappers. |
| PEX-004 | Every visible action has a single owning surface and a clear outcome. Primary actions live in the route header or the current form footer. Row actions live in rows. Inspector actions live in inspectors. Destructive decisions live in dialogs. | Route tests inspect action placement; Playwright verifies primary flow paths. |
| PEX-005 | Disabled or unavailable actions explain the cause and the enablement path when the user can resolve the condition. Permission-denied actions are hidden unless the route needs to explain read-only access. | Component tests cover disabled feature, missing setup, no data, and permission states. |
| PEX-006 | Empty states name exactly one cause: no project, no telemetry, filters removed all results, feature disabled, missing setup, no permission, backend unavailable, or unsupported route. Each state has exactly one primary action. | Empty-state tests assert cause, primary action, and secondary action count. |
| PEX-007 | Create and settings flows for durable entities use dedicated pages with tabs, field-level validation, tab error indicators, summary errors, explicit save/submit, and unsaved-change protection. | Project, dashboard, AI Eval, alert, and provider settings tests cover validation and route-switch prompts. |
| PEX-008 | Confirmation, warning, information, and error decisions use modal dialogs. Drawers and sheets are contextual work surfaces, not decision gates. `window.confirm` is forbidden. | Static scan for `window.confirm`; route tests for destructive and discard confirmations. |
| PEX-009 | Frontend copy is plain, task-focused, and translatable. User-visible copy in app routes and feature components goes through the translation layer unless it is user data, code, metric names, attribute keys, protocol literals, IDs, GraphQL/query keys, enum wire values, or test fixtures. | Changed route or feature copy adds translation keys in `apps/frontend/src/lib/i18n.ts`, updates a focused static copy scan such as `apps/frontend/test/i18n-copy.test.ts`, and passes route snapshot review. |
| PEX-010 | Navigation and filtering state that users share or revisit belongs in URL state. Local presentation state is limited to collapse state, transient selection, virtualized range, draft form values, and non-secret dismissed guidance. | URL-state tests for traces, logs, metrics, dashboards, AI Eval, and selected inspectors. |
| PEX-011 | Frontend routes render GraphQL view models. Telemetry filtering, aggregation, correlation, ranking, counts, live matching, and metric rollups are backend-owned. | Code review and tests prove route components do not derive backend-owned telemetry semantics. |
| PEX-012 | Mobile and tablet use the same information architecture as desktop. The mobile menu sheet contains company/project switcher first, then project or admin navigation, then help/settings/session actions. | Playwright checks at 390px, 768px, 1024px, and 1440px. |
| PEX-013 | All route states expose accessible focus order, visible labels, keyboard reachability, WCAG 2.2 target size, and non-color-only status. | Accessibility smoke, keyboard checks, and component tests for target and focus behavior. |
| PEX-014 | Feature setup and enablement guidance appears at the point of need. The UI links to the exact settings route that enables the feature and does not display marketing panels inside the product app. | Disabled/missing-setup tests assert link targets and no unrelated setup actions. |
| PEX-015 | Error surfaces expose CloudGrid problem codes, retry actions only for retryable problems, and sanitized messages. They do not expose SurrealDB, NATS, provider tokens, raw bridge payloads, or stack traces. | Error-state tests and security review. |
| PEX-016 | Cursor affordances match actionability: clickable controls and clickable rows use pointer, disabled actions use not-allowed, drag handles use grab/grabbing, and resize handles use directional resize cursors. | Shared primitive tests assert cursor defaults and no actionable primitive uses cursor-default. |
| PEX-017 | Forms use valid defaults whenever the backend contract, project settings, selected entity, or domain preset defines one. Users start from a runnable draft rather than a blank technical payload. | Create/settings tests assert default draft values for each durable form and no missing required value when a safe default exists. |
| PEX-018 | User inputs prefer constrained controls over free-form text: selects, comboboxes, radios, segmented controls, checkboxes, switches, steppers, date/time pickers, file pickers, and schema-backed JSON editors. Free-form text is allowed only for names, descriptions, search, labels, raw JSON/code, or explicit `Custom` branches. | Component tests assert enum/read-model fields render constrained controls and custom inputs are hidden until selected. |
| PEX-019 | Forms are dependency-aware. Changing one field must update available tabs, sections, dependent fields, defaults, validation rules, and summaries so the user sees only logically valid fields for the current selection. | Form tests cover controlling-field changes, hidden/visible dependent fields, reset invalid dependent values, and tab error updates. |
| PEX-020 | Validation helps users self-correct. Errors state what is wrong, the expected shape/range/allowed value, and the action that fixes it. Submission errors focus or link the first invalid visible field and never require backend knowledge to understand. | Validation tests cover field error copy, summary links/focus, backend problem mapping, and no hidden-field blocking errors. |

## Shell And Navigation Contract

Project selection mode:

- Active for `/projects`, `/projects/new`, and project-required guards without a
  selected project.
- Shows CloudGrid identity, company selector when relevant, project selector,
  command/search, setup/help, and user/session actions.
- Hides `AI Chat`, `Traces`, `Logs`, `Metrics`, `Dashboards`, `Evaluations`,
  `Live`, and project settings navigation.
- Renders one centered project picker with search, company context, selectable
  project cards, current selection, create action when authorized, and concise
  local setup guidance.

Project workspace mode:

- Active after `viewer.selectedProject` exists and the route is
  project-scoped.
- Shows the left project sidebar in this order: `AI Chat` when enabled, pinned
  dashboard shortcuts when present, `Traces`, `Logs`, `Metrics`, `Dashboards`,
  `Evaluations` when enabled, then separated `Project settings`.
- Keeps `Live` as a mode inside `/traces`; it is never a primary sidebar entry.
- Keeps `Alerts` reachable through URL, command palette, alert evidence links,
  and alert specs; it is not a primary sidebar item.
- Keeps company/admin settings out of project telemetry navigation.

Admin settings mode:

- Active for organization and company administration routes.
- Uses the global topbar plus a dedicated admin settings sidebar.
- Shows only admin route groups that are specified and authorized.

## Action Availability Contract

| State | Visible behavior | Primary action |
| --- | --- | --- |
| No project selected | Project-scoped route guard redirects or renders project-required state without telemetry navigation. | `Select project` |
| No telemetry ingested | Telemetry route empty state explains setup is incomplete for the selected project. | `Open ingest setup` |
| Filters remove results | Existing route filters stay visible, active chips remain removable, and setup guidance is not primary. | `Clear filters` |
| Feature disabled by flag | Sidebar entry is hidden; direct URL renders a disabled feature state. | Link to relevant settings or handbook page when user can enable it |
| Missing provider/settings | Feature route renders setup-required state with exact project or company settings link. | `Open <feature> settings` |
| Missing permission | Action is hidden when not relevant; read-only routes show a compact permission explanation. | None, or `Request access` only when invitation/access contracts define it |
| Backend unavailable | Route keeps context visible and shows sanitized problem details with retry. | `Retry` only when the problem is retryable |
| Dangerous/destructive action | Button opens confirmation dialog; mutation runs only after explicit confirmation. | Dialog primary destructive action |

## Route Outcome Matrix

| Route | User outcome | First empty/setup action | Primary working surface |
| --- | --- | --- | --- |
| `/projects` | Select or create the active project. | `Create project` when none exist. | Centered project picker. |
| `/projects/new` | Create a durable project and enter it. | Not applicable. | Tabbed create page. |
| `/projects/:projectId/settings/*` | Configure project identity, access, ingest keys, retention, AI providers, and AI Eval defaults. | Not applicable. | Tabbed settings page with topical tables/forms. |
| `/traces` | Search trace history or watch live trace summaries. | `Open ingest setup`. | Trace table with filters, mode control, and facet rail/drawer. |
| `/traces/:traceId` | Understand one trace and selected span evidence. | Trace-not-found problem with route-safe back link. | Waterfall/flow workspace plus span inspector. |
| `/logs` | Search logs and pivot to correlated trace/span evidence. | `Open ingest setup`. | Log table plus selected-log inspector. |
| `/metrics` | Explore technical metric descriptors and series. | `Open ingest setup`. | Metric list, query controls, chart/table, and metric inspector. |
| `/dashboards` | View, compose, edit, pin, and share reusable dashboard evidence. | Built-in dashboard or `Create dashboard` when authorized. | Dashboard rail, canvas, and right editor/inspector. |
| `/ai-chat` | Ask project-scoped questions and inspect safe artifacts/actions. | `Open company AI provider settings` when missing. | Conversation rail, transcript, artifact renderer, prompt input. |
| `/ai-eval` | Curate datasets, run evaluations, compare results, and optimize prompts. | `Open AI Eval settings` or `Create dataset` based on feature/setup state. | AI Eval left rail, main workspace, and right inspector. |
| `/alerts` | Manage rules, history, silences, and evidence pivots. | `Create alert rule` when authorized. | Rule/history workspace with detail panels. |
| `/organizations/*` | Manage company projects, members, provider settings, and adapter settings. | Context-specific admin action. | Admin settings shell. |

## Feedback And Validation Contract

### Form Input Contract

- Every create/settings form starts from a deterministic draft. Defaults come
  from, in order: selected source entity, project settings, backend-provided
  defaults/read models, domain defaults in specs, and finally a safe product
  default. If no valid default exists, the field is empty and the UI explains
  the missing prerequisite beside the field.
- Form controls must reflect the domain type:
  - enums and finite option sets render as select, radio, segmented control, or
    combobox;
  - booleans render as checkbox or switch;
  - numeric bounded values render as number input, stepper, or slider with min,
    max, and unit;
  - dates/times render date/time controls;
  - files/directories/packages render file/package pickers;
  - raw JSON and JSON Schema render the shared JSON editor;
  - IDs and refs render object pickers or read-only links, not text inputs.
- Free-form text is reserved for names, descriptions, search, labels, raw JSON
  or code editors, and explicit `Custom` branches. A `Custom` branch must be a
  deliberate option and must explain the expected value before showing the text
  input.
- Dependent fields that do not apply to the current selection are hidden, not
  disabled. Fields that do apply but cannot be changed because of permission,
  lifecycle, or missing setup remain visible and disabled with a reason and the
  enablement path.
- When a controlling selection changes, the form must clear or recompute any
  dependent value that is no longer valid before the user can submit. The UI
  shows a small inline note when a previously entered value was removed or
  replaced by a default.
- Hidden fields must not block submission. If a backend problem references a
  field hidden by the current selection, the summary error must identify the
  controlling selection that makes the field unavailable and offer the next
  valid action.
- Tabs and steps must be generated from applicable sections for the current
  draft. A tab with no applicable fields is hidden. A tab with invalid visible
  fields shows an error indicator.
- Server-side validation remains authoritative. Frontend validation is a
  usability layer that mirrors contract constraints exposed by generated
  contracts or GraphQL read models and maps backend Problem Details into the
  owning field, tab, or summary panel.

- Product copy in labels, helper text, empty states, validation, and actions
  uses the audience's business/domain wording before implementation wording.
  Technical terms appear only when the user is explicitly configuring or
  inspecting that technical artifact.
- Copy actions update an accessible status region for at least two seconds.
- Save, create, update, pin, unpin, pause, resume, and toggle actions render
  pending, success, and failure state in the owning surface.
- Field validation appears below the field, marks the control invalid, and marks
  the tab when a tabbed create/settings page contains the field.
- Raw JSON payloads, JSON schemas, and structured JSON settings are edited with
  the shared JSON editor control. It preserves raw text editing and validation
  semantics; it is not a visual JSON builder.
- Submission validation failures render one summary panel above the active form
  topic and link or focus the first invalid field.
- Retriable backend problems show one retry action. Non-retriable problems show
  a stable explanation and the next safe navigation/action.
- Async run starts navigate to the run or workspace view that can show progress.
  The route must expose cancellation only when the backend contract defines
  cancellation.

## Onboarding And Setup Contract

- Onboarding is progressive and contextual; no blocking first-run tour exists.
- Project setup appears in `/projects/:projectId/settings/ingest` and in
  no-telemetry empty states.
- Setup snippets must be project-scoped and must not include SurrealDB
  credentials, NATS credentials, provider tokens, session cookies, or stored
  ingest secrets.
- Secret values are displayed only once at creation time and are never written
  to URL state, screenshots, logs, local storage, or generated assets.
- AI Chat setup links to company AI provider settings. AI Eval setup links to
  project AI provider/model-alias settings and AI Eval policy settings.
- Feature guidance uses one next action plus at most two secondary links. It
  does not include unrelated feature marketing or generic documentation grids.

## Data, Security, And Authority

- Frontend talks only to the TypeScript BFF.
- Frontend uses generated GraphQL/UI contracts; it does not duplicate backend
  schemas in route files.
- GraphQL view models are authoritative. The frontend owns presentation state
  only.
- Browser storage may hold theme, locale, collapsed presentation state, and
  dismissed non-secret setup hints. It must not hold tokens, secrets, provider
  credentials, ingest keys, raw telemetry payloads, or durable project data.
- Authorization comes from BFF session and GraphQL/control-plane results.
  Frontend state cannot grant access, infer hidden projects, or select
  unauthorized company/project IDs.

## Production Readiness

- Each route-level implementation ticket must include desktop, tablet, and
  mobile visual QA plus keyboard checks for the primary flow.
- Every changed route must cover loading, populated, empty, filtered-empty,
  feature-disabled or missing-setup, permission, and backend-unavailable states.
- Any new durable route, action, setting, or state requires a matching source
  spec, GraphQL/AsyncAPI/JSON Schema contract when data crosses a boundary,
  generated UI contract updates, and acceptance tests.
- Any implementation need not covered here or in the route-specific specs
  blocks implementation until the relevant source spec is updated.
