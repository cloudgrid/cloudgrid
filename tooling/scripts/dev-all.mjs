#!/usr/bin/env bun
import { createServer } from "node:net";
import { spawn } from "bun";

const env = process.env;
const frontendPort = env.CLOUDGRID_FRONTEND_DEV_PORT || "5173";
const aiEvalEnabled = env.CLOUDGRID_AI_EVAL_ENABLED !== "false";
const aiEvalHarnessURL = env.CLOUDGRID_AI_EVAL_HARNESS_URL || "http://127.0.0.1:8090";
const aiEvalHarnessPort = new URL(aiEvalHarnessURL).port || "8090";

const requiredPorts = [
  ["backend", env.CLOUDGRID_BFF_PORT || "3000", "CLOUDGRID_BFF_PORT"],
  ["frontend", frontendPort, "CLOUDGRID_FRONTEND_DEV_PORT"],
  ["otlp-collector", env.CLOUDGRID_OTLP_PORT || "4318", "CLOUDGRID_OTLP_PORT"],
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

const processes = [];
let stopping = false;

console.log("CloudGrid dev stack starting. Run Docker infra first with:");
console.log("  docker compose --env-file .env up -d nats surrealdb");

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
);
await startService(
  "storage-read",
  ["go", "run", "-tags", "surrealdb", "./core/storage-read/cmd/storage-read"],
  `http://127.0.0.1:${env.CLOUDGRID_STORAGE_READ_HEALTH_PORT || "8081"}/readyz`,
);
await startService(
  "control-plane",
  ["go", "run", "./core/control-plane/cmd/control-plane"],
  `http://127.0.0.1:${env.CLOUDGRID_CONTROL_PLANE_HEALTH_PORT || "8084"}/readyz`,
);
if (aiEvalEnabled) {
  await startService(
    "ai-eval-harness",
    ["bun", "tooling/scripts/ai-eval-dev-harness.mjs"],
    `${aiEvalHarnessURL.replace(/\/$/, "")}/readyz`,
    { CLOUDGRID_AI_EVAL_HARNESS_URL: aiEvalHarnessURL },
  );
  await startService(
    "ai-eval-runner",
    ["go", "run", "./core/ai-eval-runner/cmd/ai-eval-runner"],
    `http://127.0.0.1:${env.CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT || "8085"}/readyz`,
    {
      CLOUDGRID_AI_EVAL_ENABLED: "true",
      CLOUDGRID_AI_EVAL_HARNESS_URL: aiEvalHarnessURL,
    },
  );
}
await startService(
  "backend",
  ["bun", "run", "--cwd", "apps/backend", "dev"],
  `http://127.0.0.1:${env.CLOUDGRID_BFF_PORT || "3000"}/readyz`,
);
await startService(
  "otlp-collector",
  ["go", "run", "./core/otlp-collector/cmd/otlp-collector"],
  `http://127.0.0.1:${env.CLOUDGRID_OTLP_PORT || "4318"}/readyz`,
);
await startService("frontend", [
  "bun",
  "run",
  "--cwd",
  "apps/frontend",
  "dev",
  "--host",
  "127.0.0.1",
  "--port",
  frontendPort,
]);

console.log("CloudGrid dev stack started.");

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

await Promise.all(processes.map(([, proc]) => proc.exited));

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
    await waitForReady(name, readyURL, () => exitedCode);
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

async function waitForReady(name, url, exitedCode) {
  const deadline = Date.now() + 15_000;
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
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await Bun.sleep(100);
  }
  console.error(`[${name}] did not become ready at ${url}: ${lastError}`);
  await stopAll(1);
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
