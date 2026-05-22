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

Continuously measure production agent quality from asynchronous production
measurement results using project-scoped policies. This use case is not
near-realtime alerting. Latency, cost, tool behavior, retrieval quality,
trajectory quality, judge-backed quality, and deterministic correctness signals
are visible when the policy satisfies the scorer capability requirements.

## Behavior

- Online evaluation policies select production segments by agent, environment,
  route, service, tool, retrieval source, model, trace attributes, and project.
- Runner evaluates only matched sampled projections after budget and concurrency
  checks pass. Rate limits, backpressure, retry, timeout, token budget, and
  failure budget are applied through `EvalRunPolicy`.
- Storage-write persists `EvalResult` records and bounded skipped-result
  summaries. It does not persist annotation queue records or dataset item
  records from the production scoring notification path.
- Storage-read derives quality overview view models by project segment. The BFF
  and frontend do not aggregate raw results locally.
- Alerting integrations may consume quality summaries only after alerting
  contracts explicitly include AI-eval signals.
- Users create dataset candidates or annotation queue items from production score
  results only through an explicit review/batch action after filtering or
  clustering the result list.
- Storage-read surfaces candidate suggestions, failure clusters, coverage gaps,
  and repeated production failures so users can improve datasets without
  manually scanning every trace.

## Acceptance Criteria

- Given an enabled online policy, matching production agent runs are sampled and
  scored according to policy limits.
- Given concurrency or sample caps prevent scoring, runner records bounded
  skipped results and does not call harness.
- Given a failed production measurement, the failed result appears in production
  quality views and can be selected or clustered by a user for dataset candidate
  creation.
- Given a production quality query, storage-read returns trend and segment
  summaries without exposing raw prompt/completion content unless content
  capture permits it.
- Given repeated failures in one route/tool/model segment, storage-read returns
  a bounded suggestion or coverage-gap signal that can feed the dataset
  candidate workflow.
