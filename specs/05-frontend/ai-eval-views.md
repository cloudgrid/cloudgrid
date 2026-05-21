---
id: TEC-FE-007
title: AI evaluation views
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-17
provenance: from-user
depends_on: [DOM-006, TEC-BE-015, TEC-FE-008]
---

# AI Evaluation Views

## Feature Flag

AI evaluation routes render only when `CLOUDGRID_AI_EVAL_ENABLED=true`. When disabled, the frontend hides navigation entries and does not execute AI-eval GraphQL operations.

## Views

AI evaluation layout follows `05-frontend/product-ux-concept.md` and
`05-frontend/ai-eval-ux-concept.md`: feature-gated project workspace
navigation, route-local AI Eval rail, and one main workspace surface. The
route-local rail is task based and must not expose generic demo entries such as
`Overview`, duplicate telemetry entries such as `Agent runs`, or unbacked work
queues such as `Annotations`. The approved rail entries are `Datasets`,
`Scorers`, `Experiments`, and `Production quality`.

- Trace evidence pivots: rows that need execution detail link to `/traces`.
- Dataset workbench: dataset list, item table, version health, structured row
  create, import/export, and source trace pivots.
- Dataset import/export: upload JSONL, JSON array, CSV, or ZIP files; map
  source fields; preview validation; commit valid rows; export canonical
  dataset files.
- Dataset health: split coverage, reviewed count, duplicate candidates, leakage
  warnings, schema validation state, and small-dataset confidence.
- Scorer registry: deterministic, schema/JSON, semantic, RAG, LLM-judge,
  tool correctness, trajectory/task completion, and human scorer definitions.
- Experiment scoreboard: run comparison, pass-rate, mean score, p50/p95, regression highlights, and per-item diffs.
- Optimization workspace: prompt, skill, and tool candidate comparison with
  explicit promotion gating.
- Production quality: online policies, quality trend, cost trend, latency trend,
  tool/retrieval health, and budget status.
- Annotation actions: only appear from experiment or production result context
  when the approved mutation path is available.

## Online Policy UI V1

Online policy management lives in Project Settings / AI Eval configuration, with
read-only production quality monitoring in the AI Eval route.
The AI Eval route may link to `/projects/:projectId/settings/ai-eval` from setup
or administrative actions, and to `/projects/:projectId/settings/ai-providers`
when provider configuration is missing. It must not render settings as a rail
item, right-inspector detail surface, or alternate settings form.

The settings UI must:

- show that production online scoring is inactive by default;
- create/edit/delete online policies only through
  `Mutation.updateProjectAiSettings`;
- require an explicit enabled toggle per policy;
- require at least one target filter before a policy can be enabled;
- expose only the approved target fields from
  `specs/04-backend/ai-eval-project-settings.md`;
- select judge, optimizer, embedding, replay, and default provider references
  from Project AI Providers instead of editing provider profiles inline;
- allow selecting deterministic scorers only for v1 online policies;
- show non-deterministic scorer families as offline-only when useful,
  but never submit them in enabled online policies;
- show sample rate, max daily runs, and manual annotation defaults;
- describe annotation defaults as user-triggered batch action defaults, not
  automatic routing.

The production quality UI must:

- render quality summaries and segments from `Query.aiQualityOverview`;
- render skipped-result reasons returned by GraphQL;
- provide filters for policy, scorer, service, route, environment, model,
  prompt version, and time range when backed by GraphQL fields;
- let users select/filter failed online score results and trigger annotation
  item creation through the approved annotation mutation path;
- not create annotation queue items automatically;
- not expose alert-rule controls for AI-eval online results in v1.

## Dataset Import/Export UI

Dataset administration, import, and export lives in the Datasets section.
Import uses a dedicated workflow view inside the route workspace, not a narrow
side sheet. The Datasets workspace must always show a dataset create action and
a clear empty state that explains that a dataset is required before imports or
experiment runs can happen.

Dataset list and dataset detail are separate states. The list state is a
full-width overview and selection table. Opening a dataset replaces the list
with a full-width dataset workbench; the list must not remain as a side column
that steals row-editing space.

Import UI:

