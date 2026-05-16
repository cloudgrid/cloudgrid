---
id: NFR-004
title: Local MVP private boundary
category: security
status: draft
provenance: inferred-draft
target: 0 SurrealDB clients or credentials are imported or referenced by apps/backend, apps/frontend, or core/otlp-collector; 0 secrets appear in API responses, frontend bundles, or default logs
measurement: Automated dependency/static checks plus tests that search configured SurrealDB password in responses, built assets, and logs
applies_to: [CAP-RUN-001, CAP-RUN-003]
enforcement: blocking
---

# Local MVP Security Posture

The MVP has no authentication enforcement, so it must be treated as a trusted local/internal tool. Storage access still remains private to Go storage services and secrets must not leak.
