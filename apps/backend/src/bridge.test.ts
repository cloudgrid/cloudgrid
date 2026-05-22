import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type { RetentionRuleInput } from "@cloudgrid/ui-contracts";
import { JSONCodec, type NatsConnection } from "nats";
import { localAuthContext } from "./auth";
import { MessageBridgeCloudGridBridge, NATSTelemetryQueryBridge } from "./bridge";
import { NATSRequestReplyClient } from "./bridge/adapters/nats";

describe("NATS telemetry query bridge", () => {
  test("injects W3C trace context as NATS request headers", async () => {
    const codec = JSONCodec<unknown>();
    let traceparent = "";
    let tracestate = "";
    const connection = {
      request: async (_subject: string, data: Uint8Array, options?: { headers?: Headers }) => {
        traceparent = options?.headers?.get("traceparent") ?? "";
        tracestate = options?.headers?.get("tracestate") ?? "";
        const payload = codec.decode(data);
        return { data: codec.encode(payload) };
      },
    } as unknown as NatsConnection;
    const client = new NATSRequestReplyClient(connection);

    await client.request("telemetry.traces.search", codec.encode({ requestId: "req-1" }), {
      timeoutMs: 2000,
      headers: {
        traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
        tracestate: "vendor=value",
      },
    });

    expect(traceparent).toBe("00-11111111111111111111111111111111-2222222222222222-01");
    expect(tracestate).toBe("vendor=value");
  });

  test("sends trace detail input as the telemetry.traces.get query", async () => {
    const codec = JSONCodec<unknown>();
    let subject = "";
    let payload: unknown;
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        subject = requestedSubject;
        payload = codec.decode(data);
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: traceDetail(),
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.getTraceDetail("trace-1", {
      selectedSpanId: "span-1",
      relatedLogLimit: 10,
      attributes: [{ key: "http.status_code", operator: "gte", value: 500 }],
    });

    expect(subject).toBe("telemetry.traces.get");
    expect(payload).toMatchObject({
      traceId: "trace-1",
      query: {
        selectedSpanId: "span-1",
        relatedLogLimit: 10,
        attributes: [{ key: "http.status_code", operator: "gte", value: 500 }],
      },
    });
  });

  test("rejects trace search responses that violate the public non-null GraphQL contract", async () => {
    const codec = JSONCodec<unknown>();
    const connection = {
      request: async (_requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data);
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: {
              items: [
                {
                  id: "trace-1",
                  serviceName: "api",
                  startedAt: "2026-05-08T10:00:00.000Z",
                  attributes: {},
                  spanCount: 1,
                  errorSpanCount: 0,
                  logCount: 0,
                  serviceCount: 1,
                },
              ],
              nextCursor: null,
            },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await expect(bridge.searchTraces({})).rejects.toThrow("Message bridge is unavailable");
  });

  test("sends telemetry facet requests to telemetry.facets", async () => {
    const codec = JSONCodec<unknown>();
    let subject = "";
    let payload: unknown;
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        subject = requestedSubject;
        payload = codec.decode(data);
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: {
              services: [],
              operations: [],
              spanNames: [],
              severities: [],
              attributeKeys: [],
            },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.telemetryFacets({ service: "api", search: "checkout", limit: 25 });

    expect(subject).toBe("telemetry.facets");
    expect(payload).toMatchObject({
      query: {
        service: "api",
        search: "checkout",
        limit: 25,
      },
    });
  });

  test("sends metric name, series, and rich series requests to storage-read metric subjects", async () => {
    const codec = JSONCodec<unknown>();
    const requests: Array<{ subject: string; payload: unknown }> = [];
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data) as { subscriptionId?: string };
        requests.push({ subject: requestedSubject, payload });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data:
              requestedSubject === "telemetry.metrics.names"
                ? { items: [] }
                : requestedSubject === "telemetry.metrics.rich_query"
                  ? {
                      interval: "PT1M",
                      series: [],
                      displaySeries: [],
                      warnings: [],
                    }
                  : {
                      metric: metricDescriptor("gen_ai.client.token.usage"),
                      aggregation: "sum",
                      interval: "PT1M",
                      groupBy: ["gen_ai.system"],
                      series: [],
                      warnings: [],
                    },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.metricNames({ query: "token", sort: "name_desc", limit: 10 });
    await bridge.metricSeries({
      metricName: "gen_ai.client.token.usage",
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z",
      aggregation: "sum",
      groupBy: ["gen_ai.system"],
      sort: "value_desc",
      limit: 100,
    });
    await bridge.richMetricSeries({
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z",
      query: {
        interval: "PT1M",
        queries: [
          {
            id: "total",
            label: "Total",
            metricName: "gen_ai.client.token.usage",
            aggregation: "sum",
            maxSeries: 20,
          },
        ],
        formulas: [],
        displaySeries: [],
      },
    });

    expect(requests).toMatchObject([
      {
        subject: "telemetry.metrics.names",
        payload: { input: { query: "token", sort: "name_desc", limit: 10 } },
      },
      {
        subject: "telemetry.metrics.query",
        payload: {
          input: {
            metricName: "gen_ai.client.token.usage",
            from: "2026-05-14T08:00:00.000Z",
            to: "2026-05-14T09:00:00.000Z",
            aggregation: "sum",
            groupBy: ["gen_ai.system"],
            sort: "value_desc",
            limit: 100,
          },
        },
      },
      {
        subject: "telemetry.metrics.rich_query",
        payload: {
          input: {
            from: "2026-05-14T08:00:00.000Z",
            to: "2026-05-14T09:00:00.000Z",
            query: {
              interval: "PT1M",
              queries: [
                {
                  id: "total",
                  label: "Total",
                  metricName: "gen_ai.client.token.usage",
                  aggregation: "sum",
                  maxSeries: 20,
                },
              ],
              formulas: [],
              displaySeries: [],
            },
          },
        },
      },
    ]);
  });

  test("emits AsyncAPI top-level request payload shapes for telemetry subject families", async () => {
    const codec = JSONCodec<unknown>();
    const requests: Array<{ subject: string; payload: Record<string, unknown> }> = [];
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data) as Record<string, unknown>;
        requests.push({ subject: requestedSubject, payload });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: responseForTelemetrySubject(requestedSubject),
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.searchTraces({ service: "api", limit: 10 }, localAuthContext());
    await bridge.getTraceDetail(
      "trace-1",
      { selectedSpanId: "span-1", relatedLogLimit: 10 },
      localAuthContext(),
    );
    await bridge.searchLogs({ service: "api", limit: 10 }, localAuthContext());
    await bridge.telemetryFacets({ service: "api", limit: 25 }, localAuthContext());
    await bridge.metricNames({ query: "token", limit: 10 }, localAuthContext());
    await bridge.metricSeries(
      {
        metricName: "gen_ai.client.token.usage",
        from: "2026-05-14T08:00:00.000Z",
        to: "2026-05-14T09:00:00.000Z",
        aggregation: "sum",
      },
      localAuthContext(),
    );
    await bridge.richMetricSeries(
      {
        from: "2026-05-14T08:00:00.000Z",
        to: "2026-05-14T09:00:00.000Z",
        query: { interval: "PT1M", queries: [], formulas: [], displaySeries: [] },
      },
      localAuthContext(),
    );

    expect(payloadKeysBySubject(requests)).toEqual({
      "telemetry.facets": ["authContext", "issuedAt", "query", "requestId"],
      "telemetry.logs.search": ["authContext", "issuedAt", "query", "requestId"],
      "telemetry.metrics.names": ["authContext", "input", "issuedAt", "requestId"],
      "telemetry.metrics.query": ["authContext", "input", "issuedAt", "requestId"],
      "telemetry.metrics.rich_query": ["authContext", "input", "issuedAt", "requestId"],
      "telemetry.traces.get": ["authContext", "issuedAt", "query", "requestId", "traceId"],
      "telemetry.traces.search": ["authContext", "issuedAt", "query", "requestId"],
    });
  });

  test("sends dashboard queries and mutations to control-plane dashboard subjects", async () => {
    const codec = JSONCodec<unknown>();
    const requests: Array<{ subject: string; payload: unknown }> = [];
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data);
        requests.push({ subject: requestedSubject, payload });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data:
              requestedSubject === "control.dashboards.delete"
                ? { deleted: true }
                : requestedSubject === "control.dashboards.list"
                  ? { items: [], pinnedDashboardIds: ["dashboard-1"] }
                  : requestedSubject === "control.dashboard_pins.set" ||
                      requestedSubject === "control.dashboard_pins.reorder"
                    ? {
                        projectId: "project-1",
                        pinnedDashboardIds: ["dashboard-1"],
                        updatedAt: "2026-05-14T08:00:00.000Z",
                      }
                    : { dashboard: dashboard() },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.dashboards({ includeBuiltins: true, query: "token", pinnedOnly: false });
    await bridge.saveDashboard({
      name: "Token usage",
      tags: ["genai"],
      visibility: "personal",
      widgets: [
        {
          id: "widget-1",
          title: "Tokens",
          kind: "metric_timeseries",
          layout: { x: 0, y: 0, w: 6, h: 4 },
          metric: {
            metricName: "gen_ai.client.token.usage",
            aggregation: "sum",
            visualization: "line",
          },
        },
      ],
    });
    await bridge.deleteDashboard("dashboard-1");
    await bridge.setDashboardPinned({ dashboardId: "dashboard-1", pinned: true });
    await bridge.reorderDashboardPins({ dashboardIds: ["dashboard-1"] });

    expect(requests.map((request) => request.subject)).toEqual([
      "control.dashboards.list",
      "control.dashboards.save",
      "control.dashboards.delete",
      "control.dashboard_pins.set",
      "control.dashboard_pins.reorder",
    ]);
    expect(requests[0]?.payload).toMatchObject({
      input: { includeBuiltins: true, query: "token", pinnedOnly: false },
    });
    expect(requests[1]?.payload).toMatchObject({
      input: {
        name: "Token usage",
        tags: ["genai"],
        visibility: "personal",
        widgets: [{ id: "widget-1", kind: "metric_timeseries" }],
      },
    });
    expect(requests[2]?.payload).toMatchObject({ dashboardId: "dashboard-1" });
    expect(requests[3]?.payload).toMatchObject({ dashboardId: "dashboard-1", pinned: true });
    expect(requests[4]?.payload).toMatchObject({ dashboardIds: ["dashboard-1"] });
  });

  test("normalizes dashboard rich metric response arrays omitted by Go bridge JSON", async () => {
    const codec = JSONCodec<unknown>();
    const connection = {
      request: async (_requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data);
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: {
              dashboard: {
                ...dashboard(),
                widgets: [
                  {
                    id: "widget-rich",
                    title: "Latency comparison",
                    kind: "metric_rich",
                    layout: { x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
                    richMetric: {
                      query: {
                        timeWindow: "PT1H",
                        interval: "PT1M",
                        queries: [
                          {
                            id: "a",
                            label: "Latency",
                            metricName: "http.server.request.duration",
                            aggregation: "p95",
                            maxSeries: 20,
                          },
                        ],
                      },
                      visualization: "line",
                      legend: true,
                      maxSeries: 20,
                    },
                  },
                ],
              },
            },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    const saved = await bridge.saveDashboard({
      name: "Latency comparison",
      widgets: [],
    });

    expect(saved.widgets[0]?.richMetric?.query.queries[0]?.groupBy).toEqual([]);
    expect(saved.widgets[0]?.richMetric?.query.queries[0]?.filters).toEqual([]);
    expect(saved.widgets[0]?.richMetric?.query.formulas).toEqual([]);
    expect(saved.widgets[0]?.richMetric?.query.displaySeries).toEqual([]);
    expect(saved.widgets[0]?.richMetric?.thresholds).toEqual([]);
  });

  test("normalizes lean dataset create responses to the public GraphQL dataset shape", async () => {
    const codec = JSONCodec<unknown>();
    let subject = "";
    let payload: unknown;
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        subject = requestedSubject;
        payload = codec.decode(data);
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: {
              id: "dataset-1",
              name: "Regression",
              description: null,
              version: 1,
              createdAt: "2026-05-17T10:00:00.000Z",
              itemCount: 0,
              health: null,
              tags: null,
            },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    const dataset = await bridge.createDataset({ name: "Regression", tags: ["nightly"] });

    expect(subject).toBe("eval.dataset.create");
    expect(payload).toMatchObject({
      input: { name: "Regression", tags: ["nightly"] },
    });
    expect(dataset).toMatchObject({
      id: "dataset-1",
      name: "Regression",
      itemCount: 0,
      reviewedItemCount: 0,
      splitCounts: {},
      tags: [],
      health: {
        status: "needs_review",
        reviewedItemCount: 0,
        totalItemCount: 0,
        splitCounts: {},
        warnings: [],
      },
    });
  });

  test("normalizes lean experiment create responses to the public GraphQL experiment shape", async () => {
    const codec = JSONCodec<unknown>();
    let subject = "";
    let payload: unknown;
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        subject = requestedSubject;
        payload = codec.decode(data);
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: {
              id: "experiment-1",
              name: "Regression",
              datasetId: "dataset-1",
              datasetVersion: 1,
              scorerIds: ["scorer-1"],
              createdAt: "2026-05-17T10:00:00.000Z",
              tags: null,
            },
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    const experiment = await bridge.createExperiment({
      name: "Regression",
      datasetId: "dataset-1",
      datasetVersion: 1,
      scorerIds: ["scorer-1"],
      solverRef: { kind: "agent", name: "integration" },
    });

    expect(subject).toBe("eval.experiment.create");
    expect(payload).toMatchObject({
      input: {
        name: "Regression",
        datasetId: "dataset-1",
        scorerIds: ["scorer-1"],
      },
    });
    expect(experiment).toMatchObject({
      id: "experiment-1",
      splitSelector: {
        splits: ["validation"],
        reviewedOnly: true,
        includeSynthetic: false,
      },
      promptVersionRefs: [],
      skillSnapshotRefs: [],
      toolSnapshotRefs: [],
      providerProfileRefs: [],
      tags: [],
    });
  });

  test("sends project membership, retention, and alerting requests to control-plane subjects", async () => {
    const codec = JSONCodec<unknown>();
    const requests: Array<{ subject: string; payload: unknown }> = [];
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data);
        requests.push({ subject: requestedSubject, payload });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: controlResponseFor(requestedSubject),
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.projectMembers("project-1");
    await bridge.updateProjectMember("project-1", "user-1", "editor");
    await bridge.removeProjectMember("project-1", "user-1");
    await bridge.retentionPolicy("project-1");
    await bridge.updateRetentionPolicy({
      projectId: "project-1",
      expectedVersion: 1,
      rules: retentionRules(),
    });
    await bridge.alertRules("project-1", {
      search: "latency",
      severity: "WARNING",
      signal: "TRACE",
      enabled: true,
      sort: "updatedAt_desc",
    });
    await bridge.createAlertRule(alertRuleInput());
    await bridge.updateAlertRule({ id: "rule-1", enabled: false, expectedVersion: 1 });
    await bridge.deleteAlertRule("rule-1");
    await bridge.alertSilences("project-1", "rule-1");
    await bridge.createAlertSilence({
      projectId: "project-1",
      ruleId: "rule-1",
      reason: "maintenance",
      startsAt: "2026-05-14T08:00:00.000Z",
      endsAt: "2026-05-14T09:00:00.000Z",
    });
    await bridge.deleteAlertSilence("silence-1");
    await bridge.alertHistory("project-1", "rule-1", 25, "cursor-1");
    await bridge.alertSummary("project-1", {
      states: ["FIRING"],
      severities: ["ERROR"],
      signals: ["TRACE"],
      timeWindow: "PT1H",
      limit: 20,
    });

    expect(requests.map((request) => request.subject)).toEqual([
      "control.project_members.list",
      "control.project_members.update",
      "control.project_members.remove",
      "control.retention.get",
      "control.retention.update",
      "control.alert_rules.list",
      "control.alert_rules.create",
      "control.alert_rules.update",
      "control.alert_rules.delete",
      "control.alert_silences.list",
      "control.alert_silences.create",
      "control.alert_silences.delete",
      "control.alert_history.list",
      "control.alert_summary.get",
    ]);
    expect(requests[0]?.payload).toMatchObject({ projectId: "project-1" });
    expect(requests[1]?.payload).toMatchObject({
      projectId: "project-1",
      userId: "user-1",
      role: "editor",
    });
    expect(requests[4]?.payload).toMatchObject({ projectId: "project-1", expectedVersion: 1 });
    expect(requests[5]?.payload).toMatchObject({
      projectId: "project-1",
      input: {
        search: "latency",
        severity: "WARNING",
        signal: "TRACE",
        enabled: true,
        sort: "updatedAt_desc",
      },
    });
    expect(requests[6]?.payload).toMatchObject({ input: { projectId: "project-1" } });
    expect(requests[12]?.payload).toMatchObject({
      projectId: "project-1",
      ruleId: "rule-1",
      first: 25,
      after: "cursor-1",
    });
    expect(requests[13]?.payload).toMatchObject({
      projectId: "project-1",
      input: {
        states: ["FIRING"],
        severities: ["ERROR"],
        signals: ["TRACE"],
        timeWindow: "PT1H",
        limit: 20,
      },
    });
  });

  test("sends organization member and invitation requests to control-plane subjects", async () => {
    const codec = JSONCodec<unknown>();
    const requests: Array<{ subject: string; payload: unknown }> = [];
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data);
        requests.push({ subject: requestedSubject, payload });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: controlResponseFor(requestedSubject),
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.organizationMembers("org-1", {
      mode: "authenticated",
      authMode: "sso",
      principalId: "user-1",
      principalEmail: "admin@example.test",
      principalEmailVerified: true,
    });
    await bridge.organizationInvitations("org-1", { mode: "authenticated", authMode: "sso" });
    await bridge.inviteOrganizationMember(
      { organizationId: "org-1", email: "ada@example.test" },
      { mode: "authenticated", authMode: "sso" },
    );
    await bridge.inviteProjectMember(
      { projectId: "project-1", email: "grace@example.test", role: "editor" },
      { mode: "authenticated", authMode: "sso" },
    );
    await bridge.resendOrganizationInvitation("invite-1", {
      mode: "authenticated",
      authMode: "sso",
    });
    await bridge.revokeOrganizationInvitation("invite-1", {
      mode: "authenticated",
      authMode: "sso",
    });

    expect(requests.map((request) => request.subject)).toEqual([
      "control.members.list",
      "control.invitations.list",
      "control.invitations.create",
      "control.project_invitations.create",
      "control.invitations.resend",
      "control.invitations.revoke",
    ]);
    expect(requests[0]?.payload).toMatchObject({
      organizationId: "org-1",
      authContext: {
        principalId: "user-1",
        principalEmail: "admin@example.test",
        principalEmailVerified: true,
      },
    });
    expect(requests[1]?.payload).toMatchObject({ organizationId: "org-1" });
    expect(requests[2]?.payload).toMatchObject({
      organizationId: "org-1",
      email: "ada@example.test",
    });
    expect(requests[3]?.payload).toMatchObject({
      projectId: "project-1",
      email: "grace@example.test",
      role: "editor",
    });
    expect(requests[4]?.payload).toMatchObject({ invitationId: "invite-1" });
    expect(requests[5]?.payload).toMatchObject({ invitationId: "invite-1" });
  });

  test("sends AI provider and AI Chat control requests using AsyncAPI top-level payload fields", async () => {
    const codec = JSONCodec<unknown>();
    const requests: Array<{ subject: string; payload: unknown }> = [];
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        const payload = codec.decode(data);
        requests.push({ subject: requestedSubject, payload });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: aiControlResponseFor(requestedSubject),
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));
    const authContext = {
      mode: "authenticated" as const,
      authMode: "sso" as const,
      principalId: "user-1",
    };

    await bridge.updateProjectAiProviderSettings(
      {
        projectId: "project-1",
        providerProfiles: [],
        modelAliases: [],
        expectedVersion: 1,
      },
      authContext,
    );
    await bridge.updateCompanyAiProviderSettings(
      {
        companyId: "org-1",
        providerProfile: aiProviderProfile("company"),
        chatModelAlias: {
          id: "company-chat",
          name: "chat",
          providerProfileId: "provider-1",
          model: "gpt-4.1-mini",
          purpose: "chat",
          parameters: {},
        },
        expectedVersion: 1,
      },
      authContext,
    );
    await bridge.aiChatHistory(
      { companyId: "org-1", projectId: "project-1", first: 10 },
      authContext,
    );
    await bridge.resolveAiProviderSecret("managed:company/org-1/provider-1", authContext);
    await bridge.createAiChatConversation(
      {
        companyId: "org-1",
        projectId: "project-1",
        firstUserMessage: "Investigate errors",
      },
      authContext,
    );
    await bridge.deleteAiChatConversation("chat-1", authContext);
    await bridge.approveAiChatAction(
      {
        actionProposalId: "action-1",
        idempotencyKey: "approval-key-1",
        approved: true,
        expectedVersion: 1,
      },
      authContext,
    );

    expect(requests.map((request) => request.subject)).toEqual([
      "control.ai_providers.project.update",
      "control.ai_providers.company.update",
      "control.ai_chat.history",
      "control.ai_provider_secrets.resolve",
      "control.ai_chat.conversation.create",
      "control.ai_chat.conversation.delete",
      "control.ai_chat.action.approve",
    ]);
    expect(requests[0]?.payload).toMatchObject({
      projectId: "project-1",
      providerProfiles: [],
      modelAliases: [],
      expectedVersion: 1,
    });
    expect(requests[0]?.payload).not.toHaveProperty("input");
    expect(requests[1]?.payload).toMatchObject({
      companyId: "org-1",
      providerProfile: { id: "provider-1" },
      chatModelAlias: { id: "company-chat" },
      expectedVersion: 1,
    });
    expect(requests[1]?.payload).not.toHaveProperty("input");
    expect(requests[2]?.payload).toMatchObject({
      companyId: "org-1",
      userId: "user-1",
      projectId: "project-1",
      first: 10,
    });
    expect(requests[2]?.payload).not.toHaveProperty("input");
    expect(requests[3]?.payload).toMatchObject({
      credentialRef: "managed:company/org-1/provider-1",
    });
    expect(requests[3]?.payload).not.toHaveProperty("input");
    expect(requests[4]?.payload).toMatchObject({
      companyId: "org-1",
      projectId: "project-1",
      userId: "user-1",
      firstUserMessage: "Investigate errors",
    });
    expect(requests[4]?.payload).not.toHaveProperty("input");
    expect(requests[5]?.payload).toMatchObject({
      conversationId: "chat-1",
      userId: "user-1",
    });
    expect(requests[5]?.payload).not.toHaveProperty("input");
    expect(requests[6]?.payload).toMatchObject({
      actionProposalId: "action-1",
      idempotencyKey: "approval-key-1",
      approved: true,
      userId: "user-1",
      expectedVersion: 1,
    });
    expect(requests[6]?.payload).not.toHaveProperty("input");
  });

  test("uses the durable local principal for AI Chat conversation create requests", async () => {
    const codec = JSONCodec<unknown>();
    let payload: unknown;
    const connection = {
      request: async (_requestedSubject: string, data: Uint8Array) => {
        payload = codec.decode(data);
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: aiControlResponseFor("control.ai_chat.conversation.create"),
          }),
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"));

    await bridge.createAiChatConversation(
      {
        companyId: "local",
        projectId: "default",
        firstUserMessage: "Investigate errors",
      },
      localAuthContext(),
    );

    expect(payload).toMatchObject({
      companyId: "local",
      projectId: "default",
      userId: "local-user",
      firstUserMessage: "Investigate errors",
    });
  });

  test("starts live traces through storage-read and stops on iterator return", async () => {
    const codec = JSONCodec<unknown>();
    const requestedSubjects: string[] = [];
    const subscriptions: string[] = [];
    const publishedEvents: Uint8Array[] = [
      codec.encode({
        subscriptionId: "sub-1",
        type: "added",
        seq: 1,
        receivedAt: "2026-05-10T10:00:00.000Z",
        trace: {
          id: "trace-1",
          serviceName: "api",
          startedAt: "2026-05-10T09:59:59.000Z",
          attributes: {},
          spanCount: 1,
          errorSpanCount: 0,
          logCount: 0,
          serviceCount: 1,
        },
      }),
    ];
    const connection = {
      request: async (requestedSubject: string, data: Uint8Array) => {
        requestedSubjects.push(requestedSubject);
        const payload = codec.decode(data);
        if (requestedSubject === "telemetry.traces.live.start") {
          expect(payload).toMatchObject({
            subscriptionId: "sub-1",
            sinkSubject: "telemetry.traces.live.events.bff-test.sub-1",
            query: { service: "api", limit: 10 },
          });
          return {
            data: codec.encode({
              requestId: requestId(payload),
              ok: true,
              data: { subscriptionId: "sub-1", heartbeatIntervalMs: 15000 },
            }),
          };
        }
        expect(requestedSubject).toBe("telemetry.traces.live.stop");
        expect(payload).toMatchObject({ subscriptionId: "sub-1" });
        return {
          data: codec.encode({
            requestId: requestId(payload),
            ok: true,
            data: { subscriptionId: "sub-1" },
          }),
        };
      },
      subscribe: (subject: string) => {
        subscriptions.push(subject);
        return {
          unsubscribe() {},
          async *[Symbol.asyncIterator]() {
            for (const data of publishedEvents) {
              yield { data };
            }
          },
        };
      },
      drain: async () => {},
    } as unknown as NatsConnection;
    const bridge = new NATSTelemetryQueryBridge(connection, 2000, createLogger("bff"), {
      bffInstanceId: "bff-test",
      subscriptionId: () => "sub-1",
    });

    const iterator = bridge.subscribeLiveTraces({ service: "api", limit: 10 });
    const first = await iterator.next();
    await iterator.return?.();

    expect(first.value).toMatchObject({
      type: "added",
      seq: 1,
      trace: { id: "trace-1", spanCount: 1 },
    });
    expect(subscriptions).toEqual(["telemetry.traces.live.events.bff-test.sub-1"]);
    expect(requestedSubjects).toEqual([
      "telemetry.traces.live.start",
      "telemetry.traces.live.stop",
    ]);
  });

  test("closes live trace subscriptions when no sink event arrives before the watchdog deadline", async () => {
    const codec = JSONCodec<unknown>();
    const requestedSubjects: string[] = [];
    const requestReply = {
      async request(subject: string, data: Uint8Array) {
        requestedSubjects.push(subject);
        const payload = codec.decode(data) as { subscriptionId?: string };
        return codec.encode({
          requestId: requestId(payload),
          ok: true,
          data:
            subject === "telemetry.traces.live.start"
              ? { subscriptionId: "sub-1", heartbeatIntervalMs: 15_000 }
              : { subscriptionId: "sub-1" },
        });
      },
    };
    const pubSub = {
      async subscribe() {
        return {
          async [Symbol.asyncDispose]() {},
        };
      },
      async publish() {},
    };
    const bridge = new MessageBridgeCloudGridBridge(requestReply, 2000, createLogger("bff"), {
      pubSub,
      bffInstanceId: "bff-test",
      subscriptionId: () => "sub-1",
      liveTraceWatchdogMs: 10,
    });

    const iterator = bridge.subscribeLiveTraces({ service: "api", limit: 10 });
    const result = await Promise.race([
      iterator.next().then(
        () => "resolved",
        (error) => error,
      ),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 80)),
    ]);
    if (result !== "timeout") {
      await iterator.return?.();
    }

    expect(result).not.toBe("timeout");
    expect(result).toBeInstanceOf(Error);
    expect(requestedSubjects).toEqual([
      "telemetry.traces.live.start",
      "telemetry.traces.live.stop",
    ]);
  });

  test("cancels live trace subscriptions immediately while waiting for sink events", async () => {
    const codec = JSONCodec<unknown>();
    const requestedSubjects: string[] = [];
    const requestReply = {
      async request(subject: string, data: Uint8Array) {
        requestedSubjects.push(subject);
        const payload = codec.decode(data) as { subscriptionId?: string };
        return codec.encode({
          requestId: requestId(payload),
          ok: true,
          data:
            subject === "telemetry.traces.live.start"
              ? { subscriptionId: "sub-1", heartbeatIntervalMs: 15_000 }
              : { subscriptionId: "sub-1" },
        });
      },
    };
    const pubSub = {
      async subscribe() {
        return {
          async [Symbol.asyncDispose]() {},
        };
      },
      async publish() {},
    };
    const bridge = new MessageBridgeCloudGridBridge(requestReply, 2000, createLogger("bff"), {
      pubSub,
      bffInstanceId: "bff-test",
      subscriptionId: () => "sub-1",
      liveTraceWatchdogMs: 10_000,
    });

    const iterator = bridge.subscribeLiveTraces({ service: "api", limit: 10 });
    const pending = iterator.next();
    await waitUntil(() => requestedSubjects.includes("telemetry.traces.live.start"), 80);

    const result = await Promise.race([
      iterator.return?.().then(() => "cancelled"),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 80)),
    ]);
    await pending;

    expect(result).toBe("cancelled");
    expect(requestedSubjects).toEqual([
      "telemetry.traces.live.start",
      "telemetry.traces.live.stop",
    ]);
  });

  test("uses the default crypto subscription id generator without binding errors", async () => {
    const codec = JSONCodec<unknown>();
    const requestedSubjects: string[] = [];
    let sinkSubject = "";
    const requestReply = {
      async request(subject: string, data: Uint8Array) {
        requestedSubjects.push(subject);
        const payload = codec.decode(data) as { subscriptionId?: string };
        return codec.encode({
          requestId: requestId(payload),
          ok: true,
          data: { subscriptionId: payload.subscriptionId ?? "stopped", heartbeatIntervalMs: 15000 },
        });
      },
    };
    const pubSub = {
      async subscribe(
        subject: string,
        onMessage: (message: { subject: string; data: Uint8Array }) => void,
      ) {
        sinkSubject = subject;
        queueMicrotask(() =>
          onMessage({
            subject,
            data: codec.encode({
              type: "heartbeat",
              seq: 1,
              receivedAt: "2026-05-17T10:00:00.000Z",
              trace: null,
            }),
          }),
        );
        return {
          async [Symbol.asyncDispose]() {},
        };
      },
      async publish() {},
    };
    const bridge = new MessageBridgeCloudGridBridge(requestReply, 2000, createLogger("bff"), {
      pubSub,
      bffInstanceId: "bff-test",
      liveTraceWatchdogMs: 1000,
    });

    const iterator = bridge.subscribeLiveTraces({ service: "api", limit: 10 });
    const first = await iterator.next();
    await iterator.return?.();

    expect(first.value).toMatchObject({ type: "heartbeat", seq: 1 });
    expect(sinkSubject).toMatch(/^telemetry\.traces\.live\.events\.bff-test\.[0-9a-f-]+$/);
    expect(requestedSubjects).toEqual([
      "telemetry.traces.live.start",
      "telemetry.traces.live.stop",
    ]);
  });
});

