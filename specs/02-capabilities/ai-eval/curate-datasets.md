---
id: CAP-AIE-007
title: Curate dataset versions and splits
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-22
provenance: from-user
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [CAP-AIE-005, CAP-AIE-009, FLW-AIE-004]
implements:
  api: [GQL-Mutation-appendDatasetItems, GQL-Mutation-promoteSpanToDatasetItem, GQL-Mutation-prepareDatasetImport, GQL-Mutation-commitDatasetImport, GQL-Mutation-startDatasetExport, GQL-Query-datasets]
---

# Curate Dataset Versions And Splits

## Business Intent

Turn production evidence and manual examples into reliable datasets for
optimization, validation, regression, and holdout confidence.

## Behavior

- Dataset items store input, expected output, metadata, source trace/span
  pointers, review status, target shape, content treatment, anonymization
  provenance, and exactly one split.
- Dataset changes create versioned records according to the dataset versioning
  contract. A run manifest always references an immutable dataset version.
- Users can manually add, edit, remove, review, reject, assign splits, and
  update metadata for dataset items. Each mutation requires
  `expectedDatasetVersion` and creates a new version or draft mutation according
  to the dataset versioning contract. Removing an item hides it from later
  versions but never mutates historical run manifests.
- Dataset item search supports cursor pagination/infinite scrolling, query text
  over safe indexed fields, split, review status, source pointers, tags,
  metadata text, target shape, content treatment, duplicate status, synthetic
  flag, validation status, and quarantine/review status. Storage-read owns
  filtering, sorting, counts, and bounded facets.
- Storage-read returns dataset health: reviewed counts, split coverage,
  duplicate candidates, leakage warnings, missing expected output, and schema
  validation status, oversized/token-limit items, invalid target shapes, flaky
  item markers, anonymization coverage, and production-segment coverage gaps.
- Small-dataset mode is explicit and visible when fewer than 30 reviewed items
  exist.
- Synthetic items are allowed only when metadata marks them as synthetic.
  Synthetic-only datasets cannot become production-ready regression datasets.
- Dataset candidates can be prepared from failed production measurements,
  failed offline item runs, selected traces/spans, failure clusters, coverage
  gaps, and dataset health issues. Candidates are not dataset items until a user
  explicitly commits them.
- Realistic anonymization may run before candidate commit, trace promotion
  commit, manual pasted-content commit, or import commit. It replaces sensitive
  values with safe fake values while preserving realistic structure, locale,
  format, and repeated-reference consistency. The committed item records
  `contentTreatment = realistic_anonymized`, policy ID, policy version, and
  transformed field metadata.
- Dataset import supports JSONL, JSON array, CSV, and ZIP uploads through the
  preview-before-commit flow in `FLW-AIE-005`.
- Dataset export supports canonical JSONL, JSON array, and CSV output. Export
  output uses CloudGrid normalized dataset item fields, not the original upload
  shape.

## Dataset Item Shape Contract

The machine-readable target-shape contract is
`specs/03-contracts/entities/ai/dataset-item-shape.schema.json`. Dataset items
must use one of the approved shapes:

| Shape | Use Case | Required Input | Expected Data |
| --- | --- | --- | --- |
| `single_turn` | Simple prompt/completion or single LLM call. | `prompt` and optional variables. | `answer`, JSON value, and/or expected facts. |
| `conversation` | Multi-message chat without required tool assertions. | Ordered messages. | Final answer and/or expected facts. |
| `tool_call` | One or more expected tool calls. | Ordered messages. | Required, forbidden, or optional tool calls with argument expectations. |
| `agent_trajectory` | Agent loop with tools, retries, or handoffs. | Ordered messages. | Required/forbidden steps, max tool calls, max loops, final answer. |
| `workflow_trace` | Multi-agent or workflow execution. | Workflow ref and request object. | Required/forbidden workflow steps, expected output, terminal status. |
| `retrieval_case` | RAG or retrieval-augmented answer. | Query and optional context refs. | Expected facts plus required/forbidden document refs. |
| `production_trace_ref` | Bounded reference to production evidence. | Trace id and optional span/agent run id. | Optional expected fields supplied by user/candidate review. |

The legacy `input` and `expected` fields remain GraphQL view-model fields for
table rendering and import/export compatibility. Storage-write must normalize
new and edited items into the shape contract and keep `targetShape` equal to the
payload `shape`. Implementers must not invent additional target shapes or
shape-specific fields outside the schema.

Expected facts distinguish `primary` facts, which determine answer completeness,
from `secondary` facts, which improve richness but do not block a minimal
correct answer unless the scorer definition says so.

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
- Given an uploaded dataset file, a user must preview mapping validation before
  committing rows to a dataset version.
- Given a user removes a dataset item, the next dataset version excludes that
  item and existing experiment manifests remain replayable.
- Given a dataset has thousands of items, the UI can page or infinite-scroll
  item results through storage-read cursors without loading all items.
- Given a production trace contains a name, email, phone number, credit card, or
  address and realistic anonymization is enabled, the candidate commit replaces
  those values with safe fake values and records anonymization provenance without
  storing original values in the dataset item.
- Given an item repeatedly fails because of token limits, invalid JSON, or
  unsupported target shape, storage-read marks it for review or quarantine and
  experiment scoreboards separate item-quality issues from model-quality
  regressions.
