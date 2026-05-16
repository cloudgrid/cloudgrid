---
id: CAP-OBS-004
title: Correlate logs
domain: observability-data
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: http
  sync_async: sync
  visibility: internal
  authentication: none
depends_on: []
implements:
  api: []
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
  p99_ms: 150
  throughput_per_minute: 1200
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-OBS-004-01
    kind: happy-path
    given: Logs with traceId, spanId, serviceName, and timestamps
    when: The system requests correlated logs for a trace
    then: Exact traceId matches are included, exact spanId matches are attached to spans, and nearby service/time logs are marked as contextual
  - id: AC-CAP-OBS-004-02
    kind: failure-path
    given: A log has no traceId, spanId, serviceName, or timestamp
    when: Correlation runs
    then: The log is not correlated and remains globally searchable
---

# Correlate Logs

## Correlation Rules

1. If `traceId` exists and matches the trace, classify the log as `trace`.
2. If `spanId` exists and matches a span in the trace, classify the log as `span`.
3. If `serviceName` matches the trace service and timestamp is between trace start minus 5 seconds and trace end plus 5 seconds, classify the log as `contextual`.
4. If no rule matches, do not include the log in trace detail.

When a selected span is provided, exact `span` logs are ranked before trace-level and contextual logs. Contextual logs for selected spans use the selected span service and selected span start/end plus 5 seconds.

## Constraints

- Correlation must not mutate persisted logs.
- The response model may include a derived `correlation` field for UI display.
