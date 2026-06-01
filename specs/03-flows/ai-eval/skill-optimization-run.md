---
id: FLW-AIE-006
title: Skill optimization run
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: user-directed
depends_on: [DOM-006, CAP-AIE-011, TEC-BE-014, TEC-BE-016, TEC-FE-007]
---

# Skill Optimization Run

## Happy Path

1. Frontend opens `/ai-eval/optimizations/new` from an evaluation, run, or
   comparison whose baseline target exposes a skill package.
2. User selects `Skill package` in the `Search` step and reviews the resolved
   objective, runtime mode, runtime connector when needed, package manifest,
   editable files, max changes per step, rollout batch, and validation split.
3. BFF validates `StartOptimizationRunInput`, including
   `searchPolicy.optimizerKind = skill_text_edit`, and sends
   `eval.optimization.start`.
4. Runner resolves project AI settings, dataset version, split selectors,
   baseline target snapshot, skill package content ref, package manifest,
   runtime mode, runtime connector profile when needed, budget, and content
   policy.
5. Runner dry-runs the runtime:
   - managed harness mode validates CloudGrid-owned model/tool execution;
   - external adapter mode validates adapter authentication, trace propagation,
     OTLP ingestion, standard semantic-convention coverage, async polling,
     package readability, and terminal output or output-ref fields.
6. Runner creates the `OptimizationRun` and executes training rollout batches as
   normal `EvaluationRun` records through the selected runtime.
7. For long-running external adapter items, runner polls adapter status until
   terminal, cancelled, failed, or timed out. The adapter emits OTLP spans during
   execution using the propagated trace context.
8. Terminal adapter responses return status, actual output or output ref,
   problem details, usage/cost/timing, and root trace/span IDs. Storage-read
   derives important steps and trajectory summaries from the required OTLP span
   attributes.
9. Runner builds bounded success/failure evidence from the normalized
   storage-read view and sends it to the CloudGrid optimizer or optional custom
   optimizer adapter.
10. Runner receives structured skill edits, then merges, ranks, clips, and
   applies selected edits only to declared
   editable package files, then asks storage-write to persist the candidate
   target snapshot with updated package and file digests.
11. Runner starts validation as a normal `EvaluationRun` through the same
    runtime mode.
12. Storage-read aggregates validation results and runner applies the strict
   improvement gate.
13. Runner persists a `SkillOptimizationStep` with accepted/rejected status and
    updates `SkillOptimizationMemory`.
14. Storage-read fans out live run progress through `eval.live.events.*.*` to
    `Subscription.liveEvaluationRun`.
15. When the configured steps finish, runner marks the optimization completed,
    stores the best target snapshot, and exports the best package artifact when
    configured.
16. User reviews the run detail, opens the package/file diff, and explicitly
    promotes the selected candidate through `promoteTargetSnapshot`.

## Failure And Recovery

- Missing skill package: runner fails preflight with
  `ERR-003 VALIDATION_FAILED`; no harness call or target snapshot write occurs.
- Invalid package: missing `SKILL.md`, invalid manifest, unresolved runtime
  requirement, digest mismatch, forbidden file, or no editable file fails
  preflight before any optimizer call.
- Runtime connector dry run fails: runner persists the adapter problem with the
  optimization run and does not start rollout batches.
- External adapter returns no actual output or output ref: runner maps the
  response to `ERR-023 RESPONSE_CONTRACT_INVALID`, fails or quarantines the item
  according to run policy, and excludes it from optimizer reflection.
- External adapter omits trace refs or fails to preserve trace context: runner
  waits for the configured trace-link window, then excludes the item from
  optimizer reflection unless the objective requires no trajectory evidence.
- External adapter emits OTLP with propagated trace context but delayed
  persistence: runner waits for the trace-link window before building optimizer
  evidence. If the trace remains unavailable, the item is not optimizer
  evidence.
- Harness adapter unavailable: runner records `ERR-AIE-003`, retries according
  to AI Eval retry policy, and pauses or fails the run when retry budget is
  exhausted.
- Budget exhausted: runner records `ERR-AIE-004`, stops scheduling new
  optimizer and target calls, and leaves completed step evidence readable.
- Candidate exceeds `maxPackageBytes`, `maxSkillBytes`, or `maxSkillTokens`:
  runner rejects the candidate before validation, persists the problem on the
  step, and keeps the current skill package.
- Validation gate rejects: runner persists rejected edits and score delta,
  keeps the current/best snapshot unchanged, and continues only when run policy
  allows more steps.
- Duplicate start request: runner returns the existing optimization run for the
  same project, baseline target, objective, search policy, split selectors, and
  idempotency key.
- Cancellation: runner stops scheduling new rollouts, requests cancellation for
  active harness calls where supported, persists terminal `cancelled`, and
  keeps already accepted target snapshots immutable.

## Data Integrity Rules

- Training, validation, and test row IDs are resolved from immutable dataset
  versions before execution.
- Test rows are allowed only for explicit final test evaluation and never for
  reflection, edit ranking, rejected memory, slow update, or meta memory.
- Storage-write is the only service that persists target snapshots, steps,
  memory, artifacts, and promotion records.
- Storage-read is the only service that returns optimization detail, step
  lists, target diffs, and live events.
- BFF and frontend must not reconstruct skill diffs, aggregate validation
  metrics, or infer gate decisions from raw item runs.
- Skill package manifests are immutable per target snapshot. Candidate manifests
  must preserve runtime requirements unless a future spec explicitly supports
  runtime mutation.
- Runtime adapters are not data stores. CloudGrid persists terminal outputs or
  output refs, metric results, artifact refs, trace refs, and storage-read
  summaries derived from OTLP; customer file trees, MCP state, and business
  records remain outside CloudGrid unless explicitly uploaded as dataset rows or
  artifacts.

## Observability

- Every step has a CloudGrid trace linked from the optimization run detail.
- Logs include `optimization_run_id`, `skill_optimization_step_id`,
  `evaluation_run_id`, `target_snapshot_id`, and mapped error fields when
  available.
- Token, cost, duration, edit count, acceptance count, rejection count, and
  adapter retry metrics are emitted through normal self-observability.
