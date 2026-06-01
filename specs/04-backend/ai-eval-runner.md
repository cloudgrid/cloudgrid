---
id: TEC-BE-014
title: AI evaluation runner
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: from-user
depends_on: [DOM-006, TEC-BE-016, CAP-AIE-012, CAP-AIE-013]
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
- executes classification and extraction prompt/example optimization by
  combining storage-read family diagnosis, harness/custom optimizer proposal
  generation, candidate target snapshots, quick-shot pruning, validation gates,
  and explicit promotion;
- executes skill optimization loops by treating the selected skill package text
  files as editable target state while keeping the target model and harness
  fixed;
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
- search policy is resolved and supported by project settings and harness
  adapter capabilities;
- candidate generation does not use `test`;
- quick-shot selected item revisions are persisted when used;
- budget is sufficient for at least one candidate evaluation.
- `skill_text_edit` runs have a baseline target snapshot with one selected
  `skill` package, valid `SKILL.md` entrypoint, immutable package manifest,
  allowed edit operations, editable file globs, protected file globs, and max
  package/skill size bounds.
- Classification and extraction optimization runs verify the family-specific
  readiness rules in `CAP-AIE-012` and `CAP-AIE-013`: label path/options for
  classification, expected JSON Schema for extraction, training and validation
  ready rows, editable prompt/example parts or external adapter candidate
  content support, and no `test` split use for candidate generation.

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

External adapters are required when a skill evaluation depends on customer-owned
runtime context that the managed CloudGrid harness cannot reproduce: MCP
servers, proprietary tools, repositories, files/folders, application state,
permissions, workflow engines, or private business systems.

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

For prompt/example optimization of `external_adapter` targets, runner must also:

- read adapter capabilities before optimization start;
- require `candidateTargetContentMode = inline_editable_parts` or
  `candidateTargetContentMode = adapter_resolved_snapshot`;
- send `candidateParts` only when `inline_editable_parts` is declared and the
  serialized request remains within payload limits;
- reject optimization preflight when the adapter can evaluate only its baseline
  black-box behavior and cannot execute candidate target snapshots.

External adapter execution responses are control-plane responses. They must
normalize terminal outcome into CloudGrid's item-run model:

- status;
- actual output and output type, or an output artifact ref when output exceeds
  configured inline limits;
- bounded problem details;
- required `traceId` and `rootSpanId` for external business context adapters;
- usage, token, cost, and duration metadata when available.

External business context adapters must emit OTLP telemetry to CloudGrid using
the propagated trace context. Runner must not accept HTTP-returned spans,
step lists, customer logs, files, repositories, MCP state, or business records as
the primary execution evidence. Runner must not fetch customer context outside
the adapter contract.

External-adapter trace requirements are standard-first:

- preserve the W3C `traceparent` and `tracestate` CloudGrid sends for the item
  run, or return the produced root trace/span IDs in the terminal control
  response;
- emit normal OTel spans using existing production instrumentation;
- use OTel GenAI semantic conventions for model spans when available;
- use OTel MCP semantic conventions for MCP spans when available;
- preserve OpenInference attributes for frameworks that already emit them;
- use standard HTTP, RPC, database, messaging, filesystem, exception, and
  resource/service conventions for non-AI business operations.

Runner and storage-read correlate an item run to a trace by the generated
trace context and terminal `traceId`/`rootSpanId`, not by requiring CloudGrid
IDs on customer spans. CloudGrid-specific span attributes are optional
extensions and must not be required when standard semantic conventions or
adapter control fields are sufficient.

Storage-read derives `importantSteps` and `trajectorySummary` from standard
span semantics:

1. `TEC-BE-013` AI projection rules for OTel GenAI and OpenInference create
   agent, LLM, tool, and retrieval evidence.
2. OTel MCP spans create MCP/tool/resource evidence.
3. Standard HTTP, RPC, database, messaging, filesystem, and exception spans may
   contribute bounded context or failure summaries when the adapter profile
   marks them optimizer-relevant.
