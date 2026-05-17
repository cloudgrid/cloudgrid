---
id: CAP-MET-003
title: Manage project dashboards
domain: metrics
layer: capability
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: user-directed
traits:
  interaction: graphql
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [TEC-FE-008, TEC-BE-011]
implements:
  api: [GQL-Query-dashboards, GQL-Mutation-saveDashboard, GQL-Mutation-deleteDashboard, GQL-Mutation-setDashboardPinned, GQL-Mutation-reorderDashboardPins, MSG-control-dashboards-list, MSG-control-dashboards-save, MSG-control-dashboards-delete, MSG-control-dashboard-pins-set, MSG-control-dashboard-pins-reorder]
---

# Manage Project Dashboards

## Business Intent

Let users create, customize, arrange, pin, and manage focused project dashboards for service, AI runtime, metric, log, trace, and live investigation questions while keeping the UI simple and the saved contract typed.

The full dashboard editor must feel like a real observability builder: users can add widgets, resize them, drag them into position, duplicate or remove them, save or discard drafts, and build richer metric views without leaving the selected project context.

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
- Production UI hides rich metric query controls until the matching GraphQL, AsyncAPI, TypeScript, and Go generated contracts are present.

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
