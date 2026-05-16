---
id: CAP-RUN-002
title: Compose runtime
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
depends_on: [CAP-RUN-001]
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
  p99_ms: 250
  throughput_per_minute: 60
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-RUN-002-01
    kind: happy-path
    given: Valid RuntimeConfig
    when: RuntimeBuilder builds the app
    then: It wires NATS clients, GraphQL resolvers, Hono health routes, and static frontend serving without any SurrealDB client
  - id: AC-CAP-RUN-002-02
    kind: failure-path
    given: A required adapter is missing
    when: RuntimeBuilder builds the app
    then: It throws ERR-010 RUNTIME_COMPOSITION_FAILED and starts no server
---

# Compose Runtime

## Builder Contract

Runtime composition must expose a builder-style API:

```ts
createRuntimeBuilder()
  .withConfig(config)
  .withMessageBridge(natsClient)
  .withGraphQLSchema(schema)
  .withGraphQLResolvers(resolvers)
  .withHealthRoutes()
  .withFrontendStaticServing()
  .build()
```

The builder only composes modules; it must not implement normalization, storage queries, NATS handlers, or UI behavior.
