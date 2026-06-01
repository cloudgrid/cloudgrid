---
id: CAP-AIE-013
title: Optimize classification and extraction prompts
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: research-informed
traits:
  interaction: http
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-006, CAP-AIE-004, CAP-AIE-012, REV-013, ADR-0006, ADR-0007]
implements:
  api: [GQL-Mutation-startOptimizationRun, MSG-eval-optimization-start]
---

# Optimize Classification And Extraction Prompts

## Business Intent

Let users improve classification and extraction targets from dataset evidence
without learning optimizer internals. The user starts from an evaluation or
comparison, confirms the objective/runtime defaults, then reviews candidate
prompt/example diffs and explicitly promotes a target snapshot.

## User Setup Contract

Minimum required user inputs:

- a ready classification or extraction dataset with training and validation rows;
- a baseline evaluation target;
- an evaluation run or comparison that establishes baseline behavior.

CloudGrid defaults:

- objective metric from dataset family;
- hard constraints from family rules;
- search policy from project optimization defaults;
- quick-shot item selection from observed failures and support gaps;
- prompt/example editable part selection when the target exposes those parts;
- managed harness runtime for `prompt` targets;
- external adapter runtime for `external_adapter` targets only when adapter
  capabilities prove candidate execution support.

Normal users do not write optimizer prompts, raw adapter JSON, NATS subjects,
GraphQL IDs beyond selected entities, shell commands, or provider credentials.

## Supported Runtime Modes

### Managed Harness

Use managed harness runtime when the target is a CloudGrid `prompt` target whose
behavior is fully represented by target snapshot parts:

- `prompt`, required;
- `examples`, optional;
- `model_config`, optional and editable only when already present and explicitly
  selected;
- provider/model alias resolved from project AI settings.

Runner sends candidate prompt/example parts through the harness adapter. The
harness executes the candidate, emits OTLP traces, and returns terminal actual
output or output refs.

### External Adapter

Use external adapter runtime when the target is a customer-owned black-box
service, agent, or workflow.

An external adapter is optimizable only when its capability response declares one
of:

- `candidateTargetContentMode = inline_editable_parts`: runner sends the
  candidate prompt/example/model-config parts inline in the `/eval-runs` control
  request, within payload limits.
- `candidateTargetContentMode = adapter_resolved_snapshot`: the adapter can
  resolve `targetSnapshotId` and candidate snapshot IDs from a project-approved
  shared artifact/reference mechanism.

If neither mode is declared, CloudGrid may evaluate and diagnose the adapter
target, but `Start optimization` is disabled for promotable prompt optimization.

External adapter execution still uses OTLP traces for optimizer evidence.
HTTP adapter responses remain control-plane status/output responses and must not
carry full traces, customer logs, file trees, MCP state, or business records.

### Custom Optimizer Adapter

The execution adapter and optimizer adapter are separate. A project may provide a
custom optimizer adapter that proposes prompt/example changes from bounded
CloudGrid evidence.

Custom optimizer adapters may propose candidates, merge/rank proposals, or both.
CloudGrid still owns:

- objective resolution;
- split enforcement;
- evidence redaction and limits;
- candidate target snapshot creation;
- quick-shot and validation execution;
- gate decisions;
- retention;
- promotion.

## Preconditions

Optimization start fails before target or optimizer calls when:

- dataset family is not `classification` or `extraction`;
- selected training or validation split has no ready rows;
- classification label path or allowed label set is missing/ambiguous;
- extraction expected JSON Schema is missing or invalid;
- baseline target snapshot lacks an editable `prompt` or `examples` part and the
  external adapter cannot execute candidate target parts;
- candidate generation would read `test`;
- budget cannot cover one training rollout, one optimizer proposal call, and one
  validation run;
- content policy forbids optimizer use of the selected training row content.

## Default Objectives

Classification:

- primary metric: `classification.accuracy`;
- secondary metrics: `classification.precision_recall_f1`,
  `classification.per_label_support`, `trajectory.problem_count`;
- hard constraints:
  - no increased `trajectory.problem_count`;
  - no new zero-support expected labels in validation;
  - no increased unknown-label item count;
  - no validation accuracy regression;
- tradeoffs: `trajectory.token_total`, `trajectory.cost`,
  `trajectory.duration_ms`;
- tie-breakers: lower cost, then lower latency, then smaller prompt/example
  token delta.

