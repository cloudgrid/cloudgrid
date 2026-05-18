import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import {
  MessageBridgeCloudGridBridge,
  type MessageBridgeMetricRecord,
  type RequestReplyClient,
} from "./bridge";

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

  test("records bounded message bridge metrics without changing bridge responses", async () => {
    const records: MessageBridgeMetricRecord[] = [];
    const adapter: RequestReplyClient = {
      async request(subject, payload) {
        const decoded = JSON.parse(new TextDecoder().decode(payload)) as { requestId: string };
        expect(subject).toBe("telemetry.traces.search");
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
      metricsRecorder: {
        record(record) {
          records.push(record);
        },
      },
    });

    await bridge.searchTraces({ service: "api", limit: 25 });

    expect(records).toHaveLength(2);
    expect(records).toContainEqual({
      metric: "cloudgrid.message_bridge.requests",
      kind: "counter",
      value: 1,
      attributes: {
        service: "cloudgrid.bff",
        subject: "telemetry.traces.search",
        result: "success",
      },
    });
    expect(records.find((record) => record.kind === "histogram")).toMatchObject({
      metric: "cloudgrid.message_bridge.duration",
      kind: "histogram",
      attributes: {
        service: "cloudgrid.bff",
        subject: "telemetry.traces.search",
        result: "success",
      },
    });
  });

  test("does not let message bridge metric failures mask bridge errors", async () => {
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
              message: "Storage unavailable",
              retryable: true,
            },
          }),
        );
      },
    };
    const bridge = new MessageBridgeCloudGridBridge(adapter, 2000, createLogger("bff"), {
      metricsRecorder: {
        record() {
          throw new Error("metrics unavailable");
        },
      },
    });

    await expect(bridge.searchTraces({ service: "api", limit: 25 })).rejects.toThrow(
      "Storage is unavailable",
    );
  });
});
