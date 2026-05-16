---
id: NFR-001
title: MVP API latency
category: performance
status: draft
provenance: inferred-draft
target: GraphQL read p99 below 2000ms for 20 requests per second and OTLP publish-ack p99 below 1000ms for 10 requests per second on a local developer machine
measurement: Bun tests, Go integration tests, Playwright, or k6 smoke benchmark measuring BFF GraphQL, collector publish ack, NATS, and SurrealDB over 5 minutes locally
applies_to: [CAP-ING-*, CAP-OBS-*]
enforcement: warning
---

# MVP API Latency

The MVP is local/small-team focused. Latency targets are intended to catch accidental inefficient query or mapping behavior, not to certify production scale.

Production-scale targets, backpressure controls, query-plan gates, and benchmark harness requirements are defined in [Performance and scaling](./performance-and-scaling.md).

Trace investigation performance requirements:

- The span waterfall virtualizes rows when a trace has more than 500 spans.
- Trace detail rendering must keep DOM row count bounded by viewport size plus overscan.
- Trace-detail search and filter interactions should update visible highlights within 150ms for 1,000 spans on a developer laptop.
- GraphQL `TraceDetail.relatedLogs` is bounded by `relatedLogLimit` and defaults to 50.
