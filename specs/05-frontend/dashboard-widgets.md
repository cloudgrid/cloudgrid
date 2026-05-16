---
id: TEC-FE-008
title: Dashboard widgets
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
provenance: user-requested
depends_on: [TEC-BE-011, TEC-BE-017]
---

# Dashboard Widgets

This spec defines saved dashboard configuration requirements. Concrete route layout, dashboard rail behavior, widget editor placement, and route acceptance are defined in [Logs, metrics explorer, and dashboards UX concept](./logs-metrics-dashboards-ux-concept.md).

## Intent

Each project can have reusable dashboards made from typed widgets. Dashboards answer common operational questions without forcing users to rebuild metric, log, trace, or live views every time.

## Saved Dashboard Definitions

A saved dashboard belongs to exactly one selected project and contains:

- name, description, tags, visibility, default time window, version, created/updated metadata;
- ordered, positioned widgets with stable IDs and bounded grid layout;
- one typed widget source per widget kind;
- metric widgets with metric name, aggregation, grouping, filters, time window, interval, visualization, legend, max series, and typed thresholds;
- log table widgets with search/filter/sort/column/limit config compatible with `LogSearchInput`;
- trace table widgets with search/filter/sort/column/limit config compatible with `TraceSearchInput`;
- live trace table widgets with bounded filter config compatible with `LiveTraceInput`.

Dashboard definitions are low-volume project configuration stored by control-plane. The frontend must not use browser localStorage as the source of truth for saved dashboards or pins.

## UX Rules

- The project sidebar exposes Dashboards after a project is selected.
- Pinned dashboards appear above primary navigation only when `DashboardListResult.pinnedDashboardIds` or `DashboardPreferences.pinnedDashboardIds` is available.
- The Dashboards sidebar entry may expand to show visible custom dashboards; the parent entry still opens `/dashboards`.
- `/metrics` remains a technical metric explorer and does not show dashboard management.
- `/dashboards` is the saved visual composition workspace.
- Built-in dashboards include GenAI token usage, model operation duration, harness run duration, tool duration, service health, and error counters when matching telemetry exists.
- Users can duplicate built-in dashboards into personal or project dashboards.
- Personal dashboards are visible only to the owner. Project dashboards are visible to all company members with selected-project access.
- Saving a dashboard is explicit. Editing a built-in dashboard creates an unsaved draft until the user saves it as personal or project visibility.
- The widget editor uses exactly three groups: `Data`, `Display`, and `Thresholds`.
- The widget grid uses stable responsive slots. Loading, empty, and error states must not resize adjacent widgets.
- Widget actions use concise icons with accessible labels: edit, duplicate, remove, pin, unpin, expand, copy link, refresh, filter, and overflow.
- Destructive widget/dashboard removal uses destructive styling only in the confirmation dialog.
- Unsaved edits prompt before project switch, route switch, or drawer close.

## Frontend Data Rules

- Frontend renders GraphQL dashboard and telemetry view models only.
- Frontend may keep local draft state while editing, but save always calls `Mutation.saveDashboard`.
- Frontend must not compute metric rates, percentiles, rollups, trace counts, log counts, or live event semantics from raw telemetry.
- Metric widgets execute through `Query.metricSeries`.
- Log widgets execute through `Query.logs`.
- Trace widgets execute through `Query.traces`.
- Live trace widgets execute through `Subscription.liveTraces`.
- Dashboard pin writes use `Mutation.setDashboardPinned` and `Mutation.reorderDashboardPins`.

## Validation

Saving a dashboard validates widget count, layout bounds, supported widget kind, exactly one matching widget config per kind, metric names, allowed grouping attributes, aggregation compatibility, filters, table columns, time range bounds, and result limits before control-plane persistence. Invalid definitions fail with `ERR-001`.
