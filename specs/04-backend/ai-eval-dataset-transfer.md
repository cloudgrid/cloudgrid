---
id: TEC-BE-032
title: AI evaluation dataset import and export transfer
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [DOM-006, TEC-BE-001, TEC-BE-016, CAP-AIE-009]
---

# AI Evaluation Dataset Import And Export Transfer

## Purpose

Dataset import/export needs byte transfer without creating a public REST dataset
API. BFF owns upload/download transport. Storage services own dataset semantics.

## Public HTTP Transfer Endpoints

- `POST /api/ai-eval/dataset-imports/uploads`
- `GET /api/ai-eval/dataset-exports/{exportId}/download`

These endpoints transfer bytes only. All import/export state transitions use
GraphQL and message bridge subjects.

## Responsibilities

BFF:

- authenticates upload/download;
- enforces authorization, content type, size, checksum, and archive safety;
- stages bytes under opaque upload IDs;
- streams prepared export bytes;
- never parses rows into dataset mutations.

Storage-write:

- parses staged files;
- applies mappings;
- validates v2 row fields and dataset schemas;
- creates import preview jobs;
- commits item revisions and dataset versions;
- persists import/export job status.

Storage-read:

- serves import/export job read models;
- resolves export item sets by dataset version and selected splits;
- computes health after import commit.

## Mapping Targets

Allowed import mapping targets are:

- `input`;
- `expected`;
- `observedOutput`;
- `reason`;
- `metadata.<path>`;
- `sourceRefs`;
- `split`;
- `curationStatus`.

Legacy `reviewStatus`, `targetShape`, `dev`, `optimization`, `regression`, and
`holdout` are not valid v2 transfer fields.

## Transfer Limits

- max upload size: 25 MiB compressed or raw;
- max decompressed ZIP total: 100 MiB;
- max files per ZIP: 25;
- max rows per import: 50,000;
- max preview rows returned through GraphQL: 100;
- upload/export artifact TTL: 24 hours.
