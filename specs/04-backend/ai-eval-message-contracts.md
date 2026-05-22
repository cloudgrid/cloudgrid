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
| `eval.dataset.item.update` | BFF | `core/storage-write` | Edit, remove, review, reject, split-change, quarantine, or restore a dataset item in a new dataset version. |
| `eval.dataset.candidates.prepare` | BFF | `core/storage-read`, `core/storage-write` | Prepare reviewable dataset candidates from traces, failed results, clusters, coverage gaps, or health issues. |
| `eval.dataset.candidates.search` | BFF | `core/storage-read` | Search dataset candidates, clusters, anonymization provenance, and suggestion status. |
| `eval.dataset.candidates.commit` | BFF | `core/storage-write` | Commit selected reviewed candidates into a dataset version. |
| `eval.dataset.import.prepare` | BFF | `core/storage-write` | Validate staged dataset upload and return import preview. |
| `eval.dataset.import.commit` | BFF | `core/storage-write` | Commit a prepared import preview into a dataset version. |
| `eval.dataset.export.start` | BFF | `core/storage-read`, `core/storage-write` | Resolve and prepare canonical dataset export artifact. |
| `eval.dataset.transfer.get` | BFF | `core/storage-read` | Read dataset import/export job state. |
| `eval.dataset.search` | BFF, runner | `core/storage-read` | Search datasets and dataset items. |
| `eval.agent_runs.search` | BFF | `core/storage-read` | Search projected agent runs. |
| `eval.scorer.create` | BFF | `core/storage-write` | Create a scorer definition. |
| `eval.scorer.search` | BFF, runner | `core/storage-read` | Search scorer definitions. |
| `eval.experiment.create` | BFF | `core/storage-write` | Create an experiment. |
| `eval.experiment.start` | BFF | `core/ai-eval-runner` | Start an offline experiment run. |
| `eval.experiment.cancel` | BFF | `core/ai-eval-runner` | Cancel an experiment run. |
| `eval.experiment.pause` | BFF | `core/ai-eval-runner` | Pause an experiment or optimization run after checkpointing active work. |
| `eval.experiment.resume` | BFF | `core/ai-eval-runner` | Resume a paused run with the persisted manifest digest. |
| `eval.optimization.start` | BFF | `core/ai-eval-runner` | Start an optimization run. |
| `eval.experiment.search` | BFF, runner | `core/storage-read` | Search experiments and experiment runs. |
| `eval.results.search` | BFF, runner | `core/storage-read` | Search eval results. |
| `eval.results.persist` | `core/ai-eval-runner` | `core/storage-write` | Persist eval results and dataset item runs. |
| `eval.online.policy_matches.resolve` | `core/ai-eval-runner` | `core/storage-read` | Resolve enabled deterministic online policy matches for a persisted AI projection notification. |
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

Subject payload lock:

- `eval.dataset.candidates.prepare` uses `DatasetCandidatesPrepareRequest` in
  AsyncAPI and returns `DatasetCandidatesResponse` with
  `dataset-candidate.schema.json` items.
- `eval.dataset.candidates.search` uses `DatasetCandidatesSearchRequest` in
  AsyncAPI and returns `DatasetCandidatesResponse`.
- `eval.dataset.candidates.commit` uses `DatasetCandidatesCommitRequest` in
  AsyncAPI and returns a GraphQL-ready `Dataset` in `EvalMutationResponse.data`.
- `eval.experiment.start` uses `ExperimentStartRequest` in AsyncAPI and
  `EvalSolverRef` from `eval-run-ref.schema.json`.
- `eval.experiment.pause` and `eval.experiment.resume` use
  `ExperimentRunControlRequest` in AsyncAPI with `command = pause` or
  `command = resume`. They never reuse start or cancel payloads.
- `eval.optimization.start` uses `OptimizationStartRequest` in AsyncAPI and
  `optimizationConfig` from `eval-run-ref.schema.json`.
- `eval.manifest.resolve` returns `ExperimentManifest` and must include typed
  `solverRef`, optional `baselineRef`, optional `optimizationConfig`, and
  `runPolicy`.
- `eval.results.persist` persists `EvalResult`,
  `eval-result-payload.schema.json`, and `DatasetItemRun` records.
- `eval.experiment.search` returns run summaries that conform to
  `eval-aggregation.schema.json#/$defs/runSummary`.
- `eval.quality.overview` returns
  `eval-aggregation.schema.json#/$defs/qualityOverview`.

Implementers must not use subject-local anonymous JSON for these payloads.

