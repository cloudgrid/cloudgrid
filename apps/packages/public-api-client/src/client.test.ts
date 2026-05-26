import { describe, expect, test } from "bun:test";
import * as api from ".";
import { createControlPlaneGraphQLClient } from ".";

describe("public API client exports", () => {
  test("exposes the stable CloudGrid client surface", () => {
    expect(Object.keys(api).sort()).toEqual([
      "CloudGridGraphQLError",
      "createControlPlaneGraphQLClient",
      "createTelemetryGraphQLClient",
      "isCloudGridProblemError",
    ]);
  });
});

describe("control-plane GraphQL client", () => {
  test("passes alert rule filters through the AlertRules operation variables", async () => {
    const fetchCalls: Request[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      fetchCalls.push(request);
      return Response.json({ data: { alertRules: [] } });
    }) as typeof fetch;

    try {
      const client = createControlPlaneGraphQLClient("https://cloudgrid.test/graphql");
      await client.getAlertRules("project-1", {
        enabled: true,
        severity: "CRITICAL",
        signal: "METRIC",
      });

      const body = await fetchCalls.at(0)?.json();
      expect(body).toMatchObject({
        operationName: "AlertRules",
        variables: {
          projectId: "project-1",
          input: {
            enabled: true,
            severity: "CRITICAL",
            signal: "METRIC",
          },
        },
      });
      expect(body.query).toContain(
        "query AlertRules($projectId: ID!, $input: AlertRuleSearchInput)",
      );
      expect(body.query).toContain("alertRules(projectId: $projectId, input: $input)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
