---
title: Bridge adapter
description: Implement the message bridge port against an alternative transport.
order: 2
accent: rose
eyebrow: Handbook - Architecture - Extension boundaries
updated: 2026-05-21
---

The bridge has three duties: durable ingest streams, request/reply queries,
and registration of ephemeral live subjects. The v1 adapter is NATS
JetStream. A new bridge adapter implements the bridge-ports contract — the
cross-service shape is unchanged.

## Surface

```ts
interface BridgePort {
  // 1. Durable streams (ingest)
  publish(subject: string, payload: Uint8Array, opts?: PublishOpts): Promise<Ack>;
  consume(consumerName: string, subject: string, handler: ConsumeHandler): Subscription;

  // 2. Request/reply (queries)
  request(subject: string, payload: Uint8Array, opts?: RequestOpts): Promise<Reply>;
  reply(subject: string, handler: ReplyHandler): Subscription;

  // 3. Ephemeral subjects (live fanout)
  ephemeralSubject(prefix: string): { subject: string; close(): void };
  publishEphemeral(subject: string, payload: Uint8Array): void;
}
```

## What you must preserve

- **At-least-once durable delivery** for ingest streams.
- **Ack-after-commit** semantics on the consumer side.
- **Ephemeral subject lifecycle** — the subject is alive only while the
  registering service holds the handle.
- **Authorization** is upstream — the bridge does not authenticate; the
  publishing/consuming services do.
- **Public boundaries stay unchanged** — adding a bridge adapter must not add
  public NATS, public SurrealDB, REST telemetry reads, or frontend-direct
  realtime protocols.
