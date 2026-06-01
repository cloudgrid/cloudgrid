#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultProjectID = "default";
const systemProjectID = "cloudgrid-system";
const localCompanyID = "local";
const execFileAsync = promisify(execFile);

const managedValues = [
  "CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS",
  "CLOUDGRID_OTLP_LOCAL_PROJECT_ID",
  "CLOUDGRID_PROJECT_API_KEY",
  "CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID",
  "CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID",
  "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN",
  "CLOUDGRID_NATS_PORT",
  "CLOUDGRID_NATS_MONITOR_PORT",
  "CLOUDGRID_NATS_URL",
  "CLOUDGRID_SURREALDB_PORT",
  "CLOUDGRID_SURREALDB_URL",
];

export async function runSetupLocal({
  cwd = repoRoot,
  log = console.log,
  nextToken = generateToken,
  nextPort = freePort,
  isPortAvailable = isLocalPortAvailable,
} = {}) {
  const envPath = join(cwd, ".env");
  const existing = await readTextIfExists(envPath);
  const assignments = readAssignments(existing);
  const tokenMap = parseValidTokenMap(assignments.get("CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS"));
  const defaultToken = tokenForProject(tokenMap, defaultProjectID) ?? nextValidToken(nextToken);
  const systemToken = tokenForProject(tokenMap, systemProjectID) ?? nextValidToken(nextToken);
  const localInfra = await localInfraEnvValues(assignments, { isPortAvailable, nextPort });

  tokenMap[defaultToken] = defaultProjectID;
  tokenMap[systemToken] = systemProjectID;

  const updated = upsertEnvValues(existing, {
    CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS: JSON.stringify(tokenMap),
    CLOUDGRID_OTLP_LOCAL_PROJECT_ID: defaultProjectID,
    CLOUDGRID_PROJECT_API_KEY: defaultToken,
    CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID: systemProjectID,
    CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID: localCompanyID,
    CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN: systemToken,
    ...localInfra.values,
  });

  await writeFile(envPath, updated);
  log("Updated .env local OTLP token routing for projects: default, cloudgrid-system");
  log(
    "Wrote CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS, CLOUDGRID_PROJECT_API_KEY, and CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN",
  );
  log(
    `Configured local Docker ports: NATS ${localInfra.values.CLOUDGRID_NATS_PORT}, NATS monitor ${localInfra.values.CLOUDGRID_NATS_MONITOR_PORT}, SurrealDB ${localInfra.values.CLOUDGRID_SURREALDB_PORT}`,
  );
  for (const change of localInfra.portChanges) {
    log(change);
  }
  log("Next: bun run dev:infra && bun run dev:all");
}

function generateToken() {
  return randomBytes(32).toString("base64url");
}

function nextValidToken(nextToken) {
  const token = nextToken();
  if (typeof token !== "string" || token.length < 32 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("generated local OTLP token must be at least 32 URL-safe characters");
  }
  return token;
}

async function localInfraEnvValues(assignments, { isPortAvailable, nextPort }) {
  const nats = await chooseLocalPort({
    name: "NATS",
    envName: "CLOUDGRID_NATS_PORT",
    rawPort: assignments.get("CLOUDGRID_NATS_PORT"),
    fallbackPort: 4222,
    isPortAvailable,
    nextPort,
  });
  const natsMonitor = await chooseLocalPort({
    name: "NATS monitor",
    envName: "CLOUDGRID_NATS_MONITOR_PORT",
    rawPort: assignments.get("CLOUDGRID_NATS_MONITOR_PORT"),
    fallbackPort: 8222,
    reservedPorts: new Set([nats.port]),
    isPortAvailable,
    nextPort,
  });
  const surreal = await chooseLocalPort({
    name: "SurrealDB",
    envName: "CLOUDGRID_SURREALDB_PORT",
    rawPort: assignments.get("CLOUDGRID_SURREALDB_PORT"),
    fallbackPort: 8000,
    reservedPorts: new Set([nats.port, natsMonitor.port]),
    isPortAvailable,
    nextPort,
  });

  return {
    values: {
      CLOUDGRID_NATS_PORT: String(nats.port),
      CLOUDGRID_NATS_MONITOR_PORT: String(natsMonitor.port),
      CLOUDGRID_NATS_URL: `nats://localhost:${nats.port}`,
      CLOUDGRID_SURREALDB_PORT: String(surreal.port),
      CLOUDGRID_SURREALDB_URL: `http://localhost:${surreal.port}/rpc`,
    },
    portChanges: [nats, natsMonitor, surreal]
      .filter((result) => result.changed)
      .map(
        (result) =>
          `${result.name} ${result.envName} port ${result.requestedPort} was unavailable; selected ${result.port}.`,
      ),
  };
}

async function chooseLocalPort({
  name,
  envName,
  rawPort,
  fallbackPort,
  reservedPorts = new Set(),
  isPortAvailable,
  nextPort,
}) {
  const requestedPort = parseLocalPort(rawPort, fallbackPort);
  if (!reservedPorts.has(requestedPort) && (await isPortAvailable(requestedPort))) {
    return { name, envName, requestedPort, port: requestedPort, changed: false };
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = await nextPort();
    if (!reservedPorts.has(candidate) && (await isPortAvailable(candidate))) {
      return { name, envName, requestedPort, port: candidate, changed: true };
    }
  }
  throw new Error(`could not find an available local port for ${envName}`);
}

function parseLocalPort(raw, fallback) {
  const value = Number(raw || fallback);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    return fallback;
  }
  return value;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }
        reject(new Error("could not allocate a local port"));
      });
    });
    server.listen(0, "127.0.0.1");
  });
}

async function isLocalPortAvailable(port) {
  return (await canBindPort(port)) && !(await hasTcpListener(port));
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function hasTcpListener(port) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
    return stdout
      .split(/\r?\n/)
      .slice(1)
      .some((line) => line.trim() !== "");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 1) {
      return false;
    }
    return false;
  }
}

async function readTextIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function readAssignments(content) {
  const assignments = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      assignments.set(match[1], match[2]);
    }
  }
  return assignments;
}

function parseValidTokenMap(raw) {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const tokens = {};
    for (const [token, projectID] of Object.entries(parsed)) {
      if (
        typeof token === "string" &&
        token.length >= 32 &&
        typeof projectID === "string" &&
        projectID.trim()
      ) {
        tokens[token] = projectID.trim();
      }
    }
    return tokens;
  } catch {
    return {};
  }
}

function tokenForProject(tokenMap, projectID) {
  return Object.entries(tokenMap).find(([token, mappedProjectID]) => {
    return token.length >= 32 && mappedProjectID === projectID;
  })?.[0];
}

function upsertEnvValues(content, values) {
  const seen = new Set();
  const lines = content ? content.split(/\r?\n/) : [];
  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !(match[1] in values)) {
      return line;
    }
    seen.add(match[1]);
    return `${match[1]}=${values[match[1]]}`;
  });

  const appendLines = managedValues
    .filter((name) => !seen.has(name))
    .map((name) => `${name}=${values[name]}`);
  if (appendLines.length > 0) {
    if (updatedLines.length > 0 && updatedLines.at(-1) !== "") {
      updatedLines.push("");
    }
    updatedLines.push(...appendLines);
  }
  if (updatedLines.length === 0 || updatedLines.at(-1) !== "") {
    updatedLines.push("");
  }
  return updatedLines.join("\n");
}

if (import.meta.main) {
  await runSetupLocal();
}
