import { describe, expect, test } from "bun:test";
import { createServeOptions, isGraphQLWebSocketRequest } from "./index";

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
        close() {},
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
        close() {},
      },
    );

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
});
