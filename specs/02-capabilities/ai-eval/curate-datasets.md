---
id: CAP-AIE-007
title: Curate dataset versions and splits
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
depends_on: [CAP-AIE-005, FLW-AIE-004]
implements:
  api: [GQL-Mutation-appendDatasetItems, GQL-Mutation-promoteSpanToDatasetItem, GQL-Query-datasets]
---

# Curate Dataset Versions And Splits

## Business Intent

Turn production evidence and manual examples into reliable datasets for
optimization, validation, regression, and holdout confidence.

## Behavior

- Dataset items store input, expected output, metadata, source trace/span
  pointers, review status, and exactly one split.
- Dataset changes create versioned records according to the dataset versioning
  contract. A run manifest always references an immutable dataset version.
- Storage-read returns dataset health: reviewed counts, split coverage,
  duplicate candidates, leakage warnings, missing expected output, and schema
  validation status.
- Small-dataset mode is explicit and visible when fewer than 30 reviewed items
  exist.
- Synthetic items are allowed only when metadata marks them as synthetic.
  Synthetic-only datasets cannot become production-ready regression datasets.

## Acceptance Criteria

- Given a production failure trace, a user can promote it to a reviewed dataset
  item with source pointers.
- Given content capture is disabled, promotion requires user-supplied input or
  expected output before mutation succeeds.
- Given an item is assigned to `holdout`, optimization manifests cannot include
  it.
- Given fewer than 30 reviewed items, the dataset health view marks confidence
  low and the experiment scoreboard reports item counts visibly.
- Given an imported or manually entered duplicate, storage-read returns a
  duplicate warning and keeps duplicate semantics in storage-read.
