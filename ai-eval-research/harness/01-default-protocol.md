---
id: PROP-AIEVAL-HARNESS-PROTO-001
title: Harness default emission protocol — recommendation
layer: proposal
status: proposal
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-10
provenance: from-user
references:
  - PROP-AIEVAL-PROTO-001
  - PROP-AIEVAL-PLAN-001
---

# What Protocol Should Harness Emit by Default?

## TL;DR

**Dual-emit, OTel-gen_ai-primary, with a config knob to scale back.**

Harness should, by default:

1. Emit **OTel GenAI** (`gen_ai.*`) per semconv ≥ 1.41.0 with
   `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` as the
   strategic primary. This is the upstream standard, what cloudgrid
   prefers, what Datadog now ingests natively, and the long-term
   stable target.
2. **Additionally** emit OpenInference attributes (`llm.*`, `tool.*`,
   `retrieval.*`, plus `openinference.span.kind`) where they don't
   contradict (1). This is required today because Arize Phoenix does
   not read `gen_ai.*` yet, and Langfuse's content rendering on the
   v1.37+ event-based gen_ai shape is incomplete (March 2026 known
   issue, langfuse#12657).
3. For span kinds OTel doesn't model (`RETRIEVER`, `RERANKER`,
   `GUARDRAIL`, `EVALUATOR`), emit OpenInference exclusively.
4. Content capture default: **off**. Honour the OTel env var
   `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`; when on, write
   to *both* span events (OTel) and indexed attributes (OpenInference)
   because the two ecosystems read content from different places.

A single `harness.config.telemetry.flavor` knob lets operators scale
this back to one or the other if their target backend is fixed.

## Why this answer

Harness is meant to be backend-agnostic. The honest state in May 2026 is
that **no single emission shape works well with all major OSS backends
today**:

