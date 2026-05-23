---
id: TEC-BE-014
title: AI evaluation runner
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-22
provenance: from-user
depends_on: [DOM-006, TEC-BE-001, ADR-0007, TEC-BE-024]
---

# AI Evaluation Runner

## Service

`core/ai-eval-runner` is a feature-gated Go service enabled by the `aieval` build tag and `CLOUDGRID_AI_EVAL_ENABLED=true`.

Runtime configuration:

- `CLOUDGRID_AI_EVAL_ENABLED`: when not `true`, the runner process exits
  successfully without subscribing to message subjects.
- `CLOUDGRID_NATS_URL`: NATS message bridge URL, shared with other private
  services.
- `CLOUDGRID_AI_EVAL_HARNESS_URL`: base URL for the trusted harness adapter.
  Required when AI Eval is enabled.
- `CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST`: health listener host, default
  `0.0.0.0`.
- `CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT`: health listener port, default `8085`.

## Responsibilities

- Own `ExperimentRun` lifecycle.
- Consume `ai.persisted.projections` for online scoring.
- Handle `eval.experiment.start`, `eval.experiment.cancel`, and `eval.optimization.start`.
- Handle run pause/resume lifecycle through the same experiment-run control
  boundary when declared in the message contracts.
- Resolve immutable run manifests through storage-read/control-plane ports
  before execution.
- Call the harness adapter over HTTP for `/v1/run`, `/v1/score`, and `/v1/optimize`.
- Preserve W3C trace context on every harness adapter call.
- Persist all mutable AI-eval records through storage-write command subjects.
- Publish durable experiment progress notifications for storage-read live fanout.
- Execute local scorer capabilities locally and delegate harness-required scorer
  capabilities through the harness adapter only when the resolved run policy
  permits the scorer's content, provider, model alias, cost, latency, and safety
  requirements.
- Enforce split, budget, token budget, sampling, max parallel requests, rate
  limit, backpressure, retry, timeout, pause/resume/cancel, item quarantine, and
  idempotency rules before invoking harness.
- Pass provider profile IDs, model aliases, prompt version refs, skill snapshot
  refs, and tool snapshot refs to harness without resolving provider secrets.

## Non-Responsibilities

- Does not read or write SurrealDB.
- Does not call OpenAI, Anthropic, Bedrock, Azure, or other model providers directly.
- Does not expose public HTTP endpoints.
- Does not implement Python-based optimizers.
- Does not own online policy matching semantics locally.
- Does not create annotation queue items, dataset candidates, or dataset items
  automatically from production measurement results.
- Does not feed production measurement results into alerting. Near-realtime
  alerting is a future run mode.
- Does not read `holdout` split data during optimization.

## Harness Adapter Contract

The adapter is a trusted-network HTTP service. It exposes:

- `POST /v1/run`
- `POST /v1/score`
- `POST /v1/optimize`
- `POST /v1/sandboxes/start`
- `POST /v1/sandboxes/pause`
- `POST /v1/sandboxes/resume`
- `POST /v1/sandboxes/abort`
- `POST /v1/sandboxes/cleanup`
- `GET /healthz`
- `GET /v1/agents`

Responses contain run outputs, score results, candidate prompt IDs, and summaries. Spans are never returned in adapter response bodies; harness emits spans to CloudGrid through OTLP.

Sandbox lifecycle calls are mandatory even for ephemeral adapters. For
ephemeral profiles they may acknowledge control state without process or
filesystem snapshotting. Durable replay adapters must use the same calls and
return durable checkpoint refs, so the runner can switch sandbox profiles
without adding a second pause/resume implementation. Durable replay adapters
must satisfy the storage, retention, encryption, cleanup retry, quota, and
verification requirements in `specs/04-backend/ai-runtime-structure.md` before a
project policy may select `durable_replay_workspace`.

CloudGrid aligns with the current harness boundary:

- runner calls pass W3C `traceparent`/`tracestate` into harness run options;
- basic run status, token totals, model call counts, tool call counts, and agent call counts come from harness run summaries, not from parsing spans;
- deterministic scorer definitions use the harness JSON Pointer subset for `contains`, `regex`, `json-schema`, and `attribute-equality`;
- prompt candidate evaluation may be delegated to harness helpers, but CloudGrid owns datasets, experiment runs, prompt versions, score persistence, and UI state;
- prompt, skill, and tool candidate execution may be delegated to harness, but
  CloudGrid owns run manifests, candidate references, comparisons, score
  persistence, and promotion state;
