---
id: FLW-AIE-001
title: Offline dataset evaluation run
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
trigger:
  type: manual
  expression: GraphQL Mutation.startEvaluationRun
orchestration: async
delivery_semantics: at-least-once commands with idempotent persistence
idempotency:
  key_fields: [evaluationRunId, datasetVersionId, targetSnapshotId, datasetItemRevisionId]
  dedupe_window: P30D
  store: storage-write
retry:
  max_attempts: 3
  backoff: exponential
  base_ms: 250
  max_ms: 5000
  retryable_errors: [ERR-013, ERR-014, ERR-AIE-003]
  permanent_errors: [ERR-001, ERR-AIE-001, ERR-AIE-002, ERR-AIE-004]
terminal_failure: mark-evaluation-run-failed
---

# Offline Dataset Evaluation Run

## Steps

1. Client starts `Mutation.startEvaluationRun`.
2. BFF validates input and sends `eval.evaluation.run.start` to
   `core/ai-eval-runner`.
3. Runner resolves project AI settings, dataset version, selected item
   revisions, split selector, target snapshot, metric settings, run policy, and
   retention role.
4. Runner rejects before execution when selected items are not ready, schemas do
   not validate, budgets are exhausted, or split rules are violated.
5. Runner creates or resumes `EvaluationRun`.
6. Runner schedules `EvaluationItemRun` work according to run policy.
7. For each item, runner starts trace context, executes the target, persists
   actual output, trace refs, metrics, problems, trajectory summary, and
   important-step previews.
8. Storage-read aggregates metrics and emits live events.
9. Runner finalizes the run as `completed`, `cancelled`, or `failed`.

## Boundaries

- BFF never loads dataset items or computes metrics.
- Runner never reads or writes SurrealDB directly.
- Storage-read owns live authorization and fanout.
- Full trace detail remains in telemetry storage.

## Terminal Behavior

Pause stops scheduling new item work and moves to `paused` after active work
drains or checkpoints. Resume continues unfinished eligible items from the same
run snapshot. Cancel stops scheduling and marks unfinished work cancelled.

Adapter/provider/storage retryable failures follow run policy. Dataset quality
problems become item/metric problems and do not require frontend special cases.
