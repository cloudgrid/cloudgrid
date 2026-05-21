---
name: cloudgrid-metrics-investigation
description: Investigates CloudGrid metrics through AI Chat, the metrics explorer, BFF GraphQL, storage-read metric query semantics, or dashboard metric evidence. Use when comparing series, aggregations, exemplars, or metric artifacts without frontend or BFF query shortcuts.
---

# CloudGrid Metrics Investigation

Use this skill when investigating or implementing metric behavior for AI Chat,
`/metrics`, dashboard metric widgets, metric comparisons, time-series charts,
group-by analysis, aggregation compatibility, or exemplar pivots.

## Source Order

Read these before changing behavior:

1. `specs/spec.md`
2. `specs/00-conventions.md`
3. `specs/04-backend/backend-architecture.md`
4. `specs/04-backend/ai-chat.md`
5. `specs/04-backend/metrics-signal.md`
6. `specs/05-frontend/ai-chat-views.md`
7. `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`
8. `specs/02-capabilities/metrics/query-metrics.md`
9. `specs/02-flows/metrics/dashboard-query.md`
10. `specs/02-flows/ai-chat/chat-run.md`
11. `specs/03-contracts/graphql/public-schema.graphql`
12. `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
13. `specs/03-contracts/errors.yaml`

If the behavior is not specified, update the relevant spec first. Do not invent
GraphQL fields, metric aggregations, rollups, grouping rules, NATS subjects, or
error codes.

## Investigation Rules

- Keep metric investigation in CloudGrid. Do not defer primary analysis to
  Datadog, Jaeger, Zipkin, Prometheus, or another external product when
  CloudGrid has the project data.
- Use `telemetry.queryMetrics` in AI Chat and `Query.metricSeries` or the
  spec-approved rich metric query path in BFF/frontend work.
- Use `metric_timeseries`, `metric_bar`, `table`, `key_value`, and
  `status_summary` json-render artifacts for assistant evidence.
- Store large tool results as bounded sandbox JSON or JSONL files and pass only
  schema summaries, row counts, and samples to the model.
- Link exemplars only to same-project CloudGrid trace/span routes.

## Boundaries

- Frontend owns presentation state only; it must not calculate rates,
  percentiles, rollups, counts, grouping, downsampling, descriptor metadata, or
  exemplar correlation from raw records.
- BFF must not filter, aggregate, rank, correlate, or enrich telemetry records.
- Storage-read owns metric query semantics and must push supported filters,
  grouping, counts, sorting, cursor predicates, and bounded facets into its
  database adapter.
- Do not query SurrealDB directly from frontend, BFF, AI Chat tools, sandbox
  scripts, docs examples, or skill output.
- Do not call NATS directly from frontend or sandbox scripts.

## Working Checklist

1. Read the source specs for the metric surface being touched.
2. Identify whether the change is metric semantics, BFF mapping, frontend
   rendering, dashboard composition, or AI Chat artifact output.
3. Keep query semantics in storage-read and UI behavior in frontend.
4. Render charts and tables with approved json-render catalog keys.
5. Add focused tests for metric query mapping, artifact validation, or UI
   states.
6. Run the narrowest relevant checks; contract changes require
   `bun run contracts:check`.
