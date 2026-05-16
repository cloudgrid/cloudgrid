---
id: PROP-AIEVAL-CG-IMPL-001
title: Cloudgrid-side implementation guide
layer: proposal
status: proposal
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
---

# Cloudgrid-Side Implementation Guide

Eight tasks (C1–C8). File-by-file. Each task has explicit exit criteria.
Read `../shared/03-handshake.md` first for the shared protocol vocabulary.

## Repository layout — where new code goes

```
cloudgrid/                              ← @cloudgrid/cloudgrid
├── core/
│   ├── otlp-collector/                 # existing; gains AI projection extractor (C2)
│   ├── storage-read/                   # existing; gains AI domain query semantics (C4)
│   ├── storage-write/                  # existing; gains AI projection persistence (C3)
│   └── ai-eval-runner/                 # NEW Go service, build tag `aieval` (C5)
├── apps/
│   ├── backend/                        # existing BFF; gains AI resolvers (C6)
│   └── frontend/                       # existing; gains AI panels behind flag (C7)
├── packages/
│   ├── go-contracts/                   # existing; gains AI entity Go types
│   ├── ui-contracts/                   # existing; gains AI GraphQL types
│   ├── definition/                     # existing; gains AI TS definitions
│   └── cloudgrid-harness-adapter/      # NEW TS package — see harness/02-adapter-implementation.md
│                                       #   (placement debatable; defaults here for v1)
├── tooling/                            # gains CLI regression gate (C8)
└── specs/                              # gains the new domain + ADRs (C1)
```

## C1 — Specs first

Before any code change, land these spec files. Resolve all open questions
from §13 of `01-spec-proposal.md` first.

- `specs/01-domains/ai-eval.md` — domain definition.
- `specs/02-capabilities/ai-eval/ingest-ai-projections.md`,
  `evaluate-online.md`, `evaluate-offline.md`, `optimize-prompts.md`,
  `annotate-traces.md`.
- `specs/03-contracts/entities/ai/agent-run.schema.json`,
  `llm-call.schema.json`, `tool-call.schema.json`,
  `retrieval-event.schema.json`, `dataset.schema.json`,
  `dataset-item.schema.json`, `scorer.schema.json`,
  `eval-result.schema.json`, `experiment.schema.json`,
  `experiment-run.schema.json`, `prompt-version.schema.json`,
  `annotation-queue-item.schema.json`.
- `specs/03-contracts/messages/message-bridge.asyncapi.yaml` — append
  subjects from §5.3 of `01-spec-proposal.md`.
- `specs/03-contracts/graphql/public-schema.graphql` — append types
  from §8.
- `specs/03-contracts/errors.yaml` — append `ERR-AIE-001..005`.
- `specs/04-backend/ai-eval-runner.md`,
  `ai-eval-projection-mapping.md`, `ai-eval-online-scoring.md`.
- `specs/05-frontend/ai-eval-views.md`.
- `specs/06-nfr/ai-eval-content-capture.md`, `ai-eval-cost-bounds.md`.
- `specs/07-adr/0006-typescript-only-optimization.md`,
  `0007-harness-as-execution-surface.md`,
  `0008-content-capture-policy.md`,
  `0009-scorer-library-autoevals.md`.

Update `specs/spec.md` index and `specs/00-architecture-overview.md`
Public API Inventory.

**Exit criterion**: `bun run contracts:check` passes after the additions.

## C2 — Collector: AI projection extraction

In `core/otlp-collector`. Pure structural mapping from already-present
OTel attributes — no scoring, no database.

```
core/otlp-collector/internal/
├── otlp/normalize.go                   # existing; unchanged
├── ai/                                 # NEW package
│   ├── projection.go                   # dispatcher per shared/02-protocol-interop.md §3.1
│   ├── gen_ai_attrs.go                 # constants from OTel gen_ai semconv
│   ├── openinference_attrs.go          # constants from OpenInference
│   ├── precedence.go                   # canonical-field selection per protocol §3.2
│   └── projection_test.go
└── nats/publish.go                     # gains PersistAiProjectionCommand
```

**Behavior:**

1. After existing OTLP normalization, run the AI extractor over each span.
2. Apply dispatch rules from `shared/02-protocol-interop.md` §3.1
   (`AgentRun` / `LlmCall` / `ToolCall` / `RetrievalEvent` / none).
