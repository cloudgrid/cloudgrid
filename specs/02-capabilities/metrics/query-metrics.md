---
id: CAP-MET-002
title: Query metric series
domain: metrics
layer: capability
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-14
provenance: user-directed
traits:
  interaction: graphql
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [TEC-BE-017]
implements:
  api: [GQL-Query-metricSeries, GQL-Query-metricNames, MSG-telemetry-metrics-query, MSG-telemetry-metrics-names]
---

# Query Metric Series

## Business Intent

Let users inspect project-scoped metric trends through backend-owned rollups and grouping without learning a query language first.

## Constraints

- Public reads use GraphQL only.
- Queries require a selected project and `telemetry:read`.
- Storage-read executes filtering, grouping, aggregation, rate conversion, percentile calculation, and downsampling.
- The BFF maps GraphQL inputs to message bridge requests and must not aggregate or reduce points.
- The frontend renders `MetricSeriesResult` and must not compute rates, percentiles, rollups, or cardinality reduction.

## Acceptance Criteria

- Given a metric name, time range, aggregation, and grouping, storage-read returns bounded series points sorted by time.
- Given no matching metric data, GraphQL returns an empty `series` array with the resolved interval and no error.
- Given an unsupported aggregation for the metric kind, storage-read returns ERR-001.
