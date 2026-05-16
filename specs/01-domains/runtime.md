---
id: DOM-004
title: Runtime
layer: domain
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Runtime

## Purpose

The runtime domain validates configuration, composes the TypeScript BFF, Go collector, Go read service, Go write service, and NATS connectivity, manages lifecycle, and serves frontend assets from the BFF.

## Main Entities

- ENT-008: RuntimeConfig

## Key Invariants

- TypeScript BFF runtime wiring contains no domain mapping or persistence logic.
- Go storage service runtime wiring contains SurrealDB adapter composition only inside private services.
- Configuration is validated before adapters are initialized.
- Graceful shutdown closes HTTP servers, NATS connections, and SurrealDB connections in the owning service.

## Boundaries

- Does not define canonical telemetry models.
- Does not implement storage read/write behavior.
- Does not contain React code.

## Capabilities

- CAP-RUN-001: Load runtime configuration.
- CAP-RUN-002: Compose runtime.
- CAP-RUN-003: Serve application.
