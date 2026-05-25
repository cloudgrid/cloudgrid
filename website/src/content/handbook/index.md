---
title: "CloudGrid Documentation"
description: "CloudGrid is an OTLP observability workspace for project-scoped traces, logs, metrics, live trace receiving, dashboards, ingest credentials, retention, and evaluations."
sidebar: "Overview"
order: 0
accent: brand
eyebrow: "Handbook"
updated: 2026-05-18
---

CloudGrid is an OTLP observability workspace for project-scoped traces, logs, metrics, live trace receiving, dashboards, ingest credentials, retention policies, alert management, and optional AI evaluation and optimization workflows.

This handbook is written as a product journey rather than a folder dump. Start by understanding the boundary of the product, run a stack, send telemetry, configure access, then move into daily workflows and operations.

## Install AI Skills First

If you use an AI coding assistant with CloudGrid, install the checked-in
CloudGrid skills before setup, operations, or extension work:

```sh
npx skills add cloudgrid/cloudgrid --all
```

The command uses the Vercel Labs `skills` CLI to install the CloudGrid skill
catalog. See [Install AI skills](/handbook/getting-started/install-skills) for
local checkout installs, single-skill installs, and the current skill list.

## Recommended Path

| Step | Read | Outcome |
| --- | --- | --- |
| 1 | [Install AI skills](/handbook/getting-started/install-skills) | Give compatible AI assistants the CloudGrid setup, operations, investigation, and extension playbooks. |
| 2 | [What CloudGrid is](/handbook/overview/what-is-cloudgrid) | Understand the product boundary, implemented surfaces, and known production gaps. |
| 3 | [Runtime modes](/handbook/overview/runtime-modes) | Decide whether you are running local mode or deployed SSO mode. |
| 4 | [Release Compose](/handbook/getting-started/docker-compose-release) or [Local quickstart](/handbook/getting-started/local-quickstart) | Start CloudGrid either from published images or from source. |
| 5 | [Send telemetry](/handbook/getting-started/send-telemetry) | Prove the OTLP collector, bridge, writer, reader, and UI path end to end. |
| 6 | [Concepts](/handbook/concepts) | Understand companies, projects, access, signals, live traces, metrics, retention, and alerts. |
| 7 | [Guides](/handbook/guides) | Work with ingest credentials, traces, logs, metrics, dashboards, and AI Chat. |
| 8 | [Evaluations](/handbook/evaluations) | Build datasets, run evaluations, compare candidates, and optimize targets. |
| 9 | [Configuration](/handbook/configuration) | Add the right local, deployed, SSO, SMTP, storage, and self-observability values. |
| 10 | [Operate](/handbook/operations) | Start, stop, monitor, troubleshoot, and assess production readiness. |
| 11 | [Architecture](/handbook/architecture) | Reason about service boundaries, flows, tenancy, and extension points. |
| 12 | [Reference](/handbook/reference) | Look up commands, ports, environment variables, routes, contracts, and errors. |

## How The Handbook Is Organized

The left navigation mirrors the journey:

| Area | What belongs there |
| --- | --- |
| Overview | Product scope, runtime modes, and the route tour. |
| Getting started | The two supported local paths and the first telemetry export. |
| Concepts | Companies, projects, access, signals, live traces, metrics, retention, and alerts. |
| Guides | Task guides for day-to-day observability and AI Chat work. |
| Evaluations | End-user workflows for datasets, evaluation runs, comparisons, optimization, and promotion evidence. |
| Configuration | Local mode, deployed mode, SSO, invitations, SMTP, Kubernetes, storage, and environment values. |
| Operations | Health checks, resets, bridge behavior, retention, alerting, troubleshooting, and production readiness. |
| Architecture | Internal service boundaries, flows, and extension boundaries. |
| Reference | Stable lookup tables. |

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

User-facing docs explain how to use and operate CloudGrid. Implementation behavior is defined by the contract and spec sources summarized in [Contracts](/handbook/reference/contracts). If a feature is not specified and implemented, the handbook must not present it as available.
