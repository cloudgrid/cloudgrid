---
id: DOM-006
title: AI evaluation
layer: domain
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [VIS-001, CNV-001, TEC-BE-001, TEC-BE-008, ADR-0003, ADR-0007, ADR-0008]
---

# AI Evaluation

## Purpose

AI Eval helps teams create reliable datasets, run trace-backed dataset
evaluations, compare metric results, and optimize prompts or examples before
explicit promotion. It builds on preserved OpenTelemetry data but does not
replace the trace, log, metric, or dashboard workspaces.

The product vocabulary is:

- datasets;
- evaluations;
- runs;
- metrics;
- results;
- comparisons;
- optimization;
- targets.

Do not expose `Scorer`, `Check`, `Gate`, or `Experiment` as primary user-facing
concepts in v2. Old specs or contracts that still use those words are legacy
names only until contracts are renamed. Their v2 meaning is defined by this
spec.

## User-Facing Model

The AI Eval workspace has two first-version sections:

- `Datasets`.
- `Evaluations`.

`Production quality` is backlog until dataset evaluations and optimization are
implemented. Production quality will later reuse metric/result/comparison
machinery with production trace datapoints as input, but production success
signals are use-case-specific and are not specified in v2.

Inside `Evaluations`, users can:

- create reusable dataset evaluations;
- run an evaluation against a target;
- compare runs;
- start an optimization from an evaluation or failed run;
- review candidate changes;
- explicitly promote a selected target snapshot.

## Boundary Rules

- Frontend talks only to the TypeScript BFF through GraphQL.
- BFF talks to private services only through NATS request/reply contracts.
- BFF does not score, aggregate, correlate, enrich, or filter telemetry records.
- Storage-write is the only service that mutates SurrealDB.
- Storage-read is the only service that reads SurrealDB for AI Eval queries,
  metric aggregation, comparisons, dataset health, and live fanout.
- `core/ai-eval-runner` orchestrates evaluation and optimization work. It
  persists through storage-write subjects only and reads through storage-read or
  control-plane subjects only.
- The runner may execute prompt targets in the CloudGrid harness.
- The runner may execute `external_adapter` targets by calling the configured
  adapter protocol in this spec.
- The runner must not call model providers directly except through the approved
  harness/provider abstraction defined by AI runtime specs.
- Public telemetry and AI Eval reads use GraphQL. Do not add public REST read
  endpoints.
- Dataset upload/download byte transfer remains BFF-owned, but import/export
  semantics belong to GraphQL plus private message contracts.

## Entity Inventory

Required v2 entities:

| Entity | Purpose | Mutability |
| --- | --- | --- |
| `Dataset` | Project-scoped dataset settings and current version pointer. | Mutable pointer to immutable versions. |
| `DatasetVersion` | Immutable dataset settings snapshot plus item revision set. | Immutable. |
| `DatasetItem` | Stable row identity. | Mutable pointer to latest item revision. |
| `DatasetItemRevision` | Immutable row content used by runs. | Immutable. |
| `DatasetCandidate` | Reviewable trace/import/failure-derived row candidate. | Status transitions only. |
| `DatasetImportJob` | Preview and commit state for uploaded datasets. | Status transitions only. |
| `DatasetExportJob` | Prepared export artifact metadata. | Status transitions only. |
| `EvaluationDefinition` | Reusable evaluation setup over one dataset and target ref. | Mutable; runs snapshot it. |
| `EvaluationRun` | One execution of an evaluation definition or optimization phase. | Status transitions only. |
| `EvaluationItemRun` | One dataset item execution with trace refs and metric results. | Status transitions only. |
| `MetricCapability` | Internal registered metric calculator definition. | Code/config registered, not user asset. |
| `MetricResult` | Typed per-item, aggregate, comparison, or optimization metric value. | Immutable after finalization. |
| `MetricAggregate` | Storage-read-owned aggregate over metric results. | Derived/cacheable. |
| `EvaluationComparison` | Baseline/candidate metric comparison. | Immutable after creation. |
| `EvaluationTarget` | User-selectable runnable target pointer. | Mutable pointer to snapshot/ref. |
| `TargetSnapshot` | Immutable target behavior snapshot. | Immutable. |
| `TargetPartSnapshot` | Immutable part of a target snapshot. | Immutable. |
| `TargetDiff` | Derived or cached comparison between snapshots. | Derived/cacheable. |
| `PromotionRecord` | Explicit promotion evidence and target ref movement. | Immutable. |
| `OptimizationRun` | Reproducible loop around evaluation runs. | Status transitions only. |
| `ProjectAiSettings` | Project AI Eval enablement, budgets, defaults, and provider refs. | Mutable through control-plane. |

