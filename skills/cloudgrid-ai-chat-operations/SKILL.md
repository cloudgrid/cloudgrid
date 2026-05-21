---
name: cloudgrid-ai-chat-operations
description: Operates, documents, verifies, or extends CloudGrid AI Chat provider setup, project-scoped chat use, harness execution, action approvals, json-render artifacts, telemetry privacy, and AI Chat skills. Use when work mentions AI Chat setup, providers, unsupported adapters, chat streams, approvals, sandbox, artifacts, or AI Chat docs.
---

# CloudGrid AI Chat Operations

Use this skill for AI Chat setup, operations, documentation, and focused
extension work. Keep answers grounded in specs and checked-in docs.

## Source Order

Read only what the task needs:

1. `specs/spec.md`
2. `specs/04-backend/ai-chat.md`
3. `specs/04-backend/ai-provider-settings.md`
4. `specs/04-backend/ai-runtime-structure.md`
5. `specs/04-backend/ai-chat-implementation-contract.md`
6. `specs/05-frontend/ai-chat-views.md`
7. `specs/02-capabilities/ai-chat/use-ai-chat.md`
8. `specs/02-flows/ai-chat/chat-run.md`
9. `specs/02-flows/ai-chat/action-approval.md`
10. `specs/02-flows/ai-chat/conversation-compaction.md`
11. `website/src/content/handbook/guides/ai-chat.md`
12. `skills/README.md`

If behavior is not specified, update the relevant spec first. Do not invent
routes, provider kinds, tool IDs, renderer keys, action kinds, environment
variables, retry rules, or error codes.

## Provider Setup Rules

- AI Chat uses exactly one company provider profile in v1.
- The normal UI path stores a write-only provider key as an encrypted
  `managed:company/...` credential reference.
- `env:` and `external:` credential references are operator paths; raw secrets
  must not appear in docs, frontend state, logs, spans, artifacts, or output.
- Bundled AI Chat execution supports `openai`, `anthropic`, and
  `openai_compatible` through PURISTA harness adapters.
- `azure_foundry` and `aws_bedrock` may exist in provider settings but must
  fail AI Chat setup with a bounded provider error until matching PURISTA
  harness adapters are installed and registered.
- Local bootstrap uses `CLOUDGRID_AI_CHAT_PROVIDER_KIND`,
  `CLOUDGRID_AI_CHAT_MODEL`, `CLOUDGRID_AI_CHAT_CREDENTIAL_REF`, and the
  provider-specific metadata variables defined in the provider settings spec.

## Runtime Boundaries

- Frontend talks only to the TypeScript BFF.
- The BFF checks browser session, selected project access, conversation
  ownership, and action approval authorization.
- Telemetry reads use approved GraphQL helpers or private storage-read message
  bridge calls.
- Provider execution uses the harness boundary; BFF code must not implement
  provider-specific HTTP clients, streaming parsers, retry logic, or credential
  headers.
- AI Chat tools must not accept raw GraphQL, NATS subjects, SurrealQL, SQL,
  URLs, host paths, environment variable names, credentials, company IDs,
  project IDs, user IDs, tenant IDs, or auth claims from the model.
- The sandbox has no network, secrets, host path access, arbitrary shell
  execution, or unrestricted imports.

## User-Facing Behavior

- Route: `/ai-chat`, requiring a selected project.
- Provider route: `/organizations/:organizationId/ai-provider`.
- Project provider settings route:
  `/projects/:projectId/settings/ai-providers`.
- Chat history is scoped to the current user and selected project.
- The v1 composer accepts text only; do not document attachments, screenshots,
  web search, model picker controls, or arbitrary tool choices as available.
- Answers must use CloudGrid evidence and CloudGrid routes instead of sending
  users to external observability tools for primary investigation.

## Artifacts And Actions

- Use sanitized Markdown for explanation and approved json-render artifacts for
  structured evidence.
- Approved renderer keys: `metric_timeseries`, `metric_bar`, `table`,
  `key_value`, `trace_waterfall`, `log_list`, `mermaid`, `json_tree`, `diff`,
  `status_summary`, and `action_approval`.
- Trusted `cloudgrid-json-render:<renderer>` fenced blocks are transcript
  serialization only when backed by persisted BFF artifact parts.
- Action approval must use server-issued `AiChatActionProposal` IDs and the
  allowlisted action kinds in `ai-chat.md`.
- Secret-returning actions are excluded from AI Chat v1.

## Related Skills

Use the specialist skill when the task narrows:

| Task | Skill |
| --- | --- |
| Trace evidence, waterfalls, critical path | `cloudgrid-trace-investigation` |
| Log evidence, clusters, severity, pivots | `cloudgrid-logs-investigation` |
| Metric charts, aggregations, dashboards | `cloudgrid-metrics-investigation` |
| AI Eval runs, datasets, scorers, optimization | `cloudgrid-ai-eval-investigation` |
| Renderer catalog, Markdown sanitation, approval cards | `cloudgrid-json-render-artifacts` |
| PURISTA harness implementation details | `ai-harness` |

## Skill Authoring

CloudGrid AI Chat skills must follow `skills/README.md` and the upstream
[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices):
specific discovery descriptions, concise `SKILL.md`, one-level references,
real usage eval prompts, and objective assertions.

Run `bun run skills:check` after skill changes.

## Verification

For docs or skills only:

```sh
bun run --cwd website build
bun run skills:check
```

For AI Chat contract or implementation changes, add the mandatory checks from
`specs/04-backend/ai-chat-implementation-contract.md`, including
`bun run contracts:check`.
