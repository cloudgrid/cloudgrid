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
  key_fields: [experimentRunId, manifestDigest, datasetItemId]
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
   budget caps, and allowed dataset item IDs.
5. Runner rejects the run before harness execution when the manifest includes
   invalid split use, missing provider profile, stale scorer version, or budget
   exhaustion.
6. Runner creates or resumes an `ExperimentRun` through storage-write with the
   manifest digest.
7. For each dataset item, runner calls harness adapter `POST /v1/run` with W3C
   trace context and provider/profile refs.
8. Harness executes the solver and emits OTLP spans to CloudGrid.
9. Runner persists `DatasetItemRun` through storage-write.
10. Runner executes deterministic scorers locally and delegates semantic, RAG,
   tool, trajectory, or LLM-judge scorers to harness `POST /v1/score` when the
   scorer requires harness execution.
11. Runner persists `EvalResult` records and emits experiment progress events
   to storage-read-managed live sinks.
12. Runner persists `ExperimentRun.summary` and emits a final `finished` or
   `failed` event.

## Boundaries

- The BFF never loads dataset items or computes scoreboard values.
- The runner never reads or writes SurrealDB directly.
- Harness never calls CloudGrid GraphQL or NATS. It only receives HTTP adapter calls and emits OTLP.

## Terminal Behavior

If the runner cannot load the dataset or scorer definitions, it fails before executing harness. If a single item fails after retries, the run records the item failure, continues while the failure budget allows, and marks the run failed when the configured failure budget is exceeded.

If a resumed run resolves a different manifest digest for the same
`experimentRunId`, the runner fails with `ERR-AIE-002` and does not execute
harness.
