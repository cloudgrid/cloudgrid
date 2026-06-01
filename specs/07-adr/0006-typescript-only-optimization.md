---
id: ADR-0006
title: TypeScript-only AI optimization
status: accepted
superseded_by: null
date: 2026-05-12
provenance: from-user
context: AI-eval optimization can use Python-heavy frameworks such as DSPy, TextGrad, and Optuna-backed MIPROv2, but CloudGrid's deployable surface is TypeScript and Go.
decision: Keep deployable optimization TypeScript-only through harness workflows.
decision_rationale: Avoiding Python keeps CloudGrid's runtime, packaging, CI, and operator story aligned with the existing stack. Few-shot bootstrapping and critic/mutate/judge workflows can run inside harness without adding a Python process.
consequences:
  positive: [Simpler deployment, no Python runtime, optimization behavior stays in harness]
  negative: [No local DSPy MIPROv2 or TextGrad parity]
affects: [CAP-AIE-004, CAP-AIE-013, TEC-BE-014]
---

# ADR-0006: TypeScript-Only AI Optimization

CloudGrid will not ship Python, Optuna, DSPy, TextGrad, SkillOpt, or ax-llm
MIPROv2 in its deployable services. Implemented optimizer kinds are
`bootstrap_fewshot`, `critic_mutate_judge_pick`, and `skill_text_edit`, all
executed through the CloudGrid runner and harness adapter contracts.

`skill_text_edit` is inspired by SkillOpt's text-space training loop but is not
a direct dependency or runtime integration. CloudGrid owns the run state,
dataset split discipline, target snapshots, validation gates, retained evidence,
and promotion records; the harness adapter only executes target calls and
optimizer-model reflection calls behind project provider settings.

`mipro-v2` and `reflective-text-gradient`/GEPA-style reflective optimization
are roadmap optimizer families, not implemented v1 behavior. They may become
available only through explicit harness capability negotiation and manifests
that capture search budget, random seed, candidate count, scorer set,
trace/failure evidence, reproducibility limits, and promotion constraints.

Classification and extraction prompt optimization uses the implemented
`bootstrap_fewshot` and `critic_mutate_judge_pick` optimizer kinds. It borrows
research patterns from APE, OPRO, ProTeGi/TextGrad, DSPy/MIPRO, and few-shot
selection work, but the deployable implementation remains CloudGrid-native:
Go runner orchestration, TypeScript harness/custom optimizer calls, storage-read
diagnosis, storage-write snapshots, held-out validation gates, and explicit
promotion.