Legacy mappings during migration:

- `Scorer` maps to internal `MetricCapability` plus evaluation-level metric
  settings. Users do not create project-owned Scorers in v2.
- `Experiment` maps to `EvaluationDefinition`.
- `ExperimentRun` maps to `EvaluationRun`.
- `EvalResult` maps to `MetricResult`.
- `EvalSolverRef` maps to `EvaluationTargetRef`.
- `holdout` split maps to `test`. Do not create new `holdout` values.

## Dataset Settings

Every dataset defines one row contract. Mixed row shapes inside one dataset are
not allowed.

`Dataset.settings` fields:

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `evaluationFamily` | enum | yes | `classification`, `extraction`, or `freeform_answer` in v1. Future accepted values are `tool_use`, `agent_loop`, `workflow`, `skill`. |
| `inputType` | enum | yes | `text` or `json`. |
| `expectedType` | enum | yes | `text` or `json`. |
| `inputJsonSchema` | JSON Schema object | conditional | Optional when `inputType = json`; absent means syntax-only JSON validation plus dataset health warning. Must be null when `inputType = text`. |
| `expectedJsonSchema` | JSON Schema object | conditional | Required when `expectedType = json`; must be null when `expectedType = text`. |
| `defaultSplit` | enum | yes | `training`, `validation`, or `test`. |
| `intakePolicy` | object | yes | Defines default curation status for manual/import/trace rows. |
| `traceExtractionSettings` | object | optional | Required for trace-to-dataset picker eligibility. |
| `anonymizationPolicy` | object | optional | Defines content treatment and PII removal/anonymization. |
| `defaultMetricSettings` | object | yes | Metric IDs and options allowed for the dataset family. |
| `retentionProfile` | enum | yes | `balanced`, `fast_iteration`, `audit_friendly`, or `minimal_storage`. |

JSON Schema dialect is JSON Schema 2020-12. Storage-write validates row input and
expected values on create/update/import/commit. Storage-read reports schema
health and validation summaries. The frontend may prevalidate for UX, but
storage-write is authoritative.

## Dataset Rows

`DatasetItemRevision` fields:

| Field | Type | Required | Rule |
| --- | --- | --- | --- |
| `id` | ID | yes | Stable revision ID. |
| `datasetItemId` | ID | yes | Stable row identity. |
| `datasetId` | ID | yes | Project-scoped dataset. |
| `input` | text or JSON | yes | Must match `Dataset.settings.inputType` and schema rule. |
| `expected` | text or JSON | conditional | Required for `curationStatus = ready`; must match expected type/schema. |
| `observedOutput` | text or JSON | no | Actual source trace/import/evaluation output. Never ground truth. |
| `reason` | string | yes | Defaults to `""`; explains why `expected` is correct when provided. |
| `curationStatus` | enum | yes | `draft`, `needs_expected`, `needs_review`, `ready`, or `rejected`. |
| `curationNote` | string | no | Human/program note for review state. |
| `split` | enum | yes | `training`, `validation`, or `test`. |
| `sourceRefs` | array | yes | Trace/span/evaluation/import/candidate refs. Empty array allowed for manual rows. |
| `contentTreatment` | enum | yes | `original`, `realistic_anonymized`, `redacted`, or `synthetic`. |
| `anonymizationProvenance` | object | no | Required when treatment is `realistic_anonymized` or `redacted`. |
| `metadata` | object | yes | User metadata. Does not affect dataset digest unless promoted to a typed setting. |
| `createdAt`, `createdBy`, `updatedAt`, `updatedBy` | audit | yes | Audit fields. |

`observedOutput` is stored only when useful for curation, debugging, or
optimization. It follows the dataset content treatment, PII policy, and
retention policy. Source trace/evaluation refs remain the place to inspect full
observed behavior.

Eligibility for evaluation:

- `curationStatus = ready`;
- `input` validates;
- `expected` validates;
- `split` is assigned;
- row revision belongs to the selected immutable dataset version.

## Curation Status

Use exactly one row status field:

| Status | Meaning | Evaluation eligible |
| --- | --- | --- |
| `draft` | Row exists but is incomplete or not intentionally reviewable. | no |
| `needs_expected` | Row has input/observed output but no corrected expected value. | no |
| `needs_review` | Row has expected value but needs human or trusted review. | no |
| `ready` | Row is validated and intentionally usable. | yes |
| `rejected` | Row must not be used. | no |

