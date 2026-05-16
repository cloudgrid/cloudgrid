---
id: NFR-003
title: Structured runtime logs
category: observability
status: draft
provenance: inferred-draft
target: 100 percent of HTTP requests, GraphQL operations, NATS request/reply calls, and JetStream command handlers emit one completion log with request_id, service, operation_or_subject, status, duration_ms, and error_code when applicable
measurement: Integration tests capture stdout/stderr JSON logs from all services and assert required fields
applies_to: [CAP-RUN-003, CAP-ING-*, CAP-OBS-*]
enforcement: blocking
---

# Structured Runtime Logs

Runtime logs are the MVP's primary self-observability mechanism.
