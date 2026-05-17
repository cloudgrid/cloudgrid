---
id: TEC-BE-025
title: AI evaluation dataset import and export transfer
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, TEC-BE-001, TEC-BE-016, CAP-AIE-009]
---

# AI Evaluation Dataset Import And Export Transfer

## Purpose

Dataset import/export needs binary file transfer without turning CloudGrid into
a REST AI-eval API. The BFF owns browser upload/download transport. Dataset
semantics remain behind GraphQL and private message bridge subjects.

## Public HTTP Transfer Endpoints

- `POST /api/ai-eval/dataset-imports/uploads`
- `GET /api/ai-eval/dataset-exports/{exportId}/download`

These endpoints exist only for file bytes. They are not public dataset mutation
APIs. All import/export state transitions use GraphQL.

## Private Message Subjects

- `eval.dataset.import.prepare`: validate staged upload, parser format,
  mapping, defaults, and return preview job.
- `eval.dataset.import.commit`: append valid preview rows to a dataset version.
- `eval.dataset.export.start`: prepare canonical export artifact.
- `eval.dataset.transfer.get`: return import/export job state for GraphQL
  queries.

## Staging Store

The dataset transfer staging store is a private temporary blob store. Local MVP
uses a filesystem directory shared by the BFF and the storage service handling
import/export. Deployed mode may replace it with an object store only after a
separate storage configuration spec is approved.

Staging records contain:

- `uploadId` or `exportId`;
- `projectId`;
- owner user ID;
- original filename;
- size bytes;
- SHA-256 digest;
- detected format;
- contained file list for ZIP uploads;
- created time;
- expiry time.

Staging artifacts expire after 24 hours by default. Expired artifacts must not
be committed or downloaded.

## Service Responsibilities

### TypeScript BFF

- Authenticates upload/download requests.
- Enforces project read/edit authorization.
- Enforces HTTP size and content-type limits.
- Computes SHA-256 and stores bytes in the staging store.
- Performs ZIP safety checks that are required before writing staged files.
- Validates GraphQL inputs, calls NATS subjects, validates replies, and maps
  errors.
- Streams export bytes only after storage services report the export is ready.

BFF must not normalize dataset rows, infer mappings, append dataset items,
compute duplicate/leakage/health signals, or write SurrealDB.

### Storage-Write

- Owns import preview job creation.
- Owns row normalization from staged files plus mapping.
- Owns row-level validation and import commit.
- Appends dataset items and creates new dataset versions.
- Persists import job status, counts, warnings, and commit result.

### Storage-Read

- Serves dataset import/export job read models.
- Computes dataset health after commit.
- Resolves export item sets according to dataset version, split, review status,
  authorization, and holdout visibility rules.

## Parser Rules

CSV:

- UTF-8 only.
- First row is header.
- Duplicate header names are invalid.
- Empty cells map to null unless `defaultValue` is present.

JSONL:

- UTF-8 only.
- One JSON object per non-empty line.
- Non-object lines are row errors.

JSON array:

- UTF-8 only.
- Top-level value must be an array.
- Every array element must be an object.

ZIP:

- Contains only `.jsonl`, `.json`, and `.csv` files.
- Files are processed in lexicographic path order.
- Paths and row numbers are included in preview issues.

## Mapping Rules

The storage-write import parser applies mappings in this order:

1. Start with defaults.
2. Apply `input`, `expected`, and `metadata` field mappings.
3. Apply scalar mappings for source pointers, split, and review status.
4. Validate canonical item shape.
5. Produce preview row with item or row issues.

When a source value is missing:

- use `defaultValue` when present;
- otherwise leave the target path absent;
- fail the row if the required canonical `input` object is missing or empty.

## Security And Privacy

- Upload and export artifacts are project-scoped and user-authorized.
- Raw file contents must not be logged.
- Archive extraction must never write outside the staging directory.
- Export download URLs are same-origin relative paths, not bearer-token URLs.
- Export artifacts must omit fields the caller is not authorized to read.

## Verification

Required implementation checks:

- BFF upload endpoint does not import SurrealDB or storage adapters.
- Storage-write import parser rejects unsupported formats and unsafe ZIPs.
- Storage-write preview is deterministic for the same upload, mapping, and
  defaults.
- Storage-write commit is idempotent by `importId` and target dataset version.
- Storage-read export item resolution respects split filters and authorization.
- Download endpoint returns only ready export artifacts owned by the selected
  project.
