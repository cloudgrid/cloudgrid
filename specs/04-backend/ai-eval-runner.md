---
id: TEC-BE-015
title: AI evaluation runner
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
depends_on: [DOM-006, TEC-BE-016]
---

# AI Evaluation Runner

## Responsibility

`core/ai-eval-runner` executes evaluation and optimization work. It does not own
storage, GraphQL, metric aggregation, dataset validation, or project settings.

The runner:

- consumes `eval.evaluation.run.*` and `eval.optimization.start`;
- resolves project AI settings through control-plane;
- resolves dataset versions, target snapshots, and run state through
  storage-read;
- executes prompt targets through the harness/runtime abstraction;
- executes external adapter targets through the `DOM-006` adapter protocol;
- persists item runs, metric results, target snapshots, optimization state, and
  progress through storage-write;
- emits no direct frontend events.

## Execution Preflight

Before starting work, runner must resolve and snapshot:

- project AI settings and budgets;
- dataset version and item revision IDs;
- split selector;
- target snapshot;
- metric settings;
- run policy;
- retention profile and role;
- idempotency key.

If any selected row is not `ready`, has invalid input/expected, or is outside
the selected dataset version, runner fails start before executing target calls.

Optimization start additionally verifies:

- objective is resolved;
- candidate generation does not use `test`;
- quick-shot selected item revisions are persisted when used;
- budget is sufficient for at least one candidate evaluation.

## Run Lifecycle

Evaluation and optimization statuses are exactly:

- `queued`;
- `running`;
- `pausing`;
- `paused`;
- `cancelling`;
- `cancelled`;
- `completed`;
- `failed`.

Allowed transitions are the table in `DOM-006`. Runner must reject any other
transition and must make repeated control commands idempotent.

## Item Execution

For each item revision:

1. Create or resume `EvaluationItemRun`.
2. Start a CloudGrid trace/root span for the item run.
3. Execute target.
4. Validate actual output against output type expectations where applicable.
5. Compute deterministic and trace-derived metrics.
6. Call optional semantic/judge metrics only when provider settings and content
   policy allow.
7. Persist actual output, trace refs, metric results, bounded trajectory
   summary, important steps, and problems.

Item run statuses are `queued`, `running`, `completed`, `failed`, `cancelled`,
and `quarantined`.

Adapter/provider/timeouts create item-run problems using the `DOM-006` problem
taxonomy. They do not become quality failures unless a metric capability says
so.

## External Adapter Execution

Runner is the only service that calls external adapter URLs.

Runner must:

- propagate `traceparent` and optional `tracestate`;
- set `x-cloudgrid-request-id`;
- set `x-cloudgrid-idempotency-key`;
- authenticate using project settings without exposing secrets;
- omit `expected` by default;
- enforce 1 MiB request and response body limits;
- poll async adapters until completion, cancellation, failure, or timeout;
- map adapter errors to item-run and metric problems;
- support fake sync and async adapters in default tests.

Inbound webhooks are out of scope for v2.

## Metric Execution

Runner may compute item-level deterministic metrics and bounded summaries.
Storage-read owns aggregates and comparisons. Runner must not precompute
frontend-specific scoreboards.

## Retention

Runner attaches retention profile and role to every run, item run, summary,
preview, scratch artifact, and candidate artifact it persists. Storage-write
enforces TTL metadata; storage-read hides expired details while preserving
durable metadata and aggregates.

## Verification

Required focused tests before implementation is complete:

- run lifecycle idempotency;
- dataset version immutability during later row edits;
- external adapter sync success;
- external adapter async polling success;
- adapter timeout and terminal failure mapping;
- quick-shot sample reproducibility;
- `test` split rejection during candidate generation;
- promotion evidence requires full validation, not quick-shot only.
