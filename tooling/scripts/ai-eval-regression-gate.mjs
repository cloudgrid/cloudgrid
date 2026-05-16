#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const usage = `CloudGrid AI-eval regression gate

Usage:
  bun tooling/scripts/ai-eval-regression-gate.mjs --endpoint <url> --experiment-id <id> [thresholds]

Options:
  --endpoint <url>             GraphQL HTTP endpoint.
  --subscription-endpoint <url> GraphQL WebSocket endpoint. Defaults from --endpoint; use "poll" for HTTP query fallback.
  --experiment-id <id>         Experiment ID to start.
  --solver-ref-json <json>     Optional solverRef JSON passed to startExperimentRun.
  --min-pass-rate <number>     Fail when ExperimentRun.summary.passRate is lower.
  --min-mean-score <number>    Fail when ExperimentRun.summary.meanScore is lower.
  --max-p95-latency-ms <num>   Fail when ExperimentRun.summary.p95LatencyMs is higher.
  --timeout-ms <number>        Subscription timeout. Default: 300000.
  --report-junit <path>        Write JUnit XML report.
  --help                       Show this help.
`;

const startExperimentRunMutation = `
  mutation StartExperimentRun($input: StartExperimentRunInput!) {
    startExperimentRun(input: $input) {
      id
      experimentId
      status
      summary
    }
  }
`;

const liveExperimentRunSubscription = `
  subscription LiveExperimentRun($input: LiveExperimentRunInput!) {
    liveExperimentRun(input: $input) {
      type
      seq
      receivedAt
      run {
        id
        experimentId
        status
        summary
      }
    }
  }
`;

const experimentRunQuery = `
  query ExperimentRun($id: ID!) {
    experimentRun(id: $id) {
      id
      experimentId
      status
      summary
    }
  }
`;

export function parseArgs(args) {
  const options = {
    endpoint: process.env.CLOUDGRID_GRAPHQL_ENDPOINT || "http://127.0.0.1:3000/graphql",
    subscriptionEndpoint: null,
    experimentId: "",
    solverRef: undefined,
    minPassRate: undefined,
    minMeanScore: undefined,
    maxP95LatencyMs: undefined,
    timeoutMs: 300_000,
    reportJUnit: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    }

    const value = args[index + 1];
    switch (arg) {
      case "--endpoint":
        options.endpoint = requireValue(arg, value);
        index += 1;
        break;
      case "--subscription-endpoint":
        options.subscriptionEndpoint = requireValue(arg, value);
        index += 1;
        break;
      case "--experiment-id":
        options.experimentId = requireValue(arg, value);
        index += 1;
        break;
      case "--solver-ref-json":
        options.solverRef = JSON.parse(requireValue(arg, value));
        index += 1;
        break;
      case "--min-pass-rate":
        options.minPassRate = numberValue(arg, value);
        index += 1;
        break;
      case "--min-mean-score":
        options.minMeanScore = numberValue(arg, value);
        index += 1;
        break;
      case "--max-p95-latency-ms":
        options.maxP95LatencyMs = numberValue(arg, value);
        index += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = numberValue(arg, value);
        index += 1;
        break;
      case "--report-junit":
        options.reportJUnit = requireValue(arg, value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.experimentId && !options.help) {
    throw new Error("--experiment-id is required");
  }
  return options;
}

export function evaluateRegressionThresholds(run, thresholds) {
  const summary = summaryObject(run?.summary);
  const failures = [];
  addMinimumFailure(failures, summary, "passRate", thresholds.minPassRate);
  addMinimumFailure(failures, summary, "meanScore", thresholds.minMeanScore);
  addMaximumFailure(failures, summary, "p95LatencyMs", thresholds.maxP95LatencyMs);
  return failures;
}

export function buildJUnitReport({ experimentId, runId, status, failures, durationSeconds }) {
  const failureXml = failures
    .map(
      (failure) =>
        `<failure message="${escapeXml(failure)}" type="CloudGridAIEvalRegression">${escapeXml(
          failure,
        )}</failure>`,
    )
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="cloudgrid.ai-eval.regression" tests="1" failures="${failures.length}" time="${durationSeconds.toFixed(
      3,
    )}">`,
    `<testcase name="experiment ${escapeXml(experimentId)}" classname="CloudGridAIEval" time="${durationSeconds.toFixed(
      3,
    )}">`,
    failureXml,
    `<system-out>${escapeXml(`run=${runId || "unknown"} status=${status || "unknown"}`)}</system-out>`,
    "</testcase>",
    "</testsuite>",
    "",
  ].join("\n");
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log(usage);
    return 0;
  }

  const startedAt = performance.now();
  let run = await startExperimentRun(options);
  run = await waitForExperimentRun(run.id, options);
  const failures = evaluateRegressionThresholds(run, options);
  const durationSeconds = (performance.now() - startedAt) / 1000;

  if (options.reportJUnit) {
    const path = resolve(options.reportJUnit);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      buildJUnitReport({
        experimentId: options.experimentId,
        runId: run.id,
        status: run.status,
        failures,
        durationSeconds,
      }),
    );
  }

  for (const failure of failures) {
    console.error(failure);
  }

  return failures.length > 0 || run.status === "failed" || run.status === "cancelled" ? 1 : 0;
}

