---
id: REV-005
title: AI evaluation implementation scope
layer: review
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, TEC-BE-013, TEC-BE-014, TEC-BE-015]
---

# AI Evaluation Implementation Scope

## Purpose

This document defines the CloudGrid implementation waves for the AI evaluation enhancement. Autonomous agents must implement only these workstreams unless a later spec expands the scope.

## Workstreams

### AIE-1 Contracts And Generated Types

Implement the AI-eval GraphQL, AsyncAPI, error, and JSON Schema contracts already declared in:

- `specs/03-contracts/graphql/public-schema.graphql`
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml`
- `specs/03-contracts/errors.yaml`
- `specs/03-contracts/entities/ai/*.schema.json`

Generated outputs belong in:

- `apps/packages/ui-contracts`
- `apps/packages/definition`
- `core/go-contracts`

No service behavior is implemented in this workstream.

### AIE-2 Collector AI Projection Extraction

Implement `core/otlp-collector/internal/ai` to map OTel GenAI and OpenInference spans into `PersistAiProjectionCommand` messages. The collector still publishes normal telemetry commands and never calls storage, harness, or scorers.

### AIE-3 Storage-Write AI Persistence

Implement storage-write handlers for:

- `telemetry.ingest.ai_projections`
- AI-eval mutation/write command subjects
- AI-eval SurrealDB tables
- `ai.persisted.projections`
- `eval.experiment.progress`

Storage-write is the only SurrealDB mutator for AI-eval records.

### AIE-4 Storage-Read AI Query And Live Semantics

Implement storage-read handlers for AI-eval query subjects, transcript
derivation, scoreboard aggregation, annotation queue facets,
`eval.online.policy_matches.resolve`, and `eval.live.start` /
`eval.live.stop`. Storage-read owns deterministic-only online policy matching,
live experiment matching, and publishes `eval.live.events.*.*` sink events.

### AIE-5 Harness Adapter Package

Implement `apps/packages/cloudgrid-harness-adapter` with:

- `POST /v1/run`
- `POST /v1/score`
- `POST /v1/optimize`
- `GET /healthz`
- `GET /v1/agents`

The adapter is Bun ESM TypeScript, package name `@cloudgrid/harness-adapter`. It never calls CloudGrid GraphQL or NATS. It emits OTLP spans to CloudGrid and uses harness/provider configuration for model credentials.

### AIE-6 AI-Eval Runner

Implement `core/ai-eval-runner` to orchestrate conservative deterministic-only
online scoring, offline experiment runs, cancellation, deterministic scoring,
and optimization delegation. The runner reads only through storage-read NATS
subjects and writes only through storage-write NATS subjects. Online scoring v1
must not call harness scoring, send production content to judge models, create
annotation queue items automatically, or feed alerting.

### AIE-7 BFF GraphQL Resolvers

Implement `apps/backend` GraphQL resolvers for the AI-eval schema. Resolvers validate inputs, call NATS, validate replies, and map errors. They do not derive telemetry, scores, transcripts, or scoreboards.

### AIE-8 Frontend AI-Eval Views

Implement feature-gated React views for the AI Eval overview, runs,
agent-run timeline and transcript, datasets, scorers, experiments,
optimizations, production quality, annotation queue, and settings links. The
frontend renders GraphQL view models and owns presentation state only.

### AIE-9 CLI Regression Gate

Implement a Bun CLI script that starts an experiment run through GraphQL, subscribes to `liveExperimentRun`, exits non-zero on configured regression thresholds, and emits JUnit XML.

## Explicit Non-Scope

- Public REST AI-eval endpoints in CloudGrid.
- Model-provider SDKs in CloudGrid services.
- Python runtime, Optuna, DSPy, TextGrad, or MIPROv2.
- BFF/frontend telemetry derivation.
- Runner direct SurrealDB access.
- Harness adapter calls into CloudGrid GraphQL or NATS.
- First-class projections for OpenInference `RERANKER`, `GUARDRAIL`, `EVALUATOR`, or `PROMPT` in v1.
- Online LLM-judge, semantic, RAG, tool-correctness, trajectory, or
  content-bearing scoring.
- Automatic annotation queue routing from online score results.
- Alert rules over AI-eval online quality signals.

## Readiness Result

The AI-eval specs contain enough information for implementation planning. The
approved readiness gate is `specs/.readiness-report.yaml` with
`scope: expanded_ai_evaluation_wave`.

Implementation agents must not introduce new public fields, GraphQL operations,
NATS subjects, storage tables, scorer kinds, optimizer kinds, content capture
behavior, retry behavior, provider credential handling, route semantics, or
service boundaries outside the declared specs. If behavior is missing, agents
must stop and update specs plus the corresponding machine-readable contracts and
generated outputs before implementation.
