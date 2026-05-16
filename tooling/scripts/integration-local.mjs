#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { Socket, createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

const protobufLogFixture = Buffer.from(
  "CqMBCiAKHgoMc2VydmljZS5uYW1lEg4KDGNoZWNrb3V0LWFwaRJ/ChwaGgoJc2NvcGUua2V5Eg0KC3Njb3BlLXZhbHVlEl8JAMrEcf6clxcQCRoESU5GTyoPCg1vcmRlciBjcmVhdGVkMhYKB2xvZy5rZXkSCwoJbG9nLXZhbHVlShABAgMEBQYHCAkKCwwNDg8QUggREhMUFRYXGFkAq7p3/pyXFw==",
  "base64",
);

const usage = `CloudGrid local integration runner

Usage:
  bun run integration:local [--dry-run]

Requires local infrastructure started separately:
  docker compose --env-file .env up -d nats surrealdb

Options:
  --dry-run    Print planned services and selected ports without starting Docker-dependent checks.
  --help       Show this help.
`;

export function parseDotEnv(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

export function mergedEnv(dotEnv, processEnv = process.env) {
  return { ...dotEnv, ...processEnv };
}

export function buildTraceJsonFixture({ traceIdHex, rootSpanIdHex, serviceName }) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
            { key: "cloud.region", value: { stringValue: "local" } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "integration-runner",
              attributes: [{ key: "scope.key", value: { stringValue: "scope-value" } }],
            },
            spans: [
              {
                traceId: hexToBase64(traceIdHex),
                spanId: hexToBase64(rootSpanIdHex),
                name: "POST /orders",
                kind: "SPAN_KIND_SERVER",
                startTimeUnixNano: "1700000000000000000",
                endTimeUnixNano: "1700000000010000000",
                attributes: [{ key: "http.method", value: { stringValue: "POST" } }],
                status: { code: "STATUS_CODE_ERROR" },
                events: [
                  {
                    name: "agent.step",
                    timeUnixNano: "1700000000005000000",
                    attributes: [{ key: "gen_ai.operation.name", value: { stringValue: "chat" } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function buildMetricJsonFixture({
  metricName,
  serviceName,
  startedAtUnixNano,
  observedAtUnixNano,
}) {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
            { key: "deployment.environment", value: { stringValue: "integration" } },
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "integration-runner" },
            metrics: [
              {
                name: metricName,
                description: "Integration runner metric",
                unit: "{request}",
                gauge: {
                  dataPoints: [
                    {
                      attributes: [
                        { key: "service.name", value: { stringValue: serviceName } },
                        { key: "http.route", value: { stringValue: "/integration" } },
                      ],
                      startTimeUnixNano: startedAtUnixNano,
                      timeUnixNano: observedAtUnixNano,
                      asDouble: 42.5,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

export function duplicateCommands(commandId, requestIdPrefix) {
  const issuedAt = new Date().toISOString();
  const startedAt = "2023-11-14T22:13:25.000Z";
  const endedAt = "2023-11-14T22:13:25.025Z";
  const originalTraceId = `dup-original-${commandId}`;
  const rewriteTraceId = `dup-rewrite-${commandId}`;
  return {
    originalTraceId,
    rewriteTraceId,
    original: persistTraceCommand({
      commandId,
      requestId: `${requestIdPrefix}-1`,
      issuedAt,
      traceId: originalTraceId,
      spanId: "dup-root-span",
      serviceName: "duplicate-original",
      spanName: "duplicate original",
      startedAt,
      endedAt,
    }),
    rewrite: persistTraceCommand({
      commandId,
      requestId: `${requestIdPrefix}-2`,
      issuedAt,
      traceId: rewriteTraceId,
      spanId: "dup-rewrite-span",
      serviceName: "duplicate-rewrite",
      spanName: "duplicate rewrite",
      startedAt,
      endedAt,
    }),
  };
}

async function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const dotEnv = existsSync(join(repoRoot, ".env"))
    ? parseDotEnv(readFileSync(join(repoRoot, ".env"), "utf8"))
    : {};
  const baseEnv = mergedEnv(dotEnv);
  const bffPort = Number(baseEnv.CLOUDGRID_INTEGRATION_BFF_PORT || (await freePort()));
  const otlpPort = Number(baseEnv.CLOUDGRID_INTEGRATION_OTLP_PORT || (await freePort()));
  const natsUrl = baseEnv.CLOUDGRID_NATS_URL || "nats://localhost:4222";
  const surrealUrl = baseEnv.CLOUDGRID_SURREALDB_URL || "http://localhost:8000/rpc";
  const surrealDatabase = baseEnv.CLOUDGRID_SURREALDB_DATABASE || "dev";

  const plan = [
    `NATS: ${natsUrl}`,
    `SurrealDB: ${surrealUrl} (${baseEnv.CLOUDGRID_SURREALDB_NAMESPACE || "observability"}/${surrealDatabase})`,
    `BFF: http://127.0.0.1:${bffPort}/graphql`,
    `Collector: http://127.0.0.1:${otlpPort}`,
  ];

  if (args.includes("--dry-run")) {
    console.log(["Local integration dry run:", ...plan.map((line) => `- ${line}`)].join("\n"));
    return;
  }

  const processes = [];
  const runTraceFixture = {
    traceIdHex: randomHex(16),
    rootSpanIdHex: randomHex(8),
    serviceName: `checkout-api-integration-${Date.now()}`,
  };
  const metricNow = BigInt(Date.now()) * 1_000_000n;
  const runMetricFixture = {
    metricName: `cloudgrid.integration.metric.${Date.now()}`,
    serviceName: `metrics-integration-${Date.now()}`,
    startedAtUnixNano: String(metricNow - 60_000_000_000n),
    observedAtUnixNano: String(metricNow),
  };
  try {
    console.log("Checking local infrastructure...");
    await assertNatsReady(natsUrl);
    await assertTcpUrlReachable(surrealUrl, "SurrealDB");

    console.log("Starting CloudGrid services...");
    processes.push(
      startProcess(
        "storage-write",
        ["go", "run", "-tags", "surrealdb", "./core/storage-write/cmd/storage-write"],
        {
          ...baseEnv,
        },
      ),
    );
    await processes.at(-1).waitForLog("startup_ready", 20_000);

    processes.push(
      startProcess(
        "storage-read",
        ["go", "run", "-tags", "surrealdb", "./core/storage-read/cmd/storage-read"],
        {
          ...baseEnv,
        },
      ),
    );
    await processes.at(-1).waitForLog("startup_ready", 20_000);

    processes.push(
      startProcess("bff", ["bun", "run", "--cwd", "apps/backend", "src/index.ts"], {
        ...baseEnv,
        CLOUDGRID_BFF_HOST: "127.0.0.1",
        CLOUDGRID_BFF_PORT: String(bffPort),
        CLOUDGRID_GRAPHQL_UI: "false",
      }),
    );
    await waitForHttp(`http://127.0.0.1:${bffPort}/api/health`, 20_000);

    processes.push(
      startProcess("otlp-collector", ["go", "run", "./core/otlp-collector/cmd/otlp-collector"], {
        ...baseEnv,
        CLOUDGRID_OTLP_HOST: "127.0.0.1",
        CLOUDGRID_OTLP_PORT: String(otlpPort),
      }),
    );
    await processes.at(-1).waitForLog("startup_ready", 20_000);

    console.log("Posting OTLP JSON and protobuf fixtures...");
    await postTraceJson(otlpPort, runTraceFixture);
    await postLogProtobuf(otlpPort);
    await postMetricJson(otlpPort, runMetricFixture);

    console.log("Asserting GraphQL read path...");
    await eventually(async () => {
      const traces = await graphql(bffPort, tracesQuery(), {
        input: { service: runTraceFixture.serviceName, limit: 10 },
      });
      const trace = traces.data?.traces?.items?.find(
        (item) => item.id === runTraceFixture.traceIdHex,
      );
      assert(trace, "GraphQL traces query did not return the JSON trace fixture");
      assert(trace.spanCount >= 1, "Trace summary did not include persisted span count");
    }, 20_000);

    const detail = await graphql(bffPort, traceDetailQuery(), { id: runTraceFixture.traceIdHex });
    assert(
      detail.data?.trace?.trace?.id === runTraceFixture.traceIdHex,
      "Trace detail missing trace",
    );
    assert(detail.data.trace.spans.length >= 1, "Trace detail missing spans");

    await eventually(async () => {
      const logs = await graphql(bffPort, logsQuery(), {
        input: { service: "checkout-api", search: "order created", limit: 10 },
      });
      assert(logs.data?.logs?.items?.length >= 1, "GraphQL logs query did not return protobuf log");
    }, 20_000);

    await eventually(async () => {
      const metricNames = await graphql(bffPort, metricNamesQuery(), {
        input: {
          query: runMetricFixture.metricName,
          from: new Date(Number(metricNow / 1_000_000n) - 60 * 60 * 1000).toISOString(),
          to: new Date(Number(metricNow / 1_000_000n) + 60 * 1000).toISOString(),
          limit: 10,
        },
      });
      const descriptor = metricNames.data?.metricNames?.items?.find(
        (item) => item.name === runMetricFixture.metricName,
      );
      assert(descriptor, "GraphQL metricNames query did not return the JSON metric fixture");

      const series = await graphql(bffPort, metricSeriesQuery(), {
        input: {
          metricName: runMetricFixture.metricName,
          from: new Date(Number(metricNow / 1_000_000n) - 60 * 60 * 1000).toISOString(),
          to: new Date(Number(metricNow / 1_000_000n) + 60 * 1000).toISOString(),
          aggregation: "avg",
          interval: "PT1M",
          limit: 10,
        },
      });
      const points = series.data?.metricSeries?.series?.flatMap((item) => item.points) ?? [];
      assert(points.length >= 1, "GraphQL metricSeries query did not return metric points");
      assert(
        points.some((point) => point.value === 42.5),
        "GraphQL metricSeries did not include the expected metric value",
      );
    }, 20_000);

    console.log("Asserting collector failure mappings...");
    await assertCollectorProblem(otlpPort, {
      path: "/v1/traces",
      body: "{}",
      contentType: "text/plain",
      status: 415,
      id: "ERR-002",
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    await assertCollectorProblem(otlpPort, {
      path: "/v1/logs",
      body: "{",
      contentType: "application/json",
      status: 400,
      id: "ERR-008",
      code: "OTLP_DECODE_FAILED",
    });
    await assertCollectorProblem(otlpPort, {
      path: "/v1/logs",
      body: Buffer.from([0xff]),
      contentType: "application/x-protobuf",
      status: 400,
      id: "ERR-008",
      code: "OTLP_DECODE_FAILED",
    });
    await assertCollectorNatsStartupFailure(baseEnv, otlpPort + 1);

    console.log("Asserting duplicate JetStream command handling...");
    await assertDuplicateCommandDoesNotRewrite(natsUrl, bffPort);

    console.log("Local integration checks passed.");
    console.log(
      "Blocker: HTTP publish-ack ERR-013 cannot be forced without stopping shared local NATS or adding a runtime publisher hook; this runner covers collector NATS startup ERR-013 instead.",
    );
  } finally {
    await Promise.allSettled(processes.reverse().map((process) => process.stop()));
  }
}

function startProcess(name, cmd, env) {
  const lines = [];
  const proc = Bun.spawn({
    cmd,
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  collect(proc.stdout, name, lines);
  collect(proc.stderr, name, lines);
  return {
    name,
    proc,
    lines,
    async waitForLog(pattern, timeoutMs) {
      await eventually(() => {
        assert(
          lines.some((line) => line.includes(pattern)),
          `${name} did not log ${pattern}`,
        );
      }, timeoutMs);
    },
    async stop() {
      const pids = await processTree(proc.pid);
      terminatePids(pids, "SIGTERM");
      if (proc.exitCode === null) {
        proc.kill("SIGTERM");
      }
      await Promise.race([proc.exited, sleep(2_000)]);
      if (proc.exitCode === null) {
        terminatePids(pids, "SIGKILL");
        proc.kill("SIGKILL");
        await proc.exited;
      }
    },
  };
}

async function processTree(rootPid) {
  const seen = new Set([rootPid]);
  const pending = [rootPid];
  while (pending.length > 0) {
    const pid = pending.pop();
    const children = await childPids(pid);
    for (const child of children) {
      if (!seen.has(child)) {
        seen.add(child);
        pending.push(child);
      }
    }
  }
  return [...seen].sort((left, right) => right - left);
}

async function childPids(pid) {
  const proc = Bun.spawn({
    cmd: ["pgrep", "-P", String(pid)],
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await streamText(proc.stdout);
  await proc.exited;
  return output
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function terminatePids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

async function collect(stream, name, lines) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      lines.push(line);
      console.log(`[${name}] ${line}`);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer) {
    lines.push(buffer);
    console.log(`[${name}] ${buffer}`);
  }
}

async function postTraceJson(port, fixture) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/traces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "integration-trace-json",
    },
    body: JSON.stringify(buildTraceJsonFixture(fixture)),
  });
  assert(
    response.status === 200,
    `trace JSON ingest returned ${response.status}: ${await response.text()}`,
  );
}

async function postLogProtobuf(port) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
    method: "POST",
    headers: {
      "content-type": "application/x-protobuf",
      "x-request-id": "integration-log-protobuf",
    },
    body: protobufLogFixture,
  });
  assert(
    response.status === 200,
    `log protobuf ingest returned ${response.status}: ${await response.text()}`,
  );
}

async function postMetricJson(port, fixture) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/metrics`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "integration-metric-json",
    },
    body: JSON.stringify(buildMetricJsonFixture(fixture)),
  });
  assert(
    response.status === 200,
    `metric JSON ingest returned ${response.status}: ${await response.text()}`,
  );
}

async function assertCollectorProblem(port, scenario) {
  const response = await fetch(`http://127.0.0.1:${port}${scenario.path}`, {
    method: "POST",
    headers: { "content-type": scenario.contentType },
    body: scenario.body,
  });
  const body = await response.json();
  assert(response.status === scenario.status, `${scenario.path} status ${response.status}`);
  assert(body.error?.id === scenario.id, `${scenario.path} problem id ${body.error?.id}`);
  assert(body.error?.code === scenario.code, `${scenario.path} problem code ${body.error?.code}`);
}

async function assertCollectorNatsStartupFailure(baseEnv, port) {
  const proc = startProcess(
    "otlp-collector-nats-failure",
    ["go", "run", "./core/otlp-collector/cmd/otlp-collector"],
    {
      ...baseEnv,
      CLOUDGRID_NATS_URL: "nats://127.0.0.1:1",
      CLOUDGRID_OTLP_HOST: "127.0.0.1",
      CLOUDGRID_OTLP_PORT: String(port),
    },
  );
  try {
    await eventually(async () => {
      const exitCode = await Promise.race([proc.proc.exited, sleep(50).then(() => null)]);
      assert(
        exitCode !== null && exitCode !== 0,
        "collector did not fail startup with unavailable NATS",
      );
    }, 10_000);
    assert(
      proc.lines.some((line) => line.includes("ERR-013")),
      "collector NATS failure missing ERR-013",
    );
  } finally {
    await proc.stop();
  }
}

async function assertDuplicateCommandDoesNotRewrite(natsUrl, bffPort) {
  const { JSONCodec, connect } = await loadNatsClient();
  const commandId = `integration-duplicate-${Date.now()}`;
  const commands = duplicateCommands(commandId, "integration-duplicate");
  const nc = await connect({ servers: natsUrl, name: "cloudgrid-integration-runner" });
  try {
    const js = nc.jetstream();
    const codec = JSONCodec();
    await js.publish("telemetry.ingest.traces", codec.encode(commands.original));
    await eventually(async () => {
      const detail = await graphql(bffPort, traceDetailQuery(), { id: commands.originalTraceId });
      assert(
        detail.data?.trace?.trace?.id === commands.originalTraceId,
        "original duplicate trace missing",
      );
    }, 20_000);

    await js.publish("telemetry.ingest.traces", codec.encode(commands.rewrite));
    await sleep(1_500);

    const rewrite = await graphql(bffPort, tracesQuery(), {
      input: { service: "duplicate-rewrite", limit: 10 },
    });
    assert(
      !rewrite.data?.traces?.items?.some((item) => item.id === commands.rewriteTraceId),
      "duplicate command rewrote data with second payload",
    );
  } finally {
    await nc.drain();
  }
}

function persistTraceCommand({
  commandId,
  requestId,
  issuedAt,
  traceId,
  spanId,
  serviceName,
  spanName,
  startedAt,
  endedAt,
}) {
  return {
    requestId,
    issuedAt,
    commandId,
    source: "otlp-traces",
    traces: [
      {
        id: traceId,
        serviceName,
        startedAt,
        endedAt,
        durationMs: 25,
        rootSpanId: spanId,
        status: "ok",
        attributes: { "service.name": serviceName },
      },
    ],
    spans: [
      {
        id: spanId,
        traceId,
        name: spanName,
        serviceName,
        startedAt,
        endedAt,
        durationMs: 25,
        status: "ok",
        attributes: { "service.name": serviceName },
        events: [],
      },
    ],
    logs: [],
  };
}

async function graphql(port, query, variables) {
  const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
  }
  return body;
}

function tracesQuery() {
  return `query IntegrationTraces($input: TraceSearchInput) {
    traces(input: $input) {
      items { id serviceName spanCount logCount status }
    }
  }`;
}

function traceDetailQuery() {
  return `query IntegrationTrace($id: ID!) {
    trace(id: $id) {
      trace { id serviceName status }
      spans { id traceId name events { name } }
      logs { id traceId spanId body correlation }
    }
  }`;
}

function logsQuery() {
  return `query IntegrationLogs($input: LogSearchInput) {
    logs(input: $input) {
      items { id traceId spanId serviceName body correlation }
    }
  }`;
}

function metricNamesQuery() {
  return `query IntegrationMetricNames($input: MetricNameSearchInput) {
    metricNames(input: $input) {
      items { name kind lastSeenAt attributeKeys }
    }
  }`;
}

function metricSeriesQuery() {
  return `query IntegrationMetricSeries($input: MetricSeriesInput!) {
    metricSeries(input: $input) {
      metric { name kind }
      series { labels points { timestamp value count } }
    }
  }`;
}

async function assertNatsReady(natsUrl) {
  const { connect } = await loadNatsClient();
  const nc = await connect({ servers: natsUrl, name: "cloudgrid-integration-prereq" });
  await nc.drain();
}

async function loadNatsClient() {
  return import(pathToFileURL(join(repoRoot, "apps/backend/node_modules/nats/index.js")).href);
}

async function assertTcpUrlReachable(value, label) {
  const url = new URL(value);
  const port = Number(
    url.port || (url.protocol === "https:" || url.protocol === "wss:" ? 443 : 80),
  );
  await new Promise((resolvePromise, reject) => {
    const socket = new Socket();
    socket.setTimeout(2_000);
    socket.once("connect", () => {
      socket.destroy();
      resolvePromise();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`${label} is not reachable at ${value}: connection timed out`));
    });
    socket.once("error", (error) => {
      reject(new Error(`${label} is not reachable at ${value}: ${error.message}`));
    });
    socket.connect(port, url.hostname);
  });
}

async function waitForHttp(url, timeoutMs) {
  await eventually(async () => {
    const response = await fetch(url).catch(() => null);
    assert(response?.ok, `${url} is not ready`);
  }, timeoutMs);
}

async function streamText(stream) {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function eventually(fn, timeoutMs, intervalMs = 250) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }
  throw lastError ?? new Error("timed out");
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePromise(address.port));
    });
    server.on("error", reject);
  });
}

function hexToBase64(value) {
  return Buffer.from(value, "hex").toString("base64");
}

function randomHex(byteLength) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(byteLength))).toString("hex");
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
