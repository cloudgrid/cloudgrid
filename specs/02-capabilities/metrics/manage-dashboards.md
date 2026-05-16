---
id: CAP-MET-003
title: Manage project dashboards
domain: metrics
layer: capability
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
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

## Acceptance Criteria

- Given a valid personal dashboard, `Mutation.saveDashboard` persists it through control-plane and returns the saved version.
- Given a valid project dashboard and an admin user, `Mutation.saveDashboard` persists it through control-plane and returns the saved version.
- Given a non-admin user saving a project dashboard, save returns ERR-016.
- Given an invalid widget aggregation, layout, source config, or secret-bearing field, save returns ERR-001 and does not persist a partial dashboard.
- Given a visible dashboard, `Mutation.setDashboardPinned` updates the current user's project pin list.
- Given more than five pinned dashboard IDs, `Mutation.reorderDashboardPins` returns ERR-001.
- Given a user without access to the dashboard, pin operations return ERR-016.