- harness metrics are ingested later through standard OTLP metrics, not returned through adapter response bodies.

## Sandbox Lifecycle

AI Eval uses the shared harness sandbox profiles defined in
`specs/04-backend/ai-runtime-structure.md`.

Approved AI Eval profiles:

- `ephemeral_eval_item`: used for offline dataset item execution, scorer
  execution, production measurement scoring, and dataset backfill attempts.
- `ephemeral_optimization_candidate`: used for optimizer candidates and
  candidate/item evaluation attempts.

`durable_replay_workspace` is out of scope for AI Eval v1. The runner must not
require harness, operating system, or filesystem snapshot/restore to implement
pause/resume. If a future policy selects durable replay, the runner must still
persist CloudGrid item/result checkpoints and must treat adapter checkpoint refs
as optional execution accelerators, not as the only source of run truth.

For every `/v1/run`, `/v1/score`, and `/v1/optimize` call, the runner passes:

- manifest digest and run IDs;
- dataset item or candidate refs;
- bounded input/evidence payloads or sandbox file refs;
- scorer refs and required evidence declarations;
- prompt, skill, tool, provider profile, and model alias refs;
- run policy limits;
- W3C trace context;
- sandbox profile.

Before work is scheduled, the runner calls `/v1/sandboxes/start` for the
attempt or batch according to the resolved run policy. Adapter response includes
an opaque `sandboxRef`, selected profile, cleanup deadline, and whether durable
checkpointing is supported. The runner passes `sandboxRef` into subsequent
`/v1/run`, `/v1/score`, or `/v1/optimize` calls for that attempt.

For durable replay profiles, lifecycle responses may also include an opaque
`checkpointRef`. The runner persists the ref only as adapter execution metadata
with the run attempt; it must not dereference, parse, log, expose, or include
the ref in public GraphQL payloads except through explicit future debugging
contracts. A stale, missing, expired, or unreadable durable checkpoint must
degrade to a fresh eligible attempt when policy permits fallback; otherwise the
attempt fails with an infrastructure/setup problem and does not affect
model-quality metrics.

The sandbox must not receive provider secrets, CloudGrid credentials, host paths,
raw NATS subjects, SurrealDB connection details, or authorization claims. Harness
adapters resolve provider execution through their own configured provider
boundary and emit OTLP telemetry back to CloudGrid.

Pause/resume behavior:

- pausing stops scheduling new sandbox attempts;
- runner calls `/v1/sandboxes/pause` for active sandbox refs when policy
  requires active-attempt pause rather than drain;
- active sandbox attempts may finish, timeout, or abort according to run policy;
- paused runs persist only CloudGrid records: completed item runs, eval results,
  candidate refs, summaries, checkpoints, and problem records;
- resuming calls `/v1/sandboxes/resume` when an adapter returned a durable
  checkpoint ref, otherwise it creates fresh sandboxes for unfinished eligible
  attempts;
- the runner never attempts to resume process memory, open file handles,
  network sockets, or temporary sandbox filesystem state;
- cleanup calls `/v1/sandboxes/cleanup` after bounded outputs, artifacts, and
  evidence are persisted. Cleanup failures are bounded infrastructure problems
  and must not mutate eval scores;
- cleanup is retried by `sandboxRef` and optional `checkpointRef` according to
  the run policy. Retry exhaustion records an infrastructure problem and leaves
  already persisted item runs and eval results queryable.

Abort behavior:

- cancel calls `/v1/sandboxes/abort` for active sandbox refs when best-effort
  interruption is possible;
- unknown abort outcome is handled by idempotent persistence keys and cleanup
  retries;
- already persisted item runs and eval results remain queryable.

Verification must prove pause/resume does not depend on sandbox snapshotting and
that duplicate harness attempts cannot duplicate CloudGrid persisted records.

Public run-control contract:

- `Mutation.pauseExperimentRun(id)` maps to `eval.experiment.pause` with
  `ExperimentRunControlRequest.command = pause`.
- `Mutation.resumeExperimentRun(id)` maps to `eval.experiment.resume` with
  `ExperimentRunControlRequest.command = resume`.
- BFF may pass `expectedManifestDigest` only when it already read the run
  manifest digest from GraphQL; storage-read remains the authority for the
  persisted digest.
