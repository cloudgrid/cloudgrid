import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runBenchmark } from "./bench.mjs";

let tempDir;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cloudgrid-bench-"));
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe("benchmark harness", () => {
  test("skips unless benchmarks are explicitly enabled", async () => {
    const logs = [];

    const result = await runBenchmark({
      profile: "local-read",
      cwd: tempDir,
      env: {},
      log: (message) => logs.push(message),
    });

    expect(result.skipped).toBe(true);
    expect(logs.join("\n")).toContain("CLOUDGRID_ENABLE_BENCHMARKS=true");
  });

  test("requires target URLs when enabled", async () => {
    await expect(
      runBenchmark({
        profile: "local-read",
        cwd: tempDir,
        env: { CLOUDGRID_ENABLE_BENCHMARKS: "true" },
      }),
    ).rejects.toThrow("CLOUDGRID_BENCH_GRAPHQL_URL");
  });

  test("writes local read benchmark JSON result", async () => {
    const logs = [];
    const fixedDate = new Date("2026-05-18T10:00:00.000Z");
    const result = await runBenchmark({
      profile: "local-read",
      cwd: tempDir,
      env: {
        CLOUDGRID_ENABLE_BENCHMARKS: "true",
        CLOUDGRID_BENCH_GRAPHQL_URL: "http://localhost:3000/graphql",
      },
      now: () => fixedDate,
      fetchImpl: async () => ({ ok: true }),
      log: (message) => logs.push(message),
    });

    expect(result.profile).toBe("local-read");
    expect(result.passed).toBe(true);
    expect(result.observed.graphqlP99Ms).toBeGreaterThanOrEqual(0);
    expect(result.outputPath).toContain("tmp/benchmarks/local-read-2026-05-18T10-00-00-000Z.json");
    const written = JSON.parse(await readFile(result.outputPath, "utf8"));
    expect(written.profile).toBe("local-read");
    expect(written.targets.graphqlP99Ms).toBe(750);
    expect(logs.join("\n")).toContain("Wrote local-read benchmark result");
  });
});