## Mutation Routing Rule

Subjects with create, update, persist, resolve, promote, start-status, or cancel-status semantics are handled by storage-write or ai-eval-runner. Storage-read never mutates SurrealDB.

## Contract Lock Rule

The subjects in this file are declared in
`specs/03-contracts/messages/message-bridge.asyncapi.yaml`, and public surfaces
are declared in `specs/03-contracts/graphql/public-schema.graphql`.
Implementation agents must use the machine-readable contracts and generated
TypeScript/Go outputs. They must not implement these subjects as undocumented
string constants or add unregistered message variants during service work.

## Online Policy Match Contract

`eval.online.policy_matches.resolve` is the only approved v1 request/reply
subject for runner-side online policy resolution.

Producer:

- `core/ai-eval-runner`

Consumer:

- `core/storage-read`

Request payload:

- `BridgeEnvelope`.
- `projectId`.
- `traceId`.
- `projectionIds`.
- optional `spanIds`.
- `kinds`.
- `persistedAt`.

Response payload:

- `matches`: matched enabled online policies with `policyId`, `policyVersion`,
  `policyName`, `target`, `sampleRate`, optional `maxDailyRuns`, and
  `scorerRefs`.
- `projection`: bounded scorer input read model with source IDs, routing fields,
  safe indexed attributes, and no raw prompt/completion/tool/retrieval content.
- `runPolicy`: resolved sampling, max parallel requests, token budget,
  rate-limit, backpressure, retry, timeout, cost, and failure-budget values.
- `warnings`: bounded strings for invalid policies, stale scorer references,
  missing scorer requirements, disallowed content access, missing provider/model
  aliases, budget limits, or unsupported latency class.

Storage-read owns all policy target matching and scorer requirement validation.
The runner must not reimplement target matching. If a policy references a scorer
whose requirements are not satisfied, storage-read either omits it with a
warning or returns a validation error. Runner must not call harness to make a
disallowed policy executable.

## Dataset Candidate Contract

Dataset candidate subjects use dedicated AsyncAPI payloads, not generic
`EvalMutationRequest` or `EvalQueryRequest` envelopes. Payloads must include:

- selected project and dataset IDs where applicable;
- source references: trace/span IDs, eval result IDs, experiment run IDs,
  policy IDs, coverage-gap IDs, health issue IDs, or cluster IDs;
- candidate target shape;
- requested split and review status;
- content treatment: `original`, `realistic_anonymized`, `redacted`, or
  `synthetic`;
- anonymization policy reference when content treatment is
  `realistic_anonymized` or `redacted`;
- expected dataset version for commit.

Preparation may create candidate records and bounded evidence. Commit is the
only operation that creates dataset items. Candidates must not contain original
sensitive values after realistic anonymization has run.

Implementation split:

- BFF validates GraphQL input and sends the matching AsyncAPI request shape
  without deriving candidate content.
- Storage-read resolves sources, coverage gaps, clusters, dataset health,
  bounded evidence, and candidate search result ordering.
- Storage-write persists candidate records, status transitions, commit
  idempotency, and dataset version changes.
- If candidate preparation needs both read-derived evidence and writes, BFF
  calls storage-read first for the bounded source model and storage-write second
  for persistence. No service may both query and mutate SurrealDB directly.

Prepare idempotency key:

- `requestId` plus normalized source refs, dataset ID, target shape, split,
  review status, content treatment, anonymization policy ID/version, and
  selected project ID.

Commit idempotency key:

- dataset ID, expected dataset version, sorted candidate IDs, selected split,
  selected review status, and selected project ID.

Commit fails with `ERR-AIE-003` when any selected candidate is not `ready`, was
already committed into a different dataset version, belongs to another project,
or has stale anonymization provenance for the requested policy version.

Candidate search ordering is deterministic: newest `updatedAt` first, then
`id` ascending. Cursor pagination encodes the last `updatedAt` and `id`; offset
pagination is not allowed for large candidate sets.

Candidate status transitions:

| Current | Command/source | Next | Rule |
| --- | --- | --- | --- |
| none | prepare valid candidate | `suggested` or `ready` | `ready` only when required input, expected, shape, treatment, and provenance are complete. |
| none | prepare candidate needing human edits | `reviewing` | Used for uncertain anonymization, missing expected output, or blocked entity categories. |
| `suggested` | user starts edit | `reviewing` | Does not mutate a dataset item. |
| `reviewing` | user completes required fields | `ready` | Storage-write validates shape and treatment. |
| `ready` | commit | `committed` | Creates a new dataset version and records source candidate IDs. |
| `suggested`, `reviewing`, `ready` | dismiss | `dismissed` | Does not affect dataset versions. |
| `suggested`, `reviewing`, `ready` | merged/replaced | `superseded` | Stores replacement candidate or cluster ID. |
| `committed`, `dismissed`, `superseded` | any mutation except metadata audit append | terminal | Reopen is not allowed in v1. |