- shows an Import action on the selected dataset;
- accepts `.jsonl`, `.json`, `.csv`, and `.zip`;
- uploads bytes only through
  `POST /api/ai-eval/dataset-imports/uploads`;
- displays detected ZIP contents with file path, detected format, and size;
- lets users select included files when a ZIP contains multiple supported
  files;
- provides mapping controls for `input`, `expected`, `metadata`,
  `sourceTraceId`, `sourceSpanId`, `split`, and `reviewStatus`;
- supports column mapping for CSV and JSON path mapping for JSON/JSONL;
- supports constants/defaults without custom scripting;
- shows preview rows returned by `Mutation.prepareDatasetImport`;
- shows row errors and warnings with source file path and row number;
- disables Commit when errors exist unless the user explicitly enables partial
  commit and the preview allows it;
- calls `Mutation.commitDatasetImport` only after user confirmation.

Manual row creation uses `Mutation.appendDatasetItems` with the current
`expectedDatasetVersion`, structured fields for input prompt, expected answer,
split, review status, and optional source trace/span. Text answers use a text
field. JSON answers use a field editor for name, scalar type, and value. The UI
must not require JSON input for the common manual-row path.

Export UI:

- exposes Export on the selected dataset;
- supports `jsonl`, `json_array`, and `csv`;
- lets users filter by split and review status only when the GraphQL input
  supports those filters;
- calls `Mutation.startDatasetExport`;
- downloads only from the returned same-origin `downloadUrl`;
- labels exports as canonical CloudGrid dataset format.

Frontend must not parse uploaded file rows into `DatasetItemInput`, infer
mapping automatically, compute row validity, deduplicate rows, compute leakage,
or call `appendDatasetItems` for uploaded files.

The import workflow must minimize visual noise:

- show one active decision area at a time where possible;
- provide presets for common CSV and JSONL shapes;
- explain disabled preview/commit states next to the disabled action;
- avoid repeating dataset version, item counts, and health values in a separate
  inspector when they are already visible in the workspace.

## Experiment Run UI

Experiment creation and evaluation runs live in the Experiments section. The
workspace must guide the user from prerequisite data to execution:

- show which dataset version and scorers each experiment uses;
- expose Create experiment from the Experiments workspace, using existing
  dataset and scorer query results;
- require a dataset, at least one scorer, a name, and a solver reference before
  creating an experiment;
- expose Run evaluation on every experiment row and in the selected experiment
  inspector;
- call `Mutation.startExperimentRun` for evaluation execution;
- show existing experiment runs, status, pass rate, mean score, latency, and
  item-run details returned by GraphQL;
- keep prompt/tool/skill optimization details inside experiment/run details
  until a dedicated optimization contract exists.

Experiment creation must use form controls for solver kind and solver name. The
primary UI must not ask users to type a JSON object.

## Scorer Creation UI

Scorer creation uses structured templates. The primary UI must expose:

- scorer name;
- template;
- template-specific inputs such as selectable match field, expected value type,
  expected value, threshold, rubric text, or provider alias;
- deterministic/offline-only availability guidance for scorer families that
  cannot run online in v1.

The primary UI must not contain a `Definition JSON` text input. Match field is a
dropdown of known expected/model output paths and must not be free text.

## Project AI Eval Settings

Project Settings / AI Eval exposes the operational setup required to run AI
Eval:

- enable/disable AI Eval for the project;
- default provider and judge profile ids;
- provider profile timeout and max parallel request controls;
- daily and per-run budget limits;
- max parallel experiment item execution;
- existing provider/profile/policy counts and effective warnings.

## Frontend Boundary

Frontend code owns route state, selection, tabs, focus, expansion, sorting
controls, and virtualization windows. It does not compute scores, transcript
semantics, cost estimates, dataset health, split leakage, production quality,
online policy matches, scorer calibration, scoreboard aggregates, or query
facets from raw spans.

## Required UX Flows

Implementation must cover the flows in `05-frontend/ai-eval-ux-concept.md`:

- first-use setup;
- production trace to dataset item through Traces pivots;
- dataset split management;
- scorer template creation;
- baseline experiment run;
- prompt/skill/tool optimization;
- candidate promotion;
- production online policy monitoring;
- annotation actions from result context when supported;
- dataset import/export;
- Project Settings / AI Eval configuration.
