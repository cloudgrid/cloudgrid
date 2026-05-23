import { describe, expect, test } from "bun:test";
import {
  buildFixtureRequests,
  createSeedRunContext,
  generatedFixture,
  parseSeedArgs,
  responseErrorMessage,
  runSeed,
} from "./seed-otlp-fixtures.mjs";

describe("seed OTLP fixtures script", () => {
  test("builds collector requests for generated demo telemetry by default", () => {
    const requests = buildFixtureRequests({
      endpoint: "http://127.0.0.1:4318/",
      format: "all",
      signal: "all",
      token: "dev-token",
    });

    expect(requests.map((request) => `${request.signal}:${request.contentType}`)).toEqual([
      "traces:application/json",
      "logs:application/json",
      "metrics:application/json",
    ]);
    expect(requests[0]).toMatchObject({
      url: "http://127.0.0.1:4318/v1/traces",
      authorization: "Bearer dev-token",
      generated: "rich-traces",
    });
  });

  test("can explicitly send checked-in contract fixtures and protobuf encodings", () => {
    const requests = buildFixtureRequests({
      endpoint: "http://127.0.0.1:4318/",
      fixtureSet: "contracts",
      format: "all",
      signal: "all",
      token: null,
    });

    expect(requests.map((request) => `${request.signal}:${request.contentType}`)).toEqual([
      "traces:application/json",
      "logs:application/json",
      "metrics:application/json",
      "traces:application/x-protobuf",
      "logs:application/x-protobuf",
    ]);
  });

  test("supports narrow signal and format arguments", () => {
    const options = parseSeedArgs([
      "--endpoint",
      "http://localhost:14318",
      "--signal",
      "logs",
      "--format",
      "json",
    ]);
    const requests = buildFixtureRequests({ ...options, token: null });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      signal: "logs",
      generated: "rich-logs",
      url: "http://localhost:14318/v1/logs",
      contentType: "application/json",
      authorization: null,
    });
  });

  test("uses local OTLP token environment variables in documented precedence", () => {
    expect(
      parseSeedArgs([], {
        CLOUDGRID_OTLP_BEARER_TOKEN: "bearer-token",
        CLOUDGRID_PROJECT_API_KEY: "project-api-key",
      }).token,
    ).toBe("bearer-token");
    expect(parseSeedArgs([], { CLOUDGRID_PROJECT_API_KEY: "project-api-key" }).token).toBe(
      "project-api-key",
    );
  });

  test("parses continuous ingest options and rejects static fixture sets", () => {
    const options = parseSeedArgs(["--continuous", "--interval-ms", "1000", "--max-batches", "2"]);

    expect(options).toMatchObject({
      continuous: true,
      intervalMs: 1000,
      maxBatches: 2,
      fixtureSet: "generated",
    });
    expect(() => parseSeedArgs(["--continuous", "--fixture-set", "contracts"])).toThrow(
      "--continuous only supports --fixture-set generated",
    );
    expect(() => parseSeedArgs(["--interval-ms", "0"])).toThrow(
      "--interval-ms must be a positive integer",
    );
  });

  test("reports collector failures with method, URL, status, and body", async () => {
    const message = await responseErrorMessage({
      method: "POST",
      url: "http://127.0.0.1:4318/v1/traces",
      response: {
        status: 403,
        statusText: "Forbidden",
        text: async () => "forbidden",
      },
    });

    expect(message).toBe(
      "POST http://127.0.0.1:4318/v1/traces failed with 403 Forbidden: forbidden",
    );
  });

  test("generates realistic NimbusCart showcase telemetry for the previous two months", () => {
    const nowMs = Date.UTC(2026, 4, 18, 12, 0, 0, 0);
    const seedContext = createSeedRunContext(nowMs);
    const traces = generatedFixture("rich-traces", seedContext);
    const logs = generatedFixture("rich-logs", seedContext);
    const metrics = generatedFixture("rich-metrics", seedContext);
    const spanCount = traces.resourceSpans.reduce(
      (sum, resourceSpan) =>
        sum +
        resourceSpan.scopeSpans.reduce(
          (scopeSum, scopeSpan) => scopeSum + scopeSpan.spans.length,
          0,
        ),
      0,
    );
    const logCount = logs.resourceLogs.reduce(
      (sum, resourceLog) =>
        sum +
        resourceLog.scopeLogs.reduce(
          (scopeSum, scopeLog) => scopeSum + scopeLog.logRecords.length,
          0,
        ),
      0,
    );
    const metricCount = metrics.resourceMetrics[0].scopeMetrics[0].metrics.length;
    const metricPointTimes = metrics.resourceMetrics[0].scopeMetrics[0].metrics.flatMap((metric) =>
      Object.values(metric)
        .filter((value) => value && typeof value === "object" && "dataPoints" in value)
        .flatMap((value) => value.dataPoints.map((point) => Number(point.timeUnixNano) / 1e6)),
    );
    const spanStartTimes = traces.resourceSpans.flatMap((resourceSpan) =>
      resourceSpan.scopeSpans.flatMap((scopeSpan) =>
        scopeSpan.spans.map((span) => Number(span.startTimeUnixNano) / 1e6),
      ),
    );
    const spansByTrace = new Map();
    for (const resourceSpan of traces.resourceSpans) {
      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          const spans = spansByTrace.get(span.traceId) ?? [];
          spans.push(span);
          spansByTrace.set(span.traceId, spans);
        }
      }
    }

    expect(spanCount).toBeGreaterThanOrEqual(1500);
    expect(logCount).toBeGreaterThanOrEqual(450);
    expect(metricCount).toBeGreaterThanOrEqual(3);
    expect(Math.min(...spanStartTimes)).toBe(Date.UTC(2026, 2, 18, 11, 59, 0, 0));
    expect(Math.max(...spanStartTimes)).toBeLessThanOrEqual(nowMs);
    expect(Math.min(...metricPointTimes)).toBe(Date.UTC(2026, 2, 18, 11, 59, 3, 0));
    expect(Math.max(...metricPointTimes)).toBeLessThanOrEqual(nowMs);
    expect([...spansByTrace.keys()]).not.toContain("44444444444444444444444444444444");
    expect([...spansByTrace.keys()]).not.toContain("d4444444444444444444444444444444");
    for (const spans of spansByTrace.values()) {
      const roots = spans.filter((span) => !span.parentSpanId);
      expect(roots).toHaveLength(1);
      expect(roots[0].name).toMatch(/^POST \/api\/|^GET \/api\//);
      expect(
        spans.filter((span) => span.parentSpanId === roots[0].spanId).length,
      ).toBeLessThanOrEqual(4);
      expect(spans.some((span) => span.name.includes("processed fixture step"))).toBe(false);
      expect(spans.some((span) => span.attributes.some((attr) => attr.key === "http.route"))).toBe(
        true,
      );
    }
    const logBodies = logs.resourceLogs.flatMap((resourceLog) =>
      resourceLog.scopeLogs.flatMap((scopeLog) =>
        scopeLog.logRecords.map((record) => record.body.stringValue),
      ),
    );
    expect(logBodies.some((body) => body.includes("processed fixture step"))).toBe(false);
    const serializedTraces = JSON.stringify(traces);
    const serializedMetrics = JSON.stringify(metrics);
    expect(serializedTraces).toContain("NimbusCart");
    expect(serializedTraces).toContain("nimbuscart.checkout-api");
    expect(serializedTraces).not.toContain("cloudgrid-dev-seed");
    expect(serializedMetrics).toContain("nimbuscart.checkout.conversion_rate");
    expect(serializedMetrics).toContain("nimbuscart.orders.created");
    expect(logBodies).toContain("Payment authorization declined by issuer");
    expect(logBodies).toContain("Order confirmation sent to customer");
    expect(
      logBodies.some((body) => body.includes("Recommendation fallback used cached results")),
    ).toBe(true);
  });

  test("supports bounded generated fixture batches for integration orchestration", () => {
    const seedContext = { ...createSeedRunContext(Date.UTC(2026, 4, 18, 12, 0, 0, 0)), pointCount: 3 };
    const defaultTraces = generatedFixture("rich-traces", createSeedRunContext(Date.UTC(2026, 4, 18, 12, 0, 0, 0)));
    const boundedTraces = generatedFixture("rich-traces", seedContext);
    const boundedMetrics = generatedFixture("rich-metrics", seedContext);
    const defaultSpanCount = defaultTraces.resourceSpans.reduce(
      (sum, resourceSpan) =>
        sum +
        resourceSpan.scopeSpans.reduce(
          (scopeSum, scopeSpan) => scopeSum + scopeSpan.spans.length,
          0,
        ),
      0,
    );
    const boundedSpanCount = boundedTraces.resourceSpans.reduce(
      (sum, resourceSpan) =>
        sum +
        resourceSpan.scopeSpans.reduce(
          (scopeSum, scopeSpan) => scopeSum + scopeSpan.spans.length,
          0,
        ),
      0,
    );
    const metricPointCount = boundedMetrics.resourceMetrics[0].scopeMetrics[0].metrics.reduce(
      (sum, metric) =>
        sum +
        Object.values(metric)
          .filter((value) => value && typeof value === "object" && "dataPoints" in value)
          .reduce((pointSum, value) => pointSum + value.dataPoints.length, 0),
      0,
    );

    expect(boundedSpanCount).toBeLessThan(defaultSpanCount);
    expect(boundedSpanCount).toBeGreaterThan(0);
    expect(metricPointCount).toBeGreaterThanOrEqual(15);
  });

  test("continuous mode posts fresh generated telemetry batches", async () => {
    const decoder = new TextDecoder();
    const postedTraceBodies = [];
    const fetchImpl = async (_url, init) => {
      if (init.headers["content-type"] === "application/json") {
        const body = JSON.parse(decoder.decode(init.body));
        if (body.resourceSpans) {
          postedTraceBodies.push(body);
        }
      }
      return { ok: true };
    };

    await runSeed(
      {
        ...parseSeedArgs(["--continuous", "--max-batches", "2", "--interval-ms", "1"]),
        endpoint: "http://127.0.0.1:4318",
      },
      { fetchImpl, sleepImpl: async () => {}, log: () => {} },
    );

    expect(postedTraceBodies).toHaveLength(2);
    const firstSpan = postedTraceBodies[0].resourceSpans[0].scopeSpans[0].spans[0];
    const secondSpan = postedTraceBodies[1].resourceSpans[0].scopeSpans[0].spans[0];
    expect(firstSpan.traceId).not.toBe(secondSpan.traceId);
    expect(Number(secondSpan.startTimeUnixNano)).toBeGreaterThanOrEqual(
      Number(firstSpan.startTimeUnixNano),
    );
  });
});
