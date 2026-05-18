#!/usr/bin/env bun
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultProjectID = "default";
const systemProjectID = "cloudgrid-system";
const localCompanyID = "local";

const managedValues = [
  "CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS",
  "CLOUDGRID_OTLP_LOCAL_PROJECT_ID",
  "CLOUDGRID_PROJECT_API_KEY",
  "CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID",
  "CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID",
  "CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN",
];

export async function runSetupLocal({
  cwd = repoRoot,
  log = console.log,
  nextToken = generateToken,
} = {}) {
  const envPath = join(cwd, ".env");
  const existing = await readTextIfExists(envPath);
  const assignments = readAssignments(existing);
  const tokenMap = parseValidTokenMap(assignments.get("CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS"));
  const defaultToken = tokenForProject(tokenMap, defaultProjectID) ?? nextValidToken(nextToken);
  const systemToken = tokenForProject(tokenMap, systemProjectID) ?? nextValidToken(nextToken);

  tokenMap[defaultToken] = defaultProjectID;
  tokenMap[systemToken] = systemProjectID;

  const updated = upsertEnvValues(existing, {
    CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS: JSON.stringify(tokenMap),
    CLOUDGRID_OTLP_LOCAL_PROJECT_ID: defaultProjectID,
    CLOUDGRID_PROJECT_API_KEY: defaultToken,
    CLOUDGRID_SELF_OBSERVABILITY_PROJECT_ID: systemProjectID,
    CLOUDGRID_SELF_OBSERVABILITY_COMPANY_ID: localCompanyID,
    CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN: systemToken,
  });

  await writeFile(envPath, updated);
  log("Updated .env local OTLP token routing for projects: default, cloudgrid-system");
  log(
    "Wrote CLOUDGRID_OTLP_LOCAL_PROJECT_TOKENS, CLOUDGRID_PROJECT_API_KEY, and CLOUDGRID_SELF_OBSERVABILITY_OTLP_BEARER_TOKEN",
  );
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
