---
title: Storage adapter
description: Implement the storage-read / storage-write port against your database.
order: 1
accent: rose
eyebrow: Handbook - Architecture - Extension boundaries
updated: 2026-05-21
---

Two services own the storage port: `core/storage-write` (mutations) and
`core/storage-read` (queries and live fanout). Adapter implementations live
in `internal/adapters/<database>/` within each service. The v1 adapter is
SurrealDB.

## What you must implement

- **storage-writer port** — persist canonical telemetry idempotently for
  the same command ID, trace ID, span ID, and generated log event key.
- **storage-reader port** — support filter pushdown, counts, grouping,
  sorting, cursors, and bounded facet queries *inside the database*, not in
  Go post-processing.
- **readiness checks** and **schema initialization** for your backend.
- **authorization preparation** — projections must respect project
  boundaries.
- **service ownership** — storage-write remains the only telemetry mutator and
  storage-read remains the only telemetry reader. A storage adapter must not be
  imported by the BFF, frontend, collector, or public API clients.

## A sketch

```go
package mybackend

type Writer struct{ /* ... */ }

func (w *Writer) PersistTrace(ctx context.Context, cmd PersistCommand) error {
    // 1) translate cmd into the backend's bulk-insert payload
    // 2) write with an idempotency key derived from (cmdId, traceId, spanId)
    // 3) return nil on commit, BridgeError on retryable failure
    return nil
}
```

## Idempotency keys

| Entity | Key |
| --- | --- |
| Span | `(traceId, spanId)` |
| LogEvent | `(traceId, spanId, generatedLogId)` |
| MetricPoint | `(descriptorId, attributesHash, ts)` |
| DatasetItemRun | `(experimentRunId, datasetItemId)` |
| EvalResult | `(targetKind, targetId, scorerId, scorerVersion)` |
| Optimization candidate | `(experimentRunId, promptVersionHash)` |
