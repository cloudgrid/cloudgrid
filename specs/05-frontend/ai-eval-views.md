---
id: TEC-FE-007
title: AI evaluation views
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: from-user
depends_on: [TEC-FE-008, TEC-FE-016, DOM-006]
---

# AI Evaluation Views

## View Inventory

Implement only these route-local AI Eval views in v2:

- `DatasetsListView`;
- `DatasetCreateView`;
- `DatasetDetailView`;
- `DatasetSettingsView`;
- `DatasetImportView`;
- `DatasetExportView`;
- `EvaluationDefinitionsView`;
- `EvaluationCreateView`;
- `EvaluationSettingsView`;
- `EvaluationRunDetailView`;
- `EvaluationComparisonView`;
- `OptimizationCreateView`;
- `OptimizationSettingsView`;
- `OptimizationRunDetailView`;
- `TargetPromotionDialog`.

Do not implement `ScorerRegistry`, `ScorerCreate`, `ExperimentCreate`,
`ExperimentScoreboard`, or `ProductionQuality` as v2 primary views.

## GraphQL Usage

Frontend uses only v2 GraphQL fields from `DOM-006`:

- dataset queries/mutations;
- evaluation definition queries/mutations;
- evaluation run queries/mutations/subscription;
- comparison queries/mutations;
- optimization queries/mutations;
- target snapshot/promotion queries/mutations.

Frontend must not call legacy `createScorer`, `scorers`, `createExperiment`,
`experiments`, or `startExperimentRun` after the v2 contract migration.

## AI Eval Form Behavior

- Every AI Eval create/settings/import/export flow follows PEX-017 through
  PEX-020 from `product-experience-contract.md`.
- Backend enums, generated UI contract unions, GraphQL read-model option lists,
  project AI settings, dataset settings, and target snapshot metadata render as
  constrained controls. Users must not type IDs, enum values, split names,
  provider profile names, adapter refs, target snapshot refs, metric preset
  names, or runtime modes into normal forms.
- Defaults are resolved from the selected source context first. Creating an
  evaluation from a dataset preselects that dataset, split selector, metric
  defaults, and dataset-compatible target controls. Starting optimization from a
  run/comparison preselects source, baseline target, objective metric, validation
  split, and compatible optimizer kind when there is only one valid option.
- Dependent tabs and fields are hidden when they are not applicable to the
  current draft. Hidden fields must not block form submission or show stale
  validation errors.
- When a controlling field changes and invalidates dependent draft values, the
  UI clears or recomputes those values before submit and shows a concise inline
  note naming the changed dependency.
- Validation copy must be self-service: it states the invalid value or missing
  prerequisite, the accepted option/range/shape, and the next action that fixes
  it. Summary errors focus or link the first invalid visible field.

## Dataset View Requirements

- The AI Eval route-level navigation contains only `Datasets` and
  `Evaluations`; it must not contain a nested Datasets-to-Evaluations tab set.
- Dataset list and dataset detail are separate route states.
- Dataset list primary action label is `New dataset`.
- `New dataset` navigates to `/ai-eval/datasets/new`; it must not open a drawer, sheet, dialog, popover, or inline expansion.
- Dataset creation follows the create entity page pattern in
  `product-ux-concept.md` with tabs `Purpose`, `Schema`, `Curation`,
  `Trace intake`.
- Dataset creation validates required fields before forward navigation:
  dataset name, evaluation type, input value type, expected value type,
  expected JSON schema when expected type is JSON, default split, default
  curation status, and required retention/anonymization fields exposed by the
  contract.
- Dataset creation starts with defaults: input value type `text`, expected value
  type from the selected evaluation family preset when available or `text`,
  default split `validation`, default curation status from project AI Eval
  settings, and metric default from the selected evaluation family.
- Evaluation type is selected from the backend `EvaluationFamily` enum. The UI
  must use business wording for labels/help text, explain that it drives metric
  and comparison compatibility, and must not render it as a free-form text
  input.
- Dataset schema controls stack `AI input shape` above `Expected AI result
  shape`. Labels and helper text describe the input sent to the LLM, agent, or
  workflow and the result users expect back, before naming technical fields.
  JSON schema editors are rendered only when the matching value type is `json`;
  switching a side to `text` hides that side's schema editor and saves `null`
  for the matching schema field.
- New dataset defaults use `text` for input values and the validation split for
  first-run rows. Switching a value type to `json` auto-populates an object
  schema only when the schema field is empty.
- Dataset curation metric defaults prefer supported metric presets. A custom
  metric id input may appear only behind an explicit custom option. Evaluation
  family and value-type changes update the suggested metric until the user has
  explicitly selected a preset or custom metric id.