function requestId(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "requestId" in payload &&
    typeof payload.requestId === "string"
  ) {
    return payload.requestId;
  }
  return "request-1";
}

function payloadKeysBySubject(
  requests: Array<{ subject: string; payload: Record<string, unknown> }>,
) {
  return Object.fromEntries(
    requests.map(({ subject, payload }) => [subject, Object.keys(payload).sort()]),
  );
}

function responseForTelemetrySubject(subject: string) {
  if (subject === "telemetry.traces.search") {
    return { items: [], nextCursor: null };
  }
  if (subject === "telemetry.traces.get") {
    return traceDetail();
  }
  if (subject === "telemetry.logs.search") {
    return { items: [], nextCursor: null };
  }
  if (subject === "telemetry.facets") {
    return {
      services: [],
      operations: [],
      spanNames: [],
      severities: [],
      attributeKeys: [],
    };
  }
  if (subject === "telemetry.metrics.names") {
    return { items: [] };
  }
  if (subject === "telemetry.metrics.rich_query") {
    return { interval: "PT1M", series: [], displaySeries: [], warnings: [] };
  }
  return {
    metric: metricDescriptor("gen_ai.client.token.usage"),
    aggregation: "sum",
    interval: "PT1M",
    groupBy: [],
    series: [],
    warnings: [],
  };
}

