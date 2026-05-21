---
id: TEC-BE-029
title: AI Chat runtime
layer: backend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-21
provenance: from-user
depends_on: [DOM-007, TEC-BE-001, TEC-BE-008, TEC-BE-011, TEC-BE-028, TEC-BE-030, NFR-003]
---

# AI Chat Runtime

## Purpose

AI Chat runtime lets the TypeScript BFF host a project-scoped assistant backed
by the AI harness. It streams responses to the browser, persists conversation
history through control-plane, retrieves telemetry through approved read paths,
executes bounded sandbox scripts, renders typed artifacts, and mediates user
approval for actions.

The assistant is a CloudGrid-native observability surface. It must help users
investigate traces, logs, metrics, dashboards, alerts, and AI-evaluation
evidence inside CloudGrid instead of handing off primary workflows to Jaeger,
Zipkin, Datadog, or another external explorer. External product names may be
used only for user wording, import/export context, or comparative explanation;
the runtime must answer with CloudGrid routes, CloudGrid artifacts, and
CloudGrid authorization semantics.

The assistant must answer telemetry questions only from runtime-provided
CloudGrid evidence. It must not invent CLIs, REST telemetry read endpoints,
screens, dashboards, traces, logs, metrics, tool output, or setup steps based on
model training data.

The assistant is not a general-purpose chat surface. Clearly out-of-scope
requests, including politics, elections, ideology, religion, entertainment,
sports, general news, personal advice, medical, legal, financial, weather, or
general knowledge, must be refused before model execution when detected by the
BFF policy gate.

## Boundary

The v1 runtime is modularly integrated into `apps/backend`.

The BFF owns:

- browser session and project authorization checks;
- AI Chat HTTP/SSE streaming endpoint;
- GraphQL resolvers for chat history and action approvals;
- harness integration for chat model calls;
- tool orchestration;
- sandbox lifecycle;
- redacted run telemetry;
- message-bridge calls to control-plane and storage-read.

The BFF does not:

- import SurrealDB clients;
- call model providers directly;
- ask users to inspect primary evidence in Jaeger, Zipkin, Datadog, or another
  external observability product when CloudGrid has the required data;
- expose a REST telemetry read API;
- subscribe to telemetry ingest or persisted-notification streams;
- execute arbitrary shell commands;
- run assistant actions without the existing GraphQL/control-plane mutation
  contracts and authorization checks.

Control-plane owns chat history, provider settings, action approvals, and
conversation metadata. Storage-read owns trace/log/metric/AI-eval query
semantics. Harness owns model-provider execution.

AI Chat provider execution must use PURISTA harness model provider adapters
through the harness model boundary. The BFF must not implement provider-specific
HTTP clients, streaming parsers, retry semantics, or credential handling outside
that boundary. The bundled AI Chat runtime supports `openai`,
`openai_compatible` through the OpenAI-compatible PURISTA adapter base URL, and
`anthropic`. Provider kinds without an installed PURISTA harness adapter must
fail setup with a bounded provider error until the adapter is added.

## Public Runtime Surface

### GraphQL

The contract wave must add:

- `Query.aiChatHistory(input: AiChatHistoryInput!): AiChatHistory!`
- `Query.aiChatConversation(id: ID!): AiChatConversation`
- `Mutation.createAiChatConversation(input:
  CreateAiChatConversationInput!): AiChatConversation!`
- `Mutation.archiveAiChatConversation(id: ID!): AiChatConversation!`
- `Mutation.deleteAiChatConversation(id: ID!): Boolean!`
- `Mutation.approveAiChatAction(input:
  ApproveAiChatActionInput!): AiChatActionProposal!`

GraphQL history and action approval mutations are normal BFF resolver paths.
They use control-plane request/reply subjects and return redacted view models.

`AiChatHistoryInput` fields:

- `companyId`: required current company ID.
- `includeArchived`: default `false`.
- `first`: default `50`, maximum `200`.
- `after`: optional cursor over `(lastMessageAt, conversationId)`.

History returns only conversations the current user owns. When `projectId` is
provided, history returns only that project; the AI Chat route must always pass
the selected project ID so changing projects cannot display another project's
conversation list. Archived conversations are excluded unless
`includeArchived=true`.

