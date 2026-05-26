---
id: CAP-AIE-007
title: Curate dataset versions and splits
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [DOM-006]
implements:
  api: [GQL-Mutation-createDataset, GQL-Mutation-appendDatasetItems, GQL-Mutation-updateDatasetItems, GQL-Mutation-promoteSpanToDatasetItem, GQL-Query-datasets]
---

# Curate Dataset Versions And Splits

## Business Intent

Let users build reliable, typed datasets with one configured row shape, stable
splits, optional reasons, and immutable versions that make later evaluations and
optimizations reproducible.

## Required Behavior

- A dataset defines exactly one row contract through `evaluationFamily`,
  `inputType`, `expectedType`, JSON schemas, default split, curation policy,
  trace extraction settings, anonymization policy, metric defaults, and
  retention profile.
- Rows use `input`, `expected`, optional `observedOutput`, `reason`,
  `curationStatus`, `curationNote`, `split`, source refs, content treatment,
  anonymization provenance, audit fields, and user metadata exactly as defined
  in `DOM-006`.
- `reason` defaults to `""`.
- `observedOutput` is provenance/debug evidence only. It is never ground truth
  and never replaces `expected` for scoring.
- Row statuses are exactly `draft`, `needs_expected`, `needs_review`, `ready`,
  and `rejected`.
- Splits are exactly `training`, `validation`, and `test`.
- A row is evaluation-eligible only when `curationStatus = ready`, input and
  expected validate, split is assigned, and the row revision belongs to the
  selected dataset version.
- Any behavior-affecting row edit creates a new `DatasetItemRevision`.
- Any item membership or behavior-affecting settings change creates a new
  `DatasetVersion`.
- Every mutation that updates an existing dataset must include
  `expectedDatasetVersion`. Stale writes fail with the AI Eval stale-version
  error code defined in `errors.yaml`.
- Storage-write owns authoritative validation, version creation, and digest
  calculation.
- Storage-read owns dataset search, row search, health summaries, filtering,
  sorting, counts, and facets.
- The frontend must not filter large dataset item sets locally.

## JSON Handling

- If `expectedType = json`, `expectedJsonSchema` is required.
- If `inputType = json`, `inputJsonSchema` is optional.
- When `inputJsonSchema` is absent, storage-write validates JSON syntax only and
  storage-read reports a dataset health warning.
- Users provide raw JSON text in the UI. Do not build a visual JSON builder for
  v2.

## Trace-To-Dataset Intake

- Trace detail and trace overview expose `Add to dataset`.
- The dataset picker lists only datasets with compatible
  `traceExtractionSettings`.
- Trusted valid observed output may be copied into `expected`.
- Untrusted, wrong, or incomplete observed output is stored as `observedOutput`
  and the row is saved as `needs_expected` or `needs_review`.
- No trace-imported row becomes evaluation-eligible until it is `ready`.

## Acceptance Criteria

- A user can add a row by providing only input, expected output, and optionally
  reason.
- A JSON expected value that fails `expectedJsonSchema` is rejected by
  storage-write.
- Updating a ready row's expected value creates a new item revision and dataset
  version; older evaluation runs still render the old value.
- Optimization cannot select `test` rows.
- A trace import into a dataset without compatible extraction settings is not
  offered in the picker.