async function waitUntil(predicate: () => boolean, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("condition was not met before timeout");
}

function traceDetail() {
  return {
    trace: {
      id: "trace-1",
      startedAt: "2026-05-08T10:00:00.000Z",
      attributes: {},
    },
    structure: {
      rootSpanIds: [],
      orphanSpanIds: [],
      criticalPathSpanIds: [],
      maxDepth: 0,
      serviceBreakdown: [],
    },
    spans: [],
    spanMatches: [],
    logs: [],
    relatedLogs: [],
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
    kind: "sum",
    aggregationTemporality: "delta",
    monotonic: true,
    attributeKeys: ["gen_ai.system"],
    firstSeenAt: "2026-05-14T08:00:00.000Z",
    lastSeenAt: "2026-05-14T09:00:00.000Z",
  };
}

function dashboard() {
  return {
    id: "dashboard-1",
    projectId: "project-1",
    slug: "token-usage",
    name: "Token usage",
    description: null,
    tags: ["genai"],
    version: 1,
    visibility: "personal",
    defaultTimeWindow: "PT1H",
    pinned: true,
    widgets: [],
    createdAt: "2026-05-14T08:00:00.000Z",
    updatedAt: "2026-05-14T08:00:00.000Z",
    createdBy: "user-1",
    updatedBy: "user-1",
  };
}

