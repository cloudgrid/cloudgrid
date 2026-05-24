---
id: CAP-AIE-008
title: Track production agent quality
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
depends_on: [DOM-006, CAP-AIE-002]
implements:
  api: []
---

# Track Production Agent Quality

Production quality is backlog for AI Eval v2.

The future implementation must reuse v2 metric results, target refs, retention,
trace evidence, and dataset candidate flows. It must define how production
datapoints get expected-output or success/failure evidence before any quality
metric is treated as meaningful.

Do not implement production quality UI, subjects, or policies from the legacy
scorer/experiment model.
