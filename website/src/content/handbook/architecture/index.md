---
title: Architecture
description: Services, message bridge, and what crosses what.
sidebar: Overview
order: 2
accent: brand
eyebrow: Handbook · Architecture
updated: 2026-05-17
---

CloudGrid is a small number of single-purpose services arranged around a
message bridge. The public surface is a TypeScript backend-for-frontend;
everything sensitive is a private Go service that only the bridge can reach.

## At a glance

```mermaid
flowchart LR
  Sender["OTLP sender"] --> Collector["otlp-collector"]
  Collector --> NATS{{"NATS JetStream"}}
  NATS --> Writer["storage-write"]
  Writer --> DB[("SurrealDB")]
  Browser["Browser"] --> BFF["TypeScript BFF"]
  BFF --> NATS
  NATS --> Reader["storage-read"]
  Reader --> DB
  BFF --> Control["control-plane"]
  Control --> DB
  classDef public fill:#6366f1,stroke:#6366f1,color:#fff;
  classDef private fill:#10172a,stroke:#94a3b8,color:#e2e8f0;
  class BFF,Collector public;
  class Writer,Reader,Control private;
```

The browser talks only to the BFF. The BFF talks to private services through
NATS request/reply. Storage services own database access. The shape is
deliberate: every authorization decision lives in one place per
responsibility.

## Read more

- [Services](/handbook/architecture/services) — what each Go and TypeScript
  service owns, and what it must not do.
- [Message bridge](/handbook/architecture/message-bridge) — subjects,
  request/reply semantics, durable streams, and live subscription fanout.
