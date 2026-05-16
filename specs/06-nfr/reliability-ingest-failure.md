---
id: NFR-002
title: Ingest failure behavior
category: reliability
status: draft
provenance: inferred-draft
target: 100 percent of failed ingest requests return a canonical error before publish, and 100 percent of failed storage-write commands are either retried by JetStream or logged with terminal manual-queue state after 5 attempts
measurement: Integration tests that force validation, decode, NATS unavailable, storage unavailable, timeout, redelivery, and partial-write branches
applies_to: [CAP-ING-001, CAP-ING-002, CAP-STO-001]
enforcement: blocking
---

# Ingest Failure Behavior

Ingest and write-command errors must be explicit and observable so senders can retry correctly and operators can diagnose bridge or storage failures.
