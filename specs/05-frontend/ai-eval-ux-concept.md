---
id: TEC-FE-008
title: AI evaluation UX concept
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: from-user
depends_on: [DOM-006, TEC-FE-016, DSY-001]
---

# AI Evaluation UX Concept

## Purpose

The AI Eval UI must make the evaluation loop easy to use:

1. Create or import a dataset.
2. Add rows with input, expected output, and optional reason.
3. Run a dataset evaluation against a target.
4. Inspect metrics, item results, and trace-backed summaries.
5. Optimize prompts, examples, or skill documents after baseline evidence shows
   an improvement target.
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

## Form Defaults And Adaptation

AI Eval forms inherit the product-wide adaptive input model. They must reduce
free-form entry and show only fields that are valid for the current draft.

Rules:

- Dataset, evaluation, optimization, import, export, and settings forms start
  from defaults derived from the selected source entity, project AI Eval
  settings, backend defaults, and domain defaults.
- Dataset family, input type, expected type, split, curation status, retention
  profile, target kind, metric preset, optimizer kind, runtime mode, adapter
  profile, and promotion target are selected from controlled options.
- Free-form fields are limited to user-authored names, descriptions, reason
  text, search, raw JSON/JSON Schema, and explicit advanced custom metric/path
  branches.
- A controlling selection changes the available form shape immediately:
  - `inputType = text` hides input JSON schema;
  - `inputType = json` shows input JSON schema and seeds an object schema when
    empty;
  - `expectedType = text` hides expected JSON schema and schema-backed expected
    controls;
  - `expectedType = json` shows expected JSON schema and schema-backed expected
    controls;
  - `evaluationFamily` updates suggested metrics and expected-result controls;
  - `targetKind` filters target pickers and model/profile requirements;
  - `optimizerKind` filters editable part controls and policy fields;
  - `runtimeMode = managed_harness` hides external adapter fields;
  - `runtimeMode = external_adapter` shows adapter profile, async readiness, and
    OTLP evidence readiness.
- Hidden fields do not block submit. When a visible controlling selection makes
  an existing draft value invalid, the UI clears or replaces that value with the
  new default and explains the change inline.
- Validation errors identify the field, accepted value/range/shape, and next
  corrective action. Backend Problem Details map to the owning field when a
  field path exists, otherwise to the tab summary and route-level error panel.

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
- evaluation type;
- input/expected type;
- current version;
- ready item count;
- split coverage;
- last updated.

Dataset detail contains:

- settings;
- actionable dataset readiness;
- versions;
- rows;
- import/export.

Dataset detail actions include `Dataset settings`, which navigates to
`/ai-eval/datasets/:datasetId/settings`.
Dataset readiness uses `Dataset.health` as a detail-level summary, not as an
opaque overview-table status. It must explain why rows are not ready and show
the relevant action beside the issue: add rows, import rows, edit expected AI
results, mark reviewed rows ready, update AI input/result shape, or adjust
dataset settings. Dataset detail disables evaluation creation until at least
one ready row exists.

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
- shared raw JSON editor for JSON values;
- select or multi-select controls for closed expected-result options such as
  classification labels;
- numeric and boolean controls when schemas/settings define those value types;
- schema validation errors inline;
- optional reason text area;
- curation status selector;
- split selector;
- metadata editor for simple key/value strings only in v2.

Do not build a visual JSON builder. Raw JSON plus schema validation is the v2
path. Dataset schemas and JSON row values use the shared JSON editor control so
users get syntax-oriented editing without changing the data model.
Business-defined allowed categories and JSON Schema enums are not visual JSON
builders; they are domain controls and should be rendered as proper form
controls whenever the schema or dataset setting defines a bounded option set.

Dataset creation:

- Route: `/ai-eval/datasets/new`.
- Tabs: `Purpose`, `Schema`, `Curation`, `Trace intake`.
- `Purpose` teaches what the dataset is for and collects name, evaluation type
  as a controlled preset, optional description, and read-only project context.
  Evaluation type is shown in business language while persisting the backend
  `EvaluationFamily` enum for metric/comparison compatibility; it must not be a
  free-form text field.
- `Schema` teaches the shape of the input sent to the LLM/agent/workflow and
  the expected AI result returned by that target. It stacks `AI input shape`
  above `Expected AI result shape` so users read the flow from request to
  result. JSON schema editors are visible only for the side whose value type is
  `json`; text values must not show irrelevant JSON schema fields. New datasets
  default input type to `text` because agent and workflow targets most commonly
  receive text instructions/messages. Switching a side from `text` to `json`
  seeds an object schema when no schema exists.