### Streaming HTTP

The contract wave must add a BFF-owned streaming endpoint:

- `POST /api/ai-chat/stream`

The request contains `conversationId`, `projectId`, user message parts, and an
idempotency key. The response uses an AI SDK compatible UI message stream over
SSE. The stream may emit text parts, tool-call status parts, artifact parts,
action proposal parts, compaction status, and terminal error parts.

This endpoint is not a telemetry read endpoint. All telemetry access happens
inside the BFF runtime through approved GraphQL resolver helpers or private
message bridge calls.

The request and stream event envelope are also defined by
`specs/03-contracts/entities/ai/ai-chat-stream.schema.json`.

#### AiChatStreamRequest

Fields:

- `conversationId`: required existing conversation ID.
- `projectId`: selected project ID. Must match the conversation project.
- `userMessageClientId`: stable client-generated ID for the submitted user
  message.
- `idempotencyKey`: stable client-generated key for this user submission.
- `parts`: non-empty array of user message parts. V1 allows `text` parts only.
- `timezone`: optional IANA timezone for date phrasing.

File attachments, screenshots, model picker values, web-search toggles, and
arbitrary tool choices are not accepted in v1.

#### Stream Event Envelope

Every SSE data event is JSON:

```json
{
  "type": "run.started",
  "conversationId": "chat_...",
  "runId": "run_...",
  "sequence": 1,
  "createdAt": "2026-05-18T00:00:00Z",
  "payload": {}
}
```

Supported `type` values, in allowed order:

1. `run.started`
2. zero or more `message.created`
3. zero or more `text.delta`
4. zero or more `tool.started`
5. zero or more `tool.completed`
6. zero or more `artifact.created`
7. zero or more `action.proposed`
8. zero or more `compaction.started`
9. zero or more `compaction.saved`
10. exactly one `run.completed` or `run.failed`

`heartbeat` events may appear between any two events and carry the latest
`runId` and `sequence`. Sequence numbers are strictly increasing per run,
excluding heartbeat.

The BFF must not stream hidden provider reasoning text. Provider reasoning may
only surface as generic `tool.started` or `message.created` status labels.

Tool status events are user-interface progress signals only. They must include
only a stable tool ID, safe display label, status, sequence, and optional
duration/error code. They must not include tool input JSON, tool output JSON,
provider reasoning, prompts, credentials, query filters, raw trace/log/metric
records, or sandbox file contents. The frontend renders these events as compact
tool-use indicators, not expandable payload inspectors.

Artifacts are stream parts, not provider-authored raw Markdown. The BFF emits
`artifact.created` only after validating the render spec and persisting an
`AiChatArtifact`. The event payload contains `artifactId`, `renderer`, `label`,
`renderSpec`, and optional source IDs. The frontend inserts the artifact at the
current assistant-message position.

For transcript export, copy/paste, and no-JavaScript fallback rendering, the
canonical Markdown serialization for a JSON-render artifact is a fenced code
block with this exact info string:

````markdown
```cloudgrid-json-render:<renderer>
{ "artifactId": "art_...", "renderer": "<renderer>", "spec": {} }
```
````

`<renderer>` must be one approved CloudGrid JSON-render catalog key. The JSON
body must be valid UTF-8 JSON and must include the persisted `artifactId`.
Frontend code must render this fence as a CloudGrid artifact only when the
fence originates from a BFF `artifact` message part or `artifact.created`
event. User-authored or model-authored text that happens to contain the same
fence is displayed as an inert code block unless it is backed by a persisted
artifact ID in the current conversation.

Requests to reveal, print, translate, summarize, debug, ignore, override, or
bypass hidden prompts, system instructions, developer instructions, policies,
tool schemas, chain-of-thought, credentials, tokens, environment variables,
provider request/response bodies, or internal implementation details must be
refused before provider execution when detected by the BFF policy gate.

## Harness Chat Port

The harness graph, model aliases, specialist agents, provider adapter rules,
tool strategy, JSON-render integration, large-result behavior, and session
identity requirements are defined in
`specs/04-backend/ai-runtime-structure.md`. This section defines the BFF chat
port used by the stream endpoint.

