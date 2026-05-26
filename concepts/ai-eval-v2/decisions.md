# AI Eval v2 Decisions

Date: 2026-05-24

Status: concept decisions, not approved implementation spec

## Purpose

This document records concrete AI Eval v2 product and architecture decisions.
Approving these decisions should be the gate before rewriting the approved
`specs/` tree.

## Decision Summary

| Area | Recommendation | Status |
| --- | --- | --- |
| Row status | Use one `curationStatus` enum. | decided |
| JSON schemas | Require `expectedJsonSchema` for JSON expected output; make `inputJsonSchema` optional. | decided |
| Splits | Use `training`, `validation`, `test`. | decided |
| Dataset versions | Runs reference immutable dataset versions and item revisions. | decided |
| Observed output | Store optional `observedOutput`, never use it as ground truth. | decided |
| V1 targets | Support `prompt` and `external_adapter` first-class target shapes, with immutable target snapshots and extensible part snapshots from day one. | decided |
| Prompt ownership | CloudGrid owns evaluation prompt snapshots; external harness refs remain metadata/integration refs. | decided |
| Metrics | Use internal metric capabilities, no user-facing scorers/checks. | decided |
| V1 families | Implement classification, extraction, freeform answer first. | decided |
| Optimization | Prompt/example optimization first. | decided |
| Quick-shot | Explicit reproducible phase with selected item IDs, strategy, seed, and minimum sample rules. | decided |
| Retention | Profile + role model, default `balanced`, with concrete initial TTLs. | decided |
| Production quality | Backlog until dataset evaluation and optimization specs are stable. | decided |

## Dataset Decisions

### Curation Status

Use one status field:

- `draft`: row exists but is incomplete or not intentionally reviewable yet.
- `needs_expected`: row has input but lacks corrected expected output.
- `needs_review`: row has expected output but needs human or trusted review.
- `ready`: row is eligible for evaluation.
- `rejected`: row should not be used.

Do not keep a separate `reviewStatus` in v2. The old `reviewed`/`unreviewed`
idea is folded into `curationStatus`.

Evaluation eligibility:

- `curationStatus = ready`;
- input validates;
- expected validates;
- split is assigned.

### JSON Schema Requirements

Expected output:

- If `expectedType = json`, `expectedJsonSchema` is required.
- Reason: expected output is the oracle, so unconstrained JSON weakens metrics,
  imports, review, optimization, and UI.

Input:

- If `inputType = json`, `inputJsonSchema` is optional.
- Reason: some users may evaluate arbitrary event/request payloads. A schema is
  strongly recommended but should not block v1.

If `inputJsonSchema` is absent, CloudGrid validates JSON syntax only and marks
dataset health with a schema-quality warning.

### Row Shape

Rows store:

- `input`.
- `expected`.
- optional `observedOutput`.
- optional `reason`, default `""`.
- `curationStatus`.
- optional `curationNote`.
- `split`.
- source pointers.
- anonymization provenance.
- system audit fields.
- optional user metadata.

`observedOutput` is allowed only as evidence/provenance. `expected` is the only
ground-truth value used for evaluation.

### Splits

Use:

- `training`;
- `validation`;
- `test`.

Rules:

- every row has exactly one split;
- dataset settings provide `defaultSplit`;
- random assignment is never implicit;
- optimization may use `training`;
- candidate selection should use `validation`;
- `test` is for final confidence and must not be used by prompt search or
  candidate generation.

### Dataset Versioning

Decision: treat the dataset used by a run as immutable evidence.

Evaluation runs must reference:

- dataset version ID;
- resolved item revision IDs;
- dataset settings snapshot or digest;
- input and expected schema versions/digests;
- split assignments used for the run.

Editing behavior-affecting row fields creates a new item revision. Changing
behavior-affecting dataset settings creates a new dataset version.

Behavior-affecting row fields include:

- `input`;
- `expected`;
- `reason`;
- `split`;
- `curationStatus`;
- anonymized/redacted content used by the run.

Behavior-affecting dataset settings include:

- `evaluationFamily`;
- input/expected types and schemas;
- trace extraction settings;
- anonymization/PII policy;
- default metric settings;
- retention profile when it changes stored run evidence.

Audit fields, UI labels, and non-executed metadata do not affect dataset
digests.

Reasoning: target snapshots make target behavior reproducible, but evaluation
evidence also depends on the exact dataset content and settings. Without dataset
versioning, old comparisons can become ambiguous after row edits or schema
changes.