Do not add a separate `reviewStatus`.

## Splits

Use exactly:

- `training`;
- `validation`;
- `test`.

Every row revision has exactly one split. Random split assignment never happens
implicitly. Import and bulk edit flows may offer deterministic split assignment,
but the selected split is persisted per row revision.

Optimization may use `training`. Candidate validation uses `validation`.
Candidate generation and prompt search must never read `test`. `test` is only
for final confidence before or after explicit promotion.

## Dataset Versioning

Evaluation evidence must reference immutable dataset content.

`DatasetVersion` fields:

- `id`;
- `datasetId`;
- `version`;
- `digest`;
- `createdAt`;
- `createdBy`;
- `settingsSnapshot`;
- `itemRevisionIds`;
- `parentVersionId`, optional;
- `changeSummary`;
- `source`: `manual`, `import`, `trace_import`, `candidate_commit`,
  `bulk_edit`, or `system`.

Create a new `DatasetItemRevision` when any behavior-affecting row field
changes: `input`, `expected`, `observedOutput` when retained, `reason`, `split`,
`curationStatus`, `contentTreatment`, anonymized/redacted content, source refs,
or metadata explicitly configured as metric input.

Create a new `DatasetVersion` when item revision membership changes or any
behavior-affecting setting changes: `evaluationFamily`, input/expected types,
schemas, trace extraction settings, anonymization policy, default metric
settings, default split, or retention profile when it changes stored run
evidence.

Dataset digest is a canonical digest over:

- normalized behavior-affecting settings;
- input/expected JSON schemas after canonical JSON serialization;
- sorted item revision IDs and item revision digests.

Audit fields, UI labels, and non-executed metadata do not affect the digest.

Every `EvaluationRun` stores `datasetVersionId`, `datasetDigest`, selected item
revision IDs, split selector, and item selection policy. Historical runs must
render the exact input, expected output, reason, split, schemas, and settings
used at execution time.

## Dataset Import, Export, And Hugging Face Compatibility

Supported import formats:

- JSONL, one row per line;
- JSON array;
- CSV;
- ZIP containing one supported data file plus optional attachment manifest;
- Hugging Face-style JSONL or CSV exported from `datasets`, mapped through the
  same preview flow.

Import always uses preview-before-commit:

1. BFF stages bytes.
2. Storage-write prepares `DatasetImportJob`, parses rows, validates mapping,
   validates JSON/schema rules, and returns preview rows plus errors.
3. User confirms mapping and commit options.
4. Storage-write creates item revisions and one new dataset version.

Do not let the frontend parse uploaded files into normal row mutations.

Export formats:

- canonical CloudGrid JSONL;
- JSON array;
- CSV when input/expected values can be serialized;
- Hugging Face-compatible JSONL with columns `input`, `expected`, `reason`,
  `split`, `metadata`, and optional `observedOutput`.

Hugging Face compatibility is an import/export mapping feature only. It does
not create a second internal row model.

## Trace-To-Dataset Intake

Trace detail and trace overview may expose `Add to dataset`.

The dataset picker must show only datasets whose `traceExtractionSettings` are
present and compatible with the selected trace/span. This avoids asking the user
to resolve extraction details during normal import.

Trace extraction result rules:

- If extracted observed output is trusted as correct and validates, copy it into
  `expected` and set the configured default curation status.
- If extracted output is wrong, incomplete, or untrusted, store it as
  `observedOutput`, leave `expected` empty or user-edited, and set
  `curationStatus = needs_expected` or `needs_review`.
- Imported rows are not evaluation-eligible until they reach `ready`.
- Source refs must include trace ID and span ID when available.
- PII/anonymization policy runs before row commit when configured.

## Evaluation Targets

Use `EvaluationTargetRef` in v2 contracts.

Target kinds:

- `prompt`;
- `external_adapter`;
- `agent` later;
- `workflow` later;
- `custom_harness_target` advanced/later.

V1 executable target kinds are `prompt` and `external_adapter`.

`EvaluationTargetRef` fields:

- `kind`;
- `targetId`, optional for registered targets;
- `targetSnapshotId`, optional for exact snapshot rerun;
- `targetRef`, optional mutable name/tag;
- `displayName`;
- `metadata`.

All evaluation runs resolve a target ref to an immutable `TargetSnapshot` before
execution.

