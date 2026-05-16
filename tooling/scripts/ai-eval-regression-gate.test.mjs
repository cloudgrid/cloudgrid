import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildJUnitReport,
  evaluateRegressionThresholds,
  main,
  parseArgs,
} from "./ai-eval-regression-gate.mjs";

const cleanupPaths = [];

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { force: true });
  }
});

describe("ai-eval regression gate helpers", () => {
  test("parses required CLI thresholds and report path", () => {
    expect(
      parseArgs([
        "--endpoint",
        "http://127.0.0.1:3000/graphql",
        "--experiment-id",
        "experiment-1",
        "--min-pass-rate",
        "0.95",
        "--min-mean-score",
        "0.9",
        "--max-p95-latency-ms",
        "2500",
        "--report-junit",
        "/tmp/aieval.xml",
      ]),
    ).toMatchObject({
      endpoint: "http://127.0.0.1:3000/graphql",
      experimentId: "experiment-1",
      minPassRate: 0.95,
      minMeanScore: 0.9,
      maxP95LatencyMs: 2500,
      reportJUnit: "/tmp/aieval.xml",
    });
  });

  test("fails configured thresholds using only ExperimentRun.summary values", () => {
    const failures = evaluateRegressionThresholds(
      {
        id: "run-1",
        status: "finished",
        summary: {
          passRate: 0.8,
          meanScore: 0.89,
          p95LatencyMs: 3100,
        },
      },
      {
        minPassRate: 0.95,
        minMeanScore: 0.9,
        maxP95LatencyMs: 3000,
      },
    );

    expect(failures).toEqual([
      "passRate 0.8 is below required 0.95",
      "meanScore 0.89 is below required 0.9",
      "p95LatencyMs 3100 exceeds allowed 3000",
    ]);
  });

  test("emits JUnit XML with threshold failures", () => {
    const xml = buildJUnitReport({
      experimentId: "experiment-1",
      runId: "run-1",
      status: "finished",
      failures: ["passRate 0.8 is below required 0.95"],
      durationSeconds: 1.25,
    });

    expect(xml).toContain('<testsuite name="cloudgrid.ai-eval.regression" tests="1" failures="1"');
    expect(xml).toContain('<testcase name="experiment experiment-1" classname="CloudGridAIEval"');
    expect(xml).toContain("<failure message=");
    expect(xml).toContain("passRate 0.8 is below required 0.95");
  });

  test("starts experiment through GraphQL, polls fallback run state, writes JUnit, and fails thresholds", async () => {
    const junitPath = join(tmpdir(), `cloudgrid-ai-eval-gate-${crypto.randomUUID()}.xml`);
    cleanupPaths.push(junitPath);
    const requests = [];
    let server;
    server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = await request.json();
        requests.push(body);
        if (body.operationName === "StartExperimentRun") {
          return Response.json({
            data: {
              startExperimentRun: {
                id: "run-1",
                experimentId: body.variables.input.experimentId,
                status: "running",
                summary: {},
              },
            },
          });
        }
        if (body.operationName === "ExperimentRun") {
          return Response.json({
            data: {
              experimentRun: {
                id: body.variables.id,
                experimentId: "experiment-1",
                status: "finished",
                summary: {
                  passRate: 0.8,
                  meanScore: 0.95,
                  p95LatencyMs: 100,
                },
              },
            },
          });
        }
        return Response.json({ errors: [{ message: "unexpected operation" }] }, { status: 400 });
      },
    });

    try {
      const code = await main([
        "--endpoint",
        `http://127.0.0.1:${server.port}/graphql`,
        "--subscription-endpoint",
        "poll",
        "--experiment-id",
        "experiment-1",
        "--min-pass-rate",
        "0.9",
        "--timeout-ms",
        "1000",
        "--report-junit",
        junitPath,
      ]);

      expect(code).toBe(1);
      expect(requests.map((request) => request.operationName)).toEqual([
        "StartExperimentRun",
        "ExperimentRun",
      ]);
      expect(requests[0].variables.input).toEqual({ experimentId: "experiment-1" });
      expect(existsSync(junitPath)).toBe(true);
      expect(readFileSync(junitPath, "utf8")).toContain("passRate 0.8 is below required 0.9");
    } finally {
      server.stop(true);
    }
  });
});