The BFF integrates the AI harness through an internal `AiChatHarnessPort`.

Required methods:

- `streamChat(request): AsyncIterable<AiChatHarnessEvent>`
- `compactConversation(request): Promise<AiChatCompactionDraft>`

`streamChat` request fields:

- redacted provider kind, model, base URL when required, and bounded parameters;
- resolved credential material in memory only;
- recent conversation messages and latest compaction summary;
- tool declaration schemas;
- deterministic runtime time context containing current UTC time, accepted IANA
  timezone, and current local date/time for resolving relative human date/time
  phrases;
- W3C trace context;
- max tool calls, max output tokens, and timeout budget.

Harness event kinds:

- `text_delta`
- `tool_call_requested`
- `final_message`
- `usage`
- `provider_error`

The harness can request tools by name and JSON arguments. The BFF validates the
request, executes the tool, and returns the result to harness. Harness never
calls CloudGrid GraphQL, NATS, SurrealDB, OTLP, or sandbox APIs directly.

## Entities

### AiChatConversation

Fields:

- `id`.
- `companyId`.
- `projectId`.
- `userId`.
- `title`: assistant- or user-edited title.
- `title`: BFF-generated from the first user text part, trimmed to 80
  characters. Conversation rename is not supported in v1.
- `status`: `active` or `archived`.
- `providerProfileSnapshot`: redacted company provider profile ID, kind, model,
  and parameters used for the latest run.
- `lastMessageAt`.
- `lastRunStatus`: `idle`, `streaming`, `failed`, or `awaiting_approval`.
- `compaction`: optional latest compaction metadata.
- `createdAt`, `updatedAt`.

### AiChatMessage

Fields:

- `id`.
- `conversationId`.
- `role`: `user`, `assistant`, `tool`, or `system`.
- `parts`: ordered typed parts: `text`, `artifact`, `tool_status`,
  `action_proposal`, `approval_result`, `error`, or `compaction_summary`.
- `tokenEstimate`.
- `createdAt`.

Message parts store sanitized assistant output and artifact references. Large
tool result files are not embedded in message parts; they are stored as bounded
artifacts.

Assistant messages preserve mixed content order. A single assistant message may
contain multiple text parts and multiple artifact parts, for example short
Markdown analysis, a `trace_waterfall` artifact, more Markdown, and a `table`
artifact. The BFF is the only component that may create `artifact` message
parts. The model may request `render.emitJsonRender`; it may not directly write
artifact message parts or trusted `cloudgrid-json-render:*` fences.

Archiving a conversation sets `status=archived`, hides it from default history,
and prevents new runs in that conversation. It does not delete messages,
artifacts, action approvals, compactions, or audit records.

Deleting a conversation is owner-only and permanent. It removes the
conversation, messages, runs, artifacts, action proposals, and compaction
records for that conversation from control-plane storage. A delete request for a
conversation owned by another user fails with `ERR-016 FORBIDDEN`; a missing
conversation fails with `ERR-004 NOT_FOUND`. The frontend must remove deleted
conversations from the local history cache and clear the active route when the
deleted conversation is open.

### AiChatRun

Fields:

- `id`.
- `conversationId`.
- `projectId`.
- `userId`.
- `status`: `queued`, `streaming`, `completed`, `failed`, `cancelled`, or
  `awaiting_approval`.
- `providerKind`.
- `model`.
- `traceId`: optional CloudGrid self-observability trace ID.
- `toolCallCount`, `sandboxScriptCount`, `artifactCount`.
- `inputTokenCount`, `outputTokenCount`, `estimatedCostUsd`.
- `startedAt`, `completedAt`.

### AiChatArtifact

Fields:

- `id`.
- `conversationId`.
- `runId`.
- `kind`: `json_render`, `data_file`, `script`, or `script_output`.
- `label`.
- `mediaType`.
- `sizeBytes`.
- `renderSpec`: present only for `json_render`.
- `fileRef`: opaque storage reference for sandbox files retained with the
  conversation.
- `createdAt`.

### AiChatActionProposal

Fields:

