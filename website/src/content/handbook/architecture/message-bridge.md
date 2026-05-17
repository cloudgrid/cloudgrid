---
title: Message bridge
description: Subjects, request/reply, durable streams, live fanout.
order: 2
accent: brand
eyebrow: Handbook · Architecture · Message bridge
updated: 2026-05-17
---

Every telemetry read and write crosses the bridge. The v1 adapter is NATS
JetStream — but the rest of CloudGrid talks to the bridge through a typed
port, so alternative transports can be implemented without touching the
services that use them.

## Subject families

Three families cover everything that flows over the bridge:

| Family | Purpose | Example subject |
| --- | --- | --- |
| `telemetry.ingest.*` | Durable streams for OTLP payloads. | `telemetry.ingest.traces` |
| `telemetry.persisted.*` | Durable post-persist notifications. | `telemetry.persisted.traces` |
| `query.*` and `live.*` | Request/reply queries and ephemeral live subjects. | `query.traces.list` |

## Ingest path

```mermaid
sequenceDiagram
  participant Sender as OTLP sender
  participant Collector as otlp-collector
  participant NATS as NATS JetStream
  participant SW as storage-write
  participant DB as SurrealDB
  participant SR as storage-read

  Sender->>Collector: OTLP HTTP/gRPC export
  Collector->>Collector: validate · authorize · normalize
  Collector->>NATS: PersistTelemetryCommand
  NATS-->>Collector: publish ack
  NATS->>SW: durable delivery
  SW->>DB: idempotent persist
  SW-->>NATS: ack after commit
  SW-->>SR: TracePersistedNotification (no span bodies)
```

The collector returns HTTP `200` only after the bridge publish is
acknowledged. Persistence is asynchronous through the durable consumer.

## Read path

Reads are pure request/reply through the bridge. The BFF builds a
`Query.*` request, the bridge routes it to a `storage-read` instance, and
the response carries either a typed result or a `BridgeError` with a
machine-readable problem detail.

```mermaid
sequenceDiagram
  participant UI as React UI
  participant BFF as TypeScript BFF
  participant SR as storage-read
  participant DB as SurrealDB

  UI->>BFF: GraphQL query
  BFF->>SR: NATS request/reply + AuthContext
  SR->>DB: parameterized query
  DB-->>SR: bounded rows / facets
  SR-->>BFF: typed bridge response
  BFF-->>UI: GraphQL data or problem detail
```

## Live trace receiving

Live subscriptions follow a slightly different shape:

1. The BFF calls `telemetry.traces.live.start` and registers an ephemeral
   sink subject.
2. `storage-read` consumes `telemetry.persisted.traces`, applies the
   subscription's filters, and publishes matching `LiveTraceEvent` messages
   to the ephemeral sink — and only to that sink.
3. When the BFF disconnects, the ephemeral subject is torn down.

The blast radius is bounded: no public service can subscribe to the durable
ingest streams directly.

## Adapter port

The bridge is a typed port, not a hard dependency. The contract covers
request/reply, durable streams, and ephemeral subject registration. A new
transport implements the port; the rest of CloudGrid is unchanged.
