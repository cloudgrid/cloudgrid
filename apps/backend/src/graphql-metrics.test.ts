import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type { TraceSearchInput } from "@cloudgrid/ui-contracts";
import { createAppWithBridge, type GraphQLMetricRecord } from "./index";

describe("BFF GraphQL self-observability metrics", () => {
  test("records bounded GraphQL operation metrics without raw documents or sensitive labels", async () => {
    const records: GraphQLMetricRecord[] = [];
    const { app } = createAppWithBridge(
      {
        async searchTraces(_input: TraceSearchInput) {
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
          return (async function* emptyLiveEvents() {})();
        },
        async health() {
          return "ok" as const;
        },
        async close() {},
      },
      {
        graphqlUI: false,
        metricsRecorder: {
          record(record) {
            records.push(record);
          },
        },
      },
      createLogger("bff", { stdout: () => {}, stderr: () => {} }),
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: {
        authorization: "Bearer secret-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `query SensitiveTraceList($token: String) {
          traces(input: { query: $token, attributes: [{ key: "authorization", operator: eq, value: "project-secret" }] }) {
            items { id }
          }
        }`,
        variables: {
          token: "secret-token",
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(records).toHaveLength(2);
    expect(records).toContainEqual({
      metric: "cloudgrid.bff.graphql.operations",
      kind: "counter",
      value: 1,
      attributes: {
        operation_type: "query",
        operation_name: "traces",
        result: "success",
      },
    });
    expect(records.find((record) => record.kind === "histogram")).toMatchObject({
      metric: "cloudgrid.bff.graphql.duration",
      kind: "histogram",
      attributes: {
        operation_type: "query",
        operation_name: "traces",
        result: "success",
      },
    });
    expect(records.find((record) => record.kind === "histogram")?.value).toBeNumber();
    expect(JSON.stringify(records)).not.toContain("SensitiveTraceList");
    expect(JSON.stringify(records)).not.toContain("project-secret");
    expect(JSON.stringify(records)).not.toContain("secret-token");
    expect(JSON.stringify(records)).not.toContain("authorization");
  });

  test("does not let recorder failures change GraphQL results", async () => {
    const { app } = createAppWithBridge(
      {
        async searchTraces(_input: TraceSearchInput) {
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
          return (async function* emptyLiveEvents() {})();
        },
        async health() {
          return "ok" as const;
        },
        async close() {},
      },
      {
        graphqlUI: false,
        metricsRecorder: {
          record() {
            throw new Error("metrics unavailable");
          },
        },
      },
      createLogger("bff", { stdout: () => {}, stderr: () => {} }),
    );

    const response = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query { traces(input: {}) { items { id } } }`,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        traces: {
          items: [],
        },
      },
    });
  });
});
