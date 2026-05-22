---
id: DOM-006
title: AI evaluation
layer: domain
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [VIS-001, CNV-001, TEC-BE-001, TEC-BE-008, ADR-0003, REV-006]
---

# AI Evaluation

## Purpose

The AI evaluation domain turns already-ingested OpenTelemetry spans into a
feature-gated closed-loop workflow for AI-agent teams: observe production agent
evidence, curate datasets, run evaluations, optimize prompts and harness-side
skills/tools, compare experiments, promote only after regression checks pass,
and monitor production quality. It does not replace CloudGrid's generic
trace/log/metric explorer; it adds first-class AI projections and evaluation
workflows on top of preserved telemetry.

## Main Entities

- ENT-AIE-001: AgentRun
- ENT-AIE-002: LlmCall
- ENT-AIE-003: ToolCall
- ENT-AIE-004: RetrievalEvent
- ENT-AIE-005: Dataset
- ENT-AIE-006: DatasetItem
- ENT-AIE-007: Scorer
- ENT-AIE-008: EvalResult
- ENT-AIE-009: Experiment
- ENT-AIE-010: ExperimentRun
- ENT-AIE-011: DatasetItemRun
- ENT-AIE-012: PromptVersion
- ENT-AIE-013: AnnotationQueueItem
- ENT-AIE-014: ProjectAiSettings
- ENT-AIE-017: OnlineEvaluationPolicy
- ENT-AIE-018: DatasetSplitAssignment
- ENT-AIE-019: ExperimentManifest
- ENT-AIE-020: SkillSnapshotRef
- ENT-AIE-021: ToolSnapshotRef
- ENT-AIE-022: DatasetImportJob
- ENT-AIE-023: DatasetExportJob
- ENT-AIE-024: EvalRunPolicy
- ENT-AIE-025: DatasetCandidate
- ENT-AIE-026: DatasetAnonymizationPolicy

Related provider entities:

- ENT-AIP-001: AiProviderProfile
- ENT-AIP-002: AiModelAlias

## Capabilities

- CAP-AIE-001: Ingest AI projections.
- CAP-AIE-002: Evaluate online telemetry.
- CAP-AIE-003: Evaluate offline datasets.
- CAP-AIE-004: Optimize prompts through harness workflows.
- CAP-AIE-005: Annotate traces into datasets.
- CAP-AIE-006: Manage project AI settings.
- CAP-AIE-007: Curate dataset versions and splits.
- CAP-AIE-008: Track production agent quality.
- CAP-AIE-009: Import and export datasets.
- CAP-AIE-010: Suggest and prepare dataset candidates.

## Key Invariants

- AI trace-derived entities are projections of source spans. Source spans, span events, and raw attributes remain the preserved source of truth.
- CloudGrid accepts OTel GenAI (`gen_ai.*`) and OpenInference (`openinference.span.kind`, `llm.*`, `tool.*`, `retrieval.*`) simultaneously. Canonical fields prefer OTel GenAI when both conventions provide the same value, while preserving every raw attribute.
- Prompt, completion, tool parameter, and retrieved-document content is never copied into AI projection entities. Content remains on source span events or raw span attributes and is shown only when content capture was explicitly enabled by the emitter.
- The TypeScript BFF does not score, aggregate, correlate, normalize, or derive AI telemetry. It validates GraphQL input, calls NATS subjects, validates replies, and maps public errors.
- Storage-write is the only service that mutates SurrealDB. Storage-read is the only service that fetches telemetry and AI evaluation read models from SurrealDB.
- The `core/ai-eval-runner` service orchestrates runs through the harness adapter and persists results only by sending storage-write commands over NATS. It never reads or writes SurrealDB directly and never calls model providers directly.
- Public reads and writes for the UI are GraphQL only. No public REST AI-eval API is exposed by CloudGrid.
- Dataset file upload/download endpoints are BFF-owned byte-transfer surfaces
  only. They do not define dataset semantics; import/export behavior is
  controlled by GraphQL and private message bridge contracts.
- Harness is the only execution surface for agent replay, LLM-judge scoring, and prompt optimization.
- Harness run summaries are the adapter source for basic run outcomes. CloudGrid must not infer those outcomes by scraping spans when a run summary is available.
- Project AI settings are control-plane configuration. AI Eval stores policy,
  budget, sampling, dataset, and default provider reference choices. Reusable
  provider profiles and model aliases are owned by project AI provider settings
  in `specs/04-backend/ai-provider-settings.md`.
