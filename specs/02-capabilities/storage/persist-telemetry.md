---
id: CAP-STO-001
title: Persist telemetry
domain: storage
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: message-bridge
  sync_async: sync
  visibility: internal
  authentication: prepared
depends_on: []
implements:
  api: [MSG-telemetry-ingest-traces, MSG-telemetry-ingest-logs, MSG-telemetry-persisted-traces]
  events_published: [TracePersistedNotification]
  events_consumed: []
  jobs: []
  webhooks: []
  streams: []
invariants:
  idempotent: true
  side_effects_reversible: false
  tenant_scoped: false
sla:
  p99_ms: 500
  throughput_per_minute: 2000
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-STO-001-01
    kind: happy-path
    given: Canonical Trace, Span, and LogEvent entities
    when: The Go storage-write service consumes a PersistTelemetryCommand
    then: SurrealDB contains queryable records using the table shapes in surrealdb-persistence.md and the JetStream message is acknowledged
  - id: AC-CAP-STO-001-02
    kind: failure-path
    given: SurrealDB is unavailable
    when: The Go storage-write service handles a PersistTelemetryCommand
    then: The service does not acknowledge the message until retry budget is exhausted, then records ERR-006 STORAGE_UNAVAILABLE in logs and leaves the message terminal state observable
  - id: AC-CAP-STO-001-03
    kind: happy-path
    given: A PersistTelemetryCommand with one or more trace records is persisted successfully
    when: The transaction or command-scope persistence completes
    then: Storage-write publishes a volatile TracePersistedNotification with trace IDs and persistedAt after the write succeeds
---

# Persist Telemetry

## Constraints

- Only the Go storage-write service mutates SurrealDB.
- Writes for a single ingest command are all-or-nothing at command scope where SurrealDB transaction support is available.
- If transactions are unavailable in the chosen SurrealDB mode, persist traces before spans and logs and record ERR-007 PARTIAL_WRITE if any later step fails.
- Duplicate traces and spans are upserted by canonical ID.
- Duplicate logs are upserted by generated `LogEvent.id`.
- Storage-write publishes `TracePersistedNotification` to the core NATS subject `telemetry.persisted.traces` only after successful trace persistence. The notification contains `commandId`, `traceIds`, `persistedAt`, and optional `serviceNames` hints.
- Post-persist notifications are volatile live wake-up hints. They are not written to JetStream, are not replayed, and do not carry a redelivery obligation. Storage-write acknowledges the original ingest command after persistence even if the live notification publish fails, while logging ERR-013 for the notification failure.
- `TracePersistedNotification` must not contain full spans, logs, attributes, raw OTLP payloads, SurrealDB record IDs, credentials, or authorization tokens.
- Future ingestion authorization is enforced before `PersistTelemetryCommand` enters the bridge. Storage-write may persist future tenant/project ownership fields supplied by authorized commands, but it does not make public authorization decisions.
