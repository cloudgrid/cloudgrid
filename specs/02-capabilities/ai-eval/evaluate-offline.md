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
scored outputs across immutable experiment manifests. Offline evaluation is one
run mode over reusable scorer capabilities; scorer definitions are not
duplicated for offline versus production use.

## Behavior

- A user creates an `Experiment` from a dataset version, split selector, scorer
  set, baseline reference, and solver reference.
- `Mutation.startExperimentRun` starts `core/ai-eval-runner` through `eval.experiment.start`.
- The run resolves an `EvalRunPolicy` before any harness call. The policy
  includes max parallel requests, token budget, cost budget, rate limits,
  backpressure behavior, retry policy, timeout policy, failure budget,
  checkpoint cadence, and item quarantine rules. The default
  `maxParallelRequests` is `10`.
- Runner creates an immutable manifest before execution. The manifest snapshots
  dataset version, split selector, scorer versions, provider profile references,
  prompt version refs, skill/tool snapshot refs, budget caps, and harness
  adapter refs.
- Runner loads dataset items through storage-read, calls harness `/v1/run` for
  each item, calls `/v1/score` when needed, and persists `DatasetItemRun`,
  `EvalResult`, and `ExperimentRun.summary` through storage-write.
- Progress is streamed through `Subscription.liveExperimentRun`.
- Runs support `queued`, `running`, `pausing`, `paused`, `resuming`,
  `cancelling`, `cancelled`, `failed`, and `completed` states. Pause drains or
  checkpoints active item work according to policy; resume reuses the persisted
  manifest digest and starts only unfinished eligible items.
- Dataset item execution state is tracked independently from run state. Item
  states include `pending`, `running`, `passed`, `failed`, `errored`, `skipped`,
  `needs_review`, and `quarantined`.
- Dataset validation errors, token-limit failures, invalid JSON, unsupported
  target shape, missing expected data, or repeated item-specific technical
  failures mark the item `needs_review` or `quarantined` according to policy and
  do not count as model-quality regressions.
- Provider throttling, harness timeouts, queue pressure, and storage backpressure
  trigger policy-defined pacing, retries, pause, or run failure instead of being
  recorded as model-quality failures.
- The BFF does not compute scoreboards. Storage-read returns scoreboard summaries as GraphQL-ready view models.
- Offline runs may use `dev`, `optimization`, `validation`, and `regression`
  splits. `holdout` requires explicit holdout evaluation mode and must not be
  used during optimization.

## Acceptance Criteria

- Given a 10-item dataset and two scorers, an experiment run produces 10 DatasetItemRun records, scorer results, and a summary with count, mean score, p50, p95, and pass rate per scorer.
- Given harness is unreachable, start fails or the run transitions to `failed` with `ERR-AIE-003`.
- Given a canceled run, no further dataset items start and already persisted item runs remain queryable.
- Given a paused run, active checkpointed work remains queryable and a later
  resume continues from the same manifest digest without duplicating completed
  item runs.
- Given `maxParallelRequests` is omitted, runner schedules at most 10 concurrent
  harness or scorer requests for that run.
- Given a dataset item exceeds the configured input token limit before harness
  execution, the item is marked `needs_review` or `quarantined` and remaining
  eligible items continue while the failure budget permits.
- Given the split selector includes `holdout` during optimization, run start
  fails before harness execution.
- Given a baseline run is configured, storage-read returns regression deltas by
  scorer, item, segment, latency, and cost.
