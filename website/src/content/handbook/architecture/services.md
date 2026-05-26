---
title: Services
description: Each CloudGrid service, what it owns, and what it must never do.
order: 1
accent: brand
eyebrow: Handbook · Architecture · Services
updated: 2026-05-17
---

CloudGrid is built from a handful of single-purpose services. Each one owns
exactly one responsibility — and explicitly does not do anything else.

## otlp-collector (Go, public)

Accepts OTLP HTTP on `/v1/traces`, `/v1/logs`, `/v1/metrics`, and OTLP/gRPC
on the standard collector port. Normalizes payloads into canonical entities
and publishes `PersistTelemetryCommand` / `PersistMetricsCommand` messages
to the bridge. Does not own storage adapters; does not parse storage formats.

## storage-write (Go, private)

JetStream consumer that writes canonical telemetry to the database. The
only service that mutates SurrealDB. After committing a trace, publishes a
`TracePersistedNotification` on `telemetry.persisted.traces` — without span
bodies — so `storage-read` can fan live trace events out to BFF-owned
ephemeral subjects.

## storage-read (Go, private)

Request/reply service that owns query semantics, filter pushdown,
view-model derivation, and live trace fanout. Database-specific code lives
in `internal/adapters/<database>/`.

## control-plane (Go, private)

Companies, users, projects, project memberships, ingest credentials,
dashboards, retention policies, alerting foundation. Authoritative for
everything that is not raw telemetry.

## BFF + UI (TypeScript + React, public)

GraphQL server, health, static frontend. Owns transport, public error
mapping, and auth middleware. Never imports SurrealDB clients, Go storage
adapters, or OTLP parsers. Subscription resolvers use storage-read's
live-session request/reply plus the storage-read-owned ephemeral live event
subjects.

## What the BFF does *not* do

- It does not import SurrealDB clients or Go storage adapters.
- It does not create JetStream consumers for ingest streams.
- It does not aggregate, correlate, score, normalize, or derive telemetry.
  Query semantics live in `storage-read`.

## AI evaluation, briefly

The `core/ai-eval-runner` service is optional. When enabled, it handles
evaluation start, run-control, and optimization subjects, reads datasets,
evaluation definitions, target snapshots, and run evidence only through
`storage-read`, writes AI Eval records only through `storage-write`, and calls
the configured harness or external adapter over HTTP. It never reads or writes
the database directly and never calls model providers directly.

See the [AI Evaluation feature page](/features/ai-evaluation) for the
user-visible surface.