4. Unrecognized spans remain trace detail and do not block evaluation.

If the trace is unavailable after the trace-link wait window, runner may still
score the item from terminal output, but the item is excluded from skill
optimizer reflection unless the configured objective requires no trajectory
evidence.

Inbound webhooks are out of scope for v2.

## Metric Execution

Runner may compute item-level deterministic metrics and bounded summaries.
Storage-read owns aggregates and comparisons. Runner must not precompute
frontend-specific scoreboards.

## Classification And Extraction Prompt Optimization Execution

For `searchPolicy.optimizerKind = bootstrap_fewshot` or
`critic_mutate_judge_pick` with dataset family `classification` or `extraction`,
runner owns this loop:

1. Load the baseline target snapshot, editable prompt/example parts, metric
   settings, dataset version, and split selectors through storage-read.
2. Resolve runtime mode:
   - use managed harness for `prompt` targets;
   - use external adapter runtime only when adapter capabilities prove candidate
     target content execution support.
3. Dry-run the runtime for model/profile resolution, adapter authentication when
   applicable, trace propagation, OTLP ingestion, async polling, and terminal
   actual-output or output-ref availability.
4. Create a normal training rollout `EvaluationRun`.
5. Request storage-read family diagnosis from training results.
6. Build optimizer evidence from training item inputs, expected values, actual
   outputs, metric problems, family diagnosis, important steps, trajectory
   summaries, and trace refs according to content-capture policy.
7. Call the CloudGrid internal optimizer through the harness adapter, or a custom
   optimizer adapter when selected. The request uses the
   `/prompt-optimization/propose` protocol from `CAP-AIE-013`.
8. Require structured `PromptOptimizationProposal` records. Free-form rewritten
   prompts without operations and selectors are invalid.
9. Merge, rank, and clip proposals according to `CAP-AIE-013`.
10. Apply proposals in runner memory, reject protected or oversized candidates
    before execution, and persist valid candidates as target snapshots through
    storage-write.
11. Run quick-shot pruning on selected training rows.
12. Create normal validation `EvaluationRun` records for surviving candidates.
13. Apply the strict validation gate, persist `PromptOptimizationStep`, update
    best/current candidate refs, and retain bounded rejected summaries.
14. Stop on configured epochs/steps, budget exhaustion, cancellation, or
    convergence.

Runner must not send validation row content, validation trajectories, test row
content, hidden chain-of-thought, raw provider errors, credentials, raw full
trace payloads, or customer business records to optimizer adapters.

Default harness adapter endpoints for prompt optimization:

- `GET {adapterBaseUrl}/capabilities` returns supported prompt optimizer kinds,
  supported families, supported proposal operations, runtime modes, evidence
  fields, trace export support, editable part kinds, max evidence bytes, max
  proposal count, optimizer model aliases when custom optimization is supported,
  and max concurrent calls.
- `POST {adapterBaseUrl}/prompt-optimization/propose` returns structured prompt
  and example proposals for one bounded family diagnosis and evidence batch.
- `POST {adapterBaseUrl}/prompt-optimization/merge-rank` optionally returns
  merged and ranked proposals. If unsupported, runner performs deterministic
  merge/rank.

Each request carries `traceparent`, optional `tracestate`,
`x-cloudgrid-request-id`, `x-cloudgrid-idempotency-key`, project-scoped
authentication, optimization run ID, step ID, content policy, family diagnosis,
and bounded training evidence. Each response must fit configured size limits and
must not contain raw provider credentials, hidden reasoning, validation/test row
content, or full raw traces.

## Skill Optimization Execution

For `searchPolicy.optimizerKind = skill_text_edit`, runner owns the loop:

1. Load the baseline target snapshot, selected `skill` package manifest, and
   optimizer-visible editable text file content through storage-read.
