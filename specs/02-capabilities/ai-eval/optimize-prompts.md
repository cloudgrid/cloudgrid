---
id: CAP-AIE-004
title: Optimize prompts and examples
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-006, CAP-AIE-003]
implements:
  api: [GQL-Mutation-startOptimizationRun, MSG-eval-optimization-start]
---

# Optimize Prompts And Examples

## Business Intent

Improve a target through reproducible candidate snapshots and metric
comparisons, while keeping promotion explicit.

## Required Behavior

- Optimization is an `OptimizationRun`, not an Experiment.
- V1 optimization may change prompt text and few-shot/example selection.
- Model config may change only when it is already represented as a
  `TargetPartSnapshot`.
- Skill, tool, workflow, and agent optimization are postponed. The snapshot
  schema supports their future parts, but v1 must not execute those flows.
- Every candidate is a new immutable `TargetSnapshot`.
- Every evaluation caused by optimization is a normal `EvaluationRun` with kind
  `quick_shot`, `optimization_validation`, or `test`.
- The objective is explicit and stored: primary metric, secondary metrics,
  constraints, tradeoff metrics, ranking policy, tie-breakers, and minimum
  evidence.
- Candidate generation may use `training`.
- Candidate validation uses `validation`.
- Candidate generation and prompt search must not read `test`.
- Quick-shot is explicit, stores exact selected item revision IDs, and cannot be
  final promotion evidence.
- Promotion creates `PromotionRecord`; CloudGrid never auto-promotes.

## Default Objective

- Primary metric is the family default quality metric.
- Hard constraints: no extraction schema-validity regression, no increased
  problem rate, and no `test` usage during candidate generation.
- Tradeoffs: latency, token count, cost.
- Tie-breakers: lower cost, then lower latency.

## Quick-Shot Defaults

- Minimum sample size is 20 rows when the split has at least 20 eligible rows.
- Use all eligible rows when fewer than 20 exist.
- Classification includes at least 3 rows per affected label when available.
- Extraction includes at least 3 rows per weak or missing field path when
  available.
- Previous-run optimization includes all regressed rows plus a stratified sample
  of unchanged/passed rows.
- Persist seed and selected item revision IDs for any random sample.

## Acceptance Criteria

- Starting optimization without an objective uses the default objective and
  stores the resolved objective on the run.
- A quick-shot run can prune a candidate but cannot be used as promotion
  evidence.
- A candidate diff shows prompt and example changes separately.
- A selected candidate can be promoted only through an explicit mutation.
- Any attempt to use `test` during candidate generation fails before execution.
