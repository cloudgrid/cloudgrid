#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "bun";

const processes = [];
let stopping = false;
const defaultReadyTimeoutMs = 60_000;

export async function main() {
  const env = mergedEnv(parseDotEnvFile(".env"), process.env);
  const frontendPort = env.CLOUDGRID_FRONTEND_DEV_PORT || "5173";
  const otlpHTTPPort = portFromHostPort(env.CLOUDGRID_OTLP_HTTP_ADDR || "0.0.0.0:4318");
  const aiEvalEnabled = env.CLOUDGRID_AI_EVAL_ENABLED !== "false";
  const aiEvalHarnessURL = env.CLOUDGRID_AI_EVAL_HARNESS_URL || "http://127.0.0.1:8090";
  const aiEvalHarnessPort = new URL(aiEvalHarnessURL).port || "8090";

  const requiredPorts = [
    ["backend", env.CLOUDGRID_BFF_PORT || "3000", "CLOUDGRID_BFF_PORT"],
    ["frontend", frontendPort, "CLOUDGRID_FRONTEND_DEV_PORT"],
    ["otlp-collector", otlpHTTPPort, "CLOUDGRID_OTLP_HTTP_ADDR"],
    [
      "storage-read health",
      env.CLOUDGRID_STORAGE_READ_HEALTH_PORT || "8081",
      "CLOUDGRID_STORAGE_READ_HEALTH_PORT",
    ],
    [
      "storage-write health",
      env.CLOUDGRID_STORAGE_WRITE_HEALTH_PORT || "8082",
      "CLOUDGRID_STORAGE_WRITE_HEALTH_PORT",
    ],
    [
      "control-plane health",
      env.CLOUDGRID_CONTROL_PLANE_HEALTH_PORT || "8084",
      "CLOUDGRID_CONTROL_PLANE_HEALTH_PORT",
    ],
    ...(aiEvalEnabled
      ? [
          [
            "ai-eval-runner health",
            env.CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT || "8085",
            "CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT",
          ],
          ["ai-eval harness", aiEvalHarnessPort, "CLOUDGRID_AI_EVAL_HARNESS_URL"],
        ]
      : []),
  ];

  console.log("CloudGrid dev stack starting. Run Docker infra first with:");
  console.log("  docker compose --env-file .env up -d nats surrealdb");

  const natsReadiness = await checkNatsDevReadiness(env);
  if (!natsReadiness.ok) {
    console.error(natsReadiness.message);
    process.exit(1);
  }

  const occupied = [];
  for (const [name, port, envName] of requiredPorts) {
    if (!(await isPortAvailable(Number(port)))) {
      occupied.push({ name, port, envName, process: await portProcess(port) });
    }
  }

  if (occupied.length > 0) {
    console.error("Cannot start CloudGrid dev stack because required ports are already in use:");
    for (const item of occupied) {
      console.error(
        `  - ${item.name}: ${item.port} (${item.envName})${item.process ? `, used by ${item.process}` : ""}`,
      );
    }
    console.error("Stop the existing process or override the matching environment variable.");
    process.exit(1);
  }

  await startService(
    "storage-write",
    ["go", "run", "-tags", "surrealdb", "./core/storage-write/cmd/storage-write"],
    `http://127.0.0.1:${env.CLOUDGRID_STORAGE_WRITE_HEALTH_PORT || "8082"}/readyz`,
    env,
  );
  await startService(
    "otlp-collector",
    ["go", "run", "./core/otlp-collector/cmd/otlp-collector"],
    `http://127.0.0.1:${otlpHTTPPort}/readyz`,
    env,
  );
  await startService(
    "storage-read",
    ["go", "run", "-tags", "surrealdb", "./core/storage-read/cmd/storage-read"],
    `http://127.0.0.1:${env.CLOUDGRID_STORAGE_READ_HEALTH_PORT || "8081"}/readyz`,
    env,
  );
  await startService(
    "control-plane",
    ["go", "run", "./core/control-plane/cmd/control-plane"],
    `http://127.0.0.1:${env.CLOUDGRID_CONTROL_PLANE_HEALTH_PORT || "8084"}/readyz`,
    env,
  );
  if (aiEvalEnabled) {
    await startService(
      "ai-eval-harness",
      ["bun", "tooling/scripts/ai-eval-dev-harness.mjs"],
      `${aiEvalHarnessURL.replace(/\/$/, "")}/readyz`,
      { ...env, CLOUDGRID_AI_EVAL_HARNESS_URL: aiEvalHarnessURL },
    );
    await startService(
      "ai-eval-runner",
      ["go", "run", "./core/ai-eval-runner/cmd/ai-eval-runner"],
      `http://127.0.0.1:${env.CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT || "8085"}/readyz`,
      {
        ...env,
        CLOUDGRID_AI_EVAL_ENABLED: "true",
        CLOUDGRID_AI_EVAL_HARNESS_URL: aiEvalHarnessURL,
      },
    );
  }
  await startService(
    "backend",
    ["bun", "run", "--cwd", "apps/backend", "dev"],
    `http://127.0.0.1:${env.CLOUDGRID_BFF_PORT || "3000"}/readyz`,
    env,
  );
  await startService(
    "frontend",
    ["bun", "run", "--cwd", "apps/frontend", "dev", "--host", "127.0.0.1", "--port", frontendPort],
    undefined,
    env,
  );

  console.log("CloudGrid dev stack started.");

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));

  await Promise.all(processes.map(([, proc]) => proc.exited));
}