## Evaluation Family Decisions

V1 implementation families:

- `classification`;
- `extraction`;
- `freeform_answer`.

Design but postpone:

- `tool_use`;
- `agent_loop`;
- `workflow`;
- `skill`.

Every family uses the same top-level row model. For complex families, expected
output is JSON validated by dataset-level schema templates.

## Target Decisions

V1 target support:

- implement `prompt`;
- implement `external_adapter` for black-box agents/workflows that CloudGrid
  should evaluate without reimplementing them in the harness.

Define the target snapshot contract from day one. V1 behavior may only execute
prompt/example optimization, but the data model must already support future
parts.

Target snapshots are immutable and contain part snapshots.

V1 populated parts:

- `prompt`;
- `examples`;
- `model_config`.

Future part kinds:

- `skill`;
- `tool_config`;
- `workflow`;
- `agent_config`;

Target kinds:

- `prompt`;
- `external_adapter`;
- `agent`;
- `workflow`;
- `custom_harness_target`.

`external_adapter` is the enterprise-grade integration path for complex agents
or workflows. It lets CloudGrid call a customer-provided adapter URL with input
and trace context, while the external system executes its own stack, tools,
state, and workflow logic.

Every evaluation run references the target snapshot that actually ran. Every
optimization candidate is a new target snapshot. Promotion records point a
named ref/tag to a target snapshot.

Diffs compare target snapshots by part. V1 diffs cover prompt/example changes;
future diffs cover skill/tool/workflow/model changes.

### External Adapter Target

Decision: support a black-box target adapter contract conceptually from v1, even
if the first implementation is minimal.

Reasoning:

- Real enterprise agents often cannot be rebuilt inside CloudGrid's harness.
  They may depend on private services, custom tools, permissions, state, queues,
  and workflow engines.
- Evaluation should not require users to duplicate production logic inside our
  product.
- CloudGrid can still own datasets, target snapshots, run orchestration, metric
  computation, comparisons, and evidence correlation.

Contract direction:

- CloudGrid runner starts an item run by calling an adapter URL.
- The request includes W3C `traceparent`/`tracestate` and CloudGrid correlation
  IDs.
- The request includes dataset input and safe execution context.
- The request does not include `expected` by default.
- The external system executes and emits OpenTelemetry using the provided trace
  context.
- The adapter returns a final output synchronously or exposes an async result
  that CloudGrid can fetch.

The approved protocol must define:

- authentication/signing;
- idempotency key behavior;
- status vocabulary;
- terminal versus retryable error mapping;
- payload and output size limits;
- timeout and cancellation semantics;
- whether and how adapter metadata may reference secrets without exposing them;
- conformance fixtures for sync and async adapters.

Recommended v1 reliability choice:

- support synchronous response for short-running targets;
- support asynchronous polling for long-running targets;
- keep inbound webhooks as a later option because they introduce public
  callback auth, firewall, retry, and replay complexity.

Async shape:

- `POST /eval-runs` starts work and returns `runRef`;
- `GET /eval-runs/{runRef}` returns status, final output when complete, and
  optional output metadata;
- CloudGrid runner owns timeout, retry, cancellation, and idempotency.

The adapter may be implemented by the customer, the harness, or a thin shim in
front of an existing agent/workflow system.

Target snapshot implications:

- `TargetSnapshot.kind = external_adapter`;
- parts include `adapter_metadata`, `model_config` when known, and optional
  prompt/tool/skill/workflow refs when the adapter can expose them;
- if internal target parts are opaque, CloudGrid still stores adapter URL/ref,
  version/digest, and declared capabilities so runs remain explainable.

### Prompt Version Ownership

Decision: CloudGrid owns evaluation prompt snapshots as target parts. External
harness prompt IDs may be referenced, but they are not the source of truth for
historical evaluation reproducibility.

Reasoning:

- Enterprise evaluation needs reproducibility. A run must remain explainable
  even if an external harness prompt changes or disappears.
- Optimization needs immutable candidate artifacts. CloudGrid cannot reliably
  diff, compare, retain, or promote a candidate if the optimized prompt only
  lives as mutable external state.
- CloudGrid should still integrate with runtime systems. Production deployment
  can use external prompt registries, but evaluation evidence must reference
  immutable CloudGrid target snapshots.

Implementation direction:

- Prompt content used in an evaluation is stored or content-addressed as a
  `TargetPartSnapshot` with `partKind = prompt`.
