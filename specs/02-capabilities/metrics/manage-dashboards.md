---
id: CAP-MET-003
title: Manage project dashboards
domain: metrics
layer: capability
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-22
provenance: user-directed
traits:
  interaction: graphql
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [TEC-FE-013, TEC-FE-012, TEC-BE-011]
implements:
  api: [GQL-Query-dashboards, GQL-Mutation-saveDashboard, GQL-Mutation-deleteDashboard, GQL-Mutation-setDashboardPinned, GQL-Mutation-reorderDashboardPins, MSG-control-dashboards-list, MSG-control-dashboards-save, MSG-control-dashboards-delete, MSG-control-dashboard-pins-set, MSG-control-dashboard-pins-reorder]
---

# Manage Project Dashboards

## Business Intent

Let users create, customize, arrange, pin, and manage focused project dashboards for service, AI runtime, metric, log, trace, and live investigation questions while keeping the UI simple and the saved contract typed.

The full dashboard editor must feel like a real observability builder: users can add widgets, resize them, drag them into position, duplicate or remove them, save or discard drafts, and build richer metric views without leaving the selected project context.

## Implementation Baseline And Gap Closure

The repository already contains a partial dashboard implementation. Autonomous agents must treat the following as the current baseline, not as the full target:

- `Query.dashboards`, `Mutation.saveDashboard`, `Mutation.deleteDashboard`, `Mutation.setDashboardPinned`, and `Mutation.reorderDashboardPins` exist and route through the TypeScript BFF to control-plane request/reply subjects.
- Control-plane persists personal and project dashboards, returns built-in dashboards, validates one matching widget source per widget kind, validates bounded grid layout, validates secret-like fields, and owns dashboard pins.
- `/dashboards` has an overview page, grouped cards, a builder canvas, a right-side sheet editor, metric/log/trace/live/alert widget rendering, and basic pointer/keyboard move and resize controls.
- The implementation is still not the accepted full editor. It is missing or incomplete for reducer-owned draft state, undo/redo, field-level dirty markers, complete widget editor controls, right/bottom resize handles, insertion/resize previews, mobile stacked editing, version-conflict recovery, explicit view/edit mode, copy/expand links, full chart catalog fidelity, accessible dashboard pin reordering, and route-switch/project-switch discard protection beyond dashboard selection.

Agents closing dashboard gaps must implement the missing target behavior. They must not preserve a poor current UI pattern just because it exists, and they must not invent a different product shape outside this spec.

## No-Agent-Decision Rules

- Do not create dashboard data models outside `Dashboard` and `DashboardWidget`.
- Do not reintroduce `MetricView`, dashboard-local metric compatibility types, raw JSON widget configs, executable formulas, SQL, SurrealQL, JavaScript, or frontend-only formula semantics.
- Do not add dashboard REST endpoints or frontend direct NATS/storage calls.
- Do not compute metric rates, percentiles, rollups, joins, formulas, log counts, trace counts, alert counts, or live semantics in the frontend or BFF.
- Do not store saved dashboards or pins in browser storage. Browser storage may hold only unsaved presentation draft state that cannot become shared truth.
- Do not expose rich metric creation/edit controls in production unless `Query.richMetricSeries`, GraphQL dashboard rich metric inputs, AsyncAPI request/reply schemas, generated TypeScript contracts, generated Go contracts, storage-read execution, full formula function coverage, complete typed editor controls, and focused rich metric tests are present and passing `bun run contracts:check`.
- Do not create, update, enable, disable, silence, or delete alert rules from dashboard widgets.
- Do not add new widget kinds, chart kinds, mutation semantics, role rules, pin limits, layout dimensions, sidebar ordering, or route structure without updating specs, GraphQL, AsyncAPI, generated contracts, and focused tests first.

## Constraints

