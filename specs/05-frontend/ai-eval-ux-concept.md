---
id: TEC-FE-008
title: AI evaluation UX concept
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [DOM-006, TEC-FE-007, DSY-001]
---

# AI Evaluation UX Concept

## Purpose

The AI Eval UI must make the evaluation loop easy to use:

1. Create or import a dataset.
2. Add rows with input, expected output, and optional reason.
3. Run a dataset evaluation against a target.
4. Inspect metrics, item results, and trace-backed summaries.
5. Optimize prompts/examples when useful.
6. Compare candidates and explicitly promote one.

Do not expose implementation vocabulary as the primary UX. Users should see
datasets, evaluations, runs, metrics, comparisons, optimization, and targets.
They should not need to understand scorer entities, checks, gates, experiment
manifests, digests, or target parts for normal work.

## Navigation

AI Eval is available at `/ai-eval` when enabled for the selected project.

Route-local sections are exactly:

1. `Datasets`
2. `Evaluations`

Do not add route-local primary entries for `Scorers`, `Checks`,
`Experiments`, `Runs`, `Annotations`, or `Production quality` in v2.

Project AI Eval settings remain in
`/projects/:projectId/settings/ai-eval` and are linked from setup/empty states.

## Layout Rules

- Follow `specs/05-frontend/product-ux-concept.md` and `DESIGN.md`.
- Creating a dataset, evaluation, or optimization uses the create entity page
  pattern from `product-ux-concept.md`. These flows are dedicated routes with
  wizard-like tabs, field-level and tab-level validation, and concise
  field-adjacent domain onboarding inside each step.
- Settings for a dataset, evaluation, or optimization use the entity settings
  page pattern from `product-ux-concept.md`. Detail pages expose a `Settings`
  action that navigates to the settings route, and settings reuse the creation
  tabs unless extra editable behavior requires a topical settings-only tab.
- Use the global topbar and project/domain sidebar only as defined by product UX.
- AI Eval route header, local section rail/tabs, main workspace, and optional
  detail drawer are independent scroll containers.
- Primary data surfaces are tables or full-width workspaces, not cards wrapped
  in cards.
- Use shadcn/ui and Tailwind semantic tokens with flat, border-led styling.
- Do not add hero sections, decorative gradients, marketing copy, or global
  stats dashboards.
- Advanced/debug details may use drawers or sheets. They must not be required
  for first-run success.

## First Use

The first-use screen is an operational checklist:

- create or import a dataset;
- add at least one `ready` row;
- create an evaluation;
- run baseline evaluation;
- optionally start optimization.

The checklist must not mention NATS, SurrealDB, harness internals, target
snapshot digests, metric capability IDs, or provider credential plumbing.
Checklist actions that create a durable entity navigate to the matching create
page: `/ai-eval/datasets/new`, `/ai-eval/evaluations/new`, or
`/ai-eval/optimizations/new`.

## Datasets Section

Datasets list columns:

- name;
- evaluation family;
- input/expected type;
- current version;
- ready item count;
- split coverage;
- schema health;
- last updated.

Dataset detail contains:

- settings;
- health;
- versions;
- rows;
- import/export.

Dataset detail actions include `Dataset settings`, which navigates to
`/ai-eval/datasets/:datasetId/settings`.

Row table columns:

- split;
- curation status;
- input preview;
- expected preview;
- reason preview;
- observed output indicator;
- source;
- validation state;
- updated at.

Row editor:

- text area for text values;
- raw JSON text area for JSON values;
- schema validation errors inline;
- optional reason text area;
- curation status selector;
- split selector;
- metadata editor for simple key/value strings only in v2.

Do not build a visual JSON builder. Raw JSON plus schema validation is the v2
path.

Dataset creation:

- Route: `/ai-eval/datasets/new`.
- Tabs: `Purpose`, `Schema`, `Curation`, `Extraction`.
- `Purpose` teaches what the dataset is for and collects name, evaluation
  family, optional description, and read-only project context.
- `Schema` teaches that every row follows one contract and collects input and
  expected value types plus JSON schemas when relevant.
- `Curation` teaches split and readiness semantics and collects default split,
  default curation status, anonymization/PII policy, retention, and metric
  defaults when exposed by contracts.
- `Extraction` teaches trace-to-dataset compatibility and collects optional
  trace extraction settings.
  compatibility, and retention before create.

Dataset settings:

- Route: `/ai-eval/datasets/:datasetId/settings`.
- Tabs: `Purpose`, `Schema`, `Curation`, `Extraction`, `Versions`.
- `Purpose`, `Schema`, `Curation`, and `Extraction` reuse the dataset creation
  topics and current persisted values.
