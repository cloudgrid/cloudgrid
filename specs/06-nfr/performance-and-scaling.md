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
| alert-evaluator | process replica | NATS, control-plane, storage-read | project/rule work is partitioned by scheduler lease or explicit project assignment; notification dispatch is bounded |
| alert delivery adapters | process replica | NATS and provider APIs | bridge-backed queue subscribers scale independently from alert evaluation and provider latency |
| SurrealDB | deployment-specific cluster | tenant/project databases | one namespace per tenant and one strict database per project |
| NATS | JetStream cluster | streams and consumers | stream replication and durable consumers |

No scaling implementation may introduce public NATS, public SurrealDB, frontend direct storage access, or BFF telemetry aggregation.

## Storage Read Hot Paths

SurrealDB indexes for telemetry reads must match the full storage-read ownership predicate. Hot indexes therefore include `tenantId, companyId, projectId` before the selective field or sort field used by the query. Indexes that omit `companyId` are legacy-local helpers and are not sufficient for readiness of production hot paths.

Trace summary reads must use the denormalized count fields stored on `trace`: `spanCount`, `errorSpanCount`, `logCount`, and `serviceCount`. Storage-read must not recompute those counts from `span` or `log_event` on every trace-list or live-candidate page.

Single-record telemetry mutations must use deterministic SurrealDB record IDs instead of `UPDATE table WHERE ...` scans when the record ID is known.

Trace history, log history, and metric descriptor discovery reads must use cursor pagination. Storage-read must request one sentinel row beyond the client limit, return at most the client limit, and only emit `nextCursor` when the sentinel exists. Pagination cursors must match the deterministic sort tuple used in the SurrealQL query. Frontend infinite-scroll surfaces must request additional backend cursor pages and must not implement search or pagination by filtering an already-fetched subset.

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

### NATS Message Bridge

| Variable | Default | Validation | Behavior |
| --- | --- | --- | --- |
| `CLOUDGRID_NATS_MAX_PAYLOAD` | `8388608` | integer >= `CLOUDGRID_OTLP_MAX_REQUEST_BYTES` | Local Compose and bundled chart NATS payload limit. External NATS must be configured at least as high as the collector request limit. |

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
| `CLOUDGRID_MESSAGE_BRIDGE_REQUEST_TIMEOUT_MS` | `12000` | integer 100..30000 | BFF request/reply timeout for private NATS subjects. Must be greater than `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS` so storage-read owns query timeout semantics. |
| `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS` | `10000` | integer 100..30000 | Single storage-read request deadline for trace, log, metric, facet, live-notification, and AI-eval read handlers. |
| `CLOUDGRID_STORAGE_READ_MAX_PAGE_SIZE` | `200` | integer 1..1000 | Upper bound for trace/log pages. |
| `CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS` | `5000` | integer 100..100000 | Upper bound for one metric series response. |
| `CLOUDGRID_LIVE_MAX_SUBSCRIPTIONS` | `2000` | integer 1..100000 | Per storage-read pool soft limit. |
| `CLOUDGRID_LIVE_EVENT_BUFFER_SIZE` | `100` | integer 1..10000 | Per live subscription event buffer. |

Configuration validation failure maps to `ERR-009 CONFIG_INVALID`.

## Ingest Backpressure

The collector must reject requests before decoding when `Content-Length` exceeds `CLOUDGRID_OTLP_MAX_REQUEST_BYTES`. If `Content-Length` is absent, it must read through a bounded reader and fail once the limit is exceeded.

The collector must reject decoded payloads that exceed span/log/metric point count limits. It must not publish partial commands for oversized payloads.

The collector readiness check must verify that the NATS JetStream ingest subjects are available and that the connected NATS server advertises a max payload at least as large as `CLOUDGRID_OTLP_MAX_REQUEST_BYTES`. If an external NATS server keeps the stock 1 MiB limit while CloudGrid accepts 4 MiB OTLP requests, `/readyz` must remain degraded instead of accepting traffic that will fail at publish time.

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

## Runtime Saturation And Blocking

Performance work must include saturation behavior, not only happy-path latency.

- The BFF must reject oversized HTTP/GraphQL bodies before expensive parsing and
  must bound response validation logging for malformed bridge replies.
