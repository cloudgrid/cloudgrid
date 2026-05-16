---
id: REV-006
title: AI evaluation product concept and market synthesis
layer: review
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, REV-005]
---

# AI Evaluation Product Concept And Market Synthesis

## Purpose

This document records the product direction for CloudGrid AI evaluation before
implementation agents extend contracts or code. It converts market research and
the approved user direction into implementation constraints.

## Market Pattern

Current AI evaluation products and frameworks converge on one loop:

1. observe production traces and user outcomes;
2. route failures and interesting traces into review;
3. curate versioned datasets with ground truth and split assignment;
4. run offline experiments against stable scorer versions;
5. use results to improve prompts, tools, retrieval, and agent workflows;
6. promote only after regression checks pass;
7. monitor production quality, latency, cost, and drift after release.

Strong products make this loop easy to repeat. They do not treat evaluation as a
one-off benchmark table.

## CloudGrid Positioning

CloudGrid must be an observability-native AI evaluation flywheel. The product
advantage is not another generic eval SDK; it is that every score can be tied to
the exact trace tree, model call, retrieval event, tool call, logs, metrics,
prompt version, provider profile, project, cost, and production segment that
caused it.

The primary product promise is:

> Turn production agent evidence into reliable datasets, run repeatable
> evaluations and prompt optimizations, and prove production quality changes
> with trace-level evidence.

## Product Pillars

### Project AI Settings

Each project owns AI-eval configuration: provider profiles, model aliases,
online scoring policies, budgets, sampling limits, default dataset split rules,
and default harness adapter references. Project settings are managed in the
project admin settings shell, not as a primary telemetry tab.

CloudGrid stores provider metadata and opaque credential references. CloudGrid
does not store raw model-provider API keys in v1 and does not become a model
gateway. Harness or a future separately specified secret service resolves
credential material.

### Dataset Operations

Datasets are durable product artifacts, not temporary experiment inputs.
CloudGrid must support versioned datasets, item provenance, split assignment,
ground-truth status, schema validation, duplicate/leakage detection, review
workflow, import/export, and coverage facets.

Dataset split names are fixed in v1:

- `dev`: manual authoring and scorer calibration.
- `optimization`: prompt or skill optimization input.
- `validation`: model/prompt selection during iteration.
- `regression`: CI and release gate cases.
- `holdout`: hidden final confidence set that optimization never reads.

Small-dataset mode is explicit. With fewer than 30 labeled items, CloudGrid
must guide users to keep holdout small but non-empty, avoid synthetic-only
confidence claims, and label optimization outputs as low-confidence until a
minimum configured evaluation count is reached.

### Scorer Workbench

Scorers are versioned definitions with calibration expectations. Supported v1
families are deterministic, schema/JSON, semantic, RAG, LLM judge, tool
correctness, trajectory/task completion, and human review.

Tool and trajectory scorers are first-class. For agents, CloudGrid must score
tool choice, tool arguments, tool order, retrieval grounding, retries, latency,
and final answer separately when the scorer definition requests it.

### Experiment And Regression System

Experiments use immutable manifests. A run snapshot includes dataset version,
split selector, scorer versions, solver reference, prompt/skill/tool snapshot
references, provider profile references, harness adapter reference, budget
limits, and seed/randomization settings when present.

Scoreboards compare against an explicit baseline, usually the active production
prompt or skill bundle. A candidate can pass only when configured quality,
latency, cost, and segment-level regression thresholds pass.

### Prompt, Skill, And Tool Optimization

Optimization improves prompts and harness-side skill/tool configurations, not
model weights. Model fine tuning is out of scope.

Supported optimization families:

- few-shot/example selection;
- instruction search and mutation;
- critic-mutate-judge-pick;
- MIPROv2-style instruction and few-shot optimization;
- GEPA/TextGrad-style reflective improvement when implemented behind harness.

CloudGrid owns datasets, prompt versions, skill/tool snapshot references,
experiment manifests, score persistence, comparisons, and promotion state.
Harness owns agent execution, model-provider calls, and optimizer internals.

### Production Agent Performance

Online evaluation is a production observability workflow. Project policies
control which agents, environments, routes, tools, retrieval flows, or segments
are sampled and scored. Results feed quality dashboards, alerting, annotation
queues, dataset suggestions, and regression backlog.

Production dashboards must show quality, latency, cost, tool error rate,
retrieval quality, fallback/retry behavior, annotation backlog, and regression
trend by project segment.

## Non-Goals

- Model fine tuning.
- Public REST AI-eval APIs in CloudGrid.
- CloudGrid as a model-provider proxy or gateway.
- Raw model-provider API key storage in CloudGrid v1.
- Python runtimes inside CloudGrid deployable services.
- BFF/frontend scoring, aggregation, transcript derivation, or telemetry
  enrichment.
- Auto-promoting prompt, skill, or tool candidates without explicit user action.

## Implementation Consequences

- GraphQL, AsyncAPI, JSON Schema, generated TypeScript, and generated Go
  contracts must be extended before code changes implement the new surfaces.
- Control-plane owns low-volume project AI settings, provider profile metadata,
  model aliases, online policies, and user-visible defaults.
- Storage-write remains the only service that mutates AI-eval records in
  SurrealDB.
- Storage-read owns all AI-eval read models, scoreboards, dataset health
  facets, split leakage checks, production quality summaries, and live fanout.
- AI-eval-runner orchestrates execution through storage-read, storage-write, and
  harness ports only.
- Harness adapter remains the execution and model-provider boundary.

## Source Notes

The direction is informed by current product and framework patterns from
Braintrust, LangSmith, Langfuse, Opik, Ragas, DeepEval, DSPy MIPROv2, GEPA,
TextGrad, OpenTelemetry GenAI semantic conventions, and provider abstraction
patterns such as LiteLLM. These sources are competitive and technical inputs;
CloudGrid specs remain the authoritative implementation source.