2. Resolve runtime mode:
   - use the managed CloudGrid harness for simple skills without external
     tools, MCP, private files/folders, or business state requirements;
   - use an external business context adapter for customer-owned runtime
     contexts.
3. Dry-run the runtime connector capability/profile for package readability,
   declared script availability, model/tool profile resolution, dependency lock
   presence when required, adapter authentication when applicable, trace
   propagation, OTLP ingestion, standard semantic-convention coverage, async
   status polling, and terminal actual-output or output-ref availability.
4. Create a normal training `EvaluationRun` for each rollout batch.
5. Build optimizer evidence from training item inputs, expected values, actual
   outputs, metric problems, important steps, trajectory summaries, and trace
   refs according to content-capture policy.
6. Call the optimizer endpoint. By default this is the CloudGrid optimizer
   using normalized item-run evidence. A custom optimizer adapter is optional
   and separate from the execution adapter.
7. Require structured edit proposals with `op`, `target`, `filePath`,
   `content`, rationale, source type, support count, and evidence refs.
8. Merge, rank, and clip edits according to `OptimizationSearchPolicy`.
9. Apply edits in runner memory, reject protected-file, protected-section, or
   oversized candidates before validation, and persist valid candidates as
   target snapshots through storage-write.
10. Create a normal validation `EvaluationRun` for the candidate.
11. Apply the strict validation gate, persist `SkillOptimizationStep`, and update
   accepted best/current snapshot refs or rejected-edit memory.
12. At epoch boundaries, run optional slow update and meta memory using training
    evidence only.
13. On completion, persist the best skill package artifact reference and mark the run
    terminal.

Runner must not send validation row content, validation trajectories, test row
content, hidden chain-of-thought, raw provider errors, credentials, or full raw
trace payloads to the optimizer adapter.

Default harness adapter endpoints for skill optimization:

- `GET {adapterBaseUrl}/capabilities` returns supported optimizer kinds,
  runtime modes, evidence fields, trace export support, editable part kinds,
  package format support, script execution support, max package/skill
  bytes/tokens, edit ops, optimizer model aliases when custom optimization is
  supported, and max concurrent calls.
- `POST {adapterBaseUrl}/skill-runtime/dry-run` validates a skill package,
  runtime profile, model/tool profile, and optional fixture without generating
  optimizer edits.
- `POST {adapterBaseUrl}/skill-optimization/reflect` returns local edit
  proposals for one success or failure minibatch.
- `POST {adapterBaseUrl}/skill-optimization/merge-rank` returns merged and
  ranked edits when the adapter supports optimizer-side merge/rank. If the
  adapter does not support this endpoint, runner performs deterministic
  de-duplication by normalized edit hash and ranks by support count, source
  priority, and original order.
- `POST {adapterBaseUrl}/skill-optimization/slow-update` returns optional
  protected guidance for adjacent-epoch training comparisons.
- `POST {adapterBaseUrl}/skill-optimization/meta-memory` returns optional
  optimizer-side memory for later reflection calls.

Each request carries `traceparent`, optional `tracestate`,
`x-cloudgrid-request-id`, `x-cloudgrid-idempotency-key`, project-scoped
authentication, the optimization run ID, the step ID when available, content
policy, and bounded evidence. Each response must fit configured response size
limits and must not contain raw provider credentials or hidden reasoning.

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
- classification label-path/label-option preflight;
- classification confusion-driven prompt proposal validation;
- extraction JSON-schema preflight;
- extraction weak-field prompt proposal validation;
- external adapter candidate target content capability rejection;
- prompt optimization validation gate rejection keeps best/current target
  unchanged;
- skill optimization preflight failure without a skill part;
- strict validation-gate rejection keeps best/current skill unchanged;
- rejected-edit memory is bounded and truncates oldest entries;
- best skill artifact export references immutable content;
- promotion evidence requires full validation, not quick-shot only.
