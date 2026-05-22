---
id: FLW-AIE-004
title: Dataset curation and split governance
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
trigger:
  type: manual
  expression: GraphQL dataset mutations and annotation queue actions
orchestration: sync for mutations, async for derived health checks
delivery_semantics: request/reply mutations with versioned dataset persistence
terminal_failure: reject-mutation-or-mark-health-warning
---

# Dataset Curation And Split Governance

## Purpose

Turn production traces and manually authored cases into trustworthy datasets
without allowing optimization and evaluation leakage.

## Preconditions

- A selected project exists.
- AI Eval is enabled for the project.
- The user has project `editor` or higher for dataset item edits.
- Project `admin` or company `admin` is required for dataset deletion or
  split-default changes.

## Dataset Split Semantics

Each dataset item belongs to exactly one split:

- `dev`: manual authoring, debugging, scorer calibration.
- `optimization`: prompt/skill optimization input.
- `validation`: candidate selection during iteration.
- `regression`: CI and release gate cases.
- `holdout`: hidden confidence set; optimizer and prompt search must not read
  it.

An experiment or optimization manifest records the exact split selector used.
Runner and harness requests must receive the resolved item set, not an
unvalidated raw split expression.

## Happy Path

1. User opens AI Eval / Datasets or an annotation item.
2. User creates or selects a dataset.
3. User adds items by one of:
   - promoting a trace/span;
   - resolving an annotation item;
   - manual entry;
   - committing reviewed dataset candidates;
  - importing a batch through `Mutation.appendDatasetItems` with
    `expectedDatasetVersion` and explicit item payloads;
   - importing JSONL, JSON array, CSV, or ZIP uploads through
     `FLW-AIE-005`.
4. Storage-write creates a new dataset version or appends to a mutable draft
   version according to the dataset versioning contract.
5. Storage-read computes dataset health: split counts, reviewed counts,
   duplicate candidates, source trace coverage, leakage warnings, missing
   expected values, schema validation status, oversized/token-limit items,
   invalid target shapes, flaky item markers, anonymization coverage, and
   production-segment coverage gaps.
6. User searches, filters, sorts, pages, or infinite-scrolls dataset items
   through storage-read cursors. The frontend must not load all items to compute
   counts, facets, duplicates, leakage, or health.
7. User reviews items, edits expected output, edits metadata, removes items,
   assigns split, marks reviewed, or marks items rejected.
8. Dataset becomes selectable for experiments when it has at least one reviewed
   item in a permitted split.

## Small-Dataset Mode

When a dataset has fewer than 30 reviewed items:

- the UI labels confidence as low;
- optimization may use `optimization` and `validation` only;
- holdout remains hidden and cannot be optimizer input;
- scorer calibration warns when fewer than 5 reviewed examples exist;
- release gates must report the exact reviewed item count.

Synthetic items may be added only when their metadata includes
`sourceKind = "synthetic"`. Synthetic-only datasets cannot be marked production
ready.

## Failure Paths

- Missing captured content: mutation requires explicit user-provided input or
  expected output and returns `ERR-001` if absent.
- Split leakage: storage-read marks dataset health warning; runner rejects
  optimization manifests that include `holdout`.
- Duplicate item: storage-read reports duplicate candidates; duplicate is a
  warning, not an automatic rejection.
- Oversized item: storage-read or runner marks token-limit failures as
  `needs_review` or `quarantined`; the item is excluded from future runs when
  policy requires quarantine.
- Invalid item shape: storage-read marks schema or target-shape issues and the
  runner skips the item before harness execution.
- Repeated technical item failure: item is marked flaky or quarantined and does
  not count as a model-quality regression.
- Realistic anonymization failure: candidate commit fails with `ERR-001` unless
  policy permits fallback to redaction.
- Import mapping error: import preview records row-level issues and commit
  rejects invalid rows according to `FLW-AIE-005`.
- Stale dataset version: mutation fails with `ERR-001`.
- Unauthorized edit: mutation fails with `ERR-016`.

## Signals

Required logs:

- dataset item created;
- dataset item reviewed;
- split changed;
- dataset version finalized;
- dataset health check failed.

Logs must include `project_id`, `dataset_id`, and `dataset_version`, but not raw
prompt, completion, tool parameter, or retrieved document content.

## Verification

Required tests:

- trace promotion preserves source trace/span pointers;
- missing content requires explicit user input;
- every item has exactly one split;
- holdout cannot be used for optimization;
- small-dataset mode marks confidence low;
- stale version update fails;
- duplicate detection returns warning data from storage-read, not frontend code.
- manual add/edit/remove creates a new dataset version and preserves historical
  manifests;
- dataset item search uses cursor pagination and storage-read facets;
- oversized, invalid, and repeatedly failing items are separated from
  model-quality failures;
- realistic anonymization records policy provenance and never stores original
  sensitive values in dataset items.
