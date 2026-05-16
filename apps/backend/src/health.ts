import type { Context } from "hono";
import { problemFromBridgeError } from "@cloudgrid/runtime";
import type { TelemetryQueryBridge } from "./bridge";

export async function healthResponse(context: Context, bridge: TelemetryQueryBridge) {
  const natsStatus = await bridge.health();
  const status = natsStatus === "ok" ? "ok" : "degraded";
  return context.json(
    {
      status,
      service: "bff",
      checks: {
        nats: natsStatus === "ok" ? { status: "ok" } : unavailableMessageBridge(),
      },
    },
    status === "ok" ? 200 : 503,
  );
}

function unavailableMessageBridge() {
  return {
    status: "unavailable",
    error: {
      error: problemFromBridgeError({
        id: "ERR-013",
        code: "MESSAGE_BRIDGE_UNAVAILABLE",
        message: "Message bridge is unavailable",
        retryable: true,
      }),
    },
  };
}
