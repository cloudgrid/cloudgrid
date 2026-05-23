import { describe, expect, test } from "bun:test";
import {
  createServeOptions,
  handleProcessClientDisconnect,
  isClientDisconnectError,
  isGraphQLWebSocketRequest,
  logErrorFields,
} from "./index";

describe("BFF server wiring", () => {
  test("detects only /graphql websocket upgrades", () => {
    expect(
      isGraphQLWebSocketRequest(
        new Request("http://localhost/graphql", { headers: { upgrade: "websocket" } }),
      ),
    ).toBe(true);
    expect(
      isGraphQLWebSocketRequest(
        new Request("http://localhost/traces", { headers: { upgrade: "websocket" } }),
      ),
    ).toBe(false);
    expect(isGraphQLWebSocketRequest(new Request("http://localhost/graphql"))).toBe(false);
  });

  test("serve options route GraphQL websocket upgrades through websocket handler", async () => {
    let opened = false;
    const options = createServeOptions(
      { host: "127.0.0.1", port: 3000 },
      { fetch: () => new Response("http") },
      {
        protocol: "graphql-transport-ws",
        open() {
          opened = true;
          return { operations: new Map() };
        },
        message() {},
        async close() {},
      },
    );

    const response = await options.fetch(
      new Request("http://localhost/graphql", { headers: { upgrade: "websocket" } }),
      {
        upgrade(_request, options) {
          expect(options).toMatchObject({
            headers: { "Sec-WebSocket-Protocol": "graphql-transport-ws" },
          });
          return true;
        },
      },
    );

    expect(response).toBeUndefined();
    expect(opened).toBe(true);
  });

  test("serve options fall back to Hono fetch for non-websocket requests", async () => {
    const options = createServeOptions(
      { host: "127.0.0.1", port: 3000 },
      { fetch: () => new Response("http") },
      {
        protocol: "graphql-transport-ws",
        open() {
          return { operations: new Map() };
        },
        message() {},
        async close() {},
      },
    );

    expect(options.idleTimeout).toBe(255);
    const response = await options.fetch(new Request("http://localhost/graphql"), {
      upgrade() {
        throw new Error("upgrade should not be called");
      },
    });

    if (!response) {
      throw new Error("expected HTTP response");
    }
    expect(await response.text()).toBe("http");
  });

  test("serve options convert client disconnect aborts without dumping raw errors", async () => {
    const debugEvents: unknown[] = [];
    const options = createServeOptions(
      { host: "127.0.0.1", port: 3000 },
      {
        fetch: () => {
          throw new DOMException("The connection was closed.", "AbortError");
        },
      },
      {
        protocol: "graphql-transport-ws",
        open() {
          return { operations: new Map() };
        },
        message() {},
        async close() {},
      },
      {
        debug(event, fields) {
          debugEvents.push({ event, fields });
        },
        error() {
          throw new Error("client disconnect should not log as error");
        },
      },
    );

    const response = await options.fetch(new Request("http://localhost/graphql"), {
      upgrade() {
        throw new Error("upgrade should not be called");
      },
    });

    expect(response?.status).toBe(499);
    expect(debugEvents).toEqual([
      {
        event: "client_disconnected",
        fields: {
          message: "client_disconnected",
          method: "GET",
          path: "/graphql",
        },
      },
    ]);
  });

  test("serve options return structured problem JSON and structured logs for uncaught request errors", async () => {
    const errorEvents: unknown[] = [];
    const options = createServeOptions(
      { host: "127.0.0.1", port: 3000 },
      {
        fetch: () => {
          throw new Error("database timeout");
        },
      },
      {
        protocol: "graphql-transport-ws",
        open() {
          return { operations: new Map() };
        },
        message() {},
        async close() {},
      },
      {
        debug() {},
        error(event, fields) {
          errorEvents.push({ event, fields });
        },
      },
    );

    const response = await options.fetch(new Request("http://localhost/graphql"), {
      upgrade() {
        throw new Error("upgrade should not be called");
      },
    });
    const problem = await response?.json();

    expect(response?.status).toBe(500);
    expect(problem).toMatchObject({
      id: "ERR-010",
      code: "RUNTIME_COMPOSITION_FAILED",
      detail: "Request handling failed",
    });
    expect(errorEvents).toEqual([
      {
        event: "request_failed",
        fields: expect.objectContaining({
          detail: "database timeout",
          error_code: "RUNTIME_COMPOSITION_FAILED",
          error_id: "ERR-010",
          error_name: "Error",
          message: "Request handling failed",
          method: "GET",
          path: "/graphql",
          status: 500,
        }),
      },
    ]);
  });

  test("detects Bun client disconnect aborts", () => {
    expect(
      isClientDisconnectError(new DOMException("The connection was closed.", "AbortError")),
    ).toBe(true);
    expect(isClientDisconnectError(new Error("The connection was closed."))).toBe(false);
  });

  test("process-level disconnect handler suppresses aborted client errors only", () => {
    const debugEvents: string[] = [];
    const logger = {
      debug(event: string) {
        debugEvents.push(event);
      },
    };

    expect(
      handleProcessClientDisconnect(
        new DOMException("The connection was closed.", "AbortError"),
        logger,
      ),
    ).toBe(true);
    expect(handleProcessClientDisconnect(new Error("database timeout"), logger)).toBe(false);
    expect(debugEvents).toEqual(["client_disconnected"]);
  });

  test("serializes DOMException errors into flat log fields", () => {
    expect(logErrorFields(new DOMException("The connection was closed.", "AbortError"))).toEqual({
      detail: "The connection was closed.",
      error_name: "AbortError",
      stack: undefined,
    });
  });
});
