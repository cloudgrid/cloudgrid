---
id: CAP-AIC-001
title: Use project AI Chat
domain: ai-chat
layer: capability
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-007, TEC-BE-029, TEC-FE-009]
implements:
  api: [GQL-Query-aiChatHistory, GQL-Query-aiChatConversation, GQL-Mutation-createAiChatConversation, GQL-Mutation-archiveAiChatConversation, GQL-Mutation-deleteAiChatConversation, GQL-Mutation-approveAiChatAction, HTTP-POST-api-ai-chat-stream]
---

# Use Project AI Chat

## Business Intent

Let users investigate and operate CloudGrid by asking natural-language
questions while preserving CloudGrid's normal authorization, telemetry query,
rendering, and mutation boundaries.

AI Chat must be competitive as a native CloudGrid observability workflow. It
answers with CloudGrid telemetry evidence, CloudGrid routes, CloudGrid
dashboards, and approved CloudGrid artifacts instead of deferring users to
Jaeger, Zipkin, Datadog, or another external product for primary
investigation.

## Behavior

- A user opens `/ai-chat` while a project is selected.
- The route loads that user's chat history for the selected project and orders
  conversations by each conversation's last message time.
- The user starts a new conversation or resumes an existing project
  conversation.
- The user can permanently delete their own conversation history entry. Deleted
  conversations are removed from subsequent history and direct conversation
  reads, and no other user can delete or read them.
- The prompt stream is sent to the BFF AI Chat endpoint. The BFF creates a chat
  run, loads the company AI Chat provider settings, starts the harness
  conversation, and streams message parts back to the browser.
- Read-only assistant tools can request traces, trace detail, logs, metrics,
  dashboards, alert history, and AI-evaluation view models through approved
  BFF/message-bridge paths.
- Larger tool results are written to the sandbox filesystem as bounded JSONL or
  JSON files. The model receives file handles, schema summaries, row counts,
  and sampled previews instead of full datasets.
- The assistant may create and run small JavaScript/TypeScript scripts inside
  the sandbox to aggregate, join, filter, summarize, or transform retrieved
  data.
- The assistant returns sanitized Markdown text plus typed JSON-render
  artifacts for charts, diagrams, tables, trace waterfalls, logs, Mermaid
  diagrams, JSON inspectors, diffs, and action proposals.
- Structured output must use the approved CloudGrid json-render catalog. The
  assistant must not invent renderer keys, arbitrary executable UI schemas, or
  external embed payloads.
- When the assistant proposes an action, the UI renders the proposal and asks
  for explicit approval when the action is medium, high, or destructive risk.
- Approved actions execute through existing GraphQL mutations or control-plane
  bridge ports after authorization is rechecked.
- Conversations auto-compact when their token or message budget is reached. The
  compacted summary is stored as part of the conversation and earlier messages
  remain available in history.

## Acceptance Criteria

- Given a user asks for recent slow traces, the assistant retrieves trace data
  through storage-read-backed query semantics and renders a table or trace
  waterfall artifact without reading SurrealDB directly.
- Given a user asks to investigate trace latency, errors, or service impact,
  the assistant presents CloudGrid-native evidence and route links instead of
  instructing the user to inspect Jaeger, Zipkin, Datadog, or another external
  tool when CloudGrid contains the relevant data.
- Given a user asks for metric comparison across a time window, the assistant
  requests metric series through the approved metric query path, stores the
  result as a sandbox file when it is large, and renders a chart artifact.
- Given assistant text includes Markdown lists, tables, code fences, or links,
  the UI renders safe Markdown and disables raw HTML or script execution.
- Given assistant output includes a structured chart, table, waterfall, log
  list, diff, diagram, or approval card, the BFF validates the artifact against
  the approved json-render catalog before the frontend renders it.
- Given a user asks about AI-evaluation regressions, the assistant reads
  GraphQL AI-eval view models and links evidence back to traces, datasets,
  scorers, or experiment runs.
- Given the assistant proposes creating or editing a dashboard, alert, dataset,
  scorer, retention policy, or provider setting, execution waits for explicit
  approval and rechecks the user's role.
- Given the assistant proposes deleting, revoking, disabling, or changing
  membership/provider/security settings, the UI must show a destructive
  confirmation and the action must be rejected without approval.
- Given a sandbox script tries to access network, environment variables, host
  paths, NATS, SurrealDB, or provider credentials, the run fails with a
  sandbox error and no action executes.
- Given the conversation exceeds the compaction threshold, the BFF stores a
  compacted memory snapshot and uses it for the next run while preserving
  previous messages and approval audit records.
