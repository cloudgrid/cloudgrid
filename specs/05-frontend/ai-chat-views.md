---
id: TEC-FE-009
title: AI Chat views
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-28
provenance: from-user
depends_on: [DOM-007, TEC-BE-029, TEC-FE-006, TEC-FE-001, TEC-FE-002]
---

# AI Chat Views

AI Chat is CloudGrid's product-native investigation workspace. It must feel
like part of the trace, log, metric, dashboard, alert, and AI-evaluation
workflow, not like a generic chat embed or a launcher for Jaeger, Zipkin,
Datadog, or another external observability product.

## External UI Inputs

AI Chat uses AI Elements components for conversation structure, messages,
tool-call displays, and prompt input. AI Elements components are installed into
the frontend codebase and adapted to the existing React/Vite, shadcn/ui, and
Tailwind setup rather than treated as opaque runtime widgets.

The implementation must use AI Elements primitives for the core chat surface,
not a custom chat framework:

- transcript: `Conversation`, `ConversationContent`, and
  `ConversationScrollButton`;
- messages: `Message`, `MessageContent`, and `MessageResponse`;
- composer: `PromptInput`, `PromptInputTextarea`, and `PromptInputSubmit`;
- tool progress: AI Elements `Tool`/`ToolHeader`-style status UI or a thin
  CloudGrid wrapper around it that hides inputs and outputs.

`Reasoning` is not used in CloudGrid AI Chat v1 because hidden model reasoning
must not be exposed. `ChainOfThought` may only be used as a visual shell for
discrete CloudGrid progress steps when it displays safe labels derived from
BFF `tool.started`/`tool.completed` events; it must not display model
chain-of-thought, provider reasoning text, prompts, tool schemas, tool inputs,
or tool outputs.

AI Chat uses json-render for structured assistant artifacts. The frontend must
render only BFF-validated artifact specs from the approved JSON-render catalog.

Reference URLs:

- https://elements.ai-sdk.dev/
- https://elements.ai-sdk.dev/components/conversation
- https://elements.ai-sdk.dev/components/prompt-input
- https://elements.ai-sdk.dev/components/tool
- https://elements.ai-sdk.dev/components/chain-of-thought
- https://json-render.dev/

## Routes

- `/ai-chat`: project workspace AI Chat route. Requires a selected project.
- `/projects/:projectId/settings/ai-providers`: project settings route for
  reusable project AI providers and model aliases.
- `/organizations/:organizationId/ai-provider`: company admin settings route
  for the one provider used by AI Chat.

The project sidebar order becomes `AI Chat`, pinned dashboard shortcuts when
present, `Traces`, `Logs`, `Metrics`, `Dashboards`, and `Evaluations` when both
AI features are enabled. AI Chat is hidden
when `CLOUDGRID_AI_CHAT_ENABLED=false`, when the company provider is not
configured and the viewer is not a company admin, or when the user lacks access
to the selected project.

Chat history is scoped to the current user and selected project. The route
always passes the selected project ID to `Query.aiChatHistory`; stale cache data
for other projects must be filtered out before rendering. Changing projects
therefore changes the visible history list instead of showing conversations
from another project.

## AI Chat Layout

AI Chat follows the global product UX rules:

- global topbar remains the only app-wide navigation surface;
- project sidebar remains the project/domain navigation surface;
- route content uses independent scroll containers;
- no card-in-card route layout;
- no arbitrary marketing or onboarding layout.

The route has:

- conversation history rail inside the route workspace, grouped by project and
  ordered by last message descending;
- owner-only delete action for each history item, using an icon button and a
  confirmation dialog; successful deletion removes the item from the rail and
  clears the active route when the deleted conversation was open;
- conversation transcript using AI Elements `Conversation`, `Message`, and
  related message/tool components;
- prompt composer using AI Elements prompt input components;
- failed conversation creation and failed stream runs render inline error states
  with explicit retry actions;
- artifact region inline with assistant messages, using json-render renderers;
- approval surfaces for assistant action proposals.

The route must not add a secondary AI Chat page header above the transcript or
wrap the chat in a board/card. On desktop, the route-local history rail is
visible beside the transcript. On mobile, a compact top row exposes history and
new conversation actions. The prompt composer is sticky to the bottom of the
transcript scroll container.

AI Elements attachment, screenshot, web-search, and model-picker controls are
not exposed in v1. The prompt composer accepts text only. The active model is
company-admin configuration, not a per-message user choice.

If the installed AI Elements `PromptInput` exposes attachment, screenshot,
web-search, model-picker, or arbitrary action menu affordances, CloudGrid must
not render those subcomponents in v1. The only visible composer controls are
the textarea and submit/stop control. Submit is disabled for empty text,
archived conversations, missing provider configuration, forbidden project
access, and active non-cancellable stream states.

## Conversation States

The AI Chat route implements:

- loading history;
- no company provider configured;
- forbidden company provider setup;
- empty history;
- active conversation;
- streaming response;
- tool running;
- awaiting approval;
- sandbox error;
- model/provider error;
- archived conversation;
- compacting conversation.

The missing-provider state shows company admins a primary action to open
`/organizations/:organizationId/ai-provider`. Non-admin users see a disabled
state explaining that a company admin must configure AI Chat.

## Message Rendering

User and assistant messages use AI Elements message primitives. Tool and
reasoning status parts use compact inline status components and must not expose
raw provider traces or hidden prompts.

