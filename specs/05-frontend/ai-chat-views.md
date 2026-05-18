---
id: TEC-FE-009
title: AI Chat views
layer: frontend
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
depends_on: [DOM-007, TEC-BE-029, TEC-FE-001, TEC-FE-002]
---

# AI Chat Views

## External UI Inputs

AI Chat uses AI Elements components for conversation structure, messages,
tool-call displays, and prompt input. AI Elements components are installed into
the frontend codebase and adapted to the existing React/Vite, shadcn/ui, and
Tailwind setup rather than treated as opaque runtime widgets.

AI Chat uses json-render for structured assistant artifacts. The frontend must
render only BFF-validated artifact specs from the approved JSON-render catalog.

Reference URLs:

- https://elements.ai-sdk.dev/
- https://json-render.dev/

## Routes

- `/ai-chat`: project workspace AI Chat route. Requires a selected project.
- `/projects/:projectId/settings/ai-providers`: project settings route for
  reusable project AI providers and model aliases.
- `/organizations/:organizationId/ai-provider`: company admin settings route
  for the one provider used by AI Chat.

The project sidebar order becomes `Traces`, `Logs`, `Metrics`, `Dashboards`,
`AI Chat`, and `AI Eval` when both AI features are enabled. AI Chat is hidden
when `CLOUDGRID_AI_CHAT_ENABLED=false`, when the company provider is not
configured and the viewer is not a company admin, or when the user lacks access
to the selected project.

Chat history includes all projects in the current company that the user can
access. The selected project group is expanded first. Other project groups are
collapsed by default; selecting a conversation from another project first
selects that project, then opens the conversation.

## AI Chat Layout

AI Chat follows the global product UX rules:

- global topbar remains the only app-wide navigation surface;
- project sidebar remains the project/domain navigation surface;
- route content uses independent scroll containers;
- no card-in-card route layout;
- no arbitrary marketing or onboarding layout.

The route has:

- route header with title `AI Chat`, selected project context, provider status,
  and a new-conversation action;
- conversation history rail inside the route workspace, grouped by project and
  ordered by last message descending;
- conversation transcript using AI Elements `Conversation`, `Message`, and
  related message/tool components;
- prompt composer using AI Elements prompt input components;
- artifact region inline with assistant messages, using json-render renderers;
- approval surfaces for assistant action proposals.

On desktop, the route-local history rail is visible beside the transcript. On
mobile, history opens in a sheet from the route header. The prompt composer is
sticky to the bottom of the transcript scroll container.

AI Elements attachment, screenshot, web-search, and model-picker controls are
not exposed in v1. The prompt composer accepts text only. The active model is
company-admin configuration, not a per-message user choice.

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

json-render action handlers are disabled by default. The only allowed handlers
are route navigation to BFF-approved CloudGrid routes and approval/rejection of
server-issued `AiChatActionProposal` IDs. Mermaid click directives, raw HTML,
external scripts, iframe embeds, and external URLs are stripped before render.

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

- history renders grouped by project and sorted by last message;
- missing provider state differs for company admin and non-admin user;
- streaming transcript appends message parts in order;
- json-render artifacts reject unknown renderer keys;
- approval UI calls only `Mutation.approveAiChatAction`;
- destructive proposals use destructive confirmation styling;
- provider settings forms hide raw secret input and submit credential refs only;
- mobile history sheet and desktop history rail expose the same conversations.
