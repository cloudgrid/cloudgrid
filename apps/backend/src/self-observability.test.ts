import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type { TraceSearchInput } from "@cloudgrid/ui-contracts";
import { MessageBridgeCloudGridBridge, type RequestReplyClient } from "./bridge";
import { createAppWithBridge } from "./index";
import {
  createTraceContext,
  OTLPMetricsExporter,
  OTLPSelfObservabilityExporter,
  parseTraceContext,
  traceContextToTraceParent,
} from "./self-observability";

describe("BFF OTLP self-observability metrics exporter", () => {
  test("posts OTLP JSON metrics with resource attributes and bearer token", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const exporter = OTLPMetricsExporter.fromConfig({
      serviceName: "cloudgrid.bff",
      deploymentMode: "deployed",
      selfObservability: {
        enabled: true,
        metricsEnabled: true,
        tracesEnabled: false,
        logsEnabled: false,
        projectId: "cloudgrid-system",
        companyId: "ops",
        otlpEndpoint: "https://collector.example/otlp",
        otlpBearerToken: "secret-token",
        exportIntervalSeconds: 10,
      },
      now: () => new Date("2026-05-18T10:00:00.000Z"),
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(null, { status: 202 });
      },
    });
    if (!exporter) {
      throw new Error("exporter was not created");
    }

    exporter.record({
      metric: "cloudgrid.bff.graphql.operations",
      kind: "counter",
      value: 1,
      attributes: {
        operation_type: "query",
        operation_name: "traces",
        result: "success",
      },
    });
    await exporter.flush();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://collector.example/otlp/v1/metrics");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
      "Bearer secret-token",
    );
    const payload = JSON.parse(String(requests[0]?.init?.body));
    expect(JSON.stringify(payload)).toContain("cloudgrid.bff.graphql.operations");
    expect(JSON.stringify(payload)).toContain("service.name");
    expect(JSON.stringify(payload)).toContain("cloudgrid.bff");
    expect(JSON.stringify(payload)).not.toContain("secret-token");
  });

  test("does not create an exporter when metrics are disabled", () => {
    const exporter = OTLPMetricsExporter.fromConfig({
      serviceName: "cloudgrid.bff",
      deploymentMode: "local",
      selfObservability: {
        enabled: true,
        metricsEnabled: false,
        tracesEnabled: false,
        logsEnabled: false,
        projectId: "cloudgrid-system",
        companyId: "local",
        otlpEndpoint: "http://localhost:4318",
        exportIntervalSeconds: 10,
      },
    });

    expect(exporter).toBeUndefined();
  });
});