- `id`.
- `conversationId`.
- `runId`.
- `projectId`.
- `risk`: `low`, `medium`, `high`, or `destructive`.
- `status`: `proposed`, `approved`, `rejected`, `executing`, `succeeded`,
  `failed`, or `expired`.
- `actionKind`: stable whitelist key such as `dashboard.save`,
  `alert.create`, `dataset.item.append`, `scorer.create`,
  `retention.update`, `provider.update`, or `membership.update`.
- `graphqlMutation`: existing public mutation name when execution is GraphQL.
- `inputPreview`: redacted structured mutation input.
- `requiresApproval`: boolean.
- `approval`: optional approver user ID and timestamp.
- `idempotencyKey`.
- `expiresAt`.

### AiChatCompaction

Fields:

- `id`.
- `conversationId`.
- `sourceMessageCount`.
- `summary`.
- `retainedMessageIds`.
- `artifactSummaries`.
- `pendingActionIds`.
- `createdAt`.

## Tool Model

Allowed read tools:

- `telemetry.searchTraces`
- `telemetry.getTrace`
- `telemetry.searchLogs`
- `telemetry.queryMetrics`
- `telemetry.getFacets`
- `dashboards.list`
- `dashboards.get`
- `alerts.list`
- `alerts.history`
- `aiEval.searchAgentRuns`
- `aiEval.searchDatasets`
- `aiEval.searchScorers`
- `aiEval.searchExperiments`
- `aiEval.searchEvalResults`
- `project.get`

Allowed sandbox tools:

- `sandbox.writeDataFile`
- `sandbox.readFile`
- `sandbox.writeScript`
- `sandbox.runScript`
- `sandbox.listFiles`

Allowed output tools:

- `render.emitJsonRender`
- `action.propose`
- `conversation.compact`

No tool may accept raw SQL, SurrealQL, NATS subject names, arbitrary URLs,
arbitrary filesystem paths, shell commands, environment variable reads, browser
automation instructions, or provider credential inputs.

The BFF injects `companyId`, `projectId`, `userId`, and authorization context
into every tool call. Model-supplied `companyId`, `projectId`, `userId`,
tenant, or auth fields are ignored and treated as validation errors when
present.

Model-facing tool schemas must follow default-plus-optional-override design.
The model must not be required or asked to provide company, project, user,
conversation, tenant, or auth fields. Runtime scope comes from the current
conversation/request context and is passed directly into BFF bridge calls as
authorization context. For telemetry read tools, omitted optional inputs use
CloudGrid defaults: current project, default time window, default limit, default
aggregation or step, and no additional filters. The assistant asks the user only
for a genuinely missing domain choice that cannot be inferred from the request,
such as an absent metric name.

AI Chat tools must reuse the same typed contract inputs, validation helpers, and
bridge methods as the regular UI. Shared telemetry defaults and query builders
live in the UI contract package and are imported by frontend routes, AI Chat BFF
tool adapters, dashboard widgets, and tests. Route-local or prompt-local copies
of metric aggregation lists, chart type lists, default windows, default limits,
metric-series input builders, trace/log/facet input builders, or renderer
catalogs are drift bugs. If the UI gains a telemetry capability, the AI tool
catalog must either expose the same capability through the shared contract or
explicitly record why it is not available to AI Chat.

### Read Tool Limits

| Tool | Backend path | Default window | Default limit | Hard limit |
| --- | --- | --- | --- | --- |
| `telemetry.searchTraces` | `Query.traces` / storage-read trace search | last 1 hour, newest first | 50 traces | 200 traces |
| `telemetry.getTrace` | `Query.trace` / storage-read trace detail | not applicable; related logs default to 50 | full trace detail | 5000 spans |
| `telemetry.searchLogs` | `Query.logs` / storage-read log search | last 1 hour, newest first | 50 logs | 200 logs |
| `telemetry.queryMetrics` | `Query.metricSeries` or `Query.richMetricSeries` | last 1 hour | storage-read default step | 5000 points |
| `telemetry.getFacets` | `Query.telemetryFacets` | last 1 hour | 25 values per facet family | 200 values per facet family |
| `dashboards.list` | `Query.dashboards` | not applicable | all visible dashboards | backend cap |
| `alerts.list` | `Query.alertRules` | not applicable | all visible rules | backend cap |
| `alerts.history` | `Query.alertHistory` | last 24 hours | 50 events | 200 events |
| `aiEval.*` search tools | AI Eval GraphQL queries | last 7 days when time is supported | 50 rows | 200 rows |

