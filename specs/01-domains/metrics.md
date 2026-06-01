---
id: DOM-008
title: Metrics
layer: domain
status: draft
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-14
provenance: user-directed
depends_on: [DOM-001, DOM-002, TEC-BE-017]
---

# Metrics

## Purpose

The metrics domain adds project-scoped OpenTelemetry metrics ingest, query, and reusable project dashboards without changing the existing trace/log security or frontend data boundaries.

## Main Entities

- ENT-MET-001: MetricDescriptor
- ENT-MET-002: MetricPoint
- ENT-DASH-001: Dashboard

## Capabilities

- CAP-MET-001: Ingest OTLP metrics.
- CAP-MET-002: Query metric series.
- CAP-MET-003: Manage project dashboards.

## Key Invariants

- Metrics are routed to exactly one project by the same trusted OTLP authorization path used for traces and logs.
- Metric attributes are telemetry dimensions, not tenant/project routing inputs.
- Storage-read owns all rate, rollup, percentile, grouping, and downsampling semantics.
- The BFF and frontend never compute metric aggregations from raw data points.
- Saved dashboards and dashboard pins are control-plane configuration, not browser-local truth.
- High-cardinality attributes are bounded before persistence and before query grouping.

## Usage Perspective

An engineer points any OpenTelemetry metrics exporter, including harness applications using `ctx.metrics`, at CloudGrid. After selecting a project, the user opens Metrics to inspect raw metric series, then opens Dashboards to create or pin focused metric/log/trace/live widgets for repeated team or personal investigation.
