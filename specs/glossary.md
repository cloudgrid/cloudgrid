---
id: GLS-001
title: Glossary
layer: foundation
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Glossary

### ENT-001: Trace

A set of spans that represent one distributed operation or request.

**Fields**: authoritative in `03-contracts/entities/trace.schema.json`.
**Synonyms**: request trace, distributed trace.
**Status**: draft.

---

### ENT-002: Span

A timed operation within a trace, preserving OpenTelemetry span identity, hierarchy, status, and attributes.

**Fields**: authoritative in `03-contracts/entities/span.schema.json`.
**Synonyms**: operation, trace segment.
**Status**: draft.

---

### ENT-003: LogEvent

A single log record ingested through OTLP logs and optionally correlated with a trace or span.

**Fields**: authoritative in `03-contracts/entities/log-event.schema.json`.
**Synonyms**: log record, log line.
**Status**: draft.

---

### ENT-004: SpanEvent

A timestamped event embedded in a span.

**Fields**: authoritative in `03-contracts/entities/span-event.schema.json`.
**Status**: draft.

---

### ENT-005: Service

An emitting OpenTelemetry service identified primarily by the resource attribute `service.name`.

**Fields**: authoritative in `03-contracts/entities/service.schema.json`.
**Status**: draft.

---

### ENT-006: TraceSearchQuery

Filter and pagination parameters for trace search.

**Fields**: authoritative in `03-contracts/entities/trace-search-query.schema.json`.
**Status**: draft.

---

### ENT-007: LogSearchQuery

Filter and pagination parameters for log search.

**Fields**: authoritative in `03-contracts/entities/log-search-query.schema.json`.
**Status**: draft.

---

### ENT-008: RuntimeConfig

Validated configuration consumed by runtime composition and adapters.

**Fields**: authoritative in `03-contracts/entities/runtime-config.schema.json`.
**Status**: draft.
