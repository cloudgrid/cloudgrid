---
id: CAP-AIE-005
title: Annotate traces into datasets
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
depends_on: [CAP-AIE-001, CAP-AIE-007]
implements:
  api: [GQL-Mutation-promoteSpanToDatasetItem, GQL-Query-annotationQueue]
---

# Annotate Traces Into Datasets

## Business Intent

Turn observed production or local failures into durable evaluation cases and
reviewable dataset candidates.

## Behavior

- Users can promote a trace or span into a reviewed or unreviewed
  `DatasetItem`.
- The dataset item stores input, expected output, metadata, source trace/span
  pointers, review status, split assignment, target shape, content treatment,
  anonymization provenance, and annotations.
- If content capture is off, promotion can store metadata and source pointers, but cannot fabricate missing prompt or completion content.
- Promotion may first create a `DatasetCandidate` rather than a committed
  `DatasetItem` when project policy requires review, realistic anonymization,
  clustering, or expected-output authoring.
- Realistic anonymization replaces sensitive values with safe fake values before
  candidate commit when enabled. It must preserve useful semantics and
  repeated-reference consistency while recording policy provenance.
- Annotation queue items are created by online scoring rules or by `Mutation.resolveAnnotation` when the user reopens or reassigns a review item.
- Storage-read owns annotation queue filtering and facets.
- Annotation resolution can create a new dataset item or update an existing item
  in a new dataset version. It must not mutate an immutable run manifest.

## Acceptance Criteria

- Given a source span with captured input and output content, promotion creates a dataset item with source pointers and user-provided expected output.
- Given missing content, promotion requires explicit user-supplied input before creating a dataset item.
- Given project policy requires candidate review, promotion creates a
  `DatasetCandidate` and waits for explicit commit before changing the dataset
  version.
- Given realistic anonymization is enabled, committed dataset content contains
  safe fake names, emails, payment values, phone numbers, addresses, URLs, and
  other detected sensitive fields, not the original sensitive values.
- Given a resolved queue item, storage-write links it to the created dataset item and storage-read removes it from open queue results.
- Given a user assigns `holdout`, the item becomes unavailable to optimization
  manifests.