function controlResponseFor(subject: string) {
  switch (subject) {
    case "control.project_members.list":
      return { items: [projectMember()] };
    case "control.project_members.update":
      return { member: projectMember({ role: "editor", effectiveRole: "editor" }) };
    case "control.project_members.remove":
      return { removed: true };
    case "control.members.list":
      return { items: [{ user: { id: "user-1" }, role: "admin" }] };
    case "control.invitations.list":
      return { items: [organizationInvitation()] };
    case "control.invitations.create":
    case "control.invitations.resend":
    case "control.invitations.revoke":
      return { invitation: organizationInvitation() };
    case "control.project_invitations.create":
      return {
        outcome: "invitation_pending",
        invitation: organizationInvitation({
          email: "grace@example.test",
          projectGrants: [
            {
              projectId: "project-1",
              role: "editor",
              status: "pending",
              createdAt: "2026-05-16T09:00:00.000Z",
              createdByUserId: "admin-1",
              appliedAt: null,
            },
          ],
        }),
        projectMember: null,
      };
    case "control.retention.get":
    case "control.retention.update":
      return { policy: retentionPolicy() };
    case "control.alert_rules.list":
      return { items: [alertRule()] };
    case "control.alert_rules.create":
    case "control.alert_rules.update":
      return { rule: alertRule() };
    case "control.alert_rules.delete":
    case "control.alert_silences.delete":
      return { deleted: true };
    case "control.alert_silences.list":
      return { items: [alertSilence()] };
    case "control.alert_silences.create":
      return { silence: alertSilence() };
    case "control.alert_history.list":
      return { connection: alertHistory() };
    case "control.alert_summary.get":
      return { summary: alertSummary() };
    default:
      throw new Error(`unexpected subject ${subject}`);
  }
}

