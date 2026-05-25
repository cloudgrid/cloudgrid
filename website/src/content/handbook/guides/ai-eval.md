---
title: "AI Evaluation"
description: "Compatibility guide for the AI Eval workspace. The full end-user documentation now lives under Evaluations."
order: 7
accent: violet
eyebrow: "Handbook - Guides"
updated: 2026-05-25
---

AI evaluation helps teams turn known inputs, expected outputs, and production
trace evidence into repeatable quality measurements.

The full end-user documentation now lives in the dedicated
[Evaluations](/handbook/evaluations) handbook topic:

- [Datasets](/handbook/evaluations/datasets)
- [Evaluations](/handbook/evaluations/evaluations)
- [Optimizations](/handbook/evaluations/optimizations)

This page remains as a short compatibility guide for existing links.

Enable the workspace with:

```sh
CLOUDGRID_AI_EVAL_ENABLED=true
VITE_CLOUDGRID_AI_EVAL_ENABLED=true
```

The AI Eval entry appears in the selected-project sidebar after Dashboards. The
primary sections are Datasets and Evaluations.

## First Setup

1. Enable AI Eval in Project Settings.
2. Open `/ai-eval?tab=datasets`.
3. Create a dataset with input type, expected-output type, and optional JSON
   Schema for each JSON value.
4. Add rows manually or import JSONL, JSON array, CSV, or ZIP files.
5. Mark rows `ready` when the input, expected output, and optional reason have
   been reviewed.
6. Open `/ai-eval?tab=evaluations`.
7. Create an evaluation that selects the dataset, split, target, metric, and run
   policy.
8. Start a run, review metric results, then compare or optimize candidate
   targets.

For detailed usage, continue with [Datasets](/handbook/evaluations/datasets),
[Evaluations](/handbook/evaluations/evaluations), and
[Optimizations](/handbook/evaluations/optimizations).

## Troubleshooting

AI Eval entry is missing:

- Check `CLOUDGRID_AI_EVAL_ENABLED`.
- Check `VITE_CLOUDGRID_AI_EVAL_ENABLED` for frontend builds.
- Confirm a project is selected.

Dataset row is rejected:

- Confirm raw JSON parses.
- Confirm the value matches the dataset JSON Schema.
- Confirm the row uses `training`, `validation`, or `test`.
- Confirm the curation status is one of the v2 statuses.

Run does not start:

- Confirm the dataset has ready rows in the selected split.
- Confirm the target ref and metric settings are valid.
- Check AI Eval service health in the local or deployed runtime.

Adapter-backed run times out:

- Check adapter health and timeout settings.
- Confirm trace context propagation.
- Confirm the adapter returns a final output in the expected shape.
- Treat the timeout as evidence; do not auto-promote a candidate after timeout.

Promotion is disabled:

- Confirm a candidate target snapshot is selected.
- Confirm a comparison exists.
- Confirm full validation evidence exists. Quick-shot evidence alone is not
  enough.
