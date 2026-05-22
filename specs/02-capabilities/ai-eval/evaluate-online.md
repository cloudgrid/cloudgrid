---
id: CAP-AIE-002
title: Evaluate online telemetry
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
depends_on: [CAP-AIE-001, CAP-AIE-006, CAP-AIE-008]
implements:
  api: [GQL-Query-evalResults, MSG-ai-persisted-projections, MSG-eval-results-persist]
  events_consumed: [ai.persisted.projections]
---

# Evaluate Online Telemetry

## Business Intent

Let teams continuously measure selected production agent runs and route useful
evidence into dataset improvement workflows without forcing CloudGrid to execute
application code inline with user traffic. This capability covers asynchronous
continuous measurement. Near-realtime alerting is out of scope.

## Behavior

- `core/ai-eval-runner` consumes `ai.persisted.projections`.
- Continuous production measurement is disabled by default. The runner performs no scoring unless
  project AI Eval is enabled and storage-read returns at least one enabled
  production measurement policy for the persisted projection.
- Runner resolves configured policy matches and scorer versions through
  `eval.online.policy_matches.resolve`.
- Policy matching is owned by storage-read. Runner receives matched policy and
  scorer references; it does not reinterpret raw policy selectors locally.
- Scorer capability definitions declare their execution, evidence,
  content-access, provider, cost, latency, and production-safety requirements.
  Storage-read may return a scorer for production measurement only when the
  enabled policy satisfies those requirements.
- Deterministic scorers execute locally when possible. Scorers that require
  harness execution run through the same harness scorer boundary used by
  offline runs, but only when policy explicitly allows the required content,
  provider profile, model alias, budget, and latency class.
- Runner persists `EvalResult` records through storage-write command subjects.
- Runner must not create `AnnotationQueueItem`, `DatasetCandidate`, or
  `DatasetItem` records automatically from production measurement. Dataset
  candidate creation is a user-triggered or policy-suggested workflow after
  reviewing filtered score results or clusters.
- Sampling and concurrency limits from project AI settings apply before scoring.
  Rate limits, token budgets, cost budgets, timeouts, retry policy, and
  backpressure rules from the resolved run policy apply before every local or
  harness scorer execution.
- Online policies may target agent, environment, route, service, tool, retrieval
  source, model, prompt version, safe indexed trace attributes, or experiment
  run ID.
- Skipped production measurements are bounded records with reason and policy ID when
  sampling, concurrency, disabled policy, unsupported scorer kind, or invalid
  policy configuration prevents scoring.
- Production measurement results do not trigger alert rules. Alerting requires a
  separate realtime run mode and alerting contract.

## Acceptance Criteria

- Given an enabled policy references a scorer whose declared requirements are
  satisfied, the runner persists an `EvalResult` without reading SurrealDB
  directly.
- Given no enabled online policy matches the projection, the runner does not
  persist an `EvalResult` and does not treat the notification as an error.
- Given an enabled policy references a scorer whose required content, provider,
  model alias, budget, or latency class is not allowed by policy, storage-read
  omits the match with a warning or the runner records a skipped result with
  `ERR-AIE-002`.
- Given production measurement sampling, rate, budget, or concurrency limits are exhausted, the runner
  records a bounded skipped result with `ERR-AIE-004`.
- Given a production measurement result fails a scorer, no annotation queue item
  or dataset item is created automatically.
- Given a user later filters failed results and requests dataset suggestions,
  candidate records are prepared through the dataset candidate workflow, not by
  the production scoring notification path.
