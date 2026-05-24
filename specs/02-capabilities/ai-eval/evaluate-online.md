---
id: CAP-AIE-002
title: Evaluate online telemetry
domain: ai-eval
layer: capability
status: backlog
owner: sebastian.wessel@egg-ai.com
updated: 2026-05-24
provenance: from-user
traits:
  interaction: message
  sync_async: async
  visibility: user
  authentication: prepared
depends_on: [DOM-006]
implements:
  api: []
---

# Evaluate Online Telemetry

## Status

Backlog for AI Eval v2.

Production measurement is intentionally not implementation-ready in v2. The
dataset/evaluation/optimization model must be implemented first. Production
quality later reuses metric, result, comparison, target, retention, and trace
evidence machinery, but production datapoints do not naturally contain expected
output.

## Future Direction

A future production measurement spec must define:

- how a production datapoint gets success/failure or expected-output evidence;
- which production indicators are deterministic versus human/program supplied;
- which metrics can run without expected output;
- how alerts consume metric values without making evaluation itself a gate;
- sampling, budgets, privacy, and retention for production-derived results;
- dataset candidate preparation from production failures.

Do not implement production measurement subjects or UI from the old scorer
model for v2.
