---
id: CAP-STO-002
title: Query telemetry
domain: storage
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: message-bridge
  sync_async: sync-and-async
  visibility: internal
  authentication: prepared
depends_on: [CAP-STO-001]
implements:
  api: [MSG-telemetry-traces-search, MSG-telemetry-traces-get, MSG-telemetry-logs-search, MSG-telemetry-facets, MSG-telemetry-traces-live-start, MSG-telemetry-traces-live-stop]
  events_published: [LiveTraceEvent]
  events_consumed: [TracePersistedNotification]
  jobs: []
  webhooks: []
  streams: []
invariants:
  idempotent: true
  side_effects_reversible: true
  tenant_scoped: false
sla:
  p99_ms: 400
  throughput_per_minute: 1200
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-STO-002-01
    kind: happy-path
    given: Persisted traces, spans, span links, events, and logs
    when: The Go storage-read service receives valid NATS request/reply search messages
    then: It returns stable cursor-paginated results that match filters
  - id: AC-CAP-STO-002-02
    kind: failure-path
    given: Query parameters contain invalid time ranges
    when: The Go storage-read service receives a query message
    then: It returns BridgeError ERR-001 VALIDATION_FAILED without querying SurrealDB
  - id: AC-CAP-STO-002-03
    kind: happy-path
    given: A live trace subscription is registered and a persisted trace notification arrives
    when: The trace matches the live query and read authorization context
    then: Storage-read emits LiveTraceEvent with a GraphQL-ready TraceSummary and monotonically increasing seq
---

# Query Telemetry

## Constraints

- Only the Go storage-read service fetches telemetry from SurrealDB.
- The read service validates query shape before issuing SurrealQL.
- Cursor pagination must be deterministic across repeated calls while data is unchanged.
- Time range filters use inclusive bounds.
- Trace detail queries return all persisted span events and links.
- Trace detail view-model derivation must not mutate persisted records.
- Facet queries are bounded and return empty arrays when no values match.
- Storage-read owns telemetry query semantics and must return GraphQL-ready view models through NATS responses.
- The TypeScript BFF and frontend must not compute trace/log filters, counts, facets, service breakdowns, span matches, related logs, or trace structure from broader raw result sets.
- Storage-read adapters must push supported filters, sorting, cursor predicates, grouping, counts, and bounded facet aggregation into the database. Code-side derivation is allowed only for the exceptions listed in `04-backend/telemetry-query-semantics.md`.
- Live trace subscriptions are read operations. Storage-read owns live filter matching, read authorization, per-subscription sequence numbers, heartbeat scheduling, and cleanup.
- Live trace candidate resolution must reuse trace search filter construction for overlapping fields and may add only a trace ID candidate predicate plus live-specific limit behavior.
- Storage-read must consume post-persist notifications, not ingest commands, for live reads.
