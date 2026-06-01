---
id: REV-013
title: Classification and extraction optimization research
layer: review
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: research-informed
depends_on: [DOM-006, CAP-AIE-004, CAP-AIE-011, ADR-0006, ADR-0007, TEC-BE-014]
---

# Classification And Extraction Optimization Research

## Purpose

This review records the method choice for CloudGrid classification and
extraction evaluation and prompt optimization. It turns current prompt
optimization research into CloudGrid-native source-of-truth specs without adding
Python runtimes, bypassing dataset split governance, or weakening the harness and
external adapter boundaries.

## Primary Sources Reviewed

- [Automatic Prompt Engineer](https://arxiv.org/abs/2211.01910) shows that an
  LLM can generate and select task instructions from input/output examples.
- [OPRO](https://arxiv.org/abs/2309.03409) treats an LLM as an optimizer that
  proposes new natural-language solutions from prior candidates and scores.
- [ProTeGi/APO](https://arxiv.org/abs/2305.03495) uses minibatch failures to
  produce natural-language critiques, edits prompts in the opposite semantic
  direction, and searches candidates with beam/bandit selection.
- [DSPy](https://arxiv.org/abs/2310.03714) frames LLM applications as
  metric-optimized text transformation graphs. [MIPRO](https://arxiv.org/abs/2406.11695)
  jointly optimizes instructions and demonstrations using data-aware proposals,
  stochastic minibatch scoring, and meta-optimization.
- [TextGrad](https://arxiv.org/abs/2406.07496) generalizes textual feedback as a
  differentiable optimization signal over compound AI systems.
- [Skill-KNN](https://aclanthology.org/2023.emnlp-main.831/) and
  [coverage-based example selection](https://aclanthology.org/2023.findings-emnlp.930/)
  show that few-shot examples should cover task-relevant skills and salient
  input aspects instead of using naive similarity alone.
- [A survey of active learning for NLP](https://arxiv.org/abs/2210.10109)
  supports selecting informative uncertain/error-prone examples while preserving
  annotation cost and stopping criteria.
- [scikit-learn classification metrics](https://scikit-learn.org/stable/modules/model_evaluation.html#classification-metrics)
  provide the conventional deterministic metric family for accuracy, F1,
  precision, recall, and confusion-derived analysis.
- [JSON Schema 2020-12](https://json-schema.org/specification) is the schema
  standard CloudGrid already selected for structured expected values.
- [JSONSchemaBench](https://arxiv.org/abs/2501.10868), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
  and [PARSE](https://arxiv.org/abs/2510.08623) support schema-guided generation
  and schema-aware prompt/context optimization, but they also reinforce that
  CloudGrid must validate outputs itself and must not rely on provider-specific
  schema adherence as the metric source of truth.
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
  and [GenAI span content guidance](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
  support CloudGrid's standard-first trace evidence path and default avoidance
  of sensitive prompt/completion capture.

## Findings

1. Deterministic metrics should be the default judge for classification and
   extraction. LLM judges are useful for freeform/rubric quality, but closed
   labels and structured JSON should be scored by explicit label, schema, and
   field comparators. This gives stable gates, explainable failures, and cheap
   reruns.

2. The strongest practical prompt optimization pattern is hybrid:
   metric-guided diagnosis, minibatch textual critique, bounded prompt edits,
   few-shot/example selection, candidate search, held-out validation, and
   explicit promotion. A single method is weaker than the combination:
   APE-style instruction synthesis broadens candidates, ProTeGi/TextGrad-style
   critiques target observed failures, DSPy/MIPRO-style demo optimization
   improves examples, and OPRO-style scored history prevents repeated mistakes.

3. For extraction, schema validity and value correctness are different goals.
   Structured output or constrained decoding can improve valid JSON and schema
   adherence, but schema-valid output can still be semantically wrong. CloudGrid
   must optimize both format/schema instructions and field-level correctness.

4. For classification, label errors are usually concentrated in label
   boundaries, unknown-label outputs, and imbalanced support. Optimization should
   build label glossaries, contrast confused labels, add boundary examples, and
   preserve per-label support rather than only maximizing aggregate accuracy.

5. Few-shot examples should be selected by coverage and failure relevance. The
   default selector should combine label/field stratification, recent failures,
   edge cases, and representative non-failures. Naive nearest-neighbor
   similarity is not enough for v2.

6. Provider structured-output features are useful accelerators, not portable
   contracts. CloudGrid should use them only through target snapshot
   `model_config` parts or harness capabilities, then still validate actual
   outputs through JSON parsing, JSON Schema, and CloudGrid metrics.

7. Automatic schema mutation is unsafe for CloudGrid's evaluation model. The
   dataset schema is ground truth. Optimization may create prompt-facing schema
   hints or response-contract target parts, but it must not rewrite
   `Dataset.settings.expectedJsonSchema` or expected values. Dataset schema
   changes remain explicit dataset settings/version changes.

8. Black-box external adapters can participate in optimization only when they
   can execute candidate target snapshots or receive candidate editable parts.
   Otherwise CloudGrid can evaluate the black-box target and suggest failure
   analysis, but it cannot produce promotable optimized prompt snapshots.

## Decision

CloudGrid will implement classification and extraction optimization as a
CloudGrid-native hybrid optimizer under existing optimizer kinds:

- `bootstrap_fewshot`: metric-guided example selection and example-part
  candidate generation.
- `critic_mutate_judge_pick`: the default combined loop for classification and
  extraction prompt optimization. It runs diagnosis, critique, bounded prompt
  mutation, few-shot candidate generation, quick-shot pruning, validation gating,
  and explicit promotion.

CloudGrid will not ship DSPy, TextGrad, Optuna, Python optimizer servers, or
provider-specific SDK optimizers in deployable services. The internal optimizer
uses the CloudGrid harness adapter. A custom optimizer adapter may propose
candidates from bounded CloudGrid evidence, but CloudGrid still owns
preflight, split rules, candidate snapshot persistence, validation gates,
retention, and promotion.

## Traceability

- `CAP-AIE-012` defines concrete classification and extraction evaluation
  semantics.
- `CAP-AIE-013` defines classification and extraction prompt optimization.
- `FLW-AIE-007` defines the end-to-end optimization run flow.
- `DOM-006`, `TEC-BE-014`, `TEC-BE-015`, `TEC-BE-016`, `TEC-FE-007`,
  `TEC-FE-008`, `NFR-010`, and `NFR-011` carry the cross-cutting source of truth
  updates.