- Repeated pause for `pausing` or `paused` returns the current run without
  scheduling additional sandbox calls.
- Repeated resume for `resuming` or `running` returns the current run without
  scheduling additional sandbox calls.
- Resume from any terminal state fails with non-retryable `ERR-AIE-001`.
- Resume with a stale or mismatched manifest digest fails with non-retryable
  `ERR-AIE-002` before any harness call.
- Pause/resume requests are idempotent by `experimentRunId`, `command`, current
  run version, and optional `idempotencyKey`.
- Cancel remains the only v1 public terminal stop command. There is no public
  cleanup mutation; cleanup is runner-owned and reported through run problems,
  progress events, and infrastructure health.

## Evaluation Capability Contract

Scorer definitions are reusable across offline experiments, optimization,
backfill, CI gates, and continuous production measurement. The runner schedules a
scorer only after storage-read resolves:

- target shapes and required evidence;
- execution location: local deterministic, harness scorer, model-backed harness
  scorer, human-mediated, or aggregate-only;
- required content class: none, metadata-only, captured-content,
  dataset-content, or retrieved-document-content;
- provider profile and model alias requirements;
- cost class and latency class;
- run-safety classification for the requested run mode.

The runner must not hard-code scorer kind allowlists by run mode. It enforces
the resolved requirements from scorer definitions and policy.

The machine-readable scorer definition contract is
`specs/03-contracts/entities/ai/scorer-definition.schema.json`. Scorer creation,
storage-write persistence, storage-read requirement resolution, runner
scheduling, and harness adapter calls must use that schema. Unknown scorer
definition fields are invalid. A scorer can be used in a run mode only when its
declared `requirements.allowedRunModes`, content class, latency class, provider
profile, model alias, and cost class are satisfied by the resolved policy.

## Adapter Package Location

The harness adapter package lives in `apps/packages/cloudgrid-harness-adapter` in the CloudGrid repo for the v1 implementation. The package name is `@cloudgrid/harness-adapter`. This is the only supported v1 placement for implementation tickets and generated contract references.

## Idempotency

Runner requests are idempotent at CloudGrid persistence boundaries:

- Dataset item execution key: `(experimentRunId, datasetItemId)`.
- Eval result key: `(targetKind, targetId, scorerId, scorerVersion)`.
- Optimization candidate key: `(experimentRunId, promptVersionHash)`.

If an adapter call is retried after an unknown outcome, duplicate harness execution is allowed, but duplicate CloudGrid records are not.

## Run Manifest Rules

Before starting an offline experiment or optimization, the runner obtains a
manifest from storage-read/control-plane ports. The manifest contains:

- `experimentRunId`;
- `experimentId`;
- `datasetId` and `datasetVersion`;
- resolved dataset item IDs;
- split selector;
- scorer IDs and versions;
- baseline run or baseline prompt/skill refs;
- solver reference;
- prompt version refs;
- skill snapshot refs;
- tool snapshot refs;
- provider profile refs and model aliases;
- budget caps and concurrency caps;
- optimizer kind and config when applicable;
- manifest digest.

The manifest digest is persisted with the run. A resumed run must use the same
manifest digest or fail with `ERR-AIE-002`.

## Run Policy Rules

Every experiment, optimization, backfill, CI gate, and production measurement
run resolves an `EvalRunPolicy` before scheduling work.

Policy fields:

- `maxParallelRequests`: maximum concurrent harness/model/scorer calls. Default
  `10`.
- `tokenBudget`: optional per-run, per-item input, and per-item output token
  ceilings.
- `costBudget`: optional per-run and daily project cost ceilings.
- `rateLimit`: optional per-provider, per-project, and per-run request/token
  pacing.
- `backpressure`: behavior when harness, provider, NATS, storage-write, or
  internal queues lag. Supported behavior is slow scheduling, pause, skip, or
  fail according to policy.
- `retry`: retryable error codes, max attempts, exponential backoff, jitter, and
  retry budget.
- `timeout`: item execution, scorer execution, adapter call, and whole-run
  deadlines.
- `failureBudget`: maximum model-quality failures and maximum technical errors
  before a run fails.
- `checkpoint`: item/scorer completion checkpoint cadence for resume.
- `quarantine`: rules for marking oversized, invalid, flaky, or repeatedly
  failing dataset items.
