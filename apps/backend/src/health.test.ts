import { describe, expect, test } from "bun:test";
import { createAppWithBridge, type TelemetryQueryBridge } from "./index";

function bridgeWithHealth(status: "ok" | "unavailable"): TelemetryQueryBridge {
  return {
    async searchTraces() {
      return { items: [], nextCursor: null };
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
      return liveEvents([]);
    },
    async health() {
      return status;
    },
    async close() {},
  };
}

async function* liveEvents<T>(events: T[]): AsyncIterableIterator<T> {
  for (const event of events) {
    yield event;
  }
}

describe("BFF health probes", () => {
  test("reports ready when NATS is connected", async () => {
    const { app } = createAppWithBridge(bridgeWithHealth("ok"), {});

    const response = await app.request("/readyz");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "bff",
      checks: {
        nats: { status: "ok" },
      },
    });
  });

  test("reports degraded when NATS is unavailable", async () => {
    const { app } = createAppWithBridge(bridgeWithHealth("unavailable"), {});

    const response = await app.request("/api/health");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.nats.status).toBe("unavailable");
    expect(body.checks.nats.error.error).toMatchObject({
      id: "ERR-013",
      code: "MESSAGE_BRIDGE_UNAVAILABLE",
      retryable: true,
    });
  });
});
