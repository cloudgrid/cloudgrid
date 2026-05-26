import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type {
  LiveTraceEvent,
  LiveTraceInput,
  LogSearchInput,
  LogSearchResult,
  TelemetryFacetInput,
  TelemetryFacetResult,
  TraceDetailInput,
  TraceSearchInput,
  TraceSearchResult,
} from "@cloudgrid/ui-contracts";
import type { TelemetryQueryBridge } from "./bridge";
import { createGraphQLWebSocketHandler } from "./graphql-ws";
import { ssoAuthConfig } from "./test-helpers";

describe("GraphQL WebSocket transport", () => {
  test("acknowledges connection_init and streams liveTraces next payloads", async () => {
    const sent: unknown[] = [];
    let receivedInput: LiveTraceInput | undefined;
    const handler = createGraphQLWebSocketHandler(
      bridge({
        subscribeLiveTraces(input) {
          receivedInput = input;
          return liveEvents([
            {
              type: "added",
              seq: 1,
              receivedAt: "2026-05-10T10:00:00.000Z",
              trace: {
                id: "trace-1",
                serviceName: "api",
                startedAt: "2026-05-10T09:59:59.000Z",
                startedAtUnixNano: "1778407199000000000",
                attributes: {},
                spanCount: 1,
                errorSpanCount: 0,
                logCount: 0,
                serviceCount: 1,
              },
            },
          ]);
        },
      }),
      createLogger("bff"),
    );
    const socket = {
      data: handler.open(),
      send(payload: string) {
        sent.push(JSON.parse(payload));
      },
      close() {},
    };

    handler.message(socket, JSON.stringify({ type: "connection_init" }));
    handler.message(
      socket,
      JSON.stringify({
        id: "op-1",
        type: "subscribe",
        payload: {
          query: `
            subscription Live($input: LiveTraceInput) {
              liveTraces(input: $input) {
                type
                seq
                receivedAt
                trace { id spanCount }
              }
            }
          `,
          variables: { input: { service: "api", limit: 10 } },
        },
      }),
    );

    await until(() => sent.length >= 3);
    handler.close(socket);

    expect(sent).toEqual([
      { type: "connection_ack" },
      {
        id: "op-1",
        type: "next",
        payload: {
          data: {
            liveTraces: {
              type: "added",
              seq: 1,
              receivedAt: "2026-05-10T10:00:00.000Z",
              trace: { id: "trace-1", spanCount: 1 },
            },
          },
        },
      },
      { id: "op-1", type: "complete" },
    ]);
    expect(receivedInput).toEqual({ service: "api", limit: 10 });
  });

  test("rejects unauthenticated deployed WebSocket subscriptions with sanitized errors", async () => {
    const sent: unknown[] = [];
    const handler = createGraphQLWebSocketHandler(bridge(), createLogger("bff"), {
      auth: ssoAuthConfig(),
    });
    const socket = {
      data: handler.open(new Request("https://cloudgrid.example/graphql")),
      send(payload: string) {
        sent.push(JSON.parse(payload));
      },
      close() {},
    };

    handler.message(socket, JSON.stringify({ type: "connection_init" }));
    handler.message(
      socket,
      JSON.stringify({
        id: "op-1",
        type: "subscribe",
        payload: {
          query: `
            subscription Live {
              liveTraces { type seq receivedAt }
            }
          `,
        },
      }),
    );

    await until(() => sent.length >= 3);

    expect(sent[0]).toEqual({ type: "connection_ack" });
    expect(sent[1]).toMatchObject({
      id: "op-1",
      type: "next",
      payload: {
        errors: [
          {
            extensions: {
              code: "UNAUTHENTICATED",
              problem: { id: "ERR-015", detail: "Authentication is required" },
            },
          },
        ],
      },
    });
    expect(JSON.stringify(sent)).not.toContain("Bearer");
  });

  test("authenticates deployed WebSocket subscriptions from connection_init Bearer token", async () => {
    const sent: unknown[] = [];
    let authContext: unknown;
    const handler = createGraphQLWebSocketHandler(
      bridge({
        subscribeLiveTraces(_input, context) {
          authContext = context;
          return liveEvents([
            {
              type: "heartbeat",
              seq: 1,
              receivedAt: "2026-05-10T10:00:00.000Z",
              trace: null,
            },
          ]);
        },
      }),
      createLogger("bff"),
      { auth: ssoAuthConfig() },
    );
    const socket = {
      data: handler.open(new Request("https://cloudgrid.example/graphql")),
      send(payload: string) {
        sent.push(JSON.parse(payload));
      },
      close() {},
    };
    const token = await handler.auth.issueTestBearerToken({
      sub: "machine-ws",
      scopes: ["telemetry:read", "telemetry:live"],
    });

    handler.message(
      socket,
      JSON.stringify({ type: "connection_init", payload: { authorization: `Bearer ${token}` } }),
    );
    handler.message(
      socket,
      JSON.stringify({
        id: "op-1",
        type: "subscribe",
        payload: {
          query: `
            subscription Live {
              liveTraces { type seq receivedAt }
            }
          `,
        },
      }),
    );

    await until(() => sent.length >= 3);
    handler.close(socket);

    expect(sent[0]).toEqual({ type: "connection_ack" });
    expect(sent[1]).toMatchObject({
      id: "op-1",
      type: "next",
      payload: { data: { liveTraces: { type: "heartbeat", seq: 1 } } },
    });
    expect(authContext).toMatchObject({
      mode: "service",
      principalId: "machine-ws",
      readAllowed: true,
      scopes: ["telemetry:read", "telemetry:live"],
    });
  });

  test("sanitizes post-setup subscription stream failures", async () => {
    const sent: unknown[] = [];
    const handler = createGraphQLWebSocketHandler(
      bridge({
        subscribeLiveTraces(): AsyncIterableIterator<LiveTraceEvent> {
          return failingLiveEvents(new Error("secret provider token leaked"));
        },
      }),
      createLogger("bff"),
    );
    const socket = {
      data: handler.open(),
      send(payload: string) {
        sent.push(JSON.parse(payload));
      },
      close() {},
    };

    handler.message(socket, JSON.stringify({ type: "connection_init" }));
    handler.message(
      socket,
      JSON.stringify({
        id: "op-1",
        type: "subscribe",
        payload: {
          query: `
            subscription Live {
              liveTraces { type seq receivedAt }
            }
          `,
        },
      }),
    );

    await until(() => sent.length >= 2);

    expect(sent[0]).toEqual({ type: "connection_ack" });
    expect(sent[1]).toMatchObject({
      id: "op-1",
      type: "error",
      payload: [
        {
          message: "Message bridge request timed out",
          extensions: {
            code: "MESSAGE_BRIDGE_TIMEOUT",
            problem: { id: "ERR-014", retryable: true },
          },
        },
      ],
    });
    expect(JSON.stringify(sent)).not.toContain("secret provider token leaked");
  });

  test("closes oversized raw messages before JSON parse", () => {
    const closed: Array<{ code?: number; reason?: string }> = [];
    const handler = createGraphQLWebSocketHandler(bridge(), createLogger("bff"), {
      maxMessageBytes: 24,
    });
    const socket = {
      data: handler.open(),
      send() {
        throw new Error("oversized message should not send");
      },
      close(code?: number, reason?: string) {
        closed.push(closeRecord(code, reason));
      },
    };

    handler.message(socket, JSON.stringify({ type: "connection_init", payload: "too-large" }));

    expect(closed).toEqual([{ code: 4409, reason: "GraphQL WebSocket message is too large" }]);
  });

  test("rejects excess operations on one socket without starting another subscription", async () => {
    const sent: unknown[] = [];
    const closed: Array<{ code?: number; reason?: string }> = [];
    let started = 0;
    const handler = createGraphQLWebSocketHandler(
      bridge({
        subscribeLiveTraces() {
          started += 1;
          return neverEndingLiveEvents();
        },
      }),
      createLogger("bff"),
      { maxOperations: 1 },
    );
    const socket = {
      data: handler.open(),
      send(payload: string) {
        sent.push(JSON.parse(payload));
      },
      close(code?: number, reason?: string) {
        closed.push(closeRecord(code, reason));
      },
    };

    handler.message(socket, JSON.stringify({ type: "connection_init" }));
    handler.message(socket, liveTraceSubscribeMessage("op-1"));
    await until(() => socket.data.operations.has("op-1"));
    handler.message(socket, liveTraceSubscribeMessage("op-2"));

    expect(started).toBe(1);
    expect(closed).toEqual([{ code: 4409, reason: "Too many active GraphQL operations" }]);
    await handler.close(socket);
  });

  test("bounds and observes iterator cleanup failures on socket close", async () => {
    const errors: unknown[] = [];
    const handler = createGraphQLWebSocketHandler(
      bridge({
        subscribeLiveTraces() {
          return cleanupFailingLiveEvents(new Error("cleanup secret"));
        },
      }),
      {
        ...createLogger("bff"),
        error(event, fields) {
          errors.push({ event, fields });
        },
      },
      { cleanupTimeoutMs: 10 },
    );
    const socket = {
      data: handler.open(),
      send() {},
      close() {},
    };

    handler.message(socket, JSON.stringify({ type: "connection_init" }));
    handler.message(socket, liveTraceSubscribeMessage("op-1"));
    await until(() => socket.data.operations.has("op-1"));
    await handler.close(socket);

    expect(socket.data.operations.size).toBe(0);
    expect(errors).toEqual([
      {
        event: "graphql_websocket_operation_cleanup_failed",
        fields: expect.objectContaining({
          error_id: "ERR-014",
          error_code: "MESSAGE_BRIDGE_TIMEOUT",
          operation_id: "op-1",
        }),
      },
    ]);
    expect(JSON.stringify(errors)).not.toContain("cleanup secret");
  });

  test("shutdown cancels active socket operations", async () => {
    let returned = 0;
    const handler = createGraphQLWebSocketHandler(
      bridge({
        subscribeLiveTraces() {
          return neverEndingLiveEvents({
            onReturn() {
              returned += 1;
            },
          });
        },
      }),
      createLogger("bff"),
      { cleanupTimeoutMs: 10 },
    );
    const socket = {
      data: handler.open(),
      send() {},
      close() {},
    };

    handler.message(socket, JSON.stringify({ type: "connection_init" }));
    handler.message(socket, liveTraceSubscribeMessage("op-1"));
    await until(() => socket.data.operations.has("op-1"));
    await handler.shutdown();

    expect(socket.data.operations.size).toBe(0);
    expect(returned).toBe(1);
  });
});

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for websocket messages");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function closeRecord(code?: number, reason?: string): { code?: number; reason?: string } {
  return {
    ...(code === undefined ? {} : { code }),
    ...(reason === undefined ? {} : { reason }),
  };
}