Assistant text must render as sanitized Markdown, including paragraphs, lists,
tables, inline code, fenced code blocks, links, emphasis, and headings. The
Markdown renderer must disable raw HTML and script execution. BFF-approved
CloudGrid route links render as normal in-app navigation; unapproved external
links are rendered as inert text or stripped according to the renderer wrapper.

Supported assistant artifact renderers:

- metric time-series chart;
- metric bar chart;
- table;
- key/value summary;
- trace waterfall;
- log list;
- Mermaid diagram;
- JSON tree;
- diff;
- status summary;
- action approval card.

Artifacts must include accessible labels and keyboard navigation. Mermaid and
JSON renderers are sanitized by the renderer wrapper. External links inside
assistant artifacts are disabled unless the BFF marks the URL as a CloudGrid
route.

json-render action handlers are disabled by default. The frontend must use only
renderer keys from the BFF-approved CloudGrid json-render catalog and must
reject unknown renderer keys instead of falling back to generic JSON execution
or ad hoc component selection. The only allowed handlers are route navigation
to BFF-approved CloudGrid routes and approval/rejection of server-issued
`AiChatActionProposal` IDs. Mermaid click directives, raw HTML, external
scripts, iframe embeds, and external URLs are stripped before render.

AI Chat artifact rendering is not a separate UI system. Each JSON-render key
maps to a shared renderer component under the AI Chat feature boundary, and that
component wraps the same regular CloudGrid components used by product routes
when they exist: metric artifacts reuse the metric explorer chart/table
components, trace artifacts reuse trace detail/waterfall components, log
artifacts reuse log list/detail components, dashboard artifacts reuse dashboard
widget components, and AI Eval artifacts reuse AI Eval table/diff components.
Route-local chart/table/trace/log/dashboard render logic is a drift bug unless
no regular component exists yet; in that case the renderer must be isolated in
the shared artifact renderer and replaced when the regular component lands.

Investigation answers should render CloudGrid evidence inline: trace
waterfalls and trace tables for trace questions, metric charts for metric
questions, log lists for log questions, status summaries for incident triage,
and AI-evaluation tables or diffs when the question concerns agent quality.
The UI must not replace CloudGrid evidence with instructions to open external
observability tools when the selected project has the relevant data.

## Action Approval UI

Action proposals render inline as `action_approval` artifacts.

Approval behavior:

- medium-risk actions use an inline approve/reject control;
- high-risk actions use a confirmation dialog showing changed fields and target
  resource version;
- destructive actions use the destructive button hierarchy and require typed
  confirmation when the existing UI pattern for that resource requires it;
- approval buttons call `Mutation.approveAiChatAction`;
- execution results append an approval-result message part.

The UI must never execute a mutation from assistant text, copied JSON, or a
client-local action object. Only server-issued action proposal IDs can be
approved.

## Project AI Provider Settings UI

`/projects/:projectId/settings/ai-providers` uses the project settings shell.

The page includes:

- provider profile table;
- add/edit provider drawer;
- model alias table;
- add/edit alias drawer;
- effective warnings panel;
- disabled provider status;
- optimistic version conflict handling.

Provider kind choices are `Anthropic`, `OpenAI`, `Azure AI Foundry`,
`AWS Bedrock`, and `Custom OpenAI-compatible`.

The provider form accepts label, provider kind, required provider metadata,
base URL when allowed, credential reference, allowed model identifiers,
defaults, parameter hints, and concurrency cap. It does not accept raw secret
values.

## Company AI Provider Settings UI

`/organizations/:organizationId/ai-provider` uses the admin settings shell and
is available only to company admins.

The page includes:

- current AI Chat provider summary;
- one edit drawer;
- effective status;
- local runtime-provider indicator when bootstrapped from environment;
- validation messages for missing credential refs and provider-specific
  metadata.

Non-admin users cannot navigate to the page from menus. Direct URL access shows
a forbidden state.

## Data Access

- History, conversation, and approval operations use generated GraphQL types.
- Streaming uses the BFF AI Chat stream endpoint and AI SDK compatible stream
  semantics consumed by the AI Elements-based composer/transcript.
- The frontend does not call model providers, harness, storage-read, NATS,
  SurrealDB, OTLP, or sandbox endpoints.
- The frontend treats assistant artifacts as BFF-validated data. It must not
  evaluate artifact scripts, execute arbitrary HTML, or interpret raw mutation
  payloads as executable client actions.

## Verification

Required frontend tests:

- history renders only the selected project's conversations for the current
  user, grouped by project and sorted by last message;
- deleting a conversation removes it from the rail and does not expose it after
  reload;
- missing provider state differs for company admin and non-admin user;
- streaming transcript appends message parts in order;
- assistant Markdown renders lists, code fences, tables, and safe CloudGrid
  links while raw HTML is disabled;
- json-render artifacts reject unknown renderer keys;
- mixed Markdown plus artifact responses preserve server event order, including
  multiple artifacts in one assistant message;
- `cloudgrid-json-render:<renderer>` fenced blocks render as artifacts only
  when backed by a BFF artifact part for the current conversation, while
  user-authored or untrusted model-authored matching fences render as inert
  code;
- tool progress indicators show only safe tool labels/statuses and do not show
  tool input/output payloads;
- approval UI calls only `Mutation.approveAiChatAction`;
- failed conversation create and failed stream states expose retry controls;
- destructive proposals use destructive confirmation styling;
- provider settings forms hide raw secret input and submit credential refs only;
- mobile history sheet and desktop history rail expose the same conversations.
