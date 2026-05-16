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
- ENT-AIE-015: ProviderProfile
- ENT-AIE-016: ModelAlias
- ENT-AIE-017: OnlineEvaluationPolicy
- ENT-AIE-018: DatasetSplitAssignment
- ENT-AIE-019: ExperimentManifest
- ENT-AIE-020: SkillSnapshotRef
- ENT-AIE-021: ToolSnapshotRef

## Capabilities

- CAP-AIE-001: Ingest AI projections.
- CAP-AIE-002: Evaluate online telemetry.
- CAP-AIE-003: Evaluate offline datasets.
- CAP-AIE-004: Optimize prompts through harness workflows.
- CAP-AIE-005: Annotate traces into datasets.
- CAP-AIE-006: Manage project AI settings.
- CAP-AIE-007: Curate dataset versions and splits.
- CAP-AIE-008: Track production agent quality.

## Key Invariants

- AI trace-derived entities are projections of source spans. Source spans, span events, and raw attributes remain the preserved source of truth.
- CloudGrid accepts OTel GenAI (`gen_ai.*`) and OpenInference (`openinference.span.kind`, `llm.*`, `tool.*`, `retrieval.*`) simultaneously. Canonical fields prefer OTel GenAI when both conventions provide the same value, while preserving every raw attribute.
- Prompt, completion, tool parameter, and retrieved-document content is never copied into AI projection entities. Content remains on source span events or raw span attributes and is shown only when content capture was explicitly enabled by the emitter.
- The TypeScript BFF does not score, aggregate, correlate, normalize, or derive AI telemetry. It validates GraphQL input, calls NATS subjects, validates replies, and maps public errors.
- Storage-write is the only service that mutates SurrealDB. Storage-read is the only service that fetches telemetry and AI evaluation read models from SurrealDB.
- The `core/ai-eval-runner` service orchestrates runs through the harness adapter and persists results only by sending storage-write commands over NATS. It never reads or writes SurrealDB directly and never calls model providers directly.
- Public reads and writes for the UI are GraphQL only. No public REST AI-eval API is exposed by CloudGrid.
- Harness is the only execution surface for agent replay, LLM-judge scoring, and prompt optimization.
- Harness run summaries are the adapter source for basic run outcomes. CloudGrid must not infer those outcomes by scraping spans when a run summary is available.
- Project AI settings are control-plane configuration. They store provider
  metadata, model aliases, online scoring policies, budgets, and opaque
  credential references only. Raw model-provider API keys are not stored in
  CloudGrid v1.
- Dataset items have an explicit split. `holdout` items must never be used as
  optimization input.
- Experiment and optimization runs use immutable manifests that snapshot dataset
  version, split selector, scorer versions, solver refs, prompt version refs,
  skill/tool snapshot refs, provider profile refs, budget caps, and harness
  adapter refs.
- Tool calls and agent trajectories are evaluation targets. CloudGrid must be
  able to score tool choice, tool arguments, tool order, retrieval evidence,
  retries, final output, latency, and cost when scorer definitions request it.
- Prompt, skill, and tool candidate promotion is always explicit. CloudGrid
  never auto-promotes a candidate after an optimization run.
- Online scoring v1 is conservative: no production AI projection is scored
  unless project AI Eval is enabled and a project admin has explicitly created
  and enabled an online policy.
- Online scoring v1 executes deterministic scorers only. LLM-judge, semantic,
  RAG, tool-correctness, trajectory, and human-review scorer families remain
  valid for offline workflows or future online waves, but online policies must
  reject them in v1.
- Online scoring v1 never sends production prompt, completion, tool parameter,
  or retrieved-document content to an external model provider or harness judge.
  Future content-bearing online scoring requires a separate approved spec with
  explicit admin setup, content-capture allowance, provider profile, and budget
  controls.
- Online scoring v1 never creates annotation queue items automatically. Users
  must first review/filter online score results and then trigger annotation item
  creation as an explicit manual or batch action.
- Online score results do not feed alerting in v1. Alert integration requires a
  future alerting contract that explicitly declares AI-eval signals.

## Boundaries

### In Scope

- Projection of AI-relevant spans into agent, model-call, tool-call, and retrieval view models.
- Dataset, scorer, experiment, experiment-run, prompt-version, result, and annotation records.
- Project AI settings, provider profile metadata, model aliases, online scoring
  policies, dataset split governance, and experiment manifests.
- Conservative online scoring of newly persisted AI projections, bounded by
  configured sampling and concurrency limits, and limited to deterministic
  scorers for v1.
- Offline experiment runs against datasets through the harness adapter.
- Prompt, skill, and tool optimization through TypeScript harness workflows.
- GraphQL views for agent runs, datasets, scorers, experiments, results, and annotation queues.
- Production quality tracking by project, agent, environment, route, tool,
  retrieval source, model, prompt version, and scorer.

### Out Of Scope

- Model-provider proxy or gateway behavior.
- CloudGrid-owned model-provider credentials.
- Model-provider routing or request proxying for application traffic.
- Python runtime, DSPy, TextGrad, Optuna, or ax-llm MIPROv2 inside the deployable surface.
- Metrics ingest. Token and cost summaries are span-derived or harness-summary-derived until the metrics signal is implemented.
- Multi-tenant SaaS billing or production auth expansion beyond existing auth preparation.
- Model fine tuning.
- Automatic annotation routing from online scores.
- Alert rules over AI-eval quality signals.
- Online LLM-judge, semantic, RAG, tool-correctness, trajectory, or
  content-bearing scoring.

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