- Dataset items have an explicit split. `holdout` items must never be used as
  optimization input.
- Dataset items may represent single-turn calls, conversations, tool-call
  assertions, agent trajectories, workflow traces, retrieval cases, or
  production trace references. Scorers must declare the item shapes and evidence
  fields they require instead of assuming every item is a flat prompt/output
  pair.
- Dataset item changes are versioned. Manual add, edit, remove, split changes,
  review changes, imports, trace promotions, anonymization, and suggestion
  commits create a new dataset version or draft-version mutation according to
  the dataset versioning contract. Historical experiment manifests keep their
  original item IDs and version references.
- Production-derived dataset items may be realistically anonymized before
  commit. Realistic anonymization replaces sensitive values with safe fake
  values that preserve semantics, format, locale, and repeated-reference
  consistency. It must record policy provenance and must not store original
  sensitive values in the dataset item.
- Experiment and optimization runs use immutable manifests that snapshot dataset
  version, split selector, scorer versions, solver refs, prompt version refs,
  skill/tool snapshot refs, provider profile refs, budget caps, and harness
  adapter refs.
- Evaluation capabilities are independent of run mode. A scorer definition
  declares execution requirements, content requirements, provider/model needs,
  expected target shapes, latency/cost characteristics, and production-safety
  constraints. Offline experiments, continuous production measurement, backfill,
  CI gates, and future alerting decide which scorer capabilities are allowed by
  policy.
- Eval results store both a normalized comparable score and scorer-specific
  analytics. The normalized score makes cross-run summaries possible; the
  scorer-specific analytics make each scorer explainable and useful in the UI.
  Storage-read owns aggregation into GraphQL-ready view models such as accuracy,
  per-category accuracy, confusion matrices, fact coverage, rubric breakdowns,
  trajectory step outcomes, RAG grounding metrics, and composite gates.
- Experiment, optimization, backfill, and continuous-measurement work runs under
  an `EvalRunPolicy` that controls maximum parallel requests, token and cost
  budgets, rate limiting, backpressure, retry, timeouts, failure budgets,
  checkpoint cadence, and item quarantine behavior. The default maximum
  parallel requests is `10`.
- Runs track item-level execution state. A repeatedly failing or invalid dataset
  item must be marked as `needs_review` or `quarantined` instead of silently
  degrading run quality metrics or blocking otherwise valid items forever.
- Tool calls and agent trajectories are evaluation targets. CloudGrid must be
  able to score tool choice, tool arguments, tool order, retrieval evidence,
  retries, final output, latency, and cost when scorer definitions request it.
- Prompt, skill, and tool candidate promotion is always explicit. CloudGrid
  never auto-promotes a candidate after an optimization run.
- Continuous production measurement is conservative by policy, not by duplicating
  scorer implementations. No production AI projection is scored unless project
  AI Eval is enabled and a project admin has explicitly created and enabled a
  production measurement policy. Production policies may use only scorers whose
  declared requirements are satisfied by the policy's content allowance,
  provider references, budgets, latency class, and safety constraints.
- Continuous production measurement is asynchronous and is not a realtime
  alerting mechanism. Near-realtime alert triggering over AI-eval quality
  signals is out of scope until a later alerting contract defines latency SLOs,
  policy semantics, fanout, and failure behavior.
- Continuous production measurement never creates annotation queue items or
  dataset items automatically. Users review score results, suggestions, or
  clusters and explicitly commit dataset candidates.

## Boundaries

### In Scope

- Projection of AI-relevant spans into agent, model-call, tool-call, and retrieval view models.
- Dataset, scorer, experiment, experiment-run, prompt-version, result, and annotation records.
- Dataset import preview jobs, dataset export jobs, and temporary transfer
  artifacts for JSONL, JSON array, CSV, and ZIP-based dataset exchange.
- Manual dataset item add, edit, remove, split/review updates, search, sort,
  cursor pagination, and large-dataset workbench behavior.
- Dataset candidate generation from production traces, failed eval results,
  clusters, dataset health issues, and coverage gaps, including optional
  realistic anonymization before commit.
