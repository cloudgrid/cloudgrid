---
id: FLW-AIE-001
title: Offline experiment run
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
trigger:
  type: manual
  expression: GraphQL Mutation.startExperimentRun
orchestration: async
delivery_semantics: at-least-once commands with idempotent persistence
idempotency:
  key_fields: [experimentRunId, manifestDigest, datasetItemId, scorerId, scorerVersion]
  dedupe_window: P30D
  store: storage-write
retry:
  max_attempts: 3
  backoff: exponential
  base_ms: 250
  max_ms: 5000
  retryable_errors: [ERR-013, ERR-014, ERR-AIE-003]
  permanent_errors: [ERR-001, ERR-AIE-001, ERR-AIE-002, ERR-AIE-004]
terminal_failure: mark-experiment-run-failed
---

# Offline Experiment Run

## Steps

1. Client starts `Mutation.startExperimentRun`.
2. BFF validates input and sends `eval.experiment.start` to `core/ai-eval-runner`.
3. Runner asks storage-read to resolve the immutable run manifest.
4. Storage-read resolves dataset version, split selector, scorer versions,
   baseline refs, prompt refs, skill/tool snapshot refs, provider profile refs,
   budget caps, run policy, and allowed dataset item IDs.
5. Runner rejects the run before harness execution when the manifest includes
   invalid split use, missing provider profile, stale scorer version, or budget
   exhaustion.
6. Runner creates or resumes an `ExperimentRun` through storage-write with the
   manifest digest.
7. Runner schedules eligible dataset items according to the resolved
   `EvalRunPolicy`: max parallel requests default `10`, token budget, cost
   budget, per-provider and per-project rate limits, backpressure behavior,
   retry policy, timeout policy, failure budget, and checkpoint cadence.
8. For each dataset item, runner validates item shape, expected evidence,
   token limits, and scorer requirements before calling harness. Invalid,
   oversized, unsupported, or repeatedly failing item-specific cases are marked
   `needs_review` or `quarantined` through storage-write and do not count as
   model-quality regressions.
9. For each eligible dataset item, runner calls harness adapter `POST /v1/run` with W3C
   trace context and provider/profile refs.
10. Harness executes the solver and emits OTLP spans to CloudGrid.
11. Runner persists `DatasetItemRun` through storage-write.
12. Runner executes local scorers locally and delegates scorer capabilities that
   require harness execution to harness `POST /v1/score` when policy permits
   the required content, provider, model alias, budget, and latency class.
13. Runner persists `EvalResult` records and emits experiment progress events
   to storage-read-managed live sinks.
14. Runner persists `ExperimentRun.summary` and emits a final `completed` or
   `failed` event.

## Boundaries

- The BFF never loads dataset items or computes scoreboard values.
- The runner never reads or writes SurrealDB directly.
- Harness never calls CloudGrid GraphQL or NATS. It only receives HTTP adapter calls and emits OTLP.

## Terminal Behavior

If the runner cannot load the dataset, run policy, or scorer definitions, it
fails before executing harness. If a single item fails after retries, the run
records the item failure, continues while the failure budget allows, and marks
the run failed when the configured failure budget is exceeded.

Pause requests move the run to `pausing`, stop scheduling new items, checkpoint
completed item/scorer state, and then move to `paused` after active work drains
or reaches the configured abort boundary. Resume requests validate the persisted
manifest digest and continue only unfinished eligible items. Cancel requests
move the run through `cancelling` to `cancelled`; already persisted item runs and
results remain queryable.

Backpressure from harness, providers, queues, NATS, or storage-write applies the
policy's pacing behavior before retrying. Retryable provider throttling and
temporary harness failures are not model-quality failures. Dataset validation,
token-limit, invalid JSON, missing expected data, or unsupported target-shape
failures are item-quality failures and feed dataset health/suggestions.

If a resumed run resolves a different manifest digest for the same
`experimentRunId`, the runner fails with `ERR-AIE-002` and does not execute
harness.
