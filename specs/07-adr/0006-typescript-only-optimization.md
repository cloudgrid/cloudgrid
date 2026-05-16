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
affects: [CAP-AIE-004, TEC-BE-014]
---

# ADR-0006: TypeScript-Only AI Optimization

CloudGrid will not ship Python, Optuna, DSPy, TextGrad, or ax-llm MIPROv2 in its deployable services. Supported v1 optimizer kinds are `bootstrap-fewshot` and `critic-mutate-judge-pick`, both executed through harness.