| Backend | Reads `gen_ai.*` | Reads OpenInference | Content rendering today |
| --- | --- | --- | --- |
| **Cloudgrid** (this proposal) | ✅ canonical | ✅ canonical | both (spans events + indexed attrs), per `04-otel-protocols.md` |
| **Langfuse v4** | ◐ — older attribute shape OK; v1.37+ events shape currently renders content as null (issue #12657) | ✅ via attribute mapper | full only on OpenInference path or legacy `gen_ai.content.*` |
| **Arize Phoenix** | ❌ feature request open (issue #2205); not implemented | ✅ first-class | OpenInference path only |
| **Laminar** | ✅ accepts AI-SDK telemetry which is `gen_ai.*`-shaped | ✅ accepts both | both |
| **Datadog LLM Obs** | ✅ native | ◐ | gen_ai-shaped |
| **W&B Weave** | ◐ partial | ◐ | own SDK preferred |

If harness ships only `gen_ai.*`, Phoenix users get an empty UI and
Langfuse users see null content on the latest gen_ai event shape.

If harness ships only OpenInference, the upstream OTel direction is
ignored, Datadog renders weakly, and the future migration burden lands
on every harness consumer.

Therefore dual-emit, with the two ecosystems being **co-derived from
the same harness internal state** so they cannot drift relative to each
other.

## What "dual-emit" actually means

It does **not** mean "encode the same value twice and hope nothing
diverges". It means: harness has one internal `TelemetryRecord` per
span, and one exporter pass writes both shapes from that record. There
is exactly one source of truth inside harness.

### Concrete attribute set on an LLM (chat) span

| Field | OTel attribute | OpenInference attribute | Source of truth |
| --- | --- | --- | --- |
| Discriminator | `gen_ai.operation.name = "chat"` | `openinference.span.kind = "LLM"` | both, no overlap |
| Provider | `gen_ai.provider.name` | `llm.provider` | harness `ModelProvider.id` |
| Request model | `gen_ai.request.model` | `llm.model_name` | harness model name |
| Response model | `gen_ai.response.model` | (not modeled) | model adapter response |
| Input tokens | `gen_ai.usage.input_tokens` | `llm.token_count.prompt` | adapter usage |
| Output tokens | `gen_ai.usage.output_tokens` | `llm.token_count.completion` | adapter usage |
| Total tokens | (sum derived by collector) | `llm.token_count.total` | sum |
| Cache-read tokens | `gen_ai.input.usage.details.cache_read_tokens` | `llm.token_count.prompt_details.cache_read` | adapter usage details |

For every attribute pair, harness emits **identical values** in both. A
cloudgrid-side "conflict" warning never fires because the values are
generated from the same data on the same line of code. Other backends
read whichever shape they understand.

### Tool calls — pick one representation

Don't emit both Representation A (separate `TOOL` span) and
Representation B (indexed attributes on the parent LLM output).
Pick one and stick to it. Recommended: **Representation A** — separate
child span. It composes better with W3C Trace Context, makes timing
explicit, and is what OTel `execute_tool` was designed for.

On the child tool span:

```
gen_ai.operation.name = "execute_tool"
gen_ai.tool.name     = ...
gen_ai.tool.call.id  = ...           # correlates back to the LLM output
openinference.span.kind = "TOOL"
tool.name            = ...
tool.description     = ...
tool.parameters      = "<JSON string>"   # OpenInference convention
```

Content for parameters/result also goes in span events under the
`gen_ai.tool.message` event name (legacy) or
`gen_ai.client.inference.operation.details` event (latest experimental).

### Retrieval, reranker, guardrail, evaluator — OpenInference only

No upstream OTel attribute yet, so no dual-emit:

```
openinference.span.kind = "RETRIEVER"
retrieval.top_k = 5
retrieval.documents.0.document.id = ...
retrieval.documents.0.document.score = ...
retrieval.documents.0.document.content = "<text, gated by content capture>"
```

When OTel adds retrieval semantics later, harness adds the upstream
attributes alongside; OpenInference attributes stay for back-compat
until the ecosystem catches up.

### Content capture

Honour the OTel-standard env var:

```
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT
  ∈ { NO_CONTENT, SPAN_ONLY, EVENT_ONLY, SPAN_AND_EVENT }
```

Default: `NO_CONTENT`. This is the OTel default *and* the harness
default-off policy described in `puristajs/harness/docs/concepts/architecture.md`.

When content is captured, write it both as OTel events (for OTel
gen_ai-aware backends) **and** as flattened OpenInference attributes
`llm.input_messages.<i>.message.content` and
`llm.output_messages.<i>.message.content` (for Phoenix-style
backends). Same content, two presentations.

## Config knob

Expose one operator-facing config setting:

```ts
// harness config
telemetry: {
  flavor: "dual" | "gen_ai_only" | "openinference_only";
  // default: "dual"
}
```

| `flavor` | When to use |
| --- | --- |
| `dual` (default) | Production agents whose telemetry will land in multiple backends or where the chosen backend may change. |
| `gen_ai_only` | Operators who only target a gen_ai-native backend (Datadog, modern Langfuse, cloudgrid). Smaller attribute count, lower span size. |
| `openinference_only` | Operators only targeting Phoenix or Phoenix-derived stacks. Mainly for back-compat with existing OpenInference-only dashboards. |

The `cloudgrid-harness-adapter` package (per the implementation guide)
sets `flavor: "dual"` by default but exposes the same env var
(`PURISTA_TELEMETRY_FLAVOR`) so the operator can override.

## Why not "emit `gen_ai.*` only and translate downstream in the OTel Collector"?

This is architecturally the cleanest answer. It is not currently
practical because:

- There is no mature, maintained OTel Collector processor that
  translates `gen_ai.*` → OpenInference (or vice versa) as of May 2026.
- Even if there were, the OpenInference event/attribute split for
  content (events on OTel side, indexed attributes on OpenInference
  side) requires a per-attribute fan-out the standard processors don't
  do well.
- Many self-hosters don't run a Collector at all — they point SDKs
  directly at the backend.

So translation lives **in the producing SDK** (harness) until the
Collector ecosystem matures. When that changes, harness drops to
`gen_ai_only` and ships a recommended Collector config. This is a
forward-compatible default, not a permanent decision.

## Version pinning and stability env vars

Harness should set, by default, these OTel env vars in its OTel SDK
setup:

```
OTEL_SEMCONV_STABILITY_OPT_IN = gen_ai_latest_experimental
OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = NO_CONTENT
```

And document one knob to override the first
(`PURISTA_OTEL_SEMCONV_OPT_IN`) so an operator stuck on a backend that
hasn't kept up (today, Langfuse on v1.37+ events) can opt back to the
legacy gen_ai shape.

## Risks accepted by this choice

- **More attributes per span = bigger payloads.** Mitigated by the
  config knob and by keeping content opt-in.
- **Two attribute namespaces could drift if the harness emitter is
  edited carelessly.** Mitigated by single source of truth: a
  `TelemetryRecord` → exporter table that lives in one file, plus a
  property-based test asserting both shapes are derived identically.
- **`OTEL_SEMCONV_STABILITY_OPT_IN` may rename or drop values when
  gen_ai stabilises.** Acceptable: when that happens, harness ships a
  minor release pinning the new stable value.
- **OpenInference `tool.parameters` is a JSON string, not a native
  object.** That is the OpenInference convention; do not change it for
  type purity. Cloudgrid's projection parses it back to an object.

## When to revisit this decision

Revisit when **any** of the following happens:

- OTel gen_ai conventions reach "Stable" status.
- Phoenix ships native `gen_ai.*` ingest (Arize-ai/openinference#2205
  closes as done).
- Langfuse fixes the v1.37+ events content rendering (langfuse#12657
  closes as done).
- An OTel Collector processor for gen_ai ↔ OpenInference translation
  ships in `opentelemetry-collector-contrib` and is marked stable.

When the first two land, the default can move to `gen_ai_only`. When
the fourth lands, harness can drop the OpenInference half from its
SDK entirely and let the Collector translate.

## Concrete checklist for harness maintainers

1. Add `telemetry.flavor` config field with default `"dual"`.
2. Set `OTEL_SEMCONV_STABILITY_OPT_IN` and
   `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` defaults in the
   OTel SDK bootstrap (`packages/harness/src/telemetry/otel.ts` or
   equivalent).
3. Add an exporter pass that walks the internal `TelemetryRecord` for
   each span and writes the dual attribute set per §"What dual-emit
   actually means" above.
4. Add property-based tests asserting that for any
   `TelemetryRecord`, the emitted `gen_ai.*` and OpenInference values
   for paired fields are equal.
5. Document the config knob and env vars in
   `puristajs/harness/docs/guides/configuration.md`.
6. Ship a recipes page listing the recommended `flavor` per backend:
   cloudgrid → `dual`, Phoenix-only → `openinference_only`,
   Datadog-only → `gen_ai_only`, Langfuse → `dual` until #12657 is
   resolved.

## References

- [OTel — GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OTel — content capture env var](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-events/)
- [OpenInference specification](https://arize-ai.github.io/openinference/spec/)
- [Langfuse — OTEL integration](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse issue #12657 — null content on v1.37+ event shape](https://github.com/langfuse/langfuse/issues/12657)
- [OpenInference issue #2205 — support for OTel GenAI semconv](https://github.com/Arize-ai/openinference/issues/2205)
- [Datadog LLM Obs supports OTel GenAI semconv](https://www.datadoghq.com/blog/llm-otel-semantic-convention/)
- [`04-otel-protocols.md`](./04-otel-protocols.md) — cloudgrid ingest mapping
- [`03-action-plan.md`](./03-action-plan.md) — implementation guide