When a tool result exceeds 64 KiB, the BFF writes the full bounded result into
the sandbox as JSON or JSONL and passes only a file handle, schema summary, row
count, and sampled preview to harness.

If a trace detail contains more than 5000 spans, the tool returns a bounded
summary, root span, service/time breakdown, and a CloudGrid trace route link
instead of full span rows.

## Sandbox

Each run receives a fresh sandbox directory. The sandbox has:

- read-only input files produced by CloudGrid tools;
- writable `scripts/` and `outputs/` directories;
- no host path mounts except the sandbox root;
- no environment variables except fixed non-secret runtime metadata;
- no network;
- no child process execution except the approved Bun script runner;
- wall-clock timeout of 15 seconds per script;
- CPU time budget of 5 seconds per script where the platform supports it;
- memory limit of 256 MiB per script process;
- maximum input file size of 100 MiB per run;
- maximum individual output file size of 25 MiB;
- maximum retained artifact size of 50 MiB per conversation.

Scripts must be JavaScript or TypeScript. The runner injects a small standard
library for reading JSON, JSONL, CSV, and writing JSON-render data files.

Scripts run as ESM with imports disabled except for `cloudgrid:sandbox`. The
shim exposes `readJson`, `readJsonl`, `readCsv`, `writeJson`, `writeJsonl`, and
`emitRenderData`. Direct `fs`, `Bun.file`, `process.env`, `fetch`,
`WebSocket`, `Worker`, dynamic import, child processes, and native addons are
blocked. A blocked API returns `ERR-AIC-002`.

Sandbox files are ephemeral. After a terminal run, the BFF deletes full data
files and keeps only persisted message parts, render specs, artifact metadata,
and bounded previews. V1 does not expose full sandbox file downloads.

## Rendering

Assistant text uses sanitized Markdown. The BFF must preserve paragraphs,
lists, tables, inline code, fenced code blocks, links, emphasis, and headings
that are safe for the frontend renderer. Raw HTML, scripts, iframes, event
handlers, and provider-hidden reasoning are stripped before streaming or
persisting. Links are allowed only when they target BFF-approved CloudGrid
routes or documented CloudGrid public documentation.

The BFF must not accept JSON-render specs from arbitrary Markdown code fences
inside model text. Trusted JSON-render artifacts come only from the validated
`render.emitJsonRender` output tool or from server-side deterministic reducers.
When persisting or exporting transcripts, artifact parts are serialized as
`cloudgrid-json-render:<renderer>` fenced code blocks so Markdown text and
structured renderers can be represented in one ordered response without
inventing a second transcript format.

Assistant artifacts use JSON-render specs from the approved CloudGrid
json-render catalog. The assistant must not invent renderer keys or inline ad
hoc chart/table schemas when an approved catalog renderer exists. The frontend
renderer implementation must be shared with, or wrap, the same components used
by regular CloudGrid views. Metric artifacts use the metric explorer
chart/table components; trace artifacts use the trace waterfall/tree
components; log artifacts use the log list/detail components; dashboard
artifacts use dashboard widget rendering components. The AI Chat route must not
keep route-local chart, table, trace, log, or dashboard render logic when an
equivalent regular UI component exists. The approved catalog keys are:

- `metric_timeseries`
- `metric_bar`
- `table`
- `key_value`
- `trace_waterfall`
- `log_list`
- `mermaid`
- `json_tree`
- `diff`
- `status_summary`
- `action_approval`

The BFF validates each render spec before streaming or persisting it. Rejected
specs become assistant-visible tool errors and user-visible compact errors.

Render specs must be at most 512 KiB after JSON serialization. Embedded table
data is capped at 500 rows, chart data at 5000 points, log lists at 200 rows,
and trace waterfalls at 5000 spans. Larger artifacts must render summarized
views with a warning and a link back to the source CloudGrid route.

