---
id: CAP-FE-004
title: Render filters
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
depends_on: [CAP-OBS-001, CAP-OBS-003, CAP-FE-006]
implements:
  api: [GQL-Query-traces, GQL-Query-logs]
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
  - id: AC-CAP-FE-004-01
    kind: happy-path
    given: The user enters service, operation, span name, status, severity, search, duration, attribute, or time range filters
    when: Filters are applied
    then: The UI updates URL query parameters and refetches the matching API
  - id: AC-CAP-FE-004-02
    kind: failure-path
    given: The user enters an invalid time range
    when: Filters are applied
    then: The UI blocks submission and explains the invalid field
---

# Render Filters

Filter state must be represented in URL query parameters for shareable views. Trace-detail filters preserve selected span state unless the selected span no longer exists in the trace.
