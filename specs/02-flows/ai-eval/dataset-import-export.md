---
id: FLW-AIE-005
title: Dataset import and export
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
trigger:
  type: manual
  expression: Dataset import/export UI actions
orchestration: staged upload plus GraphQL request/reply
delivery_semantics: preview-before-commit with idempotent dataset append
terminal_failure: reject-import-or-expire-transfer
---

# Dataset Import And Export

## Preconditions

- A selected project exists.
- AI Eval is enabled for the project.
- The user has project `editor` or higher to import items.
- The user has selected-project read access to export dataset items.
- The target dataset exists for imports.

## Import Happy Path

1. User opens AI Eval / Datasets and selects a dataset.
2. User chooses Import.
3. Frontend uploads `.jsonl`, `.json`, `.csv`, or `.zip` to
   `POST /api/ai-eval/dataset-imports/uploads`.
4. BFF authenticates the user, validates project access, enforces upload
   limits, computes SHA-256, stages bytes, and returns `uploadId`.
5. Frontend shows detected files and asks the user to select mapping fields.
6. User defines mapping from source columns/JSON paths/constants/defaults into
   the canonical dataset item shape.
7. Frontend calls `Mutation.prepareDatasetImport`.
8. BFF validates GraphQL input and calls `eval.dataset.import.prepare`.
9. Storage-write validates upload reference, parser format, mapping, defaults,
   row limits, split/review enums, and normalized row shape.
10. Storage-write creates an import preview job without appending dataset items.
11. Frontend renders preview rows, row errors, warnings, valid count, error
    count, and source file paths.
12. User confirms commit.
13. Frontend calls `Mutation.commitDatasetImport`.
14. BFF calls `eval.dataset.import.commit`.
15. Storage-write appends valid normalized items, creates a new dataset version,
    records skipped invalid row counts when partial commit is enabled, and
    expires the import job.
16. Storage-read recomputes dataset health and duplicate/leakage warnings for
    the new dataset version.

## Export Happy Path

1. User opens a dataset and chooses Export.
2. User selects format: `jsonl`, `json_array`, or `csv`.
3. User optionally filters by split and review status.
4. Frontend calls `Mutation.startDatasetExport`.
5. BFF calls `eval.dataset.export.start`.
6. Storage-read resolves the selected dataset version and permitted items.
7. Storage-write or the dataset transfer adapter writes a temporary export
   artifact with canonical fields and returns an export job.
8. Frontend polls `Query.datasetExport` or receives refreshed query data.
9. When ready, frontend downloads through
   `GET /api/ai-eval/dataset-exports/{exportId}/download`.

## BFF File Transfer Rules

BFF may:

- accept browser multipart upload;
- reject files by MIME type, extension, size, authentication, authorization, or
  archive safety;
- stage upload bytes under an opaque `uploadId`;
- stream prepared export bytes by `exportId`;
- delete expired upload/export artifacts.

BFF must not:

- infer or auto-create mappings;
- normalize rows into `DatasetItem`;
- compute dataset health, duplicates, leakage, or scorer calibration;
- append dataset items;
- expose file contents in logs;
- store transfer artifacts beyond the configured TTL.

## ZIP Rules

ZIP handling is deterministic:

- process files in lexicographic path order;
- reject nested archives;
- reject absolute paths and `..` path segments;
- reject symlinks and executable entries;
- ignore directory entries;
- reject unsupported file extensions;
- reject archives exceeding file count or decompressed-size limits;
- preserve source file path and one-based row number in preview issues.

## Import Validation

Prepare fails with `ERR-001` when:

- upload is expired or not owned by the selected project;
- format is unsupported;
- ZIP contains unsupported or unsafe entries;
- CSV has no header row;
- JSONL line is not a JSON object;
- JSON array element is not an object;
- mapping has no `input` target;
- mapping target paths are invalid or collide;
- mapping uses unsupported JSON path syntax;
- mapped `input` is not an object;
- mapped `metadata` is not an object;
- split or review status is invalid;
- row count or file size exceeds limits.

Commit fails with `ERR-001` when:

- import preview is expired;
- target dataset version changed and `expectedDatasetVersion` is stale;
- preview has row errors and partial commit is not enabled;
- commit mode conflicts with preview defaults.

Unauthorized upload, preview, commit, or export fails with `ERR-016`.

## Export Contract

Export files use canonical field names:

- `input`
- `expected`
- `metadata`
- `sourceTraceId`
- `sourceSpanId`
- `split`
- `reviewStatus`
- `synthetic`

JSONL emits one object per line. JSON array emits an array of those objects.
CSV emits headers with JSON-stringified values for `input`, `expected`, and
`metadata`.

## Verification

Required tests:

- JSONL preview and commit;
- JSON array preview and commit;
- CSV column mapping into nested fields;
- ZIP with multiple supported files;
- ZIP rejects unsafe paths and unsupported entries;
- invalid rows block commit unless partial commit is enabled;
- export JSONL, JSON array, and CSV contain canonical fields;
- BFF upload/download endpoints perform transfer only and call no storage
  adapters directly.
