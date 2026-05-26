# AI Eval v2 Concept Spec

Date: 2026-05-24

Status: intermediate concept, not approved implementation spec

## Goals

AI Eval v2 should let users:

- create high-quality datasets for a specific evaluation use case;
- run reusable dataset evaluations against prompts, agents, workflows, skills,
  or other harness targets;
- inspect final outputs and trace-backed trajectory evidence per row;
- optimize prompts and later richer targets with reproducible comparisons;
- keep retention mostly automatic while preserving important evidence.

The product should talk about metrics, results, comparisons, datasets,
evaluations, and optimization. It should not make users start with scorers,
checks, gates, or experiments.

## Non-Goals For First Rewrite

- Production quality as a full implementation target.
- Workflow optimization.
- Skill optimization.
- User-facing metric/scorer library.
- Custom harness target kinds beyond the defined `external_adapter` contract.
- Complex raw TTL retention UI.

Production quality remains a backlog consumer of the dataset/evaluation model.

## Product Model

Primary user-facing sections:

- `Datasets`.
- `Evaluations`.
- `Production quality` later/backlog.

Inside `Evaluations`:

- dataset evaluations;
- optimizations.

Evaluation produces measurements. Gates, alerting, release policies, and
promotion rules are separate consumers of metrics.

## Dataset Model

A dataset is a typed set of evaluation cases. One dataset defines one row
contract.

Dataset settings:

- `evaluationFamily`: `classification`, `extraction`, `freeform_answer`,
  `tool_use`, `agent_loop`, `workflow`, or `skill`.
- `inputType`: `text` or `json`.
- `expectedType`: `text` or `json`.
- `inputJsonSchema`: required when `inputType = json`, unless a future spec
  explicitly allows unconstrained JSON input.
- `expectedJsonSchema`: required when `expectedType = json`.
- default split.
- intake/review policy.
- trace extraction settings.
- anonymization/PII policy.
- default metric settings.
- retention profile.

Dataset row:

- `input`.
- `expected`.
- `observedOutput`, optional value produced by a source trace, import, or
  previous evaluation run.
- `reason`, optional explanation of why `expected` is correct.
- `curationStatus`.
- `curationNote`.
- `split`.
- source pointers.
- anonymization provenance.
- system audit fields.
- optional user metadata.

Do not support row-level target shape selection in the normal product path.
Complex expected values should be represented as JSON validated by the
dataset-level schema.

### Curation Status

Use one status model. Do not duplicate `reviewStatus` and `curationStatus`.

Recommended statuses:

- `draft`: row exists but is not ready for evaluation.
- `needs_expected`: row lacks corrected expected output.
- `needs_review`: row has expected output but needs human or trusted review.
- `ready`: row is eligible for evaluation.
- `rejected`: row should not be used.

A row is evaluation-eligible only when:

- `curationStatus = ready`;
- `input` validates against input settings;
- `expected` validates against expected settings;
- split is assigned.

### Observed Output

`observedOutput` is what the current or historical system produced. It is not
ground truth.

`expected` is the corrected desired value.

For a wrong classification:

```json
{
  "input": "I need a refund",
  "observedOutput": "sales",
  "expected": "billing",
  "reason": "Refund requests must route to billing."
}
```

For bad extraction:

```json
{
  "observedOutput": { "amount": 19.99, "currency": "USD" },
  "expected": { "amount": 199.99, "currency": "USD" }
}
```

Trace/import flows should make observed value handling explicit:

- if observed output is correct, copy it into `expected` when validation and
  policy allow it;
- if observed output is wrong or incomplete, keep it as `observedOutput` and
  require corrected `expected` before the row becomes eligible.

`observedOutput` follows dataset content treatment, PII/anonymization, and
retention policy. It should be stored only when it is useful for curation,
debugging, or optimization; source trace/eval refs remain the place to inspect
full observed behavior.

### Splits

Use:

- `training`;
- `validation`;
- `test`.

Every row has exactly one split. Random split assignment should not happen
implicitly. Optimizers and prompt search must not read `test`.

### Dataset Versions

Dataset runs must reference immutable dataset versions, not only the current
mutable dataset object.

The implementation shape can be refined in specs, but the guarantee must be:

- an old evaluation run can render the exact input, expected output, reason,
  split, schemas, and dataset settings used when it ran;
- editing a row's input, expected output, reason, split, or curation status
  creates a new item revision or dataset version reference;
