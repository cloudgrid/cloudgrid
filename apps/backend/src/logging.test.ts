import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type { LiveTraceEvent, LogSearchInput, TraceSearchInput } from "@cloudgrid/ui-contracts";
import { JSONCodec, type NatsConnection } from "nats";
import { createAppWithBridge, NATSTelemetryQueryBridge } from "./index";

describe("BFF completion logging", () => {
  test("suppresses successful GraphQL operation completion logs at the default level", async () => {
    const stdout: string[] = [];
    const logger = createLogger("bff", {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stdout.push(line),
    });
    const { app, bridge } = createAppWithBridge(
      {
        async searchTraces(_input: TraceSearchInput) {
          return { items: [], nextCursor: null };
        },
        async getTraceDetail(_traceId: string) {
          return null;
        },
        async searchLogs(_input: LogSearchInput) {
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
          return liveEvents([]);
        },
        async health() {
          return "ok" as const;
        },
        async close() {},
      },
      { graphqlUI: false },
      logger,
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query TraceList { traces { items { id } } }" }),
    });

    expect(response.status).toBe(200);
    await bridge.close();
    expect(stdout.map((line) => JSON.parse(line)).filter((log) => log.status === "ok")).toEqual([]);
  });

  test("logs debug GraphQL operation completion without query text when debug is enabled", async () => {
    const stdout: string[] = [];
    const logger = createLogger(
      "bff",
      {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stdout.push(line),
      },
      "debug",
    );
    const { app, bridge } = createAppWithBridge(
      {
        async searchTraces(_input: TraceSearchInput) {
          return { items: [], nextCursor: null };
        },
        async getTraceDetail(_traceId: string) {
          return null;
        },
        async searchLogs(_input: LogSearchInput) {
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
          return liveEvents([]);
        },
        async health() {
          return "ok" as const;
        },
        async close() {},
      },
      { graphqlUI: false },
      logger,
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "query TraceList { traces { items { id } } }" }),
    });

    expect(response.status).toBe(200);
    await bridge.close();
    const entry = stdout
      .map((line) => JSON.parse(line))
      .find((log) => log.event === "graphql_operation_completed");
    expect(entry).toMatchObject({
      level: "debug",
      service: "bff",
      event: "graphql_operation_completed",
      operation_or_subject: "traces",
      status: "ok",
    });
    expect(entry.request_id).toBeString();
    expect(entry.duration_ms).toBeNumber();
    expect(JSON.stringify(entry)).not.toContain("TraceList");
    expect(JSON.stringify(entry)).not.toContain("query TraceList");
  });

  test("suppresses successful NATS request/reply completion logs at the default level", async () => {
    const stdout: string[] = [];
    const codec = JSONCodec<unknown>();
    const logger = createLogger("bff", {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stdout.push(line),
    });
    const connection = {
      request: async (_subject: string, data: Uint8Array) => {
        const payload = codec.decode(data) as { requestId: string };
        return {
          data: codec.encode({
            requestId: payload.requestId,
            ok: true,
            data: { items: [], nextCursor: null },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, logger);

    await bridge.searchTraces({ service: "checkout-api" });

    expect(stdout.map((line) => JSON.parse(line)).filter((log) => log.status === "ok")).toEqual([]);
  });

  test("logs debug NATS request/reply completion without payloads when debug is enabled", async () => {
    const stdout: string[] = [];
    const codec = JSONCodec<unknown>();
    const logger = createLogger(
      "bff",
      {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stdout.push(line),
      },
      "debug",
    );
    const connection = {
      request: async (_subject: string, data: Uint8Array) => {
        const payload = codec.decode(data) as { requestId: string };
        return {
          data: codec.encode({
            requestId: payload.requestId,
            ok: true,
            data: { items: [], nextCursor: null },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, logger);

    await bridge.searchTraces({ service: "checkout-api" });

    const entry = stdout
      .map((line) => JSON.parse(line))
      .find((log) => log.event === "nats_request_completed");
    expect(entry).toMatchObject({
      level: "debug",
      service: "bff",
      event: "nats_request_completed",
      operation_or_subject: "telemetry.traces.search",
      status: "ok",
    });
    expect(entry.request_id).toBeString();
    expect(entry.duration_ms).toBeNumber();
    expect(JSON.stringify(entry)).not.toContain("checkout-api");
    expect(JSON.stringify(entry)).not.toContain("query");
  });
});

async function* liveEvents(events: LiveTraceEvent[]): AsyncIterableIterator<LiveTraceEvent> {
  for (const event of events) {
    yield event;
  }
}