- `Curation` teaches split and readiness semantics and collects default split,
  default curation status, anonymization/PII policy, retention, and metric
  defaults when exposed by contracts. Metric defaults use supported presets
  before falling back to a custom metric id field. Evaluation type and
  value-type changes update the suggested metric until the user explicitly
  chooses a metric. New datasets default to the validation split so the first
  manually added ready row is eligible for the first baseline evaluation.
- `Trace intake` teaches which observed AI calls should feed the dataset and
  collects optional trace intake rules. Rule controls start with service and
  operation/function/span matching, then map captured trace evidence into AI
  input, expected AI result, observed output, and metadata. Mapping controls use
  common presets and expose custom paths only when the custom option is chosen.
  Trace intake remains off by default because enabling it changes which datasets
  can receive trace-derived candidates.

Dataset settings:

- Route: `/ai-eval/datasets/:datasetId/settings`.
- Tabs: `Purpose`, `Schema`, `Curation`, `Trace intake`, `Versions`.
- `Purpose`, `Schema`, `Curation`, and `Trace intake` reuse the dataset
  creation topics and current persisted values.
- Dataset settings exposes `Import settings` and `Export settings` actions for
  dataset-level configuration only: family, value types, JSON schemas, curation
  defaults, trace intake rules, expected result options, anonymization,
  retention, and metric defaults.
  These actions must not import or export dataset rows; row transfer remains in
  the dataset detail import/export workflow.
- `Versions` covers settings-only version impact, stale write context, and
  links back to dataset version history.
- Settings actions are Cancel and Save settings on every tab; settings pages do
  not use create-flow Back/Continue controls.

Trace intake from traces:

- Trace overview and trace detail show `Prepare dataset rows` where AI Eval is
  enabled. Trace detail uses the current trace and selected span automatically.
  Trace overview uses selected trace rows; when no rows are selected it may
  offer an explicit bounded `Use current filter` preview.
- The action never asks users to type trace IDs or span IDs.
- The picker can target a single dataset or auto-match multiple datasets with
  enabled trace intake rules.
- The preview groups extracted candidates by dataset and rule, then shows AI
  input, expected AI result when trusted/present, observed AI result, curation
  status, split, validation issues, duplicate hints, and anonymization
  treatment.
- The default submit action creates dataset candidates. Committing candidates or
  marking rows ready happens from candidate/row review.

Skill package setup:

- Skill optimization setup must explain the package as an artifact with
  `SKILL.md` plus optional references, examples, scripts, assets, dependency
  manifests, and runtime fixtures. It must not describe the skill as a single
  pasted prompt.
- The package setup route uses the same create/settings page patterns as other
  AI Eval entities. Users can upload a ZIP/directory, select a previous skill
  artifact, or connect a project-approved source package.
- The manifest preview is a dense file table with role, path, size, digest
  status, editable/protected state, and model-visible-by-default state. It must
  not use nested cards.
- Runtime setup uses named project profiles: runtime connector, model/tool
  profile, environment profile, and optional fixture. Users see a dry-run result
  with actionable failures before they can start optimization.
- Runtime setup starts with two clear choices. `Managed harness` is presented as
  the easy path for skills that do not need customer tools, MCP, files/folders,
  repositories, or business state. `External adapter` is presented as the
  enterprise path for skills that must run inside the customer's real business
  context.
- External adapter setup shows capability and evidence readiness, not raw
  protocol fields. The user should see whether the adapter can return actual
  output or output refs, support async polling, propagate traces, emit the
  standard GenAI/MCP/OpenInference or other recognized production span
  conventions CloudGrid can derive evidence from, and provide usage metadata.
- The dataset setup path is shared with normal AI Eval. Users can manually add
  examples, import rows, or prepare rows from traces/spans. Trace-derived data
  must be reviewed as dataset candidates before it can become training,
  validation, or test evidence.
- Optimization evidence views show dataset rows, item-run trace links,
  trajectory summaries, and important steps as references. They do not expose
  raw full traces, hidden reasoning, secrets, or provider credentials.

Classification and extraction prompt optimization setup:

- The normal start point is a completed run or comparison. The wizard should
  arrive prefilled with source, target, objective, training/validation split,
  optimizer kind, quick-shot policy, and editable prompt/example parts.
