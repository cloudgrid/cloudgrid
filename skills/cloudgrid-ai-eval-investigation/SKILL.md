---
name: cloudgrid-ai-eval-investigation
description: Use for CloudGrid AI Eval investigation through AI Chat, AI Eval views, BFF GraphQL, storage-read query paths, or harness-adapter evidence. Guides agents to inspect runs, scorers, datasets, optimization, and regression evidence without leaking prompts or bypassing contracts.
---

# CloudGrid AI Eval Investigation

Use this skill when investigating or implementing AI Eval behavior for AI Chat,
AI Eval workspaces, agent runs, scorers, datasets, experiment runs,
optimization runs, regression summaries, or evaluation evidence artifacts.

## Source Order

Read these before changing behavior:

1. `specs/spec.md`
2. `specs/00-conventions.md`
3. `specs/01-domains/ai-eval.md`
4. `specs/04-backend/ai-chat.md`
5. `specs/04-backend/ai-runtime-structure.md`
6. `specs/04-backend/ai-eval-runner.md`
7. `specs/04-backend/ai-eval-query-semantics.md`
8. `specs/04-backend/ai-eval-message-contracts.md`
9. `specs/05-frontend/ai-eval-views.md`
10. `specs/05-frontend/ai-eval-ux-concept.md`
11. `specs/02-flows/ai-chat/chat-run.md`
12. `specs/03-contracts/graphql/public-schema.graphql`
13. `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
14. `specs/03-contracts/errors.yaml`

If the behavior is not specified, update the relevant spec first. Do not invent
GraphQL fields, runner endpoints, harness adapter fields, NATS subjects,
scorer statuses, optimization states, or error codes.

## Investigation Rules

- Keep AI Eval analysis grounded in CloudGrid evidence: experiment summaries,
  agent run metadata, scorer results, dataset items, annotations, and
  optimization records.
- Use `aiEval.searchAgentRuns`, `aiEval.searchDatasets`,
  `aiEval.searchScorers`, `aiEval.searchExperiments`, and
  `aiEval.searchEvalResults` in AI Chat.
- Prefer `table`, `key_value`, `status_summary`, `diff`, `json_tree`, and
  `metric_timeseries` json-render artifacts for assistant output.
- Do not expose raw prompts, completions, tool parameters, retrieved document
  content, provider credentials, or harness request bodies.
- Summaries must cite run IDs, dataset IDs, scorer IDs, artifact IDs, row
  ranges, or CloudGrid route links. Do not fabricate missing eval evidence.

## Boundaries

- CloudGrid stores and queries AI Eval evidence. Harness executes model calls,
  scorers, and optimization loops through the approved adapter surface.
- BFF must not call model providers directly or bypass the harness adapter for
  eval execution.
- Storage-read owns AI Eval query semantics for search and detail views.
- Control-plane owns project AI settings and provider profile resolution.
- Do not query SurrealDB directly from frontend, BFF, AI Chat tools, sandbox
  scripts, docs examples, or skill output.
- Do not leak provider tokens, raw Authorization headers, hidden model prompts,
  raw provider responses, or captured sensitive content.

## Working Checklist

1. Read the source specs for the AI Eval route, tool, or contract being
   touched.
2. Identify whether the change is runner execution, storage-read query
   semantics, BFF mapping, frontend presentation, or AI Chat artifact output.
3. Keep execution through harness adapter contracts and query semantics in
   storage-read.
4. Render evidence with approved json-render catalog keys.
5. Add focused tests for query mapping, artifact validation, privacy, or UI
   state.
6. Run the narrowest relevant checks; contract changes require
   `bun run contracts:check`.
