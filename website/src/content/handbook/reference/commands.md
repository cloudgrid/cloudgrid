---
title: "Commands"
description: "Run commands from the repository root unless a command says otherwise."
order: 1
accent: rose
eyebrow: "Handbook - Reference"
updated: 2026-05-19
---

Run commands from the repository root unless a command says otherwise.

## Local Development

| Purpose | Command |
| --- | --- |
| Install dependencies | `bun install` |
| Prepare local token routing | `bun run setup:local` |
| Start NATS and SurrealDB | `bun run dev:infra` |
| Start local app stack | `bun run dev:all` |
| Start BFF/frontend dev | `bun run dev` |
| Seed development telemetry | `bun run dev:seed` |
| Seed continuous live telemetry | `bun run dev:seed:live` |
| Reset local infrastructure data | `docker compose --env-file .env down -v` |

## Release Compose

| Purpose | Command |
| --- | --- |
| Start release stack | `./cloudgrid-local.sh up` |
| Start release stack from checkout | `deploy/compose/cloudgrid-local.sh up` |
| Pull release images | `./cloudgrid-local.sh pull` |
| Stop release stack | `./cloudgrid-local.sh down` |
| Reset release stack data | `./cloudgrid-local.sh reset` |

## Verification

| Purpose | Command |
| --- | --- |
| Default verification | `bun run verify` |
| Full local verification | `bun run verify:full` |
| Format check | `bun run format:check` |
| Typecheck | `bun run typecheck` |
| Lint | `bun run lint` |
| Bun tests | `bun run test` |
| Contract check | `bun run contracts:check` |
| Generate contracts | `bun run contracts:generate` |
| Backend coverage | `bun run coverage:backend` |
| Frontend smoke | `bun run smoke:frontend` |
| Go workspace tests | `bun run go:test` |
| Docker-backed integration | `bun run integration:local` |
| Local benchmark probe | `bun run bench:local` |
| Local read benchmark probe | `bun run bench:read` |
| Local ingest benchmark probe | `bun run bench:ingest` |
| Production-like benchmark probe | `bun run bench:production` |
| Production-like read benchmark probe | `bun run bench:production:read` |
| Production-like ingest benchmark probe | `bun run bench:production:ingest` |

`bun run verify:full` includes `smoke:frontend` and `git diff --check` after the default verification chain. Any GraphQL, AsyncAPI, UI contract, BFF bridge, or Go message contract change must keep `bun run contracts:check` passing.

## Manual Service Startup

| Step | Service | Command |
| --- | --- | --- |
| 1 | storage-write | `go run -tags surrealdb ./core/storage-write/cmd/storage-write` |
| 2 | storage-read | `go run -tags surrealdb ./core/storage-read/cmd/storage-read` |
| 3 | control-plane | `go run ./core/control-plane/cmd/control-plane` |
| 4 | BFF and frontend | `bun run dev` |
| 5 | OTLP collector | `go run ./core/otlp-collector/cmd/otlp-collector` |

Start NATS and SurrealDB before manual service startup:

```sh
bun run dev:infra
```

Benchmark commands skip unless `CLOUDGRID_ENABLE_BENCHMARKS=true`. Production-like benchmark commands also require `CLOUDGRID_BENCH_DEPLOYMENT_PROFILE=production-like` and explicit target URLs.

## AI Evaluation Runner Scaffold

```sh
cd core/ai-eval-runner
GOWORK=off go test ./...
```

Use this only for runner-only scaffolding when the root Go workspace does not include `core/ai-eval-runner`.
