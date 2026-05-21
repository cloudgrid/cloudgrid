---
title: Public API clients
description: Extend CloudGrid clients without bypassing the BFF or public contracts.
order: 5
accent: rose
eyebrow: Handbook - Architecture - Extension boundaries
updated: 2026-05-21
---

Public API clients are convenience wrappers around CloudGrid's public GraphQL
contract. They must not become a second product API or a shortcut around the
TypeScript BFF.

## Boundary

A client may:

- call the public `/graphql` endpoint;
- use generated types from `apps/packages/ui-contracts`;
- expose ergonomic operation helpers for documented GraphQL queries, mutations,
  and subscriptions;
- map public GraphQL problem errors into client-language exceptions.

A client must not:

- connect to NATS, SurrealDB, storage-read, storage-write, or control-plane
  directly;
- add REST telemetry read endpoints;
- filter, aggregate, correlate, rank, or enrich telemetry beyond local
  presentation state;
- invent fields that are not in `specs/03-contracts/graphql/public-schema.graphql`.

## Extension path

1. Add or change the GraphQL SDL first when the public surface needs new
   behavior.
2. Regenerate or update UI contract types.
3. Implement the BFF resolver as a validation and bridge-forwarding layer.
4. Add the client helper after the public operation exists.
5. Verify with `bun run contracts:check` plus focused client tests.

Telemetry query semantics still belong to storage-read. A client helper can make
an operation easier to call, but it cannot define new filtering, sorting,
cursor, grouping, or aggregation behavior.
