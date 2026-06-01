---
id: FLW-AIE-004
title: Dataset curation and split governance
domain: ai-eval
layer: flow
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-29
provenance: from-user
trigger:
  type: manual
  expression: GraphQL dataset mutations and trace intake actions
orchestration: sync for mutations, async for derived health checks
delivery_semantics: request/reply mutations with immutable dataset versions
terminal_failure: reject-mutation-or-mark-health-warning
---

# Dataset Curation And Split Governance

## Purpose

Create trustworthy datasets without split leakage or mutable historical
evidence.

## Flow

1. User opens AI Eval / Datasets or selects `Prepare dataset rows` from trace
   detail, selected spans, selected traces, or a bounded trace-overview filter.
2. User creates or selects a dataset.
3. User adds rows through manual entry, trace-derived candidate commit, import
   commit, or candidate commit from evaluation/health issues.
4. Storage-write validates input/expected types, JSON schemas, curation status,
   split, content treatment, and source refs.
5. Storage-write creates item revisions and a dataset version.
6. Storage-read computes health: curation counts, split counts, schema validity,
   missing expected values, duplicate/leakage warnings, anonymization coverage,
   trace intake rule coverage, unmatched trace evidence summaries, and
   input-schema quality warnings.
7. User edits rows, reasons, curation status, split, or metadata through
   versioned mutations with `expectedDatasetVersion`.
8. Dataset becomes selectable for evaluation when at least one row is `ready` in
   the selected split.

## Split Rules

Splits are exactly `training`, `validation`, and `test`.

- `training`: optimization input and candidate generation.
- `validation`: candidate validation and normal development comparison.
- `test`: final confidence only.

Optimizers and prompt search must not read `test`.

## Failure Rules

- Stale dataset version rejects the mutation.
- Invalid JSON or schema mismatch rejects the row mutation/import commit.
- Missing expected value stores row as `needs_expected`, not `ready`.
- Trace candidate preparation without matching enabled intake rules shows an
  unmatched preview and does not create rows.
- Manual trace ID or span ID entry is not part of the normal UI.
- Duplicate rows are health warnings, not automatic rejection.
- Content policy/anonymization failure rejects commit unless policy allows
  redaction fallback.

## Verification

- Every row has exactly one split.
- Every ready row validates input and expected value.
- Every behavior-affecting edit creates a new item revision and dataset version.
- Historical evaluation runs keep rendering their original dataset version.
- `test` rows cannot be selected for optimization candidate generation.
