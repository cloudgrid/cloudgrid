---
id: CAP-AIE-004
title: Optimize prompts through harness workflows
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
depends_on: [CAP-AIE-003, ADR-0006, ADR-0007]
implements:
  api: [GQL-Mutation-startOptimizationRun, MSG-eval-optimization-start]
---

# Optimize Prompts Through Harness Workflows

## Business Intent

Use scored datasets to propose better prompt versions and harness-side skill or
tool configuration snapshots while keeping optimization algorithms and provider
calls outside CloudGrid services.

## Behavior

- Optimization is represented as an `ExperimentRun` with an immutable optimizer
  manifest.
- Implemented v1 optimizer kinds are `bootstrap_fewshot` and
  `critic_mutate_judge_pick`.
- Roadmapped optimizer families are `mipro_v2` and
  `reflective_text_gradient`/GEPA-style reflective improvement. They may appear
  as documented future capability names, but implementation must not execute
  them until the harness adapter advertises support and the run manifest
  captures their search budget, seed/randomization, candidate count,
  reproducibility, trace evidence, and promotion constraints.
- Runner delegates optimization to harness `/v1/optimize` and persists streamed
  candidate `PromptVersion` records, candidate skill/tool snapshot refs, and
  child experiment summaries.
- CloudGrid never auto-promotes a candidate. `promotePromptVersion` is an explicit user mutation.
- Python-based optimizers are not part of the deployable surface.
- Optimizers may read `optimization` and `validation` splits. They must not
  read `holdout`.
- Optimizers use the same run lifecycle and `EvalRunPolicy` as offline
  experiments, including max parallel requests default `10`, token and cost
  budgets, rate limiting, backpressure, retry, pause/resume/cancel, and item
  quarantine.
- Optimization targets may be single prompts, harness-side skill snapshots,
  tool configuration snapshots, agent trajectories, or multi-agent workflow
  snapshots. The manifest must distinguish which artifact type changed so the
  comparison UI does not collapse prompt, skill, and tool changes into one
  opaque diff.
- Small-dataset optimizations are allowed but the resulting candidate confidence
  must be marked low until configured regression and holdout thresholds pass.

## Acceptance Criteria

- Given a dataset and base prompt version, `bootstrap_fewshot` produces at least one candidate PromptVersion with selected demonstrations captured as metadata.
- Given a winning candidate, users can promote it to a tag through GraphQL.
- Given optimization exceeds configured cost limits, the run stops with `ERR-AIE-004`.
- Given an optimizer attempts to use holdout items, the runner rejects the
  manifest before harness execution.
- Given a tool or skill snapshot changes, the candidate comparison shows prompt,
  skill, and tool changes separately.
