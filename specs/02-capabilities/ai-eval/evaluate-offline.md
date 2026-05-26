---
id: CAP-AIE-003
title: Evaluate offline datasets
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-006, CAP-AIE-007]
implements:
  api: [GQL-Mutation-startEvaluationRun, GQL-Subscription-liveEvaluationRun, MSG-eval-evaluation-run-start]
---

# Evaluate Offline Datasets

## Business Intent

Run a dataset version against a target, produce metric results and trajectory
evidence, and make comparisons reproducible.

## Required Behavior

- Users create `EvaluationDefinition`, not `Experiment`.
- A run resolves dataset version, selected item revisions, target snapshot,
  metric settings, run policy, and retention role before execution.
- Runner creates an `EvaluationRun` and one `EvaluationItemRun` per selected
  item revision.
- Every item run is trace-backed, including simple classification and
  extraction.
- Runner persists item runs, metric results, summaries, and problems only
  through storage-write.
- Storage-read returns aggregate metrics, comparisons, run detail view models,
  and live run fanout.
- BFF validates GraphQL input, sends message bridge commands, validates replies,
  and maps errors. BFF does not compute metrics or aggregates.
- Run statuses and item-run fields are exactly those in `DOM-006`.
- Dataset validation errors, invalid actual output, adapter failure, timeout,
  missing evidence, provider failure, and content redaction are metric/item-run
  problems. They are not silently counted as quality failures unless the metric
  capability explicitly defines that behavior.
- Full traces remain in telemetry storage. Evaluation records keep refs,
  bounded summaries, capped important-step previews, metric results, and
  digests.

## Target Execution

- `prompt` targets execute through the CloudGrid harness/runtime abstraction.
- `external_adapter` targets execute through the adapter protocol in `DOM-006`.
- `expected` is never sent to external adapters by default.

## Acceptance Criteria

- Starting a run against a pinned dataset version keeps using that version after
  later dataset edits.
- A completed run contains aggregate metrics and per-item metric results.
- A failed adapter call creates item-run problems and metric problems without
  requiring frontend special cases.
- Repeated cancel/pause/resume commands are idempotent.
- Live run updates are delivered through storage-read fanout, not runner-to-BFF
  direct subscriptions.
