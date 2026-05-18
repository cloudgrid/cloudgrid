# CloudGrid Documentation

CloudGrid is an OTLP observability workspace for project-scoped traces, logs, metrics, live trace receiving, dashboards, ingest credentials, retention policies, alert management, and optional AI evaluation workflows.

This documentation is written as a storyline. Start with the product model, run a local stack, configure the runtime, send telemetry, investigate the data, then operate the services.

## Reading Path

| Step | Read | Outcome |
| --- | --- | --- |
| 1 | [What CloudGrid is](./overview/what-is-cloudgrid.md) | Understand the product boundary and the current implementation status. |
| 2 | [Runtime modes](./overview/runtime-modes.md) | Choose local mode or deployed SSO mode. |
| 3 | [Local quickstart](./getting-started/local-quickstart.md) or [release Compose](./getting-started/docker-compose-release.md) | Run CloudGrid locally and open the UI. |
| 4 | [Send telemetry](./getting-started/send-telemetry.md) | Push traces, logs, and metrics through the real OTLP collector. |
| 5 | [Configuration](./configuration/README.md) | Set local, deployed, SSO, storage, and self-observability values. |
| 6 | [Guides](./guides/ingest-otlp.md) | Use project API keys, traces, logs, metrics, dashboards, and AI eval. |
| 7 | [Operations](./operations/README.md) | Start, stop, monitor, troubleshoot, and prepare for production. |
| 8 | [Reference](./reference/README.md) | Look up commands, ports, environment variables, routes, and contracts. |

## Documentation Tree

```text
docs/
  overview/                 Product model and runtime modes
  getting-started/          Source quickstart, release Compose, and first telemetry
  concepts/                 Companies, projects, telemetry, access, live data
  configuration/
    local/                  Local mode, token routing, self-observability
    deployed/
      sso/                  GitHub, Google, and Azure Entra ID SSO
  guides/                   Task-focused user workflows
  operations/               Health, reset, bridge monitoring, troubleshooting
  architecture/             Public/private service boundaries and flows
  reference/                Lookup tables for commands, env vars, ports, routes
```

The old numbered paths under `00-overview`, `01-getting-started`, and similar directories are kept as compatibility entry points. New documentation should be added to the topic tree above.

## System Thumbnail

```mermaid
flowchart LR
  Sender["OTLP sender"] --> Collector["Go OTLP collector"]
  Collector --> NATS["NATS JetStream"]
  NATS --> Write["storage-write"]
  Write --> DB["SurrealDB"]
  Browser["Browser UI"] --> BFF["TypeScript BFF"]
  BFF --> Read["storage-read"]
  BFF --> Control["control-plane"]
  Read --> DB
  Control --> DB
```

The browser talks only to the TypeScript BFF. Public telemetry reads use GraphQL. The BFF talks to private services through NATS request/reply. The collector publishes ingest commands and never writes SurrealDB directly. Only `storage-write` mutates telemetry, and only `storage-read` fetches telemetry.

## Source Of Truth

User-facing docs explain how to use and operate CloudGrid. Implementation behavior is defined by the specs in [../specs/spec.md](../specs/spec.md). If a feature is not defined there, these docs must not present it as available.