- Dataset trace intake controls use business wording. They start with one or
  more enabled rules that match service and operation/function/span names, then
  map captured trace evidence into AI input, expected AI result, observed
  output, and metadata. Custom path controls appear only after a user chooses a
  custom source. Trace intake defaults to not configured.
- Dataset creation shows field-level validation, tab-level error indicators,
  and a summary error panel when validation or submission fails.
- Dataset creation success navigates to dataset detail.
- Dataset detail manages rows and dataset settings only. Its row creation action
  label is `Add row`; `Add dataset` must not appear inside an existing dataset
  detail view.
- Dataset list must not expose the raw `Dataset.health.status` as a standalone
  `Schema health` column. The overview shows ready-row counts and split
  coverage; actionable health/readiness belongs in dataset detail.
- Dataset detail shows an actionable `Dataset readiness` summary derived from
  `Dataset.health`: ready rows, total rows, missing expected AI results, schema
  or shape issues, leakage warnings, duplicate candidates, small-dataset
  warnings, and next actions that take the user to row editing/import or
  dataset settings.
- Dataset detail disables `Create evaluation from dataset` until the dataset
  has at least one ready row. The readiness summary must keep row/import/settings
  actions visible beside the problem that needs those actions.
- Dataset settings are available from dataset detail through a `Dataset
  settings` action. Settings are not hidden in import/export flows.
- `Dataset settings` navigates to `/ai-eval/datasets/:datasetId/settings`; it
  must not open a drawer, sheet, dialog, popover, or inline expansion.
- Dataset settings follows the entity settings page pattern in
  `product-ux-concept.md` with tabs `Purpose`, `Schema`, `Curation`,
  `Trace intake`, `Versions`.
- Dataset settings reuses the same field grouping as dataset creation for
  creation-time fields. Settings-only behavior belongs in `Versions` or in the
  existing topical tab that owns it.
- Dataset settings uses persistent Cancel and Save settings actions on every
  tab rather than create-flow Back/Continue controls.
- Dataset settings exposes settings-only import/export actions on the settings
  page. Export downloads the current settings draft as JSON. Import accepts the
  same JSON shape, applies it to the draft controls, and still requires Save
  settings before the backend is mutated.
- The settings surface edits configured dataset-level behavior as a full
  settings replacement guarded by `expectedDatasetVersionId`: input value
  type/schema, expected output value type/schema, expected result options,
  default split, curation defaults, trace intake rules, anonymization/PII
  policy, retention, and metric defaults.
- Dataset settings shows field-level validation, tab-level error indicators,
  a summary error panel, and field-adjacent explanations for dataset version
  impact before save.
- Row data uses storage-read cursor pagination.
- Frontend passes filters and sort options to GraphQL; it does not load all rows
  and filter locally.
- Manual row creation sends raw text/JSON values, reason, split, curation
  status, and metadata to BFF. Closed expected-result options such as
  classification labels render as select or multi-select controls. JSON Schema
  enum, boolean, and numeric constraints render as matching controls when the
  schema is simple enough; otherwise the shared JSON editor remains the fallback.
- JSON row values and dataset JSON schemas are edited with the shared raw JSON
  editor control. The frontend still sends raw JSON/text values and inline
  validation errors; it must not introduce a visual JSON builder.
- Every row update sends `expectedDatasetVersion`.
- Import files go through prepare/preview/commit. Frontend must not parse upload
  files into row mutation payloads. The preview shows row-level status, input
  preview, expected-result preview, and blocking errors before commit. Upload ids
  are internal and must not be normal user-facing form fields.
- Export starts a server-side export job.
- Dataset detail can show an explicit `Create evaluation from dataset` action
  for an eligible dataset. This action opens the evaluation creation flow with
  the dataset preselected; it is not route-local navigation to a separate
  Evaluations tab.
- `Prepare dataset rows` is not a dataset-list or dataset-detail action. Trace
  intake actions live in Traces views where the user has trace/span context:
  trace detail, span context actions, selected trace overview rows, and bounded
  current-filter preview actions. The UI must never ask the user to type a
  trace ID or span ID. The picker in Traces lists datasets with matching enabled
  trace intake rules or offers auto-match and groups preview results by dataset
  and rule.

## Evaluation View Requirements

- Evaluation definitions list primary action label is `New evaluation`.
- `New evaluation` navigates to `/ai-eval/evaluations/new`; it must not open a
  drawer, sheet, dialog, popover, or inline expansion.
- Evaluation creation follows the create entity page pattern in
  `product-ux-concept.md` with tabs `Dataset`, `Target`, `Metrics`,
  `Run policy`.
