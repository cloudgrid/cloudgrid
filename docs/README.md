# CloudGrid Manual

CloudGrid is an OTLP observability workspace for project-scoped traces, logs, metrics, live trace receiving, reusable dashboards, ingest API keys, retention policy configuration, project memberships, and alerting foundations. It keeps a strict public/private service boundary. This manual is written for people who want to run it, understand it, operate it, and extend it without reading the implementation first.

## Reading Path

1. [Overview](./00-overview/README.md): what CloudGrid does and which mode to choose.
2. [Getting Started](./01-getting-started/README.md): the shortest path to a working local stack.
3. [Core Concepts](./02-core-concepts/README.md): projects, security, project memberships, ingest credentials, traces, logs, metrics, dashboards, alerts, retention, and realtime behavior.
4. [Operations](./03-operations/README.md): configuration, OTLP HTTP/gRPC ingest, retention and alerting operation notes, health checks, SSO setup, reset, and troubleshooting.
5. [Architecture](./04-architecture/README.md): service boundaries, data flow, tenancy, and security model.
6. [Advanced Topics](./05-advanced/README.md): performance, scaling, and future extension points.
7. [Reference](./99-reference/README.md): commands, environment variables, ports, paths, and public contracts.

## What To Read First

| Goal | Start here |
| --- | --- |
| See CloudGrid running locally | [Getting Started](./01-getting-started/README.md) |
| Decide between local and deployed mode | [Overview](./00-overview/README.md#runtime-modes) |
| Configure SSO | [Operations](./03-operations/README.md#deployed-sso-configuration) |
| Understand why services are split | [Architecture](./04-architecture/README.md) |
| Tune throughput or plan production scale | [Advanced Topics](./05-advanced/README.md#performance-and-scaling-concept) |

The source-of-truth implementation specs live in [../specs](../specs). User-facing docs explain how to use the system; specs define what implementation agents are allowed to build.