Extraction:

- primary metric: `extraction.field_match_rate`;
- secondary metrics: `extraction.exact_json_match`,
  `extraction.schema_validity`, `extraction.valid_json_rate`;
- hard constraints:
  - no regression in `extraction.schema_validity`;
  - no regression in `extraction.valid_json_rate`;
  - no increased `extraction.missing_field_count`;
  - no increased `extraction.extra_field_count` when `extraFieldPolicy` counts
    extras;
  - no increased `extraction.type_mismatch_count`;
  - no increased `trajectory.problem_count`;
- tradeoffs: `trajectory.token_total`, `trajectory.cost`,
  `trajectory.duration_ms`;
- tie-breakers: higher exact JSON match, then lower cost, then lower latency,
  then smaller prompt/example token delta.

## Default Search Policy

For both families, the default policy is:

- `optimizerKind = critic_mutate_judge_pick`;
- `editablePartKinds = ["prompt", "examples"]` when both are available, else
  the available editable subset;
- `maxEpochs = 4`;
- `rolloutBatchSize = 40` or all eligible training rows when fewer exist;
- `reflectionMinibatchSize = 8`;
- `editBudget = 4`;
- `minEditBudget = 2`;
- `editSchedule = cosine`;
- `gateMode = strict_improvement`;
- `selectionSplit = validation`;
- `allowSlowUpdate = false` for prompt optimization in v2;
- `allowMetaMemory = false` for prompt optimization in v2.

Runner constants for v2:

- generate at most 6 instruction candidates per step;
- generate at most 6 example-set candidates per step;
- run quick-shot pruning on at most 6 candidates per step;
- run full validation on at most 3 candidates per step;
- keep at most 20 rejected prompt/example change summaries or 64 KiB per run,
  whichever is smaller;
- cap candidate prompt diff previews at 2,000 UTF-8 bytes per changed region.

`bootstrap_fewshot` is allowed when the user wants example-only optimization.
It must set `editablePartKinds = ["examples"]` unless a future spec adds another
demo-carrying part kind.

## Family Diagnosis

Before proposing changes, storage-read produces a bounded family diagnosis from
training rollout results.

Classification diagnosis includes:

- overall accuracy;
- per-label support;
- top confusion pairs by count and rate;
- labels with zero or low support;
- unknown-label outputs;
- execution/problem categories;
- high-cost or high-latency rows;
- representative successes to preserve.

Extraction diagnosis includes:

- valid JSON rate;
- schema validity rate;
- exact JSON match rate;
- weakest field paths by field match rate;
- missing field paths;
- extra field paths;
- type mismatch paths;
- frequent invalid JSON/schema errors;
- execution/problem categories;
- representative successes to preserve.

Diagnosis sent to optimizer adapters is capped, redacted, and contains only
training split content permitted by content policy. Validation and test row
content is never sent to proposal generation, rejected memory, or custom
optimizer adapters.

## Candidate Generation

CloudGrid internal optimizer and custom optimizer adapters return structured
candidate proposals. Free-form replacement blobs are invalid.

`PromptOptimizationProposal` fields:

- `id`;
- `family`: `classification` or `extraction`;
- `source`: `label_confusion`, `unknown_label`, `weak_field`,
  `schema_format`, `fewshot_bootstrap`, `cost_latency`, `success_preservation`,
  or `custom_optimizer`;
- `targetPartKind`: `prompt`, `examples`, or `model_config`;
- `operation`: `append_instruction`, `replace_instruction`,
  `insert_section_after`, `replace_section`, `add_examples`,
  `replace_examples`, `remove_examples`, or `reorder_examples`;
- `targetSelector`: section heading, example IDs, or model-config path;
- `content`: proposed content or example refs;
- `rationale`: bounded explanation, not hidden reasoning;
- `supportCount`;
- `affectedMetricIds`;
- `evidenceRefs`;
- `risk`: `low`, `medium`, or `high`.

Runner validates proposals before candidate snapshot creation:

- operation is allowed for the selected editable part;
- target selector exists or insertion target is valid;
- candidate prompt/examples remain within token/byte limits;
- proposal does not request hidden chain-of-thought;
- proposal does not include secrets, raw provider errors, or raw full traces;
- extraction proposals do not mutate dataset schema;
- model-config proposals are rejected unless `model_config` is an explicit
  editable part in the baseline target snapshot.

