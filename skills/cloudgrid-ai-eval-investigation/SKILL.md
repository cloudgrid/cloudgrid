---
name: cloudgrid-ai-eval-investigation
description: Explains, configures, uses, and investigates CloudGrid AI Eval v2 datasets, dataset rows, dataset evaluations, run controls, metric results, comparisons, optimization, target snapshots, promotion, trace import, and external adapters. Use when the user asks how to set up AI Eval, manage datasets/evaluations, interpret results, troubleshoot runs, or change AI Eval behavior without drifting from implemented contracts.
---

# CloudGrid AI Eval

Use this skill for both user-facing AI Eval guidance and implementation work:
setup, datasets, dataset rows, evaluations, run controls, metric results,
comparisons, optimization, target snapshots, promotion, trace import, external
adapters, troubleshooting, and privacy-safe investigation.

## Source Order

Read only what the task needs. Website docs are the user-facing explanation;
generated contracts and source ownership are the implementation guardrails.

1. User docs: `website/src/content/handbook/guides/ai-eval.md`.
2. Frontend: `apps/frontend/src/routes/ai-eval-route.tsx`.
3. BFF and public client: `apps/backend/src`, `apps/packages/public-api-client`,
   and `apps/packages/ui-contracts`.
4. Private services: `core/storage-read`, `core/storage-write`,
   `core/ai-eval-runner`, and `core/go-contracts`.
5. External adapter and harness behavior: `specs/04-backend/ai-eval-runner.md`
   and `skills/ai-harness`.

If behavior is not documented or implemented, report it as a product gap. Do not invent
GraphQL fields, runner endpoints, adapter fields, NATS subjects, curation
statuses, optimization states, promotion rules, or error codes.

## Reference Guide

- For user explanations and workflows, read `references/user-workflows.md`.
- For configuration and operator troubleshooting, read
  `references/configuration-operations.md`.
- For implementation boundaries and tests, read
  `references/implementation-boundaries.md`.

## Answering Users

- Start from the user's role: evaluator, app developer, project admin, or
  operator.
- Explain the smallest working path first: enable AI Eval, create a schema
  defined dataset, add or import ready rows, create an evaluation, start a run,
  review metric results, compare candidates, then optimize and explicitly
  promote a target snapshot.
- Use exact route names, GraphQL operations, env vars, and service boundaries.
- If asked for implementation details, name the owning service before the
  files: storage-write mutates, storage-read derives/query-shapes, runner
  executes through harness, BFF bridges GraphQL to NATS, frontend renders view
  models.
- State when a capability is backlog. Production measurement is backlog for AI
  Eval v2. Quick-shot optimization is exploratory and cannot be final promotion
  evidence.

## Privacy Rules

- Do not expose raw provider credentials, bearer tokens, cookies, Authorization
  headers, raw harness request bodies, raw provider responses, hidden model
  prompts, or sensitive captured content.
- Prefer IDs, summaries, bounded excerpts, and route links over raw prompts,
  completions, tool arguments, or retrieved documents.
- For AI Chat output, prefer approved json-render artifacts: `table`,
  `key_value`, `status_summary`, `diff`, `json_tree`, and `metric_timeseries`.

## Implementation Checklist

1. Read the relevant docs, generated contracts, and source files.
2. Identify the owner: contracts, storage-write, storage-read, runner,
   harness adapter, BFF, frontend, public API client, docs, or integration.
3. Add or update tests before implementation when behavior changes.
4. Keep query semantics out of BFF/frontend and execution out of storage/BFF.
5. Run focused checks plus required gates:
   - contracts: `bun run contracts:check`
   - backend: `bun test --coverage apps/backend/src`
   - frontend: `bun run --cwd apps/frontend test`
   - Go services: `go test -tags surrealdb ./core/...` with the narrowed
     packages when possible
   - skills: `bun run skills:check`