## Dataset Item Update Contract

`eval.dataset.item.update` is the only approved mutation subject for manual
dataset item edit, remove, review, reject, split change, metadata update,
quarantine, and restore. The request includes `expectedDatasetVersion` and
creates a new dataset version or draft mutation. Removing an item hides it from
later versions and never mutates historical run manifests.

## Dataset Import/Export Contract

Dataset import/export subjects use `EvalMutationRequest` or `EvalQueryRequest`
envelopes, but their `input` payloads are locked to the GraphQL input types in
`public-schema.graphql`:

- `eval.dataset.import.prepare` uses `PrepareDatasetImportInput`.
- `eval.dataset.import.commit` uses `CommitDatasetImportInput`.
- `eval.dataset.export.start` uses `StartDatasetExportInput`.
- `eval.dataset.transfer.get` uses `{ id, kind }`, where `kind` is `import` or
  `export`.

The BFF must not bypass these subjects by parsing rows into `DatasetItemInput`
and calling `eval.dataset.items.append` for uploaded files. Uploaded files must
go through preview-before-commit so mapping, row validation, partial commit,
and import job records are owned by storage-write.

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

`baselineRef`, `solverRef`, and optimization config are defined by
`specs/03-contracts/entities/ai/eval-run-ref.schema.json`. The runner and
storage-read must reject manifests with anonymous solver objects, unknown
baseline kinds, unknown optimizer config fields, or roadmap optimizer configs
without an approved future spec.

## Eval Run Policy Contract

`eval.manifest.resolve` returns `runPolicy` with:

- `maxParallelRequests`, default `10`;
- token budget: per-run, per-item input, and per-item output;
- cost budget: per-run and daily project caps;
- rate-limit values for provider, project, and run;
- backpressure behavior for harness, provider, queue, NATS, and storage lag;
- retry policy: retryable codes, max attempts, backoff, jitter, retry budget;
- timeout policy: item, scorer, adapter call, and run deadlines;
- failure budget: model-quality failures and technical errors;
- checkpoint cadence;
- quarantine rules for oversized, invalid, flaky, or repeatedly failing items.

## Harness Sandbox Lifecycle Contract

The runner must treat sandbox lifecycle as an adapter contract, not an
implementation detail hidden inside `/v1/run`, `/v1/score`, or `/v1/optimize`.

Required adapter requests:

- `POST /v1/sandboxes/start`
- `POST /v1/sandboxes/pause`
- `POST /v1/sandboxes/resume`
- `POST /v1/sandboxes/abort`
- `POST /v1/sandboxes/cleanup`

Common request fields:

- `experimentRunId`;
- optional `datasetItemId`, `scorerId`, `candidateId`, and `attemptId`;
- `manifestDigest`;
- `sandboxProfile`;
- `runPolicy`;
- W3C trace context;
- optional `sandboxRef` for pause, resume, abort, and cleanup;
- optional durable `checkpointRef` for resume-capable adapters.
- optional cleanup retry metadata when the request is a retry after timeout,
  process crash, partial delete, or unknown outcome.

Common response fields:

- `sandboxRef`;
- `sandboxProfile`;
- `checkpointSupported`;
- optional `checkpointRef`;
- `cleanupRequired`;
- optional `cleanupDeadline`;
- optional bounded cleanup summary for cleanup calls;
- bounded `warnings`.

Ephemeral adapters return `checkpointSupported=false`; their pause/resume calls
acknowledge control state but do not snapshot process memory or filesystems.
Durable replay adapters must use the same request/response shapes and must keep
CloudGrid persistence idempotent. Durable replay adapters must satisfy the
checkpoint storage, retention, encryption, cleanup retry, workspace quota, and
verification requirements in `specs/04-backend/ai-runtime-structure.md`.

Cleanup responses must not include file contents, provider credentials, host
paths, raw sandbox logs, prompts, provider request bodies, provider responses,
NATS subjects, SurrealDB connection details, session cookies, or authorization
claims. Cleanup retry exhaustion is represented as an infrastructure problem and
must not mutate previously persisted eval scores.