async function startExperimentRun(options) {
  const input = { experimentId: options.experimentId };
  if (options.solverRef !== undefined) {
    input.solverRef = options.solverRef;
  }
  const response = await requestGraphQL(
    options.endpoint,
    "StartExperimentRun",
    startExperimentRunMutation,
    {
      input,
    },
  );
  return response.startExperimentRun;
}

async function waitForExperimentRun(runId, options) {
  if (options.subscriptionEndpoint === "poll" || !globalThis.WebSocket) {
    return pollExperimentRun(runId, options);
  }

  const endpoint = options.subscriptionEndpoint ?? graphqlWebSocketEndpoint(options.endpoint);
  return new Promise((resolveRun, reject) => {
    const WebSocketCtor = globalThis.WebSocket;
    let latestRun = null;
    const operationId = `LiveExperimentRun:${crypto.randomUUID()}`;
    const socket = new WebSocketCtor(endpoint, "graphql-transport-ws");
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out waiting for experiment run ${runId}`));
    }, options.timeoutMs);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "connection_init" }));
    });
    socket.addEventListener("message", (message) => {
      const payload = parseSocketMessage(message.data);
      if (!payload) {
        return;
      }
      if (payload.type === "connection_ack") {
        socket.send(
          JSON.stringify({
            id: operationId,
            type: "subscribe",
            payload: {
              operationName: "LiveExperimentRun",
              query: liveExperimentRunSubscription,
              variables: { input: { experimentRunId: runId } },
            },
          }),
        );
        return;
      }
      if (payload.type === "next" && payload.id === operationId) {
        const event = payload.payload?.data?.liveExperimentRun;
        if (event?.run) {
          latestRun = event.run;
        }
        if (event?.type === "finished" || event?.type === "failed" || event?.type === "cancelled") {
          clearTimeout(timeout);
          socket.send(JSON.stringify({ id: operationId, type: "complete" }));
          socket.close();
          resolveRun(latestRun ?? { id: runId, status: event.type, summary: {} });
        }
      }
      if (payload.type === "error") {
        clearTimeout(timeout);
        socket.close();
        reject(new Error("GraphQL liveExperimentRun subscription failed"));
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("GraphQL subscription socket failed"));
    });
  });
}

async function pollExperimentRun(runId, options) {
  const deadline = performance.now() + options.timeoutMs;
  let latestRun = null;
  while (performance.now() <= deadline) {
    const response = await requestGraphQL(options.endpoint, "ExperimentRun", experimentRunQuery, {
      id: runId,
    });
    latestRun = response.experimentRun;
    if (latestRun && isTerminalExperimentRunStatus(latestRun.status)) {
      return latestRun;
    }
    await sleep(Math.min(1000, Math.max(0, deadline - performance.now())));
  }
  throw new Error(`Timed out waiting for experiment run ${runId}`);
}

async function requestGraphQL(endpoint, operationName, query, variables) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationName, query, variables }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL request failed with HTTP ${response.status}`);
  }
  const envelope = await response.json();
  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    throw new Error(envelope.errors.map((error) => error.message).join("; "));
  }
  if (!envelope.data) {
    throw new Error("GraphQL response did not include data");
  }
  return envelope.data;
}

function graphqlWebSocketEndpoint(endpoint) {
  const url = new URL(endpoint);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseSocketMessage(data) {
  try {
    return typeof data === "string" ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function addMinimumFailure(failures, summary, key, threshold) {
  if (threshold === undefined) {
    return;
  }
  const value = summary[key];
  if (typeof value !== "number" || value < threshold) {
    failures.push(`${key} ${String(value)} is below required ${threshold}`);
  }
}

function addMaximumFailure(failures, summary, key, threshold) {
  if (threshold === undefined) {
    return;
  }
  const value = summary[key];
  if (typeof value !== "number" || value > threshold) {
    failures.push(`${key} ${String(value)} exceeds allowed ${threshold}`);
  }
}

function summaryObject(summary) {
  return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {};
}

function isTerminalExperimentRunStatus(status) {
  return status === "finished" || status === "failed" || status === "cancelled";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function numberValue(flag, value) {
  const parsed = Number(requireValue(flag, value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a finite number`);
  }
  return parsed;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    });
}
