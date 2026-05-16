---
id: DOM-003
title: Storage
layer: domain
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Storage

## Purpose

The storage domain owns private Go read/write storage services, SurrealDB adapter behavior, schema initialization, query behavior, and storage-specific failure mapping.

## Main Entities

- ENT-001: Trace
- ENT-002: Span
- ENT-003: LogEvent
- ENT-004: SpanEvent
- ENT-005: Service

## Key Invariants

- Only `core/storage-read` and `core/storage-write` contain SurrealQL.
- The write service is the only service that mutates SurrealDB.
- The read service is the only service that fetches telemetry from SurrealDB.
- Storage writes are idempotent for the same command ID, trace ID, span ID, and generated log event key.

## Boundaries

- Does not own public HTTP or GraphQL route handling.
- Does not own OTLP parsing.
- Does not own frontend query composition.

## Capabilities

- CAP-STO-001: Persist telemetry.
- CAP-STO-002: Query telemetry.