- Project AI settings, provider profile references, model alias references,
  online scoring policies, dataset split governance, and experiment manifests.
- Continuous production measurement of newly persisted AI projections, bounded
  by configured sampling, concurrency, rate limits, budgets, and scorer
  capability requirements.
- Offline experiment runs against datasets through the harness adapter.
- Prompt, skill, and tool optimization through TypeScript harness workflows.
- GraphQL views for agent runs, datasets, scorers, experiments, results, and annotation queues.
- Production quality tracking by project, agent, environment, route, tool,
  retrieval source, model, prompt version, and scorer.
- Dataset health and intelligence features: duplicate candidates, leakage
  warnings, oversized item detection, invalid shape detection, flaky item
  detection, failure clustering, coverage gaps, anonymization status, and
  suggestion review state.

### Out Of Scope

- Model-provider proxy or gateway behavior.
- CloudGrid-owned model-provider credentials.
- Model-provider routing or request proxying for application traffic.
- Python runtime, DSPy, TextGrad, Optuna, or ax-llm MIPROv2 inside the deployable surface.
- Metrics ingest. Token and cost summaries are span-derived or harness-summary-derived until the metrics signal is implemented.
- Multi-tenant SaaS billing or production auth expansion beyond existing auth preparation.
- Model fine tuning.
- Alert rules over AI-eval quality signals.
- Automatic dataset mutation or annotation routing from production scores.
- Near-realtime online alerting over LLM-judge, semantic, RAG, tool-correctness,
  trajectory, or content-bearing scoring.

## Evaluation Capability Model

Scorer kinds describe reusable evaluation capabilities. They are not bound to
one workflow. A scorer definition must declare:

- `kind`: deterministic, schema/JSON, semantic, RAG, LLM judge, pairwise judge,
  tool correctness, trajectory, workflow, human review, or composite.
- `targetShapes`: one or more supported dataset or run target shapes:
  `single_turn`, `conversation`, `tool_call`, `agent_trajectory`,
  `workflow_trace`, `retrieval_case`, or `production_trace_ref`.
- `requiredEvidence`: input, expected output, actual output, trace/span refs,
  transcript messages, tool calls, retrieved documents, workflow steps, metrics,
  or human labels.
- `execution`: local deterministic, harness scorer, harness model call,
  human-mediated, or aggregate-only.
- `contentAccess`: none, metadata-only, captured-content, dataset-content, or
  retrieved-document-content.
- `providerRequirements`: required model alias or provider profile purpose when
  a model or embedding call is needed.
- `runSafety`: whether it may run in offline experiments, continuous production
  measurement, backfill, CI gates, or future realtime alerting.
- `costClass` and `latencyClass`: used by run policies before scheduling.
- `resultSchema`: scorer-specific metrics, breakdowns, evidence, and
  visualization expectations.

Run modes select scorer capabilities by these declarations. They must not
create separate scorer implementations for offline versus online use.

## Eval Result Analytics Model

Every `EvalResult` contains:

- `score`: normalized `0..1` value when the scorer can produce one;
- `passed`: boolean gate result;
- `label`: optional predicted/actual/expected label for classification-like
  scorers;
- `metrics`: scorer-specific numeric metrics;
- `breakdown`: scorer-specific structured detail;
- `evidence`: bounded source pointers, quotes, spans, tool calls, retrieved
  document refs, or judge rationale summaries;
- `visualization`: recommended UI display kind and configuration;
- `problem`: technical or dataset-quality issue when scoring could not produce
  a valid model-quality result.

Required scorer analytics:

| Scorer family | Required analytics |
| --- | --- |
| Classification/exact label | Overall accuracy, per-category accuracy, support counts, confusion matrix, false-positive and false-negative examples. |
| JSON/schema/structured output | Validity rate, missing field counts, invalid field counts, schema path issues, representative invalid outputs. |
| LLM judge rubric | Overall score, pass/fail, rubric criterion scores, primary fact coverage, secondary/background fact coverage, missing critical facts, unsupported claims, bounded judge rationale. |
| Pairwise judge | Winner, margin/confidence, tie rate, criterion breakdown, regression reason. |
| Semantic similarity | Similarity distribution, threshold pass rate, low-similarity examples, embedding/model refs. |
| RAG | Faithfulness, context recall, answer relevance, citation/support coverage, unsupported claim count, missing expected evidence. |
| Tool correctness | Tool selection accuracy, argument correctness, missing/extra tool calls, order violations, retry/fallback behavior. |
| Trajectory/workflow | Step pass rate, required/forbidden step outcomes, handoff correctness, loop/retry bounds, final outcome score. |
| Human review | Rating distribution, label distribution, reviewer agreement when available, unresolved review counts. |
| Composite | Child scorer weights, gates, blocking failures, final pass/fail reason. |

