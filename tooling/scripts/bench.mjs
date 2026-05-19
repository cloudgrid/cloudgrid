#!/usr/bin/env bun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const targetDefaults = {
  local: { graphqlP99Ms: 750, otlpPublishAckP99Ms: 250 },
  "local-read": { graphqlP99Ms: 750 },
  "local-ingest": { otlpPublishAckP99Ms: 250 },
  production: { graphqlP99Ms: 750, otlpPublishAckP99Ms: 250 },
  "production-read": { graphqlP99Ms: 750 },
  "production-ingest": { otlpPublishAckP99Ms: 250 },
};

export async function runBenchmark({
  profile,
  cwd = repoRoot,
  env = process.env,
  now = () => new Date(),
  fetchImpl = globalThis.fetch,
  log = console.log,
} = {}) {
  const normalizedProfile = normalizeProfile(profile);
  if (env.CLOUDGRID_ENABLE_BENCHMARKS !== "true") {
    const message = `Skipping ${normalizedProfile} benchmark; set CLOUDGRID_ENABLE_BENCHMARKS=true to run.`;
    log(message);
    return { skipped: true, profile: normalizedProfile, message };
  }

  const graphqlURL = requiredTarget(env, normalizedProfile, "read", "CLOUDGRID_BENCH_GRAPHQL_URL");
  const otlpURL = requiredTarget(
    env,
    normalizedProfile,
    "ingest",
    "CLOUDGRID_BENCH_OTLP_TRACES_URL",
  );
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const requestCount = boundedRequestCount(env.CLOUDGRID_BENCH_REQUESTS);
  const deploymentProfile = deploymentProfileFor(normalizedProfile, env);
  const environment = environmentIdentityFor(normalizedProfile, env);
  const imageTag = imageTagFor(normalizedProfile, env);
  const observed = { errorRate: 0 };
  let failures = 0;
  let attempts = 0;

  if (needsRead(normalizedProfile)) {
    const read = await runReadProbe(fetchImpl, graphqlURL, requestCount);
    observed.graphqlP99Ms = read.p99Ms;
    failures += read.failures;
    attempts += read.attempts;
  }
  if (needsIngest(normalizedProfile)) {
    const ingest = await runIngestProbe(
      fetchImpl,
      otlpURL,
      env.CLOUDGRID_BENCH_OTLP_BEARER_TOKEN,
      requestCount,
    );
    observed.otlpPublishAckP99Ms = ingest.p99Ms;
    failures += ingest.failures;
    attempts += ingest.attempts;
  }

  observed.errorRate = attempts === 0 ? 0 : failures / attempts;
  const durationSeconds = Math.max(0, (now().getTime() - startedAtDate.getTime()) / 1000);
  const targets = targetDefaults[normalizedProfile];
  const passed =
    observed.errorRate === 0 &&
    (targets.graphqlP99Ms === undefined || observed.graphqlP99Ms <= targets.graphqlP99Ms) &&
    (targets.otlpPublishAckP99Ms === undefined ||
      observed.otlpPublishAckP99Ms <= targets.otlpPublishAckP99Ms);
  const result = {
    profile: normalizedProfile,
    deploymentProfile,
    environment,
    imageTag,
    startedAt,
    durationSeconds,
    targets,
    observed,
    passed,
  };
  const outputPath = await writeResult(cwd, normalizedProfile, startedAtDate, result);
  log(`Wrote ${normalizedProfile} benchmark result to ${outputPath}`);
  return { ...result, outputPath };
}

function normalizeProfile(profile) {
  switch (profile) {
    case "local":
    case "local-read":
    case "local-ingest":
    case "production":
    case "production-read":
    case "production-ingest":
      return profile;
    case "read":
      return "local-read";
    case "ingest":
      return "local-ingest";
    default:
      throw new Error(
        "benchmark profile must be local, local-read, local-ingest, production, production-read, or production-ingest",
      );
  }
}

function deploymentProfileFor(profile, env) {
  const configured = env.CLOUDGRID_BENCH_DEPLOYMENT_PROFILE?.trim();
  if (profile.startsWith("production")) {
    if (configured && configured !== "production-like") {
      throw new Error(
        "CLOUDGRID_BENCH_DEPLOYMENT_PROFILE must be production-like for production profiles",
      );
    }
    return "production-like";
  }
  return configured || "local";
}

function environmentIdentityFor(profile, env) {
  const configured = env.CLOUDGRID_BENCH_ENVIRONMENT_ID?.trim();
  if (profile.startsWith("production") && !configured) {
    throw new Error("CLOUDGRID_BENCH_ENVIRONMENT_ID is required for production profiles");
  }
  return configured || "local";
}

function imageTagFor(profile, env) {
  const configured = env.CLOUDGRID_BENCH_IMAGE_TAG?.trim();
  if (profile.startsWith("production") && !configured) {
    throw new Error("CLOUDGRID_BENCH_IMAGE_TAG is required for production profiles");
  }
  return configured || "local";
}

function requiredTarget(env, profile, kind, name) {
  if ((kind === "read" && !needsRead(profile)) || (kind === "ingest" && !needsIngest(profile))) {
    return undefined;
  }
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when CLOUDGRID_ENABLE_BENCHMARKS=true for ${profile}`);
  }
  const url = new URL(value);
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials`);
  }
  return url.toString();
}

function needsRead(profile) {
  return (
    profile === "local" ||
    profile === "local-read" ||
    profile === "production" ||
    profile === "production-read"
  );
}

function needsIngest(profile) {
  return (
    profile === "local" ||
    profile === "local-ingest" ||
    profile === "production" ||
    profile === "production-ingest"
  );
}

function boundedRequestCount(raw) {
  if (!raw) {
    return 1;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error("CLOUDGRID_BENCH_REQUESTS must be an integer between 1 and 1000");
  }
  return value;
}

async function runReadProbe(fetchImpl, graphqlURL, count) {
  return runTimedRequests(count, async () => {
    const response = await fetchImpl(graphqlURL, {
      method: "POST",
      headers: {
        accept: "application/graphql-response+json, application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "query CloudGridBenchmarkProbe { __typename }" }),
    });
    return response.ok;
  });
}

async function runIngestProbe(fetchImpl, otlpURL, bearerToken, count) {
  return runTimedRequests(count, async () => {
    const headers = { "content-type": "application/json" };
    if (bearerToken?.trim()) {
      headers.authorization = `Bearer ${bearerToken.trim()}`;
    }
    const response = await fetchImpl(otlpURL, {
      method: "POST",
      headers,
      body: JSON.stringify({ resourceSpans: [] }),
    });
    return response.ok;
  });
}

async function runTimedRequests(count, request) {
  const latencies = [];
  let failures = 0;
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    try {
      const ok = await request();
      if (!ok) {
        failures += 1;
      }
    } catch {
      failures += 1;
    }
    latencies.push(performance.now() - started);
  }
  return { p99Ms: percentile(latencies, 0.99), failures, attempts: count };
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return Math.round(sorted[index] * 100) / 100;
}

async function writeResult(cwd, profile, startedAt, result) {
  const dir = join(cwd, "tmp", "benchmarks");
  await mkdir(dir, { recursive: true });
  const timestamp = startedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const outputPath = join(dir, `${profile}-${timestamp}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return outputPath;
}

if (import.meta.main) {
  const [, , profile = "local"] = process.argv;
  const result = await runBenchmark({ profile });
  if (process.env.CLOUDGRID_BENCH_REQUIRED === "true" && result.passed === false) {
    process.exitCode = 1;
  }
}
