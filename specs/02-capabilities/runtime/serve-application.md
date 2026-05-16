---
id: CAP-RUN-003
title: Serve application
domain: runtime
layer: capability
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
traits:
  interaction: http-and-websocket
  sync_async: sync-and-async
  visibility: user
  authentication: prepared
depends_on: [CAP-RUN-002]
implements:
  api: [OPR-API-get-api-health, OPR-API-get-livez, OPR-API-get-readyz]
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
  throughput_per_minute: 600
  availability: 99.0
acceptance_criteria:
  - id: AC-CAP-RUN-003-01
    kind: happy-path
    given: The TypeScript BFF is started with reachable NATS
    when: A client requests GET /api/health
    then: The API returns ok status and NATS readiness
  - id: AC-CAP-RUN-003-02
    kind: failure-path
    given: NATS is unreachable during readiness check
    when: A client requests GET /api/health
    then: The API returns degraded status and ERR-013 MESSAGE_BRIDGE_UNAVAILABLE details without crashing
---

# Serve Application

## Route Separation

- `/graphql`: public telemetry read GraphQL endpoint for queries and subscriptions.
- `/api/health`: TypeScript BFF health endpoint.
- `/livez`: process liveness probe for deployable HTTP services.
- `/readyz`: dependency readiness probe for deployable HTTP services.
- `/assets/*`: frontend assets in production.
- `/*`: frontend `index.html` fallback in production, excluding `/api/*` and `/graphql`.

The frontend production build is emitted into `apps/backend/public` and served by the TypeScript BFF so the deployable public application is one backend package containing GraphQL, GraphQL subscriptions, health probes, and static frontend assets. In development, Vite serves the frontend and proxies `/graphql` HTTP and WebSocket traffic to the BFF.

## Shutdown

On SIGTERM or SIGINT, stop accepting HTTP requests and new GraphQL subscription operations, send `LiveTraceStopRequest` for active live trace subscriptions, wait up to 10 seconds for in-flight requests, drain NATS subscriptions, close NATS, then exit.

Go services expose `/livez` and `/readyz` for Kubernetes probes. Storage services serve probes on their service health port. The OTLP collector serves probes on its HTTP listener. Readiness must return a non-2xx status while required NATS or SurrealDB dependencies are unavailable or while shutdown is draining.
