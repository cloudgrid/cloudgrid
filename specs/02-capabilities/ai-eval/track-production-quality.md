---
id: CAP-AIE-008
title: Track production agent quality
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
traits:
  interaction: message
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [CAP-AIE-002, CAP-AIE-006]
implements:
  api: [GQL-Query-aiQualityOverview, MSG-ai-persisted-projections, MSG-eval-results-persist]
---

# Track Production Agent Quality

## Business Intent

Continuously measure production agent quality from deterministic online scoring
results using project-scoped online evaluation policies. Latency, cost,
tool-behavior, retrieval-quality, and judge-backed quality signals remain
visible when produced by existing telemetry or offline eval workflows, but v1
online scoring does not execute non-deterministic scorers.

## Behavior

- Online evaluation policies select production segments by agent, environment,
  route, service, tool, retrieval source, model, trace attributes, and project.
- Runner evaluates only matched sampled projections after budget and concurrency
  checks pass.
- Storage-write persists `EvalResult` records and bounded skipped-result
  summaries. It does not persist annotation queue records from the online
  scoring notification path in v1.
- Storage-read derives quality overview view models by project segment. The BFF
  and frontend do not aggregate raw results locally.
- Alerting integrations may consume quality summaries only after alerting
  contracts explicitly include AI-eval signals.
- Users create annotation queue items from online score results only through an
  explicit review/batch action after filtering the result list.

## Acceptance Criteria

- Given an enabled online policy, matching production agent runs are sampled and
  scored according to policy limits.
- Given concurrency or sample caps prevent scoring, runner records bounded
  skipped results and does not call harness.
- Given a failed deterministic online scorer, the failed result appears in
  production quality views and can be selected by a user for manual annotation
  item creation.
- Given a production quality query, storage-read returns trend and segment
  summaries without exposing raw prompt/completion content unless content
  capture permits it.
