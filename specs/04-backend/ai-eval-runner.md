---
id: TEC-BE-014
title: AI evaluation runner
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
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
- Resolve immutable run manifests through storage-read/control-plane ports
  before execution.
- Call the harness adapter over HTTP for `/v1/run`, `/v1/score`, and `/v1/optimize`.
- Preserve W3C trace context on every harness adapter call.
- Persist all mutable AI-eval records through storage-write command subjects.
- Publish durable experiment progress notifications for storage-read live fanout.
- Execute deterministic scorers locally for `Scorer.kind = deterministic`.
- Enforce split, budget, sampling, concurrency, retry, cancellation, and
  idempotency rules before invoking harness.
- Pass provider profile IDs, model aliases, prompt version refs, skill snapshot
  refs, and tool snapshot refs to harness without resolving provider secrets.

## Non-Responsibilities

- Does not read or write SurrealDB.
- Does not call OpenAI, Anthropic, Bedrock, Azure, or other model providers directly.
- Does not expose public HTTP endpoints.
- Does not implement Python-based optimizers.
- Does not own online policy matching semantics locally.
- Does not call harness `/v1/score` for online scoring in v1.
- Does not create annotation queue items automatically from online scoring
  results in v1.
- Does not feed online score results into alerting.
- Does not read `holdout` split data during optimization.

## Harness Adapter Contract

The adapter is a trusted-network HTTP service. It exposes:

- `POST /v1/run`
- `POST /v1/score`
- `POST /v1/optimize`
- `GET /healthz`
- `GET /v1/agents`

Responses contain run outputs, score results, candidate prompt IDs, and summaries. Spans are never returned in adapter response bodies; harness emits spans to CloudGrid through OTLP.

CloudGrid aligns with the current harness boundary:

- runner calls pass W3C `traceparent`/`tracestate` into harness run options;
- basic run status, token totals, model call counts, tool call counts, and agent call counts come from harness run summaries, not from parsing spans;
- deterministic scorer definitions use the harness JSON Pointer subset for `contains`, `regex`, `json-schema`, and `attribute-equality`;
- prompt candidate evaluation may be delegated to harness helpers, but CloudGrid owns datasets, experiment runs, prompt versions, score persistence, and UI state;
- prompt, skill, and tool candidate execution may be delegated to harness, but
  CloudGrid owns run manifests, candidate references, comparisons, score
  persistence, and promotion state;
- harness metrics are ingested later through standard OTLP metrics, not returned through adapter response bodies.

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

## Online Policy Rules

For online scoring, runner receives matched policy references from storage-read.
It may enforce budget, sampling, and concurrency decisions only from the
resolved policy data. It must not inspect raw traces and invent policy matching
outside storage-read semantics.

Online scoring v1 is deterministic-only:

- runner resolves matches through `eval.online.policy_matches.resolve`;
- storage-read must return only deterministic scorer refs for executable v1
  matches;
- runner rejects or skips any non-deterministic scorer ref with `ERR-AIE-002`;
- runner executes deterministic scorers locally;
- runner must not call harness `/v1/score`, read provider profiles, or forward
  prompt/completion/tool/retrieval content for online scoring;
- runner persists only `EvalResult` or bounded skipped-result records through
  `eval.results.persist`;
- runner ignores online policy annotation defaults during notification
  handling. Manual annotation creation is triggered only by user-facing BFF
  mutations that route to `annotation.item.update`.

## Optimizer Rules

Optimization input may include `optimization` and `validation` splits. It must
not include `holdout`. `regression` may be used only for post-candidate
regression gates, not candidate search. The runner rejects invalid manifests
before calling harness.
