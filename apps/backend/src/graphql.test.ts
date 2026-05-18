import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type {
  LiveTraceEvent,
  LiveTraceInput,
  LogSearchInput,
  RichMetricSeriesInput,
  TelemetryFacetInput,
  TelemetryFacetResult,
  TraceDetail,
  TraceDetailInput,
  TraceSearchInput,
} from "@cloudgrid/ui-contracts";
import { parse, subscribe } from "graphql";
import {
  createAppWithBridge,
  createCloudGridSchema,
  type MetricQueryBridge,
  type TelemetryQueryBridge,
} from "./index";

describe("BFF GraphQL telemetry resolvers", () => {
  test("returns backend-derived trace summary operationName", async () => {
    const { app } = createAppWithBridge(
      bridge({
        searchTraces: async () => ({
          items: [
            {
              id: "trace-1",
              serviceName: "api",
              operationName: "POST /checkout",
              startedAt: "2026-05-08T10:00:00.000Z",
              startedAtUnixNano: "1778234400000000000",
              attributes: {},
              spanCount: 2,
              errorSpanCount: 1,
              logCount: 0,
              serviceCount: 1,
            },
          ],
          nextCursor: null,
        }),
      }),
      { graphqlUI: false },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query { traces { items { id operationName } } }`,
      }),
    });

    const body = await response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.traces.items[0]).toEqual({
      id: "trace-1",
      operationName: "POST /checkout",
    });
  });

  test("rejects GraphQL operations above configured depth before bridge calls", async () => {
    let calls = 0;
    const { app } = createAppWithBridge(
      bridge({
        searchTraces: async () => {
          calls++;
          return { items: [], nextCursor: null };
        },
      }),
      { graphqlUI: false, graphqlMaxDepth: 2 },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query { traces { items { id operationName } } }`,
      }),
    });

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.errors[0].extensions.problem).toMatchObject({
      id: "ERR-001",
      code: "VALIDATION_FAILED",
      retryable: false,
    });
    expect(body.errors[0].message).toContain("depth");
    expect(calls).toBe(0);
  });

  test("rejects GraphQL operations above configured complexity before bridge calls", async () => {
    let calls = 0;
    const { app } = createAppWithBridge(
      bridge({
        searchTraces: async () => {
          calls++;
          return { items: [], nextCursor: null };
        },
      }),
      { graphqlUI: false, graphqlMaxComplexity: 3 },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query { traces { items { id operationName } nextCursor } }`,
      }),
    });

    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.errors[0].extensions.problem).toMatchObject({
      id: "ERR-001",
      code: "VALIDATION_FAILED",
    });
    expect(body.errors[0].message).toContain("complexity");
    expect(calls).toBe(0);
  });

  test("uses GraphQL response media type when strict mode is configured", async () => {
    const { app } = createAppWithBridge(bridge(), {
      graphqlUI: false,
      graphqlResponseMediaType: "graphql-response-json",
    });

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query { traces { nextCursor } }`,
      }),
    });

    expect(response.headers.get("content-type")).toStartWith("application/graphql-response+json");
    const body = await response.json();
    expect(body.errors).toBeUndefined();
  });

  test("passes TraceDetailInput to the trace bridge request", async () => {
    let receivedTraceId = "";
    let receivedInput: TraceDetailInput | undefined;
    const { app } = createAppWithBridge(
      bridge({
        getTraceDetail: async (traceId, input) => {
          receivedTraceId = traceId;
          receivedInput = input;
          return traceDetail();
        },
      }),
      { graphqlUI: false },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query Trace($id: ID!, $input: TraceDetailInput) {
            trace(id: $id, input: $input) {
              trace { id }
              selectedSpan { id }
              relatedLogs { id }
            }
          }
        `,
        variables: {
          id: "trace-1",
          input: {
            selectedSpanId: "span-1",
            spanQuery: "checkout",
            spanService: "api",
            spanName: "POST /checkout",
            spanStatus: "error",
            minSpanDurationMs: 1,
            maxSpanDurationMs: 200,
            attributes: [{ key: "http.status_code", operator: "gte", value: 500 }],
            showMatchesOnly: true,
            relatedLogLimit: 25,
            logSearch: "failed",
          },
        },
      }),
    });

    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(receivedTraceId).toBe("trace-1");
    expect(receivedInput).toEqual({
      selectedSpanId: "span-1",
      spanQuery: "checkout",
      spanService: "api",
      spanName: "POST /checkout",
      spanStatus: "error",
      minSpanDurationMs: 1,
      maxSpanDurationMs: 200,
      attributes: [{ key: "http.status_code", operator: "gte", value: 500 }],
      showMatchesOnly: true,
      relatedLogLimit: 25,
      logSearch: "failed",
    });
  });

  test("resolves telemetry facets through the bridge", async () => {
    let receivedInput: TelemetryFacetInput | undefined;
    const { app } = createAppWithBridge(
      bridge({
        telemetryFacets: async (input) => {
          receivedInput = input;
          return {
            services: [{ value: "api", count: 3 }],
            operations: [],
            spanNames: [],
            severities: [],
            attributeKeys: [],
          };
        },
      }),
      { graphqlUI: false },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query Facets($input: TelemetryFacetInput) {
            telemetryFacets(input: $input) {
              services { value count }
              operations { value count }
              spanNames { value count }
              severities { value count }
              attributeKeys { value count }
            }
          }
        `,
        variables: {
          input: {
            from: "2026-05-08T10:00:00.000Z",
            to: "2026-05-08T11:00:00.000Z",
            service: "api",
            search: "checkout",
            limit: 10,
          },
        },
      }),
    });

    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(body.data.telemetryFacets.services).toEqual([{ value: "api", count: 3 }]);
    expect(receivedInput).toEqual({
      from: "2026-05-08T10:00:00.000Z",
      to: "2026-05-08T11:00:00.000Z",
      service: "api",
      search: "checkout",
      limit: 10,
    });
  });

  test("maps invalid telemetry facet input to validation problem details", async () => {
    const { app } = createAppWithBridge(bridge(), { graphqlUI: false });

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query Facets($input: TelemetryFacetInput) {
            telemetryFacets(input: $input) {
              services { value count }
            }
          }
        `,
        variables: { input: { limit: 201 } },
      }),
    });

    const body = await response.json();

    expect(body.errors[0].extensions.code).toBe("VALIDATION_FAILED");
    expect(body.errors[0].extensions.problem).toMatchObject({
      id: "ERR-001",
      code: "VALIDATION_FAILED",
      retryable: false,
    });
  });

  test("liveTraces subscription validates input and streams bridge events", async () => {
    let receivedInput: LiveTraceInput | undefined;
    const schema = createCloudGridSchema();
    const result = await subscribe({
      schema,
      document: parse(`
        subscription Live($input: LiveTraceInput) {
          liveTraces(input: $input) {
            type
            seq
            receivedAt
            trace { id serviceName operationName spanCount errorSpanCount logCount serviceCount }
          }
        }
      `),
      variableValues: {
        input: {
          service: "api",
          query: "checkout",
          status: "error",
          minDurationMs: 1,
          maxDurationMs: 100,
          limit: 10,
        },
      },
      contextValue: {
        hono: {
          get: () =>
            bridge({
              subscribeLiveTraces(input) {
                receivedInput = input;
                return liveEvents([
                  {
                    type: "added",
                    seq: 1,
                    receivedAt: "2026-05-10T10:00:00.000Z",
                    trace: {
                      id: "trace-1",
                      serviceName: "api",
                      operationName: "POST /checkout",
                      startedAt: "2026-05-10T09:59:59.000Z",
                      startedAtUnixNano: "1778407199000000000",
                      attributes: {},
                      spanCount: 2,
                      errorSpanCount: 1,
                      logCount: 0,
                      serviceCount: 1,
                    },
                  },
                ]);
              },
            }),
        },
        requestId: "req-live",
        logger: createLogger("bff"),
      },
    });

    if (!Symbol.asyncIterator || !(Symbol.asyncIterator in result)) {
      throw new Error("expected async iterable subscription result");
    }
    const first = await result.next();
    if (first.done) {
      throw new Error("expected live trace event");
    }

    expect(first.value.data?.liveTraces).toMatchObject({
      type: "added",
      seq: 1,
      trace: { id: "trace-1", spanCount: 2 },
    });
    expect(receivedInput).toEqual({
      service: "api",
      query: "checkout",
      status: "error",
      minDurationMs: 1,
      maxDurationMs: 100,
      limit: 10,
    });
  });

  test("resolves metric series through storage-read bridge without local aggregation", async () => {
    let receivedInput: unknown;
    const { app } = createAppWithBridge(
      bridge({
        metricSeries: async (input: unknown) => {
          receivedInput = input;
          return metricSeriesResult();
        },
      } as Partial<TelemetryQueryBridge>),
      { graphqlUI: false },
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query MetricSeries($input: MetricSeriesInput!) {
            metricSeries(input: $input) {
              metric { name kind unit attributeKeys }
              aggregation
              interval
              groupBy
              series { labels points { timestamp value count exemplars { traceId spanId } } }
              warnings { code field message }
            }
          }
        `,
        variables: {
          input: {
            metricName: "gen_ai.client.token.usage",
            from: "2026-05-14T08:00:00.000Z",
            to: "2026-05-14T09:00:00.000Z",
            interval: "PT1M",
            aggregation: "sum",
            groupBy: ["gen_ai.system", "gen_ai.request.model"],
            filters: [{ key: "service.name", operator: "eq", value: "api" }],
            limit: 500,
          },
        },
      }),
    });

    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(body.data.metricSeries.series[0].points[0].value).toBe(42);
    expect(receivedInput).toEqual({
      metricName: "gen_ai.client.token.usage",
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z",
      interval: "PT1M",
      aggregation: "sum",
      groupBy: ["gen_ai.system", "gen_ai.request.model"],
      filters: [{ key: "service.name", operator: "eq", value: "api" }],
      limit: 500,
    });
  });

  test("maps invalid metric series input to validation problem details", async () => {
    const { app } = createAppWithBridge(bridge(), { graphqlUI: false });

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query MetricSeries($input: MetricSeriesInput!) {
            metricSeries(input: $input) {
              interval
            }
          }
        `,
        variables: {
          input: {
            metricName: "gen_ai.client.token.usage",
            from: "2026-05-14T09:00:00.000Z",
            to: "2026-05-14T08:00:00.000Z",
            aggregation: "sum",
            groupBy: ["a", "b", "c", "d", "e", "f"],
          },
        },
      }),
    });

    const body = await response.json();

    expect(body.errors[0].extensions.code).toBe("VALIDATION_FAILED");
    expect(body.errors[0].extensions.problem).toMatchObject({
      id: "ERR-001",
      code: "VALIDATION_FAILED",
      retryable: false,
    });
  });

  test("resolves rich metric series through storage-read bridge without local formula work", async () => {
    let receivedInput: RichMetricSeriesInput | undefined;
    const { app } = createAppWithBridge(
      bridge({
        richMetricSeries: async (input: RichMetricSeriesInput) => {
          receivedInput = input;
          return richMetricSeriesResult();
        },
      }),
      { graphqlUI: false },
    );

    const input: RichMetricSeriesInput = {
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z",
      query: {
        timeWindow: "PT1H",
        interval: null,
        queries: [
          {
            id: "errors",
            label: "Errors",
            metricName: "http.server.requests",
            aggregation: "sum",
            filters: [{ key: "http.status_code", operator: "gte", value: 500 }],
            maxSeries: 20,
          },
          {
            id: "total",
            label: "Total",
            metricName: "http.server.requests",
            aggregation: "sum",
            maxSeries: 20,
          },
        ],
        formulas: [
          {
            id: "error_rate",
            label: "Error rate",
            expression: {
              kind: "function",
              function: "ratio",
              arguments: [
                { kind: "ref", refId: "errors", value: null },
                { kind: "ref", refId: "total", value: null },
              ],
            },
            unit: "1",
          },
        ],
        displaySeries: [
          {
            id: "display_error_rate",
            label: "Error rate",
            sourceId: "error_rate",
            visible: true,
          },
        ],
      },
    };

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query RichMetricSeries($input: RichMetricSeriesInput!) {
            richMetricSeries(input: $input) {
              interval
              series { id label sourceId unit labels points { timestamp value count exemplars { traceId spanId } } }
              displaySeries { id label sourceId visible }
              warnings { code field message }
            }
          }
        `,
        variables: { input },
      }),
    });

    const body = await response.json();

    expect(body.errors).toBeUndefined();
    expect(body.data.richMetricSeries.series[0]).toMatchObject({
      id: "error_rate",
      label: "Error rate",
      sourceId: "error_rate",
      unit: "1",
    });
    expect(receivedInput).toEqual({
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z",
      query: {
        timeWindow: "PT1H",
        queries: [
          {
            id: "errors",
            label: "Errors",
            metricName: "http.server.requests",
            aggregation: "sum",
            groupBy: [],
            filters: [{ key: "http.status_code", operator: "gte", value: 500 }],
            maxSeries: 20,
          },
          {
            id: "total",
            label: "Total",
            metricName: "http.server.requests",
            aggregation: "sum",
            groupBy: [],
            filters: [],
            maxSeries: 20,
          },
        ],
        formulas: [
          {
            id: "error_rate",
            label: "Error rate",
            expression: {
              kind: "function",
              function: "ratio",
              arguments: [
                { kind: "ref", refId: "errors", arguments: [] },
                { kind: "ref", refId: "total", arguments: [] },
              ],
            },
            unit: "1",
          },
        ],
        displaySeries: [
          {
            id: "display_error_rate",
            label: "Error rate",
            sourceId: "error_rate",
            visible: true,
          },
        ],
      },
    });
  });

  test("maps invalid rich metric formula references to validation problem details", async () => {
    const { app } = createAppWithBridge(bridge(), { graphqlUI: false });

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query RichMetricSeries($input: RichMetricSeriesInput!) {
            richMetricSeries(input: $input) { interval }
          }
        `,
        variables: {
          input: {
            from: "2026-05-14T08:00:00.000Z",
            to: "2026-05-14T09:00:00.000Z",
            query: {
              queries: [
                {
                  id: "total",
                  label: "Total",
                  metricName: "http.server.requests",
                  aggregation: "sum",
                },
              ],
              formulas: [
                {
                  id: "error_rate",
                  label: "Error rate",
                  expression: {
                    kind: "function",
                    function: "ratio",
                    arguments: [
                      { kind: "ref", refId: "missing" },
                      { kind: "ref", refId: "total" },
                    ],
                  },
                },
              ],
            },
          },
        },
      }),
    });

    const body = await response.json();

    expect(body.errors[0].extensions.code).toBe("VALIDATION_FAILED");
    expect(body.errors[0].extensions.problem).toMatchObject({
      id: "ERR-001",
      code: "VALIDATION_FAILED",
      retryable: false,
    });
  });

  test("resolves dashboard list, mutations, and pins through control-plane bridge", async () => {
    const calls: string[] = [];
    const controlBridge = {
      ...bridge(),
      async viewer() {
        return null;
      },
      async organizations() {
        return [];
      },
      async organization() {
        return null;
      },
      async projects() {
        return [];
      },
      async project() {
        return null;
      },
      async createProject() {
        throw new Error("unused");
      },
      async updateProject() {
        throw new Error("unused");
      },
      async selectProject() {
        throw new Error("unused");
      },
      async updateOrganizationMember() {
        throw new Error("unused");
      },
      async removeOrganizationMember() {
        return false;
      },
      async ingestCredentials() {
        return { items: [] };
      },
      async createIngestCredential() {
        return {
          credential: {
            id: "credential-1",
            projectId: "project-1",
            title: "Checkout service",
            scopes: [
              "telemetry:ingest:traces",
              "telemetry:ingest:logs",
              "telemetry:ingest:metrics",
            ],
            secretPreview: "cgk_...1234",
            createdAt: "2026-05-14T08:00:00.000Z",
            lastUsedAt: null,
            revokedAt: null,
            createdByUserId: "user-1",
          },
          secret: "cgk_created_secret_1234567890",
        };
      },
      async revokeIngestCredential() {
        return {
          id: "credential-1",
          projectId: "project-1",
          title: "Checkout service",
          scopes: ["telemetry:ingest:traces", "telemetry:ingest:logs", "telemetry:ingest:metrics"],
          secretPreview: "cgk_...1234",
          createdAt: "2026-05-14T08:00:00.000Z",
          lastUsedAt: null,
          revokedAt: "2026-05-14T09:00:00.000Z",
          createdByUserId: "user-1",
        };
      },
      async dashboards(input: unknown) {
        calls.push(`list:${JSON.stringify(input)}`);
        return { items: [dashboard()], pinnedDashboardIds: ["dashboard-1"] };
      },
      async saveDashboard(input: unknown) {
        calls.push(`save:${JSON.stringify(input)}`);
        return dashboard({ id: "saved-dashboard", version: 2 });
      },
      async deleteDashboard(id: string) {
        calls.push(`delete:${id}`);
        return true;
      },
      async setDashboardPinned(input: unknown) {
        calls.push(`pin:${JSON.stringify(input)}`);
        return {
          projectId: "project-1",
          pinnedDashboardIds: ["saved-dashboard"],
          updatedAt: "2026-05-14T08:00:00.000Z",
        };
      },
      async reorderDashboardPins(input: unknown) {
        calls.push(`reorder:${JSON.stringify(input)}`);
        return {
          projectId: "project-1",
          pinnedDashboardIds: ["saved-dashboard", "dashboard-1"],
          updatedAt: "2026-05-14T08:00:01.000Z",
        };
      },
    };
    const { app } = createAppWithBridge(controlBridge, { graphqlUI: false });

    const listResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query Dashboards($input: DashboardListInput) {
            dashboards(input: $input) {
              pinnedDashboardIds
              items { id name visibility widgets { id kind metric { metricName aggregation visualization } } }
            }
          }
        `,
        variables: {
          input: {
            includeBuiltins: true,
            query: "token",
            tag: "genai",
            visibility: "personal",
            pinnedOnly: false,
          },
        },
      }),
    });
    const saveResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation SaveDashboard($input: SaveDashboardInput!) {
            saveDashboard(input: $input) { id version name defaultTimeWindow widgets { id kind } }
          }
        `,
        variables: {
          input: {
            id: "project-view",
            version: 1,
            name: "Token usage",
            description: null,
            tags: ["genai"],
            visibility: "personal",
            defaultTimeWindow: "PT1H",
            widgets: [
              {
                id: "widget-1",
                title: "Tokens",
                description: null,
                kind: "metric_timeseries",
                layout: { x: 0, y: 0, w: 6, h: 4 },
                richMetric: null,
                logs: null,
                traces: null,
                liveTraces: null,
                metric: {
                  metricName: "gen_ai.client.token.usage",
                  aggregation: "sum",
                  groupBy: ["gen_ai.token.type"],
                  timeWindow: "PT1H",
                  visualization: "line",
                },
              },
              {
                id: "widget-2",
                title: "Recent logs",
                description: null,
                kind: "log_table",
                layout: { x: 6, y: 0, w: 6, h: 4, minW: null, minH: null },
                metric: null,
                richMetric: null,
                traces: null,
                liveTraces: null,
                logs: {
                  search: null,
                  service: null,
                  severity: null,
                  traceId: null,
                  spanId: null,
                  attributes: [],
                  sort: "timestamp_desc",
                  limit: 50,
                  columns: ["timestamp", "severity", "service", "trace_span", "body"],
                },
              },
            ],
          },
        },
      }),
    });
    const deleteResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `mutation DeleteDashboard($id: ID!) { deleteDashboard(id: $id) }`,
        variables: { id: "saved-dashboard" },
      }),
    });
    const pinResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation PinDashboard($input: SetDashboardPinnedInput!) {
            setDashboardPinned(input: $input) { projectId pinnedDashboardIds updatedAt }
          }
        `,
        variables: { input: { dashboardId: "saved-dashboard", pinned: true } },
      }),
    });
    const reorderResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation ReorderDashboardPins($input: ReorderDashboardPinsInput!) {
            reorderDashboardPins(input: $input) { projectId pinnedDashboardIds updatedAt }
          }
        `,
        variables: { input: { dashboardIds: ["saved-dashboard", "dashboard-1"] } },
      }),
    });

    expect((await listResponse.json()).errors).toBeUndefined();
    expect((await saveResponse.json()).data.saveDashboard).toMatchObject({
      id: "saved-dashboard",
      version: 2,
    });
    expect((await deleteResponse.json()).data.deleteDashboard).toBe(true);
    expect((await pinResponse.json()).data.setDashboardPinned.pinnedDashboardIds).toEqual([
      "saved-dashboard",
    ]);
    expect((await reorderResponse.json()).data.reorderDashboardPins.pinnedDashboardIds).toEqual([
      "saved-dashboard",
      "dashboard-1",
    ]);
    expect(calls).toEqual([
      'list:{"includeBuiltins":true,"query":"token","tag":"genai","visibility":"personal","pinnedOnly":false}',
      'save:{"id":"project-view","version":1,"name":"Token usage","tags":["genai"],"visibility":"personal","defaultTimeWindow":"PT1H","widgets":[{"id":"widget-1","title":"Tokens","kind":"metric_timeseries","layout":{"x":0,"y":0,"w":6,"h":4,"minW":3,"minH":2},"metric":{"metricName":"gen_ai.client.token.usage","aggregation":"sum","groupBy":["gen_ai.token.type"],"filters":[],"timeWindow":"PT1H","visualization":"line","legend":true,"maxSeries":20,"thresholds":[]}},{"id":"widget-2","title":"Recent logs","kind":"log_table","layout":{"x":6,"y":0,"w":6,"h":4},"logs":{"attributes":[],"sort":"timestamp_desc","limit":50,"columns":["timestamp","severity","service","trace_span","body"]}}]}',
      "delete:saved-dashboard",
      'pin:{"dashboardId":"saved-dashboard","pinned":true}',
      'reorder:{"dashboardIds":["saved-dashboard","dashboard-1"]}',
    ]);
  });

  test("resolves ingest API key list, create, and revoke through control-plane bridge", async () => {
    const calls: string[] = [];
    const controlBridge = {
      ...bridge(),
      async viewer() {
        return null;
      },
      async organizations() {
        return [];
      },
      async organization() {
        return null;
      },
      async projects() {
        return [];
      },
      async project() {
        return null;
      },
      async createProject() {
        throw new Error("unused");
      },
      async updateProject() {
        throw new Error("unused");
      },
      async selectProject() {
        throw new Error("unused");
      },
      async updateOrganizationMember() {
        throw new Error("unused");
      },
      async removeOrganizationMember() {
        return false;
      },
      async ingestCredentials(projectId: string) {
        calls.push(`list:${projectId}`);
        return { items: [ingestCredential()] };
      },
      async createIngestCredential(input: unknown) {
        calls.push(`create:${JSON.stringify(input)}`);
        return { credential: ingestCredential(), secret: "cgk_created_secret_1234567890" };
      },
      async revokeIngestCredential(id: string) {
        calls.push(`revoke:${id}`);
        return { ...ingestCredential(), revokedAt: "2026-05-14T09:00:00.000Z" };
      },
      async dashboards() {
        return { items: [], pinnedDashboardIds: [] };
      },
      async saveDashboard() {
        throw new Error("unused");
      },
      async deleteDashboard() {
        return false;
      },
      async setDashboardPinned() {
        throw new Error("unused");
      },
      async reorderDashboardPins() {
        throw new Error("unused");
      },
    };
    const { app } = createAppWithBridge(controlBridge, { graphqlUI: false });

    const listResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query IngestCredentials($projectId: ID!) { ingestCredentials(projectId: $projectId) { items { id title secretPreview revokedAt } } }`,
        variables: { projectId: "project-1" },
      }),
    });
    const createResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation CreateIngestCredential($input: CreateIngestCredentialInput!) {
            createIngestCredential(input: $input) {
              secret
              credential { id title secretPreview }
            }
          }
        `,
        variables: { input: { projectId: "project-1", title: "Checkout service" } },
      }),
    });
    const revokeResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `mutation RevokeIngestCredential($id: ID!) { revokeIngestCredential(id: $id) { id revokedAt secretPreview } }`,
        variables: { id: "credential-1" },
      }),
    });

    expect((await listResponse.json()).data.ingestCredentials.items[0]).toMatchObject({
      id: "credential-1",
      title: "Checkout service",
      secretPreview: "cgk_...1234",
      revokedAt: null,
    });
    expect((await createResponse.json()).data.createIngestCredential).toMatchObject({
      secret: "cgk_created_secret_1234567890",
      credential: { id: "credential-1", secretPreview: "cgk_...1234" },
    });
    expect((await revokeResponse.json()).data.revokeIngestCredential).toMatchObject({
      id: "credential-1",
      revokedAt: "2026-05-14T09:00:00.000Z",
      secretPreview: "cgk_...1234",
    });
    expect(calls).toEqual([
      "list:project-1",
      'create:{"projectId":"project-1","title":"Checkout service"}',
      "revoke:credential-1",
    ]);
  });
});

function bridge(
  overrides: Partial<TelemetryQueryBridge & MetricQueryBridge> = {},
): TelemetryQueryBridge & MetricQueryBridge {
  return {
    async searchTraces(_input: TraceSearchInput) {
      return { items: [], nextCursor: null };
    },
    async getTraceDetail(_traceId: string, _input: TraceDetailInput) {
      return traceDetail();
    },
    async searchLogs(_input: LogSearchInput) {
      return { items: [], nextCursor: null };
    },
    async telemetryFacets(_input: TelemetryFacetInput): Promise<TelemetryFacetResult> {
      return {
        services: [],
        operations: [],
        spanNames: [],
        severities: [],
        attributeKeys: [],
      };
    },
    async metricNames() {
      return { items: [] };
    },
    async metricSeries() {
      return metricSeriesResult();
    },
    async richMetricSeries() {
      return richMetricSeriesResult();
    },
    subscribeLiveTraces(_input: LiveTraceInput) {
      return liveEvents([]);
    },
    async health() {
      return "ok" as const;
    },
    async close() {},
    ...overrides,
  };
}

async function* liveEvents(events: LiveTraceEvent[]): AsyncIterableIterator<LiveTraceEvent> {
  for (const event of events) {
    yield event;
  }
}

function traceDetail(): TraceDetail {
  return {
    trace: {
      id: "trace-1",
      serviceName: "api",
      startedAt: "2026-05-08T10:00:00.000Z",
      startedAtUnixNano: "1778234400000000000",
      endedAt: "2026-05-08T10:00:01.000Z",
      endedAtUnixNano: "1778234401000000000",
      durationNano: "1000000000",
      durationMs: 1000,
      rootSpanId: "span-1",
      status: "error",
      attributes: {},
    },
    structure: {
      rootSpanIds: ["span-1"],
      orphanSpanIds: [],
      criticalPathSpanIds: ["span-1"],
      maxDepth: 0,
      serviceBreakdown: [],
    },
    spans: [
      {
        id: "span-1",
        traceId: "trace-1",
        parentSpanId: null,
        name: "POST /checkout",
        kind: "server",
        serviceName: "api",
        startedAt: "2026-05-08T10:00:00.000Z",
        startedAtUnixNano: "1778234400000000000",
        endedAt: "2026-05-08T10:00:01.000Z",
        endedAtUnixNano: "1778234401000000000",
        startOffsetNano: "0",
        durationNano: "1000000000",
        durationMs: 1000,
        status: "error",
        attributes: {},
        depth: 0,
        childCount: 0,
        hasError: true,
        isCriticalPath: true,
        isOrphan: false,
        isServiceEntry: true,
        exceptionCount: 0,
        events: [],
        links: [],
        exceptions: [],
      },
    ],
    selectedSpan: null,
    spanMatches: [],
    logs: [],
    relatedLogs: [],
    warnings: [],
  };
}

function metricSeriesResult() {
  return {
    metric: metricDescriptor("gen_ai.client.token.usage"),
    aggregation: "sum" as const,
    interval: "PT1M",
    groupBy: ["gen_ai.system", "gen_ai.request.model"],
    series: [
      {
        labels: { "gen_ai.system": "openai", "gen_ai.request.model": "gpt-5" },
        points: [
          {
            timestamp: "2026-05-14T08:01:00.000Z",
            value: 42,
            count: 1,
            exemplars: [
              {
                timestamp: "2026-05-14T08:01:00.000Z",
                value: 42,
                traceId: "trace-1",
                spanId: "span-1",
                attributes: {},
              },
            ],
          },
        ],
      },
    ],
    warnings: [],
  };
}

function richMetricSeriesResult() {
  return {
    interval: "PT1M",
    series: [
      {
        id: "error_rate",
        label: "Error rate",
        sourceId: "error_rate",
        unit: "1",
        labels: { service: "api" },
        points: [
          {
            timestamp: "2026-05-14T08:01:00.000Z",
            value: 0.05,
            count: 1,
            exemplars: [
              {
                timestamp: "2026-05-14T08:01:00.000Z",
                value: 0.05,
                traceId: "trace-1",
                spanId: "span-1",
                attributes: {},
              },
            ],
          },
        ],
      },
    ],
    displaySeries: [
      {
        id: "display_error_rate",
        label: "Error rate",
        sourceId: "error_rate",
        visible: true,
      },
    ],
    warnings: [],
  };
}

function metricDescriptor(name: string) {
  return {
    id: `metric:${name}`,
    tenantId: "tenant-1",
    projectId: "project-1",
    name,
    description: null,
    unit: "1",
    kind: "sum" as const,
    aggregationTemporality: "delta" as const,
    monotonic: true,
    attributeKeys: ["service.name", "gen_ai.system", "gen_ai.request.model", "gen_ai.token.type"],
    firstSeenAt: "2026-05-14T08:00:00.000Z",
    lastSeenAt: "2026-05-14T09:00:00.000Z",
  };
}

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    id: "dashboard-1",
    projectId: "project-1",
    slug: "genai-token-usage",
    name: "GenAI token usage",
    description: "Token usage by provider, model, and token type.",
    tags: ["genai"],
    version: 1,
    visibility: "personal" as const,
    defaultTimeWindow: "PT1H",
    pinned: true,
    widgets: [
      {
        id: "tokens",
        title: "Tokens",
        description: null,
        kind: "metric_timeseries" as const,
        layout: { x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
        metric: {
          metricName: "gen_ai.client.token.usage",
          aggregation: "sum" as const,
          groupBy: ["gen_ai.system", "gen_ai.request.model", "gen_ai.token.type"],
          filters: [],
          timeWindow: "PT1H",
          interval: "PT1M",
          visualization: "line" as const,
          legend: true,
          maxSeries: 20,
          thresholds: [],
        },
        logs: null,
        traces: null,
        liveTraces: null,
      },
    ],
    createdAt: "2026-05-14T08:00:00.000Z",
    updatedAt: "2026-05-14T08:00:00.000Z",
    createdBy: "user-1",
    updatedBy: null,
    ...overrides,
  };
}

function ingestCredential() {
  return {
    id: "credential-1",
    projectId: "project-1",
    title: "Checkout service",
    scopes: ["telemetry:ingest:traces", "telemetry:ingest:logs", "telemetry:ingest:metrics"],
    secretPreview: "cgk_...1234",
    createdAt: "2026-05-14T08:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    createdByUserId: "user-1",
  };
}
