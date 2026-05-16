---
id: REV-003
title: Consistency pass
layer: review
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-draft
---

# Consistency Pass

## Reference Integrity

- Pass: Capability dependencies reference existing capability IDs.
- Pass: HTTP capabilities reference OpenAPI operation IDs.
- Pass: GraphQL capabilities reference GraphQL operation IDs.
- Pass: Message bridge capabilities reference NATS subject IDs.
- Pass: Entity references have JSON Schema files.
- Pass: ADR `affects` targets exist.
- Pass: NFR `applies_to` patterns match existing capabilities.

## Contract Coverage

- Pass: `POST /v1/traces` and `telemetry.ingest.traces` cover CAP-ING-001.
- Pass: `POST /v1/logs` and `telemetry.ingest.logs` cover CAP-ING-002.
- Pass: `GET /api/health` covers CAP-RUN-003.
- Pass: GraphQL `Query.traces` plus `telemetry.traces.search` covers CAP-OBS-001 and CAP-FE-001.
- Pass: GraphQL `Query.trace` plus `telemetry.traces.get` covers CAP-OBS-002, CAP-FE-002, and CAP-FE-005.
- Pass: GraphQL `Query.logs` plus `telemetry.logs.search` covers CAP-OBS-003 and CAP-FE-003.

## Failure Coverage

- Pass: Invalid validation, unsupported media, invalid cursor, not found, storage outage, partial write, decode failure, config failure, composition failure, missing asset, request timeout, message bridge outage, and message bridge timeout are specified.
- Pass: Durable write flows define ack timing, retries, terminal manual queue behavior, idempotency, concurrency, and observability.
- Pass: Read request/reply flow defines timeout, error mapping, and terminal behavior.

## Provenance

- Pass: Draft specs may contain `inferred-draft`.
- Pass: Former open decisions are resolved in REV-002.

## Autonomous Implementation Readiness

- Ready: Monorepo and service structure is defined.
- Ready: Package and service dependency direction is defined.
- Ready: Entity schemas are defined.
- Ready: HTTP, GraphQL, and AsyncAPI contracts are defined.
- Ready: NATS bridge ports, message contracts, and SurrealDB read/write service behavior are defined.
- Ready: Runtime configuration and service composition behavior are defined.
- Ready: Frontend routes, views, and states are defined.
- Ready: Test categories and acceptance criteria are defined.
- Ready: Parallel implementation boundaries are defined in TEC-BE-001.

## Known Non-Blocking Gaps

- No implementation plan tickets were generated in this pass.
