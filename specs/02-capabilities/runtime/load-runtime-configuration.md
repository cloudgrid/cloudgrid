---
id: CAP-RUN-001
title: Load runtime configuration
domain: runtime
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: cli
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
  p99_ms: 100
  throughput_per_minute: 60
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-RUN-001-01
    kind: happy-path
    given: Valid environment variables or config file values
    when: Any service starts
    then: It validates its RuntimeConfig subset and passes typed config to runtime composition
  - id: AC-CAP-RUN-001-02
    kind: failure-path
    given: Missing NATS URL, missing storage service SurrealDB URL, or invalid port
    when: A service starts
    then: Startup fails with ERR-009 CONFIG_INVALID before opening the HTTP port
---

# Load Runtime Configuration

## Sources

Runtime config is loaded from environment variables first and may optionally be loaded from a local YAML or JSON config file. Environment variables override file values.

## Required Defaults

- `nats.url`: `nats://localhost:4222`.
- `bff.http.host`: `0.0.0.0`.
- `bff.http.port`: `3000`.
- `otlpCollector.http.host`: `0.0.0.0`.
- `otlpCollector.http.port`: `4318`.
- `frontend.serveStatic`: `true` in production, `false` in development.
