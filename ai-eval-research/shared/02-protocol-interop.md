---
id: PROP-AIEVAL-PROTO-001
title: OTel GenAI vs OpenInference — protocol interop
layer: proposal
status: proposal
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
provenance: from-user
references:
  - PROP-AIEVAL-RES-001
  - PROP-AIEVAL-SPEC-001
  - PROP-AIEVAL-PLAN-001
  - ADR-0003
---

# OTel GenAI vs OpenInference — Protocol Interop

## TL;DR

There are **two OTel-flavored semantic conventions for LLM/agent telemetry**
in the wild as of May 2026, and they are not interchangeable. Cloudgrid
must accept both, normalize them into one internal shape, and never silently
drop attributes from either side.

| | OTel GenAI (`gen_ai.*`) | OpenInference (`llm.*`, `tool.*`, …) |
| --- | --- | --- |
| Owner | OpenTelemetry SIG (`open-telemetry/semantic-conventions`) | Arize (`Arize-ai/openinference`) |
| Status | Development / Experimental at semconv 1.41.0 | Stable v1; richer surface |
| Discriminator | `gen_ai.operation.name` (7 operations) | `openinference.span.kind` (10 kinds) |
| Namespace | flat `gen_ai.*` | dotted families: `llm.*`, `tool.*`, `retrieval.*`, `embedding.*`, `reranker.*`, `guardrail.*`, `evaluator.*` |
| Content carrying | events (`gen_ai.user.message`, `gen_ai.choice`, or `gen_ai.client.inference.operation.details`) controlled by `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` | flattened indexed attributes (`llm.input_messages.0.message.content`, `llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments`) |
| Retrieval / reranker / guardrail / evaluator | **not modeled** as of 1.41.0 | first-class span kinds |
| Tool-call shape | `execute_tool` operation + `gen_ai.tool.name` / `gen_ai.tool.call.id` | `TOOL` span kind + `tool.name` / `tool.description` / `tool.parameters` *or* indexed attributes on `LLM` output messages |
| Token attributes | `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` | `llm.token_count.prompt`, `llm.token_count.completion`, `llm.token_count.total`, plus `llm.token_count.completion_details.cache_read`, … |
| Stability opt-in | `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` | n/a |

Neither side is wrong — they evolved in parallel. OTel's GenAI conventions
were donated and incubated more recently; OpenInference was already shipping
in production. The most likely 2026/2027 outcome is "convergence without
unification": both stay alive, with interop layers (span processors,
exporters) bridging them. Cloudgrid is one of those interop layers.

## 1. The two operation vocabularies side by side

### 1.1 OTel GenAI operations (7)

| `gen_ai.operation.name` | Meaning |
| --- | --- |
| `chat` | A chat-completion model call |
| `text_completion` | A legacy completion model call |
| `embeddings` | An embedding model call |
| `generate_content` | A multimodal generate call (Google GenAI style) |
| `invoke_agent` | One agent step (a single agent turn) |
| `create_agent` | Construct/configure an agent |
| `execute_tool` | Invocation of a tool by an agent |

### 1.2 OpenInference span kinds (10)

`openinference.span.kind` ∈ { `CHAIN`, `LLM`, `TOOL`, `RETRIEVER`,
`EMBEDDING`, `AGENT`, `RERANKER`, `GUARDRAIL`, `EVALUATOR`, `PROMPT` }.

- `CHAIN` — a multi-step composition (e.g., a LangChain Runnable). No
  direct gen_ai equivalent; closest is the parent span of a `invoke_agent`.
- `LLM` ↔ gen_ai `chat` / `text_completion` / `generate_content`.
- `TOOL` ↔ gen_ai `execute_tool`.
- `RETRIEVER` — vector DB / search call. **No gen_ai equivalent.**
- `EMBEDDING` ↔ gen_ai `embeddings`.
- `AGENT` ↔ gen_ai `invoke_agent`.
- `RERANKER` — post-retrieval reranking. **No gen_ai equivalent.**
- `GUARDRAIL` — safety / policy filter. **No gen_ai equivalent.**
- `EVALUATOR` — a span representing an evaluation/judge run. **No gen_ai
  equivalent.**
- `PROMPT` — a templated prompt build step. **No gen_ai equivalent.**

**Implication for cloudgrid:** four of the ten OpenInference kinds have no
upstream OTel mapping. They cannot be discarded; cloudgrid must support
them natively, attached to OpenInference attributes, with the understanding
that OTel may add equivalents later.

