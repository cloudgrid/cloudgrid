---
title: "Evaluations"
description: "Create evaluation definitions, start runs, inspect scoreboards, and compare candidates."
order: 2
accent: violet
eyebrow: "Handbook - Evaluations"
updated: 2026-05-25
---

An evaluation is a reusable definition for measuring a target against a dataset.
It selects what data to run, which target to call, and which metrics to report.

## Create An Evaluation

When creating an evaluation, choose:

| Choice | Meaning |
| --- | --- |
| Dataset | The examples to evaluate against. |
| Dataset version policy | Use the latest ready version or pin a known version. |
| Split selector | Usually `validation` for iteration or `test` for final confidence. |
| Target | The prompt, function, workflow, or adapter-backed endpoint to evaluate. |
| Model alias | The project model alias used by provider-backed targets or judges. |
| Metrics | Defaults can come from the dataset, then be adjusted for the evaluation. |
| Retention profile | How much detail to keep after the run. |

The normal happy path is: create a dataset, add ready rows, create an
evaluation from the dataset, then start a run.

## Inspect A Run

Use the run detail view to inspect:

- status and progress;
- aggregate metric values;
- per-row metric results;
- expected vs actual output previews;
- trajectory summaries;
- important steps;
- problems;
- trace and span links;
- retention information in advanced details.

The run detail view is the source of truth for what happened. It should show
enough row-level evidence to understand failures without opening every trace.

## Compare Runs

A comparison answers a simple question: is the candidate better or worse than
the baseline for the selected metrics and examples?

Use comparisons to review:

- metric deltas;
- improved examples;
- regression examples;
- latency and cost tradeoffs;
- target differences;
- whether evidence is strong enough to promote.

Comparisons are information, not gates. Teams can use comparison results in
their own release or alerting process, but evaluation itself only produces
metrics and evidence.

## Common Failure Patterns

| Problem | What to check |
| --- | --- |
| No rows run | The selected split has ready rows. |
| JSON rows fail validation | Input and expected output match the dataset schemas. |
| Target setup fails | The referenced model alias or external adapter is configured in project settings. |
| Results look noisy | Add reasons, strengthen expected outputs, and separate ambiguous rows into `needs_review`. |