function aiControlResponseFor(subject: string) {
  switch (subject) {
    case "control.ai_providers.project.update":
      return { settings: projectAiProviderSettings() };
    case "control.ai_providers.company.update":
      return { settings: companyAiProviderSettings() };
    case "control.ai_chat.history":
      return {
        history: {
          companyId: "org-1",
          userId: "user-1",
          projectGroups: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    case "control.ai_provider_secrets.resolve":
      return { credential: { credentialRef: "managed:company/org-1/provider-1", value: "secret" } };
    case "control.ai_chat.conversation.create":
      return { conversation: aiChatConversation() };
    case "control.ai_chat.conversation.delete":
      return { deleted: true };
    case "control.ai_chat.action.approve":
      return { action: aiChatActionProposal("approved") };
    default:
      throw new Error(`unexpected AI control subject ${subject}`);
  }
}

function aiProviderProfile(scope: "project" | "company") {
  const providerKind = "openai" as const;
  void scope;
  return {
    id: "provider-1",
    label: "OpenAI",
    providerKind,
    credentialRef: "env:OPENAI_API_KEY",
    models: { chat: ["gpt-4.1-mini"] },
  };
}

function projectAiProviderSettings() {
  return {
    projectId: "project-1",
    providerProfiles: [],
    modelAliases: [],
    effective: {
      enabled: false,
      warnings: [],
      missingCredentialRefs: [],
      disabledProviderProfiles: [],
      missingAliasPurposes: [],
      runtimeSource: "stored",
    },
    version: 2,
    updatedAt: "2026-05-18T08:00:00.000Z",
    updatedByUserId: "user-1",
  };
}

function companyAiProviderSettings() {
  return {
    companyId: "org-1",
    chatProviderProfile: aiProviderProfile("company"),
    effective: {
      enabled: true,
      warnings: [],
      missingCredentialRefs: [],
      disabledProviderProfiles: [],
      runtimeSource: "stored",
    },
    version: 2,
    updatedAt: "2026-05-18T08:00:00.000Z",
    updatedByUserId: "user-1",
  };
}

function aiChatConversation() {
  return {
    id: "chat-1",
    companyId: "org-1",
    projectId: "project-1",
    userId: "user-1",
    title: "Investigate errors",
    status: "active",
    lastMessageAt: "2026-05-18T08:00:00.000Z",
    lastRunStatus: "idle",
    messages: [],
    runs: [],
    artifacts: [],
    actionProposals: [],
    compactions: [],
    version: 1,
    createdAt: "2026-05-18T08:00:00.000Z",
    updatedAt: "2026-05-18T08:00:00.000Z",
  };
}

function aiChatActionProposal(status = "proposed") {
  return {
    id: "action-1",
    conversationId: "chat-1",
    runId: "run-1",
    projectId: "project-1",
    risk: "medium",
    status,
    actionKind: "dashboard.save",
    inputPreview: {},
    requiresApproval: true,
    idempotencyKey: "action-1",
    expiresAt: "2026-05-18T08:15:00.000Z",
    version: 2,
    createdAt: "2026-05-18T08:00:00.000Z",
    updatedAt: "2026-05-18T08:00:00.000Z",
  };
}

function organizationInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    organizationId: "org-1",
    email: "ada@example.test",
    role: "user",
    status: "pending",
    deliveryStatus: "suppressed",
    lastDeliveryAttemptAt: null,
    lastDeliveryErrorCode: null,
    lastEmailDeliveryId: null,
    projectGrants: [],
    invitedByUserId: "admin-1",
    acceptedByUserId: null,
    createdAt: "2026-05-16T09:00:00.000Z",
    updatedAt: "2026-05-16T09:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    expiresAt: "2026-05-23T09:00:00.000Z",
    ...overrides,
  };
}

