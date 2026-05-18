# Architecture

CloudGrid is split into a public BFF, public OTLP collector, private Go services, NATS, and SurrealDB. The split keeps authorization, telemetry query semantics, and database access owned by the right service.

| Topic | Page |
| --- | --- |
| Service ownership | [Service boundaries](./service-boundaries.md) |
| OTLP write path | [Ingest flow](./ingest-flow.md) |
| GraphQL read path | [Read flow](./read-flow.md) |
| GraphQL live subscriptions | [Live trace flow](./live-trace-flow.md) |
| Tenant, project, and secret boundaries | [Tenancy and security](./tenancy-security.md) |

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
