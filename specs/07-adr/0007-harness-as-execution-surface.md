---
id: ADR-0007
title: Harness as AI execution surface
status: accepted
superseded_by: null
date: 2026-05-12
provenance: from-user
context: AI evaluation needs to replay agents, call judge models, and run optimization loops.
decision: CloudGrid delegates all AI execution to a configured puristajs/harness instance through the cloudgrid-harness-adapter HTTP contract.
decision_rationale: Harness already owns agents, provider adapters, model credentials, workflows, and OTel emission. CloudGrid should observe, persist, query, and present results without becoming a model execution runtime.
consequences:
  positive: [Provider credentials stay out of CloudGrid, OTel spans remain the integration path, runner remains orchestration-only]
  negative: [AI-eval features require a reachable harness adapter]
affects: [CAP-AIE-003, CAP-AIE-004, TEC-BE-014]
---

# ADR-0007: Harness As AI Execution Surface

CloudGrid calls harness adapter endpoints for run, score, and optimize
operations. The adapter responses never carry spans; harness emits telemetry to
the OTLP collector.

Harness and external business-context adapters should emit production-standard
telemetry first: W3C trace context, OTel GenAI, OTel MCP, OpenInference, and
normal HTTP/RPC/database/messaging/filesystem conventions. CloudGrid-specific
source-span attributes are optional extensions and must not be required for
correlation or evidence extraction when standard telemetry is sufficient.
