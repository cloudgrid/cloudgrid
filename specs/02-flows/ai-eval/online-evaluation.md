---
id: FLW-AIE-002
title: Online AI evaluation
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
trigger:
  type: event
  expression: ai.persisted.projections
orchestration: async
delivery_semantics: at-least-once notification with idempotent EvalResult writes
idempotency:
  key_fields: [projectionId, scorerId, scorerVersion]
  dedupe_window: P30D
  store: storage-write
retry:
  max_attempts: 3
  backoff: exponential
  base_ms: 250
  max_ms: 5000
  retryable_errors: [ERR-013, ERR-014, ERR-AIE-003]
  permanent_errors: [ERR-AIE-002, ERR-AIE-004]
terminal_failure: skip-scoring-and-log
---

# Online AI Evaluation

## Steps

1. Storage-write persists AI projections and publishes `ai.persisted.projections`.
2. AI-eval-runner receives the notification.
3. Runner asks storage-read for enabled online policy matches and scorer
   versions for the projection, project, agent, service, route, model, tool,
   retrieval source, and safe indexed attributes.
4. Storage-read returns matched policies and bounded read models. It does not
   return raw prompt, completion, tool parameter, or retrieved document content
   unless content capture rules permit it for the scorer.
5. Runner checks sampling, cost, concurrency, and policy caps.
6. Runner executes scorers and persists `EvalResult` or bounded skipped-result
   summaries through storage-write.
7. Runner creates `AnnotationQueueItem` records for configured routing rules.
8. Storage-read derives production quality summaries from persisted results.

## Boundaries

Notifications contain IDs, kinds, and routing hints only. They do not contain source payload content. Runner loads all needed read models through storage-read and persists only through storage-write.

Runner must not match online policies by reading raw projection maps locally.
Policy semantics remain in storage-read so production quality summaries,
annotation routing, and scorer selection use the same filter behavior.