function projectMember(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project-1",
    userId: "user-1",
    email: null,
    displayName: null,
    role: "viewer",
    effectiveRole: "viewer",
    source: "direct",
    createdAt: "2026-05-14T08:00:00.000Z",
    createdByUserId: "admin-1",
    updatedAt: "2026-05-14T08:00:00.000Z",
    updatedByUserId: "admin-1",
    ...overrides,
  };
}

function retentionRules(): RetentionRuleInput[] {
  return [
    { dataClass: "TRACES", mode: "delete", retentionDays: 30 },
    { dataClass: "LOGS", mode: "delete", retentionDays: 30 },
    { dataClass: "METRICS", mode: "delete", retentionDays: 30 },
    { dataClass: "AI_EVALS", mode: "delete", retentionDays: 90 },
    { dataClass: "DATASETS", mode: "retain" },
    { dataClass: "SCORERS", mode: "retain" },
    { dataClass: "DASHBOARD_HISTORY", mode: "retain" },
    { dataClass: "INGEST_CREDENTIAL_AUDIT", mode: "delete", retentionDays: 365 },
  ];
}

function retentionPolicy() {
  return {
    projectId: "project-1",
    rules: retentionRules().map((rule) => ({
      ...rule,
      retentionDays: "retentionDays" in rule ? rule.retentionDays : null,
      softDeleteDays: null,
      updatedAt: "2026-05-14T08:00:00.000Z",
      updatedByUserId: "admin-1",
      version: 1,
    })),
    updatedAt: "2026-05-14T08:00:00.000Z",
    updatedByUserId: "admin-1",
    version: 1,
  };
}