## Target Snapshots

`TargetSnapshot` fields:

- `id`;
- `kind`: `prompt`, `external_adapter`, `agent`, `workflow`, or
  `custom_harness_target`;
- `name`;
- `version`;
- `digest`;
- `createdAt`;
- `createdBy`;
- `source`: `manual`, `imported`, `optimized`, `promoted`, or `external`;
- `parts`;
- `metadata`;
- `reproducibility`: `full` or `degraded`.

`TargetPartSnapshot` fields:

- `partKind`: `prompt`, `examples`, `model_config`, `tool_config`, `skill`,
  `workflow`, `agent_config`, or `adapter_metadata`;
- `partRef`;
- `version`;
- `digest`;
- `contentRef`;
- `summary`;
- `metadata`.

V1 prompt targets populate `prompt`, optional `examples`, and `model_config`.
V1 external adapter targets populate `adapter_metadata`, optional
`model_config`, and any prompt/tool/skill/workflow refs the adapter can expose.

Canonical digest rule:

- Serialize canonical JSON with sorted object keys, no insignificant whitespace,
  UTF-8 encoding, and normalized numbers/booleans/nulls.
- `TargetSnapshot.digest` covers `kind`, ordered normalized part descriptors,
  part digests, and behavior-affecting metadata.
- Non-behavior metadata, audit fields, display names, and UI labels do not
  affect the digest.
- Every execution-affecting part must have either stored immutable content or an
  external immutable content reference plus digest.
- If policy forbids storing full content and the external ref is mutable or
  unavailable, set `reproducibility = degraded` and retain digest, bounded
  summary, and external ref.

Optimization candidates are new snapshots. Promotion points a mutable target
ref/tag to an immutable snapshot. Diffs compare snapshot parts by digest and
structured content when content is available.

## External Adapter Target Protocol

`external_adapter` is the enterprise integration path for black-box agents and
workflows that cannot be rebuilt inside CloudGrid's harness.

CloudGrid owns datasets, evaluation runs, metrics, comparisons, retention, and
trace correlation. The adapter owns execution.

Adapter request:

- HTTP `POST {adapterBaseUrl}/eval-runs`;
- headers: `traceparent`, optional `tracestate`,
  `x-cloudgrid-request-id`, `x-cloudgrid-idempotency-key`;
- authentication: project-configured static bearer token or HMAC signature
  secret stored in project settings; secrets are never returned to frontend;
- JSON body:
  - `projectId`;
  - `evaluationRunId`;
  - `evaluationItemRunId`;
  - `datasetId`;
  - `datasetVersionId`;
  - `datasetItemId`;
  - `datasetItemRevisionId`;
  - `targetSnapshotId`;
  - `input`;
  - `inputType`;
  - `metadata`;
  - `deadlineMs`.

The request does not include `expected` by default. A future explicit debug mode
may include expected values only under a separate spec and must never be enabled
for optimization candidate generation by default.

Synchronous success response:

```json
{
  "status": "completed",
  "output": {},
  "outputType": "json",
  "metadata": {}
}
```

Asynchronous start response:

```json
{
  "status": "running",
  "runRef": "adapter-run-id",
  "pollAfterMs": 1000
}
```

Polling:

- HTTP `GET {adapterBaseUrl}/eval-runs/{runRef}`;
- same auth headers as start request;
- `traceparent` and optional `tracestate` when the caller has an active polling
  span;
- returns `running`, `completed`, `failed`, or `cancelled`.

Terminal status values:

- `completed`: final output is present;
- `failed`: adapter completed with terminal execution failure;
- `cancelled`: adapter acknowledged cancellation or stopped before output;
- `timeout`: CloudGrid runner reached timeout; this is runner-generated when the
  adapter does not return it.

Retryable states:

- network timeout before response;
- HTTP 408, 429, or 5xx;
- polling status `running`.

Terminal adapter errors:

- HTTP 400, 401, 403, 404 for configured endpoint/run ref;
- HTTP 413 for payload too large;
- HTTP 422 for invalid input;
- polling status `failed` or `cancelled`.

Idempotency:

- Key is `evaluationItemRunId + targetSnapshotId + datasetItemRevisionId`.
- Repeated start with same key must return the same adapter `runRef` or
  completed result.
- Runner must not create duplicate item runs for repeated starts.

Cancellation:

- Optional HTTP `POST {adapterBaseUrl}/eval-runs/{runRef}/cancel`.
- If unsupported, runner marks local item run `cancelled` and stops polling.

