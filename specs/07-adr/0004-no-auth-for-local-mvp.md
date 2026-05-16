---
id: ADR-0004
title: No authentication for local MVP
status: accepted
superseded_by: null
date: 2026-05-08
provenance: inferred-draft
context: The original draft did not specify users, accounts, or roles. To prevent implementation agents from inventing auth, the MVP is treated as a local/internal trusted tool.
alternatives_considered:
  - name: No authentication
    summary: Bind and serve APIs without identity checks.
    pros: [Fastest local setup, avoids under-specified user model]
    cons: [Not safe for exposed production deployment, no user-level audit]
  - name: Static API token
    summary: Require one configured bearer token for all API and ingest calls.
    pros: [Simple protection for shared environments, small implementation]
    cons: [Still not real user identity, adds setup friction]
  - name: Full user authentication
    summary: Add login, sessions, and roles.
    pros: [Production-ready access foundation]
    cons: [Requires product decisions absent from the draft]
decision: No authentication
decision_rationale: No user or tenancy requirements were provided. The MVP implements no auth enforcement, but the only future auth integration point is the TypeScript BFF. Go collector and storage services remain private and do not implement public auth.
consequences:
  positive: [No invented access model, simpler OTLP sender setup]
  negative: [The app must not be exposed to untrusted networks]
affects: [STK-001, CAP-ING-001, CAP-ING-002, CAP-RUN-003]
---

# ADR-0004: No Authentication For Local MVP
