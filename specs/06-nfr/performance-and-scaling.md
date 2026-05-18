---
id: NFR-008
title: Performance and scaling
category: performance
status: draft
provenance: research-informed
target: CloudGrid supports predictable horizontal scaling by service boundary with bounded ingest, bounded reads, measured query pushdown, and explicit backpressure controls.
measurement: Unit tests, contract tests, opt-in integration benchmarks, NATS/SurrealDB readiness checks, frontend smoke tests, and k6-style load scripts with documented thresholds.
applies_to: [CAP-ING-*, CAP-OBS-*, CAP-STO-*, CAP-RUN-*]
enforcement: blocking-for-production-scale
---

# Performance And Scaling

This spec defines the next implementation-ready performance and scaling wave. It does not implement metrics ingest, gRPC OTLP, retention, production manifests, or a dedicated log-ingest service.

## Source Basis

The defaults are based on:

- NATS JetStream consumer guidance, which recommends pull consumers for new scalable processing when flow control and error handling matter, and defines `MaxAckPending` as the outstanding unacknowledged-message backpressure control.
- NATS JetStream concepts, which define the stream/consumer durability model and at-least-once delivery behavior.
- SurrealDB performance guidance, which requires index-aware query design and query-plan inspection for hot query shapes.
- SurrealDB `DEFINE INDEX` guidance, which supports `CONCURRENTLY` for long-running index builds where supported.
- GraphQL over HTTP draft guidance, which prefers `application/graphql-response+json` for better HTTP compatibility while retaining `application/json` compatibility.
- OpenTelemetry Collector configuration guidance, which documents memory-limiter processor configuration in collector pipelines.

## Production Scale Goal

The production-scale target is not unlimited ingest. The first production envelope is:

- 500 OTLP HTTP ingest requests per second per deployed collector pool.
- 50,000 spans per second sustained through JetStream into storage-write.
- 250 GraphQL read operations per second per BFF/storage-read pool.
- 2,000 concurrent live trace subscriptions per BFF/storage-read pool.
- p99 collector publish-ack latency below 250ms when NATS is healthy.
- p99 storage-write persist latency below 2s for batches at or below configured limits.
- p99 GraphQL trace/log search latency below 750ms for indexed queries over a single project database.
- p99 trace detail latency below 1.5s for traces up to 2,000 spans.

These targets are acceptance thresholds for the scaling wave. If local hardware cannot meet them, the benchmark harness must report measured capacity and fail only when the documented test profile is marked `required`.

## Scaling Topology

Scale horizontally at these boundaries:

| Layer | Horizontal unit | Shared state | Scaling rule |
| --- | --- | --- | --- |
| BFF | process replica | session cookie secret and NATS | stateless except cookie verification; WebSockets may reconnect to any replica |
| OTLP collector | process replica | NATS and project status cache source | stateless except in-memory project status cache |
| storage-write | worker replica | durable JetStream consumer and SurrealDB | shared durable pull consumer in production-scale mode |
| storage-read | process replica | SurrealDB and NATS | request/reply queue subscribers plus live subscription registry per connection |
| control-plane | process replica | control database | low-volume request/reply; writes remain idempotent |
| SurrealDB | deployment-specific cluster | tenant/project databases | one namespace per tenant and one strict database per project |
| NATS | JetStream cluster | streams and consumers | stream replication and durable consumers |

No scaling implementation may introduce public NATS, public SurrealDB, frontend direct storage access, or BFF telemetry aggregation.

## Runtime Configuration

Add these typed environment variables in the scaling wave. Defaults must preserve current local behavior.

### Collector

| Variable | Default | Validation | Behavior |
| --- | --- | --- | --- |
| `CLOUDGRID_OTLP_MAX_REQUEST_BYTES` | `4194304` | integer 65536..104857600 | Reject larger HTTP bodies with `ERR-001`. |
| `CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST` | `10000` | integer 1..100000 | Reject oversized trace exports before JetStream publish. |
| `CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST` | `10000` | integer 1..100000 | Reject oversized log exports before JetStream publish. |
| `CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST` | `20000` | integer 1..200000 | Reject oversized metric exports before JetStream publish. |
| `CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS` | `1000` | integer 100..30000 | JetStream publish ack timeout. |
| `CLOUDGRID_PROJECT_STATUS_CACHE_TTL_SECONDS` | `60` | integer 5..3600 | Freshness window. |
| `CLOUDGRID_PROJECT_STATUS_CACHE_STALE_SECONDS` | `120` | integer >= ttl | Deployed mode fail-closed boundary. |

### Storage Write

