---
id: CAP-FE-001
title: Render trace list
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
depends_on: [CAP-OBS-001]
implements:
  api: [GQL-Query-traces]
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
  - id: AC-CAP-FE-001-01
    kind: happy-path
    given: The trace search API returns trace summaries
    when: The user opens the Trace list view
    then: The UI renders service, trace ID, start time, duration, status, span count, and log count columns
  - id: AC-CAP-FE-001-02
    kind: failure-path
    given: The trace search API returns an error
    when: The user opens the Trace list view
    then: The UI renders an inline error panel with a retry action
---

# Render Trace List

Rows must be keyboard-focusable and link to `/traces/:traceId`.
