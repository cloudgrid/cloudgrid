import { describe, expect, test } from "bun:test";
import {
  devReadyTimeoutMs,
  devShutdownGraceMs,
  devStackPorts,
  isPortAvailable,
  mergedEnv,
  natsPayloadReadinessMessage,
  parseDotEnv,
} from "./dev-all.mjs";

describe("dev-all helpers", () => {
  test("parseDotEnv reads local dev values without overriding process env", () => {
    const dotEnv = parseDotEnv(`
      CLOUDGRID_BFF_PORT=3000
      CLOUDGRID_OTLP_MAX_REQUEST_BYTES="4194304"
    `);

    expect(dotEnv).toEqual({
      CLOUDGRID_BFF_PORT: "3000",
      CLOUDGRID_OTLP_MAX_REQUEST_BYTES: "4194304",
    });
    expect(mergedEnv(dotEnv, { CLOUDGRID_BFF_PORT: "3999" }).CLOUDGRID_BFF_PORT).toBe("3999");
  });

  test("NATS payload readiness explains stale compose containers", () => {
    const readiness = natsPayloadReadinessMessage({
      actualPayload: 1_048_576,
      requiredPayload: 4_194_304,
      monitorPort: "8222",
    });

    expect(readiness.ok).toBe(false);
    expect(readiness.message).toContain("max_payload is 1048576 bytes");
    expect(readiness.message).toContain("--force-recreate nats surrealdb");
  });

  test("NATS payload readiness accepts configured local compose limit", () => {
    expect(
      natsPayloadReadinessMessage({
        actualPayload: 8_388_608,
        requiredPayload: 4_194_304,
        monitorPort: "8222",
      }),
    ).toEqual({ ok: true, message: "" });
  });

  test("readiness timeout supports slower local Go and SurrealDB startup", () => {
    expect(devReadyTimeoutMs({})).toBe(60_000);
    expect(devReadyTimeoutMs({ CLOUDGRID_DEV_READY_TIMEOUT_MS: "90000" })).toBe(90_000);
    expect(devReadyTimeoutMs({ CLOUDGRID_DEV_READY_TIMEOUT_MS: "0" })).toBe(60_000);
  });

  test("shutdown grace gives services time to drain before force kill", () => {
    expect(devShutdownGraceMs({})).toBe(10_000);
    expect(devShutdownGraceMs({ CLOUDGRID_DEV_SHUTDOWN_GRACE_MS: "30000" })).toBe(30_000);
    expect(devShutdownGraceMs({ CLOUDGRID_DEV_SHUTDOWN_GRACE_MS: "-1" })).toBe(10_000);
  });

  test("dev stack ports include frontend and AI eval listeners", () => {
    const ports = devStackPorts({
      CLOUDGRID_BFF_PORT: "3999",
      CLOUDGRID_FRONTEND_DEV_PORT: "5999",
      CLOUDGRID_OTLP_GRPC_ADDR: "0.0.0.0:4999",
      CLOUDGRID_AI_EVAL_HARNESS_URL: "http://127.0.0.1:8999",
    });

    expect(ports).toContainEqual(["frontend", "5999", "CLOUDGRID_FRONTEND_DEV_PORT"]);
    expect(ports).toContainEqual(["otlp-collector grpc", "4999", "CLOUDGRID_OTLP_GRPC_ADDR"]);
    expect(ports).toContainEqual(["ai-eval harness", "8999", "CLOUDGRID_AI_EVAL_HARNESS_URL"]);
  });

  test("port availability detects loopback listeners", async () => {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch() {
        return new Response("ok");
      },
    });
    try {
      expect(await isPortAvailable(server.port)).toBe(false);
    } finally {
      server.stop(true);
    }
  });
});
