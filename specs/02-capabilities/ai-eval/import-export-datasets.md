---
id: CAP-AIE-009
title: Import and export datasets
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [CAP-AIE-007, FLW-AIE-005, TEC-BE-025]
implements:
  api: [GQL-Mutation-prepareDatasetImport, GQL-Mutation-commitDatasetImport, GQL-Mutation-startDatasetExport, GQL-Query-datasetImport, GQL-Query-datasetExport]
---

# Import And Export Datasets

## Business Intent

Let users move existing evaluation examples into and out of CloudGrid without
requiring one fixed source data shape. The user can upload JSONL, JSON array,
CSV, or a ZIP archive containing those files, map source fields into the
canonical `DatasetItem` shape, preview validation results, and then append valid
items to a dataset version.

## Supported Formats

V1 supports exactly:

- `jsonl`: UTF-8 newline-delimited JSON objects.
- `json_array`: UTF-8 JSON array of objects.
- `csv`: UTF-8 CSV with a header row.
- `zip`: ZIP archive containing one or more `.jsonl`, `.json`, or `.csv` files.

ZIP archives must not contain nested ZIP files, absolute paths, parent-directory
paths, symlinks, executables, hidden system files, or files larger than the
single-file import limit after decompression.

## Canonical Item Shape

Every import row normalizes to:

```json
{
  "input": {},
  "expected": null,
  "metadata": {},
  "sourceTraceId": null,
  "sourceSpanId": null,
  "split": "dev",
  "reviewStatus": "unreviewed",
  "synthetic": false
}
```

`input` is required and must be an object after mapping. `expected` may be any
JSON value or absent. `metadata` must be an object. `split` and `reviewStatus`
must be valid enum values.

## Mapping Semantics

The mapping language is declarative and contains no user-supplied code.

Mapping sources:

- `column`: CSV header name.
- `jsonPath`: limited JSON path for JSONL/JSON array rows.
- `constant`: fixed JSON value.
- `defaultValue`: fixed JSON value used when the source is missing or null.

Mapping targets:

- `input.<path>`
- `expected.<path>` or scalar `expected`
- `metadata.<path>`
- `sourceTraceId`
- `sourceSpanId`
- `split`
- `reviewStatus`

Allowed JSON path subset:

- `$` for the row object.
- dot property access, such as `$.messages`.
- bracket string property access, such as `$["prompt.text"]`.
- integer array indexes, such as `$.messages[0].content`.

Wildcards, filters, recursive descent, functions, arithmetic, string
templates, JavaScript, Python, SQL, regex replacements, and shell expressions
are not supported in v1.

## Upload And Transfer Boundary

The TypeScript BFF owns browser file transfer only:

- `POST /api/ai-eval/dataset-imports/uploads` stages a file and returns an
  opaque `uploadId`.
- `GET /api/ai-eval/dataset-exports/{exportId}/download` streams a prepared
  export artifact.

The BFF may validate content type, size, checksum, archive safety, and user
authorization. It must not append dataset items, infer mappings, compute
dataset health, deduplicate rows, or evaluate split leakage.

Import preview, normalization, validation, commit, and export creation are
GraphQL operations backed by private message bridge subjects.

## Behavior

- User uploads a file or ZIP through the BFF upload endpoint.
- User selects format and mapping in the dataset import UI.
- `Mutation.prepareDatasetImport` validates the upload, mapping, defaults, row
  limits, and row-level normalization, then returns a preview job.
- Preview rows include normalized item previews, warnings, and errors.
- `Mutation.commitDatasetImport` appends rows only after user confirmation.
- Partial commit is allowed only when `allowPartialCommit=true` and commit mode
  is `valid_rows_only`.
- `Mutation.startDatasetExport` prepares a normalized export and returns a job
  with a download URL when ready.
- Export output is canonical CloudGrid dataset-item data, not the original
  uploaded source format.

## Limits

V1 default limits:

- max upload size: 25 MiB compressed or raw;
- max decompressed ZIP total: 100 MiB;
- max files per ZIP: 25;
- max rows per import: 50,000;
- max preview rows returned through GraphQL: 100;
- upload and export artifact TTL: 24 hours.

Implementation may make these limits configurable only through typed runtime
configuration and must keep the defaults above.

## Acceptance Criteria

- Given a JSONL file and valid mapping, preview returns normalized dataset item
  previews and commit appends them to a new dataset version.
- Given a CSV file, users can map columns into nested `input`, `expected`, and
  `metadata` paths.
- Given a ZIP with multiple supported files, preview reports each source file
  path and row numbers.
- Given an unsupported file inside a ZIP, preview fails with row/file issues and
  does not silently ignore it.
- Given any row fails validation and partial commit is not enabled, commit
  fails without appending rows.
- Given partial commit is enabled, commit appends valid rows and reports skipped
  invalid row counts.
- Given an export is started, the download artifact contains canonical dataset
  item fields and does not include hidden holdout items unless the user has
  permission to read the selected split.