## Classification Optimization Tactics

The optimizer should combine these proposal families:

- label glossary: add allowed labels, short definitions, and disallowed aliases;
- confusion repair: add contrastive rules for top expected/actual confusion
  pairs;
- unknown-label repair: instruct the target to choose only allowed labels and use
  a configured fallback label only when the dataset defines one;
- boundary examples: add few-shot examples from confused labels and edge cases;
- support balancing: preserve examples for low-support labels without
  overfitting to one class;
- success preservation: include representative correctly classified rows so
  improvements do not regress stable behavior.

The optimizer must not invent new labels. New labels require dataset settings
changes and a new dataset version.

## Extraction Optimization Tactics

The optimizer should combine these proposal families:

- JSON format repair: remove Markdown/free text, require one JSON value, and
  state invalid-output consequences;
- schema hinting: add a compact prompt-facing summary of required fields,
  allowed enum values, null handling, and field descriptions derived from the
  expected JSON Schema;
- weak-field repair: add field-specific extraction rules for paths with low
  match rates;
- missing-field repair: add instructions and examples for fields frequently
  omitted;
- type repair: clarify numeric, boolean, date, enum, array, null, and object
  output requirements;
- extra-field repair: instruct the target to omit fields not allowed by schema
  when `extraFieldPolicy` counts extras;
- success preservation: keep examples that already produce valid schema and
  correct values.

Extraction optimization may add prompt-facing schema summaries or examples.
It must not change `Dataset.settings.expectedJsonSchema`, ready-row expected
values, or field comparator settings.

## Candidate Selection And Gates

Runner flow:

1. Execute training rollout batch.
2. Request storage-read family diagnosis.
3. Request proposal generation from CloudGrid internal optimizer or custom
   optimizer adapter.
4. Merge duplicate proposals by normalized target part, operation, selector, and
   content hash.
5. Rank proposals by support count, affected primary metric, hard-constraint
   relevance, risk, and original order.
6. Build candidate target snapshots by applying up to `editBudget` compatible
   proposals.
7. Run quick-shot pruning on training rows selected by family diagnosis.
8. Run full validation for the top candidates.
9. Accept a candidate only when the primary gate metric strictly improves and all
   hard constraints pass.
10. Persist step evidence, candidate snapshots, comparisons, and rejection
    summaries.
11. Repeat until epochs, steps, budget, or convergence stopping condition is
    reached.

Convergence stops the run early when two consecutive steps produce no candidate
that improves validation primary metric and no unresolved hard-constraint
regression remains in the diagnosis.

Promotion remains explicit through `promoteTargetSnapshot`.

## Prompt Optimization Step Evidence

Classification and extraction prompt optimization persists
`PromptOptimizationStep` records through the optimization step persistence path.

Fields:

- `id`;
- `projectId`;
- `optimizationRunId`;
- `family`;
- `epoch`;
- `step`;
- `status`: `queued`, `running`, `accepted`, `rejected`, `skipped`, or
  `failed`;
- `rolloutEvaluationRunId`;
- `quickShotEvaluationRunId`, optional;
- `validationEvaluationRunId`, optional;
- `diagnosis`: bounded family diagnosis summary;
- `candidateTargetSnapshotIds`;
- `selectedCandidateTargetSnapshotId`, optional;
- `proposedChanges`;
- `selectedChanges`;
- `rejectedChangeSummaries`;
- `trainingScore`;
- `validationScore`, optional;
- `gateDecision`: `accepted_new_best`, `accepted`, `rejected`,
  `failed_preflight`, or `skipped_no_candidates`;
- `problem`, optional;
- `startedAt`, `endedAt`.

Storage-read owns prompt/example diff view models. Frontend must not fetch full
target snapshots and compute route-primary diffs locally.

## Example Fixture Packs

CloudGrid ships deterministic try-it fixture packs for this capability:

- `test_data/ai_eval/classification`;
- `test_data/ai_eval/extraction`.

Each pack must include:

- `README.md` with the scenario purpose and recommended primary metric;
- `dataset-settings.json` in public GraphQL `DatasetSettingsInput` shape;
- `rows.jsonl` with ready training, validation, and test rows using
  `curationStatus`, `contentTreatment`, `sourceRefs`, split values, reasons, and
  metadata;
