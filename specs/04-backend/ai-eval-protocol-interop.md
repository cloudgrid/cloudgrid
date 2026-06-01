---
id: TEC-BE-013
title: AI evaluation protocol interop
layer: backend
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-12
provenance: from-user
depends_on: [DOM-006, ADR-0003]
---

# AI Evaluation Protocol Interop

## Intent

CloudGrid must ingest both OTel GenAI semantic conventions and OpenInference attributes because AI tooling emits both. The collector normalizes recognized fields into AI projections while preserving every source attribute and event.

## Span Dispatch

Apply rules in order:

1. `gen_ai.operation.name = "invoke_agent"` or `openinference.span.kind = "AGENT"` creates `AgentRun`.
2. `gen_ai.operation.name` in `["chat", "text_completion", "generate_content"]` or `openinference.span.kind = "LLM"` creates `LlmCall`.
3. `gen_ai.operation.name = "embeddings"` or `openinference.span.kind = "EMBEDDING"` creates `LlmCall` with sub-kind `embedding`.
4. `gen_ai.operation.name = "execute_tool"` or `openinference.span.kind = "TOOL"` creates `ToolCall`.
5. `openinference.span.kind = "RETRIEVER"` creates `RetrievalEvent`.
6. Other AI-looking spans remain generic spans with raw attributes.

OpenInference `RERANKER`, `GUARDRAIL`, `EVALUATOR`, and `PROMPT` are preserved as raw spans in v1. They do not create first-class projections in the AI-eval v1 implementation.

## Canonical Field Precedence

For a canonical field:

1. Prefer latest OTel GenAI names.
2. Fall back to legacy OTel GenAI names such as `gen_ai.system`.
3. Fall back to OpenInference equivalents.
4. Fall back to provider-specific `gen_ai.<provider>.*` extensions only when explicitly mapped.
5. Otherwise leave the canonical field absent.

When OTel GenAI and OpenInference provide different non-empty values for the same canonical field, the projection uses the OTel GenAI value and records a non-fatal normalization warning.

## Content Rule

Prompt, completion, tool parameter, tool result, retrieved document content, and judge reasoning content remain on source span events or raw source attributes. Projection entities store content-addressed digests and source event IDs only.

## Transcript View Model

Storage-read owns the `AgentRunTranscript` view model. It reads OTel GenAI span events and OpenInference indexed message attributes from bounded source spans and returns normalized transcript messages to GraphQL. The BFF and frontend must not reconstruct transcript semantics from raw spans.

## Source Flavor Metadata

The collector records source flavor with AI projection metadata and
normalization warnings. It must not stamp `cloudgrid.ai.semconv.flavor` or any
other CloudGrid-specific semantic attribute onto customer source spans.

Allowed `sourceFlavor` values on projection metadata are `gen_ai`,
`openinference`, `both`, and `neither`.

## Evaluation Evidence From Production Traces

AI Eval must prefer production-standard telemetry over CloudGrid-specific span
attributes. Customer runtimes should be able to reuse existing instrumentation
with minimal changes.

Correlation:

- Evaluation execution propagates W3C `traceparent` and `tracestate`.
- Runner and storage-read link `EvaluationItemRun` to source trace/span IDs from
  the generated trace context and adapter terminal response.
- Source spans do not need CloudGrid evaluation IDs as attributes.
- CloudGrid-specific source-span attributes are optional extensions only. They
  must not be required when W3C trace context, adapter control fields, or
  standard semantic conventions provide the needed data.

Evidence extraction precedence:

1. Use OTel GenAI semantic conventions for model, agent, embedding, retrieval,
   and tool spans when present.
2. Use OTel MCP semantic conventions for MCP operations when present.
3. Use OpenInference attributes for frameworks that already emit them.
4. Use standard HTTP, RPC, database, messaging, filesystem, exception, and
   service/resource conventions for surrounding business operations.
5. Use adapter-profile evidence selectors for customer-specific span names or
   attributes only when no standard convention exists.
6. Leave unrecognized spans as generic trace detail.

Storage-read owns the conversion from trace spans to AI Eval important steps,
trajectory summaries, and optimizer evidence. BFF, frontend, and optimizer code
must not parse raw spans directly.