function liveTraceSubscribeMessage(id: string): string {
  return JSON.stringify({
    id,
    type: "subscribe",
    payload: {
      query: `
        subscription Live {
          liveTraces { type seq receivedAt }
        }
      `,
    },
  });
}

function bridge(overrides: Partial<TelemetryQueryBridge> = {}): TelemetryQueryBridge {
  return {
    async searchTraces(_input: TraceSearchInput): Promise<TraceSearchResult> {
      return { items: [], nextCursor: null };
    },
    async getTraceDetail(_traceId: string, _input: TraceDetailInput) {
      return null;
    },
    async searchLogs(_input: LogSearchInput): Promise<LogSearchResult> {
      return { items: [], nextCursor: null };
    },
    async telemetryFacets(_input: TelemetryFacetInput): Promise<TelemetryFacetResult> {
      return {
        services: [],
        operations: [],
        spanNames: [],
        severities: [],
        attributeKeys: [],
      };
    },
    subscribeLiveTraces(_input: LiveTraceInput) {
      return liveEvents([]);
    },
    async health() {
      return "ok" as const;
    },
    async close() {},
    ...overrides,
  };
}

async function* liveEvents(events: LiveTraceEvent[]): AsyncIterableIterator<LiveTraceEvent> {
  for (const event of events) {
    yield event;
  }
}

