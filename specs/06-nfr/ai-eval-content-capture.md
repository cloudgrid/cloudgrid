---
id: NFR-010
title: AI evaluation content capture
layer: nfr
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-31
provenance: from-user
depends_on: [DOM-006, ADR-0008]
---

# AI Evaluation Content Capture

## Requirement

Content capture defaults to off. CloudGrid must remain useful from metadata, IDs, timings, token counts, statuses, and digests when prompt or completion bodies are absent.

## Rules

- Emitters use `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`.
- Default value is `NO_CONTENT`.
- When content exists, it remains in source span events or source span attributes.
- AI projection entities store digests and source pointers, not full prompt/completion bodies.
- Public GraphQL responses expose captured AI content only through `AgentRunTranscriptMessage.content` and dataset promotion preview fields, and only when the source span contains it.
- Skill optimization may send bounded dataset row content, actual output
  previews, metric problems, important steps derived from OTLP spans, and
  trajectory summaries to the harness optimizer only when the dataset row
  content is already eligible for offline evaluation and the project content
  policy allows optimizer use. Validation and test row content must not be sent
  to optimizer reflection, rejected-edit memory, slow update, or meta memory.
- Classification and extraction prompt optimization may send bounded training
  row input, expected value, actual output preview, family diagnosis, metric
  problems, important steps, trajectory summaries, trace refs, and rejected
  prompt/example change summaries to the CloudGrid optimizer or custom optimizer
  adapter only when project content policy allows optimizer use. Validation and
  test row content must not be sent to proposal generation, rejected change
  summaries, custom optimizer adapters, slow update, or meta memory.
- External business context adapters must provide optimizer-relevant step
  evidence through OTLP traces that use standard semantic conventions where
  available: OTel GenAI, OTel MCP, OpenInference, HTTP, RPC, database,
  messaging, filesystem, exception, and service/resource attributes. HTTP
  adapter responses may carry terminal status, actual output or output refs,
  bounded problem details, usage/cost/timing, and trace refs; they must not
  carry full traces, customer logs, file trees, MCP state, or business records.
- Captured preview attributes used for AI Eval evidence are capped at 2,000
  UTF-8 bytes after redaction. Larger content must be represented by artifact
  refs with retention metadata and explicit content policy, not inline span
  attributes.
- Skill optimization must never request, infer, persist, or return hidden
  chain-of-thought. Optimizer rationale fields are bounded summaries supplied by
  the optimizer adapter, not reasoning traces.
- Prompt optimization must never request, infer, persist, or return hidden
  chain-of-thought. Proposal rationale fields are bounded summaries, not
  reasoning traces.
- Logs must not include prompt/completion bodies by default.
- Dataset items may store full input and expected output only when the user
  explicitly creates, imports, or reviews that item. Trace-derived projections
  still store digests and pointers only.
- Production-derived or trace-derived dataset candidates may pass through a realistic
  anonymization stage before commit. Realistic anonymization replaces sensitive
  values with safe fake values that preserve semantic shape, locale, format, and
  repeated-reference consistency. It records policy provenance but must not
  store original sensitive values in dataset items, candidate records, logs,
  GraphQL responses, generated assets, or metric evidence.
- Realistic anonymization is distinct from synthetic data. A production-derived
  anonymized item keeps `sourceKind = production_trace` and records
  `contentTreatment = realistic_anonymized`; it is not marked `synthetic`
  unless the input or expected output was generated rather than transformed.
- Synthetic dataset items must be marked in metadata and must not be
  indistinguishable from production-derived items.
- Provider profiles, model aliases, metric settings, external adapter metadata,
  and future production policies must reject raw secret-looking fields.
