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

## Status Attribute

The collector stamps `cloudgrid.ai.semconv.flavor` on source spans with one of `gen_ai`, `openinference`, `both`, or `neither`.
