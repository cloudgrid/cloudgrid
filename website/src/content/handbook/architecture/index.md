---
title: "Architecture"
description: "CloudGrid is split into a public BFF, public OTLP collector, private Go services, NATS, and SurrealDB. The split keeps authorization, telemetry query."
sidebar: "Architecture"
order: 7
accent: brand
eyebrow: "Handbook - Architecture"
updated: 2026-05-18
---

CloudGrid is split into a public BFF, public OTLP collector, private Go services, NATS, and SurrealDB. The split keeps authorization, telemetry query semantics, and database access owned by the right service.

| Topic | Page |
| --- | --- |
| Service ownership | [Service boundaries](/handbook/architecture/service-boundaries) |
| OTLP write path | [Ingest flow](/handbook/architecture/ingest-flow) |
| GraphQL read path | [Read flow](/handbook/architecture/read-flow) |
| GraphQL live subscriptions | [Live trace flow](/handbook/architecture/live-trace-flow) |
| Tenant, project, and secret boundaries | [Tenancy and security](/handbook/architecture/tenancy-security) |

## At A Glance

```mermaid
flowchart LR
  Browser["Browser UI"] --> BFF["TypeScript BFF"]
  Sender["OTLP sender"] --> Collector["Go OTLP collector"]
  BFF --> NATS["NATS request/reply"]
  Collector --> JetStream["NATS JetStream"]
  NATS --> Read["storage-read"]
  NATS --> Control["control-plane"]
  JetStream --> Write["storage-write"]
  Read --> DB["SurrealDB"]
  Write --> DB
  Control --> DB
```

## Boundary Summary

- Frontend talks only to the TypeScript BFF.
- Public telemetry reads use GraphQL.
- The BFF talks to private services only through NATS request/reply and declared contracts.
- The collector publishes ingest commands and never writes SurrealDB directly.
- `storage-write` is the only normal telemetry mutator.
- `storage-read` is the only telemetry reader.
- `control-plane` owns companies, users, projects, memberships, dashboards, retention policies, alert records, and AI-eval project settings.