| Variable | Default | Validation | Behavior |
| --- | --- | --- | --- |
| `CLOUDGRID_STORAGE_WRITE_CONSUMER_MODE` | `push` | `push` or `pull` | Local default remains push; production scale uses pull. |
| `CLOUDGRID_STORAGE_WRITE_PULL_BATCH_SIZE` | `100` | integer 1..1000 | Pull consumer fetch batch size. |
| `CLOUDGRID_STORAGE_WRITE_PULL_MAX_WAIT_MS` | `500` | integer 10..30000 | Long-poll wait for pull fetch. |
| `CLOUDGRID_STORAGE_WRITE_ACK_WAIT_SECONDS` | `30` | integer 1..600 | JetStream redelivery window. |
| `CLOUDGRID_STORAGE_WRITE_MAX_DELIVER` | `5` | integer 1..100 | Terminal advisory after repeated failures. |
| `CLOUDGRID_STORAGE_WRITE_MAX_ACK_PENDING` | `1000` | integer 1..100000 | Backpressure across bound workers. |
| `CLOUDGRID_STORAGE_WRITE_CONCURRENCY` | `4` | integer 1..128 | In-process persist workers per replica. |

### Storage Read And BFF

| Variable | Default | Validation | Behavior |
| --- | --- | --- | --- |
| `CLOUDGRID_GRAPHQL_MAX_DEPTH` | `12` | integer 1..64 | Reject deeper operations with `ERR-001`. |
| `CLOUDGRID_GRAPHQL_MAX_COMPLEXITY` | `500` | integer 1..10000 | Reject expensive operations with `ERR-001`. |
| `CLOUDGRID_GRAPHQL_RESPONSE_MEDIA_TYPE` | `compatible` | `compatible` or `graphql-response-json` | `compatible` supports current clients; strict mode prefers `application/graphql-response+json`. |
| `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS` | `1500` | integer 100..30000 | SurrealDB read query timeout. |
| `CLOUDGRID_STORAGE_READ_MAX_PAGE_SIZE` | `200` | integer 1..1000 | Upper bound for trace/log pages. |
| `CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS` | `5000` | integer 100..100000 | Upper bound for one metric series response. |
| `CLOUDGRID_LIVE_MAX_SUBSCRIPTIONS` | `2000` | integer 1..100000 | Per storage-read pool soft limit. |
| `CLOUDGRID_LIVE_EVENT_BUFFER_SIZE` | `100` | integer 1..10000 | Per live subscription event buffer. |

Configuration validation failure maps to `ERR-009 CONFIG_INVALID`.

## Ingest Backpressure

The collector must reject requests before decoding when `Content-Length` exceeds `CLOUDGRID_OTLP_MAX_REQUEST_BYTES`. If `Content-Length` is absent, it must read through a bounded reader and fail once the limit is exceeded.

The collector must reject decoded payloads that exceed span/log/metric point count limits. It must not publish partial commands for oversized payloads.

Authentication and authorization must complete before OTLP body decoding except for method, content-type, and request-size checks. The collector must not call control-plane, storage-read, storage-write, SurrealDB, or any external authorization endpoint per ingest request. Deployed ingest uses local JWT validation plus project status cache lookup; local multi-project ingest uses startup-parsed token routing.

Storage-write production-scale mode must use a durable pull consumer named `storage-write` and support multiple replicas sharing the same durable consumer. It must:

- fetch at most `CLOUDGRID_STORAGE_WRITE_PULL_BATCH_SIZE` messages per pull;
- use explicit ack only after persistence succeeds;
- use `NakWithDelay` for retryable storage failures;
- terminate or park messages after `CLOUDGRID_STORAGE_WRITE_MAX_DELIVER` attempts;
- expose pending, redelivered, and terminal advisory counts in structured logs and service self-observability hooks.

Push mode remains allowed for local development but must not be documented as the production-scale mode.

## Read Backpressure

Every GraphQL list input must enforce:

- default page size 50;
- maximum page size from `CLOUDGRID_STORAGE_READ_MAX_PAGE_SIZE`;
- valid time ranges;
- valid field allowlists for sorting/filtering;
- opaque cursor validation.

The BFF must reject GraphQL operations above configured depth or complexity before calling NATS.

Storage-read must push supported filters, cursors, sorting, counts, and bounded facets into SurrealDB. It must not fetch broad raw rows into Go to perform filtering that SurrealDB can execute with indexed predicates.

## SurrealDB Query Plan Gates

Add an opt-in integration test suite enabled only when:

```sh
CLOUDGRID_ENABLE_SURREALDB_PLAN_TESTS=true
```

The suite must:

- run against isolated test namespace/database values;
- seed enough records for planner behavior to be meaningful;
- execute `EXPLAIN` or `EXPLAIN ANALYZE` for hot query shapes;
- assert that trace/log list queries use the expected indexed fields or fail with a readable diagnostic;
- never run from default `bun run verify`, `bun run verify:full`, or root CI without the opt-in flag.

Hot query shapes:

- trace search by `serviceName` and `startedAt`;
- trace search by `status` and `startedAt`;
- trace detail by `traceId`;
- log search by `traceId` and `timestamp`;
- log search by `serviceName` and `timestamp`;
- bounded facets for service, operation, severity, span name, and attribute keys.
- metric name search by `lastSeenAt`;
- metric series by `metricName` and `timestamp`;
- metric series by `serviceName` and `timestamp`;
- metric grouping by allowed low-cardinality attributes.