- `workspaceQuota`: optional sandbox/workspace caps for max workspace bytes,
  single file bytes, file count, checkpoint payload bytes, snapshot bytes,
  workspace age, active workspaces, paused workspaces, and concurrent resumes.
  Defaults are adapter-specific but must be visible through resolved policy or
  adapter inspection before durable replay is enabled.
- `cleanupRetry`: retryable cleanup outcomes, max attempts, backoff, jitter,
  retry budget, and terminal orphan handling for sandbox/workspace cleanup.

The machine-readable source of truth is
`specs/03-contracts/entities/ai/eval-run-policy.schema.json`. GraphQL input and
output types must stay field-for-field aligned with that schema. Implementers
must not add ad hoc `runPolicy` JSON fields in BFF, runner, adapter, or frontend
code.

## Run Lifecycle

Run statuses:

- `queued`;
- `running`;
- `pausing`;
- `paused`;
- `resuming`;
- `cancelling`;
- `cancelled`;
- `failed`;
- `completed`.

Pause stops scheduling new work and checkpoints completed item/scorer state.
Resume validates the persisted manifest digest and continues unfinished eligible
items in fresh sandboxes. Cancel stops future work and makes already persisted
item runs queryable.

Item statuses:

- `pending`;
- `running`;
- `passed`;
- `failed`;
- `errored`;
- `skipped`;
- `needs_review`;
- `quarantined`.

Dataset validation failures, token-limit failures, invalid JSON, unsupported
target shape, missing required evidence, and repeated item-specific technical
failures are item-quality issues. They must be surfaced in dataset health and
candidate suggestions separately from model-quality regressions.

### Runner State Machine

Only these `ExperimentRun` transitions are allowed:

| From | Event | To | Required Side Effects |
| --- | --- | --- | --- |
| `queued` | scheduler starts | `running` | Persist manifest digest and resolved `EvalRunPolicy`; publish progress event. |
| `queued` | cancel requested | `cancelled` | Persist terminal status; no harness calls start. |
| `running` | pause requested | `pausing` | Stop scheduling new items; call sandbox `pause` for active refs when policy requires active-attempt pause. |
| `pausing` | active attempts drained, aborted, or checkpointed | `paused` | Persist completed item/scorer checkpoints and progress summary. |
| `paused` | resume requested with same manifest digest | `resuming` | Validate manifest digest and resolved policy compatibility. |
| `resuming` | scheduling restarts | `running` | Start unfinished eligible items; use durable checkpoint refs only when present and valid. |
| `running` | cancel requested | `cancelling` | Stop scheduling; call sandbox `abort` for active refs when possible. |
| `pausing` | cancel requested | `cancelling` | Stop pause completion; abort active refs when possible. |
| `paused` | cancel requested | `cancelled` | Persist terminal status; do not start cleanup beyond known sandbox refs. |
| `resuming` | cancel requested | `cancelling` | Abort newly active refs when possible. |
| `cancelling` | abort/cleanup complete or exhausted | `cancelled` | Persist terminal status and cleanup problem records if needed. |
| `running` | all eligible items complete within failure budget | `completed` | Persist summary, final progress, and cleanup refs. |
| `running` | failure budget exceeded or non-retryable setup failure | `failed` | Persist problem classification and cleanup refs. |
| `pausing` | non-retryable checkpoint/setup failure | `failed` | Persist infrastructure/setup problem. |
| `resuming` | manifest mismatch or non-retryable resume setup failure | `failed` | Persist `ERR-AIE-002` or mapped setup problem. |

All other transitions are invalid and must fail validation before mutating run
state. Repeated pause, resume, and cancel commands for the current state are
idempotent and return the current run snapshot.

Only these `DatasetItemRun` transitions are allowed:

| From | To | Rule |
| --- | --- | --- |
| `pending` | `running` | Scheduler acquired item idempotency key. |
| `pending` | `skipped` | Policy, split, content allowance, or budget skips before harness execution. |
| `pending` | `quarantined` | Dataset item is already quarantined or preflight quarantine triggers. |
| `running` | `passed` | All required scorer results pass. |
| `running` | `failed` | At least one valid scorer result is a model-quality failure. |
| `running` | `errored` | Technical, scorer/config, or infrastructure failure prevents valid scoring. |
| `running` | `needs_review` | Human scorer or review gate is required. |
| `running` | `quarantined` | Repeated item-quality failure crosses quarantine policy. |
| `errored` | `running` | Retry attempt is within policy and idempotency key is unchanged. |
| `needs_review` | `passed` or `failed` | Human review result is persisted. |

