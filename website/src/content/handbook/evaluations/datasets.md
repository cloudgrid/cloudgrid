---
title: "Datasets"
description: "Create schema-backed datasets with rows that contain input, expected output, optional reason, split, curation state, and source evidence."
order: 1
accent: violet
eyebrow: "Handbook - Evaluations"
updated: 2026-05-25
---

A dataset is a project-scoped, versioned set of examples. Every row follows one
configured input shape and one configured expected-output shape. This keeps
evaluations repeatable and makes optimization evidence easier to trust.

## Dataset Settings

Set these before adding many rows:

| Setting | Use |
| --- | --- |
| Input type | Choose text or JSON. JSON values can be validated with JSON Schema. |
| Expected output type | Choose text or JSON. JSON expected outputs can be validated with JSON Schema. |
| JSON Schema | Defines the allowed shape when input or expected output is JSON. |
| Default split | Usually `validation` for manual rows and `training` for optimization examples. |
| Default curation status | Usually `draft`, `needs_review`, or `ready` depending on team process. |
| Default metric | The metric suggested when creating evaluations from this dataset. |
| Extraction settings | Defines which trace/span data can be imported into this dataset. |
| Anonymization and PII treatment | Controls whether production-derived candidates are redacted or realistically anonymized before review. |

Rows are edited as raw text or raw JSON. For JSON datasets, paste the JSON value
and let CloudGrid validate it against the dataset schema. There is no visual JSON
builder.

## Row Fields

Every row can include:

| Field | Use |
| --- | --- |
| Input | The value sent to the target during evaluation. |
| Expected output | The correct result. |
| Observed output | Optional production or candidate output that explains why the row exists. |
| Reason | Optional explanation for why the expected output is correct. |
| Split | `training`, `validation`, or `test`. |
| Curation status | `draft`, `needs_expected`, `needs_review`, `ready`, or `rejected`. |
| Source | Link back to trace/span/import evidence. |
| Metadata | Small row labels such as case id, difficulty, customer segment, or edge-case type. |

Use `training` for candidate generation, `validation` for iterative evaluation,
and `test` for final confidence checks. Keep `test` rows out of optimization
candidate generation.

## Trace-Derived Rows

Trace-derived rows are useful when production evidence shows a gap. A row can
start as `needs_expected` or `needs_review` when the observed output is known but
the correct expected output still needs curation.

Good trace-derived examples include:

- a wrong category from a classifier;
- a missing or malformed extraction field;
- a tool call with a bad input;
- a workflow that reached the right answer with too many steps.

## Example Datasets

The repository includes small import-ready examples:

| Example | Use |
| --- | --- |
| [`test_data/ai_eval/classification`](https://github.com/cloudgrid/cloudgrid/tree/main/test_data/ai_eval/classification) | Support intent classification with JSON input and JSON expected output. |
| [`test_data/ai_eval/extraction`](https://github.com/cloudgrid/cloudgrid/tree/main/test_data/ai_eval/extraction) | Order confirmation extraction with schema-validated JSON expected output. |

Each folder contains a `dataset-settings.json`, a `rows.jsonl`, and a short
README.
