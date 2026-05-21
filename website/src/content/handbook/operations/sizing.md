---
title: "Sizing And Scaling"
description: "Size CloudGrid deployments using the supported profiles, scaling variables, and production benchmark evidence."
sidebar: "Sizing and scaling"
order: 10
accent: cyan
eyebrow: "Handbook - Operations"
updated: 2026-05-20
---

CloudGrid scales horizontally at service boundaries. Do not add alternate queues, public NATS, public SurrealDB, frontend direct storage access, REST telemetry read endpoints, or BFF telemetry aggregation to solve capacity problems.

## Production Envelope

The first production-scale target is:

| Signal | Target |
| --- | --- |
| OTLP HTTP ingest | 500 requests per second per deployed collector pool. |
| Span persistence | 50,000 spans per second sustained through JetStream into storage-write. |
| GraphQL reads | 250 read operations per second per BFF/storage-read pool. |
| Live traces | 2,000 concurrent live trace subscriptions per BFF/storage-read pool. |
| Collector publish ack | p99 below 250 ms when NATS is healthy. |
| Storage-write persist | p99 below 2 seconds for batches at or below configured limits. |
| Trace/log search | p99 below 750 ms for indexed single-project queries. |
| Trace detail | p99 below 1.5 seconds for traces up to 2,000 spans. |

These are benchmark targets, not promises from default values. A production environment needs its own benchmark JSON result before it is declared ready.

## Helm Profiles

| Profile | Use | Shape |
| --- | --- | --- |
| `local` | Single-node evaluation | One replica per service, bundled NATS and SurrealDB, local auth. |
| `small` | Team deployment | Two BFF replicas, two collectors, one storage-read, one storage-write. |
| `enterprise` | Production baseline | HPA-ready BFF, collector, and storage-read; storage-write pull mode; external NATS and SurrealDB recommended; SSO required. |

Profiles are values overlays, not separate charts. Customize the same chart with environment-specific replicas, resources, node placement, ingress, TLS, and dependency endpoints.

## Scaling Units

| Layer | Horizontal unit | Scaling rule |
| --- | --- | --- |
| BFF | Process replica | Stateless except cookie verification; WebSockets may reconnect to any replica. |
| OTLP collector | Process replica | Stateless except project status cache. |
| Storage-write | Worker replica | Use durable pull consumer mode for production-scale multi-replica workers. |
| Storage-read | Process replica | Request/reply queue subscribers plus live subscription registry per connection. |
| Control-plane | Process replica | Low-volume request/reply; writes remain idempotent. |
| NATS | JetStream cluster | Stream replication and durable consumers. |
| SurrealDB | Deployment-specific cluster | One namespace per tenant and strict database per project. |

## Key Scaling Variables

Collector:

| Variable | Default | Use |
| --- | --- | --- |
| `CLOUDGRID_OTLP_MAX_REQUEST_BYTES` | `4194304` | Reject oversized HTTP bodies before decode. |
| `CLOUDGRID_OTLP_MAX_SPANS_PER_REQUEST` | `10000` | Bound trace export size. |
| `CLOUDGRID_OTLP_MAX_LOGS_PER_REQUEST` | `10000` | Bound log export size. |
| `CLOUDGRID_OTLP_MAX_METRIC_POINTS_PER_REQUEST` | `20000` | Bound metric export size. |
| `CLOUDGRID_OTLP_PUBLISH_TIMEOUT_MS` | `1000` | JetStream publish ack timeout. |
| `CLOUDGRID_NATS_MAX_PAYLOAD` | `8388608` | Bundled/local NATS payload limit; keep external NATS at least as high as the collector request limit. |

Storage-write:

| Variable | Default | Use |
| --- | --- | --- |
| `CLOUDGRID_STORAGE_WRITE_CONSUMER_MODE` | `push` locally, `pull` in production values | Use `pull` for production-scale workers. |
| `CLOUDGRID_STORAGE_WRITE_PULL_BATCH_SIZE` | `100` | Pull fetch batch size. |
| `CLOUDGRID_STORAGE_WRITE_PULL_MAX_WAIT_MS` | `500` | Long-poll wait. |
| `CLOUDGRID_STORAGE_WRITE_ACK_WAIT_SECONDS` | `30` | Redelivery window. |
| `CLOUDGRID_STORAGE_WRITE_MAX_DELIVER` | `5` | Terminal advisory after repeated failures. |
| `CLOUDGRID_STORAGE_WRITE_MAX_ACK_PENDING` | `1000` | Backpressure across workers. |
| `CLOUDGRID_STORAGE_WRITE_CONCURRENCY` | `4` | Persist workers per replica. |

