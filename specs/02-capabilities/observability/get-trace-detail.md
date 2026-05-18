---
id: CAP-OBS-002
title: Get trace detail
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
depends_on: [CAP-STO-002, CAP-OBS-004]
implements:
  api: [GQL-Query-trace, MSG-telemetry-traces-get]
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
  p99_ms: 700
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-OBS-002-01
    kind: happy-path
    given: A stored trace with spans, span events, span links, exception events, and correlated logs
    when: A client executes GraphQL Query.trace
    then: The BFF sends telemetry.traces.get over NATS and returns TraceDetail with trace structure, enriched spans, selected span when requested, span matches, correlated logs, related logs, and warnings
  - id: AC-CAP-OBS-002-02
    kind: failure-path
    given: No trace exists for the requested traceId
    when: A client executes GraphQL Query.trace
    then: The BFF returns a GraphQL error with ERR-004 TRACE_NOT_FOUND
---

# Get Trace Detail

## Business Intent

Show a complete trace investigation view with span hierarchy, timing, attributes, and logs.

## Constraints

- The API must return `logs: []` rather than failing when no correlated logs exist.
- Spans must include parent IDs so the frontend can build a hierarchy.
- Logs must include both direct trace/span matches and service/time-window matches defined by CAP-OBS-004.
- Span events with OpenTelemetry exception attributes must be exposed as `Span.exceptions` with readable stack trace data when possible.
- Span links must be preserved as `Span.links` and marked `forward`, `backward`, or `unknown` when direction can be inferred from linked trace timing.
- `TraceDetail.structure.criticalPathSpanIds` identifies spans that contribute
  to end-to-end trace duration. The MVP may use a deterministic
  longest-child-chain approximation; improved algorithms can ship without
  changing the contract.
- `TraceDetail.relatedLogs` is scoped to the selected span when `selectedSpanId` is provided. Otherwise it returns the most relevant trace-level logs ordered by exact span match, trace match, contextual match, then timestamp.
- `TraceDetail.warnings` includes missing root, missing parent, clock skew, partial trace, and large trace preview warnings.
- Trace detail input filters apply to span matching and related log selection; they must not mutate persisted telemetry.
- In `CLOUDGRID_AUTH_MODE=sso`, the BFF requires company membership, sends normalized auth context to storage-read, and storage-read applies tenant/project constraints before loading the trace, spans, logs, or related logs.
