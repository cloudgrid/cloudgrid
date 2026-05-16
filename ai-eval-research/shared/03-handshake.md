---
id: PROP-AIEVAL-HANDSHAKE-001
title: Cloudgrid ↔ harness handshake — wire contract
layer: proposal
status: proposal
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
---

# Cloudgrid ↔ Harness Handshake

The only seam between the two repos. Both sides must agree on everything
in this document before either side ships anything visible to users.

## 1. Standards and protocols — the shared vocabulary

If you can't name the standard you're using, you're inventing one. Stop
and either pick from this table or update it (then update both sides).

| Concern | Standard | Owner |
| --- | --- | --- |
| Trace transport | **OTLP/HTTP** JSON + protobuf — `POST /v1/traces`, `POST /v1/logs` | Cloudgrid `core/otlp-collector` (already implemented). |
| Span semantics for LLM/agent/tool — primary | **OTel GenAI semantic conventions** (`gen_ai.*`) at semconv ≥ 1.41.0, opt-in via `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` | Harness emits; cloudgrid maps. |
| Span semantics for LLM/agent/tool — co-equal | **OpenInference** (`llm.*`, `tool.*`, `retrieval.*`, `openinference.span.kind`) | Harness emits in addition to gen_ai (dual-emit, see `harness/01-default-protocol.md`). Cloudgrid accepts on equal footing — covers `RETRIEVER`/`RERANKER`/`GUARDRAIL`/`EVALUATOR` which OTel does not yet model. |
| MCP tool calls | **OTel MCP semantic conventions** | Harness emits; cloudgrid maps to `ToolCall` projections. |
| Content capture (gen_ai) | `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` ∈ `NO_CONTENT \| SPAN_ONLY \| EVENT_ONLY \| SPAN_AND_EVENT` | Harness reads; default `NO_CONTENT`. |
| Trace context propagation | **W3C Trace Context** (`traceparent`, `tracestate` HTTP headers) | All cross-process calls including harness adapter ↔ cloudgrid runner. |
| Private bridge (inside cloudgrid only) | **NATS** request/reply for sync reads + **JetStream** for ingest/persisted streams | Cloudgrid services; declared in `specs/03-contracts/messages/message-bridge.asyncapi.yaml`. |
| Public API (cloudgrid → outside) | **GraphQL** queries, mutations, subscriptions | BFF; schema in `specs/03-contracts/graphql/public-schema.graphql`. |
| Adapter API (cloudgrid ↔ harness adapter) | **HTTP/1.1 JSON** with W3C trace context propagation — see §2 below | This document is the contract. |
| Entity contracts | **JSON Schema** (Draft 2020-12); Zod at TS runtime boundary | Defined once in the adapter package and consumed both ways. |
| Error envelope | **RFC 9457 Problem Details** at HTTP boundary; `GraphQLError.extensions.problem` at GraphQL boundary | Existing cloudgrid convention (CNV-001). |
| AI entity IDs | **ULID** (text, opaque to clients) | New AI entities only; `trace.id` / `span.id` remain OpenTelemetry IDs. |
| Timestamps | UTC, ISO 8601 in JSON, RFC 3339 in OTLP | Existing CNV-001. |

## 2. Adapter HTTP contract

The cloudgrid-harness-adapter package exposes these endpoints. The
cloudgrid `core/ai-eval-runner` Go service is the only public client.

```
POST /v1/run
  body: {
    solver: {
      agentName: string,
      version: string,
      promptVersionId?: string
    },
    input: unknown,                                  // DatasetItem.input
    metadata: {
      experimentRunId: string,
      datasetItemId: string
    }
  }
  response: 200 {
    harnessRunId: string,
    output: unknown,
    tokenTotals: { input: number, output: number }
    // spans are NOT in the response body — they go via OTLP
  }

POST /v1/optimize
  body: {
    optimizerKind: "bootstrap-fewshot" | "critic-mutate-judge-pick",
    basePromptVersionId: string,
    datasetId: string,
    datasetVersion: number,
    scorerIds: string[],
    config: Record<string, unknown>,
    metadata: { experimentRunId: string }
  }
  response: 200 NDJSON stream:
    { event: "candidate", promptVersionId: string, summary: ScoreSummary }
    { event: "finished",  winnerPromptVersionId: string }

POST /v1/score
  body: {
    scorer: {
      id: string,
      version: number,
      kind: "deterministic" | "rag" | "llm_judge",
      definition: unknown
    },
    target: {
      input: unknown,
      output: unknown,
      expected?: unknown,
      context?: unknown[]
    }
  }
  response: 200 { score: number, passed: boolean, evidence?: unknown }

GET /healthz                                # 200 if harness reachable
GET /v1/agents                              # list agents the harness exposes
```

