---
id: DOM-002
title: Observability data
layer: domain
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Observability Data

## Purpose

This domain exposes canonical trace, span, log, and correlation behavior through GraphQL resolvers backed by private NATS request/reply queries.

## Main Entities

- ENT-001: Trace
- ENT-002: Span
- ENT-003: LogEvent
- ENT-005: Service
- ENT-006: TraceSearchQuery
- ENT-007: LogSearchQuery

## Key Invariants

- Search results are cursor-paginated and sorted deterministically by the Go storage-read service.
- Trace detail returns trace, spans, and logs as one GraphQL response through the TypeScript BFF.
- Logs remain globally searchable even when no trace or span correlation exists.

## Boundaries

- Does not parse OTLP payloads.
- Does not directly query SurrealDB from the TypeScript BFF.
- Does not expose REST telemetry read endpoints.

## Capabilities

- CAP-OBS-001: Search traces.
- CAP-OBS-002: Get trace detail.
- CAP-OBS-003: Search logs.
- CAP-OBS-004: Correlate logs.
- CAP-OBS-005: Get telemetry facets.