3. Apply canonical-field selection per `shared/02-protocol-interop.md`
   §3.2 across both attribute namespaces. Constants in
   `gen_ai_attrs.go` and `openinference_attrs.go` must be exhaustive
   over §2 of that doc.
4. Stamp `cloudgrid.ai.semconv.flavor` per §4 of the protocol doc.
5. Emit a `PersistAiProjectionCommand` to subject
   `telemetry.ingest.ai_projections` (JetStream) per projection.
6. Still publish the existing `PersistTelemetryCommand` — AI projections
   are additive, not replacements.
7. Preserve every raw attribute on the source span (ADR-0003).
8. For LLM spans carrying tool calls only as indexed attributes
   (OpenInference Representation B per protocol §2.4), synthesize a
   `ToolCall` projection marked `synthetic=true`.

**Constants (pin)** in `gen_ai_attrs.go`:

```go
const (
  GenAIOperationName  = "gen_ai.operation.name"
  GenAIProviderName   = "gen_ai.provider.name"
  GenAISystem         = "gen_ai.system"            // legacy fallback
  GenAIRequestModel   = "gen_ai.request.model"
  GenAIResponseModel  = "gen_ai.response.model"
  GenAIUsageInTokens  = "gen_ai.usage.input_tokens"
  GenAIUsageOutTokens = "gen_ai.usage.output_tokens"
  GenAIAgentID        = "gen_ai.agent.id"
  GenAIAgentName      = "gen_ai.agent.name"
  GenAIAgentVersion   = "gen_ai.agent.version"
  GenAIToolName       = "gen_ai.tool.name"
  GenAIToolCallID     = "gen_ai.tool.call.id"
)

const (
  OpInvokeAgent      = "invoke_agent"
  OpExecuteTool      = "execute_tool"
  OpChat             = "chat"
  OpTextCompletion   = "text_completion"
  OpEmbeddings       = "embeddings"
  OpGenerateContent  = "generate_content"
)
```

**Standards touched**: OTel gen_ai semconv (must match upstream YAML in
`open-telemetry/semantic-conventions` to the byte); OpenInference (must
match `Arize-ai/openinference`).

**Exit criteria:**

- Integration test ingests a recorded harness trace and asserts the
  projection set matches a golden JSON fixture.
- A second test ingests a pure-OpenInference trace (e.g. LlamaIndex or
  LangChain via OpenInference instrumentation) and asserts the same
  canonical projection shape comes out.
- A third test ingests a span carrying both `gen_ai.*` and OpenInference
  attributes for the same canonical field, and asserts the warning
  attribute is set when values disagree.

## C3 — Storage-write: persistence + post-persist notification

```
core/storage-write/internal/
├── handlers/
│   ├── persist_telemetry.go            # existing
│   └── persist_ai_projection.go        # NEW
├── adapters/surrealdb/
│   ├── tables.go                       # add ai_agent_run, ai_llm_call, ai_tool_call, ai_retrieval_event
│   └── ai_writes.go                    # NEW
└── publish/ai_persisted.go             # publish ai.persisted.projections after success
```

**Behavior:**

1. Consume `telemetry.ingest.ai_projections` via durable JetStream
   consumer `storage-write-ai`.
2. Persist projections to SurrealDB. Each row has FK-like string pointers
   to `trace.id` / `span.id`. Deletion of the source trace cascades.
3. After successful commit, publish `AiProjectionPersistedNotification`
   to `ai.persisted.projections` carrying
   `{ traceId, spanIds[], kinds[] }`. **No payload content.**
4. Acknowledge the JetStream message only after persistence and publish
   succeed.

**Exit criterion**: a span emitted by the harness adapter is reachable
in SurrealDB as both a normal span and an AI projection, and
`ai.persisted.projections` is observed on a NATS test consumer within
500 ms p95.

## C4 — Storage-read: AI domain query semantics

