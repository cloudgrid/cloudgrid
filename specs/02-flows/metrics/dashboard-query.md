---
id: FLW-MET-002
title: Dashboard query flow
layer: flow
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-15
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
5. The BFF validates GraphQL input and selected project, then routes telemetry queries to storage-read and dashboard mutations to control-plane through message bridge request/reply subjects.
6. Storage-read validates telemetry query inputs and returns GraphQL-ready view models.
7. Control-plane validates dashboard definitions and pin mutations before persistence.
8. Frontend renders widgets from returned view models only.

Changing project resets dashboard query caches, selected dashboard, visible widget results, pins loaded for the previous project, and local draft edits.