- changing dataset-level schemas, evaluation family, metric defaults, extraction
  settings, anonymization policy, or split defaults creates a new dataset
  version;
- run snapshots store the dataset version and resolved item revision IDs;
- dataset digests are based on normalized behavior-affecting settings, schemas,
  and item revisions, not audit fields or UI labels.

This mirrors target snapshots. Target reproducibility is not enough if the data
being evaluated can drift underneath historical runs.

## Dataset Evaluation

A dataset evaluation is a reusable definition that measures one target against
one dataset/split configuration.

Definition fields:

- name.
- dataset reference.
- dataset version policy.
- default split selector.
- target reference.
- metric settings.
- run policy.
- retention profile/role defaults.

Run snapshot:

- dataset version.
- resolved item IDs.
- split selector.
- target snapshot.
- metric settings.
- run policy.
- retention role.
- start/end timestamps.

## Item Run

Every dataset item run is trace-backed, including classification and
extraction.

Item run fields:

- dataset item ID.
- evaluation run ID.
- actual final output.
- trace ID.
- root span ID.
- target snapshot.
- metric results.
- problems.
- trajectory summary.
- important step previews.
- evidence refs.
- retention role.
- start/end timestamps.

Do not duplicate full traces into evaluation records. Full detail stays in
telemetry storage. Evaluation item runs store refs, metrics, bounded summaries,
and capped previews.

### Trajectory Summary

Each item run may expose:

- `trajectorySummary`: concise text explaining what happened.
- `summaryEvidenceRefs`: trace/span/tool-call refs used by the summary.
- `importantSteps`: capped list of key steps with kind, name, bounded input
  preview, bounded output preview, status, and span ref.
- `conversationRef`: optional pointer to full conversation when content capture
  and retention allow it.
- `summaryDigest`.
- `summaryGeneratedAt`.

This gives humans and optimizers a quick way to understand a run without
loading full traces by default.

Reasoning policy:

- capture model-visible messages and tool I/O only when content capture allows;
- capture provider/harness reasoning summaries only when explicitly emitted;
- do not infer or invent hidden chain-of-thought;
- store bounded summaries or pointers, not unbounded reasoning text.

## Evaluation Target

Use `target` in product and public contracts. Existing `solverRef` language
should be replaced or wrapped by `EvaluationTargetRef` during the spec rewrite.

Target kinds:

- `prompt`;
- `external_adapter`;
- `agent`;
- `workflow`;
- `custom_harness_target` later/advanced.

Target kind is the runnable unit. Target parts are the versioned components
that make that runnable unit behave differently.

End users should not need to understand this structure. In the UI they select a
target, run an evaluation, compare candidates, and promote a selected
candidate. The snapshot/part/diff model is the internal foundation that keeps
those actions reproducible as target complexity grows.

### Target Snapshot

Use immutable target snapshots from v1, even if v1 only fills prompt/example
parts.

`TargetSnapshot` should capture:

- `id`;
- `kind`;
- `name`;
- `version`;
- `digest`;
- `createdAt`;
- `createdBy`;
- `source`: manual, imported, optimized, promoted, or external;
- `parts`;
- `metadata`.

`TargetPartSnapshot` should capture:

- `partKind`: prompt, examples, model_config, tool_config, skill, workflow,
  agent_config, or adapter_metadata;
- `partRef`;
- `version`;
- `digest`;
- `contentRef`;
- `summary`;
- `metadata`.

V1 should populate:

- prompt;
- examples when few-shot/example selection is used;
- model_config when model/provider choice affects behavior.

Future target parts should fit the same shape:

- tool_config;
- skill;
- workflow;
- agent_config.

### External Adapter Target

Complex enterprise agents and workflows may not fit inside CloudGrid's harness
directly. They may depend on private services, workflow engines, queues,
permissions, stateful tools, or application-specific runtime behavior.

For those cases, use `external_adapter` as a black-box target kind. CloudGrid
still owns datasets, evaluation runs, metric computation, comparisons,
retention, and trace correlation. The external adapter owns execution.

Adapter contract direction:

- CloudGrid runner calls a configured adapter URL for each item run.
- The request includes W3C `traceparent`/`tracestate`.
- The request includes CloudGrid correlation IDs such as evaluation run ID,
  item run ID, dataset item ID, and target snapshot ID.
- The request includes dataset `input` and safe execution metadata.
- The request does not include `expected` by default.
- The external system emits OpenTelemetry using the provided trace context.
- The adapter returns final output synchronously for short-running targets or
  exposes an async status/result endpoint for long-running targets.

