import { afterEach, describe, expect, test } from "bun:test";
import {
  createControlPlaneGraphQLClient,
  createTelemetryGraphQLClient,
} from "../src/lib/graphql-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockGraphQLResponse(payload: unknown, init: ResponseInit = {}) {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
      status: 200,
      ...init,
    });
}

describe("GraphQL client", () => {
  test("throws CloudGrid problem details from GraphQL error extensions", async () => {
    mockGraphQLResponse({
      errors: [
        {
          message: "Storage unavailable",
          extensions: {
            code: "STORAGE_UNAVAILABLE",
            problem: {
              type: "https://cloudgrid.dev/problems/storage-unavailable",
              title: "Storage is unavailable",
              status: 503,
              detail: "Storage is unavailable",
              id: "ERR-006",
              code: "STORAGE_UNAVAILABLE",
              retryable: true,
            },
          },
        },
      ],
    });

    const client = createTelemetryGraphQLClient("/graphql");

    await expect(client.searchTraces({})).rejects.toMatchObject({
      message: "Storage is unavailable",
      problem: {
        id: "ERR-006",
        code: "STORAGE_UNAVAILABLE",
        retryable: true,
        status: 503,
      },
    });
  });

  test("rejects decoded GraphQL response envelopes with invalid shape", async () => {
    mockGraphQLResponse({
      data: null,
      errors: [{ extensions: { problem: "invalid" } }],
    });

    const client = createTelemetryGraphQLClient("/graphql");

    await expect(client.searchLogs({})).rejects.toThrow("GraphQL response envelope was invalid");
  });

  test("uses same-origin GraphQL without browser-managed token headers for viewer reads", async () => {
    const requests: RequestInit[] = [];
    globalThis.fetch = async (_input, init) => {
      requests.push(init ?? {});
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              user: { id: "user-1", displayName: "Ada", email: "ada@example.com" },
              organizations: [],
              selectedProject: null,
            },
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    const client = createControlPlaneGraphQLClient("/graphql");

    await expect(client.getViewer()).resolves.toMatchObject({
      user: { id: "user-1" },
      selectedProject: null,
    });
    expect(requests[0]?.headers).toEqual({ "content-type": "application/json" });
  });

  test("calls the schema-backed selectProject mutation", async () => {
    let requestBody: { operationName?: string; variables?: Record<string, unknown> } | null = null;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          data: {
            selectProject: {
              user: { id: "user-1", displayName: "Ada", email: "ada@example.com" },
              organizations: [],
              selectedProject: {
                id: "project-1",
                organizationId: "org-1",
                name: "Checkout",
                slug: "checkout",
                status: "active",
                telemetry: {
                  lastIngestAt: null,
                  traceCount: 0,
                  logCount: 0,
                  metricCount: 0,
                  serviceCount: 0,
                },
              },
            },
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    const client = createControlPlaneGraphQLClient("/graphql");
    const nextViewer = await client.selectProject("project-1");

    expect(requestBody).toMatchObject({
      operationName: "SelectProject",
      variables: { projectId: "project-1" },
    });
    expect(nextViewer.selectedProject?.id).toBe("project-1");
  });

  test("calls the schema-backed createProject mutation", async () => {
    let requestBody: { operationName?: string; variables?: Record<string, unknown> } | null = null;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          data: {
            createProject: {
              id: "project-api",
              organizationId: "org-1",
              name: "API",
              slug: "api",
              status: "active",
              telemetry: {
                lastIngestAt: null,
                traceCount: 0,
                logCount: 0,
                metricCount: 0,
                serviceCount: 0,
              },
            },
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    };

    const client = createControlPlaneGraphQLClient("/graphql");
    const project = await client.createProject({
      organizationId: "org-1",
      name: "API",
      slug: "api",
    });

    expect(requestBody).toMatchObject({
      operationName: "CreateProject",
      variables: {
        input: {
          organizationId: "org-1",
          name: "API",
          slug: "api",
        },
      },
    });
    expect(project.id).toBe("project-api");
  });

  test("calls metric queries and dashboard mutations with schema operation names", async () => {
    const operationNames: string[] = [];
    globalThis.fetch = async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body));
      operationNames.push(requestBody.operationName);
      const dataByOperation: Record<string, unknown> = {
        MetricNames: {
          metricNames: {
            items: [
              {
                id: "metric:gen_ai.client.token.usage",
                tenantId: "tenant-1",
                projectId: "project-1",
                name: "gen_ai.client.token.usage",
                description: null,
                unit: "1",
                kind: "sum",
                aggregationTemporality: "delta",
                monotonic: true,
                attributeKeys: ["gen_ai.system"],
                firstSeenAt: "2026-05-14T08:00:00.000Z",
                lastSeenAt: "2026-05-14T09:00:00.000Z",
              },
            ],
          },
        },
        MetricSeries: {
          metricSeries: {
            metric: {
              id: "metric:gen_ai.client.token.usage",
              tenantId: "tenant-1",
              projectId: "project-1",
              name: "gen_ai.client.token.usage",
              description: null,
              unit: "1",
              kind: "sum",
              aggregationTemporality: "delta",
              monotonic: true,
              attributeKeys: ["gen_ai.system"],
              firstSeenAt: "2026-05-14T08:00:00.000Z",
              lastSeenAt: "2026-05-14T09:00:00.000Z",
            },
            aggregation: "sum",
            interval: "PT1M",
            groupBy: ["gen_ai.system"],
            series: [{ labels: { "gen_ai.system": "openai" }, points: [] }],
            warnings: [],
          },
        },
        Dashboards: {
          dashboards: {
            items: [
              {
                id: "dashboard-1",
                projectId: "project-1",
                slug: "token-usage",
                name: "Token usage",
                description: null,
                tags: ["genai"],
                version: 1,
                visibility: "project",
                defaultTimeWindow: "PT1H",
                pinned: true,
                widgets: [],
                createdAt: "2026-05-14T08:00:00.000Z",
                updatedAt: "2026-05-14T08:00:00.000Z",
                createdBy: "user-1",
                updatedBy: "user-1",
              },
            ],
            pinnedDashboardIds: ["dashboard-1"],
          },
        },
        SaveDashboard: {
          saveDashboard: {
            id: "dashboard-1",
            projectId: "project-1",
            slug: "token-usage",
            name: "Token usage",
            description: null,
            tags: ["genai"],
            version: 1,
            visibility: "project",
            defaultTimeWindow: "PT1H",
            pinned: false,
            widgets: [],
            createdAt: "2026-05-14T08:00:00.000Z",
            updatedAt: "2026-05-14T08:00:00.000Z",
            createdBy: "user-1",
            updatedBy: "user-1",
          },
        },
        DeleteDashboard: { deleteDashboard: true },
        SetDashboardPinned: {
          setDashboardPinned: {
            projectId: "project-1",
            pinnedDashboardIds: ["dashboard-1"],
            updatedAt: "2026-05-14T08:00:00.000Z",
          },
        },
        ReorderDashboardPins: {
          reorderDashboardPins: {
            projectId: "project-1",
            pinnedDashboardIds: ["dashboard-1"],
            updatedAt: "2026-05-14T08:00:00.000Z",
          },
        },
      };
      return new Response(JSON.stringify({ data: dataByOperation[requestBody.operationName] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };

    const telemetryClient = createTelemetryGraphQLClient("/graphql");
    const controlClient = createControlPlaneGraphQLClient("/graphql");

    await expect(telemetryClient.getMetricNames({ query: "token", limit: 10 })).resolves.toEqual({
      items: [expect.objectContaining({ name: "gen_ai.client.token.usage" })],
    });
    await expect(
      telemetryClient.getMetricSeries({
        metricName: "gen_ai.client.token.usage",
        from: "2026-05-14T08:00:00.000Z",
        to: "2026-05-14T09:00:00.000Z",
        aggregation: "sum",
      }),
    ).resolves.toMatchObject({
      aggregation: "sum",
      series: [{ labels: { "gen_ai.system": "openai" } }],
    });
    await expect(controlClient.getDashboards({ includeBuiltins: true })).resolves.toMatchObject({
      items: [{ id: "dashboard-1", name: "Token usage" }],
      pinnedDashboardIds: ["dashboard-1"],
    });
    await expect(
      controlClient.saveDashboard({
        name: "Token usage",
        widgets: [
          {
            id: "widget-1",
            title: "Tokens",
            kind: "metric_timeseries",
            layout: { x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
            metric: {
              metricName: "gen_ai.client.token.usage",
              aggregation: "sum",
              visualization: "line",
            },
          },
        ],
      }),
    ).resolves.toMatchObject({ id: "dashboard-1" });
    await expect(
      controlClient.setDashboardPinned({ dashboardId: "dashboard-1", pinned: true }),
    ).resolves.toMatchObject({ pinnedDashboardIds: ["dashboard-1"] });
    await expect(
      controlClient.reorderDashboardPins({ dashboardIds: ["dashboard-1"] }),
    ).resolves.toMatchObject({ pinnedDashboardIds: ["dashboard-1"] });
    await expect(controlClient.deleteDashboard("dashboard-1")).resolves.toBe(true);
    expect(operationNames).toEqual([
      "MetricNames",
      "MetricSeries",
      "Dashboards",
      "SaveDashboard",
      "SetDashboardPinned",
      "ReorderDashboardPins",
      "DeleteDashboard",
    ]);
  });

  test("calls project settings and alerting operations with schema operation names", async () => {
    const operationNames: string[] = [];
    const variablesByOperation: Record<string, unknown> = {};
    globalThis.fetch = async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body));
      operationNames.push(requestBody.operationName);
      variablesByOperation[requestBody.operationName] = requestBody.variables;
      const now = "2026-05-15T08:00:00.000Z";
      const member = {
        projectId: "project-1",
        userId: "user-1",
        email: "ada@example.com",
        displayName: "Ada",
        role: "admin",
        effectiveRole: "admin",
        source: "direct",
        createdAt: now,
        createdByUserId: "user-1",
        updatedAt: now,
        updatedByUserId: "user-1",
      };
      const retentionPolicy = {
        projectId: "project-1",
        rules: [
          {
            dataClass: "TRACES",
            mode: "delete",
            retentionDays: 30,
            softDeleteDays: null,
            updatedAt: now,
            updatedByUserId: "user-1",
            version: 1,
          },
        ],
        updatedAt: now,
        updatedByUserId: "user-1",
        version: 1,
      };
      const rule = {
        id: "rule-1",
        projectId: "project-1",
        name: "High error rate",
        enabled: true,
        kind: "TRACE_ERROR",
        severity: "ERROR",
        query: { status: "error" },
        condition: { minCount: 1 },
        evaluationWindowSeconds: 300,
        pendingForSeconds: 60,
        cooldownSeconds: 300,
        notificationAdapterIds: ["in_app"],
        createdAt: now,
        updatedAt: now,
        updatedByUserId: "user-1",
        version: 1,
      };
      const silence = {
        id: "silence-1",
        projectId: "project-1",
        ruleId: "rule-1",
        reason: "maintenance",
        startsAt: now,
        endsAt: "2026-05-15T09:00:00.000Z",
        createdAt: now,
        createdByUserId: "user-1",
        active: true,
      };
      const dataByOperation: Record<string, unknown> = {
        ProjectMembers: { projectMembers: [member] },
        UpdateProjectMember: { updateProjectMember: member },
        RemoveProjectMember: { removeProjectMember: true },
        RetentionPolicy: { retentionPolicy },
        UpdateRetentionPolicy: { updateRetentionPolicy: retentionPolicy },
        AlertRules: { alertRules: [rule] },
        AlertHistory: {
          alertHistory: {
            items: [
              {
                id: "event-1",
                projectId: "project-1",
                ruleId: "rule-1",
                instanceId: "instance-1",
                state: "FIRING",
                severity: "ERROR",
                summary: "High error rate is firing",
                deduplicationKey: "rule-1:error",
                startedAt: now,
                endedAt: null,
                createdAt: now,
                evidenceTraceId: "trace-1",
                evidenceSpanId: null,
                evidenceLogId: null,
                evidenceMetricName: null,
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
        AlertSummary: {
          alertSummary: {
            totalCount: 1,
            byState: [{ state: "FIRING", count: 1 }],
            bySeverity: [{ severity: "ERROR", count: 1 }],
            bySignal: [{ signal: "TRACE", count: 1 }],
          },
        },
        AlertSilences: { alertSilences: [silence] },
        CreateAlertRule: { createAlertRule: rule },
        UpdateAlertRule: { updateAlertRule: rule },
        DeleteAlertRule: { deleteAlertRule: true },
        CreateAlertSilence: { createAlertSilence: silence },
        DeleteAlertSilence: { deleteAlertSilence: true },
      };
      return new Response(JSON.stringify({ data: dataByOperation[requestBody.operationName] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };

    const client = createControlPlaneGraphQLClient("/graphql");

    await expect(client.getProjectMembers("project-1")).resolves.toEqual([
      expect.objectContaining({ userId: "user-1", effectiveRole: "admin" }),
    ]);
    await expect(
      client.updateProjectMember({ projectId: "project-1", userId: "user-2", role: "viewer" }),
    ).resolves.toMatchObject({ role: "admin" });
    await expect(client.removeProjectMember("project-1", "user-2")).resolves.toBe(true);
    await expect(client.getRetentionPolicy("project-1")).resolves.toMatchObject({
      version: 1,
      rules: [{ dataClass: "TRACES" }],
    });
    await expect(
      client.updateRetentionPolicy({
        projectId: "project-1",
        expectedVersion: 1,
        rules: [{ dataClass: "TRACES", mode: "delete", retentionDays: 30 }],
      }),
    ).resolves.toMatchObject({ projectId: "project-1" });
    await expect(client.getAlertRules("project-1")).resolves.toEqual([
      expect.objectContaining({ id: "rule-1", kind: "TRACE_ERROR" }),
    ]);
    await expect(
      client.getAlertHistory({ projectId: "project-1", ruleId: "rule-1" }),
    ).resolves.toMatchObject({ items: [{ id: "event-1", state: "FIRING" }] });
    await expect(
      client.getAlertSummary("project-1", {
        states: ["FIRING"],
        severities: ["ERROR"],
        signals: ["TRACE"],
      }),
    ).resolves.toMatchObject({ totalCount: 1, byState: [{ state: "FIRING", count: 1 }] });
    await expect(
      client.getAlertSilences({ projectId: "project-1", ruleId: "rule-1" }),
    ).resolves.toEqual([expect.objectContaining({ id: "silence-1", active: true })]);
    await expect(
      client.createAlertRule({
        projectId: "project-1",
        name: "High error rate",
        enabled: true,
        kind: "TRACE_ERROR",
        severity: "ERROR",
        query: { status: "error" },
        condition: { minCount: 1 },
        evaluationWindowSeconds: 300,
        pendingForSeconds: 60,
        cooldownSeconds: 300,
        notificationAdapterIds: ["in_app"],
      }),
    ).resolves.toMatchObject({ id: "rule-1" });
    await expect(
      client.updateAlertRule({ id: "rule-1", enabled: false, expectedVersion: 1 }),
    ).resolves.toMatchObject({ id: "rule-1" });
    await expect(client.deleteAlertRule("rule-1")).resolves.toBe(true);
    await expect(
      client.createAlertSilence({
        projectId: "project-1",
        ruleId: "rule-1",
        reason: "maintenance",
        startsAt: nowIso(),
        endsAt: "2026-05-15T09:00:00.000Z",
      }),
    ).resolves.toMatchObject({ id: "silence-1" });
    await expect(client.deleteAlertSilence("silence-1")).resolves.toBe(true);

    expect(operationNames).toEqual([
      "ProjectMembers",
      "UpdateProjectMember",
      "RemoveProjectMember",
      "RetentionPolicy",
      "UpdateRetentionPolicy",
      "AlertRules",
      "AlertHistory",
      "AlertSummary",
      "AlertSilences",
      "CreateAlertRule",
      "UpdateAlertRule",
      "DeleteAlertRule",
      "CreateAlertSilence",
      "DeleteAlertSilence",
    ]);
    expect(variablesByOperation.UpdateProjectMember).toEqual({
      projectId: "project-1",
      userId: "user-2",
      role: "viewer",
    });
    expect(variablesByOperation.AlertHistory).toEqual({
      projectId: "project-1",
      ruleId: "rule-1",
      first: 50,
      after: null,
    });
    expect(variablesByOperation.AlertSummary).toEqual({
      projectId: "project-1",
      input: {
        states: ["FIRING"],
        severities: ["ERROR"],
        signals: ["TRACE"],
      },
    });
  });

  test("calls AI Eval workspace operations with schema operation names", async () => {
    const operationNames: string[] = [];
    globalThis.fetch = async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body));
      operationNames.push(requestBody.operationName);
      const importJob = {
        id: "import-1",
        datasetId: "dataset-1",
        status: "preview_ready",
        format: "jsonl",
        sourceFiles: [],
        mapping: {},
        defaults: {},
        previewRows: [],
        totalRows: 0,
        validRows: 0,
        errorRows: 0,
        warnings: [],
        createdAt: "2026-05-17T08:00:00.000Z",
        expiresAt: "2026-05-17T09:00:00.000Z",
        committedDatasetVersion: null,
      };
      const exportJob = {
        id: "export-1",
        datasetId: "dataset-1",
        datasetVersion: 1,
        status: "ready",
        format: "jsonl",
        rowCount: 0,
        sizeBytes: null,
        sha256: null,
        downloadUrl: "/api/ai-eval/dataset-exports/export-1/download",
        createdAt: "2026-05-17T08:00:00.000Z",
        expiresAt: "2026-05-17T09:00:00.000Z",
      };
      const dataset = {
        id: "dataset-1",
        name: "Regression",
        description: null,
        version: 1,
        createdAt: "2026-05-17T08:00:00.000Z",
        itemCount: 0,
        reviewedItemCount: 0,
        splitCounts: {},
        health: {
          status: "ready",
          reviewedItemCount: 0,
          totalItemCount: 0,
          splitCounts: {},
          duplicateCandidateCount: 0,
          leakageWarningCount: 0,
          missingExpectedCount: 0,
          schemaIssueCount: 0,
          smallDataset: true,
          warnings: [],
        },
        tags: [],
        items: { items: [], nextCursor: null },
      };
      const scorer = {
        id: "scorer-1",
        name: "Contains answer",
        kind: "deterministic",
        definition: { type: "contains" },
        judgeModelRef: null,
        version: 1,
      };
      const experimentRun = {
        id: "run-1",
        experimentId: "experiment-1",
        solverRef: { kind: "local" },
        manifest: null,
        baselineRunId: null,
        status: "queued",
        startedAt: "2026-05-17T08:00:00.000Z",
        endedAt: null,
        summary: {},
        itemRuns: { items: [], nextCursor: null },
      };
      const experiment = {
        id: "experiment-1",
        name: "Baseline",
        datasetId: "dataset-1",
        datasetVersion: 1,
        scorerIds: ["scorer-1"],
        splitSelector: { splits: ["validation"], reviewedOnly: false, includeSynthetic: false },
        baselineRef: null,
        promptVersionRefs: [],
        skillSnapshotRefs: [],
        toolSnapshotRefs: [],
        providerProfileRefs: [],
        createdAt: "2026-05-17T08:00:00.000Z",
        tags: [],
        runs: { items: [experimentRun], nextCursor: null },
      };
      const dataByOperation: Record<string, unknown> = {
        AiQualityOverview: {
          aiQualityOverview: {
            projectId: "project-1",
            from: null,
            to: null,
            summary: {},
            warnings: [],
            segments: [],
          },
        },
        CreateDataset: { createDataset: dataset },
        AppendDatasetItems: {
          appendDatasetItems: {
            ...dataset,
            itemCount: 1,
            reviewedItemCount: 1,
            items: {
              items: [
                {
                  id: "item-1",
                  datasetId: "dataset-1",
                  version: 2,
                  input: { prompt: "Check answer" },
                  expected: { answer: "42" },
                  metadata: {},
                  sourceTraceId: null,
                  sourceSpanId: null,
                  split: "validation",
                  reviewStatus: "reviewed",
                  synthetic: false,
                  duplicateOfItemId: null,
                  leakageWarnings: [],
                },
              ],
              nextCursor: null,
            },
          },
        },
        CreateScorer: { createScorer: scorer },
        CreateExperiment: { createExperiment: experiment },
        StartExperimentRun: { startExperimentRun: experimentRun },
        PrepareDatasetImport: { prepareDatasetImport: importJob },
        CommitDatasetImport: { commitDatasetImport: importJob },
        StartDatasetExport: { startDatasetExport: exportJob },
        DatasetExport: { datasetExport: exportJob },
      };
      return new Response(JSON.stringify({ data: dataByOperation[requestBody.operationName] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    };

    const client = createTelemetryGraphQLClient("/graphql");

    await expect(client.getAiQualityOverview({ projectId: "project-1" })).resolves.toMatchObject({
      projectId: "project-1",
    });
    await expect(client.createDataset({ name: "Regression" })).resolves.toMatchObject({
      id: "dataset-1",
    });
    await expect(
      client.appendDatasetItems({
        datasetId: "dataset-1",
        items: [
          {
            input: { prompt: "Check answer" },
            expected: { answer: "42" },
            metadata: {},
            split: "validation",
            reviewStatus: "reviewed",
          },
        ],
      }),
    ).resolves.toMatchObject({ id: "dataset-1", itemCount: 1 });
    await expect(
      client.createScorer({
        name: "Contains answer",
        kind: "deterministic",
        definition: { type: "contains" },
      }),
    ).resolves.toMatchObject({ id: "scorer-1" });
    await expect(
      client.createExperiment({
        name: "Baseline",
        datasetId: "dataset-1",
        datasetVersion: 1,
        scorerIds: ["scorer-1"],
        solverRef: { kind: "local" },
      }),
    ).resolves.toMatchObject({ id: "experiment-1" });
    await expect(
      client.startExperimentRun({ experimentId: "experiment-1" }),
    ).resolves.toMatchObject({
      id: "run-1",
    });
    await expect(
      client.prepareDatasetImport({
        datasetId: "dataset-1",
        uploadId: "upload-1",
        format: "jsonl",
        mapping: {
          input: [{ targetPath: "prompt", source: { jsonPath: "$.prompt" } }],
        },
      }),
    ).resolves.toMatchObject({ id: "import-1" });
    await expect(
      client.commitDatasetImport({
        importId: "import-1",
        expectedDatasetVersion: 1,
        mode: "valid_rows_only",
      }),
    ).resolves.toMatchObject({ id: "import-1" });
    await expect(
      client.startDatasetExport({ datasetId: "dataset-1", format: "jsonl" }),
    ).resolves.toMatchObject({ id: "export-1" });
    await expect(client.getDatasetExport("export-1")).resolves.toMatchObject({ id: "export-1" });
    expect(operationNames).toEqual([
      "AiQualityOverview",
      "CreateDataset",
      "AppendDatasetItems",
      "CreateScorer",
      "CreateExperiment",
      "StartExperimentRun",
      "PrepareDatasetImport",
      "CommitDatasetImport",
      "StartDatasetExport",
      "DatasetExport",
    ]);
  });
});

function nowIso() {
  return "2026-05-15T08:00:00.000Z";
}
