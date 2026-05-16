---
id: VIS-001
title: AI-native OTLP observability platform
layer: foundation
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: from-user
---

# Vision

## What This Is

The system is a focused observability application for OpenTelemetry data produced by services and AI-agent workloads. It ingests OTLP traces and logs through a private message-bridge architecture, normalizes them into canonical internal entities, persists them in SurrealDB through private Go storage services, and exposes a browser UI through a TypeScript backend-for-frontend for tracing service and agent behavior through correlated spans and logs. Metrics are a planned future OpenTelemetry signal.

## Who It Is For

The MVP targets engineers building or debugging AI agents and TypeScript services that already emit OpenTelemetry. These users need a local or small-team tool that shows traces, spans, and logs together without requiring a full production observability stack.

## MVP Scope

- Ingest OTLP over HTTP for traces and logs through a Go OTLP collector service.
- Route every read and write through the NATS message bridge; no public or ingress-facing service accesses SurrealDB directly.
- Normalize OpenTelemetry resources, scopes, spans, span events, and log records into canonical entities.
- Persist telemetry in SurrealDB through a private Go write service.
- Fetch telemetry from SurrealDB through a private Go read service.
- Provide a public TypeScript backend-for-frontend with GraphQL reads and health endpoints.
- Serve a React/Vite/shadcn UI from the TypeScript backend-for-frontend in production mode.
- Preserve OpenTelemetry attributes, including GenAI-related attributes, without over-modeling AI entities in the MVP.

## Non-Goals

- No metrics, profiles, or gRPC OTLP ingest in MVP. Metrics are planned after trace/log exploration and require a dedicated metrics contract, storage, query, and UI wave.
- No ClickHouse, Postgres, S3, OpenSearch, or multi-storage implementation in MVP.
- No Kafka, Redpanda, or distributed stream processing in MVP.
- No Jaeger or Tempo export implementation in MVP.
- No authentication enforcement, multi-tenancy, admin console, or production SaaS billing in MVP. Auth integration points live only in the TypeScript backend-for-frontend. Future multi-tenant work must preserve tenant/project isolation at API, message, and persistence boundaries.
- No AI evaluation, cost optimization, or self-healing automation in MVP.
- No generic APM clone behavior beyond trace/log exploration.

## Success Signals

- A local OTLP HTTP sender can post traces to `POST /v1/traces` on the Go collector and the UI shows those traces within 3 seconds.
- A local OTLP HTTP sender can post logs to `POST /v1/logs` on the Go collector and the UI shows logs correlated by trace ID and span ID.
- The TypeScript BFF never imports Go storage adapters or SurrealDB clients.
- Implementation agents can create collector, bridge, storage read/write, GraphQL, and UI code without inventing fields, subjects, routes, or service boundaries.