```
core/storage-read/internal/
├── handlers/
│   ├── traces.go                       # existing
│   ├── ai_agent_runs.go                # NEW — eval.agent_runs.search/get
│   ├── ai_datasets.go                  # NEW — eval.dataset.search/get
│   ├── ai_scorers.go                   # NEW — eval.scorer.search/get
│   ├── ai_experiments.go               # NEW — eval.experiment.search/get + scoreboard
│   ├── ai_eval_results.go              # NEW — eval.results.search
│   ├── ai_annotation_queue.go          # NEW — annotation.queue.search
│   └── ai_live_experiment.go           # NEW — eval.live.start/stop + sink fanout
└── adapters/surrealdb/
    ├── ai_queries.go                   # all pushdown
    └── ai_facets.go
```

**Required pushdown** (per §7.1 of `01-spec-proposal.md`):

- Agent-run search: agent id/name, status, time range, duration, token
  totals, cost-estimate range, `experimentRunId`, free-text.
- Dataset-item search: `datasetId`, `version`, source-trace presence,
  tag, free-text.
- Eval-result search: scorerId/Version, target kind, pass/fail, score
  range, target trace/span, time range, `experimentRunId`.
- Scoreboard aggregations: per `(experimentId, scorerId)` —
  count, mean, p50/p95, pass-rate.
- Annotation queue facets: status, reason, assignee counts.

**Exit criterion**: every GraphQL field in the new schema additions has
a contract test proving it can be served from a typed NATS response
without BFF-side derivation.

## C5 — New service `core/ai-eval-runner` (Go, build tag `aieval`)

```
core/ai-eval-runner/
├── cmd/ai-eval-runner/main.go
└── internal/
    ├── ports/
    │   ├── harness.go                  # HarnessAdapter port
    │   └── storage.go                  # read/write port
    ├── adapters/
    │   └── harness_http/               # client for cloudgrid-harness-adapter
    │       ├── client.go
    │       └── client_test.go
    ├── handlers/
    │   ├── experiment_start.go         # eval.experiment.start (req/rep)
    │   ├── experiment_cancel.go        # eval.experiment.cancel
    │   └── projection_consumer.go      # consumes ai.persisted.projections
    ├── orchestrator/
    │   ├── offline.go                  # offline experiment lifecycle
    │   ├── online.go                   # online scoring lifecycle
    │   └── optimization.go             # delegates to /v1/optimize
    └── publish/experiment_events.go    # eval.experiment.events.<sinkId>
```

**Behavior:**

- Owns `ExperimentRun` lifecycle. Reads datasets via storage-read NATS
  subjects. Calls the harness adapter for each item. Persists
  `DatasetItemRun` and `EvalResult` via storage-write subjects. Emits
  live events on ephemeral sink subjects registered by the BFF.
- Must **not** read or write SurrealDB.
- Must **not** call model providers.
- Build tag `aieval` is required to compile; a cloudgrid build without
  `aieval` does not contain this service.

**Trace context**: every outbound HTTP call to the harness adapter
propagates `traceparent` so adapter spans nest under the runner's.

**Exit criterion**: starting an `ExperimentRun` of a 10-item dataset
against a mock harness adapter completes end-to-end, with all per-item
events observable on a NATS test consumer in order.

## C6 — BFF GraphQL resolvers (`apps/backend`)

Add resolvers for the queries/mutations/subscription from §8 of
`01-spec-proposal.md`. Discipline (per CNV-001): validate input with Zod
→ request/reply via NATS → validate reply with Zod → map to view model.
No filtering, no aggregation, no scoring in the BFF.

```
apps/backend/src/graphql/
├── ai-eval/
│   ├── queries.ts                      # agentRuns, datasets, scorers, experiments, evalResults, annotationQueue
│   ├── mutations.ts                    # createDataset, appendDatasetItems, promoteSpanToDatasetItem,
│   │                                   #   createScorer, createExperiment, startExperimentRun,
│   │                                   #   cancelExperimentRun, resolveAnnotation, promotePromptVersion
│   └── subscription-live-experiment.ts
└── schema.ts                           # imports + composes
```

The subscription `liveExperimentRun` mirrors `liveTraces` exactly per
`specs/04-backend/telemetry-query-semantics.md`.

**Exit criterion**: existing telemetry-query-semantics tests continue
to pass; new AI resolver tests assert request/reply mapping only (no
aggregation).

## C7 — Frontend AI panels behind `CLOUDGRID_AI_EVAL_ENABLED`

