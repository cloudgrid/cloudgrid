---
id: CAP-AIE-005
title: Annotate traces into datasets
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
depends_on: [DOM-006, CAP-AIE-007]
implements:
  api: [GQL-Mutation-promoteSpanToDatasetItem]
---

# Annotate Traces Into Datasets

## Business Intent

Turn useful traces, spans, failed outputs, and edge cases into curated dataset
rows without inventing ground truth.

## Required Behavior

- Trace detail and trace overview expose `Add to dataset`.
- The picker lists only datasets whose `traceExtractionSettings` are compatible
  with the selected trace/span.
- Storage-write creates dataset rows or candidates using the v2 row model:
  `input`, `expected`, optional `observedOutput`, optional `reason`,
  `curationStatus`, `split`, source refs, and content treatment.
- If the observed output is trusted and validates, it may be copied into
  `expected`.
- If the observed output is wrong, incomplete, or untrusted, it is stored as
  `observedOutput`, and the row remains `needs_expected` or `needs_review`.
- Missing captured content requires explicit user-provided input or expected
  value before commit.
- Anonymization/PII policy runs before commit when configured.
- Commit creates a new item revision and dataset version.

## Acceptance Criteria

- A wrong production classification can be added with observed output preserved
  and corrected expected output supplied by the user.
- Rows imported from traces are not eligible for evaluation until `ready`.
- Source refs include trace ID and span ID when available.
- Assigning `test` makes the row unavailable to optimization candidate
  generation.
