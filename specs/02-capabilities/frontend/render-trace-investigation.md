---
id: CAP-FE-006
title: Render trace investigation
domain: frontend
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: research-informed
traits:
  interaction: gui
  sync_async: sync
  visibility: user
  authentication: none
depends_on: [CAP-OBS-002, CAP-OBS-003, CAP-OBS-004]
implements:
  api: [GQL-Query-trace, GQL-Query-logs, GQL-Query-telemetryFacets]
  events_published: []
  events_consumed: []
  jobs: []
  webhooks: []
  streams: []
invariants:
  idempotent: true
  side_effects_reversible: true
  tenant_scoped: false
sla:
  p99_ms: 1000
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-FE-006-01
    kind: happy-path
    given: A trace detail response with spans, structure, selected span, events, links, exceptions, and logs
    when: The user opens `/traces/:traceId?spanId=:spanId`
    then: The UI renders the selected span, highlights it in the overview and waterfall, and shows span details plus related logs
  - id: AC-CAP-FE-006-02
    kind: happy-path
    given: The user enters a span search or filter
    when: The trace detail query refetches
    then: Matching spans are highlighted, match navigation is available, and ancestors needed for hierarchy remain visible
  - id: AC-CAP-FE-006-03
    kind: failure-path
    given: A trace has missing parents, missing root, or clock skew
    when: The trace investigation view renders
    then: The UI shows warnings without hiding affected spans
  - id: AC-CAP-FE-006-04
    kind: performance
    given: A trace contains more than 500 spans
    when: The waterfall renders
    then: The UI virtualizes rows and does not render all spans as DOM rows at once
---

# Render Trace Investigation

## Business Intent

Give engineers one coherent screen for understanding a request path, selecting a span, reading stack traces, checking events and links, and reviewing related logs.

## Constraints

- Use `Query.trace` as the primary data source.
- Use `Query.logs` only for explicit pivots or expanded log searches that exceed the bounded related logs in `TraceDetail.relatedLogs`.
- Keep selected span, active tab, span filters, and search state in the URL.
- All user-visible labels must pass through the frontend translation layer.
- UI controls use shadcn primitives and default theme tokens.
