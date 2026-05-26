---
id: NFR-009
title: AI evaluation content capture
layer: nfr
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-16
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
