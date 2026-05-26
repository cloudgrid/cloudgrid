---
id: CAP-AIE-009
title: Import and export datasets
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
depends_on: [CAP-AIE-007, FLW-AIE-005]
implements:
  api: [GQL-Mutation-prepareDatasetImport, GQL-Mutation-commitDatasetImport, GQL-Mutation-startDatasetExport, GQL-Query-datasetImport, GQL-Query-datasetExport]
---

# Import And Export Datasets

## Business Intent

Move examples into and out of CloudGrid while preserving the v2 dataset row
contract and preview-before-commit safety.

## Supported Formats

- `jsonl`: UTF-8 newline-delimited JSON objects.
- `json_array`: UTF-8 JSON array of objects.
- `csv`: UTF-8 CSV with a header row.
- `zip`: ZIP archive containing supported files.
- `huggingface_jsonl`: JSONL exported from Hugging Face `datasets`.
- `huggingface_csv`: CSV exported from Hugging Face `datasets`.

Hugging Face support is a mapping preset, not a separate internal data model.

## Canonical Row Mapping

Every import row maps to:

- `input`;
- `expected`;
- optional `observedOutput`;
- optional `reason`, default `""`;
- `split`: `training`, `validation`, or `test`;
- `curationStatus`: `draft`, `needs_expected`, `needs_review`, `ready`, or
  `rejected`;
- `metadata`;
- optional source refs.

Rows must validate against the selected dataset settings before commit.

## Upload Boundary

The BFF owns browser byte transfer only. It may validate content type, size,
checksum, archive safety, and authorization. It must not infer mappings, append
rows, compute health, or validate dataset schemas.

Storage-write owns prepare, parse, mapping validation, row validation, preview,
commit, and dataset version creation.

## Limits

- max upload size: 25 MiB compressed or raw;
- max decompressed ZIP total: 100 MiB;
- max files per ZIP: 25;
- max rows per import: 50,000;
- max preview rows returned through GraphQL: 100;
- upload and export artifact TTL: 24 hours.

## Export

Exports may produce:

- canonical CloudGrid JSONL;
- JSON array;
- CSV when values can be serialized;
- Hugging Face-compatible JSONL.

Export includes only selected dataset version rows and selected splits. It must
not silently include `test` rows when the user selected only training or
validation.

## Acceptance Criteria

- Uploaded files always go through prepare/preview/commit.
- Invalid rows block commit unless partial commit is explicitly selected.
- Commit creates one new dataset version.
- Exported Hugging Face-compatible rows include `input`, `expected`, `reason`,
  `split`, `metadata`, and optional `observedOutput`.
