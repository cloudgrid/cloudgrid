import { describe, expect, test } from "bun:test";
import {
  buildFixtureRequests,
  generatedFixture,
  parseSeedArgs,
  responseErrorMessage,
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

  test("generates rich development telemetry with larger traces, logs, and metrics", () => {
    const traces = generatedFixture("rich-traces");
    const logs = generatedFixture("rich-logs");
    const metrics = generatedFixture("rich-metrics");
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

    expect(spanCount).toBeGreaterThanOrEqual(50);
    expect(logCount).toBeGreaterThanOrEqual(15);
    expect(metricCount).toBeGreaterThanOrEqual(3);
    expect(Math.max(...metricPointTimes)).toBeGreaterThan(Date.now() - 60 * 60 * 1000);
    expect(Math.min(...metricPointTimes)).toBeLessThan(Date.now() + 60 * 1000);
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
    expect(logBodies).toContain("Card authorization declined by issuer");
  });
});
