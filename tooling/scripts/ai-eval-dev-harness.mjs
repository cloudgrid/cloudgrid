#!/usr/bin/env bun
import { createServer } from "node:http";

const defaultURL = "http://127.0.0.1:8090";
const listenURL = new URL(process.env.CLOUDGRID_AI_EVAL_HARNESS_URL || defaultURL);
const host = listenURL.hostname || "127.0.0.1";
const port = Number(listenURL.port || "8090");

const server = createServer(async (request, response) => {
  const path = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`)
    .pathname;
  if (request.method === "GET" && (path === "/readyz" || path === "/livez")) {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  const payload = await readJson(request);
  if (path === "/v1/run") {
    sendJson(response, 200, {
      harnessRunId: `local-${payload.experimentRunId || "run"}-${payload.datasetItemId || "item"}`,
      output: {
        answer: expectedAnswer(payload.input),
        source: "cloudgrid-local-eval-harness",
      },
      latencyMs: 12,
    });
    return;
  }
  if (path === "/v1/score") {
    sendJson(response, 200, {
      score: 1,
      passed: true,
      evidence: { reason: "local deterministic harness accepted the output" },
      judgeRunRef: "local-deterministic-judge",
    });
    return;
  }
  if (path === "/v1/optimize") {
    sendJson(response, 200, {
      candidatePromptIds: [],
      summary: { optimized: false, reason: "local deterministic harness" },
    });
    return;
  }
  sendJson(response, 404, { error: "not_found" });
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

function expectedAnswer(input) {
  if (input && typeof input === "object" && "question" in input) {
    return "ok";
  }
  return "ok";
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
