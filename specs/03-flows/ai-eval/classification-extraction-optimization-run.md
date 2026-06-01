---
id: FLW-AIE-007
title: Classification and extraction optimization run
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: research-informed
depends_on: [DOM-006, CAP-AIE-012, CAP-AIE-013, TEC-BE-014, TEC-BE-016, TEC-FE-007]
---

# Classification And Extraction Optimization Run

## Happy Path

1. Frontend opens `/ai-eval/optimizations/new` from a classification or
   extraction evaluation run or comparison.
2. The wizard preselects source run/comparison, dataset, baseline target,
   objective, editable target parts, runtime mode, training split, validation
   split, and quick-shot policy from the source context.
3. User reviews only unresolved choices: target part selection when multiple
   editable parts exist, runtime adapter profile when the target is an external
   adapter, and optional test-run intent.
4. BFF validates `StartOptimizationRunInput` and sends
   `eval.optimization.start`.
5. Runner resolves project AI settings, dataset version, training and validation
   item revisions, baseline target snapshot, metric settings, budget, content
   policy, and runtime capabilities.
6. Runner verifies classification label settings or extraction schema settings.
7. Runner dry-runs the runtime:
   - managed harness mode validates model/profile execution and OTLP emission;
   - external adapter mode validates authentication, async polling, trace
     propagation, terminal output/output-ref support, and candidate target
     content support.
8. Runner creates the optimization run and executes a normal training rollout
   `EvaluationRun`.
9. Storage-read returns family diagnosis from training results:
   classification confusion/support/unknown-label breakdown or extraction
   valid-JSON/schema/weak-field breakdown.
10. Runner sends bounded training evidence and diagnosis to the CloudGrid
    internal optimizer or custom optimizer adapter.
11. Optimizer returns structured `PromptOptimizationProposal` records.
12. Runner validates, merges, ranks, and applies compatible proposals to create
    candidate target snapshots.
13. Runner executes quick-shot pruning against selected training rows and keeps
    at most the configured validation candidate count.
14. Runner executes full validation runs for surviving candidates.
15. Storage-read aggregates validation metrics and comparisons.
16. Runner applies the strict improvement gate and hard constraints.
17. Runner persists `PromptOptimizationStep`, candidate snapshots, comparisons,
    rejected summaries, and current/best candidate refs.
18. Storage-read fans out run progress through `eval.live.events.*.*` to
    `Subscription.liveEvaluationRun`.
19. Steps repeat until epochs, steps, budget, cancellation, or convergence stop.
20. User reviews diagnosis, candidate diffs, metric tradeoffs, and rejected
    candidates, then explicitly promotes a selected target snapshot through
    `promoteTargetSnapshot`.

## Try-It Fixture Path

The local try-it and default hermetic integration paths use:

- `test_data/ai_eval/classification` for support-intent classification;
- `test_data/ai_eval/extraction` for order-confirmation extraction.

Each path imports `dataset-settings.json` and `rows.jsonl`, creates the
`baseline-target.json` prompt target from the adjacent prompt/example files,
starts a validation evaluation run, starts prompt optimization, reads
`PromptOptimizationStep` evidence through `OptimizationRuns`, and promotes only
after validation evidence exists. Automated integration and E2E runs execute
these paths through the deterministic CloudGrid AI harness adapter only. Test
rows remain excluded unless the caller starts an explicit final confidence run.

Manual live-model checks use the separate
`test_data/ai_eval/manual_real_llm/classification` and
`test_data/ai_eval/manual_real_llm/extraction` packs. Those packs require normal
project provider settings and model aliases configured outside the fixture
directory and are never part of automated integration execution.

## Failure And Recovery

- Missing label/schema readiness: runner fails preflight with
  `ERR-003 VALIDATION_FAILED`; no target or optimizer call occurs.
- No eligible training or validation rows: runner fails preflight and returns
  split-specific readiness details.
- External adapter cannot execute candidate target content: optimization start is
  rejected. Evaluation and comparison remain available for the black-box target.
- Harness or external adapter timeout: runner records item/run problems,
  retries according to AI Eval retry policy, then pauses or fails when retry
  budget is exhausted.
- Invalid optimizer proposal: runner rejects the proposal, records a bounded
  problem on the step, and may continue with remaining valid proposals.
- Oversized candidate prompt/examples: runner rejects the candidate before
  quick-shot or validation.
- Candidate mutates dataset schema, expected values, protected target parts, or
  model config without explicit editability: runner rejects the candidate before
  snapshot persistence.
- Quick-shot regression: runner prunes the candidate and records a rejection
  summary.
- Validation gate rejection: runner keeps current/best snapshot unchanged,
  persists rejection evidence, and continues only when budget and policy allow.
- Budget exhausted: runner stops scheduling new target and optimizer calls,
  persists completed evidence, and marks the run failed or completed according to
  whether a valid candidate was accepted.
- Cancellation: runner stops scheduling new calls, cancels active calls when the
  runtime supports it, persists terminal `cancelled`, and keeps already persisted
  snapshots immutable.
- Duplicate start request: runner returns the existing optimization run for the
  same project, baseline target, objective, search policy, split selectors, and
  idempotency key.

## Data Integrity Rules

- Training, validation, and test item revision IDs are resolved from immutable
  dataset versions before execution.
- Candidate generation, diagnosis prompts, rejected summaries, and custom
  optimizer adapter calls may use only training split content.
- Validation results may update gate decisions and aggregate comparisons, but
  validation row content and validation trajectories must not become future
  optimizer input.
- Test rows are never used for candidate generation. A test run is an explicit
  final confidence check only.
- Storage-write is the only service that persists optimization runs, prompt
  steps, target snapshots, metric results, comparison records, and promotion
  records.
- Storage-read is the only service that returns family diagnosis, aggregate
  metrics, comparison deltas, prompt/example diffs, and live events.
- BFF and frontend must not reconstruct gate decisions, family diagnosis,
  aggregate metrics, or route-primary target diffs from raw item rows.
- Dataset schema and expected row values are immutable evidence during an
  optimization run. Changing either creates a new dataset version and requires a
  new optimization run.

## Observability

- Every optimization run, training rollout, quick-shot run, validation run,
  external adapter call, and optimizer adapter call carries W3C trace context.
- Logs include `optimization_run_id`, `prompt_optimization_step_id`,
  `evaluation_run_id`, `target_snapshot_id`, `dataset_version_id`, and mapped
  error fields when available.
- Self-observability metrics include target-call count, optimizer-call count,
  proposal count, candidate count, accepted/rejected count, validation gate
  deltas, token count, cost, duration, retry count, and adapter failure count.
