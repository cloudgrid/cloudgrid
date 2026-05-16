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
- Runner loads configured online policies and scorer versions through
  storage-read/control-plane request/reply subjects.
- Policy matching is owned by storage-read. Runner receives matched policy and
  scorer references; it does not reinterpret raw policy selectors locally.
- Deterministic scorer execution runs in the runner for scorer definitions with `kind = deterministic`.
- RAG and LLM-judge scoring is delegated to the harness adapter.
- Runner persists `EvalResult` records through storage-write command subjects.
- Runner persists `AnnotationQueueItem` records through storage-write command subjects when a configured annotation rule matches a failed or low-scoring result.
- Online scoring is disabled by default until a scorer is explicitly configured for an agent, project, or experiment target.
- Cost and concurrency limits from `specs/06-nfr/ai-eval-cost-bounds.md` apply before every harness call.
- Online policies may target agent, environment, route, service, tool, retrieval
  source, model, prompt version, trace attributes, or experiment run ID.
- Skipped online evaluations are bounded records with reason and policy ID when
  cost, sampling, or concurrency limits prevent scoring.

## Acceptance Criteria

- Given an enabled deterministic online scorer and a persisted AgentRun projection, the runner persists an EvalResult without reading SurrealDB directly.
- Given an LLM-judge scorer, the runner calls the harness adapter and stores only score, pass/fail, evidence summary, and judge run references.
- Given online scoring limits are exhausted, the runner records a bounded skipped result with `ERR-AIE-004` and does not call harness.
- Given a tool or trajectory scorer matches a run, the persisted result includes
  structured evidence for tool choice, argument validation, ordering, retries,
  and final outcome as requested by the scorer definition.
