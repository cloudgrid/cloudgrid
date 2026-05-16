---
id: CAP-OBS-001
title: Search traces
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
  api: [GQL-Query-traces, MSG-telemetry-traces-search]
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
  - id: AC-CAP-OBS-001-01
    kind: happy-path
    given: Stored traces for multiple services, operations, durations, attributes, and statuses
    when: A client executes GraphQL Query.traces with query, service, operation, span name, time range, status, duration, attribute, sort, limit, and cursor filters
    then: The BFF sends telemetry.traces.search over NATS and returns a deterministic page of TraceSummary records and a next cursor when more results exist
  - id: AC-CAP-OBS-001-02
    kind: failure-path
    given: A malformed cursor parameter
    when: A client executes GraphQL Query.traces
    then: The BFF returns a GraphQL error with ERR-003 INVALID_CURSOR
---

# Search Traces

## Business Intent

Let engineers find relevant traces quickly by service, status, and time range.

## Constraints

- Default sort is `startedAt desc, id asc`.
- `from` and `to` are inclusive UTC ISO 8601 timestamps.
- If no filters are provided, return most recent traces.
- Free text `query` searches trace ID, primary service, root operation, span names, and string attributes.
- Attribute filters use exact attribute keys. Dot characters in keys are literal OpenTelemetry attribute key characters.
- Duration filters apply to aggregate trace duration.
- `errorFirst` sort orders traces with status `error` first, then `startedAt desc, id asc`.
- In `CLOUDGRID_AUTH_MODE=sso`, the BFF requires company membership, sends normalized auth context to storage-read, and storage-read applies tenant/project constraints before all filters.
