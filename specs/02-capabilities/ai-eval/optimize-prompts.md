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
- Supported optimizer kinds are `bootstrap-fewshot`,
  `critic-mutate-judge-pick`, `mipro-v2`, and `reflective-text-gradient`.
- Runner delegates optimization to harness `/v1/optimize` and persists streamed
  candidate `PromptVersion` records, candidate skill/tool snapshot refs, and
  child experiment summaries.
- CloudGrid never auto-promotes a candidate. `promotePromptVersion` is an explicit user mutation.
- Python-based optimizers are out of scope for the deployable surface.
- Optimizers may read `optimization` and `validation` splits. They must not
  read `holdout`.
- Small-dataset optimizations are allowed but the resulting candidate confidence
  must be marked low until configured regression and holdout thresholds pass.

## Acceptance Criteria

- Given a dataset and base prompt version, `bootstrap-fewshot` produces at least one candidate PromptVersion with selected demonstrations captured as metadata.
- Given a winning candidate, users can promote it to a tag through GraphQL.
- Given optimization exceeds configured cost limits, the run stops with `ERR-AIE-004`.
- Given an optimizer attempts to use holdout items, the runner rejects the
  manifest before harness execution.
- Given a tool or skill snapshot changes, the candidate comparison shows prompt,
  skill, and tool changes separately.
