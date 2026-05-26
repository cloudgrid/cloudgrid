---
id: FLW-AIE-005
title: Dataset import and export
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
trigger:
  type: manual
  expression: Dataset import/export UI actions
orchestration: staged upload plus GraphQL request/reply
delivery_semantics: preview-before-commit with idempotent dataset version creation
terminal_failure: reject-import-or-expire-transfer
---

# Dataset Import And Export

## Import Flow

1. User opens AI Eval / Datasets and selects a dataset.
2. User chooses Import.
3. Frontend uploads JSONL, JSON array, CSV, ZIP, or Hugging Face-compatible file
   to the BFF upload endpoint.
4. BFF validates transfer safety and returns opaque `uploadId`.
5. Frontend collects mapping into v2 row fields: `input`, `expected`, optional
   `observedOutput`, optional `reason`, `split`, `curationStatus`, `metadata`,
   and source refs.
6. Frontend calls `prepareDatasetImport`.
7. Storage-write parses, maps, validates row values against dataset settings,
   and returns preview rows, warnings, and errors.
8. User confirms commit.
9. Storage-write creates item revisions and one dataset version.
10. Storage-read recomputes dataset health.

## Export Flow

1. User opens a dataset and chooses Export.
2. User selects dataset version, split filter, and format.
3. Frontend calls `startDatasetExport`.
4. Storage-read resolves permitted rows.
5. Storage-write or transfer adapter writes a temporary export artifact.
6. Frontend downloads through BFF byte-transfer endpoint.

## Rules

- BFF must not parse uploaded rows into dataset mutations.
- Import commit requires `expectedDatasetVersion`.
- Invalid rows block commit unless partial commit is explicitly selected.
- Exported rows use v2 fields and split values only.
- Hugging Face import/export is a mapping preset only.

## Verification

- Import preview validates JSON schemas before commit.
- Commit creates one new dataset version.
- Export does not include unselected splits.
- Transfer artifacts expire after configured TTL.
