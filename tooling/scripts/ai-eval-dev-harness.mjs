#!/usr/bin/env bun
import { createServer } from "node:http";
import { createHarnessAdapterServer } from "../../apps/packages/cloudgrid-harness-adapter/src/index.ts";

const defaultURL = "http://127.0.0.1:8090";
const listenURL = new URL(process.env.CLOUDGRID_AI_EVAL_HARNESS_URL || defaultURL);
const host = listenURL.hostname || "127.0.0.1";
const port = Number(listenURL.port || "8090");
const adapter = createHarnessAdapterServer({
  captureRequests: true,
  fixtureMode: fixtureMode(process.env.AI_EVAL_HARNESS_FIXTURE_MODE),
});

const server = createServer(async (request, response) => {
  const path = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
    .pathname;
  if (request.method === "GET" && (path === "/readyz" || path === "/livez")) {
    sendJson(response, 200, {
      status: "ok",
      capturedRequestCount: adapter.capturedRequests().length,
    });
    return;
  }
  if (request.method === "GET" && path === "/debug/captured-requests") {
    sendJson(response, 200, { requests: adapter.capturedRequests() });
    return;
  }

  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await readBody(request);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    }
  }
  const adapterResponse = await adapter.fetch(
    new Request(`http://adapter.local${path}`, {
      method: request.method,
      headers,
      body,
    }),
  );

  response.writeHead(adapterResponse.status, Object.fromEntries(adapterResponse.headers.entries()));
  response.end(Buffer.from(await adapterResponse.arrayBuffer()));
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "ai-eval-dev-harness",
      event: "startup_ready",
      request_id: "",
      message: "AI eval development harness ready",
      addr: `${host}:${port}`,
    }),
  );
});

process.once("SIGTERM", () => {
  server.close(() => process.exit(0));
});

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return chunks.length === 0 ? undefined : Buffer.concat(chunks);
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function fixtureMode(value) {
  if (
    value === "validation_failure" ||
    value === "timeout" ||
    value === "quick_shot" ||
    value === "success"
  ) {
    return value;
  }
  return "success";
}
