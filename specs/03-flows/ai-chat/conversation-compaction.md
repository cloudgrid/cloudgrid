---
id: FLW-AIC-003
title: AI Chat conversation compaction
domain: ai-chat
layer: flow
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-18
provenance: from-user
trigger:
  type: automatic
  expression: before chat run when message or token threshold is exceeded
orchestration: sync
delivery_semantics: request/reply with persisted compaction snapshot
idempotency:
  key_fields: [conversationId, sourceMessageHighWatermark]
  dedupe_window: P30D
  store: control-plane
retry:
  max_attempts: 1
  retryable_errors: [ERR-AIP-001, ERR-012]
  permanent_errors: [ERR-001, ERR-016]
terminal_failure: continue-with-last-valid-compaction-or-fail-run-if-none
depends_on: [CAP-AIC-001, TEC-BE-029]
---

# AI Chat Conversation Compaction

## Steps

1. Before a chat run, BFF estimates conversation context size.
2. If more than 40 messages exist since the latest compaction or estimated
   context exceeds 70 percent of the model context budget, BFF starts
   compaction before sending the user request to harness.
3. BFF selects:
   - latest compaction summary when present;
   - messages since that compaction;
   - pending action proposal summaries;
   - retained artifact summaries;
   - current project metadata.
4. BFF calls harness with the company AI Chat provider and a fixed compaction
   prompt.
5. BFF validates the compaction summary is text-only, contains no raw secrets,
   and references only existing message, artifact, and action IDs.
6. BFF persists `AiChatCompaction`.
7. The next chat run receives the latest compaction summary plus the recent
   message window.

## Compaction Summary Required Shape

The summary must contain these labeled sections:

- `User goals`
- `Project context`
- `Important evidence`
- `Decisions and assumptions`
- `Artifacts`
- `Pending actions`
- `Open failures`

Approval records and action proposals are never deleted or rewritten by
compaction.
