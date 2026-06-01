---
id: CAP-AIE-007
title: Curate dataset versions and splits
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-29
provenance: from-user
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [DOM-006]
implements:
  api: [GQL-Mutation-createDataset, GQL-Mutation-appendDatasetItems, GQL-Mutation-updateDatasetItems, GQL-Mutation-prepareDatasetCandidates, GQL-Mutation-commitDatasetCandidates, GQL-Query-datasets]
---

# Curate Dataset Versions And Splits

## Business Intent

Let users build reliable, typed datasets with one configured row shape, stable
splits, optional reasons, and immutable versions that make later evaluations and
optimizations reproducible.

## Required Behavior

- A dataset defines exactly one row contract through `evaluationFamily`,
  `inputType`, `expectedType`, JSON schemas, default split, curation policy,
  trace intake rules, expected result options, anonymization policy, metric
  defaults, and retention profile.
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

- Trace intake is configured on the dataset, not during a trace-side action. Dataset
  settings expose trace intake rules that define service/span matching,
  extraction mappings, transforms, split/status defaults, and expected-value
  trust policy.
- Trace detail and trace overview expose candidate-preparation actions when AI
  Eval is enabled. Trace detail uses the current trace and selected span when a
  span is selected. Trace overview uses selected rows or an explicit bounded
  current-filter preview.
- The trace action label uses business wording such as `Prepare dataset rows`.
  It must not require the user to type a trace ID or span ID.
- Candidate preparation can target one dataset or auto-match multiple datasets.
  The preview groups candidates by dataset and trace intake rule.
- Trusted valid labels may prefill `expected`, but generated or untrusted
  values remain `needs_review`. Untrusted, wrong, or incomplete observed output
  is stored as `observedOutput` and the candidate is saved as `needs_expected`
  or `needs_review`.
- Default trace intake creates `DatasetCandidate` records. Committing candidates
  creates item revisions and a dataset version.
- No trace-imported row becomes evaluation-eligible until it is `ready`.

## Row Editing Controls

- Row editing uses controls derived from dataset settings and schemas. Text
  values use text areas, JSON values use the shared JSON editor, booleans use a
  binary control, numbers use numeric inputs when schema bounds are available,
  and closed expected result sets use select or multi-select controls.
- Classification datasets with allowed categories expose those categories as
  `expectedValueOptions` unless a JSON Schema enum is already authoritative.
- `Mark ready` and save actions must surface field-level validation and must not
  permit a ready row without valid input, expected result, split, and curation
  status.

## Acceptance Criteria

- A user can add a row by providing only input, expected output, and optionally
  reason.
- A JSON expected value that fails `expectedJsonSchema` is rejected by
  storage-write.
- Updating a ready row's expected value creates a new item revision and dataset
  version; older evaluation runs still render the old value.
- Optimization cannot select `test` rows.
- Trace candidate preparation from overview and trace detail never exposes
  manual trace ID entry.
- A trace/span without a matching enabled dataset intake rule is shown as
  unmatched in preview, not silently committed.