- `Versions` covers settings-only version impact, stale write context, and
  links back to dataset version history.

Trace import:

- Trace detail and overview show `Add to dataset` where AI Eval is enabled.
- Picker lists only datasets with compatible extraction settings.
- Import preview shows extracted input, observed output, proposed expected
  value when trusted, curation status, split, and anonymization treatment.
- User can edit before commit.

## Evaluations Section

Evaluation list columns:

- name;
- dataset;
- split selector;
- target;
- last run status;
- primary metric;
- last updated.

Evaluation detail actions include `Settings`, which navigates to
`/ai-eval/evaluations/:evaluationId/settings`.

Create evaluation requires:

- dataset;
- dataset version policy: latest ready or pinned;
- split selector;
- target;
- metric settings, defaulted from dataset;
- run policy, defaulted from project settings.

Evaluation creation:

- Route: `/ai-eval/evaluations/new`.
- Tabs: `Dataset`, `Target`, `Metrics`, `Run policy`.
- `Dataset` teaches versioning and split eligibility, then collects dataset,
  dataset version policy, and split selector.
- `Target` teaches what will be evaluated, then collects target kind, target
  reference, and model alias when applicable.
- `Metrics` teaches how results will be judged, then collects metric settings
  with dataset/project defaults.
- `Run policy` teaches budget, sampling, retention, and provider constraints,
  then collects required policy controls.
  also starts the first run.

Evaluation settings:

- Route: `/ai-eval/evaluations/:evaluationId/settings`.
- Tabs: `Dataset`, `Target`, `Metrics`, `Run policy`, `History`.
- `Dataset`, `Target`, `Metrics`, and `Run policy` reuse the evaluation
  creation topics and current persisted values.
- `History` covers settings-only future-run impact, recent run links, and
  pinned-version context without duplicating run result tables.
- Changes apply only to future runs; existing runs remain immutable evidence.

Run detail shows:

- status and progress;
- aggregate metrics;
- metric breakdowns;
- item run table;
- actual/expected preview;
- trajectory summary;
- important steps;
- problems;
- trace links;
- retention expiry in advanced details.

Comparison view shows:

- baseline run;
- candidate run;
- target diff summary;
- metric deltas;
- hard constraint results;
- regression examples;
- improvement examples;
- tradeoff metrics.

Optimization flow:

- starts from an evaluation, run, or comparison;
- shows objective defaults before start;
- shows quick-shot phase as an explicit phase when used;
- marks quick-shot results as exploratory;
- requires full validation before promotion evidence;
- shows prompt/example diffs separately;
- uses explicit `Promote` action.
- Optimization run detail exposes `Settings` while the run is configurable.

Optimization creation:

- Route: `/ai-eval/optimizations/new`.
- Tabs: `Source`, `Objective`, `Search`, `Validation`.
- `Source` teaches that optimization starts from existing evidence, then
  collects source evaluation/run/comparison and baseline target.
- `Objective` teaches primary metric, constraints, tradeoffs, ranking policy,
  and tie-breakers before collecting the resolved objective.
- `Search` teaches the v1 editable target scope and exposes only prompt text
  and few-shot/example controls. Unsupported skill, tool, workflow, and agent
  optimization controls remain hidden.
- `Validation` teaches quick-shot limitations, minimum evidence, validation
  split usage, and test split exclusion.
  evidence, and promotion limitations before start.

Optimization settings:

- Route: `/ai-eval/optimizations/:optimizationRunId/settings`.
- Tabs: `Source`, `Objective`, `Search`, `Validation`, `Controls`.
- `Source`, `Objective`, `Search`, and `Validation` reuse the optimization
  creation topics and resolved run configuration.
- `Controls` covers settings-only lifecycle and budget controls supported by the
  current run state.
- Terminal runs render settings read-only unless a later spec defines mutable
  post-run metadata.
  promotion-evidence impact before save.

## Advanced Details

Advanced views may show:

- dataset version ID and digest;
- item revision ID;
- target snapshot ID and digest;
- target parts;
- metric capability IDs;
- adapter request status and runRef;
- retention role and expiry.

These details are for debugging/audit. They must not be part of the normal
happy path.

## Acceptance Criteria

- A first-time user can create a dataset, add a row, create an evaluation, and
  start a run without seeing Scorers or Experiments.
- JSON expected output is edited as raw JSON and validated against the dataset
  schema.
- The trace `Add to dataset` picker shows only compatible datasets.
- Run detail links to trace detail instead of duplicating full traces.
- Optimization candidate review shows what changed and why it is better or
  worse according to visible metrics.
