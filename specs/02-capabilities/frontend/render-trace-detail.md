---
id: CAP-FE-002
title: Render trace detail shell
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
  p99_ms: 1000
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-FE-002-01
    kind: happy-path
    given: The trace detail API returns trace, structure, spans, selected span, matches, logs, related logs, and warnings
    when: The user opens a trace detail route
    then: The UI renders summary metadata and delegates the investigation surface to CAP-FE-006
  - id: AC-CAP-FE-002-02
    kind: failure-path
    given: The API returns TRACE_NOT_FOUND
    when: The user opens a trace detail route
    then: The UI renders a not-found state with a link back to trace list
---

# Render Trace Detail Shell

The detail route is `/traces/:traceId`. The detailed investigation behavior is specified by CAP-FE-006 and `05-frontend/trace-investigation-ux.md`.
