import { describe, expect, test } from "bun:test";
import {
  integrationScenarios,
  scenarioIdsForOperation,
  uncoveredPublicGraphQLOperationNames,
} from "../../apps/packages/integration-scenarios/src/index.ts";
import {
  buildMetricJsonFixture,
  buildTraceJsonFixture,
  dashboardWidgetRuntimeRequests,
  duplicateCommands,
  mergedEnv,
  parseDotEnv,
} from "./integration-local.mjs";

describe("integration-local helpers", () => {
  test("admin, settings, alerting, and AI Eval scenarios run as local E2E coverage", () => {
    const localScenarioIds = integrationScenarios
      .filter((scenario) => scenario.mode === "local-e2e")
      .map((scenario) => scenario.id);

    expect(localScenarioIds).toContain("control.organization-project-admin");
    expect(localScenarioIds).toContain("settings.project-configuration");
    expect(localScenarioIds).toContain("alerting.rules-history-silences");
    expect(localScenarioIds).toContain("ai-eval.workspace");
    expect(localScenarioIds).toContain("dashboards.widget-runtime");
  });

  test("every public GraphQL operation has scenario metadata coverage", () => {
    expect(uncoveredPublicGraphQLOperationNames()).toEqual([]);
  });

  test("real integration scenario coverage is never contract-only", () => {
    expect(integrationScenarios.every((scenario) => scenario.mode === "local-e2e")).toBe(true);
  });

  test("rich dashboard widgets are promoted to local E2E coverage", () => {
    const richMetricScenarioIds = scenarioIdsForOperation("RichMetricSeries");
    const richMetricLocalScenarioIds = integrationScenarios
      .filter(
        (scenario) => scenario.mode === "local-e2e" && scenario.covers.includes("RichMetricSeries"),
      )
      .map((scenario) => scenario.id);

    expect(richMetricScenarioIds).toContain("dashboards.widget-runtime");
    expect(richMetricLocalScenarioIds).toContain("dashboards.widget-runtime");
  });

  test("dashboard runtime requests match frontend widget operation mapping", () => {
    const requests = dashboardWidgetRuntimeRequests(
      {
        id: "dashboard-1",
        widgets: [
          {
            id: "metric",
            kind: "metric_timeseries",
            metric: {
              metricName: "http.server.request.duration",
              aggregation: "p95",
              groupBy: ["service.name"],
              filters: [],
              interval: "PT1M",
              maxSeries: 20,
            },
          },
          {
            id: "rich",
            kind: "metric_timeseries",
            richMetric: {
              query: {
                interval: "PT1M",
                queries: [
                  {
                    id: "a",
                    label: "Latency",
                    metricName: "http.server.request.duration",
                    aggregation: "p95",
                    groupBy: ["service.name"],
                    filters: [],
                    maxSeries: 20,
                  },
                ],
                formulas: [],
                displaySeries: [],
              },
            },
          },
          {
            id: "logs",
            kind: "log_table",
            logs: {
              service: "checkout-api",
              traceId: null,
              spanId: null,
              severity: "ERROR",
              search: "failed",
              attributes: [],
              sort: "timestamp_desc",
              limit: 50,
            },
          },
          {
            id: "traces",
            kind: "trace_table",
            traces: {
              service: "checkout-api",
              query: null,
              operationName: null,
              spanName: null,
              status: "error",
              minDurationMs: null,
              maxDurationMs: null,
              attributes: [],
              sort: "startedAt_desc",
              limit: 50,
            },
          },
        ],
      },
      { from: "2026-05-17T10:00:00.000Z", to: "2026-05-17T11:00:00.000Z" },
    );

    expect(requests.map((request) => request.operationName)).toEqual([
      "MetricSeries",
      "RichMetricSeries",
      "LogSearch",
      "TraceSearch",
    ]);
    expect(requests[0].variables.input).toEqual({
      metricName: "http.server.request.duration",
      from: "2026-05-17T10:00:00.000Z",
      to: "2026-05-17T11:00:00.000Z",
      aggregation: "p95",
      groupBy: ["service.name"],
      filters: [],
      limit: 20,
      interval: "PT1M",
    });
  });

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
