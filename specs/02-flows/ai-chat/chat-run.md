---
id: FLW-AIC-001
title: AI Chat run
domain: ai-chat
layer: flow
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
trigger:
  type: manual
  expression: HTTP POST /api/ai-chat/stream
orchestration: async
delivery_semantics: SSE stream with persisted idempotent run state
idempotency:
  key_fields: [conversationId, userMessageClientId, idempotencyKey]
  dedupe_window: P7D
  store: control-plane
retry:
  max_attempts: 1
  retryable_errors: [ERR-012, ERR-013, ERR-014, ERR-AIP-001]
  permanent_errors: [ERR-001, ERR-016, ERR-AIC-001, ERR-AIC-002, ERR-AIC-004, ERR-AIC-005]
terminal_failure: persist-run-failed-and-stream-terminal-error
depends_on: [CAP-AIC-001, TEC-BE-029]
---

# AI Chat Run

## Steps

1. Frontend creates or resumes a conversation through GraphQL.
2. Frontend sends `POST /api/ai-chat/stream` with `conversationId`,
   `projectId`, `userMessageClientId`, `idempotencyKey`, and text message
   parts.
3. BFF validates the session, selected project, conversation ownership, and
   idempotency key.
4. BFF rejects the request when another run is already streaming for the same
   conversation.
5. BFF loads company AI Chat provider settings from control-plane.
6. BFF resolves the runtime credential reference and builds a redacted
   provider snapshot.
7. BFF appends the user message and creates an `AiChatRun` in control-plane.
   For a new conversation, BFF derives the title from the first user text part.
8. BFF streams `run.started` and starts the harness chat stream with the
   provider snapshot, compacted conversation memory, recent message window, tool
   registry, and W3C trace context.
9. When harness emits text, BFF streams `text.delta` and appends assistant
   message parts incrementally after applying the assistant Markdown sanitation
   rules from `specs/04-backend/ai-chat.md`.
10. When harness requests a tool, BFF validates the tool name and arguments,
    injects the conversation `projectId`, executes the tool through approved
    GraphQL helper or message bridge paths, materializes large results into the
    sandbox, and streams `tool.started` / `tool.completed`.
11. When a sandbox script is needed, BFF writes and runs the script through the
    sandbox runner, validates outputs, and streams artifacts or sanitized
    errors.
12. When the assistant emits a render spec, BFF validates it against the
    approved CloudGrid json-render catalog, persists the artifact metadata, and
    streams `artifact.created`.
13. When the assistant proposes an action, BFF validates the action whitelist,
    persists the proposal, and streams `action.proposed`; execution waits for
    the approval flow.
14. BFF persists the final assistant message, run metrics, token counts,
    artifact count, and terminal run status.
15. BFF streams `run.completed` or `run.failed`, then closes the SSE response.
16. BFF deletes ephemeral sandbox files after terminal run handling.

## Duplicate And Abort Behavior

- Repeating a completed `idempotencyKey` returns `ERR-001` with the existing
  terminal `runId` in problem details and does not append another user message.
- Repeating an active `idempotencyKey` returns `ERR-001` with the active `runId`
  in problem details and does not start a second stream.
- Browser abort cancels the harness stream, marks the run `cancelled`, appends a
  compact cancellation message part, and deletes ephemeral sandbox files.
- Network disconnect without a clean abort is treated as abort after 15 seconds
  without a successful write to the response stream.

## Boundaries

- BFF never reads SurrealDB directly.
- BFF never sends raw provider credentials to frontend, control-plane,
  storage-read, storage-write, logs, spans, or sandbox files.
- Storage-read owns telemetry query semantics for every read tool.
- Control-plane owns conversation, message, artifact, compaction, and action
  approval persistence.
- Harness owns model execution and tool-call planning; BFF owns actual tool
  execution.
- Secret-returning mutations, including ingest credential creation, are not
  executable through AI Chat v1.
- AI Chat must keep primary trace, log, metric, dashboard, alert, and
  AI-evaluation investigation inside CloudGrid. It must not defer to Jaeger,
  Zipkin, Datadog, or another external observability product when CloudGrid has
  the required project data.
- Assistant structured output must use approved json-render catalog renderers;
  unknown renderer keys or executable UI payloads are rejected before streaming
  to the frontend.