## 2. Attribute mapping — canonical fields

This is the table the collector's projection code (`core/otlp-collector/internal/ai/projection.go`)
implements. **Both sides emit; one or both may be present per span.**

Precedence rule across the table: if both are present and non-empty,
`gen_ai.*` wins (it is the upstream standard); if only OpenInference is
present, use it; if values disagree on the same canonical field, attach
`cloudgrid.ai.normalization.warning` to the source span (warning grade,
non-fatal).

### 2.1 Identity and discrimination

| Canonical field | OTel GenAI | OpenInference |
| --- | --- | --- |
| Span discriminator | `gen_ai.operation.name` | `openinference.span.kind` |
| Provider | `gen_ai.provider.name` (latest) / `gen_ai.system` (legacy) | `llm.provider` (when present) |
| Model requested | `gen_ai.request.model` | `llm.model_name` |
| Model responded | `gen_ai.response.model` | n/a (single field) |
| Agent ID | `gen_ai.agent.id` | n/a — usually `metadata.agent_id` |
| Agent name | `gen_ai.agent.name` | n/a — usually `metadata.agent_name` |
| Agent version | `gen_ai.agent.version` | n/a |
| Conversation / session ID | `gen_ai.conversation.id` (latest exp.) | `session.id` (resource or attribute) |

### 2.2 Token usage

OpenInference exposes a richer breakdown; cloudgrid's `LlmCall.tokenTotals`
must accommodate both.

| Canonical | OTel GenAI | OpenInference |
| --- | --- | --- |
| Input tokens (total) | `gen_ai.usage.input_tokens` | `llm.token_count.prompt` |
| Output tokens (total) | `gen_ai.usage.output_tokens` | `llm.token_count.completion` |
| Total tokens | (sum) | `llm.token_count.total` |
| Cached input tokens | `gen_ai.input.usage.details.cache_read_tokens` (latest exp.) | `llm.token_count.prompt_details.cache_read` |
| Reasoning / thinking tokens | `gen_ai.output.usage.details.reasoning_tokens` (latest exp.) | `llm.token_count.completion_details.reasoning` |
| Audio / image tokens | `gen_ai.{input,output}.usage.details.audio_tokens` | `llm.token_count.{prompt,completion}_details.audio` |

**Cloudgrid's `LlmCall` schema** stores both `tokenTotals` (the canonical
{input, output, total} object) and `tokenDetails` (a free-form map of the
breakdown fields above, normalised onto cloudgrid-internal keys). Never
drop the breakdown — costing decisions in production agents depend on it.

### 2.3 Cost

Neither spec defines a stable `cost` attribute. Both ecosystems treat cost
as derived. Cloudgrid keeps the derivation in storage-read (per
`specs/04-backend/telemetry-query-semantics.md`) and feeds it from a
per-model price table that lives in a runtime config map. Never trust a
client-supplied `cost.usd` attribute.

### 2.4 Tool calls

This is the most divergent area. OpenInference has *two* representations
depending on how the SDK traces tool invocation:

**Representation A** — separate child `TOOL` span:

| Canonical | OTel GenAI (`execute_tool`) | OpenInference (`TOOL` span) |
| --- | --- | --- |
| Tool name | `gen_ai.tool.name` | `tool.name` |
| Tool description | n/a | `tool.description` |
| Tool call ID (correlates to LLM output) | `gen_ai.tool.call.id` | `tool.call.id` (when emitted) |
| Tool parameters (JSON string) | usually as event payload | `tool.parameters` |
| Tool result | as event / output | typically the span's `output.value` |

**Representation B** — tool call embedded as indexed attributes on the
parent `LLM` output message (OpenInference only):

```
llm.output_messages.0.message.tool_calls.0.tool_call.id
llm.output_messages.0.message.tool_calls.0.tool_call.function.name
llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments  # JSON string
```

Cloudgrid's `ToolCall` projection accepts both. When only Representation B
is present, the projection is derived during ingest from the LLM span's
indexed attributes; the projection's `spanId` points to the parent LLM
span and a `cloudgrid.toolcall.synthetic = true` marker is set.

### 2.5 Messages / conversation content

