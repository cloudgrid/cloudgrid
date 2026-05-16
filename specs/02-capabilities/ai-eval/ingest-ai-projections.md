---
id: CAP-AIE-001
title: Ingest AI projections
domain: ai-eval
layer: capability
status: approved
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-12
provenance: from-user
traits:
  interaction: message
  sync_async: async
  visibility: internal
  authentication: prepared
depends_on: [CAP-ING-003, CAP-STO-001, ADR-0003]
implements:
  api: [MSG-telemetry-ingest-ai-projections, MSG-ai-persisted-projections]
  events_published: [ai.persisted.projections]
  events_consumed: [telemetry.ingest.ai_projections]
---

# Ingest AI Projections

## Business Intent

Recognize AI-agent, model-call, tool-call, and retrieval spans without requiring a custom CloudGrid SDK.

## Behavior

- The OTLP collector inspects normalized spans after generic OTLP normalization.
- A projection is emitted when span attributes match OTel GenAI or OpenInference dispatch rules from `specs/04-backend/ai-eval-protocol-interop.md`.
- The collector still emits the existing `PersistTelemetryCommand`; AI projection ingest is additive.
- Storage-write persists projections idempotently by `(traceId, spanId, kind, syntheticKey)` and publishes `AiProjectionPersistedNotification`.
- Projection persistence must not copy prompt/completion content into AI entities.

## Acceptance Criteria

- Given a span with `gen_ai.operation.name = "chat"`, storage-write persists an `LlmCall` projection pointing to the source trace and span.
- Given an OpenInference `RETRIEVER` span, storage-write persists a `RetrievalEvent` projection.
- Given a span with both OTel GenAI and OpenInference canonical fields that disagree, the source span retains all raw attributes and the projection records a normalization warning.
- Given no AI markers, no AI projection is emitted and generic trace persistence remains unchanged.
