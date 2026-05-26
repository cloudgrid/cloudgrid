---
id: FLW-AIE-003
title: Live evaluation run subscription
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
trigger:
  type: manual
  expression: GraphQL Subscription.liveEvaluationRun
orchestration: async
delivery_semantics: at-most-once
idempotency:
  key_fields: [subscriptionId]
  dedupe_window: PT0S
  store: storage-read-memory
terminal_failure: close-subscription
---

# Live Evaluation Run Subscription

## Purpose

Stream evaluation run progress through GraphQL while keeping authorization,
matching, and event fanout owned by storage-read.

## Steps

1. Client starts `Subscription.liveEvaluationRun`.
2. BFF validates input, creates `subscriptionId`, and sends `eval.live.start`
   to storage-read.
3. Storage-read validates read authorization and registers the subscription for
   one `evaluationRunId`.
4. Runner and storage-write persist durable run progress changes.
5. Storage-read consumes progress, resolves GraphQL-ready run summaries and
   item/candidate context, assigns sequence numbers, and publishes
   `EvaluationRunEvent`.
6. BFF validates sink events and forwards them to GraphQL.
7. On unsubscribe or disconnect, BFF sends `eval.live.stop`.

## Event Types

- `started`;
- `item_completed`;
- `progress`;
- `heartbeat`;
- `paused`;
- `resumed`;
- `cancelled`;
- `failed`;
- `completed`.

Optimization candidate progress uses `progress` until a dedicated candidate
event type is specified.

## Boundary

Runner does not publish directly to BFF sink subjects.
