---
id: FLW-AIE-003
title: Live experiment subscription
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
trigger:
  type: manual
  expression: GraphQL Subscription.liveExperimentRun
orchestration: async
delivery_semantics: at-most-once
idempotency:
  key_fields: [subscriptionId]
  dedupe_window: PT0S
  store: storage-read-memory
terminal_failure: close-subscription
---

# Live Experiment Subscription

## Purpose

Stream experiment run progress through GraphQL while keeping live matching and event fanout owned by storage-read.

## Steps

1. Client starts `Subscription.liveExperimentRun`.
2. BFF validates input, creates `subscriptionId` and a BFF-owned ephemeral sink subject, then sends `eval.live.start` to storage-read.
3. Storage-read validates read authorization and registers the sink for one `experimentRunId`.
4. AI-eval-runner publishes durable experiment progress notifications after
   manifest creation, item completion, score persistence, candidate generation,
   cancellation, failure, and completion.
5. Storage-read consumes those notifications, resolves the current
   GraphQL-ready run summary and candidate/dataset item context when needed,
   applies read authorization, assigns per-subscription sequence numbers, and
   publishes `ExperimentRunEvent` to matching sink subjects.
6. BFF validates sink events and forwards them to GraphQL.
7. On unsubscribe or disconnect, BFF sends `eval.live.stop`.

## Event Types

- `started`
- `item_completed`
- `progress`
- `heartbeat`
- `paused`
- `resumed`
- `cancelled`
- `failed`
- `completed`

Candidate events are represented as `progress` until the GraphQL contract adds
dedicated optimization candidate event types.

## Boundaries

The runner does not publish directly to BFF sink subjects. Storage-read owns live authorization, matching, sequence numbers, and GraphQL-ready event derivation.
