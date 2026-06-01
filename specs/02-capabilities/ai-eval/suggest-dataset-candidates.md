---
id: CAP-AIE-010
title: Suggest and prepare dataset candidates
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-29
provenance: from-user
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-006, CAP-AIE-005, CAP-AIE-007]
implements:
  api: [GQL-Query-datasetCandidates, GQL-Mutation-prepareDatasetCandidates, GQL-Mutation-commitDatasetCandidates]
---

# Suggest And Prepare Dataset Candidates

## Business Intent

Turn traces, failed evaluation item runs, coverage gaps, and dataset health
issues into reviewable dataset improvements without automatically changing
ground truth.

## Required Behavior

- Dataset candidates are review records, not dataset rows.
- Candidates do not affect any dataset version until explicit commit.
- Candidate sources include selected traces/spans, failed evaluation item runs,
  repeated failure clusters, duplicate/leakage warnings, coverage gaps,
  oversized items, invalid schema issues, missing expected output, and manual
  user selection.
- Selected trace/span sources are resolved from UI selection context, trace
  detail context, or an explicit bounded current-filter query. Normal candidate
  preparation forms must not expose raw trace ID or span ID inputs.
- Trace-derived candidate preparation applies enabled dataset trace intake rules.
  It can target one dataset or auto-match multiple datasets and returns grouped
  preview records by dataset and rule.
- Storage-read owns candidate search, clustering inputs, coverage-gap
  computation, trace/span evidence extraction, rule matching, and bounded
  evidence preview view models.
- Storage-write owns candidate persistence, status transitions, commit, and
  dataset version changes.
- Candidate commit requires `expectedDatasetVersion`, target dataset ID,
  corrected expected value when needed, split, curation status, and explicit
  user confirmation.
- Generated or suggested expected output must be marked `needs_review`; it must
  not become `ready` without human or trusted program review.
- Auto-commit is not allowed.
- Candidate prepare is idempotent by `idempotencyKey` and must not create
  duplicate active candidates for the same dataset, rule, trace ID, span ID, and
  extracted input digest.

## Candidate States

- `suggested`;
- `reviewing`;
- `ready`;
- `committed`;
- `dismissed`;
- `superseded`.

## Acceptance Criteria

- A failed evaluation item can become a candidate with actual output stored as
  `observedOutput`.
- A candidate missing corrected expected output cannot be committed as `ready`.
- Commit creates a new dataset version and records source candidate IDs.
- Sensitive content is anonymized or redacted before candidate commit when
  dataset policy requires it.
- A selected trace batch can produce candidates for more than one dataset and
  shows unmatched traces/spans before commit.
