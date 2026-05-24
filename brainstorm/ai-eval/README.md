# AI Eval Brainstorm Index

Date: 2026-05-23

Status: brainstorming, not implementation-ready spec

## Purpose

This folder collects product and architecture thinking for a simpler AI Eval
model before the approved specs are rewritten.

The current direction is:

- datasets are typed evaluation cases;
- dataset rows stay simple: input, expected, reason, split, metadata, source,
  provenance;
- rows can keep observed output values from traces/imports/runs separate from
  corrected expected output;
- dataset settings define schema, evaluation family, extraction, review, and
  anonymization behavior;
- evaluations produce metrics, results, and comparisons;
- every dataset item run is trace-backed, using harness OpenTelemetry as
  evidence for how the target reached the output;
- item runs should expose bounded textual trajectory summaries and key-step
  previews so humans and optimizers do not need to ingest full traces by
  default;
- optimization is a reproducible loop around dataset evaluations;
- optimization can use reproducible quick-shot/sample evaluations before full
  validation/test runs;
- production quality stays backlog until dataset evaluation and optimization
  are clear;
- user-facing scorers/checks/experiments should be removed or hidden unless a
  strong implementation need remains.

## Documents

- [Dataset Model](./dataset-model.md): dataset schema, row shape, splits,
  manual rows, trace-to-dataset, anonymization, and import/export.
- [Evaluation Model](./evaluation-model.md): evaluations, optimization,
  targets, metric settings, product vocabulary, and lifecycle.
- [Agentic Evaluation Research](./agentic-evaluation-research.md): research
  synthesis and data requirements for tool use, loops, workflows, and skills.
- [Spec Rewrite Backlog](./spec-rewrite-backlog.md): concrete spec areas that
  need changing before implementation.
- [Retention And Lifecycle](./retention-and-lifecycle.md): what evaluation
  data should be durable, review-window, ephemeral, or trace-retention-bound.

## Core Recommendation

Rewrite the AI Eval concept from:

```text
DatasetItem targetShape + Scorer + Experiment
```

to:

```text
Dataset evaluationFamily + JSON Schema expected output
+ Metric settings + Dataset evaluations + Optimization comparisons
```

This keeps the common path easy while leaving room for advanced agentic
evaluation through JSON Schema, trace evidence, and target snapshots.
