---
id: FLW-AIE-002
title: Online AI evaluation
domain: ai-eval
layer: flow
status: backlog
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
trigger:
  type: event
  expression: future production measurement policy
orchestration: async
delivery_semantics: not specified for v2
terminal_failure: not specified for v2
---

# Online AI Evaluation

Production measurement is backlog for AI Eval v2.

Do not implement the legacy online scorer flow. A future production measurement
flow must build on v2 metric results, target refs, retention roles, trace
evidence, and dataset candidate preparation after the dataset evaluation and
optimization model is implemented.

Required future decisions are listed in `CAP-AIE-002`.
