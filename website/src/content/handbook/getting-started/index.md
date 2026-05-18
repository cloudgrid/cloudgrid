---
title: "Getting Started"
description: "Run CloudGrid locally, send telemetry, and verify the repository."
sidebar: "Getting started"
order: 2
accent: emerald
eyebrow: "Handbook - Getting started"
updated: 2026-05-18
---

Start here when you want a working CloudGrid stack on your machine. Use release Compose when you want to evaluate the product from published images. Use the source quickstart when you are changing CloudGrid itself.

## Path

```mermaid
flowchart LR
  Choose{"What are you doing?"}
  Choose -->|Evaluate product| Compose["Run release Compose"]
  Choose -->|Change code| Source["Run source quickstart"]
  Compose --> Telemetry["Send telemetry"]
  Source --> Telemetry
  Telemetry --> UI["Open project workspaces"]
  Source --> Verify["Run focused checks"]
```

## Pages

| Step | Page | Outcome |
| --- | --- | --- |
| 1 | [Run the release Compose stack](/handbook/getting-started/docker-compose-release) | Run CloudGrid from published images. |
| 2 | [Local quickstart](/handbook/getting-started/local-quickstart) | Run CloudGrid from source and open the UI. |
| 3 | [Send telemetry](/handbook/getting-started/send-telemetry) | Push traces, logs, and metrics through OTLP HTTP or gRPC. |
| 4 | [Verify the repository](/handbook/getting-started/verify-the-repo) | Choose the right local check before committing. |

## Minimal Commands

Source development:

```sh
bun install
bun run setup:local
bun run dev:infra
bun run dev:all
```

Then open the frontend at <http://127.0.0.1:5173/>.

Release images:

```sh
cd deploy/compose
./cloudgrid-local.sh up
```

Then open CloudGrid at <http://localhost:3000/>.
