import { describe, expect, test } from "bun:test";
import { mergedEnv, natsPayloadReadinessMessage, parseDotEnv } from "./dev-all.mjs";

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
});
