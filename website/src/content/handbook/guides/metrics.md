---
title: "Metrics"
description: "Use /metrics to discover project metrics, inspect descriptors, query series, test aggregations, and follow exemplar links to traces or spans."
order: 5
accent: violet
eyebrow: "Handbook - Guides"
updated: 2026-05-18
---

Use `/metrics` to discover project metrics, inspect descriptors, query series, test aggregations, and follow exemplar links to traces or spans.

`/metrics` is not the dashboard editor. Saved visual composition belongs in `/dashboards`.

## Metric Discovery

Metric names come from:

```graphql
query MetricNames($input: MetricNameSearchInput!) {
  metricNames(input: $input) {
    items {
      name
      description
      unit
      kind
      aggregationTemporality
      monotonic
      firstSeenAt
      lastSeenAt
    }
    nextCursor
  }
}
```

Use search, service, and time controls to narrow the list. The metric list loads additional backend cursor pages while scrolling; the UI does not filter or page over a client-side subset.

## Series Query

Metric series use `Query.metricSeries`.

```graphql
query MetricSeries($input: MetricSeriesInput!) {
  metricSeries(input: $input) {
    interval
    series {
      id
      label
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

Controls map directly to `MetricSeriesInput`:

- metric name;
- aggregation;
- time range;
- interval;
- group-by keys from the descriptor;
- attribute filters;
- maximum series.

## Exemplars

Metric exemplars may contain trace and span IDs. Exemplar actions open trace detail inside the same project. Missing or unauthorized traces show the normal trace missing or forbidden state.

## Backend-Owned Semantics

Storage-read owns:

- aggregation compatibility;
- grouping and filters;
- interval downsampling;
- result caps;
- warnings;
- exemplar links.

The frontend renders returned series. It must not compute rates, percentiles, joins, formulas, or rollups over broad raw data.

## Common States

| State | Expected behavior |
| --- | --- |
| No metrics | Offer metrics setup. |
| No matching metrics | Clear metric search. |
| No series for range | Keep descriptor visible and offer time range expansion. |
| Query error | Show GraphQL problem details without clearing selected metric. |

## Next Step

Save reusable visualizations with [Dashboards](/handbook/guides/dashboards).
