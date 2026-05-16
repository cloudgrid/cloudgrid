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

Turn observed production or local failures into durable evaluation cases.

## Behavior

- Users can promote a trace or span into a reviewed or unreviewed
  `DatasetItem`.
- The dataset item stores input, expected output, metadata, source trace/span
  pointers, review status, split assignment, and annotations.
- If content capture is off, promotion can store metadata and source pointers, but cannot fabricate missing prompt or completion content.
- Annotation queue items are created by online scoring rules or by `Mutation.resolveAnnotation` when the user reopens or reassigns a review item.
- Storage-read owns annotation queue filtering and facets.
- Annotation resolution can create a new dataset item or update an existing item
  in a new dataset version. It must not mutate an immutable run manifest.

## Acceptance Criteria

- Given a source span with captured input and output content, promotion creates a dataset item with source pointers and user-provided expected output.
- Given missing content, promotion requires explicit user-supplied input before creating a dataset item.
- Given a resolved queue item, storage-write links it to the created dataset item and storage-read removes it from open queue results.
- Given a user assigns `holdout`, the item becomes unavailable to optimization
  manifests.