- External prompt IDs live in `partRef` or metadata.
- If policy forbids storing full prompt text, CloudGrid stores digest, bounded
  summary, and external content ref, and marks reproducibility as degraded.
- Promotion records point to target snapshots. Adapters translate promoted
  snapshots into external deployment updates.

This gives an enterprise-grade audit trail without forcing CloudGrid to be the
only runtime prompt registry.

### Target Snapshot Schema

Decision: make snapshot schemas generic and immutable from day one.

`TargetSnapshot`:

- `id`;
- `kind`: prompt, external_adapter, agent, workflow, or custom_harness_target;
- `name`;
- `version`;
- `digest`;
- `createdAt`;
- `createdBy`;
- `source`: manual, imported, optimized, promoted, or external;
- `parts`;
- `metadata`.

`TargetPartSnapshot`:

- `partKind`: prompt, examples, model_config, tool_config, skill, workflow,
  agent_config, or adapter_metadata;
- `partRef`;
- `version`;
- `digest`;
- `contentRef`;
- `summary`;
- `metadata`.

Digest rule:

- `TargetSnapshot.digest` is a canonical digest over `kind`, normalized parts,
  part digests, and behavior-affecting metadata.
- Non-behavior metadata, UI labels, and audit fields do not affect the digest.
- Every part that affects execution must have a digest or external immutable
  content reference.

This is deliberately more generic than v1 needs. It prevents future migration
when skill, tool, workflow, or agent configuration optimization is added.

## Metric Decisions

No user-facing scorers/checks in v2 UX.

Use internal metric capabilities.

Initial metric capabilities:

Classification:

- exact label accuracy;
- per-label support;
- confusion matrix;
- optional precision/recall/F1 when counts support it.

Extraction:

- valid JSON rate;
- expected schema validity;
- exact JSON equality when enabled;
- per-field match rate;
- missing field count;
- extra field count;
- type mismatch count.

Freeform answer:

- normalized text similarity;
- exact/contains when enabled;
- optional semantic similarity when provider/profile is configured;
- optional judge-style score when judge settings are configured.

Always-on trajectory metrics:

- duration;
- model call count;
- tool call count;
- retrieval count;
- retry count;
- token totals when available;
- cost when available;
- error/problem counts.

Metric settings should be dataset-defaulted and evaluation-overridable.

### Metric Result And Comparison Schema

Decision: use a normalized metric envelope with typed metric payloads.

`MetricResult`:

- `metricId`;
- `metricVersion`;
- `scope`: item_run, evaluation_run, comparison, or optimization_run;
- `subjectId`;
- `family`;
- `value`: number, string, boolean, or JSON;
- `unit`;
- `direction`: higher_is_better, lower_is_better, or informational;
- `problem`, optional;
- `evidenceRefs`;
- `metadata`.

Each metric capability must define the exact payload schema behind `value`.
Generic JSON is only the envelope escape hatch, not the contract for core
metrics.

Core specs must define a shared `problem` taxonomy for metric failures, including
at least invalid actual output, invalid expected output, missing evidence,
adapter failure, timeout, provider failure, content redacted, and not applicable.

`MetricAggregate`:

- `metricId`;
- `metricVersion`;
- `evaluationRunId`;
- `count`;
- `mean`, `min`, `max`, and percentile fields when numeric;
- distribution/buckets when useful;
- grouped breakdowns such as label, field path, step kind, or tool name;
- problem counts.

`EvaluationComparison`:

- baseline run ID;
- candidate run ID;
- compared target snapshot IDs;
- metric deltas;
- constraint results;
- tradeoff summary;
- changed item refs;
- regression/improvement examples;
- recommendation summary, optional.

Reasoning:

- This keeps metrics extensible without creating user-facing scorer objects.
- Optimization can rank candidates using the same metric results users see.
- Storage-read can aggregate and compare metrics without frontend
  recomputation.

## Evaluation Run Decisions

Every dataset item run is trace-backed:

- store trace ID;
- store root span ID;
- store actual final output;
- store metric results;
- store bounded trajectory summary fields.

Do not duplicate full traces into evaluation records.

Trajectory summary fields:

- `trajectorySummary`;
- `summaryEvidenceRefs`;
- `importantSteps`;
- optional `conversationRef`;
- `summaryDigest`;
- `summaryGeneratedAt`.

Summary generation:

- deterministic counts/summaries are storage-read derived when they depend only
  on persisted trace, metric, and item-run data;
- optional LLM summarization is a bounded metric/evidence step;
- hidden chain-of-thought must not be inferred or stored.