A single run may create at most 12 JSON-render artifacts and at most one
`action_approval` artifact per pending action proposal. The BFF increments
`artifactCount` only after validation succeeds. Duplicate render specs with the
same `sourceToolCallIds`, renderer, and canonical JSON digest within one run
must be de-duplicated and referenced by the existing artifact ID instead of
persisted twice.

Trace, log, and metric investigation answers should pair short Markdown
analysis with structured JSON-render artifacts. Tables are for sortable
evidence, `trace_waterfall` is for span timing and critical path inspection,
metric charts are for time-series or grouped comparisons, `log_list` is for
log evidence, and `status_summary` is for concise incident-state summaries.

## Action Approval

Risk policy:

- `low`: read-only navigation suggestions, filter suggestions, or draft-only
  artifact creation. Approval is not required.
- `medium`: create/update non-destructive project artifacts such as dashboards,
  datasets, scorers, and alert rules. Approval is required.
- `high`: retention, provider, budget, online policy, and project/member role
  changes. Approval is required and the UI must show the exact changed fields.
- `destructive`: delete, revoke, disable, archive, remove member, delete
  dashboard, revoke ingest credential, delete alert, or disable provider.
  Approval is required through a destructive confirmation dialog.

After approval, the BFF revalidates project/company access, checks the current
resource version where available, and executes only the whitelisted mutation or
control-plane action. Stale versions fail without retrying a mutated input.

### Action Whitelist

| Action kind | Mutation/action | Risk |
| --- | --- | --- |
| `dashboard.save` | `Mutation.saveDashboard` | medium |
| `dashboard.delete` | `Mutation.deleteDashboard` | destructive |
| `dashboard.pin` | `Mutation.setDashboardPinned` | low |
| `dashboard.reorder_pins` | `Mutation.reorderDashboardPins` | low |
| `alert.create` | `Mutation.createAlertRule` | medium |
| `alert.update` | `Mutation.updateAlertRule` | medium |
| `alert.delete` | `Mutation.deleteAlertRule` | destructive |
| `alert.silence_create` | `Mutation.createAlertSilence` | medium |
| `alert.silence_delete` | `Mutation.deleteAlertSilence` | destructive |
| `dataset.create` | `Mutation.createDataset` | medium |
| `dataset.items_append` | `Mutation.appendDatasetItems` | medium |
| `dataset.item_promote` | `Mutation.promoteSpanToDatasetItem` | medium |
| `scorer.create` | `Mutation.createScorer` | medium |
| `experiment.create` | `Mutation.createExperiment` | medium |
| `experiment.start` | `Mutation.startExperimentRun` | medium |
| `experiment.cancel` | `Mutation.cancelExperimentRun` | medium |
| `optimization.start` | `Mutation.startOptimizationRun` | medium |
| `prompt.promote` | `Mutation.promotePromptVersion` | high |
| `annotation.resolve` | `Mutation.resolveAnnotation` | medium |
| `retention.update` | `Mutation.updateRetentionPolicy` | high |
| `ingest_credential.revoke` | `Mutation.revokeIngestCredential` | destructive |
| `project.update` | `Mutation.updateProject` | high |
| `project_member.invite` | `Mutation.inviteProjectMember` | high |
| `project_member.update` | `Mutation.updateProjectMember` | high |
| `project_member.remove` | `Mutation.removeProjectMember` | destructive |
| `organization_member.invite` | `Mutation.inviteOrganizationMember` | high |
| `organization_member.update` | `Mutation.updateOrganizationMember` | high |
| `organization_member.remove` | `Mutation.removeOrganizationMember` | destructive |
| `organization_invitation.resend` | `Mutation.resendOrganizationInvitation` | high |
| `organization_invitation.revoke` | `Mutation.revokeOrganizationInvitation` | destructive |
| `provider.project_update` | `Mutation.updateProjectAiProviderSettings` | high |
| `provider.company_update` | `Mutation.updateCompanyAiProviderSettings` | high |
| `ai_eval.settings_update` | `Mutation.updateProjectAiSettings` | high |

