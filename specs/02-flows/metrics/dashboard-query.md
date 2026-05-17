---
id: FLW-MET-002
title: Dashboard query flow
layer: flow
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: user-directed
depends_on: [CAP-MET-002, CAP-MET-003]
---

# Dashboard Query Flow

1. User selects a project, then opens Dashboards.
2. Frontend loads dashboards through `Query.dashboards` and metric name suggestions through `Query.metricNames` only when the widget editor needs metric selection.
3. User selects a dashboard, pins a dashboard, or edits a local draft.
4. For each visible widget, frontend calls the existing telemetry GraphQL surface that matches the widget kind:
   - metric widgets use `Query.metricSeries`;
   - log table widgets use `Query.logs`;
   - trace table widgets use `Query.traces`;
   - live trace widgets use `Subscription.liveTraces`.
5. Rich metric widgets, after their contracts are generated, use a storage-read-owned rich metric query GraphQL field rather than frontend fan-out plus React-side combination.
6. The BFF validates GraphQL input and selected project, then routes telemetry queries to storage-read and dashboard mutations to control-plane through message bridge request/reply subjects.
7. Storage-read validates telemetry query inputs and returns GraphQL-ready view models.
8. For rich metric widgets, storage-read resolves all named metric queries, aligns timestamps to the requested interval, evaluates the typed formula AST, applies result limits, and returns chart-ready series plus bounded warnings.
9. Control-plane validates dashboard definitions and pin mutations before persistence.
10. Frontend renders widgets from returned view models only.

Changing project resets dashboard query caches, selected dashboard, visible widget results, pins loaded for the previous project, and local draft edits.

## Layout Edit Flow

1. User enters dashboard builder edit mode.
2. User drags, resizes, reorders, duplicates, removes, or edits a widget.
3. Frontend applies the change to local draft state through the dashboard draft reducer.
4. Frontend layout solver snaps to the 12-column grid, enforces min sizes, resolves collisions by pushing widgets downward, and marks the dashboard dirty.
5. User saves the dashboard.
6. `Mutation.saveDashboard` sends the deterministic widget order and layout values to control-plane.
7. Control-plane validates layout bounds, non-overlap after compaction, widget kind/source pairing, rich-query contract availability, secret-like fields, limits, and version.
8. On success, control-plane returns the saved dashboard version; frontend clears draft history and reloads dashboard list/query cache.
9. On validation or version conflict, frontend keeps the draft open, shows the problem near the save action and affected editor control, and does not discard user edits.

## Rich Metric Query Flow

This flow is inactive in production until the required contracts exist.

1. User adds a rich metric widget or upgrades a metric widget to rich query mode.
2. Frontend renders typed query rows and typed formula controls inside the widget editor `Data` group.
3. Frontend performs local shape validation only: unique query IDs, non-empty metric names, formula references declared earlier, AST depth cap, and supported operator/function names.
4. Frontend sends the typed rich metric query input to GraphQL.
5. BFF validates public input and selected project, then forwards the typed request to storage-read.
6. Storage-read executes the underlying metric queries, aligns series to the requested interval, evaluates formulas, enforces result caps, and returns chart-ready series with warnings.
7. Frontend renders the returned result using the selected chart renderer and does not compute formulas, rates, percentiles, joins, or rollups locally.
