import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import { MessageBridgeCloudGridBridge, type RequestReplyClient } from "./bridge";

describe("message bridge business bridge", () => {
  test("sends trace searches through a portable request/reply adapter", async () => {
    const requests: Array<{ subject: string; payload: unknown; timeoutMs: number }> = [];
    const adapter: RequestReplyClient = {
      async request(subject, payload, options) {
        const decoded = JSON.parse(new TextDecoder().decode(payload)) as { requestId: string };
        requests.push({ subject, payload: decoded, timeoutMs: options.timeoutMs });
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
    const bridge = new MessageBridgeCloudGridBridge(adapter, 2000, createLogger("bff"));

    await bridge.searchTraces({ service: "api", limit: 25 });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      subject: "telemetry.traces.search",
      timeoutMs: 2000,
      payload: {
        query: {
          service: "api",
          limit: 25,
        },
      },
    });
  });
});