describe("BFF self-observability trace and log wiring", () => {
  test("records bounded GraphQL spans and error logs without raw query data", async () => {
    const spans: unknown[] = [];
    const logs: unknown[] = [];
    const { app } = createAppWithBridge(
      {
        async searchTraces(_input: TraceSearchInput) {
          throw new Error("database timeout for project-secret");
        },
        async getTraceDetail() {
          return null;
        },
        async searchLogs() {
          return { items: [], nextCursor: null };
        },
        async telemetryFacets() {
          return {
            services: [],
            operations: [],
            spanNames: [],
            severities: [],
            attributeKeys: [],
          };
        },
        subscribeLiveTraces() {
          return (async function* emptyLiveEvents() {})();
        },
        async health() {
          return "ok" as const;
        },
        async close() {},
      },
      {
        traceRecorder: { recordSpan: (record) => spans.push(record) },
        logRecorder: { recordLog: (record) => logs.push(record) },
      },
      createLogger("bff", { stdout: () => {}, stderr: () => {} }),
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        authorization: "Bearer user-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query SensitiveTraceList($secret: String) {
          traces(input: { query: $secret }) { items { id } }
        }`,
        variables: { secret: "project-secret" },
      }),
    });

    expect(response.status).toBe(200);
    expect(spans).toContainEqual({
      name: "graphql.request",
      result: "error",
      durationSeconds: expect.any(Number),
      attributes: {
        "cloudgrid.request_id": expect.any(String),
        "graphql.operation.name": "traces",
        "graphql.operation.type": "query",
      },
    });
    expect(logs).toContainEqual({
      event: "graphql_operation_failed",
      severity: "WARN",
      attributes: {
        "graphql.operation.name": "traces",
        "graphql.operation.type": "query",
        "error.id": "ERR-006",
        "error.code": "STORAGE_UNAVAILABLE",
      },
    });
    expect(JSON.stringify({ spans, logs })).not.toContain("SensitiveTraceList");
    expect(JSON.stringify({ spans, logs })).not.toContain("project-secret");
    expect(JSON.stringify({ spans, logs })).not.toContain("user-token");
  });

  test("records bounded message bridge spans and error logs without raw payloads", async () => {
    const spans: unknown[] = [];
    const logs: unknown[] = [];
    const adapter: RequestReplyClient = {
      async request(_subject, payload) {
        const decoded = JSON.parse(new TextDecoder().decode(payload)) as { requestId: string };
        return new TextEncoder().encode(
          JSON.stringify({
            requestId: decoded.requestId,
            ok: false,
            error: {
              id: "ERR-006",
              code: "STORAGE_UNAVAILABLE",
              message: "Storage unavailable for project-secret",
              retryable: true,
            },
          }),
        );
      },
    };
    const bridge = new MessageBridgeCloudGridBridge(adapter, 2000, createLogger("bff"), {
      traceRecorder: { recordSpan: (record) => spans.push(record) },
      logRecorder: { recordLog: (record) => logs.push(record) },
    });

    await expect(bridge.searchTraces({ service: "api", query: "project-secret" })).rejects.toThrow(
      "Storage is unavailable",
    );

    expect(spans).toContainEqual({
      name: "nats.request",
      traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
      result: "error",
      durationSeconds: expect.any(Number),
      attributes: {
        "cloudgrid.request_id": expect.any(String),
        "messaging.system": "nats",
        "messaging.destination.name": "telemetry.traces.search",
        "rpc.method": "telemetry.traces.search",
      },
    });
    expect(logs).toContainEqual({
      event: "message_bridge_request_failed",
      severity: "WARN",
      attributes: {
        "messaging.system": "nats",
        "messaging.destination.name": "telemetry.traces.search",
        "rpc.method": "telemetry.traces.search",
        "error.id": "ERR-006",
        "error.code": "STORAGE_UNAVAILABLE",
      },
    });
    expect(JSON.stringify({ spans, logs })).not.toContain("project-secret");
    expect(JSON.stringify({ spans, logs })).not.toContain("Storage unavailable for");
  });

  test("injects the same trace context into NATS request headers and span records", async () => {
    const spans: unknown[] = [];
    const requests: Array<{
      subject: string;
      headers?: Record<string, string>;
    }> = [];
    const adapter: RequestReplyClient = {
      async request(subject, payload, options) {
        const decoded = JSON.parse(new TextDecoder().decode(payload)) as { requestId: string };
        requests.push({
          subject,
          ...(options.headers ? { headers: options.headers } : {}),
        });
        return new TextEncoder().encode(
          JSON.stringify({
            requestId: decoded.requestId,
            ok: true,
            data: {
              items: [],
              pageInfo: { hasNextPage: false, hasPreviousPage: false },
              totalCount: 0,
            },
          }),
        );
      },
    };
    const bridge = new MessageBridgeCloudGridBridge(adapter, 2000, createLogger("bff"), {
      traceRecorder: { recordSpan: (record) => spans.push(record) },
      traceContextFactory: () => ({
        traceId: "11111111111111111111111111111111",
        spanId: "2222222222222222",
        parentSpanId: "3333333333333333",
        traceState: "vendor=value",
      }),
    });

    await bridge.searchTraces({ service: "api", query: "project-secret" });

    expect(requests).toEqual([
      {
        subject: "telemetry.traces.search",
        headers: {
          traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
          tracestate: "vendor=value",
        },
      },
    ]);
    expect(spans).toContainEqual({
      name: "nats.request",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: "3333333333333333",
      traceState: "vendor=value",
      result: "success",
      durationSeconds: expect.any(Number),
      attributes: {
        "cloudgrid.request_id": expect.any(String),
        "messaging.system": "nats",
        "messaging.destination.name": "telemetry.traces.search",
        "rpc.method": "telemetry.traces.search",
      },
    });
    expect(JSON.stringify({ requests, spans })).not.toContain("project-secret");
  });
});

describe("BFF OTLP self-observability trace and log exporter", () => {
  test("posts OTLP JSON traces and logs with resource attributes and bearer token on shutdown", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const exporter = OTLPSelfObservabilityExporter.fromConfig({
      serviceName: "cloudgrid.bff",
      deploymentMode: "deployed",
      selfObservability: {
        enabled: true,
        metricsEnabled: false,
        tracesEnabled: true,
        logsEnabled: true,
        projectId: "cloudgrid-system",
        companyId: "ops",
        otlpEndpoint: "https://collector.example/otlp/",
        otlpBearerToken: "secret-token",
        exportIntervalSeconds: 10,
      },
      now: () => new Date("2026-05-18T10:00:00.000Z"),
      idGenerator: () => "00000000000000000000000000000001",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(null, { status: 200 });
      },
    });
    if (!exporter) {
      throw new Error("exporter was not created");
    }

    exporter.recordSpan({
      name: "graphql.request",
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: "3333333333333333",
      traceState: "vendor=value",
      attributes: {
        "graphql.operation.name": "traces",
        "cloudgrid.request_id": "req-1",
      },
      result: "success",
      durationSeconds: 0.05,
    });
    exporter.recordLog({
      event: "request/reply handler failure",
      severity: "WARN",
      attributes: {
        "rpc.method": "telemetry.traces.search",
        "error.id": "ERR-006",
        "error.code": "STORAGE_UNAVAILABLE",
      },
    });

    await exporter.shutdown();

    expect(requests.map((request) => request.url).sort()).toEqual([
      "https://collector.example/otlp/v1/logs",
      "https://collector.example/otlp/v1/traces",
    ]);
    for (const request of requests) {
      expect(request.init?.method).toBe("POST");
      expect(new Headers(request.init?.headers).get("content-type")).toBe("application/json");
      expect(new Headers(request.init?.headers).get("authorization")).toBe("Bearer secret-token");
      expect(String(request.init?.body)).not.toContain("secret-token");
    }
    const tracePayload = JSON.parse(
      String(requests.find((request) => request.url.endsWith("/v1/traces"))?.init?.body),
    );
    const logPayload = JSON.parse(
      String(requests.find((request) => request.url.endsWith("/v1/logs"))?.init?.body),
    );
    for (const payload of [tracePayload, logPayload]) {
      expect(JSON.stringify(payload)).toContain("service.name");
      expect(JSON.stringify(payload)).toContain("cloudgrid.bff");
      expect(JSON.stringify(payload)).toContain("cloudgrid.self_observability.project_id");
      expect(JSON.stringify(payload)).toContain("cloudgrid-system");
      expect(JSON.stringify(payload)).toContain("cloudgrid.self_observability.company_id");
      expect(JSON.stringify(payload)).toContain("ops");
    }
    const span = tracePayload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.traceId).toBe("EREREREREREREREREREREQ==");
    expect(span.spanId).toBe("IiIiIiIiIiI=");
    expect(span.parentSpanId).toBe("MzMzMzMzMzM=");
    expect(JSON.stringify(tracePayload)).toContain("graphql.request");
    expect(JSON.stringify(tracePayload)).not.toContain("11111111111111111111111111111111");
    expect(JSON.stringify(tracePayload)).not.toContain("2222222222222222");
    expect(JSON.stringify(tracePayload)).not.toContain("3333333333333333");
    expect(JSON.stringify(tracePayload)).toContain("vendor=value");
    expect(JSON.stringify(tracePayload)).toContain("graphql.operation.name");
    expect(JSON.stringify(tracePayload)).not.toContain("query SensitiveTraceList");
    expect(JSON.stringify(logPayload)).toContain("request/reply handler failure");
    expect(JSON.stringify(logPayload)).toContain("STORAGE_UNAVAILABLE");
  });

  test("does not create trace/log exporter when both signals are disabled", () => {
    const exporter = OTLPSelfObservabilityExporter.fromConfig({
      serviceName: "cloudgrid.bff",
      deploymentMode: "local",
      selfObservability: {
        enabled: true,
        metricsEnabled: false,
        tracesEnabled: false,
        logsEnabled: false,
        projectId: "cloudgrid-system",
        companyId: "local",
        otlpEndpoint: "http://localhost:4318",
        exportIntervalSeconds: 10,
      },
    });

    expect(exporter).toBeUndefined();
  });
});

describe("BFF W3C trace context helpers", () => {
  test("creates and formats bounded lowercase W3C trace context", () => {
    const context = createTraceContext({
      traceId: () => "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
      spanId: () => "BBBBBBBBBBBBBBBB",
      parentSpanId: "CCCCCCCCCCCCCCCC",
      traceState: "vendor=value",
    });

    expect(context).toEqual({
      traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      spanId: "bbbbbbbbbbbbbbbb",
      parentSpanId: "cccccccccccccccc",
      traceState: "vendor=value",
    });
    expect(traceContextToTraceParent(context)).toBe(
      "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
    );
  });

  test("parses valid W3C trace context and ignores invalid values", () => {
    expect(
      parseTraceContext({
        traceparent: "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
        tracestate: "vendor=value",
      }),
    ).toEqual({
      traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      spanId: "bbbbbbbbbbbbbbbb",
      traceState: "vendor=value",
    });
    expect(
      parseTraceContext({
        traceparent: "00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01",
        tracestate: "x".repeat(513),
      }),
    ).toBeUndefined();
  });
});
