---
id: TEC-BE-031
title: AI Chat implementation contract
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-21
provenance: from-user
depends_on: [TEC-BE-029, TEC-BE-030, TEC-FE-009]
---

# AI Chat Implementation Contract

This spec closes the implementation-readiness details for AI Chat. It is the
source of truth for implementation agents when prose in `ai-chat.md` or
`ai-runtime-structure.md` would otherwise leave a choice open.

## Catalog Source

The BFF must expose one typed AI Chat catalog module at
`apps/backend/src/ai-chat/catalog.ts`.

The catalog exports:

- `AI_CHAT_MODEL_ALIASES`: `chat_reasoning`, `structured_reasoning`,
  `embedding`, and `rerank`;
- `AI_CHAT_TOOLS`: every model-facing tool ID, schema, owner, injected fields,
  backend path, limits, and error mapping;
- `AI_CHAT_RENDERERS`: every renderer key and the schema reference from
  `specs/03-contracts/entities/ai/json-render-catalog.schema.json`;
- `AI_CHAT_ACTIONS`: every action kind, mutation binding, risk, redaction rule,
  required version fields, and approval behavior;
- `AI_CHAT_SKILLS`: skill mount name, allowed agents, and read-only permission
  set;
- `AI_CHAT_BUDGETS`: tool call, artifact, row, byte, token, and timeout limits.

Runtime code imports the catalog. Tests must fail if stream handlers, harness
tools, action approval, or frontend renderer fixtures define a second hardcoded
list of tool IDs, renderer keys, action kinds, or skill names.

## Harness Workflows

The BFF constructs the runtime through `defineHarness()`.

Required workflow handles:

- `workflow.chat_run(input) -> AsyncIterable<AiChatHarnessEvent>`
- `workflow.compact_conversation(input) -> AiChatCompactionDraft`

Required agents:

- `agent.main_chat`
- `agent.trace_analyst`
- `agent.logs_analyst`
- `agent.metrics_analyst`
- `agent.ai_eval_analyst`

`workflow.chat_run` receives provider snapshot, resolved credential handle,
session ID, recent messages, compaction summary, catalog snapshot, W3C
traceparent, and budgets. It emits only these event kinds to the BFF:
`text_delta`, `tool_call_requested`, `final_message`, `usage`, and
`provider_error`.

Specialist analysis is exposed to `main_chat` only through typed tools:
`analysis.summarizeTrace`, `analysis.summarizeLogs`,
`analysis.summarizeMetrics`, and `analysis.summarizeAiEval`. Each specialist
tool input references already-authorized evidence IDs or sandbox file refs; it
does not accept raw GraphQL, NATS, SurrealQL, SQL, URLs, company IDs, project
IDs, user IDs, or credentials.

Temporary direct model-registry code is allowed only until `workflow.chat_run`
exists. The exit criteria are: catalog module present, `defineHarness()` used
by AI Chat, all required workflows/agents registered, and focused tests proving
no BFF code calls provider SDKs or adapter HTTP APIs directly.

## Tool Catalog

Every tool entry must define:

- `id`: one of the allowed IDs in `ai-chat.md`;
- `owner`: `storage-read`, `control-plane`, `sandbox`, `renderer`, `action`,
  or `conversation`;
- `modelInputSchema`: model-visible JSON Schema with no scope IDs;
- `injectedFields`: `companyId`, `projectId`, `userId`, `conversationId`, and
  auth context when needed;
- `backendPath`: exact GraphQL resolver helper, message bridge subject, or
  sandbox runner method;
- `defaultWindow`, `defaultLimit`, and `hardLimit` where applicable;
- `resultEnvelope`: `evidenceId`, `summary`, `rowCount`, `sample`, `fileRef`,
  `routeLinks`, and `warnings`;
- `streamLabel`: safe UI label for `tool.started` and `tool.completed`;
- `errors`: CloudGrid error IDs returned for validation, auth, timeout, limit,
  sandbox, and backend failures.

Tool status stream payloads contain only `toolCallId`, `toolName`, `label`,
`status`, `durationMs`, and `errorCode`.

## Renderer Catalog

`render.emitJsonRender` validates against
`specs/03-contracts/entities/ai/json-render-catalog.schema.json`.

Renderer specs must include `renderer`, `title`, `ariaLabel`, and exactly one
of bounded inline `data` or `dataRef`. They may include only BFF-approved
CloudGrid route links. Unknown renderer keys, raw HTML, scripts, iframe URLs,
external URLs, event handlers, provider UI schemas, and arbitrary React
component names return `ERR-AIC-005`.

The BFF computes a canonical JSON digest from renderer key, source IDs, and
render spec with sorted object keys. Duplicate specs inside one run reuse the
existing artifact ID.

## Sandbox Runner

The sandbox root is a per-run directory named by run ID. The model sees only
opaque file refs such as `sandbox://run/<runId>/inputs/<file>.jsonl` and
`sandbox://run/<runId>/outputs/<file>.json`. Host paths never cross the model
or stream boundary.

The runner executes a separate Bun process with:

- cwd set to the sandbox root;
- network blocked by the wrapper and by replacing `fetch`, `WebSocket`,
  `Worker`, and dynamic import with throwing stubs;
- environment cleared except fixed non-secret metadata;
- imports disabled except `cloudgrid:sandbox`;
- write access only to `outputs/`;
- 15 second wall-clock timeout, 5 second CPU target where available, 256 MiB
  memory budget, and configured file size caps.

`cloudgrid:sandbox` exposes only `readJson`, `readJsonl`, `readCsv`,
`writeJson`, `writeJsonl`, and `emitRenderData`. Blocked operations return
`ERR-AIC-002`. Terminal run cleanup deletes ephemeral full data files after
persisting artifact metadata, bounded previews, and message parts.

## Skill Mounting

Harness sessions mount CloudGrid skills under `/skills/<skill-name>`.

The BFF creates a compact skill index containing skill name, description,
allowed agents, and `SKILL.md` path. Agents can read only mounted CloudGrid
skill files and one-level references with `read`, `list`, and `grep`.
Mutation-capable built-ins remain disabled.

The catalog allowlist controls which agents can read which skills. A runtime
test must prove `main_chat` can read allowlisted CloudGrid skills, cannot read
non-allowlisted skills, and cannot write or execute files through skill access.

## Action Bindings

`AI_CHAT_ACTIONS` binds every action kind from `ai-chat.md` to:

- GraphQL mutation or control-plane action name;
- risk level;
- model-facing proposal schema;
- redacted `inputPreview` projection;
- required target IDs and version preconditions;
- approval UI mode;
- success/failure result payload shape.

Action kind names use dotted domains and snake-case verbs, for example
`dataset.items_append`. Singular variants such as `dataset.item.append` are not
valid aliases.

## Verification

Focused verification commands for the AI Chat implementation wave:

```sh
bun run contracts:check
bun test apps/backend/src/ai-chat-harness.test.ts apps/backend/src/ai-chat-stream.test.ts apps/backend/src/graphql-control.test.ts apps/backend/src/bridge.test.ts
bun run --cwd apps/backend typecheck
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend test -- ai-chat
go test -tags surrealdb ./core/control-plane/...
```

Live provider smoke tests are opt-in only. They require explicit provider
environment variables and must not run from root default verification.
