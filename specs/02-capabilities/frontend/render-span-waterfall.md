---
id: CAP-FE-005
title: Render span waterfall
domain: frontend
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: gui
  sync_async: sync
  visibility: user
  authentication: none
depends_on: [CAP-OBS-002, CAP-FE-006]
implements:
  api: [GQL-Query-trace]
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
  p99_ms: 500
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-FE-005-01
    kind: happy-path
    given: A trace with nested spans
    when: The trace detail view renders
    then: The UI shows spans in hierarchy order with relative bars scaled to trace duration, selected state, status markers, event markers, link markers, log markers, and keyboard navigation
  - id: AC-CAP-FE-005-02
    kind: failure-path
    given: A trace has spans with missing parent spans
    when: The waterfall renders
    then: Orphan spans are displayed at root level and marked as missing-parent
---

# Render Span Waterfall

The waterfall must not require a charting dependency in MVP. CSS grid or absolutely positioned bars are sufficient. Virtualization is required when a trace has more than 500 spans.

Waterfall layout must use the highest precision timestamp fields exposed by the
trace detail contract. If `startedAtUnixNano`, `endedAtUnixNano`,
`startOffsetNano`, or `durationNano` are present, the UI must derive row offsets
and bar widths from those decimal-string nanosecond fields instead of from
JavaScript `Date` parsing of ISO strings. Falling back to ISO strings is allowed
only when raw nanosecond fields are absent. Distinct spans that start within the
same wall-clock second must render at distinct offsets when their source OTLP
timestamps differ.
