---
id: ADR-0001
title: Use TypeScript BFF, React UI, Go private services, NATS, and SurrealDB
status: accepted
superseded_by: null
date: 2026-05-08
provenance: from-user
context: The implementation needs a public TypeScript frontend/backend boundary, private Go services for OTLP and storage adapters, a message bridge between public/ingress services and storage services, and SurrealDB as the single MVP database.
alternatives_considered:
  - name: TypeScript BFF React Go private services NATS SurrealDB
    summary: Public UI and GraphQL BFF in TypeScript; private OTLP, read, and write services in Go; NATS bridge; SurrealDB database.
    pros: [Public auth/API concerns stay in one BFF, storage adapters stay private, Go services fit collector and database adapter needs]
    cons: [More moving parts than a single TypeScript app, message contracts must be maintained carefully]
  - name: TypeScript full-stack single process
    summary: One TypeScript backend hosts OTLP, reads, writes, and frontend.
    pros: [Fewer services, simpler local startup]
    cons: [Leaks storage adapter concerns into public backend, does not support multi-language adapters cleanly]
  - name: Go monolith plus React
    summary: One Go backend hosts public API, OTLP, reads, writes, and frontend assets.
    pros: [Strong runtime performance, fewer language boundaries]
    cons: [Less ergonomic frontend BFF development, auth/API concerns tied to storage adapter service]
decision: TypeScript BFF React Go private services NATS SurrealDB
decision_rationale: This option preserves a single public TypeScript boundary for frontend, GraphQL, and auth while keeping storage access private and allowing adapters to be implemented in Go. The extra message-contract work is accepted because isolation and parallel implementation are core requirements.
consequences:
  positive: [Public auth/API changes happen in one BFF, read and write storage services can scale independently, multiple agents can implement services in parallel]
  negative: [Local development requires NATS, contract drift must be guarded by AsyncAPI and GraphQL tests]
affects: [STK-001, CNV-001, CAP-ING-001, CAP-ING-002, CAP-STO-001, CAP-STO-002, CAP-FE-001]
---

# ADR-0001: Use TypeScript BFF, React UI, Go Private Services, NATS, And SurrealDB

## Decision

Use TypeScript for the public BFF and frontend, Go for OTLP collector and storage read/write services, NATS JetStream as the message bridge, and SurrealDB as the single MVP database.
