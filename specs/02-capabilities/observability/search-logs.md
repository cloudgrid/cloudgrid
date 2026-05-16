---
id: CAP-OBS-003
title: Search logs
domain: observability-data
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [CAP-STO-002]
implements:
  api: [GQL-Query-logs, MSG-telemetry-logs-search]
  events_published: []
  events_consumed: []
  jobs: []
  webhooks: []
  streams: []
invariants:
  idempotent: true
  side_effects_reversible: true
  tenant_scoped: prepared
sla:
  p99_ms: 500
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-OBS-003-01
    kind: happy-path
    given: Stored logs with mixed services, severities, trace IDs, span IDs, attributes, and bodies
    when: A client executes GraphQL Query.logs with filters
    then: The BFF sends telemetry.logs.search over NATS and returns matching LogEvent records sorted by timestamp descending
  - id: AC-CAP-OBS-003-02
    kind: failure-path
    given: A malformed from or to timestamp
    when: A client executes GraphQL Query.logs
    then: The BFF returns a GraphQL error with ERR-001 VALIDATION_FAILED
---

# Search Logs

## Business Intent

Let engineers inspect logs independently of traces while retaining trace/span correlation links.

## Constraints

- Text search applies to normalized string bodies and string attribute values.
- Severity filter accepts exact `severityText` or numeric `severityNumber` ranges through the API schema.
- Logs without trace IDs remain visible.
- Attribute filters use exact attribute keys. Dot characters in keys are literal OpenTelemetry attribute key characters.
- Log rows with both trace ID and span ID must link to `/traces/:traceId?spanId=:spanId` in the frontend.
- In `CLOUDGRID_AUTH_MODE=sso`, the BFF requires company membership, sends normalized auth context to storage-read, and storage-read applies tenant/project constraints before all filters.
