---
title: "Dashboards"
description: "Use /dashboards to view, create, edit, and manage reusable project dashboards."
order: 6
accent: violet
eyebrow: "Handbook - Guides"
updated: 2026-05-18
---

Use `/dashboards` to view, create, edit, and manage reusable project dashboards.

Dashboards are project-scoped control-plane configuration. They are not telemetry records and they do not store secrets.

## Dashboard Modes

| Mode | Route shape | Purpose |
| --- | --- | --- |
| Overview | `/dashboards` | Search pinned, built-in, personal, and project dashboards. |
| Builder | `/dashboards?dashboard=<id>` | View or edit one dashboard canvas. |
| Draft | `/dashboards` with new draft state | Create a dashboard before save. |

Built-in dashboards are read-only. Editing a built-in dashboard creates an unsaved personal or project draft.

## Widget Types

| Widget kind | Backing operation |
| --- | --- |
| `metric_timeseries` | `Query.metricSeries` |
| `metric_stat` | `Query.metricSeries` |
| `metric_table` | `Query.metricSeries` |
| `metric_rich` | `Query.richMetricSeries` |
| `log_table` | `Query.logs` |
| `trace_table` | `Query.traces` |
| `live_trace_table` | `Subscription.liveTraces` |

## Layout

Dashboard widgets use a persisted 12-column grid:

| Field | Meaning |
| --- | --- |
| `x` | Column start, `0..11`. |
| `y` | Row start, `0` or greater. |
| `w` | Width, `1..12`. |
| `h` | Height, `1..12`. |
| `minW` | Minimum width, `1..12`. |
| `minH` | Minimum height, `1..12`. |

Move and resize behavior is local draft state until `Mutation.saveDashboard`. Compaction must leave no overlaps and preserve deterministic widget order.

## Rich Metric Widgets

Rich metric widgets use typed query rows and typed formula expressions. They are not SQL, SurrealQL, JavaScript, or arbitrary JSON.

```graphql
query PreviewRichMetric($input: RichMetricSeriesInput!) {
  richMetricSeries(input: $input) {
    interval
    series {
      id
      label
      sourceId
      unit
      points {
        timestamp
        value
      }
    }
    warnings {
      code
      message
      field
    }
  }
}
```

Storage-read owns timestamp alignment, formula evaluation, result caps, warnings, and chart-ready series.

## Save A Dashboard

```graphql
mutation SaveDashboard($input: SaveDashboardInput!) {
  saveDashboard(input: $input) {
    id
    version
    widgets {
      id
      kind
    }
  }
}
```

Updates require the current `version`; stale versions fail and do not overwrite newer changes.

## What Not To Store

Dashboard definitions must not contain:

- bearer tokens or API keys;
- session cookies;
- SurrealDB credentials;
- provider secrets;
- executable code;
- raw SQL or SurrealQL;
- arbitrary JSON widget configuration;
- external embeds.

## Next Step

Explore raw metric data first with [Metrics](/handbook/guides/metrics), then save dashboard views when the query is useful.
