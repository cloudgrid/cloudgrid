---
id: CAP-AIE-003
title: Evaluate offline datasets
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [CAP-AIE-001, CAP-AIE-005, CAP-AIE-006, CAP-AIE-007]
implements:
  api: [GQL-Mutation-startExperimentRun, GQL-Subscription-liveExperimentRun, MSG-eval-experiment-start]
---

# Evaluate Offline Datasets

## Business Intent

Run a versioned dataset split through a harness agent or workflow and compare
scored outputs across immutable experiment manifests.

## Behavior

- A user creates an `Experiment` from a dataset version, split selector, scorer
  set, baseline reference, and solver reference.
- `Mutation.startExperimentRun` starts `core/ai-eval-runner` through `eval.experiment.start`.
- Runner creates an immutable manifest before execution. The manifest snapshots
  dataset version, split selector, scorer versions, provider profile references,
  prompt version refs, skill/tool snapshot refs, budget caps, and harness
  adapter refs.
- Runner loads dataset items through storage-read, calls harness `/v1/run` for
  each item, calls `/v1/score` when needed, and persists `DatasetItemRun`,
  `EvalResult`, and `ExperimentRun.summary` through storage-write.
- Progress is streamed through `Subscription.liveExperimentRun`.
- The BFF does not compute scoreboards. Storage-read returns scoreboard summaries as GraphQL-ready view models.
- Offline runs may use `dev`, `optimization`, `validation`, and `regression`
  splits. `holdout` requires explicit holdout evaluation mode and must not be
  used during optimization.

## Acceptance Criteria

- Given a 10-item dataset and two scorers, an experiment run produces 10 DatasetItemRun records, scorer results, and a summary with count, mean score, p50, p95, and pass rate per scorer.
- Given harness is unreachable, start fails or the run transitions to `failed` with `ERR-AIE-003`.
- Given a canceled run, no further dataset items start and already persisted item runs remain queryable.
- Given the split selector includes `holdout` during optimization, run start
  fails before harness execution.
- Given a baseline run is configured, storage-read returns regression deltas by
  scorer, item, segment, latency, and cost.
