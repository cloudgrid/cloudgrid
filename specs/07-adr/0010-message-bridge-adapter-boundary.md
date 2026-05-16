---
id: ADR-0010
title: Message bridge adapter boundary
status: accepted
superseded_by: null
date: 2026-05-12
provenance: from-user
context: CloudGrid uses NATS request/reply and JetStream for the v1 private message bridge. The product should be able to migrate to another bridge implementation without rewriting domain, GraphQL, collector, storage, control-plane, or AI-eval business logic.
decision: Treat NATS as a replaceable message bridge adapter. All producers and consumers depend on local bridge interfaces and typed contracts, while NATS-specific clients, messages, JetStream handles, subscriptions, ack semantics, and connection setup stay inside adapter packages.
decision_rationale: This preserves the modular architecture and lets CloudGrid replace or supplement NATS with another transport by writing new adapters that satisfy the same port contracts.
consequences:
  positive: [Transport migration is bounded, tests can mock bridge ports, business code remains contract-driven]
  negative: [Adapter interfaces must model request/reply, durable streams, ack behavior, and ephemeral pub/sub explicitly]
affects: [TEC-BE-002, TEC-BE-001, STK-001]
---

# ADR-0010: Message Bridge Adapter Boundary

NATS is the v1 implementation of the private message bridge, not a business-layer dependency. Service handlers, GraphQL resolvers, OTLP normalization, storage logic, and AI-eval orchestration must not import or expose NATS-native types.
