---
title: Harness adapter
description: HTTP contract for the AI evaluation execution surface.
order: 4
accent: rose
eyebrow: Handbook · Adapters · Harness
updated: 2026-05-17
---

Unlike the other three ports, the harness adapter is an **HTTP contract** —
not an in-process port. The v1 implementation is `puristajs/harness`.

## The three endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/run` | Execute an agent run; return a summary (no spans in the response). |
| `POST /v1/score` | Execute deterministic and judge scorers; return scores. |
| `POST /v1/optimize` | Execute prompt optimization; return candidate prompt versions. |

## Required behaviors

- **W3C trace context** (`traceparent` / `tracestate`) is preserved on
  every call.
- **Idempotency** is required for retries — repeated calls with the same
  idempotency key return the same result.
- **No spans in response bodies.** Harness emits spans via OTLP back into
  CloudGrid; the response body carries only summaries.
- **CloudGrid never holds provider credentials.** Model-provider keys live
  in your harness configuration.

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

app.post("/v1/score", (c) => c.json({ /* ... */ }));
app.post("/v1/optimize", (c) => c.json({ /* ... */ }));

serve({ fetch: app.fetch, port: 8088 });
```

## Idempotency keys

| Operation | Key |
| --- | --- |
| Run | `(experimentRunId, datasetItemId)` |
| Score | `(targetKind, targetId, scorerId, scorerVersion)` |
| Optimize candidate | `(experimentRunId, promptVersionHash)` |