- `baseline-target.json` with an editable prompt target snapshot reference;
- `baseline-prompt.md` with an intentionally weak prompt;
- `baseline-examples.jsonl` with baseline few-shot examples;
- `expected-optimizer-behavior.json` with expected diagnosis, proposal sources,
  prompt/example change themes, and forbidden mutations.

The classification pack must contain enough examples to surface label
confusions across refund versus invoice, cancellation versus billing, and access
versus technical-bug cases. The extraction pack must contain enough examples to
surface invalid JSON/schema-format problems, weak field paths, optional-field
omissions, distractor amounts, word quantities, country normalization, and zero
totals.

Default local and CI tests use these packs hermetically through the CloudGrid AI
harness adapter. Automated integration and E2E tests must not call live model
providers.

Manual live-model try-it data lives separately under:

- `test_data/ai_eval/manual_real_llm/classification`;
- `test_data/ai_eval/manual_real_llm/extraction`.

Those manual packs may be used only by an operator-driven run after the caller
configures normal project provider settings and model aliases outside the
fixture directory. They must stay provider-neutral and must not contain API
keys, bearer tokens, cookies, project secrets, or raw provider credentials.

## Custom Optimizer Adapter Protocol

Capability response additions:

- `promptOptimizationFamilies`: array containing `classification` and/or
  `extraction`;
- `supportedPromptOptimizerKinds`: array containing `bootstrap_fewshot` and/or
  `critic_mutate_judge_pick`;
- `supportedProposalOperations`;
- `maxEvidenceBytes`;
- `maxProposalCount`;
- `supportsMergeRank`;
- `requiresExpectedValues`: boolean;
- `contentPolicyModes`;
- `maxConcurrentOptimizerCalls`.

Required endpoint:

- `POST {adapterBaseUrl}/prompt-optimization/propose`.

Request carries:

- `traceparent`, optional `tracestate`;
- `x-cloudgrid-request-id`;
- `x-cloudgrid-idempotency-key`;
- project-scoped authentication;
- `optimizationRunId`;
- `stepId`;
- `family`;
- `objective`;
- `searchPolicy`;
- `baselineTargetSnapshotSummary`;
- editable prompt/example content or safe content refs;
- bounded family diagnosis;
- bounded training evidence;
- rejected change summaries for the current run;
- content policy and retention role.

Response carries:

- `proposals`: `PromptOptimizationProposal[]`;
- optional `warnings`;
- optional `usage`;
- optional bounded `rationaleSummary`.

Optional endpoint:

- `POST {adapterBaseUrl}/prompt-optimization/merge-rank`.

If unsupported, runner performs deterministic merge/rank using the rules in this
spec.

## Acceptance Criteria

- Starting classification optimization from a run with missing label options or
  ambiguous JSON label path fails before target execution.
- Starting extraction optimization without an expected JSON Schema fails before
  target execution.
- Managed harness prompt targets produce candidate target snapshots with changed
  prompt and/or examples digests.
- External adapter optimization is disabled unless the adapter proves candidate
  target content execution support.
- Validation row content and test row content are never sent to proposal
  generation, custom optimizer adapters, rejected change memory, or diagnosis
  prompts.
- Candidate generation never mutates dataset schema or expected values.
- A rejected candidate remains visible with bounded evidence and cannot be
  promoted.
- The selected candidate can be promoted only through explicit promotion.

## Verification

- Contract tests cover `PromptOptimizationStep`, proposal operation enums,
  prompt optimization detail reads, and external adapter candidate-content
  capability fields.
- Runner tests cover classification confusion repair, unknown-label repair,
  extraction invalid JSON repair, weak-field repair, quick-shot pruning, strict
  validation gate rejection, custom optimizer adapter proposal validation,
  external adapter candidate-content preflight, no schema mutation, and no
  validation/test content leakage.
- Storage-read tests cover family diagnosis, prompt/example diff view models,
  optimization detail degradation after retention expiry, and aggregate
  comparison reads.
- Frontend tests cover defaulted optimization creation, family-specific
  readiness warnings, runtime mode capability display, candidate diff review,
  rejection visibility, and disabled promotion without validation evidence.
- Integration scenario tests cover importing the classification and extraction
  try-it packs, running baseline evaluation, starting prompt optimization,
  reading `PromptOptimizationStep` detail, external-adapter
  `candidateTargetContentMode` preflight, and explicit promotion gates.