- Dashboards belong to one selected project.
- Built-in dashboards are returned by the control-plane read model and are not mutable rows until duplicated.
- Personal dashboards are visible only to their owner.
- Project dashboards are visible to all company members with selected-project access.
- Company members may save and delete their own personal dashboards.
- Company `admin` users may save and delete project dashboards.
- Dashboard pins are user preferences and do not require `admin`.
- Saved dashboards validate widget kind, layout, metric names, aggregations, grouping keys, filters, table columns, limits, and time range bounds.
- Browser localStorage may store only local draft UI state, never saved dashboard or pin truth.
- There is no `MetricView` compatibility surface. GraphQL, message contracts, UI copy, and code use `Dashboard` and `DashboardWidget`.
- Dragging and resizing widgets are local draft operations until `Mutation.saveDashboard` succeeds.
- Rich metric queries are allowed only through typed query and formula contracts. They must not use raw SQL, SurrealQL, JavaScript, arbitrary JSON, or frontend-only formulas.
- Storage-read owns rich metric query execution, timestamp alignment, formula evaluation, warnings, and returned chart-ready series. The TypeScript BFF must not combine metric query results.
- Production UI hides rich metric creation/edit controls until the matching GraphQL, AsyncAPI, TypeScript, Go, storage-read, BFF, frontend editor, and focused test coverage are complete. Existing saved rich metric widgets may render through `Query.richMetricSeries` when available, but unsupported editor controls must remain disabled with an explicit unavailable reason.
- Current rich metric implementation is partial: the machine contracts and storage-read request path exist, but not every allowed formula function and not every editor control in this spec is implemented. Agents must close that gap or update this spec to reduce the allowed function set.

## Functional Scope

Dashboard overview scope:

- load dashboard cards from `Query.dashboards` with `includeBuiltins: true`;
- group visible cards in this exact order: pinned, built-in, personal, project;
- search by calling `Query.dashboards(input.query)` rather than filtering a stale local list;
- pin and unpin through `Mutation.setDashboardPinned`;
- reorder pins through `Mutation.reorderDashboardPins` when the UI exposes ordering;
- open a selected dashboard through `/dashboards?dashboard=<dashboardId>`;
- create a new unsaved personal draft when the user selects `Create dashboard`;
- duplicate a built-in or saved dashboard into an unsaved draft before save.

Dashboard builder scope:

- view mode renders widgets and low-risk actions only;
- edit mode renders drag handles, resize handles, duplicate/remove/edit controls, dirty state, save/discard actions, and the add-widget popover;
- editing an existing mutable dashboard starts a draft with `id` and `version`;
- editing a built-in dashboard starts a duplicate draft without `id` or `version`;
- saving sends the sorted, compacted widget array through `Mutation.saveDashboard`;
- successful save clears draft history, dirty markers, and selected editor state, then reloads dashboard list data;
- failed save keeps the draft open and renders the GraphQL problem near the save action and near the affected editor control when the field can be identified;
- stale version errors keep user edits and show `Reload dashboard` and `Save as copy` actions.

Widget editor scope:

- the editor is a right drawer on desktop and a bottom sheet on mobile;
- the drawer has exactly three groups: `Data`, `Display`, and `Thresholds`;
- `Data` owns query/source controls for the selected widget kind;
- `Display` owns title, description, visualization, table columns, density, legend, axis, unit, and layout controls;
- `Thresholds` is shown only for metric widgets and rich metric widgets; it is hidden for log, trace, live trace, and alert widgets;
- closing the drawer with dirty widget changes opens the same discard confirmation model as dashboard selection, route switch, and project switch;
- applying widget editor changes mutates only the local draft until save.

Data execution scope:

- metric widgets call `Query.metricSeries`;
- rich metric widgets call `Query.richMetricSeries` for existing saved widgets when the field is available; creating or editing rich metric widgets remains production-gated until formula function coverage and typed editor controls are complete;
- log widgets call `Query.logs`;
- trace widgets call `Query.traces`;
- live trace widgets call `Subscription.liveTraces`;
- `alert_status` calls `Query.alertSummary`;
- `alert_history` and `alert_evidence` call `Query.alertHistory`;
- each widget renders loading, empty, warning, and error states locally and never fails the entire dashboard canvas.

## Implementation Tickets For Gap Closure

Autonomous planning for the dashboard gap closure must use [Dashboard implementation contract](../../05-frontend/dashboard-implementation-contract.md) as the ticket source of truth. The following capability-level tickets summarize that contract and must not be broadened without updating the frontend implementation contract first:

