---
id: TEC-FE-009
title: AI evaluation views
layer: frontend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [TEC-FE-008, DOM-006]
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

## Dataset View Requirements

- The AI Eval route-level navigation contains only `Datasets` and
  `Evaluations`; it must not contain a nested Datasets-to-Evaluations tab set.
- Dataset list and dataset detail are separate route states.
- Dataset list primary action label is `New dataset`.
- `New dataset` navigates to `/ai-eval/datasets/new`; it must not open a drawer, sheet, dialog, popover, or inline expansion.
- Dataset creation follows the create entity page pattern in
  `product-ux-concept.md` with tabs `Purpose`, `Schema`, `Curation`,
  `Extraction`.
- Dataset creation validates required fields before forward navigation:
  dataset name, evaluation family, input value type, expected value type,
  expected JSON schema when expected type is JSON, default split, default
  curation status, and required retention/anonymization fields exposed by the
  contract.
- Dataset creation shows field-level validation, tab-level error indicators,
  and a summary error panel when validation or submission fails.
- Dataset creation success navigates to dataset detail.
- Dataset detail manages rows and dataset settings only. Its row creation action
  label is `Add row`; `Add dataset` must not appear inside an existing dataset
  detail view.
- Dataset settings are available from dataset detail through a `Dataset
  settings` action. Settings are not hidden in import/export flows.
- `Dataset settings` navigates to `/ai-eval/datasets/:datasetId/settings`; it
  must not open a drawer, sheet, dialog, popover, or inline expansion.
- Dataset settings follows the entity settings page pattern in
  `product-ux-concept.md` with tabs `Purpose`, `Schema`, `Curation`,
  `Extraction`, `Versions`.
- Dataset settings reuses the same field grouping as dataset creation for
  creation-time fields. Settings-only behavior belongs in `Versions` or in the
  existing topical tab that owns it.
- The settings surface edits configured dataset-level behavior as a full
  settings replacement guarded by `expectedDatasetVersionId`: input value
  type/schema, expected output value type/schema, default split, curation
  defaults, extraction settings, anonymization/PII policy, retention, and
  metric defaults.
- Dataset settings shows field-level validation, tab-level error indicators,
  a summary error panel, and field-adjacent explanations for dataset version
  impact before save.
- Row data uses storage-read cursor pagination.
- Frontend passes filters and sort options to GraphQL; it does not load all rows
  and filter locally.
- Manual row creation sends raw text/JSON values, reason, split, curation
  status, and metadata to BFF.
- Every row update sends `expectedDatasetVersion`.
- Import files go through prepare/preview/commit. Frontend must not parse upload
  files into row mutation payloads.
- Export starts a server-side export job.
- Dataset detail can show an explicit `Create evaluation from dataset` action
  for an eligible dataset. This action opens the evaluation creation flow with
  the dataset preselected; it is not route-local navigation to a separate
  Evaluations tab.
- `Add trace to dataset` is not a dataset-list or dataset-detail action. Trace
  import actions live in Traces views where the user has trace/span context:
  trace detail, span context actions, and trace overview bulk actions. The
  dataset picker in Traces lists only datasets that have extraction settings.

## Evaluation View Requirements

- Evaluation definitions list primary action label is `New evaluation`.
- `New evaluation` navigates to `/ai-eval/evaluations/new`; it must not open a
  drawer, sheet, dialog, popover, or inline expansion.
- Evaluation creation follows the create entity page pattern in
  `product-ux-concept.md` with tabs `Dataset`, `Target`, `Metrics`,
  `Run policy`.
- Evaluation creation validates required fields before forward navigation:
  dataset, dataset version policy, split selector, target kind, target
  reference, required model alias when applicable, required metric settings, and
  required run policy fields.
- Dataset detail `Create evaluation from dataset` opens
  `/ai-eval/evaluations/new` with the dataset preselected and still requires
  the user to complete the wizard before saving or starting a run.
- Evaluation creation success navigates to the evaluation definition/detail
  route. When the user explicitly chose immediate run start, success starts the
  run through `startEvaluationRun` and navigates to the run detail route.
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
- Links from evaluation detail to the source dataset are plain object links back
  to dataset detail, not nested dataset navigation.
- Evaluation creation uses dataset, dataset version policy, split selector,
  target, model alias, metric settings, retention profile, and run policy
  controls. The model alias is stored in
  `EvaluationTargetRef.metadata.modelAlias` and is resolved through project AI
  provider settings by the runner.
- Run start uses `startEvaluationRun`.
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
  evidence, and test-split exclusion.
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