`passed` and `failed` are model-quality terminal states. `skipped`,
`quarantined`, and exhausted `errored` are non-model-quality terminal states and
must not affect accuracy metrics.

## Production Measurement Policy Rules

For continuous production measurement, runner receives matched policy references from storage-read.
It may enforce budget, sampling, and concurrency decisions only from the
resolved policy data. It must not inspect raw traces and invent policy matching
outside storage-read semantics.

Production measurement uses the same scorer capability contract:

- runner resolves matches through `eval.online.policy_matches.resolve`;
- storage-read returns only scorers whose declared requirements are satisfied by
  the enabled policy;
- runner rejects or skips any scorer whose resolved requirements are missing or
  disallowed with `ERR-AIE-002`;
- runner executes local scorers locally and calls harness `/v1/score` only when
  policy permits the scorer's content/provider/budget/latency requirements;
- runner must not resolve provider secrets or forward content classes not
  allowed by policy;
- runner persists only `EvalResult` or bounded skipped-result records through
  `eval.results.persist`;
- runner ignores policy annotation defaults during notification handling.
  Manual annotation or dataset candidate creation is triggered only by
  user-facing BFF mutations.

## Eval Result Persistence

For every scorer execution, the runner persists an `EvalResult` with:

- normalized `score` when available;
- `passed`;
- scorer family/kind and version refs;
- target kind and target ID;
- run mode and experiment/policy refs when applicable;
- scorer-specific `metrics`, `breakdown`, and `visualization` payloads that
  conform to the scorer definition's `resultSchema`;
- bounded `evidence` with source pointers, sanitized quotes, trace/span refs,
  retrieved document refs, tool-call refs, or judge-rationale summaries;
- `problem` when scoring is skipped, invalid, or technically failed.

The machine-readable payload contract is
`specs/03-contracts/entities/ai/eval-result-payload.schema.json`. Scorer
implementations must emit the payload shape that matches their `resultKind`.
Storage-read may aggregate multiple `EvalResult` records into run-level
analytics, but it must keep the same visualization kinds and bounded evidence
rules. The frontend must render the returned view model and must not recompute
confusion matrices, fact coverage, RAG grounding, tool diffs, workflow steps, or
composite gates from raw rows.

Required result visualizations:

| `resultKind` | `metrics` owner | Required visualization kind | Required user-visible fields |
| --- | --- | --- | --- |
| `classification` | scorer or storage-read aggregate | `confusion_matrix` | overall accuracy, per-label accuracy/support, matrix labels, matrix counts, bounded example refs. |
| `json_schema` | scorer | `table` | valid rate, invalid path counts, missing required fields, representative invalid examples. |
| `llm_judge` | scorer | `fact_coverage` or `rubric_breakdown` | score, primary fact coverage, secondary/background fact coverage, missing critical facts, unsupported claims, bounded rationale summary. |
| `pairwise_judge` | scorer | `rubric_breakdown` | winner, margin/confidence, compared output refs, rubric criterion outcomes. |
| `semantic_similarity` | scorer | `scalar` or `distribution` | mean score, threshold, pass/fail count, nearest failure examples. |
| `rag` | scorer | `rag_grounding` | faithfulness, context recall, answer relevance, citation coverage, required/forbidden document refs. |
| `tool_correctness` | scorer | `tool_call_diff` | expected/actual tool name, argument diffs, missing/extra calls, order violations. |
| `trajectory` | scorer | `trajectory_steps` | expected/actual step sequence, matched/missing/extra steps, terminal outcome. |
| `workflow` | scorer | `workflow_steps` | agent/workflow phase, tool-loop status, branch outcome, failing step refs. |
| `human_review` | storage-read aggregate | `distribution` | labels, counts, reviewer status, unresolved count. |
| `composite` | storage-read aggregate | `composite_gate` | child scorer refs, weights, required gates, failed blocker gates. |

If a scorer cannot produce its required visualization, it must persist a
scorer/config `problem` and must not store an ad hoc JSON visualization. New
visualization kinds require updating GraphQL enum values, JSON Schema,
storage-read aggregation rules, frontend rendering, and contract checks in the
same change.

The runner must distinguish:

- model-quality failures: valid scorer result where the model/application failed
  the evaluation;