- Evaluation creation validates required fields before forward navigation:
  dataset, split selector, target kind, target reference, required model alias
  when applicable, required metric settings, required run policy fields, and at
  least one ready row for the selected dataset/split.
- Evaluation creation defaults from source context: when opened from a dataset,
  dataset and compatible split are preselected; when exactly one compatible
  target or model alias is available it is preselected; when multiple compatible
  values exist the control renders a selector with no arbitrary free-form
  fallback.
- Dataset detail `Create evaluation from dataset` opens
  `/ai-eval/evaluations/new` with the dataset preselected and still requires
  the user to complete the wizard before saving or starting a run.
- Evaluation creation success navigates to the evaluation definition/detail
  route. When the user explicitly chose immediate run start, success starts the
  run through `startEvaluationRun` and navigates to the run detail route.
- If there are no datasets, the no-evaluations empty state must create a
  dataset first. If datasets exist but none have ready rows, it must link to the
  dataset overview (`/ai-eval?tab=datasets`) instead of opening evaluation
  creation or choosing an arbitrary dataset detail. A dataset-detail link is
  allowed only when a specific dataset is already selected by the current
  context.
- Evaluation detail uses `Run evaluation` for starting a run. It must not use
  `Add evaluation` inside an existing evaluation detail.
- Evaluation detail exposes a `Settings` action that navigates to
  `/ai-eval/evaluations/:evaluationId/settings`.
- Evaluation settings follows the entity settings page pattern in
  `product-ux-concept.md` with tabs `Dataset`, `Target`, `Metrics`,
  `Run policy`, `History`.
- Evaluation settings reuses the same field grouping as evaluation creation for
  creation-time fields. Settings-only behavior belongs in `History` or in the
  existing topical tab that owns it.
- Evaluation settings changes affect future runs only and must not mutate
  already resolved run records.
- Evaluation settings are editable through `updateEvaluationDefinition` for
  evaluation name, split selector, target reference/display name/model alias,
  metric settings, run policy fields supported by the UI, and retention profile.
  Dataset identity remains fixed unless a later contract adds dataset
  retargeting.
- Links from evaluation detail to the source dataset are plain object links back
  to dataset detail, not nested dataset navigation.
- Evaluation creation uses dataset, split selector, target, model alias, metric
  settings, retention profile, and run policy controls. It sends
  `datasetVersionPolicy: latest_ready` by default so users do not need to choose
  an immutable version policy during first setup. Pinned dataset versions are
  reserved for advanced comparison/audit workflows. The model alias is stored in
  `EvaluationTargetRef.metadata.modelAlias` and is resolved through project AI
  provider settings by the runner. Immutable target snapshot ids are advanced
  evidence and must not be part of the first-run creation form.
- Changing dataset, split selector, target kind, or model alias recomputes
  compatible metrics and run-policy requirements. Incompatible metric settings
  are cleared with an inline note and do not remain as hidden invalid values.
- Run start uses `startEvaluationRun`, respects pinned dataset versions when the
  definition is pinned, otherwise uses the latest ready dataset version, and
  navigates to the started run detail.
- Run control buttons are visible only for valid lifecycle states.
- Run detail renders storage-read aggregates and item rows as returned.
- Item rows show bounded previews and trace links, not full trace payloads.
- Comparison views render metric deltas and examples from storage-read.
- Comparison creation label is `Create comparison`.

## Optimization View Requirements

- Start optimization from evaluation/run/comparison.
- Optimization start label is `Start optimization`.
- `Start optimization` navigates to `/ai-eval/optimizations/new` when user
  choices are required; it must not open a drawer, sheet, dialog, popover, or
  inline expansion for the primary start workflow.
- Optimization creation follows the create entity page pattern in
  `product-ux-concept.md` with tabs `Source`, `Objective`, `Search`,
  `Validation`.
- Optimization creation validates required fields before forward navigation:
  source evaluation/run/comparison, baseline target, primary metric, hard
  constraints, ranking policy, tie-breakers, validation split policy, minimum
  evidence, search policy, editable target part selection, and test-split
  exclusion.
- Optimization creation defaults from source context. The selected run or
  comparison supplies the baseline target, objective metric candidate,
  compatible validation split, minimum evidence, and initial optimizer kind.
  The user sees selectors only when multiple valid options remain.
- For classification and extraction datasets, `critic_mutate_judge_pick` is the
  default optimizer kind when prompt/example parts are editable. The wizard shows
  family-specific readiness: classification label options/path and extraction
  expected JSON Schema/weak-field support.