Five views per §9 of `01-spec-proposal.md`. Build on the existing
React/Vite/shadcn stack. Render only GraphQL view models. No
client-side aggregation.

- AgentRun timeline (augmented trace waterfall, group child spans by
  `gen_ai.agent.id`, badge operation kind).
- Conversation transcript view —
  `apps/frontend/src/views/ai-eval/AgentRunTranscript.tsx`. Reads the
  same `AgentRun` GraphQL model and renders messages from span events
  (`gen_ai.user.message` / `gen_ai.assistant.message`) **or** from
  flattened OpenInference attributes (`llm.input_messages.*` /
  `llm.output_messages.*`) — both shapes per the protocol-interop spec.
  No content is fabricated client-side; missing content shows
  placeholder.
- Datasets editor (list/edit/version/filter dataset items;
  "promote span to dataset item" action from any persisted span detail).
- Scorer registry (list/create/edit deterministic / RAG / LLM-judge /
  human scorers).
- Experiment scoreboard (per-experiment side-by-side runs, p50/p95,
  pass-rate, regression highlight, per-item diff).
- Annotation queue triage view filtered by reason/assignee/status.

Flag-off removes all routes; AI GraphQL types are optional in the
schema and clients without the flag never query them.

## C8 — CLI regression gate

`tooling/scripts/eval-run.mjs` (Bun script, ESM) wraps
`startExperimentRun` over the BFF's GraphQL endpoint and consumes the
`liveExperimentRun` subscription until `finished`. Non-zero exit code
if baseline-vs-current shows any tracked scorer dropped beyond a
configured threshold.

Output: JUnit XML at `--report-junit <path>` for CI ingestion.

## Definition of done

| Component | Done when |
| --- | --- |
| Specs (C1) | `bun run contracts:check` passes; all open questions in §13 of `01-spec-proposal.md` have a documented answer. |
| Collector AI extractor (C2) | Three integration tests green (gen_ai-only, OpenInference-only, mixed-with-conflict). Raw attributes preserved (ADR-0003 regression test). |
| Storage-write AI persistence (C3) | Idempotent per (`traceId`, `spanId`, `kind`). `ai.persisted.projections` observed within 500 ms p95 of ingest. |
| Storage-read AI queries (C4) | Every GraphQL field served from a single typed NATS reply, no BFF derivation. Pushdown asserted by query-builder tests. |
| `core/ai-eval-runner` offline (C5) | 10-item dataset run completes; live events ordered; `EvalResult` records persisted; non-zero exit code propagated through BFF subscription stop. |
| `core/ai-eval-runner` online (C5) | Configured online scorer fires within 1 s p95 of `ai.persisted.projections`; rate-limit clamps spend. |
| BFF resolvers (C6) | All AI types have request/reply mapping tests; no resolver imports Go storage adapters or model SDKs. |
| Frontend (C7) | All five views render from GraphQL view models alone; no client-side aggregation; flag-off removes the routes entirely. |
| CLI (C8) | Returns 0 on baseline-equal run, non-zero on regression, emits JUnit XML. |

## Anti-patterns — refuse in review

- Adding any Python process to the deployable surface.
- Adding a model-provider SDK to cloudgrid services. Harness only.
- "Lightweight" scorer in a BFF resolver to "save a round trip" — no.
- REST AI-eval endpoint — no, GraphQL only.
- `core/ai-eval-runner` reading SurrealDB directly — no, NATS only.
- Collector consulting a database — no, normalise + publish only.
- Inventing attribute names not in OTel gen_ai or OpenInference.
- Storing prompt/completion content in cloudgrid AI entities — content
  stays on source span events per ADR-0003.

## References

- `01-spec-proposal.md`
- `../shared/01-landscape.md`
- `../shared/02-protocol-interop.md`
- `../shared/03-handshake.md`
- `../harness/02-adapter-implementation.md`
- `AGENTS.md`, `specs/00-vision.md`, `specs/00-architecture-overview.md`,
  `specs/00-conventions.md`, `specs/04-backend/backend-architecture.md`,
  `specs/04-backend/telemetry-query-semantics.md`,
  `specs/07-adr/0003-preserve-genai-attributes.md`.
