import { describe, expect, test } from "bun:test";
import {
  buildMetricJsonFixture,
  buildTraceJsonFixture,
  duplicateCommands,
  mergedEnv,
  parseDotEnv,
} from "./integration-local.mjs";

describe("integration-local helpers", () => {
  test("parseDotEnv ignores comments and preserves explicit process overrides", () => {
    const dotEnv = parseDotEnv(`
      # local infra
      CLOUDGRID_NATS_URL=nats://localhost:4222
      CLOUDGRID_BFF_PORT="3000"
    `);

    expect(dotEnv).toEqual({
      CLOUDGRID_NATS_URL: "nats://localhost:4222",
      CLOUDGRID_BFF_PORT: "3000",
    });
    expect(mergedEnv(dotEnv, { CLOUDGRID_BFF_PORT: "3999" }).CLOUDGRID_BFF_PORT).toBe("3999");
  });

  test("trace JSON fixture encodes byte IDs as protobuf JSON base64", () => {
    const fixture = buildTraceJsonFixture({
      traceIdHex: "0102030405060708090a0b0c0d0e0f10",
      rootSpanIdHex: "1112131415161718",
      serviceName: "checkout-api",
    });

    const span = fixture.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.traceId).toBe("AQIDBAUGBwgJCgsMDQ4PEA==");
    expect(span.spanId).toBe("ERITFBUWFxg=");
  });

  test("metric JSON fixture uses current OTLP metric shape", () => {
    const fixture = buildMetricJsonFixture({
      metricName: "cloudgrid.integration.metric",
      serviceName: "metrics-api",
      startedAtUnixNano: "1800000000000000000",
      observedAtUnixNano: "1800000005000000000",
    });

    const metric = fixture.resourceMetrics[0].scopeMetrics[0].metrics[0];
    const point = metric.gauge.dataPoints[0];
    expect(metric.name).toBe("cloudgrid.integration.metric");
    expect(point.asDouble).toBe(42.5);
    expect(point.timeUnixNano).toBe("1800000005000000000");
    expect(point.attributes.some((attribute) => attribute.key === "service.name")).toBe(true);
  });

  test("duplicate command helper keeps commandId stable while changing payload", () => {
    const commands = duplicateCommands("command-1", "request");

    expect(commands.original.commandId).toBe("command-1");
    expect(commands.rewrite.commandId).toBe("command-1");
    expect(commands.original.traces[0].id).not.toBe(commands.rewrite.traces[0].id);
    expect(commands.original.traces[0].serviceName).toBe("duplicate-original");
    expect(commands.rewrite.traces[0].serviceName).toBe("duplicate-rewrite");
  });
});