- item-quality failures: invalid dataset shape, missing expected evidence,
  oversized input, invalid JSON, unsupported target shape, or quarantined item;
- scorer/config failures: invalid scorer definition, missing provider/model
  alias, unsupported content access, or invalid threshold/rubric;
- infrastructure failures: harness/provider/NATS/storage timeout, rate limit,
  or backpressure.

Only model-quality failures affect accuracy and regression metrics. Item,
scorer/config, and infrastructure failures are visible as problem counts and
dataset or setup health issues.

## Optimizer Rules

Optimization input may include `optimization` and `validation` splits. It must
not include `holdout`. `regression` may be used only for post-candidate
regression gates, not candidate search. The runner rejects invalid manifests
before calling harness.

Implemented optimizer kinds:

| Optimizer | Required Config | Output Records | Rejection Rules |
| --- | --- | --- | --- |
| `bootstrap_fewshot` | `candidateCount`, `maxExamplesPerCandidate`, `selectionScorerIds`, `seed`, and optional `diversityStrategy`. | Candidate `PromptVersion` records with selected demonstration item IDs in metadata. | Rejects empty optimization split, holdout input, candidate count over policy budget, or missing scorer refs. |
| `critic_mutate_judge_pick` | `candidateCount`, `mutationInstructions`, `judgeScorerIds`, `seed`, `maxRounds`, and optional `keepTopK`. | Candidate `PromptVersion` records plus critic/judge summaries and comparison result refs. | Rejects missing judge model alias, missing scorer refs, holdout input, or max rounds over policy budget. |

All optimizer configs are immutable manifest inputs. The runner must persist the
exact config, seed, split selector, scorer refs, base prompt/skill/tool refs,
and run policy in the manifest before calling harness. Harness may stream
candidates, but CloudGrid owns candidate IDs, prompt version hashes, comparison
records, and promotion state.

Roadmap optimizer names such as `mipro_v2` and `reflective_text_gradient` must
fail with a non-retryable unsupported optimizer problem unless a future spec
defines their TypeScript execution path, manifest config, budget semantics,
telemetry, and harness capability negotiation.

Promotion rules:

- promotion is a user mutation and never automatic;
- promotion requires a completed optimization run;
- promotion requires the selected candidate to pass configured validation and
  regression gates;
- promotion must show blockers for missing holdout/regression evidence, budget
  exceeded, quality regression, latency regression, cost regression, failed
  required scorer, stale baseline, or stale candidate hash;
- promotion records the source experiment run, candidate prompt version hash,
  and target tag.

## Parallel Implementation Boundaries

AI Eval implementation can be split across agents only along these ownership
boundaries. Agents must not create fields, states, routes, subjects, or error
codes outside their assigned scope.

| Agent | Write Scope | Required Read Scope | Must Not Decide |
| --- | --- | --- | --- |
| Contract agent | `specs/03-contracts`, generated contract outputs, contract tests. | AI Eval capability/backend/frontend specs. | Product behavior, UI layout, storage semantics, scorer math. |
| BFF agent | `apps/backend`, GraphQL resolvers, bridge clients, public API client alignment. | GraphQL SDL, message contracts, errors, auth specs. | Storage query semantics, runner scheduling, frontend-only state. |
| Runner agent | `core/ai-eval-runner`, harness adapter client, runner tests. | Run policy schema, lifecycle state machine, message contracts, harness adapter contract. | GraphQL shapes, storage schema, scorer UI. |
| Storage-read agent | `core/storage-read`, query semantics, aggregation/view models. | Entity schemas, query semantics, frontend result view requirements. | Mutations, runner scheduling, frontend recomputation. |
| Storage-write agent | `core/storage-write`, SurrealDB mutations, idempotency keys. | Entity schemas, message contracts, persistence specs. | Read aggregation, runner scheduling, UI behavior. |
| Frontend agent | `apps/frontend`, `apps/packages/ui-contracts`, UX tests. | GraphQL contracts, UX concept, design system. | Score computation, policy matching, dataset health, backend aggregation. |
| Harness adapter agent | `apps/packages/cloudgrid-harness-adapter`. | Adapter contract, run policy schema, durable replay requirements. | CloudGrid persistence, project auth, UI behavior. |

If an implementation ticket cannot be completed without choosing behavior not
defined in the specs above, the agent must stop and update the relevant spec
first.