Any action not in this table can be explained or drafted by the assistant, but
it cannot be emitted as an executable `AiChatActionProposal`.

Secret-returning actions are excluded from AI Chat v1. In particular,
`Mutation.createIngestCredential` is not executable from AI Chat because it
returns one-time credential material. The assistant may navigate the user to the
API Keys settings page instead.

## Conversation Compaction

The BFF compacts a conversation before a run when either threshold is reached:

- more than 40 messages since the latest compaction;
- estimated context input exceeds 70 percent of the configured model context
  budget.

Compaction is performed through harness using the same company provider. The
summary must include user goals, project context, durable decisions, relevant
artifacts, retained message IDs, pending actions, and unresolved failures.
Approval records and action proposals are never removed by compaction.

## Observability

AI Chat emits structured logs and optional OTLP spans/metrics through the normal
CloudGrid self-observability path.

Metrics:

- `cloudgrid_ai_chat_runs_total`
- `cloudgrid_ai_chat_run_duration_ms`
- `cloudgrid_ai_chat_tool_calls_total`
- `cloudgrid_ai_chat_sandbox_scripts_total`
- `cloudgrid_ai_chat_sandbox_failures_total`
- `cloudgrid_ai_chat_action_proposals_total`
- `cloudgrid_ai_chat_action_approvals_total`
- `cloudgrid_ai_chat_compactions_total`
- `cloudgrid_ai_chat_tokens_total`

Trace attributes may include project ID, company ID, provider kind, model,
run ID, tool names, artifact counts, and error code. They must not include raw
prompt text, tool result payloads, rendered data values, credentials, cookies,
or provider errors.

Runtime flags:

- `CLOUDGRID_AI_CHAT_ENABLED`: enables the route and BFF runtime.
- `CLOUDGRID_AI_CHAT_HARNESS_MODE`: BFF harness runtime. `provider` is the
  default and uses the configured provider profile and secure credential
  material at request time. `mock` enables the deterministic local/mock harness
  for integration tests and local smoke checks only; it must not be used as a
  production model-provider substitute. `off` disables in-process harness
  execution.
- `CLOUDGRID_AI_CHAT_TRACING_ENABLED`: defaults to `true` in local mode and
  `false` in deployed mode.
- `CLOUDGRID_AI_CHAT_SANDBOX_MAX_INPUT_BYTES`: defaults to `104857600`.
- `CLOUDGRID_AI_CHAT_SANDBOX_MAX_ARTIFACT_BYTES`: defaults to `52428800`.

## Error Mapping

- Missing company AI Chat provider: `ERR-AIC-001`.
- Missing runtime credential for a configured provider: `ERR-AIP-001`.
- Sandbox policy violation: `ERR-AIC-002`.
- Expired, stale, or already terminal action proposal: `ERR-AIC-003`.
- Run, tool, token, or sandbox limit exceeded: `ERR-AIC-004`.
- Invalid render spec: `ERR-AIC-005`.

## Verification

Required tests:

- BFF stream endpoint requires an authenticated session and selected-project
  access;
- missing company provider returns a setup error before harness execution;
- local integration runs configure a managed company provider, create a
  conversation, stream through the deterministic mock harness, verify the
  terminal stream event, and verify history persistence without leaking
  credential material;
- read tools call only approved BFF helper or message bridge paths;
- sandbox rejects network, environment, host path, and oversized output access;
- render specs reject unapproved catalog keys and executable content;
- artifact stream events, persisted message parts, and
  `cloudgrid-json-render:<renderer>` transcript serialization preserve mixed
  Markdown/artifact ordering without trusting model-authored fenced blocks;
- tool status events expose only tool names/status labels and never tool
  payloads;
- critical actions require approval and re-run authorization checks;
- stale action versions fail without mutation;
- conversation history is scoped to the current user, filtered to the selected
  project in the AI Chat route, and grouped by project in the response model;
- conversation deletion is owner-only and removes the deleted conversation from
  subsequent history and direct conversation reads;
- compaction preserves pending actions and approval records;
- AI Chat spans and logs do not contain prompt text, tool result payloads, raw
  provider errors, or secrets.
