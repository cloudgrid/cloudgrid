---
name: cloudgrid-trace-investigation
description: Use for CloudGrid trace investigation through AI Chat, frontend trace views, BFF GraphQL, or storage-read query paths. Guides agents to inspect latency, errors, service impact, span waterfalls, related logs, and CloudGrid-native evidence without bypassing architecture boundaries.
---

# CloudGrid Trace Investigation

Use this skill when investigating or implementing trace investigation behavior
for CloudGrid AI Chat, `/traces`, `/traces/:traceId`, trace waterfalls, slow
trace analysis, error traces, service impact, or trace-to-log pivots.

## Source Order

Read these before changing behavior:

1. `specs/spec.md`
2. `specs/00-conventions.md`
3. `specs/04-backend/backend-architecture.md`
4. `specs/04-backend/ai-chat.md`
5. `specs/05-frontend/ai-chat-views.md`
6. `specs/05-frontend/traces-and-metrics-ux-concept.md`
7. `specs/05-frontend/trace-investigation-ux.md`
8. `specs/02-capabilities/observability/search-traces.md`
9. `specs/02-capabilities/observability/get-trace-detail.md`
10. `specs/02-flows/ai-chat/chat-run.md`
11. `specs/03-contracts/graphql/public-schema.graphql`
12. `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
13. `specs/03-contracts/errors.yaml`

If the behavior is not specified, update the relevant spec first. Do not invent
GraphQL fields, routes, NATS subjects, trace filters, waterfall semantics, or
error codes.

## Investigation Rules

- Keep trace evidence CloudGrid-native. Do not tell users to inspect Jaeger,
  Zipkin, Datadog, or another external explorer when CloudGrid has the project
  data.
- Use `telemetry.searchTraces` for trace lists and `telemetry.getTrace` for
  trace detail in AI Chat.
- Prefer `trace_waterfall`, `table`, `key_value`, `log_list`, and
  `status_summary` json-render artifacts for assistant output.
- Link only to BFF-approved CloudGrid trace, span, log, metric, or dashboard
  routes.
- Treat service, operation, status, duration, time range, attributes, trace ID,
  and span ID filters as storage-read-owned query semantics.

## Boundaries

- Frontend talks only to the TypeScript BFF.
- BFF talks to storage-read through message bridge request/reply.
- Storage-read owns trace filtering, sorting, cursor predicates, counts,
  correlation, and waterfall view-model derivation.
- Do not query SurrealDB directly from frontend, BFF, AI Chat tools, sandbox
  scripts, docs examples, or skill output.
- Do not use NATS subjects directly from frontend or sandbox scripts.
- Do not expose SurrealDB credentials, NATS credentials, provider tokens, raw
  authorization headers, or hidden model prompts.

## Working Checklist

1. Read the source specs for the route, tool, or contract being touched.
2. Confirm whether the change belongs in frontend presentation, BFF mapping, or
   storage-read query semantics.
3. Use CloudGrid GraphQL or AI Chat read tools, never direct storage access.
4. Render evidence with approved json-render catalog keys.
5. Add focused tests for the changed trace query, view model, artifact, or UI
   state.
6. Run the narrowest relevant checks; contract changes require
   `bun run contracts:check`.