Payload limits:

- Default request body limit is 1 MiB after JSON serialization.
- Default output body limit is 1 MiB.
- Larger payloads require future artifact refs; do not inline them in v1.

Conformance:

- Specs and tests must include a fake sync adapter and fake async polling
  adapter.
- Default CI must use fake adapters only and require no external credentials.
- Real adapter integration tests are opt-in through explicit environment
  variables.

Adapter failures become `MetricResult.problem` values and item-run problems;
they are not counted as model-quality failures unless a metric explicitly treats
terminal execution failure as task failure.

## Dataset Evaluation

`EvaluationDefinition` fields:

- `id`;
- `projectId`;
- `name`;
- `datasetId`;
- `datasetVersionPolicy`: `latest_ready` or `pinned`;
- `pinnedDatasetVersionId`, optional;
- `splitSelector`: one or more of `training`, `validation`, `test`;
- `targetRef`;
- `metricSettings`;
- `runPolicy`;
- `retentionProfile`;
- `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

`EvaluationRun` fields:

- `id`;
- `projectId`;
- `evaluationDefinitionId`, optional for ad hoc/optimization phase runs;
- `kind`: `dataset_evaluation`, `quick_shot`, `optimization_validation`, or
  `test`;
- `status`: `queued`, `running`, `pausing`, `paused`, `cancelling`,
  `cancelled`, `completed`, `failed`;
- `datasetId`;
- `datasetVersionId`;
- `datasetDigest`;
- `selectedItemRevisionIds`;
- `splitSelector`;
- `targetSnapshotId`;
- `metricSettingsSnapshot`;
- `runPolicySnapshot`;
- `retentionProfile`;
- `retentionRole`;
- `startedAt`, `endedAt`;
- `summary`;
- `problem`, optional.

Evaluation run status transitions:

| Current | Next |
| --- | --- |
| `queued` | `running`, `cancelled`, `failed` |
| `running` | `pausing`, `cancelling`, `completed`, `failed` |
| `pausing` | `paused`, `failed` |
| `paused` | `running`, `cancelling` |
| `cancelling` | `cancelled`, `failed` |
| `completed`, `cancelled`, `failed` | terminal |

Repeated start/cancel/pause/resume commands are idempotent by run ID and command
idempotency key.

## Evaluation Item Runs

Every item run is trace-backed, including simple classification and extraction.

`EvaluationItemRun` fields:

- `id`;
- `evaluationRunId`;
- `datasetItemId`;
- `datasetItemRevisionId`;
- `targetSnapshotId`;
- `status`: `queued`, `running`, `completed`, `failed`, `cancelled`,
  `quarantined`;
- `actualOutput`;
- `actualOutputType`: `text` or `json`;
- `traceId`;
- `rootSpanId`;
- `metricResultIds`;
- `problems`;
- `trajectorySummary`;
- `summaryEvidenceRefs`;
- `importantSteps`;
- `conversationRef`, optional;
- `summaryDigest`;
- `summaryGeneratedAt`;
- `retentionRole`;
- `startedAt`, `endedAt`.

Do not duplicate full traces into evaluation records. Full detail remains in
telemetry storage. Item runs store refs, metrics, bounded summaries, and capped
previews.

Reasoning/content policy:

- Capture model-visible messages and tool I/O only when content capture allows.
- Capture provider/harness reasoning summaries only when explicitly emitted.
- Do not infer, request, or store hidden chain-of-thought.
- Store bounded summaries or refs, not unbounded reasoning text.

`importantSteps` entries contain:

- `kind`: `model_call`, `tool_call`, `retrieval`, `handoff`, `workflow_step`,
  or `other`;
- `name`;
- `status`;
- `inputPreview`;
- `outputPreview`;
- `spanRef`;
- `problem`, optional.

Preview limits are 2,000 UTF-8 bytes per input/output preview and 20 important
steps per item run.

## Metric Model

Metric capabilities are internal. Users configure metric settings through
dataset/evaluation defaults; they do not manage scorer assets.

`MetricCapability` fields:

- `metricId`;
- `metricVersion`;
- `displayName`;
- `supportedFamilies`;
- `supportedInputTypes`;
- `supportedExpectedTypes`;
- `requiredEvidence`;
- `executionKind`: `deterministic`, `trace_derived`,
  `semantic_model_backed`, `judge_backed`, or `aggregate_only`;
- `providerRequirements`;
- `perItemResultSchema`;
- `aggregationBehavior`;
- `comparisonBehavior`;
- `visualizationKind`.

Required v1 metric capabilities:

Classification:

- `classification.accuracy`;
- `classification.per_label_support`;
- `classification.confusion_matrix`;
- `classification.precision_recall_f1` when counts support it.

Extraction:

- `extraction.valid_json_rate`;
- `extraction.schema_validity`;
- `extraction.exact_json_match`;
- `extraction.field_match_rate`;
- `extraction.missing_field_count`;
- `extraction.extra_field_count`;
- `extraction.type_mismatch_count`.

Freeform answer:

- `freeform.normalized_text_similarity`;
- `freeform.exact_or_contains`;
- optional `freeform.semantic_similarity`;
- optional `freeform.judge_score`.

Always-on trajectory/cost:

- `trajectory.duration_ms`;
- `trajectory.model_call_count`;
- `trajectory.tool_call_count`;
- `trajectory.retrieval_count`;
- `trajectory.retry_count`;
- `trajectory.token_total`;
- `trajectory.cost`;
- `trajectory.problem_count`.

`MetricResult` fields:

- `id`;
- `metricId`;
- `metricVersion`;
- `scope`: `item_run`, `evaluation_run`, `comparison`, or `optimization_run`;
- `subjectId`;
- `family`;
- `payload`;
- `unit`: `ratio`, `count`, `ms`, `tokens`, `currency`, `label`, or `none`;
- `direction`: `higher_is_better`, `lower_is_better`, or `informational`;
- `problem`, optional;
- `evidenceRefs`;
- `metadata`.

Core metric payloads must be typed:

- scalar numeric payload: `{ "kind": "number", "value": number }`;
- scalar boolean payload: `{ "kind": "boolean", "value": boolean }`;
- label payload: `{ "kind": "label", "value": string }`;
- confusion matrix payload:
  `{ "kind": "confusion_matrix", "labels": string[], "cells": [{ "expected": string, "actual": string, "count": number }] }`;
- field breakdown payload:
  `{ "kind": "field_breakdown", "fields": [{ "path": string, "matched": number, "missing": number, "extra": number, "typeMismatch": number }] }`;
- distribution payload:
  `{ "kind": "distribution", "count": number, "min": number, "max": number, "mean": number, "p50": number, "p95": number }`.

Problem taxonomy:

- `invalid_actual_output`;
- `invalid_expected_output`;
- `missing_evidence`;
- `adapter_failure`;
- `timeout`;
- `provider_failure`;
- `content_redacted`;
- `not_applicable`;
- `metric_config_invalid`;
- `internal_error`.

Storage-read owns metric aggregation, comparisons, grouping, and GraphQL-ready
view models. Frontend must not recompute aggregate metrics from full result
sets.

## Evaluation Families

V1 families:

### Classification

Purpose: compare predicted label against expected label.

Defaults:

- `inputType`: `text` or `json`;
- `expectedType`: `text` or `json`;
- if expected is JSON, schema must include a required label field selected by
  metric settings;
- default primary metric: `classification.accuracy`.

### Extraction

Purpose: compare structured actual JSON against expected JSON.

Defaults:

- `expectedType = json`;
- `expectedJsonSchema` required;
- default primary metric: `extraction.field_match_rate`;
- hard constraint: `extraction.schema_validity` must not regress during
  optimization.

### Freeform Answer

Purpose: compare textual final answer to expected answer or rubric-like
reference text.

Defaults:

- `expectedType = text`;
- default primary metric: `freeform.normalized_text_similarity`;
- semantic/judge metrics require configured provider/model aliases and content
  policy allowance.

Future families `tool_use`, `agent_loop`, `workflow`, and `skill` use the same
row/version/run/metric model with JSON expected schemas. Do not add new top-level
row shape systems for those families.

## Optimization

Optimization is a reproducible loop around dataset evaluations.

`OptimizationRun` fields:

- `id`;
- `projectId`;
- `status`: same lifecycle as `EvaluationRun`;
- `baselineTargetSnapshotId`;
- `objective`;
- `trainingEvaluationDefinitionId` or split selector;
- `validationEvaluationDefinitionId` or split selector;
- `testEvaluationDefinitionId`, optional;
- `candidateTargetSnapshotIds`;
- `causedEvaluationRunIds`;
- `quickShotPolicy`;
- `comparisonIds`;
- `selectedCandidateSnapshotId`, optional;
- `promotionRecordId`, optional;
- `budgetSnapshot`;
- `createdAt`, `startedAt`, `endedAt`.

`OptimizationObjective` fields:

- `primaryMetricId`;
- `secondaryMetricIds`;
- `constraints`;
- `tradeoffMetricIds`;
- `rankingPolicy`;
- `tieBreakers`;
- `minimumEvidence`.

Default objective:

- primary metric is the family default quality metric;
- hard constraints: no schema-validity regression for extraction, no increased
  problem rate, no `test` split usage during candidate generation;
- tradeoffs: latency, token count, cost;
- tie-breakers: lower cost, then lower latency.

V1 optimization scope:

- prompt text changes;
- few-shot/example selection changes;
- model config only when already part of the target snapshot.

Do not implement skill/tool/workflow optimization in v1. The snapshot model must
support future part kinds, but behavior is postponed.

## Quick-Shot Evaluation

Quick-shot is an explicit optimization phase, not a hidden shortcut.

`QuickShotPolicy` fields:

- `sourceDatasetVersionId`;
- `split`;
- `selectionStrategy`;
- `selectedItemRevisionIds`;
- `seed`, required when any random sampling is used;
- `minimumSampleSize`;
- `metricSettingsSnapshot`;
- `runPolicySnapshot`.

Allowed selection strategies:

- `failed_categories`;
- `weak_fields`;
- `edge_cases`;
- `high_cost_rows`;
- `recent_failures`;
- `representative_clusters`;
- `stratified_random`.

Default rules:

- minimum total sample size is 20 when the selected split has at least 20
  eligible rows;
- use all eligible rows when fewer than 20 exist;
- classification includes at least 3 rows per affected label when available;
- extraction includes at least 3 rows per weak or missing field path when
  available;
- previous-run optimization includes all regressed rows plus a stratified sample
  of unchanged/passed rows;
- persist seed and exact selected item revision IDs;
- quick-shot may prune candidates but cannot be final promotion evidence.

Promotion requires full validation. High-confidence promotion should run `test`,
but `test` usage is explicit and never part of candidate generation.

## Promotion

Promotion is explicit.

`PromotionRecord` fields:

- `id`;
- `projectId`;
- `targetRef`;
- `baselineTargetSnapshotId`;
- `candidateTargetSnapshotId`;
- `evidenceEvaluationRunIds`;
- `comparisonId`;
- `summary`;
- `promotedBy`;
- `promotedAt`;
- `notes`.

CloudGrid may recommend a candidate. It must not silently promote.

## Retention

Retention uses profiles and roles, not raw TTL UI.

Profiles:

- `balanced`;
- `fast_iteration`;
- `audit_friendly`;
- `minimal_storage`.

Roles:

- `scratch`;
- `quick_shot`;
- `candidate`;
- `baseline`;
- `validation`;
- `test`;
- `promoted`;
- `pinned`.

Default profile is `balanced`.

Balanced TTL defaults:

- durable metadata and aggregate metrics: 730 days;
- per-item metrics for `baseline`, `validation`, `test`, `promoted`, `pinned`:
  365 days;
- per-item metrics for `candidate`: 90 days;
- per-item metrics for `quick_shot`: 30 days;
- trajectory summaries for durable roles: 180 days;
- trajectory summaries for quick-shot/candidate roles: 30 days;
- important-step previews: 30 days;
- optimizer scratch: 7 days;
- rejected/pruned candidate details: 14 days;
- full conversations/tool I/O follow trace/content retention and PII policy;
- pinned records follow project durable retention or until unpinned, subject to
  content retention limits.

Profile adjustments:

- `fast_iteration`: halve quick-shot/candidate TTLs and keep optimizer scratch
  for 3 days.
- `audit_friendly`: keep durable per-item metrics and trajectory summaries for
  730 days.
- `minimal_storage`: keep durable metadata/aggregates, shorten quick-shot and
  previews to 7 days, and disable retained trajectory summaries unless pinned.

Users can inspect effective retention role and expiry in advanced run/item
details. The primary UI does not expose raw TTL controls.

## Frontend UX Contract

Primary AI Eval route:

- `/ai-eval`.

Route-local sections:

- `Datasets`;
- `Evaluations`.

Do not add route-local primary nav entries for Scorers, Checks, Experiments,
Annotations, or Production quality in v2.

Dataset UX:

- dataset list;
- dataset detail with settings, health, rows, versions, import/export;
- raw text/JSON row editor with schema validation;
- optional reason field;
- curation status and split controls;
- trace import dataset picker filtered to compatible extraction settings.

Evaluation UX:

- evaluation definition list;
- create evaluation from dataset, split selector, target, metric defaults, and
  run policy;
- run detail with aggregate metrics, item runs, trajectory summaries, important
  steps, and trace links;
- comparison view over metric deltas and changed item examples;
- optimize action from evaluation or comparison;
- candidate review showing target diff and metric tradeoffs;
- explicit promote action.

Advanced details may show dataset versions, item revisions, digests, target
snapshots, target parts, retention roles, metric capability IDs, and adapter
diagnostics. They are not required for the normal flow.

## Message Contract Inventory

The machine-readable AsyncAPI contract must define these v2 subjects before
implementation:

Dataset:

- `eval.dataset.create`;
- `eval.dataset.items.append`;
- `eval.dataset.item.update`;
- `eval.dataset.version.get`;
- `eval.dataset.search`;
- `eval.dataset.health`;
- `eval.dataset.candidates.prepare`;
- `eval.dataset.candidates.search`;
- `eval.dataset.candidates.commit`;
- `eval.dataset.import.prepare`;
- `eval.dataset.import.commit`;
- `eval.dataset.export.start`;
- `eval.dataset.transfer.get`.

Evaluation:

- `eval.evaluation.create`;
- `eval.evaluation.update`;
- `eval.evaluation.search`;
- `eval.evaluation.run.start`;
- `eval.evaluation.run.cancel`;
- `eval.evaluation.run.pause`;
- `eval.evaluation.run.resume`;
- `eval.evaluation.run.search`;
- `eval.evaluation.run.get`;
- `eval.evaluation.comparison.create`;
- `eval.evaluation.comparison.search`;
- `eval.results.search`;
- `eval.results.persist`.

Targets and optimization:

- `eval.target.snapshot.create`;
- `eval.target.snapshot.get`;
- `eval.target.diff`;
- `eval.optimization.start`;
- `eval.optimization.search`;
- `eval.optimization.get`;
- `eval.target.promote`.

Live fanout:

- `eval.live.start`;
- `eval.live.stop`;
- `eval.live.events.*.*`.

Project settings:

- `control.ai_settings.get`;
- `control.ai_settings.update`.

Subject ownership:

- create/update/persist/promote/start/cancel/pause/resume commands go to
  storage-write or runner according to mutation/execution ownership;
- query/search/health/comparison reads go to storage-read;
- project settings go to control-plane.

## GraphQL Contract Inventory

The public GraphQL schema must expose v2 names:

Queries:

- `datasets`;
- `dataset`;
- `datasetVersion`;
- `datasetCandidates`;
- `datasetImport`;
- `datasetExport`;
- `evaluationDefinitions`;
- `evaluationDefinition`;
- `evaluationRuns`;
- `evaluationRun`;
- `evaluationComparison`;
- `optimizationRuns`;
- `optimizationRun`;
- `targetSnapshot`;

Mutations:

- `createDataset`;
- `appendDatasetItems`;
- `updateDatasetItems`;
- `promoteSpanToDatasetItem`;
- `prepareDatasetCandidates`;
- `commitDatasetCandidates`;
- `prepareDatasetImport`;
- `commitDatasetImport`;
- `startDatasetExport`;
- `createEvaluationDefinition`;
- `updateEvaluationDefinition`;
- `startEvaluationRun`;
- `cancelEvaluationRun`;
- `pauseEvaluationRun`;
- `resumeEvaluationRun`;
- `createEvaluationComparison`;
- `startOptimizationRun`;
- `promoteTargetSnapshot`.

Subscriptions:

- `liveEvaluationRun`.

Do not add new `createScorer`, `scorers`, `createExperiment`,
`experiments`, or `startExperimentRun` public fields for v2. Existing legacy
fields must either be removed before implementation or clearly wrapped to the
v2 entities in the same contract update.

## Implementation Readiness Rules

Before implementation starts, the approved machine-readable contracts must match
this domain spec:

- GraphQL SDL;
- AsyncAPI message subjects and payloads;
- entity JSON schemas;
- generated TypeScript UI contracts;
- generated Go message contracts;
- contract tests.

Implementation agents must not decide:

- field names;
- enum values;
- status transitions;
- retry/timeout behavior;
- digest inputs;
- metric payload schemas;
- retention TTLs;
- route-local navigation entries;
- service ownership.

If any of those are missing from contracts, stop and update specs/contracts
first.