| Aspect | OTel GenAI | OpenInference |
| --- | --- | --- |
| Where messages live | **Span events** | **Flattened indexed span attributes** |
| Capture toggle | `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` ∈ `NO_CONTENT \| SPAN_ONLY \| EVENT_ONLY \| SPAN_AND_EVENT` | typically wholesale on or off via instrumentation config |
| Legacy event names | `gen_ai.user.message`, `gen_ai.assistant.message`, `gen_ai.system.message`, `gen_ai.choice`, `gen_ai.tool.message` | n/a |
| Latest experimental | single event `gen_ai.client.inference.operation.details` carrying the whole structured payload | n/a |
| Input messages | event payloads | `llm.input_messages.<i>.message.role`, `llm.input_messages.<i>.message.content` |
| Output messages | event payloads | `llm.output_messages.<i>.message.role`, `llm.output_messages.<i>.message.content`, plus tool_calls indexed beneath |

**Cloudgrid's response:** never copy message content into AI domain
entities. Both shapes stay where they are on the source span (events or
attributes), per ADR-0003. The UI's transcript view (Laminar pattern,
spec §9.1) reads from both sources via a small renderer in the BFF that
projects either representation into a uniform `Message[]` view-model.

**Content capture defaults** (ADR-0008 stub from the implementation
guide): cloudgrid defaults to **off** for both event and attribute
content. Operators opt in per-project. This aligns with the OTel
default (`NO_CONTENT`) and with harness's privacy-aware default.

### 2.6 Retrieval

Only OpenInference covers retrieval as of May 2026.

| Canonical | OTel GenAI | OpenInference |
| --- | --- | --- |
| Span discriminator | n/a | `openinference.span.kind = RETRIEVER` |
| Top-K | n/a | `retrieval.top_k` |
| Document i — ID | n/a | `retrieval.documents.<i>.document.id` |
| Document i — content | n/a | `retrieval.documents.<i>.document.content` |
| Document i — score | n/a | `retrieval.documents.<i>.document.score` |
| Document i — metadata | n/a | `retrieval.documents.<i>.document.metadata` (JSON) |

Cloudgrid's `RetrievalEvent` projection is therefore OpenInference-only
for now. The spec proposal already states this; the implementation guide
should treat it as "future OTel gen_ai equivalent" without blocking on it.

### 2.7 Guardrail / reranker / evaluator

OpenInference-only. Cloudgrid persists these as raw spans (no projection
yet) until either:

- OTel adds equivalents and we extend the projection, or
- we decide cloudgrid-internal projections are valuable (e.g.
  `EvaluatorRun` for in-line LLM-judge spans).

For v1, neither is in scope. They remain accessible via the generic span
search exactly the way they are today (ADR-0003).

## 3. Concrete normalization rules

### 3.1 Span → AI projection kind

Apply rules in order; first match wins.

```
1. if gen_ai.operation.name == "invoke_agent" → AgentRun
   OR openinference.span.kind == "AGENT"     → AgentRun

2. if gen_ai.operation.name in {"chat","text_completion","generate_content"}
                                              → LlmCall
   OR openinference.span.kind == "LLM"        → LlmCall

3. if gen_ai.operation.name == "embeddings"   → LlmCall  (sub-kind: embedding)
   OR openinference.span.kind == "EMBEDDING"  → LlmCall  (sub-kind: embedding)

4. if gen_ai.operation.name == "execute_tool" → ToolCall
   OR openinference.span.kind == "TOOL"       → ToolCall

5. if openinference.span.kind == "RETRIEVER"  → RetrievalEvent

6. else                                       → no projection (raw span only)
```

Additionally, for any `LLM`/`chat` span the projection step inspects
`llm.output_messages.*.message.tool_calls.*` and, for each entry not
already covered by a sibling `TOOL`/`execute_tool` span in the same
trace, emits a synthetic `ToolCall` projection per §2.4 Representation B.

### 3.2 Canonical field selection

For each canonical field, pick the value with this order:

```
1. gen_ai.* (latest experimental name)
2. gen_ai.* (legacy name, e.g. gen_ai.system)
3. OpenInference equivalent
4. provider-specific extension (gen_ai.openai.*, gen_ai.anthropic.*, …)
5. nil
```

If steps 1/2 and step 3 both produce non-empty values *and* they disagree,
attach the warning attribute described above. Never silently override.

### 3.3 Token detail merging

Always sum and store both the totals and the detail breakdown. If only
totals are present on one side and details on the other, keep both:

