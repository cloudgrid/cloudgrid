---
title: "AI Evaluation"
description: "AI evaluation is an optional CloudGrid workspace for versioned datasets, dataset evaluations, comparisons, and prompt optimization."
order: 7
accent: violet
eyebrow: "Handbook - Guides"
updated: 2026-05-24
---

AI evaluation helps teams turn known inputs, expected outputs, and production
trace evidence into repeatable quality measurements. In this release the
product focuses on dataset curation, dataset evaluation, comparisons, prompt
optimization, target snapshots, and explicit promotion. Production measurement
remains backlog until dataset evaluation and optimization are stable.

Enable the workspace with:

```sh
CLOUDGRID_AI_EVAL_ENABLED=true
VITE_CLOUDGRID_AI_EVAL_ENABLED=true
```

The AI Eval entry appears in the selected-project sidebar after Dashboards. The
primary tabs are Datasets and Evaluations.

## Mental Model

| Object | What it means |
| --- | --- |
| Dataset | A project-scoped, versioned set of rows. Every row follows the dataset input and expected-output shape. |
| Dataset row | One input, one expected output, optional observed output, optional reason, split, curation status, metadata, and source refs. |
| Evaluation | A reusable definition that binds a dataset version policy, split selector, target ref, metric settings, and run policy. |
| Evaluation run | One execution of an evaluation. It produces metric results, aggregates, item rows, trace refs, trajectory summaries, and important steps. |
| Comparison | A metric and example comparison between a baseline run and a candidate run. |
| Optimization | A loop around dataset evaluation that proposes candidate target snapshots, runs quick-shot and validation evaluations, and records evidence. |
| Promotion | An explicit action that promotes one candidate target snapshot using comparison and evaluation-run evidence. |

Evaluation produces results, metrics, and comparisons. It does not create gates
or alert rules by itself.

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

## Dataset Settings

Dataset settings keep row handling predictable:

- `inputType`: `text` or `json`.
- `expectedType`: `text` or `json`.
- JSON Schema for input and expected output when the corresponding type is
  `json`.
- Evaluation family, for example classification, extraction, generation, or
  workflow.
- Default metric.
- Trace extraction settings for importing traces or spans.
- Anonymization mode and content treatment defaults.

Rows are edited as raw text or raw JSON. CloudGrid validates raw JSON values
against the dataset schema before accepting a row. There is no UI JSON builder;
copy and paste is the intended workflow.

## Row Curation

Every row should contain:

- input;
- expected output;
- optional observed output from a failed or interesting production trace;
- optional reason explaining why the expected output is correct;
- split;
- curation status;
- optional metadata and source refs.

Use these split values:

| Split | Use |
| --- | --- |
| `training` | Candidate generation and optimization input. |
| `validation` | Iterative evaluation and candidate selection. |
| `test` | Explicit final confidence checks. Optimizers must not read it during candidate generation. |

Use these curation statuses:

| Status | Use |
| --- | --- |
| `draft` | Row is being authored. |
| `needs_expected` | Input or observed output exists, but expected output is missing. |
| `needs_review` | Expected output exists but still needs human or programmatic review. |
| `ready` | Row can be used by evaluations. |
| `rejected` | Row should stay out of evaluation inputs. |

The default reason is an empty string. Add a reason when it helps future
reviewers or optimizers understand the expected output.

## Import And Export

Dataset import is staged:

1. Upload `.jsonl`, `.json`, `.csv`, or `.zip` through the BFF upload endpoint.
2. Map file fields to v2 row fields: input, expected, observed output, reason,
   split, curation status, metadata, and source refs.
3. Preview with `Mutation.prepareDatasetImport`.
4. Commit with `Mutation.commitDatasetImport`.

The BFF only transfers bytes. Storage-write parses, maps, validates, previews,
and commits rows. Invalid rows block commit unless the user explicitly selects a
partial commit mode.

Dataset export starts with `Mutation.startDatasetExport` and downloads through
the same-origin export URL returned by the BFF.

## Trace To Dataset

Trace import is dataset-driven. Datasets with extraction settings can appear in
the trace detail and trace overview import picker. This avoids asking users to
choose extraction paths every time.

An imported trace row can start as `needs_expected` or `needs_review` when the
observed output is useful but the correct expected output still needs curation.
Store the observed output value itself when it helps explain the failure; do not
add a separate success/failure flag.

## Evaluation Runs

An evaluation definition selects:

- dataset and dataset version policy;
- split selector and curation status selector;
- target reference;
- metric settings;
- run policy;
- retention profile.

Starting a run creates normal evaluation evidence. Storage-read returns the run
detail view model; the frontend must not recompute metrics, aggregates, dataset
health, or trajectory summaries.

Use run detail to inspect:

- metric aggregates and per-item metric results;
- item run status;
- trajectory summary;
- important steps;
- trace and span links;
- retention role and retention expiry.

## Optimization

Optimization is the loop around dataset evaluation:

1. Start from an evaluation and a baseline target snapshot.
2. Choose an objective: primary metric, secondary metrics, constraints,
   tradeoffs, ranking policy, tie-breakers, and minimum evidence.
3. Optionally run a quick-shot phase over a small, recorded subset.
4. Validate candidates with normal evaluation runs.
5. Compare baseline and candidate runs.
6. Promote only through `Mutation.promoteTargetSnapshot`.

Quick-shot is exploratory. It can prune candidates, but it is not final
promotion evidence. Promotion requires explicit validation evidence and records
the baseline snapshot, candidate snapshot, comparison, target ref, evidence run
IDs, notes, and promoter metadata.

## External Adapters

Simple classification and extraction targets can run inside the CloudGrid AI
harness. Complex agents and workflows can instead expose an adapter endpoint.
The runner calls the adapter with dataset input and trace context, and the
adapter returns or later reports the final output through the configured
protocol.

Adapter rules:

- Treat the evaluated system as a black box behind a defined interface.
- Propagate the provided OpenTelemetry trace context.
- Return bounded, schema-valid outputs.
- Report timeouts and failures as evaluation evidence.
- Keep provider credentials and private tool configuration outside CloudGrid.

Opt-in external adapter tests point the runner at an adapter:

```sh
CLOUDGRID_AI_EVAL_HARNESS_URL=http://127.0.0.1:8088 bun run --cwd apps/packages/integration-scenarios test
```

Default repository checks stay hermetic and do not require external providers.

## Retention

Evaluation can produce large artifacts. CloudGrid stores durable evidence and
keeps bulky execution detail according to retention profiles:

- keep dataset rows, dataset versions, target snapshots, metric results,
  aggregates, comparisons, and promotion records as durable evidence;
- keep full per-row traces only where source telemetry retention still allows
  it;
- keep optimizer scratch data only as long as it is useful for the active
  optimization and audit trail;
- prefer bounded trajectory summaries and important steps in evaluation views.

Retention is configured by project policy and by evaluation retention profile.
Do not rely on transient optimizer scratch data as the only promotion evidence.

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
- Check runner, storage-read, storage-write, and NATS availability.

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