- Classification setup shows label readiness: allowed labels, selected expected
  and actual label paths, unsupported or unknown labels, low-support labels, and
  the confusion pairs that will guide optimization.
- Extraction setup shows schema readiness: expected JSON Schema validity,
  selected comparable fields, weak or unsupported fields, extra-field policy,
  and field paths with little validation support.
- Managed harness is the easy path for prompt targets. External adapter is shown
  only when the selected target is adapter-backed; the readiness panel must show
  whether the adapter can execute candidate prompt/example content, not just
  whether baseline evaluation works.
- Prompt/example optimization detail shows family diagnosis, proposed changes,
  selected changes, quick-shot pruning, validation gate results, and target diffs
  returned by storage-read. It must not show optimizer prompt text, raw adapter
  JSON, hidden reasoning, provider credentials, or full trace payloads.

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
- dataset rows default to the latest ready dataset content;
- split selector;
- target;
- metric settings, defaulted from dataset;
- run policy, defaulted from project settings.

Evaluation creation:

- Route: `/ai-eval/evaluations/new`.
- Tabs: `Dataset`, `Target`, `Metrics`, `Run policy`.
- `Dataset` teaches that runs use the latest ready rows by default, then
  collects dataset and split selector. It shows ready-row feedback for the
  selected split and blocks save when the selected dataset/split has no ready
  rows. Do not expose pinned dataset version policy in first-run creation;
  pinning is an advanced reproducibility control for later comparison/audit
  workflows.
- `Target` teaches what will be evaluated, then collects target kind, target
  reference, and model alias when applicable. First-run setup uses business
  labels such as `CloudGrid prompt`, `External adapter`, and `Prompt or adapter
  reference`; immutable target snapshot ids remain advanced evidence, not a
  creation field.
- `Metrics` teaches how results will be judged, then collects metric settings
  with dataset/project defaults. Supported metric presets are shown before any
  custom metric id fallback.
- `Run policy` teaches budget, sampling, retention, and provider constraints,
  then collects required policy controls. Creating an evaluation does not
  automatically start a run unless an explicit immediate-run option is defined;
  the normal next action is `Run evaluation` from the evaluation detail.

Evaluation settings:

- Route: `/ai-eval/evaluations/:evaluationId/settings`.
- Tabs: `Dataset`, `Target`, `Metrics`, `Run policy`, `History`.
- `Dataset`, `Target`, `Metrics`, and `Run policy` reuse the evaluation
  creation topics and current persisted values. Editable settings save through
  `updateEvaluationDefinition`, apply only to future runs, and keep dataset
  identity fixed unless a later contract allows retargeting an evaluation to a
  different dataset.
- `History` covers settings-only future-run impact, recent run links, and
  pinned-version context without duplicating run result tables.
- Changes apply only to future runs; existing runs remain immutable evidence.
- `Run evaluation` uses pinned dataset versions only when the evaluation
  definition is already pinned; otherwise it starts from the latest ready
  dataset content and navigates directly to the new run detail.

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
- shows skill document diffs, accepted edits, rejected edits, and validation
  gate decisions when `optimizerKind = skill_text_edit`;
- uses explicit `Promote` action.
- Optimization run detail exposes `Settings` while the run is configurable.

Optimization creation:

- Route: `/ai-eval/optimizations/new`.
- Tabs: `Source`, `Objective`, `Search`, `Validation`.
- `Source` teaches that optimization starts from existing evidence, then
  collects source evaluation/run/comparison and baseline target.
- `Objective` teaches primary metric, constraints, tradeoffs, ranking policy,
  and tie-breakers before collecting the resolved objective.
- `Search` teaches the editable target scope. It exposes prompt text and
  few-shot/example controls for prompt optimization, and exposes skill document
  controls when the selected baseline target has an editable `skill` part.
  Unsupported tool, workflow, and agent-configuration optimization controls
  remain hidden.
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
- JSON expected output is edited as raw JSON in the shared JSON editor and
  validated against the dataset schema.
- Trace overview and trace detail can prepare dataset candidates without manual
  trace ID or span ID entry.
- Run detail links to trace detail instead of duplicating full traces.
- Optimization candidate review shows what changed and why it is better or
  worse according to visible metrics.
- Skill optimization run detail shows a step timeline with rollout, reflection,
  edit selection, validation gate, accepted/rejected status, and the best skill
  Markdown diff without requiring the user to inspect raw target snapshot
  metadata.