- `optimizerKind = bootstrap_fewshot` shows example-only controls and explains
  that CloudGrid will select examples from training rows while validation stays
  held out.
- `optimizerKind = skill_text_edit` shows skill package/runtime controls and
  hides prompt/example-only controls. Prompt/example optimizers hide skill
  package and skill package policy controls. They show runtime mode and adapter
  readiness only when the selected target is an `external_adapter` or when more
  than one compatible execution runtime is available.
- Prompt/example optimizers show target prompt/example part readiness, allowed
  proposal operations, quick-shot pruning settings, validation candidate count,
  and runtime capability status. They must not expose raw optimizer prompts or
  custom adapter JSON.
- For `skill_text_edit`, the `Search` tab shows a skill package panel instead
  of a raw Markdown field. It must show `SKILL.md` status, package file count,
  editable file globs, protected file globs, runtime connector, model/tool
  profile, dry-run status, and package size/token estimates.
- Runtime mode is an explicit segmented control:
  - `Managed harness` for skills that need only the dataset input, selected
    model/tool profile, and CloudGrid-supported fixtures;
  - `External adapter` for skills that need customer MCP servers, proprietary
    tools, files/folders, repositories, workflow state, or business systems.
- Selecting `External adapter` requires a project-approved adapter profile URL
  or ref, capability check, and evidence preview. The UI explains that the
  adapter executes the skill in the customer's context while CloudGrid receives
  terminal output/output refs through the adapter API and optimizer-relevant
  step evidence through OTLP traces.
- External adapter readiness must show OTLP status separately from HTTP status:
  authentication, async polling, trace propagation, recognized standard
  semantic conventions, terminal output/output-ref support, and last dry-run
  trace link.
- Skill package upload/import/select surfaces must accept a directory or ZIP
  with required `SKILL.md`. The UI previews generated manifest rows grouped by
  entrypoint, references, examples, scripts, assets, dependency manifests,
  runtime fixtures, and metadata.
- Runtime setup is a guided selector: users choose a project-approved runtime
  connector/profile and model/tool profile. The optimization wizard must not ask
  users to paste arbitrary shell commands, raw adapter JSON, provider
  credentials, or secrets.
- The start button remains disabled until runtime dry run succeeds and the
  selected dataset has eligible training and validation rows.
- Optimization creation success calls `startOptimizationRun` and navigates to
  optimization run detail.
- Optimization run detail exposes a `Settings` action while the run is
  configurable. The action navigates to
  `/ai-eval/optimizations/:optimizationRunId/settings`.
- Optimization settings follows the entity settings page pattern in
  `product-ux-concept.md` with tabs `Source`, `Objective`, `Search`,
  `Validation`, `Controls`.
- Optimization settings reuses the same field grouping as optimization creation
  for creation-time fields. Settings-only behavior belongs in `Controls` or in
  the existing topical tab that owns it.
- Terminal optimization runs render settings read-only unless a later spec
  defines mutable post-run metadata.
- Show resolved objective before start.
- Show quick-shot as an explicit phase when present.
- Show candidate target snapshots and target diffs.
- Show classification/extraction prompt optimization steps when present:
  family diagnosis, proposed prompt/example changes, selected changes,
  quick-shot run, validation score, gate decision, rejected change summaries,
  and accepted candidate snapshot.
- Show prompt/example diffs for accepted and selected candidates. When retained
  content expired, show degraded digest/summary state returned by storage-read
  instead of trying to reconstruct diffs in the frontend.
- Show skill optimization steps when present: rollout batch, proposed edits,
  selected edits, validation gate score, gate decision, rejected edit summary,
  and accepted candidate snapshot.
- Show the best skill artifact as a package/file diff against the baseline
  skill package when `OptimizationRun.skillOptimization` is present. `SKILL.md`
  is the default selected file, with references/examples available as separate
  file tabs when they changed.
- Disable promotion until full validation evidence exists.
- Promotion uses `promoteTargetSnapshot`.

## Empty And Error States

- AI Eval disabled: link to project settings when user is authorized.
- No datasets: primary action creates or imports a dataset.
- Dataset has no ready rows: primary action opens row add/import.
- No evaluations: primary action creates evaluation from an eligible dataset.
- External adapter unavailable: show adapter problem and retry/control actions
  based on run state.
- Retained detail expired: show durable metrics and explain that detailed
  previews expired by retention policy.

## Acceptance Criteria

- The AI Eval rail/tabs contain only Datasets and Evaluations.
- A run can be started and watched without frontend polling private services.
- A dataset with thousands of rows remains usable through cursor pagination.
- A user can inspect effective retention only in advanced details.
