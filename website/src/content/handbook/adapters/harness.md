---
title: Harness adapter
description: HTTP contract for the AI evaluation execution surface.
order: 4
accent: rose
eyebrow: Handbook - Architecture - Extension boundaries
updated: 2026-05-24
---

Unlike the other three ports, the evaluation adapter is an **HTTP contract**,
not an in-process port. Simple targets can run inside the CloudGrid AI harness;
complex agents and workflows can expose a black-box adapter URL.

## Core Endpoint

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/run` | Execute one dataset input against the target and return, or later expose through polling, the final output and bounded run summary. |

## Required behaviors

- **W3C trace context** (`traceparent` / `tracestate`) is preserved on
  every call.
- **Idempotency** is required for retries — repeated calls with the same
  idempotency key return the same result.
- **No full traces in response bodies.** The target should emit spans through
  OTLP. Adapter responses carry the final output and bounded summaries.
- **Expected output is omitted by default.** The evaluated system should not see
  labels unless the evaluation settings explicitly allow it.
- **Provider credentials stay outside CloudGrid.** Adapter deployments own their
  provider keys and private tool configuration.
- **No storage shortcuts.** Results return through the adapter protocol and
  CloudGrid message contracts; telemetry still returns through normal OTLP
  ingest, storage-write persistence, and storage-read GraphQL views.

## Example: a minimal harness skeleton

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.post("/v1/run", async (c) => {
  const body = await c.req.json();
  // 1) replay the agent against the input
  // 2) emit OTLP spans (with traceparent from request)
  // 3) return a run summary
  return c.json({
    runId: body.idempotencyKey,
    status: "ok",
    tokens: { in: 1240, out: 312 },
    durationMs: 412,
  });
});

serve({ fetch: app.fetch, port: 8088 });
```

## Idempotency keys

| Operation | Key |
| --- | --- |
| Dataset item run | `(evaluationRunId, datasetItemRevisionId, targetSnapshotId)` |
| Optimization candidate | `(optimizationRunId, candidateTargetSnapshotId, datasetItemRevisionId)` |