async function startService(name, command, readyURL, extraEnv = {}) {
  const proc = spawn(command, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    stdout: "pipe",
    stderr: "pipe",
  });
  processes.push([name, proc]);
  pipe(name, proc.stdout, "stdout");
  pipe(name, proc.stderr, "stderr");
  let exitedCode;
  proc.exited.then((code) => {
    exitedCode = code;
    if (!stopping) {
      console.error(`[${name}] exited with ${code}; stopping dev stack`);
      stopAll(code === 0 ? 0 : 1);
    }
  });
  if (readyURL) {
    await waitForReady(name, readyURL, () => exitedCode, devReadyTimeoutMs(extraEnv));
  }
}

async function pipe(name, stream, target) {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === "") {
        continue;
      }
      const output = `[${name}] ${line}`;
      if (target === "stderr") {
        console.error(output);
      } else {
        console.log(output);
      }
    }
  }
}

async function stopAll(exitCode) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const [, proc] of processes) {
    proc.kill("SIGTERM");
  }
  await Promise.allSettled(processes.map(([, proc]) => proc.exited));
  process.exit(exitCode);
}

async function waitForReady(name, url, exitedCode, timeoutMs = defaultReadyTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    if (exitedCode() !== undefined) {
      console.error(`[${name}] exited before becoming ready`);
      await stopAll(1);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = await readinessError(response);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(100);
  }
  console.error(`[${name}] did not become ready at ${url} within ${timeoutMs}ms: ${lastError}`);
  await stopAll(1);
}

export function devReadyTimeoutMs(env) {
  const configured = Number(env.CLOUDGRID_DEV_READY_TIMEOUT_MS || "");
  return Number.isFinite(configured) && configured > 0 ? configured : defaultReadyTimeoutMs;
}

async function readinessError(response) {
  const body = await response.text();
  const compactBody = body.trim().replace(/\s+/g, " ");
  if (compactBody === "") {
    return `${response.status} ${response.statusText}`;
  }
  return `${response.status} ${response.statusText}: ${compactBody}`;
}

export function parseDotEnv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    result[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
  return result;
}

function parseDotEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }
  return parseDotEnv(readFileSync(path, "utf8"));
}

export function mergedEnv(dotEnv, processEnv) {
  return { ...dotEnv, ...processEnv };
}

async function checkNatsDevReadiness(env) {
  const monitorPort = env.CLOUDGRID_NATS_MONITOR_PORT || "8222";
  const requiredPayload = Number(env.CLOUDGRID_OTLP_MAX_REQUEST_BYTES || "4194304");
  try {
    const response = await fetch(`http://127.0.0.1:${monitorPort}/varz`);
    if (!response.ok) {
      return {
        ok: false,
        message: `Cannot reach NATS monitor at http://127.0.0.1:${monitorPort}/varz (${response.status} ${response.statusText}). Run: docker compose --env-file .env up -d nats surrealdb`,
      };
    }
    const varz = await response.json();
    return natsPayloadReadinessMessage({
      actualPayload: Number(varz.max_payload || 0),
      requiredPayload,
      monitorPort,
    });
  } catch (error) {
    return {
      ok: false,
      message: `Cannot reach NATS monitor at http://127.0.0.1:${monitorPort}/varz (${error instanceof Error ? error.message : String(error)}). Run: docker compose --env-file .env up -d nats surrealdb`,
    };
  }
}

export function natsPayloadReadinessMessage({ actualPayload, requiredPayload, monitorPort }) {
  if (Number.isFinite(actualPayload) && actualPayload >= requiredPayload) {
    return { ok: true, message: "" };
  }
  return {
    ok: false,
    message: [
      `NATS is running on monitor port ${monitorPort}, but max_payload is ${actualPayload || "unknown"} bytes and CloudGrid requires at least ${requiredPayload} bytes.`,
      "This usually means the existing Docker Compose NATS container was created before the CloudGrid nats.conf change.",
      "Recreate it with: docker compose --env-file .env up -d --force-recreate nats surrealdb",
    ].join("\n"),
  };
}

function isPortAvailable(port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port);
  });
}

function portFromHostPort(value) {
  return value.trim().split(":").at(-1) || "4318";
}

async function portProcess(port) {
  const proc = spawn(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  const line = output
    .split(/\r?\n/)
    .slice(1)
    .find((line) => line.trim() !== "");
  if (!line) {
    return "";
  }
  const [command, pid] = line.trim().split(/\s+/, 2);
  return `${command} pid ${pid}`;
}

if (import.meta.main) {
  await main();
}