| Ticket | Owner boundary | Write scope | Acceptance |
| --- | --- | --- | --- |
| DASH-1 | frontend | `apps/frontend/src/features/dashboards`, `apps/frontend/src/routes/dashboards-route.tsx` | Dashboard draft state moves to a tested reducer with selected widget, undo/redo, dirty markers, discard reasons, save payload creation, and version-conflict state. |
| DASH-2 | frontend | `apps/frontend/src/features/dashboards/dashboard-layout.ts`, dashboard layout tests | Layout solver supports move, resize from right/bottom/corner handles, collision compaction, deterministic sort, 12-column bounds, 6-column projection, mobile stack ordering, and insertion/resize previews. |
| DASH-3 | frontend | dashboard widget editor modules | Widget editor exposes complete typed controls for metric, log, trace, live trace, alert, and gated rich metric widgets using the fixed `Data`, `Display`, `Thresholds` groups. |
| DASH-4 | frontend | dashboard renderers and route | Widget renderers support stable dimensions, local loading/error/empty states, copy/expand/pivot actions, chart labels, warning display, and no React-side telemetry aggregation. |
| DASH-5 | frontend/BFF/control-plane only if required by missing contract evidence | dashboard pin UI, BFF tests, control-plane tests | Sidebar and overview pins use persisted preferences only, cap at five, support accessible reordering where exposed, and never use browser-local pin truth. |
| DASH-6 | contracts/storage-read/BFF/frontend | `specs/03-contracts`, generated contracts, storage-read, BFF, frontend | Rich metric widgets become production-creatable/editable only after storage-read supports every allowed formula operator/function, generated contract checks pass, BFF forwards without deriving, and frontend typed controls/tests cover rows, formulas, display series, validation, warnings, and rendering. |

## Acceptance Criteria

- Given a valid personal dashboard, `Mutation.saveDashboard` persists it through control-plane and returns the saved version.
- Given a valid project dashboard and an admin user, `Mutation.saveDashboard` persists it through control-plane and returns the saved version.
- Given a non-admin user saving a project dashboard, save returns ERR-016.
- Given an invalid widget aggregation, layout, source config, or secret-bearing field, save returns ERR-001 and does not persist a partial dashboard.
- Given a visible dashboard, `Mutation.setDashboardPinned` updates the current user's project pin list.
- Given more than five pinned dashboard IDs, `Mutation.reorderDashboardPins` returns ERR-001.
- Given a user without access to the dashboard, pin operations return ERR-016.
- Given a widget is dragged or resized in builder edit mode, the frontend updates only the local draft layout, shows the dirty state, and sends the new layout only when the user saves.
- Given a move or resize would overlap another widget, the frontend layout engine compacts affected widgets downward and persists a non-overlapping 12-column layout.
- Given a keyboard-only user, the dashboard builder supports selecting, moving, resizing, duplicating, removing, and editing a widget without pointer input.
- Given a mobile viewport, the dashboard builder renders a stacked layout with move up/down actions and sheet-based widget editing instead of freeform drag-resize.
- Given a rich metric formula references an unknown query, uses a disallowed operation, exceeds AST depth, or mixes incompatible units, save or query execution returns ERR-001 and the frontend shows the validation problem beside the relevant editor control.
- Given a rich metric widget is valid, GraphQL execution returns storage-read-computed series and warnings; the frontend renders the returned series without aggregating or joining metric results in React.
- Given a route switch, project switch, dashboard switch, or editor close would discard dirty draft changes, the frontend shows the same discard confirmation and does not silently lose edits.
- Given a stale dashboard version is saved, the frontend keeps the draft open, shows a version-conflict state, and offers reload or save-as-copy without mutating the stale dashboard.
- Given a widget query fails, only that widget shows retry and the problem code; other widgets remain usable.
- Given rich metric function coverage, editor controls, or contract generation checks are incomplete, production UI does not expose `metric_rich` creation, editing, or save paths; saved rich widgets render read-only when `Query.richMetricSeries` is available and otherwise show an unsupported-contract state.
