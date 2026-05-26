# AI Eval Spec Rewrite Backlog

Date: 2026-05-23

Status: brainstorming, not implementation-ready plan

## Why Specs Need A Rewrite

The current approved specs are more flexible than the product likely needs for
v1. They expose row-level target shapes, user-facing scorers, experiments, and
scorer-specific contracts. That is powerful but hard to understand.

The simpler model is:

- datasets define one row contract;
- expected JSON is validated by dataset-level JSON Schema;
- rows are simple;
- evaluations produce metrics, results, and comparisons;
- optimization orchestrates dataset evaluations;
- target snapshots make reruns and optimization reproducible;
- production quality waits until the dataset/evaluation model is clearer.

## Proposed Rewrite Direction

Rewrite from:

```text
DatasetItem targetShape + Scorer + Experiment
```

to:

```text
Dataset evaluationFamily + JSON Schema expected output
+ Metric settings + Dataset evaluations + Optimization comparisons
```

## Spec Areas To Update

1. Dataset capability specs:
   - replace row-level target shape selection with dataset-level schema
     settings;
   - add `reason`;
   - add curation status and optional observed output value;
   - simplify split vocabulary to `training`, `validation`, `test`;
   - add `evaluationFamily`;
   - define trace extraction settings.

2. Evaluation specs:
   - introduce dataset evaluation definitions and runs;
   - model optimization as a loop around evaluation runs;
   - define metric settings and metric results;
   - define comparison summaries.
   - require every dataset item run to store trace/root-span refs and bounded
     trajectory summaries.
   - define row-level textual trajectory summary, important-step previews, and
     evidence refs.
   - define retention classes for durable metadata, review-window summaries,
     ephemeral optimizer artifacts, and trace-retention-bound evidence.

3. Target specs:
   - replace or wrap `EvalSolverRef` with `EvaluationTargetRef`;
   - require target snapshots in every run;
   - define candidate target snapshots for optimization.

4. Scorer specs:
   - decide whether `Scorer` entities are removed entirely;
   - if implementation needs metric calculators, make them internal metric
     definitions, not user-managed project assets;
   - replace scorer refs in manifests with resolved metric settings.

5. GraphQL and message contracts:
   - add dataset settings fields;
   - add metric settings/result fields;
   - add evaluation definition/run/comparison fields;
   - remove or deprecate scorer create/search fields if no longer needed;
   - align AsyncAPI request/reply subjects with the new objects.

6. Storage-read semantics:
   - own dataset validation and health for dataset-level schemas;
   - own metric aggregation and comparison summaries;
   - keep frontend from recomputing metrics, health, or comparisons.

7. Storage-write semantics:
   - validate row JSON against dataset schema;
   - version dataset changes;
   - persist evaluation runs, metric results, target snapshots, and comparison
     records;
   - handle candidate fallback from trace extraction.

8. Runner and harness:
   - run dataset evaluations against target snapshots;
   - persist trajectory evidence refs;
   - support quick-shot/sample candidate evaluations for optimization;
   - expire or prune optimizer scratch and low-value intermediate candidates
     according to retention policy;
   - support prompt/example optimization first;
   - postpone skill/tool/workflow optimization until snapshot/promotion
     semantics are clear.

9. Frontend UX:
   - primary sections: Datasets and Evaluations;
   - Production quality stays later/backlog;
   - remove Scorers as a primary section;
   - remove Experiments as the first concept;
   - add dataset settings, simple row editor, evaluation creation, run detail,
     comparison views, and `Optimize from this evaluation`.

10. Tests and contracts:
    - split enforcement;
    - JSON Schema validation;
    - reason defaulting;
    - failure-derived row eligibility and observed-output handling;
    - extraction policy behavior;
    - target snapshot reproducibility;
    - item-run trace correlation;
    - trajectory summary bounds and evidence refs;
    - quick-shot sample reproducibility;
    - retention pruning and pinned-run preservation;
    - metric result persistence;
    - comparison summaries.

## Superseded Open Questions

These brainstorming questions are superseded by
[`../../concepts/ai-eval-v2/decisions.md`](../../concepts/ai-eval-v2/decisions.md).

Remaining pre-spec hardening items are tracked in
[`../../concepts/ai-eval-v2/pre-spec-hardening-review.md`](../../concepts/ai-eval-v2/pre-spec-hardening-review.md).