Recommended reliable v1 shape:

- synchronous response for short-running targets;
- asynchronous polling for long-running targets;
- webhooks later, because inbound callbacks add auth, firewall, retry, replay,
  and public endpoint complexity.

Async shape:

- `POST /eval-runs` starts work and returns `runRef`;
- `GET /eval-runs/{runRef}` returns status, final output when complete, and
  output metadata;
- CloudGrid runner owns timeout, retry, cancellation, and idempotency.

The approved spec must harden this into an exact protocol before implementation:
authentication/signing, idempotency keys, terminal status values, retryable versus
terminal errors, payload size limits, timeout/cancellation behavior, and how
adapter failures map into metric problems.

The adapter may be implemented by the customer, by the harness, or by a thin
shim in front of an existing agent/workflow system.

Snapshot implication:

- `TargetSnapshot.kind = external_adapter`;
- target parts include `adapter_metadata`, optional `model_config`, and any
  prompt/tool/skill/workflow refs the adapter can expose;
- if internals are opaque, CloudGrid stores adapter ref, declared version,
  digest/capability metadata, and trace evidence.

Data integrity rules:

- snapshots are immutable;
- evaluation runs reference exact snapshot IDs;
- optimization candidates are new snapshots;
- promotion points a mutable tag/ref to an immutable snapshot;
- comparisons reference snapshot IDs;
- diffs are derived or cached between snapshots, but snapshots are source of
  truth.

This creates the future-proof basement: later skill/tool/workflow optimization
adds new part kinds and behavior, not a new top-level data model.

### Target Diff

Every candidate comparison should be able to show what changed.

`TargetDiff` should capture:

- base snapshot ID;
- candidate snapshot ID;
- diff summary;
- `partDiffs`.

`TargetPartDiff` should capture:

- `partKind`;
- `changeKind`: added, removed, modified, reordered, or unchanged;
- before digest;
- after digest;
- summary;
- structured diff.

For v1 prompt optimization, part diffs cover prompt and example changes.
Future diffs can cover skill resources, tool configuration, workflow routing,
agent settings, or model/provider choice.

### Promotion Record

Promotion should mean: point a named target ref/tag/deployment reference at an
immutable target snapshot.

`PromotionRecord` should capture:

- candidate snapshot ID;
- baseline snapshot ID;
- evaluation run IDs used as evidence;
- comparison summary;
- promoted by;
- promoted at;
- target ref or tag;
- notes.

Promotion remains explicit. CloudGrid may rank or recommend candidates, but it
must not silently promote.

### UX Constraint

The UI should expose the simple version:

- select target;
- run evaluation;
- optimize target;
- review what changed;
- promote candidate.

It should not expose snapshot internals unless the user opens an advanced
details/debug view.

## Metric Model

Do not expose user-facing scorers/checks in v1.

Internally, define metric capabilities.

Metric capability fields:

- metric ID.
- display name.
- supported evaluation families.
- supported input/expected types.
- required evidence.
- execution kind: deterministic, trace-derived, semantic/model-backed,
  judge-backed, aggregate-only.
- provider/model/content requirements.
- per-item result schema.
- aggregation behavior.
- comparison behavior.
- visualization kind.

Metric settings are selected from dataset defaults with evaluation-level
overrides.

Metric result fields:

- metric ID and version.
- item run or evaluation run reference.
- value or structured value.
- units.
- problem, if metric could not be computed.
- evidence refs.

The approved spec should avoid an untyped "anything JSON" result core. Each
metric capability needs a typed payload schema, unit/direction rules, aggregation
rules, and a shared problem taxonomy so optimization can compare candidates
without special-case frontend logic.

Evaluation comparisons should compare metric vectors, not collapse everything
to one hidden pass/fail result.

## Evaluation Families

### Classification

Expected value is a category/label.

Default metrics:

- accuracy;
- per-label support;
- confusion matrix;
- optional precision/recall/F1.

### Extraction

Expected value is JSON.

Default metrics:

- valid JSON rate;
- schema validity;
- exact JSON equality where useful;
- field match rates;
- missing/extra/type mismatch counts.

### Freeform Answer

Expected value is text.

Default metrics:

- normalized text similarity;
- exact/contains where useful;
- optional semantic similarity;
- optional judge-style score.

### Tool Use