```
LlmCall.tokenTotals.input  := first non-nil of [gen_ai.usage.input_tokens, llm.token_count.prompt]
LlmCall.tokenTotals.output := first non-nil of [gen_ai.usage.output_tokens, llm.token_count.completion]
LlmCall.tokenDetails       := union(
  gen_ai.input.usage.details.*,
  gen_ai.output.usage.details.*,
  llm.token_count.prompt_details.*,
  llm.token_count.completion_details.*,
)  # with keys normalised to cloudgrid-internal names
```

### 3.4 Preservation invariant (ADR-0003 follow-through)

Every raw attribute on the source span is persisted unchanged. AI
projections only carry **pointers** and **selected canonical fields**.
Anything not modeled by §2 still exists, queryable through the normal
trace/span UI.

## 4. Status flag

Add a single span-level attribute that records what cloudgrid observed at
ingest:

```
cloudgrid.ai.semconv.flavor ∈ { "gen_ai", "openinference", "both", "neither" }
```

This is invaluable when debugging "why did this agent run not appear in
the AgentRun list" — the answer is almost always `flavor=neither` and the
fix is on the emitter side.

## 5. Operator guidance — which spec to emit

If you write or maintain the emitting application, ship **OTel GenAI**
(`gen_ai.*`) as primary and additionally annotate with `openinference.span.kind`
for the four kinds OTel doesn't yet model (`RETRIEVER`, `RERANKER`,
`GUARDRAIL`, `EVALUATOR`). Concretely for `puristajs/harness`:

- Default emission: `gen_ai.*` per OTel semconv 1.41.0, with
  `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental`.
- For retrieval/reranker steps surfaced through tools, also set
  `openinference.span.kind` on those spans (`RETRIEVER` or `RERANKER`).
- For LLM-judge spans inside optimizer workflows, set
  `openinference.span.kind = EVALUATOR`.

If you ingest from someone else's emitting application, accept whatever
arrives. Cloudgrid is the buyer; the producer chooses.

## 6. What this changes elsewhere in this proposal

- `02-spec-proposal.md` §5.2 (attribute precedence): replaced by §3 of
  this document. The §5.2 narrative still holds; this is the
  attribute-by-attribute backing.
- `02-spec-proposal.md` §4.1 (trace-derived entities): `LlmCall.tokenDetails`
  is added per §2.2 of this document. `ToolCall` gains an optional
  `synthetic` marker per §2.4.
- `03-action-plan.md` §0 (standards table): tightened — both standards
  are required, with this document as the canonical mapping.
- `03-action-plan.md` C2 (collector AI projection extractor): implement
  the dispatcher from §3.1 of this document; constants tables in
  `gen_ai_attrs.go` and `openinference_attrs.go` must be exhaustive over
  the fields in §2 of this document.

## 7. Future work

- Re-evaluate when OTel gen_ai semconv reaches Stable. The migration
  inside cloudgrid is mechanical because ADR-0003 preserved raw
  attributes.
- Track the OpenInference → OTel donation discussion if it resumes.
- If OTel adds retriever / reranker / guardrail / evaluator
  conventions, extend §2 and §3.1; do not delete the OpenInference
  fallbacks until SDK adoption catches up.

## 8. References

- [OTel — GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OTel — GenAI client spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [OTel — GenAI agent and framework spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
- [OTel — GenAI events](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/)
- [OTel — GenAI metrics](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-metrics/)
- [OTel — MCP semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/)
- [OpenInference specification](https://arize-ai.github.io/openinference/spec/)
- [OpenInference semantic conventions](https://arize-ai.github.io/openinference/spec/semantic_conventions.html)
- [OpenInference LLM span fields](https://github.com/Arize-ai/openinference/blob/main/spec/llm_spans.md)
- [OpenInference repository](https://github.com/Arize-ai/openinference)
- [Issue #2616 — convert gen_ai token usage to OpenInference](https://github.com/Arize-ai/openinference/issues/2616)
- [Issue #2010 — capture prompts/completions as events or attributes](https://github.com/open-telemetry/semantic-conventions/issues/2010)
- [Datadog — supporting OTel GenAI semconv](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)
- [Why agent telemetry needs standards (Arize)](https://arize.com/blog/agent-telemetry-standards/)
- [OpenTelemetry for AI Agents (AgentMarketCap, 2026-04)](https://agentmarketcap.ai/blog/2026/04/07/opentelemetry-ai-agents-observability-standard)