Indexes added to existing databases must be created with `CONCURRENTLY` where supported. Readiness must report index-building state separately from hard schema failure so operators can distinguish “not ready” from “index still building”.

## Live Subscription Scale

The live subscription path must remain:

```text
frontend GraphQL subscription -> BFF -> storage-read live session -> storage-write notification
```

The BFF must not consume `telemetry.persisted.traces`.

Storage-read must enforce:

- max active live subscriptions;
- bounded per-subscription event buffer;
- heartbeat every 15 seconds;
- close after 45 seconds without heartbeat or event path progress;
- filter normalization for stable subscription identity;
- cleanup on BFF disconnect and explicit stop.

When a live subscription falls behind, storage-read must drop the subscription with a terminal `ERR-014 MESSAGE_BRIDGE_TIMEOUT` or future `ERR-018 LIVE_SUBSCRIPTION_BACKPRESSURE` after that error code is added. It must not grow unbounded buffers.

## Frontend Performance

Frontend requirements:

- trace/log tables use stable row heights or virtualization when lists exceed 500 rows;
- trace waterfall renders a bounded visible row window plus overscan;
- no large telemetry arrays are duplicated in React state;
- GraphQL errors render inline problem panels with retry;
- selected project changes invalidate telemetry queries and reset live subscription filters;
- frontend never aggregates over broad raw telemetry result sets.

Smoke tests must include:

- populated trace list;
- populated trace detail with waterfall;
- populated log list;
- error panels;
- loading rows;
- mobile trace detail;
- no critical accessibility violations.

## Observability For Scaling

Until metrics ingest exists, services must expose scale signals through structured logs and readiness details.

Required structured log fields for scale-sensitive operations:

- `duration_ms`
- `operation_or_subject`
- `status`
- `request_id`
- `tenant_id` when known
- `project_id` when known
- `message_count` for batch operations
- `queue_pending` when known
- `redelivery_count` when known
- `error_id` and `error_code` on mapped failures

Logs must not include raw OTLP payloads, provider tokens, session cookies, SurrealDB credentials, or high-cardinality attribute maps.

## Benchmark Harness

Implemented scripts:

```sh
bun run bench:local
bun run bench:read
bun run bench:ingest
```

Default behavior:

- skip with a clear message unless `CLOUDGRID_ENABLE_BENCHMARKS=true`;
- require explicit target URL variables;
- write JSON results under `tmp/benchmarks/`;
- never run from default unit test commands.

Acceptance output schema:

```json
{
  "profile": "local-read",
  "startedAt": "2026-05-11T00:00:00Z",
  "durationSeconds": 300,
  "targets": {
    "graphqlP99Ms": 750,
    "otlpPublishAckP99Ms": 250
  },
  "observed": {
    "graphqlP99Ms": 0,
    "otlpPublishAckP99Ms": 0,
    "errorRate": 0
  },
  "passed": true
}
```

Current implementation status:

- storage-write parses and validates the storage-write scaling environment variables listed in this spec;
- storage-write provisions the durable `storage-write` JetStream consumer with configured ack wait, max deliver, and max ack pending;
- storage-write fetches with configured pull batch size, pull max wait, and bounded in-process concurrency;
- benchmark scripts skip by default, require explicit target URLs when enabled, and write JSON results under `tmp/benchmarks/`;
- production benchmark thresholds are represented in the output schema, but required production profiles are not part of default verification.

Remaining production-scale work:

- collector request/body/log/metric point limits and publish timeout wiring;
- BFF GraphQL depth/complexity/media-type limits;
- storage-read page-size/query-timeout/live-subscription backpressure limits;
- SurrealDB query plan gates and readiness index-building status;
- frontend virtualization/performance smoke coverage;
- end-to-end capacity benchmarking against real production-like NATS and SurrealDB deployments.

## Acceptance Matrix

| Area | Required tests |
| --- | --- |
| Config | typed parsing, invalid values, local defaults, deployed overrides |
| Collector | request byte limit, span/log count limits, publish timeout, auth cache freshness |
| Storage-write | pull consumer config, batch ack after persistence, retryable failures, max-deliver handling |
| Storage-read | page-size guard, cursor guard, query timeout, field allowlist, bounded facets |
| SurrealDB | generated query text and params, readiness indexes, opt-in query plan tests |
| BFF | depth/complexity rejection, media type negotiation, no telemetry aggregation |
| Frontend | virtualization, project change invalidation, live reconnect behavior, error panels |
| Boundaries | no frontend NATS/OTLP/SurrealDB, no BFF SurrealDB, no collector SurrealDB |

## Non-Goals

- Do not implement metrics ingest.
- Do not add gRPC OTLP.
- Do not add retention or deletion.
- Do not add production manifests in this wave.
- Do not move log ingest to `core/log-ingest`.
- Do not introduce Kafka, Redis, or another queue.
- Do not replace GraphQL subscriptions with public SSE or raw WebSockets.