Full prompt/completion/tool/retrieval content is shown only when content capture,
dataset content treatment, and authorization allow it. Otherwise result evidence
uses pointers, digests, bounded quotes, and sanitized summaries.

## Run Modes

Approved run modes:

- `offline_experiment`: run a pinned dataset version through a solver and score
  outputs for development, validation, and regression.
- `optimization`: run a dataset through an optimizer that proposes prompt,
  skill, or tool candidates, then score candidates against the same scorer
  capability model.
- `continuous_measurement`: asynchronously score sampled production projections
  and quality segments. This is not realtime alerting.
- `dataset_backfill`: score historical traces, imported dataset items, or
  unscored dataset versions to populate quality, health, or suggestion views.
- `ci_regression_gate`: run fixed regression datasets and exit non-zero when
  configured gates fail.

Future run mode:

- `realtime_alerting`: near-realtime scoring for alert triggers. It is out of
  scope until a separate alerting spec defines timing guarantees and failure
  semantics.

## Dataset Intelligence Roadmap

Dataset quality is a first-class product pillar, not only an import utility.

Near-term features:

- production trace to dataset candidate suggestions;
- failed or low-score result clustering;
- duplicate and near-duplicate candidate warnings;
- oversized item and token-limit detection;
- invalid JSON/schema and missing expected-output detection;
- flaky item detection across repeated runs;
- coverage gaps by route, tool, model, retrieval source, prompt version,
  workflow, scorer, and production segment;
- realistic anonymization policies before suggestion or promotion commit;
- human review and explicit commit for every candidate.

Future features:

- synthetic candidate generation from observed gaps or failures, always labeled
  as synthetic;
- semantic leakage detection with embeddings;
- workflow graph diffing and automatic trajectory assertion drafts;
- closed-loop improvement assistant that proposes dataset additions, runs
  optimization, validates regressions, and opens a promotion proposal with
  trace-level evidence. It must not auto-promote.

## Usage Perspective

An engineer running an AI agent points their app or harness OTLP exporter at
CloudGrid. CloudGrid preserves generic traces as before and additionally
projects AI spans when recognized. The engineer enables AI Eval for a project,
selects provider profiles and model aliases in project settings, promotes
failed or interesting traces into reviewed dataset items, assigns splits,
defines scorers, runs baseline and candidate experiments through harness,
inspects scoreboards with trace-level evidence, runs prompt or skill
optimization, promotes a winning candidate explicitly, and monitors production
quality through online policies.

The expected output is a persisted `ExperimentRun` with immutable manifest,
per-item outputs, `EvalResult` records, comparison summary, annotation backlog,
and production quality view models surfaced through GraphQL.

For production feedback loops, the expected output is a set of asynchronous
quality measurements, dataset candidates, anonymization provenance, clustering
and coverage views, and explicit user-approved dataset commits that can feed the
next offline experiment or optimization run.

## Autonomous Implementation Contract

Implementation agents must treat this domain and the registered AI-eval specs
as complete for the approved v1 scope. They must not introduce new public
fields, NATS subjects, storage tables, scorer kinds, optimizer kinds, route
semantics, retry behavior, content-capture behavior, provider credential
handling, or service boundaries outside the declared contracts.

If implementation discovers a missing behavior, the agent must stop and update
the relevant spec plus the matching GraphQL, AsyncAPI, JSON Schema, generated
TypeScript, generated Go, and contract tests before writing service or frontend
logic. Implementation code must never compensate for a missing contract by
using ad hoc strings, local frontend truth, BFF-side telemetry derivation, or
direct SurrealDB access outside the owning service.

## Promotion Rule

ADR-0003 remains valid for the MVP. This domain is the explicit post-MVP enhancement that models first-class AI entities while retaining ADR-0003's preservation invariant.
