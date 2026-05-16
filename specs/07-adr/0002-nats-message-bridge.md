---
id: ADR-0002
title: Use NATS message bridge for all reads and writes
status: accepted
superseded_by: null
date: 2026-05-08
provenance: from-user
context: Public and ingress-facing services must not access storage adapters or SurrealDB directly. The system needs one private bridge for read request/reply and durable write commands.
alternatives_considered:
  - name: NATS bridge for reads and writes
    summary: GraphQL reads use NATS request/reply; OTLP writes use JetStream commands.
    pros: [Strong isolation, private storage services, supports Go adapters, clear scaling split]
    cons: [Requires NATS locally, request/reply timeout handling must be specified]
  - name: Direct BFF to read adapter and collector to write adapter
    summary: Public and ingress services call storage adapters directly.
    pros: [Lower latency, fewer infrastructure components]
    cons: [Public backend must know storage adapters, every adapter would need public-facing surface or client code]
  - name: HTTP between BFF and storage services
    summary: Private storage services expose internal HTTP APIs.
    pros: [Easy debugging, common tooling]
    cons: [Creates per-adapter HTTP surfaces, duplicates auth/network policy concerns]
decision: NATS bridge for reads and writes
decision_rationale: NATS keeps storage services private while allowing TypeScript and Go services to communicate through typed contracts. Request/reply is used only for read queries; JetStream is used for durable writes.
consequences:
  positive: [No direct storage access from public or ingress services, write service can scale independently, BFF owns future auth once]
  negative: [Message schema validation and timeout/error mapping are mandatory]
affects: [CAP-ING-001, CAP-ING-002, CAP-STO-001, CAP-STO-002, CAP-OBS-001, CAP-OBS-002, CAP-OBS-003]
---

# ADR-0002: Use NATS Message Bridge For All Reads And Writes
