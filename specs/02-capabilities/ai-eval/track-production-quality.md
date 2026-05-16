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

Continuously measure production agent quality, latency, cost, tool behavior, and
retrieval quality using project-scoped online evaluation policies.

## Behavior

- Online evaluation policies select production segments by agent, environment,
  route, service, tool, retrieval source, model, trace attributes, and project.
- Runner evaluates only matched sampled projections after budget and concurrency
  checks pass.
- Storage-write persists `EvalResult` and annotation queue records.
- Storage-read derives quality overview view models by project segment. The BFF
  and frontend do not aggregate raw results locally.
- Alerting integrations may consume quality summaries only after alerting
  contracts explicitly include AI-eval signals.

## Acceptance Criteria

- Given an enabled online policy, matching production agent runs are sampled and
  scored according to policy limits.
- Given daily budget exhaustion, runner records bounded skipped results and does
  not call harness.
- Given a failed trajectory scorer, the annotation queue receives a review item
  linked to source trace/span and scorer evidence.
- Given a production quality query, storage-read returns trend and segment
  summaries without exposing raw prompt/completion content unless content
  capture permits it.
