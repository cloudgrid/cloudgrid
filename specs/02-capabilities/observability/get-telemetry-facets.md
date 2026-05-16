---
id: CAP-OBS-005
title: Get telemetry facets
domain: observability-data
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: research-informed
traits:
  interaction: http
  sync_async: sync
  visibility: user
  authentication: prepared
depends_on: [CAP-STO-002]
implements:
  api: [GQL-Query-telemetryFacets, MSG-telemetry-facets]
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
  - id: AC-CAP-OBS-005-01
    kind: happy-path
    given: Stored traces, spans, and logs in a time range
    when: A client executes GraphQL Query.telemetryFacets
    then: The BFF sends telemetry.facets over NATS and returns bounded service, operation, span name, severity, and attribute-key suggestions with counts
  - id: AC-CAP-OBS-005-02
    kind: failure-path
    given: The facet request has an invalid time range or limit
    when: A client executes GraphQL Query.telemetryFacets
    then: The BFF returns a GraphQL error with ERR-001 VALIDATION_FAILED
---

# Get Telemetry Facets

## Business Intent

Support fast filter construction without forcing users to remember exact service, operation, severity, or attribute names.

## Constraints

- Facets are suggestions, not authorization or completeness guarantees.
- Results are bounded by `limit`.
- Attribute-key facets are derived from persisted attribute keys and must not scan large raw body payloads.
- Empty facet arrays are valid.
- Default sort is count descending, then value ascending.
- In `CLOUDGRID_AUTH_MODE=sso`, the BFF requires company membership, sends normalized auth context to storage-read, and storage-read applies tenant/project constraints before calculating facet counts.
