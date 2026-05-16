---
id: ADR-0005
title: Use simple SurrealDB tables with direct IDs for MVP
status: accepted
superseded_by: null
date: 2026-05-08
provenance: inferred-draft
context: The draft mentioned optional relation tables but allowed the first MVP to store IDs directly on records.
alternatives_considered:
  - name: Direct ID fields
    summary: Store traceId and spanId directly on span and log records.
    pros: [Simple queries, straightforward Go storage service implementation, easier JSON mapping]
    cons: [Less graph-native, relation refactors may be needed later]
  - name: Relation tables
    summary: Model trace-span, span-log, trace-log, and service relations explicitly.
    pros: [Better graph traversal semantics, closer to SurrealDB strengths]
    cons: [More schema and query complexity for MVP]
decision: Direct ID fields
decision_rationale: Direct IDs satisfy MVP query and correlation needs while keeping the Go storage read/write services easier for implementation agents to build correctly.
consequences:
  positive: [Lower implementation risk, easy upserts]
  negative: [Future graph features may require migration]
affects: [TEC-BE-003, CAP-STO-001, CAP-STO-002]
---

# ADR-0005: Use Simple SurrealDB Tables With Direct IDs For MVP
