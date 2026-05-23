# AI Eval User Workflows

Use this reference when the user asks how to use AI Eval as a product. Keep
answers grounded in the current UI and public GraphQL operations.

## Mental Model

CloudGrid AI Eval turns project telemetry and curated examples into quality
evidence for AI systems.

Core objects:

- **Dataset**: versioned examples with input, expected output, metadata, split,
  review status, and optional source trace/span.
- **Dataset candidate**: suggested example that must be reviewed before commit.
- **Scorer**: reusable evaluation definition, preferably created from a typed
  template.
- **Experiment**: a dataset version, scorer set, and solver reference.
- **Experiment run**: immutable execution of an experiment manifest.
- **Production quality**: read-only online quality monitoring from returned
  storage-read summaries.

## First Setup

For a new project:

1. Enable AI Eval in Project Settings / AI Eval.
2. Configure or select a harness/provider profile.
3. Create a dataset in `/ai-eval?tab=datasets`.
4. Add rows manually, import rows, or review dataset candidates.
5. Create at least one scorer in `/ai-eval?tab=scorers`.
6. Create an experiment in `/ai-eval?tab=experiments`.
7. Run the experiment and review returned summaries and visualizations.
8. Enable production online policies only after offline scoring is useful.

## Datasets

Datasets are versioned. Edits create new dataset versions and historical run
manifests stay tied to their original version.

Common actions:

- create a dataset;
- add manual rows with input, expected output, split, review status, metadata,
  and optional source trace/span;
- import JSONL, JSON array, CSV, or ZIP through the staged import workflow;
- export canonical JSONL, JSON array, or CSV through same-origin download URLs;
- edit or remove items through dataset item update mutations with
  `expectedDatasetVersion`;
- search, filter, sort, and page rows through storage-read-backed inputs.

Split guidance:

| Split | Use |
| --- | --- |
| `dev` | manual authoring, debugging, scorer calibration |
| `optimization` | prompt/skill optimization input |
| `validation` | candidate selection during iteration |
| `regression` | CI and release gates |
| `holdout` | hidden confidence set, never optimizer input |

## Dataset Candidates

Candidates are review suggestions, never automatic commits. They may come from
production measurements, failed experiment items, coverage gaps, health issues,
failure clusters, or selected traces.

Review before commit:

- source kind and trace/run links;
- proposed input and expected output;
- target shape and split;
- review status;
- reason and warnings;
- duplicate/cluster context;
- content treatment and anonymization provenance.

Use:

- `Query.datasetCandidates` to list candidates.
- `Mutation.prepareDatasetCandidates` to prepare candidates from approved
  sources.
- `Mutation.commitDatasetCandidates` to append selected candidates to the next
  dataset version.

If commit fails with stale version, reload the dataset and retry with the new
version. Do not bypass version checks.

## Scorers

Create scorers from typed templates first. Raw JSON is an advanced escape hatch
only after the typed path validates.

Recommended first scorers:

- contains or exact match for deterministic assertions;
- regex for stable text constraints;
- JSON schema for structured output;
- tool correctness for required tool-call behavior;
- LLM judge only after provider, budget, timeout, and latency limits are set.

For production online policies in v1, prefer deterministic scorers. Provider-
backed scorers require explicit profile, budget, latency, and content
allowances.

## Experiments And Runs

An experiment binds:

- dataset version;
- split selector;
- scorer refs and versions;
- solver reference;
- provider/model refs;
- run policy.

Starting a run creates an immutable manifest with schema, version, digest, and
canonical snapshot identity. Resume must use the same digest.

Run controls:

| Status | Controls |
| --- | --- |
| `queued`, `running`, `resuming` | cancel |
| `running`, `resuming` | pause |
| `paused` | resume |
| terminal statuses | view only |

Pause and resume are idempotent. Repeating the same action should return the
current state, not schedule duplicate work.

## Result Analytics

The frontend renders returned visualization models. It must not recompute
score summaries, production-quality aggregates, dataset health, or policy
matches.

Useful result views:

- pass rate and mean score;
- p50/p95 latency;
- token and cost budget use;
- model-quality versus item-quality problems;
- scorer-specific visualizations such as confusion matrix, rubric breakdown,
  JSON/schema issues, tool correctness, RAG grounding, and human-review
  distribution.

## Production Quality

Production quality is monitoring, not realtime alerting in v1. Policy setup
lives in Project Settings / AI Eval; the AI Eval route reads the returned
`Query.aiQualityOverview` view model.

Explain:

- online scoring is inactive by default;
- each policy needs explicit enablement, target filters, sample rate, scorers,
  and limits;
- skipped reasons are part of the quality story;
- candidate suggestions are suggestions, not automatic dataset edits;
- alert-rule creation is not part of AI Eval v1.