### 2.1 Trace context

Every adapter response is OTel-instrumented. The inbound `traceparent`
header from cloudgrid is propagated to all model and tool calls inside
harness. Result: all spans of one experiment item nest under one trace.

### 2.2 Authentication

v1 ships unauthenticated (`anonymous`) inside a trusted network boundary.
Future versions: per-request bearer token through `Authorization` header;
adapter stays stateless and validates against a configured JWT key set.
Documented in NFR but not in scope.

### 2.3 Idempotency

Cloudgrid's runner is responsible for deduplication on retry.
`metadata.experimentRunId + metadata.datasetItemId` form the idempotency
key on `POST /v1/run`. The adapter does not store these — if cloudgrid
retries, harness re-runs the agent.

### 2.4 Cancellation

`POST /v1/optimize` is cancellable through HTTP/1.1 connection close. The
adapter ends the in-flight workflow gracefully and emits a final
`{ event: "cancelled" }` line on the NDJSON stream before closing.

## 3. Concrete artifacts the handshake produces

- **One Zod schema set per request/response body**, lives in
  `packages/cloudgrid-harness-adapter/src/contracts.ts`. Published as
  JSON Schema via `zod-to-json-schema`, mirrored to Go types in
  `packages/go-contracts`. Single source of truth.
- **One reusable HTTP test harness** that the runner uses for contract
  tests and the adapter uses for self-tests. Lives in
  `packages/cloudgrid-harness-adapter/test/fixtures/`.
- **One golden OTel trace fixture** captured from
  `puristajs/harness/examples/living-wiki-jaeger`. Lives in
  `packages/cloudgrid-harness-adapter/test/fixtures/golden-trace.json`.
  Used by cloudgrid's collector tests as the canonical input.

## 4. Sequencing — who blocks whom

```
T = 0   shared/01..03 frozen
        cloudgrid/01-spec-proposal.md frozen
        harness/01-default-protocol.md frozen

T = 1   cloudgrid PR #1 (specs only)        ─┐
        harness PR #1 (adapter skeleton)     │
                                              ▼
T = 2   adapter /v1/run end-to-end, cloudgrid receives spans
        cloudgrid collector AI projection extractor (C2)
        cloudgrid storage-write AI persistence (C3)

T = 3   cloudgrid storage-read AI queries (C4)
        cloudgrid ai-eval-runner skeleton (C5, offline only)
        adapter /v1/score (H6)

T = 4   cloudgrid BFF resolvers (C6)
        cloudgrid frontend AI panels (C7)
        cloudgrid CLI regression gate (C8)

T = 5   cloudgrid online scorer consumer + annotation queue
        adapter /v1/optimize (H7) — bootstrap-fewshot first
        cloudgrid optimization orchestrator
        frontend scoreboard diff + promote-candidate
```

Each milestone has a hard dependency on the previous; cross-stream
parallelism only exists within a milestone.

## 5. Anti-patterns — refuse in review

- Inventing attribute names not in OTel gen_ai semconv or OpenInference.
  Both are extensible — if something is missing, propose it upstream.
- Adding a model-provider SDK (OpenAI, Anthropic, Bedrock, Azure) to
  cloudgrid services. Those belong only in harness.
- Adding a Python process to either side's deployable surface.
- Adding a REST AI-eval endpoint on cloudgrid. Public API stays GraphQL.
- Letting `core/ai-eval-runner` read SurrealDB directly. NATS only.
- Letting the collector consult a database. Normalise + publish only.
- Storing prompt/completion content in cloudgrid AI entities. Content
  stays on source span events.
- Adding a span-attribute payload format unique to the adapter. The
  adapter never invents wire formats — it speaks OTel + the HTTP
  contract above.

## 6. References

- `shared/01-landscape.md`
- `shared/02-protocol-interop.md`
- `cloudgrid/01-spec-proposal.md`
- `harness/01-default-protocol.md`
- [OTel — GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenInference semantic conventions](https://arize-ai.github.io/openinference/spec/semantic_conventions.html)
