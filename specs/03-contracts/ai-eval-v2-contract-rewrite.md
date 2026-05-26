---
id: CON-AIE-001
title: AI evaluation v2 contract rewrite
layer: contracts
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [DOM-006, TEC-BE-016]
---

# AI Evaluation v2 Contract Rewrite

## Purpose

This file is the implementation contract for migrating the machine-readable
GraphQL, AsyncAPI, and entity JSON schemas from the legacy Scorer/Experiment
model to AI Eval v2.

Implementation agents must not implement AI Eval v2 against legacy fields such
as `Scorer`, `Experiment`, `ExperimentRun`, `EvalSolverRef`, `reviewStatus`,
`targetShape`, `dev`, `optimization`, `regression`, or `holdout`.

## Required GraphQL Changes

Remove or wrap legacy public fields in the same contract change:

- `Query.scorers`;
- `Query.experiments`;
- `Query.experimentRun`;
- `Mutation.createScorer`;
- `Mutation.createExperiment`;
- `Mutation.startExperimentRun`;
- `Mutation.pauseExperimentRun`;
- `Mutation.resumeExperimentRun`;
- `Mutation.cancelExperimentRun`;
- `Subscription.liveExperimentRun`.

Add v2 public fields:

- `Query.datasetVersion`;
- `Query.evaluationDefinitions`;
- `Query.evaluationDefinition`;
- `Query.evaluationRuns`;
- `Query.evaluationRun`;
- `Query.evaluationComparison`;
- `Query.optimizationRuns`;
- `Query.optimizationRun`;
- `Query.targetSnapshot`;
- `Mutation.createEvaluationDefinition`;
- `Mutation.updateEvaluationDefinition`;
- `Mutation.startEvaluationRun`;
- `Mutation.cancelEvaluationRun`;
- `Mutation.pauseEvaluationRun`;
- `Mutation.resumeEvaluationRun`;
- `Mutation.createEvaluationComparison`;
- `Mutation.startOptimizationRun`;
- `Mutation.promoteTargetSnapshot`;
- `Subscription.liveEvaluationRun`.

Dataset GraphQL types must use:

- `curationStatus`, not `reviewStatus`;
- `evaluationFamily`, not row-level `targetShape`;
- `training`, `validation`, `test` split values only;
- dataset settings fields from `DOM-006`;
- dataset version and item revision IDs.

## Required AsyncAPI Changes

Remove or wrap legacy subjects:

- `eval.scorer.create`;
- `eval.scorer.search`;
- `eval.experiment.create`;
- `eval.experiment.start`;
- `eval.experiment.cancel`;
- `eval.experiment.pause`;
- `eval.experiment.resume`;
- `eval.experiment.search`;
- `eval.experiment.progress`;
- `eval.manifest.resolve`;
- `eval.prompt_version.promote`.

Add v2 subjects exactly as listed in `TEC-BE-016`.

Payloads must include idempotency keys for dataset writes, evaluation run start,
run controls, external adapter item execution, and promotion.

## Required Entity Schema Changes

Add schemas:

- `dataset-version.schema.json`;
- `dataset-item-revision.schema.json`;
- `evaluation-definition.schema.json`;
- `evaluation-run.schema.json`;
- `evaluation-item-run.schema.json`;
- `metric-capability.schema.json`;
- `metric-result.schema.json`;
- `metric-aggregate.schema.json`;
- `evaluation-comparison.schema.json`;
- `evaluation-target-ref.schema.json`;
- `target-snapshot.schema.json`;
- `target-diff.schema.json`;
- `promotion-record.schema.json`;
- `optimization-run.schema.json`;

Replace or remove schemas:

- `scorer.schema.json`;
- `scorer-definition.schema.json`;
- `experiment.schema.json`;
- `experiment-run.schema.json`;
- `experiment-manifest.schema.json`;
- `eval-solver-ref.schema.json`.

Update schemas:

- `dataset.schema.json`;
- `dataset-item.schema.json`;
- `dataset-candidate.schema.json`;
- `dataset-import-job.schema.json`;
- `dataset-export-job.schema.json`;
- `eval-run-policy.schema.json`;
- `project-ai-settings.schema.json`.

## Contract Test Requirements

`bun run contracts:check` must fail when:

- a legacy AI Eval public field remains callable without v2 wrapper semantics;
- a legacy AI Eval subject is registered as the primary v2 path;
- any split enum contains values other than `training`, `validation`, `test`;
- any row status enum contains `reviewStatus` or omits `curationStatus`;
- JSON expected output lacks required `expectedJsonSchema`;
- evaluation run start does not reference dataset version and target snapshot;
- metric results use untyped payloads for core metrics;
- external adapter payloads omit trace context or idempotency key fields.

## Readiness Rule

AI Eval v2 implementation may start only after this contract rewrite and
`bun run contracts:check` pass. Until then, concept/domain specs are approved
product behavior, but machine-readable contracts are known migration work.
