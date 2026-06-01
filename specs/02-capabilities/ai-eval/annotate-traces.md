---
id: CAP-AIE-005
title: Annotate traces into datasets
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
depends_on: [DOM-006, CAP-AIE-007]
implements:
  api: [GQL-Mutation-prepareDatasetCandidates, GQL-Mutation-commitDatasetCandidates]
---

# Annotate Traces Into Datasets

## Business Intent

Turn useful traces, spans, failed outputs, and edge cases into curated dataset
rows without inventing ground truth.

## Required Behavior

- Trace detail and trace overview expose trace-to-dataset candidate preparation.
  The normal label is `Prepare dataset rows` or equivalent business wording.
- Trace detail uses the current trace ID automatically and includes the selected
  span ID when a span is selected. Trace overview uses selected trace rows or an
  explicit bounded current-filter preview. No normal UI asks the user to type a
  trace ID or span ID.
- The picker lists only datasets whose enabled trace intake rules match at least
  one selected trace/span, or offers an auto-match mode that groups results by
  dataset and rule after preview.
- Storage-read/storage-write prepare dataset candidates using the v2 row model:
  `input`, `expected`, optional `observedOutput`, optional `reason`,
  `curationStatus`, `split`, source refs, content treatment, validation issues,
  and duplicate hints.
- If the observed output is trusted and validates, it may be copied into
  `expected`.
- If the observed output is wrong, incomplete, or untrusted, it is stored as
  `observedOutput`, and the row remains `needs_expected` or `needs_review`.
- Missing captured content remains a candidate issue. The user must provide the
  missing AI input or expected AI result in candidate/row review before the row
  can be committed as `ready`.
- Anonymization/PII policy runs before commit when configured.
- Commit creates a new item revision and dataset version.

## Acceptance Criteria

- A wrong production classification can be added with observed output preserved
  and corrected expected output supplied by the user.
- Rows imported from traces are not eligible for evaluation until `ready`.
- Source refs include trace ID and span ID when available.
- Assigning `test` makes the row unavailable to optimization candidate
  generation.
- Trace detail and trace overview candidate preparation work without manual
  trace ID entry.
