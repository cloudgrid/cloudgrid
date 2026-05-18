# Telemetry Signals

CloudGrid treats OpenTelemetry traces, logs, and metrics as first-class project-scoped signals.

## Traces And Spans

A trace is one end-to-end execution. A span is one operation inside a trace.

CloudGrid preserves OpenTelemetry IDs:

- `trace.id` equals the OpenTelemetry trace ID.
- `span.id` equals the OpenTelemetry span ID.
- span events and span links remain attached to the trace detail view model.

Trace search is available at `/traces`. Trace investigation opens at `/traces/:traceId`.

## Logs

CloudGrid accepts OTLP logs through the collector and stores them in the selected project. Logs may correlate to traces and spans when the incoming log record carries trace ID and span ID.

`/logs` is a first-class workspace for log search, selected-log inspection, body/attribute review, and same-project trace/span pivots.

CloudGrid never searches another project to satisfy a log correlation link.

## Metrics

CloudGrid accepts OpenTelemetry metric points through `/v1/metrics` and stores metric descriptors, points, and exemplars.

Supported metric kinds:

- `gauge`
- `sum`
- `histogram`
- `exponential_histogram`
- `summary`

Storage-read owns metric name search, descriptor lookup, filters, grouping, interval downsampling, aggregation compatibility, and exemplar trace/span links.

## Signal Ownership

| Layer | Owns |
| --- | --- |
| Frontend | Rendering GraphQL view models and local presentation state. |
| TypeScript BFF | GraphQL validation, auth context, bridge request/reply mapping, and public error mapping. |
| OTLP collector | OTLP HTTP/gRPC ingest, ingest authorization, normalization, and publish acknowledgement. |
| storage-write | Idempotent persistence and post-persist notifications. |
| storage-read | Query semantics, filtering, aggregation, correlation, live matching, and view-model derivation. |

The BFF and frontend must not aggregate, correlate, rank, or enrich telemetry records.

## Signal Flow

```mermaid
flowchart LR
  subgraph Ingest
    Sender["OTLP traces/logs/metrics"] --> Collector["collector"]
    Collector --> Stream["telemetry.ingest.*"]
    Stream --> Write["storage-write"]
  end

  subgraph Read
    UI["Frontend"] --> BFF["GraphQL BFF"]
    BFF --> Read["storage-read"]
    Read --> DB["SurrealDB"]
  end

  Write --> DB
```

## Next Step

Use [Send telemetry](../getting-started/send-telemetry.md) to send signals, then read the task guides for [traces](../guides/trace-investigation.md), [logs](../guides/logs.md), and [metrics](../guides/metrics.md).
