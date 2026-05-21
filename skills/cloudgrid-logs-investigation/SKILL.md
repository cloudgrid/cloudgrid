---
name: cloudgrid-logs-investigation
description: Investigates CloudGrid logs through AI Chat, frontend log views, BFF GraphQL, or storage-read log query paths. Use when inspecting severity, correlation, error clusters, trace pivots, or CloudGrid-native log evidence without bypassing architecture boundaries.
---

# CloudGrid Logs Investigation

Use this skill when investigating or implementing log behavior for CloudGrid AI
Chat, `/logs`, log search, log-to-trace pivots, severity analysis, error
clusters, or log evidence artifacts.

## Source Order

Read these before changing behavior:

1. `specs/spec.md`
2. `specs/00-conventions.md`
3. `specs/04-backend/backend-architecture.md`
4. `specs/04-backend/ai-chat.md`
5. `specs/04-backend/ai-runtime-structure.md`
6. `specs/04-backend/log-ingestion-boundary.md`
7. `specs/05-frontend/ai-chat-views.md`
8. `specs/05-frontend/logs-metrics-dashboards-ux-concept.md`
9. `specs/02-flows/ai-chat/chat-run.md`
10. `specs/03-contracts/graphql/public-schema.graphql`
11. `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
12. `specs/03-contracts/errors.yaml`

If the behavior is not specified, update the relevant spec first. Do not invent
GraphQL fields, routes, log filters, NATS subjects, storage fields, or error
codes.

## Investigation Rules

- Keep log investigation CloudGrid-native. Do not send users to external tools
  for primary evidence when CloudGrid has the project data.
- Use `telemetry.searchLogs` for AI Chat log lists and the approved GraphQL log
  query path for frontend/BFF work.
- Prefer `log_list`, `table`, `key_value`, `status_summary`, and
  `trace_waterfall` json-render artifacts for assistant output.
- Treat timestamp, severity, service, trace ID, span ID, attributes, and text
  search as storage-read-owned query semantics.
- Summaries must cite bounded tool evidence, artifact IDs, row ranges, or
  CloudGrid route links. Do not infer counts from samples.

## Boundaries

- Frontend talks only to the TypeScript BFF.
- BFF talks to storage-read through message bridge request/reply.
- Storage-read owns log filtering, sorting, cursor predicates, counts,
  correlation, and bounded facets.
- Do not query SurrealDB directly from frontend, BFF, AI Chat tools, sandbox
  scripts, docs examples, or skill output.
- Do not use NATS subjects directly from frontend or sandbox scripts.
- Do not expose SurrealDB credentials, NATS credentials, provider tokens, raw
  authorization headers, hidden model prompts, or raw provider responses.

## Working Checklist

1. Read the source specs for the log route, tool, or contract being touched.
2. Confirm whether the change belongs in frontend presentation, BFF mapping, or
   storage-read query semantics.
3. Use CloudGrid GraphQL or AI Chat read tools, never direct storage access.
4. Render evidence with approved json-render catalog keys.
5. Add focused tests for changed log query mapping, view models, artifacts, or
   UI state.
6. Run the narrowest relevant checks; contract changes require
   `bun run contracts:check`.
