---
id: ADR-0003
title: Preserve GenAI attributes without first-class AI entities in MVP
status: accepted
superseded_by: null
date: 2026-05-08
provenance: from-user
context: The draft wants AI-native observability but deliberately delays AgentRun, LlmCall, ToolCall, RetrievalEvent, EvalResult, and CostEvent entities.
alternatives_considered:
  - name: Preserve attributes only
    summary: Keep GenAI semantic convention attributes in generic span/log attributes.
    pros: [Avoids premature modeling, preserves source data, keeps MVP focused]
    cons: [UI cannot offer rich AI-specific workflows yet, future migration may be needed]
  - name: Model AI entities immediately
    summary: Create first-class AI domain entities in MVP.
    pros: [More AI-native UI from day one, clearer future product direction]
    cons: [Requires unresolved semantic decisions, increases implementation scope]
decision: Preserve attributes only
decision_rationale: The product cannot safely model AI-specific entities until trace/log ingest and correlation are stable. Preserving attributes keeps future options open without forcing premature decisions.
consequences:
  positive: [No source telemetry loss, reduced MVP scope]
  negative: [AI-specific views are deferred]
affects: [CAP-ING-003, TEC-BE-004, TEC-FE-002]
---

# ADR-0003: Preserve GenAI Attributes Without First-Class AI Entities In MVP
