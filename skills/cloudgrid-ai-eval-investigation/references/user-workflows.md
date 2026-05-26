# AI Eval User Workflows

Use this reference when the user asks how to use AI Eval as a product. Keep
answers grounded in the current UI and public GraphQL operations.

## Mental Model

CloudGrid AI Eval turns curated examples and trace evidence into repeatable
quality measurements for AI systems.

Core objects:

- **Dataset**: versioned examples with one configured input shape and one
  configured expected-output shape.
- **Dataset row**: input, expected output, optional observed output, optional
  reason, split, curation status, metadata, and source refs.
- **Evaluation**: reusable definition that binds dataset/version policy, split
  selector, target ref, metric settings, and run policy.
- **Evaluation run**: immutable execution of an evaluation that returns metric
  results, aggregates, item rows, trajectory summaries, important steps, and
  trace refs.
- **Comparison**: baseline run versus candidate run metric deltas and examples.
- **Optimization**: loop around dataset evaluation that creates candidate target
  snapshots and validation evidence.
- **Promotion**: explicit action that records target movement from baseline to
  candidate with comparison and evaluation-run evidence.

## First Setup

For a new project:

1. Enable AI Eval in Project Settings.
2. Create a dataset in `/ai-eval?tab=datasets`.
3. Define input and expected-output types. Use JSON Schema for JSON values.
4. Add rows manually, import files, or import traces with extraction settings.
5. Mark curated rows `ready`.
6. Create an evaluation in `/ai-eval?tab=evaluations`.
7. Start an evaluation run and review metric results.
8. Compare runs or start optimization.
9. Promote a target snapshot only after full validation evidence exists.

## Datasets

Datasets are versioned. Edits create new dataset versions and historical run
evidence stays tied to the version it used.

Common actions:

- create a dataset;
- edit schema/settings;
- add manual rows as raw text or raw JSON;
- import JSONL, JSON array, CSV, or ZIP through the staged import workflow;
- export canonical JSONL, JSON array, or CSV;
- use trace import only for datasets with extraction settings.

Split guidance:

| Split | Use |
| --- | --- |
| `training` | Candidate generation and optimization input. |
| `validation` | Iterative evaluation and candidate selection. |
| `test` | Explicit final confidence checks. Optimizers must not read it during candidate generation. |

Curation guidance:

| Status | Use |
| --- | --- |
| `draft` | Row is being authored. |
| `needs_expected` | Input or observed output exists, but expected output is missing. |
| `needs_review` | Expected output exists but still needs review. |
| `ready` | Row can be used by evaluations. |
| `rejected` | Row should stay out of evaluation inputs. |

## Evaluations And Runs

An evaluation binds:

- dataset version policy;
- split and curation status selector;
- target ref;
- metric settings;
- run policy;
- retention profile.

The frontend renders returned view models. It must not recompute metric
aggregates, dataset health, trajectory summaries, or comparison deltas.

Run controls:

| Status | Controls |
| --- | --- |
| `queued`, `running`, `resuming` | cancel |
| `running`, `resuming` | pause |
| `paused` | resume |
| terminal statuses | view only |

## Optimization

Optimization starts from an evaluation and baseline target snapshot. It records
the objective, quick-shot policy when present, candidate target snapshots,
caused evaluation runs, comparisons, selected candidate, and promotion record.

Quick-shot can prune candidates but cannot be final promotion evidence.
Promotion is always explicit through `promoteTargetSnapshot`.

## Production Measurement

Production measurement is backlog for AI Eval v2. Current guidance should focus
on dataset evaluation and optimization. Do not describe production quality as a
primary workspace tab or as an automatic alert gate.
