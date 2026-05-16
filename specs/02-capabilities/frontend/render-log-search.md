---
id: CAP-FE-003
title: Render log search
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
depends_on: [CAP-OBS-003]
implements:
  api: [GQL-Query-logs]
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
  - id: AC-CAP-FE-003-01
    kind: happy-path
    given: The log search API returns log events
    when: The user opens the Logs view
    then: The UI renders timestamp, severity, service, trace link, span link, and body columns
  - id: AC-CAP-FE-003-02
    kind: failure-path
    given: The API returns validation error for filters
    when: The user applies invalid filters
    then: The UI shows the validation message and preserves editable filter inputs
---

# Render Log Search

The Logs route is `/logs`.
