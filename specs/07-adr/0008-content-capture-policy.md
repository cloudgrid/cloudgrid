---
id: ADR-0008
title: AI content capture defaults to off
status: accepted
superseded_by: null
date: 2026-05-12
provenance: from-user
context: Prompt, completion, tool, and retrieval content is useful for debugging and evals but can contain sensitive data.
decision: Default AI content capture to off and never copy content into AI projection entities.
decision_rationale: The product can provide metadata, scoring, and workflow value without making sensitive content capture the default. Operators can opt in at the emitter.
consequences:
  positive: [Safer local and deployed defaults, smaller stored projections]
  negative: [Transcript and dataset promotion may require user-supplied content when capture is disabled]
affects: [NFR-009, CAP-AIE-005]
---

# ADR-0008: Content Capture Policy

`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=NO_CONTENT` is the default. Captured content remains in source spans only.
