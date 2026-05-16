import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type { RetentionRuleInput } from "@cloudgrid/ui-contracts";
import { JSONCodec, type NatsConnection } from "nats";
import { NATSTelemetryQueryBridge } from "./bridge";

describe("NATS telemetry query bridge", () => {
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

  test("sends metric name and series requests to storage-read metric subjects", async () => {
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
              requestedSubject === "telemetry.metrics.names"
                ? { items: [] }
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

    await bridge.metricNames({ query: "token", limit: 10 });
    await bridge.metricSeries({
      metricName: "gen_ai.client.token.usage",
      from: "2026-05-14T08:00:00.000Z",
      to: "2026-05-14T09:00:00.000Z",
      aggregation: "sum",
      groupBy: ["gen_ai.system"],
      limit: 100,
    });

    expect(requests).toMatchObject([
      {
        subject: "telemetry.metrics.names",
        payload: { input: { query: "token", limit: 10 } },
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
            limit: 100,
          },
        },
      },
    ]);
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
    await bridge.revokeOrganizationInvitation("invite-1", {
      mode: "authenticated",
      authMode: "sso",
    });

    expect(requests.map((request) => request.subject)).toEqual([
      "control.members.list",
      "control.invitations.list",
      "control.invitations.create",
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
    expect(requests[3]?.payload).toMatchObject({ invitationId: "invite-1" });
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
    case "control.invitations.revoke":
      return { invitation: organizationInvitation() };
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
    default:
      throw new Error(`unexpected subject ${subject}`);
  }
}

function organizationInvitation(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    organizationId: "org-1",
    email: "ada@example.test",
    role: "user",
    status: "pending",
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