function failingLiveEvents(error: Error): AsyncIterableIterator<LiveTraceEvent> {
  return {
    async next(): Promise<IteratorResult<LiveTraceEvent>> {
      throw error;
    },
    async return(): Promise<IteratorResult<LiveTraceEvent>> {
      return { done: true, value: undefined };
    },
    async throw(thrown?: unknown): Promise<IteratorResult<LiveTraceEvent>> {
      throw thrown ?? error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function neverEndingLiveEvents(
  options: { onReturn?: () => void } = {},
): AsyncIterableIterator<LiveTraceEvent> {
  return {
    async next(): Promise<IteratorResult<LiveTraceEvent>> {
      return new Promise(() => {});
    },
    async return(): Promise<IteratorResult<LiveTraceEvent>> {
      options.onReturn?.();
      return { done: true, value: undefined };
    },
    async throw(thrown?: unknown): Promise<IteratorResult<LiveTraceEvent>> {
      throw thrown;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function cleanupFailingLiveEvents(error: Error): AsyncIterableIterator<LiveTraceEvent> {
  return {
    async next(): Promise<IteratorResult<LiveTraceEvent>> {
      return new Promise(() => {});
    },
    async return(): Promise<IteratorResult<LiveTraceEvent>> {
      throw error;
    },
    async throw(thrown?: unknown): Promise<IteratorResult<LiveTraceEvent>> {
      throw thrown ?? error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