## Optimization Decisions

V1 optimization:

- prompt/example optimization only.

Optimization objective requires:

- primary metric;
- secondary metrics;
- constraints;
- tradeoff metrics;
- ranking policy;
- tie-breakers.

Recommended default objective:

- primary metric: family default quality metric;
- constraints: no schema-validity regression for extraction, no increased
  problem rate, no `test` split usage;
- tradeoffs: latency, token count, cost;
- tie-breaker: lower cost, then lower latency.

### Optimization Objective Schema

Decision: objective is explicit and stored with every optimization run.

`OptimizationObjective`:

- `primaryMetricId`;
- `secondaryMetricIds`;
- `constraints`;
- `tradeoffMetrics`;
- `rankingPolicy`;
- `tieBreakers`;
- `minimumEvidence`;

Constraint examples:

- schema validity must not regress;
- problem rate must not increase;
- latency may not exceed a configured limit;
- cost may not exceed a configured limit;
- no `test` split usage during candidate generation.

Default ranking policy:

- rank by primary metric improvement;
- reject candidates that violate hard constraints;
- use secondary metrics for close candidates;
- tie-break by lower cost, then lower latency.

This gives optimizers enough authority to recommend candidates while keeping
promotion explicit.

Quick-shot evaluation:

- explicit phase;
- stores selected item IDs;
- stores selection strategy;
- stores seed for random samples;
- stores dataset version, target snapshot, metric settings, run policy.

Minimum quick-shot rules:

- use at least one row per affected category/field when category/field data
  exists;
- use stratified sampling for classification;
- include recent failures or changed rows when optimizing from a previous run;
- require full validation before selected candidate can be promoted;
- require optional final `test` run before high-confidence promotion.

Concrete defaults:

- minimum total sample size: 20 rows when the split has at least 20 eligible
  rows;
- small split fallback: use all eligible rows when fewer than 20 rows exist;
- classification: include at least 3 rows per affected label when available;
- extraction: include at least 3 rows per weak/missing field path when
  available;
- previous-run optimization: include all rows that regressed, plus a stratified
  sample of unchanged/passed rows;
- random sampling must persist seed and selected item IDs;
- quick-shot may prune candidates, but cannot be the final promotion evidence.

## Retention Decisions

Default retention profile:

- `balanced`.

Supported profiles:

- `balanced`;
- `fast_iteration`;
- `audit_friendly`;
- `minimal_storage`.

Retention roles:

- `scratch`;
- `quick_shot`;
- `candidate`;
- `baseline`;
- `validation`;
- `test`;
- `promoted`;
- `pinned`.

Initial `balanced` TTL defaults:

- durable metadata and aggregate metrics: 730 days;
- per-item metric values for `baseline`, `validation`, `test`, `promoted`, and
  `pinned`: 365 days;
- per-item metric values for `candidate`: 90 days;
- per-item metric values for `quick_shot`: 30 days;
- trajectory summaries for durable roles: 180 days;
- trajectory summaries for quick-shot/candidate roles: 30 days;
- important-step previews: 30 days;
- optimizer scratch: 7 days;
- rejected/pruned candidate details: 14 days;
- full conversations/tool I/O: follow trace/content retention and PII policy;
- pinned records: follow project durable retention or until explicitly
  unpinned, subject to content retention limits.

Profile adjustments:

- `fast_iteration`: halve quick-shot/candidate TTLs and keep optimizer scratch
  for 3 days.
- `audit_friendly`: keep durable per-item metrics and trajectory summaries for
  730 days.
- `minimal_storage`: keep durable metadata/aggregates, shorten quick-shot and
  previews to 7 days, and disable retained trajectory summaries unless pinned.

## Production Quality Decision

Keep production quality as backlog for this rewrite.

Reason:

- production measurement lacks explicit expected output;
- success/failure is use-case-specific;
- the dataset/evaluation/optimization primitives should stabilize first.

Production quality can later reuse metric/result/comparison machinery with
production trace datapoints replacing dataset rows.

## Spec Rewrite Gate

Resolved in this document:

- prompt version ownership;
- dataset version and item revision reproducibility;
- target snapshot schema direction;
- external adapter target direction;
- metric result/comparison schema direction;
- optimization objective schema direction.
- quick-shot minimum sample defaults;
- retention TTL defaults.

Remaining pre-spec work:

- translate these decisions into approved spec edits;
- tighten exact field names and enum values during contract/schema writing.