Expected JSON may include required/forbidden tools, argument constraints,
ordering/dependency constraints, and max tool calls.

Metrics include tool coverage, forbidden calls, argument correctness,
order/dependency satisfaction, final output quality, and cost/latency/tool-call
count.

### Agent Loop

Expected JSON may include final outcome, milestones, max iterations/retries,
allowed handoffs, required evidence, and terminal status.

Metrics include task completion, milestone coverage, forbidden steps,
loop-limit violations, retries, handoff correctness, final output quality, and
cost/latency/tokens.

### Workflow

Expected JSON may include final output/state, terminal status, phase/branch
outcomes, required events, and environment/verifier refs.

Metrics include final state match, terminal status, phase completion, branch
coverage, environment verifier result, failing phase, cost, and latency.

### Skill

Expected JSON may include required/optional/forbidden skill use, artifact
constraints, schema/style/safety constraints, and allowed tools.

Metrics include task quality, skill activation precision/recall, artifact
validity, instruction adherence, script/tool error rate, and overhead.

## Optimization

Optimization is a reproducible loop around dataset evaluations.

Run lifecycle:

1. Establish or run baseline evaluation.
2. Generate candidate target snapshot.
3. Run quick-shot evaluation on selected subset when useful.
4. Run fuller validation for promising candidates.
5. Compare candidates to baseline and previous candidates.
6. Iterate according to objective and budget.
7. Optionally run selected candidate on `test`.
8. Promote explicitly.

Optimization run snapshots:

- baseline target snapshot.
- optimizer method and settings.
- objective.
- training evaluation or split.
- validation evaluation or split.
- optional test evaluation or split.
- candidate target snapshots.
- quick-shot sample selection rules.
- every evaluation run caused by the optimization.
- metric comparisons.
- selected candidate.
- promotion decision.

### Objective

Optimization needs explicit objective settings.

Objective fields:

- primary metric.
- secondary metrics.
- constraints, such as do not reduce schema validity or exceed cost.
- tradeoff metrics: latency, cost, token count, tool count.
- candidate ranking policy.
- tie-breakers.

Without this, optimization can report metrics but cannot reliably decide which
candidate is better.

### Quick-Shot Evaluation

Quick-shot evaluation is an explicit phase, not a hidden shortcut.

Snapshot:

- source dataset version.
- split.
- selected item IDs.
- selection strategy.
- random seed when applicable.
- candidate target snapshot.
- metric settings.
- run policy.

Useful selection strategies:

- failed categories;
- weak fields;
- edge cases;
- high-cost rows;
- recent failures;
- representative clusters;
- stratified random sample.

Quick-shot results are for exploration. Final confidence requires full
validation or test evaluation.

## Retention

Use profiles and roles, not raw TTLs by default.

Profiles:

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

The system should automatically promote important records to longer-lived
roles: selected candidates, baselines, validation runs, test runs, promotion
evidence, and user-pinned rows/runs.

Full trace/conversation content follows telemetry/content retention and PII
policy. Evaluation records keep durable summaries, metrics, refs, and digests
according to the resolved retention role and profile.

## Recommended First Implementation Scope

Build the first version around:

- dataset-level schemas;
- row curation;
- `training`/`validation`/`test` splits;
- immutable dataset versions and item revisions;
- classification, extraction, and freeform answer families;
- prompt target;
- external adapter target contract for black-box enterprise agents/workflows;
- immutable target snapshots with prompt/examples/model_config parts;
- target diffs for prompt/example candidate changes;
- promotion records pointing to target snapshots;
- dataset evaluation;
- trace-backed item runs;
- metric results and comparisons;
- prompt/example optimization;
- quick-shot optimization;
- retention profiles/roles with defaults.

Design but postpone:

- tool-use evaluation;
- agent-loop evaluation;
- workflow evaluation;
- skill evaluation;
- skill/tool/workflow optimization;
- production quality.

## Spec Conversion Requirements

Before implementation, the approved specs must define:

- dataset settings and row schema;
- dataset versioning, item revisioning, and dataset digest rules;
- curation status;
- evaluation target refs and snapshots;
- metric capability/result schema;
- dataset evaluation definitions and runs;
- item run trace correlation and trajectory summaries;
- optimization objective and quick-shot rules;
- retention roles/profiles and default TTLs;
- GraphQL contracts;
- AsyncAPI message contracts;
- entity JSON schemas;
- storage-read/write ownership;
- runner/harness boundaries;
- frontend UX.
