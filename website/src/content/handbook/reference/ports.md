---
title: "Ports"
order: 3
accent: rose
eyebrow: "Handbook - Reference"
updated: 2026-05-18
---

| Component | Port | Env var |
| --- | --- | --- |
| BFF | `3000` | `CLOUDGRID_BFF_PORT` |
| Frontend dev server | `5173` | `CLOUDGRID_FRONTEND_DEV_PORT` |
| OTLP HTTP collector | `4318` | `CLOUDGRID_OTLP_HTTP_ADDR`, `CLOUDGRID_OTLP_PORT` |
| OTLP gRPC collector | `4317` | `CLOUDGRID_OTLP_GRPC_ADDR` |
| NATS client | `4222` | `CLOUDGRID_NATS_PORT` in Docker Compose env |
| NATS monitor | `8222` | `CLOUDGRID_NATS_MONITOR_PORT` in Docker Compose env |
| SurrealDB RPC | `8000` | `CLOUDGRID_SURREALDB_PORT` in Docker Compose env |
| storage-read health | `8081` | `CLOUDGRID_STORAGE_READ_HEALTH_PORT` |
| storage-write health | `8082` | `CLOUDGRID_STORAGE_WRITE_HEALTH_PORT` |
| control-plane health | `8084` | `CLOUDGRID_CONTROL_PLANE_HEALTH_PORT` |
| AI eval runner health | `8085` | `CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT` |

## Health Paths

| Component | Paths |
| --- | --- |
| BFF | `/livez`, `/readyz`, `/api/health` |
| OTLP collector | `/livez`, `/readyz` on HTTP port |
| storage-read | `/livez`, `/readyz` |
| storage-write | `/livez`, `/readyz` |
| control-plane | `/livez`, `/readyz` |
| AI eval runner | `/livez`, `/readyz` |