- Go services must bound goroutine fan-out, SDK-client lock wait, NATS callback
  work, and SurrealDB query concurrency.
- Health checks must be minimal and must not contend with hot-path database
  locks long enough to inflate p99 user-facing latency.
- Retry loops must use jittered backoff and state-change logging to avoid CPU
  spin and log storms during outages.
- Benchmarks must include at least one saturation profile that measures behavior
  at configured queue/concurrency limits and verifies bounded rejection or
  retryable errors instead of unbounded latency growth.

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

When a live subscription falls behind, storage-read must drop the subscription
with terminal `ERR-014 MESSAGE_BRIDGE_TIMEOUT`. It must not grow unbounded
buffers.

## Frontend Performance

Frontend requirements:

- Trace history search requests use a conservative default `limit` of 25 while
  storage-read query-plan and index optimization work is pending. This frontend
  mitigation does not change the backend maximum page size.
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
bun run bench:production
bun run bench:production:read
bun run bench:production:ingest
```

Default behavior:

- skip with a clear message unless `CLOUDGRID_ENABLE_BENCHMARKS=true`;
- require explicit target URL variables;
- production profiles require `CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like`;
- production profiles require `CLOUDGRID_BENCH_ENVIRONMENT_ID` and
  `CLOUDGRID_BENCH_IMAGE_TAG` so every result is tied to a specific promoted
  environment and release image;
- `CLOUDGRID_BENCH_REQUIRED=true` makes a failed benchmark exit non-zero;
- write JSON results under `tmp/benchmarks/`;
- never run from default unit test commands.

Acceptance output schema:

```json
{
  "profile": "local-read",
  "deploymentProfile": "local",
  "environment": "local",
  "imageTag": "local",
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
- OTLP collector parses and validates request byte, decoded trace span, log record, metric point, publish timeout, and deployed project status cache limits;
- OTLP collector rejects oversized HTTP, gRPC, trace, log, and metric exports before JetStream publish and uses the configured publish acknowledgement timeout;
- BFF parses and validates GraphQL depth, selected-field complexity, and response media-type configuration;
- BFF rejects GraphQL operations above configured depth or complexity before resolver and NATS bridge execution;
- storage-read parses and validates query timeout, max page size, max metric points, live subscription count, and live event buffer size configuration;
- storage-read applies query timeout to store calls, wires max page and metric point limits into SurrealDB query builders, and applies the live subscription count limit to the registry;
- storage-read wires `CLOUDGRID_LIVE_EVENT_BUFFER_SIZE` into the live trace registry, bounds per-subscription publish in-flight capacity, emits heartbeats every 15 seconds by default, removes subscriptions whose delivery path has not made progress for 45 seconds, and drops full-buffer subscriptions with retryable `ERR-014`;
- storage-read readiness verifies trace, span, log, metric descriptor, metric point, metric cardinality, service, and ingest command tables plus hot-path indexes, and reports index-building state separately from missing schema;
- opt-in SurrealDB query-plan integration tests skip unless `CLOUDGRID_ENABLE_SURREALDB_PLAN_TESTS=true` and assert hot trace, log, and metric query plans mention expected indexes;
- benchmark scripts skip by default, require explicit target URLs when enabled, write JSON results under `tmp/benchmarks/`, and include explicit production-like profiles for real target environments;
- production benchmark thresholds are represented in the output schema and can be enforced with `CLOUDGRID_BENCH_REQUIRED=true`, but production profiles are not part of default verification.
- frontend smoke tests cover populated trace list, trace detail waterfall, populated log list, telemetry error panels, loading rows, mobile trace detail, and critical axe checks on MVP telemetry routes;
- trace detail waterfall virtualizes visible span rows above 500 rows with overscan; trace and log tables rely on storage-read page limits and stable table rows.

Production benchmark evidence package:

- running and publishing production-like benchmark results against an actual NATS and SurrealDB deployment before declaring a specific environment production-ready.

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

- Do not add gRPC OTLP.
- Do not move log ingest to `core/log-ingest`.
- Do not declare a deployment production-ready from repository defaults alone;
  production readiness requires a benchmark run against that deployment's own
  NATS, SurrealDB, image, and runtime configuration.
- Do not introduce Kafka, Redis, or another queue.
- Do not replace GraphQL subscriptions with public SSE or raw WebSockets.