function alertRuleInput() {
  return {
    projectId: "project-1",
    name: "Errors",
    enabled: true,
    kind: "TRACE_ERROR" as const,
    severity: "ERROR" as const,
    query: { service: "api" },
    condition: { minCount: 1 },
    evaluationWindowSeconds: 60,
    pendingForSeconds: 0,
    cooldownSeconds: 60,
    notificationAdapterIds: ["in_app"],
  };
}

function alertRule() {
  return {
    id: "rule-1",
    ...alertRuleInput(),
    createdAt: "2026-05-14T08:00:00.000Z",
    updatedAt: "2026-05-14T08:00:00.000Z",
    updatedByUserId: "admin-1",
    version: 1,
  };
}

function alertSilence() {
  return {
    id: "silence-1",
    projectId: "project-1",
    ruleId: "rule-1",
    reason: "maintenance",
    startsAt: "2026-05-14T08:00:00.000Z",
    endsAt: "2026-05-14T09:00:00.000Z",
    createdAt: "2026-05-14T08:00:00.000Z",
    createdByUserId: "admin-1",
    active: true,
  };
}

function alertHistory() {
  return {
    items: [
      {
        id: "event-1",
        projectId: "project-1",
        ruleId: "rule-1",
        instanceId: "instance-1",
        state: "FIRING",
        severity: "ERROR",
        summary: "Errors firing",
        deduplicationKey: "errors:api",
        startedAt: "2026-05-14T08:00:00.000Z",
        endedAt: null,
        createdAt: "2026-05-14T08:00:00.000Z",
        evidenceTraceId: null,
        evidenceSpanId: null,
        evidenceLogId: null,
        evidenceMetricName: null,
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  };
}

function alertSummary() {
  return {
    totalCount: 1,
    byState: [{ state: "FIRING", count: 1 }],
    bySeverity: [{ severity: "ERROR", count: 1 }],
    bySignal: [{ signal: "TRACE", count: 1 }],
  };
}
