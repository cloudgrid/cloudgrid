---
id: TEC-BE-016
title: AI evaluation message contracts
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
provenance: from-user
depends_on: [DOM-006, TEC-BE-024]
---

# AI Evaluation Message Contracts

## Ownership Table

| Subject | Producer | Consumer | Purpose |
| --- | --- | --- | --- |
| `telemetry.ingest.ai_projections` | `core/otlp-collector` | `core/storage-write` | Persist trace-derived AI projections. |
| `ai.persisted.projections` | `core/storage-write` | `core/ai-eval-runner`, `core/storage-read` | Notify that AI projections were persisted. |
| `eval.dataset.create` | BFF | `core/storage-write` | Create a dataset. |
| `eval.dataset.items.append` | BFF | `core/storage-write` | Append manually authored or imported dataset items. |
| `eval.dataset.item.promote` | BFF | `core/storage-write` | Promote a source trace/span into a dataset item. |
| `eval.dataset.search` | BFF, runner | `core/storage-read` | Search datasets and dataset items. |
| `eval.agent_runs.search` | BFF | `core/storage-read` | Search projected agent runs. |
| `eval.scorer.create` | BFF | `core/storage-write` | Create a scorer definition. |
| `eval.scorer.search` | BFF, runner | `core/storage-read` | Search scorer definitions. |
| `eval.experiment.create` | BFF | `core/storage-write` | Create an experiment. |
| `eval.experiment.start` | BFF | `core/ai-eval-runner` | Start an offline experiment run. |
| `eval.experiment.cancel` | BFF | `core/ai-eval-runner` | Cancel an experiment run. |
| `eval.optimization.start` | BFF | `core/ai-eval-runner` | Start an optimization run. |
| `eval.experiment.search` | BFF, runner | `core/storage-read` | Search experiments and experiment runs. |
| `eval.results.search` | BFF, runner | `core/storage-read` | Search eval results. |
| `eval.results.persist` | `core/ai-eval-runner` | `core/storage-write` | Persist eval results and dataset item runs. |
| `eval.live.start` | BFF | `core/storage-read` | Register a live experiment subscription. |
| `eval.live.stop` | BFF | `core/storage-read` | Stop a live experiment subscription. |
| `eval.live.events.*.*` | `core/storage-read` | BFF | Deliver GraphQL-ready live experiment events. |
| `eval.experiment.progress` | `core/ai-eval-runner`, `core/storage-write` | `core/storage-read` | Durable progress notifications for live fanout. |
| `annotation.queue.search` | BFF | `core/storage-read` | Search annotation queue items and facets. |
| `annotation.item.update` | BFF, runner | `core/storage-write` | Resolve, assign, reopen, dismiss, or create annotation queue items. |
| `eval.manifest.resolve` | runner | `core/storage-read` | Resolve immutable experiment or optimization run manifests. |
| `eval.dataset.health` | BFF, runner | `core/storage-read` | Return dataset split, review, duplicate, schema, and leakage health. |
| `eval.quality.overview` | BFF | `core/storage-read` | Return production AI quality summaries and trends. |
| `eval.prompt_version.promote` | BFF | `core/storage-write` | Promote an approved prompt version tag. |
| `control.ai_settings.get` | BFF, runner | `core/control-plane` | Read project AI settings and effective defaults. |
| `control.ai_settings.update` | BFF | `core/control-plane` | Update project AI settings. |

## Request Shape Rule

Each request uses `BridgeEnvelope` plus a subject-specific payload. BFF-originated payloads are derived directly from the corresponding GraphQL input type. Runner-originated write payloads are derived directly from entity JSON Schemas in `specs/03-contracts/entities/ai`.

## Response Shape Rule

Every response uses `{ requestId, ok, data?, error? }`. On success, `data` contains exactly the GraphQL-ready view model or persisted entity required by the caller. On failure, `error.code` is one of the codes in `specs/03-contracts/errors.yaml`.

## Mutation Routing Rule

Subjects with create, update, persist, resolve, promote, start-status, or cancel-status semantics are handled by storage-write or ai-eval-runner. Storage-read never mutates SurrealDB.

## Contract Lock Rule

The subjects in this file are declared in
`specs/03-contracts/messages/message-bridge.asyncapi.yaml`, and public surfaces
are declared in `specs/03-contracts/graphql/public-schema.graphql`.
Implementation agents must use the machine-readable contracts and generated
TypeScript/Go outputs. They must not implement these subjects as undocumented
string constants or add unregistered message variants during service work.

## Durable Experiment Manifest Contract

`eval.manifest.resolve` returns an `ExperimentManifest` payload. The machine
schema must include:

- `schema`: fixed manifest schema URI or versioned schema name.
- `version`: integer manifest contract version.
- `digest`: stable digest over the canonical manifest payload.
- `experimentRunId`.
- `experimentId`.
- `datasetId`.
- `datasetVersion`.
- `splitSelector`.
- `datasetItemIds`.
- `scorerRefs` with scorer ID and version.
- `baselineRef`.
- `solverRef`.
- `promptVersionRefs`.
- `skillSnapshotRefs`.
- `toolSnapshotRefs`.
- `providerProfileRefs`.
- `budget`.
- `concurrency`.
- `createdAt`.

Canonicalization input is the JSON object excluding transport envelope fields
and excluding non-semantic ordering differences. Arrays whose order affects
execution remain ordered in the digest input. Arrays whose order does not affect
execution are sorted by stable ID before digesting.

The manifest is immutable after the first successful run persistence. Replay or
resume must use the persisted `digest`. If a later resolve request produces a
different digest for the same `experimentRunId`, the runner fails with
`ERR-AIE-002` and does not call harness.

The manifest snapshot embeds resolved refs needed for replay. It does not embed
raw provider secrets, raw prompt/completion content from source traces, or
unbounded retrieved document content.