BFF and storage-read:

| Variable | Default | Use |
| --- | --- | --- |
| `CLOUDGRID_GRAPHQL_MAX_DEPTH` | `12` | Reject deep operations before NATS calls. |
| `CLOUDGRID_GRAPHQL_MAX_COMPLEXITY` | `500` | Reject expensive operations before resolver execution. |
| `CLOUDGRID_MESSAGE_BRIDGE_REQUEST_TIMEOUT_MS` | `12000` | BFF request/reply timeout; keep it above the storage-read query timeout. |
| `CLOUDGRID_STORAGE_READ_QUERY_TIMEOUT_MS` | `10000` | Single storage-read deadline for trace, log, metric, facet, live-notification, and AI-eval read handlers. |
| `CLOUDGRID_STORAGE_READ_MAX_PAGE_SIZE` | `200` | Maximum trace/log page size. |

Trace and log history views use cursor pagination. The service reads one extra
sentinel row internally, returns only the requested page size, and includes
`nextCursor` only when another page exists. Keep UI defaults conservative
(`25` rows is the current trace-history default) and raise page size only after
checking storage-read latency.
| `CLOUDGRID_STORAGE_READ_MAX_METRIC_POINTS` | `5000` | Maximum metric points in one response. |
| `CLOUDGRID_LIVE_MAX_SUBSCRIPTIONS` | `2000` | Per storage-read pool soft limit. |
| `CLOUDGRID_LIVE_EVENT_BUFFER_SIZE` | `100` | Per live subscription buffer. |

Invalid values fail startup with `ERR-009 CONFIG_INVALID`.

## Benchmark Commands

Benchmarks skip unless explicitly enabled:

```sh
CLOUDGRID_ENABLE_BENCHMARKS=true \
CLOUDGRID_BENCH_GRAPHQL_URL=http://localhost:3000/graphql \
CLOUDGRID_BENCH_OTLP_TRACES_URL=http://localhost:4318/v1/traces \
bun run bench:local
```

Production profiles require `CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like`:

```sh
CLOUDGRID_ENABLE_BENCHMARKS=true \
CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like \
CLOUDGRID_BENCH_REQUIRED=true \
CLOUDGRID_BENCH_ENVIRONMENT_ID=prod-eu-1 \
CLOUDGRID_BENCH_IMAGE_TAG=v1.0.0-beta \
CLOUDGRID_BENCH_GRAPHQL_URL=https://cloudgrid.example.com/graphql \
CLOUDGRID_BENCH_OTLP_TRACES_URL=https://otlp.cloudgrid.example.com/v1/traces \
bun run bench:production
```

Focused probes:

| Command | Checks |
| --- | --- |
| `bun run bench:production:read` | GraphQL read p99. |
| `bun run bench:production:ingest` | OTLP publish-ack p99. |
| `bun run bench:production` | Read and ingest probes. |

Results are written under `tmp/benchmarks/` as JSON with profile, deployment profile, environment identity, image tag, target thresholds, observed values, and pass/fail status.

## Sizing Workflow

1. Start with the profile closest to your use case.
2. Use external NATS and SurrealDB for production.
3. Pin all CloudGrid service images by digest.
4. Set resource requests and limits per service.
5. Increase BFF, collector, and storage-read replicas for HTTP, ingest, and read concurrency.
6. Use storage-write pull mode before running multiple storage-write replicas.
7. Confirm storage-read readiness passes after schema/index changes and that telemetry indexes include `tenantId`, `companyId`, and `projectId` for hot trace, log, and metric query paths.
8. Tune request, page, batch, timeout, and live subscription limits.
9. Run production benchmark probes against the exact environment.
10. Store the benchmark JSON with the release promotion record.

## Next Step

Use [Enterprise Helm install](/handbook/configuration/deployed/helm-install) for deployment and [Production readiness](/handbook/operations/production-readiness) for the readiness checklist.
