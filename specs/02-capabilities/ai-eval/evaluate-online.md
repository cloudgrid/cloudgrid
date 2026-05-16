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

Let teams continuously score selected live agent runs and route failures into review without forcing CloudGrid to execute application code.

## Behavior

- `core/ai-eval-runner` consumes `ai.persisted.projections`.
- Online scoring is disabled by default. The runner performs no scoring unless
  project AI Eval is enabled and storage-read returns at least one enabled
  online policy for the persisted projection.
- Runner resolves configured online policy matches and scorer versions through
  `eval.online.policy_matches.resolve`.
- Policy matching is owned by storage-read. Runner receives matched policy and
  scorer references; it does not reinterpret raw policy selectors locally.
- Deterministic scorer execution runs in the runner for scorer definitions with `kind = deterministic`.
- Online scoring v1 supports deterministic scorers only. If policy resolution
  returns a non-deterministic scorer, the runner records a skipped result with
  `ERR-AIE-002` and does not call harness.
- The runner must not call harness `/v1/score` for online scoring in v1.
  LLM-judge, semantic, RAG, tool-correctness, trajectory, and content-bearing
  online scoring are future features and require a separate approved spec.
- Runner persists `EvalResult` records through storage-write command subjects.
- Runner must not create `AnnotationQueueItem` records automatically from online
  scoring in v1. Annotation creation is a user-triggered action after reviewing
  and filtering score results.
- Sampling and concurrency limits from project AI settings apply before scoring.
  Monetary cost limits still apply globally, but v1 deterministic online
  scoring must not spend external provider budget.
- Online policies may target agent, environment, route, service, tool, retrieval
  source, model, prompt version, safe indexed trace attributes, or experiment
  run ID.
- Skipped online evaluations are bounded records with reason and policy ID when
  sampling, concurrency, disabled policy, unsupported scorer kind, or invalid
  policy configuration prevents scoring.
- Online score results do not trigger alert rules in v1.

## Acceptance Criteria

- Given an enabled deterministic online scorer and a persisted AgentRun projection, the runner persists an EvalResult without reading SurrealDB directly.
- Given no enabled online policy matches the projection, the runner does not
  persist an `EvalResult` and does not treat the notification as an error.
- Given an enabled online policy references an LLM-judge, semantic, RAG,
  tool-correctness, trajectory, or human scorer, storage-read rejects the policy
  match or the runner records a skipped result with `ERR-AIE-002`; no harness
  score call is made.
- Given online scoring sampling or concurrency limits are exhausted, the runner
  records a bounded skipped result with `ERR-AIE-004`.
- Given an online result fails a deterministic scorer, no annotation queue item
  is created automatically.
- Given a user later filters failed online results and triggers annotation
  creation, annotation records are persisted through `annotation.item.update`,
  not by the online scoring notification path.
