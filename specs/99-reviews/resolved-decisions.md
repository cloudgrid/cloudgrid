---
id: REV-002
title: Resolved decisions
layer: review
status: draft
owner: unknown@example.com
updated: 2026-05-08
provenance: inferred-ratified
---

# Resolved Decisions

No implementation-blocking product or architecture questions remain open for the MVP spec.

## RD-001: Authentication

Decision: no authentication enforcement in MVP. Future auth belongs only in the TypeScript BFF.

Implementation consequence: Go collector, storage-read, and storage-write services stay private and do not implement public auth.

## RD-002: OTLP Encoding

Decision: Go OTLP collector supports both OTLP HTTP JSON and `application/x-protobuf`.

Implementation consequence: unsupported content types return ERR-002; decode failures return ERR-008.

## RD-003: Expected Volume

Decision: MVP target is local and small-team operation with 10 OTLP requests per second and 20 GraphQL read requests per second in smoke benchmarks.

Implementation consequence: NATS and storage services must support this target; production ingestion clusters are out of scope.

## RD-004: Data Retention

Decision: telemetry is retained indefinitely until the operator deletes the SurrealDB database.

Implementation consequence: no TTL cleanup job, deletion API, or retention worker is implemented in MVP.

## RD-005: Deployment Target

Decision: local Docker-compatible multi-service stack: TypeScript BFF, frontend assets, NATS with JetStream, Go OTLP collector, Go storage-read, Go storage-write, and SurrealDB.

Implementation consequence: Docker Compose is the required local orchestration target; Kubernetes and cloud IaC are out of scope.

## RD-006: Public Read API

Decision: public telemetry reads use GraphQL on the TypeScript BFF.

Implementation consequence: REST telemetry read endpoints must not be implemented.

## RD-007: Storage Access

Decision: all reads and writes cross the NATS message bridge. Storage-read is the only reader of telemetry data; storage-write is the only writer.

Implementation consequence: public and ingress services must not import SurrealDB clients or storage adapters.
