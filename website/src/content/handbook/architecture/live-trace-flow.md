---
title: "Live Trace Flow"
description: "Live trace delivery uses GraphQL subscriptions and storage-read-managed live sessions."
order: 4
accent: brand
eyebrow: "Handbook - Architecture"
updated: 2026-05-18
---

Live trace delivery uses GraphQL subscriptions and storage-read-managed live sessions.

The BFF does not consume ingest streams or persisted notification streams directly.

## Sequence

```mermaid
sequenceDiagram
  participant UI as Frontend
  participant BFF as BFF WebSocket
  participant Read as storage-read
  participant Write as storage-write
  participant NATS as NATS

  UI->>BFF: Subscription.liveTraces(input)
  BFF->>Read: telemetry.traces.live.start
  Read-->>BFF: LiveTraceStartData
  Write-->>NATS: telemetry.persisted.traces
  NATS-->>Read: TracePersistedNotification
  Read->>Read: Apply live query and auth context
  Read-->>BFF: LiveTraceEvent
  BFF-->>UI: GraphQL next payload
  UI->>BFF: complete or disconnect
  BFF->>Read: telemetry.traces.live.stop
```

## Delivery Rules

- Live events are trace-level, not span-level.
- Delivery is at-most-once.
- Missed volatile notifications are not replayed from NATS.
- New live sessions may request bounded snapshots through storage-read.
- Per-subscription sequence numbers are owned by storage-read.

## Watchdog And Cleanup

The BFF starts a delivery watchdog after live session start. Every heartbeat, snapshot, added, or updated event resets it. If no event arrives before the watchdog deadline, the BFF closes the GraphQL subscription with a bridge timeout error and sends a stop request.

Stop requests are idempotent and must not hang WebSocket cleanup.

## Safety Rules

- The frontend opens only GraphQL subscriptions.
- The BFF must not subscribe to `telemetry.ingest.*`.
- The BFF must not subscribe to `telemetry.persisted.traces`.
- storage-read owns live filter matching and read authorization.
- storage-write notifications include only trace IDs and routing hints.

## Next Step

Read the user concept: [Live traces](/handbook/concepts/live-traces).
