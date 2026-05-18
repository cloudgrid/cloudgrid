# Read Flow

Public telemetry reads use GraphQL through the TypeScript BFF. Storage-read owns the telemetry query semantics.

## Sequence

```mermaid
sequenceDiagram
  participant UI as Frontend
  participant BFF as TypeScript BFF
  participant Read as storage-read
  participant DB as SurrealDB

  UI->>BFF: GraphQL traces/logs/metrics/facets/detail
  BFF->>BFF: Validate input and auth/session context
  BFF->>Read: NATS request/reply with AuthContext
  Read->>Read: Validate request and authorization context
  Read->>DB: Parameterized project-scoped query
  DB-->>Read: Bounded rows, counts, facets, or series
  Read-->>BFF: Typed response or BridgeError
  BFF-->>UI: GraphQL data or problem details
```

## BFF Responsibilities

- Validate public GraphQL input.
- Normalize auth context and selected project.
- Send request/reply messages through the bridge adapter.
- Validate decoded bridge responses.
- Map canonical bridge errors to public GraphQL problem details.

The BFF does not filter, aggregate, correlate, rank, or enrich telemetry records.

## storage-read Responsibilities

- Push supported filters, sorting, cursor predicates, grouping, counts, and bounded facets into the database adapter.
- Derive GraphQL-ready trace, log, metric, and facet view models.
- Enforce read authorization context.
- Return typed success or `BridgeError`.

## Common Read Subjects

| GraphQL surface | Private subject |
| --- | --- |
| `Query.traces` | `telemetry.traces.search` |
| `Query.trace` | `telemetry.traces.get` |
| `Query.logs` | `telemetry.logs.search` |
| `Query.metricNames` | `telemetry.metrics.names` |
| `Query.metricSeries` | `telemetry.metrics.query` |
| facets | `telemetry.facets` |

## Next Step

Use [Trace investigation](../guides/trace-investigation.md), [Logs](../guides/logs.md), or [Metrics](../guides/metrics.md) for user workflows.
