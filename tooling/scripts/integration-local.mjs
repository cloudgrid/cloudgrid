#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { integrationScenarios } from "../../apps/packages/integration-scenarios/src/index.ts";
import {
  agentRunOperation,
  agentRunsOperation,
  aiQualityOverviewOperation,
  alertHistoryOperation,
  alertRulesOperation,
  alertSilencesOperation,
  annotationQueueOperation,
  appendDatasetItemsOperation,
  aiChatHistoryOperation,
  commitDatasetImportOperation,
  companyAiProviderSettingsOperation,
  createAlertRuleOperation,
  createAlertSilenceOperation,
  createAiChatConversationOperation,
  createDatasetOperation,
  createExperimentOperation,
  createIngestCredentialOperation,
  createProjectOperation,
  createScorerOperation,
  dashboardsOperation,
  datasetExportOperation,
  datasetOperation,
  datasetsOperation,
  deleteAlertRuleOperation,
  deleteAlertSilenceOperation,
  deleteDashboardOperation,
  experimentRunOperation,
  experimentsOperation,
  ingestCredentialsOperation,
  inviteOrganizationMemberOperation,
  liveExperimentRunSubscriptionOperation,
  liveTraceSubscriptionOperation,
  logSearchOperation,
  metricNamesOperation,
  metricSeriesOperation,
  organizationInvitationsOperation,
  organizationMembersOperation,
  organizationOperation,
  organizationsOperation,
  prepareDatasetImportOperation,
  projectAiSettingsOperation,
  projectMembersOperation,
  projectOperation,
  projectsOperation,
  removeOrganizationMemberOperation,
  removeProjectMemberOperation,
  reorderDashboardPinsOperation,
  retentionPolicyOperation,
  revokeIngestCredentialOperation,
  revokeOrganizationInvitationOperation,
  richMetricSeriesOperation,
  saveDashboardOperation,
  scorersOperation,
  selectProjectOperation,
  setDashboardPinnedOperation,
  startDatasetExportOperation,
  startExperimentRunOperation,
  telemetryFacetsOperation,
  traceDetailOperation,
  traceSearchOperation,
  updateAlertRuleOperation,
  updateCompanyAiProviderSettingsOperation,
  updateOrganizationMemberOperation,
  updateProjectAiSettingsOperation,
  updateProjectMemberOperation,
  updateRetentionPolicyOperation,
  viewerOperation,
} from "../../apps/packages/public-api-client/src/operations.ts";
import { buildFixtureRequests, createSeedRunContext, postFixture } from "./seed-otlp-fixtures.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");

const protobufLogFixture = Buffer.from(
  "CqMBCiAKHgoMc2VydmljZS5uYW1lEg4KDGNoZWNrb3V0LWFwaRJ/ChwaGgoJc2NvcGUua2V5Eg0KC3Njb3BlLXZhbHVlEl8JAMrEcf6clxcQCRoESU5GTyoPCg1vcmRlciBjcmVhdGVkMhYKB2xvZy5rZXkSCwoJbG9nLXZhbHVlShABAgMEBQYHCAkKCwwNDg8QUggREhMUFRYXGFkAq7p3/pyXFw==",
  "base64",
);

const usage = `CloudGrid local integration runner

Usage:
  bun run integration:local [--dry-run] [--external-infra]

By default, the runner starts disposable Docker containers for NATS and an
in-memory SurrealDB instance on random localhost ports.

Options:
  --dry-run         Print planned services and selected ports without starting checks.
  --external-infra  Use CLOUDGRID_NATS_URL and CLOUDGRID_SURREALDB_URL instead of Docker.
  --help            Show this help.
`;

export function parseDotEnv(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

export function mergedEnv(dotEnv, processEnv = process.env) {
  return { ...dotEnv, ...processEnv };
}

export function buildTraceJsonFixture({ traceIdHex, rootSpanIdHex, serviceName }) {
  const startedAtUnixNano = BigInt(Date.now() - 60_000) * 1_000_000n;
  const eventAtUnixNano = startedAtUnixNano + 5_000_000n;
  const endedAtUnixNano = startedAtUnixNano + 10_000_000n;
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
            { key: "cloud.region", value: { stringValue: "local" } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "integration-runner",
              attributes: [{ key: "scope.key", value: { stringValue: "scope-value" } }],
            },
            spans: [
              {
                traceId: hexToBase64(traceIdHex),
                spanId: hexToBase64(rootSpanIdHex),
                name: "POST /orders",
                kind: "SPAN_KIND_SERVER",
                startTimeUnixNano: String(startedAtUnixNano),
                endTimeUnixNano: String(endedAtUnixNano),
                attributes: [{ key: "http.method", value: { stringValue: "POST" } }],
                status: { code: "STATUS_CODE_ERROR" },
                events: [
                  {
                    name: "agent.step",
                    timeUnixNano: String(eventAtUnixNano),
                    attributes: [{ key: "gen_ai.operation.name", value: { stringValue: "chat" } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function buildMetricJsonFixture({
  metricName,
  serviceName,
  startedAtUnixNano,
  observedAtUnixNano,
}) {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: serviceName } },
            { key: "deployment.environment", value: { stringValue: "integration" } },
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "integration-runner" },
            metrics: [
              {
                name: metricName,
                description: "Integration runner metric",
                unit: "{request}",
                gauge: {
                  dataPoints: [
                    {
                      attributes: [
                        { key: "service.name", value: { stringValue: serviceName } },
                        { key: "http.route", value: { stringValue: "/integration" } },
                      ],
                      startTimeUnixNano: startedAtUnixNano,
                      timeUnixNano: observedAtUnixNano,
                      asDouble: 42.5,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

export function duplicateCommands(commandId, requestIdPrefix) {
  const nowMs = Date.now();
  const issuedAt = new Date(nowMs).toISOString();
  const startedAt = new Date(nowMs - 25).toISOString();
  const endedAt = new Date(nowMs).toISOString();
  const originalTraceId = `dup-original-${commandId}`;
  const rewriteTraceId = `dup-rewrite-${commandId}`;
  return {
    originalTraceId,
    rewriteTraceId,
    original: persistTraceCommand({
      commandId,
      requestId: `${requestIdPrefix}-1`,
      issuedAt,
      traceId: originalTraceId,
      spanId: "dup-root-span",
      serviceName: "duplicate-original",
      spanName: "duplicate original",
      startedAt,
      endedAt,
    }),
    rewrite: persistTraceCommand({
      commandId,
      requestId: `${requestIdPrefix}-2`,
      issuedAt,
      traceId: rewriteTraceId,
      spanId: "dup-rewrite-span",
      serviceName: "duplicate-rewrite",
      spanName: "duplicate rewrite",
      startedAt,
      endedAt,
    }),
  };
}

async function main(args = process.argv.slice(2)) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage);
    return;
  }

  const dotEnv = existsSync(join(repoRoot, ".env"))
    ? parseDotEnv(readFileSync(join(repoRoot, ".env"), "utf8"))
    : {};
  const baseEnv = mergedEnv(dotEnv);
  const externalInfra = args.includes("--external-infra");
  const runID = `it-${Date.now()}-${randomHex(3)}`;
  const bffPort = Number(baseEnv.CLOUDGRID_INTEGRATION_BFF_PORT || (await freePort()));
  const otlpPort = Number(baseEnv.CLOUDGRID_INTEGRATION_OTLP_PORT || (await freePort()));
  const otlpGrpcPort = Number(baseEnv.CLOUDGRID_INTEGRATION_OTLP_GRPC_PORT || (await freePort()));
  const storageReadHealthPort = Number(
    baseEnv.CLOUDGRID_INTEGRATION_STORAGE_READ_HEALTH_PORT || (await freePort()),
  );
  const storageWriteHealthPort = Number(
    baseEnv.CLOUDGRID_INTEGRATION_STORAGE_WRITE_HEALTH_PORT || (await freePort()),
  );
  const controlPlaneHealthPort = Number(
    baseEnv.CLOUDGRID_INTEGRATION_CONTROL_PLANE_HEALTH_PORT || (await freePort()),
  );
  const aiEvalRunnerHealthPort = Number(
    baseEnv.CLOUDGRID_INTEGRATION_AI_EVAL_RUNNER_HEALTH_PORT || (await freePort()),
  );
  const aiEvalHarnessPort = Number(
    baseEnv.CLOUDGRID_INTEGRATION_AI_EVAL_HARNESS_PORT || (await freePort()),
  );
  const aiEvalHarnessURL = `http://127.0.0.1:${aiEvalHarnessPort}`;
  const natsPort = Number(baseEnv.CLOUDGRID_INTEGRATION_NATS_PORT || (await freePort()));
  const natsMonitorPort = Number(
    baseEnv.CLOUDGRID_INTEGRATION_NATS_MONITOR_PORT || (await freePort()),
  );
  const surrealPort = Number(baseEnv.CLOUDGRID_INTEGRATION_SURREALDB_PORT || (await freePort()));
  const natsUrl = externalInfra
    ? baseEnv.CLOUDGRID_NATS_URL || "nats://localhost:4222"
    : `nats://127.0.0.1:${natsPort}`;
  const surrealUrl = externalInfra
    ? baseEnv.CLOUDGRID_SURREALDB_URL || "http://localhost:8000/rpc"
    : `http://127.0.0.1:${surrealPort}/rpc`;
  const surrealNamespace = externalInfra
    ? baseEnv.CLOUDGRID_SURREALDB_NAMESPACE || "observability"
    : `cloudgrid_${runID.replaceAll("-", "_")}`;
  const surrealDatabase = externalInfra ? baseEnv.CLOUDGRID_SURREALDB_DATABASE || "dev" : "control";
  const surrealUsername = baseEnv.CLOUDGRID_SURREALDB_USERNAME || "root";
  const surrealPassword = baseEnv.CLOUDGRID_SURREALDB_PASSWORD || "root";
  const datasetTransferDir = resolve(
    repoRoot,
    ".cloudgrid",
    "integration",
    runID,
    "dataset-transfer",
  );
  const integrationRunDir = resolve(repoRoot, ".cloudgrid", "integration", runID);
  const natsConfigPath = join(integrationRunDir, "nats.conf");

  const plan = [
    `Mode: ${externalInfra ? "external infrastructure" : "isolated Docker infrastructure"}`,
    `NATS: ${natsUrl}`,
    `SurrealDB: ${surrealUrl} (${surrealNamespace}/${surrealDatabase})`,
    `Dataset transfer: ${datasetTransferDir}`,
    `BFF: http://127.0.0.1:${bffPort}/graphql`,
    `Collector: http://127.0.0.1:${otlpPort}`,
    `AI eval runner: http://127.0.0.1:${aiEvalRunnerHealthPort}/readyz`,
    `AI eval harness: ${aiEvalHarnessURL}`,
    `Local E2E scenarios: ${integrationScenarios
      .filter((scenario) => scenario.mode === "local-e2e")
      .map((scenario) => scenario.id)
      .join(", ")}`,
  ];

  if (args.includes("--dry-run")) {
    console.log(["Local integration dry run:", ...plan.map((line) => `- ${line}`)].join("\n"));
    return;
  }

  const processes = [];
  const containers = [];
  const runTraceFixture = {
    traceIdHex: randomHex(16),
    rootSpanIdHex: randomHex(8),
    serviceName: `checkout-api-integration-${Date.now()}`,
  };
  const metricNow = BigInt(Date.now()) * 1_000_000n;
  const runMetricFixture = {
    metricName: `cloudgrid.integration.metric.${Date.now()}`,
    serviceName: `metrics-integration-${Date.now()}`,
    startedAtUnixNano: String(metricNow - 60_000_000_000n),
    observedAtUnixNano: String(metricNow),
  };
  try {
    if (!externalInfra) {
      console.log("Starting isolated Docker infrastructure...");
      mkdirSync(integrationRunDir, { recursive: true });
      writeFileSync(
        natsConfigPath,
        [
          "jetstream {",
          '  store_dir: "/tmp/nats/jetstream"',
          "}",
          "",
          "http_port: 8222",
          `max_payload: ${baseEnv.CLOUDGRID_NATS_MAX_PAYLOAD || "8388608"}`,
          "",
        ].join("\n"),
      );
      containers.push(
        await startDockerContainer({
          name: `cloudgrid-${runID}-nats`,
          image: `nats:${baseEnv.CLOUDGRID_NATS_IMAGE_TAG || "2.14.0"}`,
          ports: [
            [natsPort, 4222],
            [natsMonitorPort, 8222],
          ],
          volumes: [[natsConfigPath, "/etc/nats/nats.conf", "ro"]],
          args: ["-c", "/etc/nats/nats.conf"],
        }),
      );
      await waitForHttp(`http://127.0.0.1:${natsMonitorPort}/healthz`, 20_000);
      containers.push(
        await startDockerContainer({
          name: `cloudgrid-${runID}-surrealdb`,
          image: `surrealdb/surrealdb:${baseEnv.CLOUDGRID_SURREALDB_IMAGE_TAG || "v3.0.5"}`,
          ports: [[surrealPort, 8000]],
          args: ["start", "--user", surrealUsername, "--pass", surrealPassword, "memory"],
        }),
      );
      await eventually(
        () => assertSurrealHttpReady(surrealUrl, "SurrealDB in-memory container"),
        20_000,
      );
    }

    console.log("Checking local infrastructure...");
    await assertNatsReady(natsUrl);
    await assertSurrealHttpReady(surrealUrl, "SurrealDB");
    const serviceEnv = {
      ...baseEnv,
      CLOUDGRID_NATS_URL: natsUrl,
      CLOUDGRID_SURREALDB_URL: surrealUrl,
      CLOUDGRID_SURREALDB_NAMESPACE: surrealNamespace,
      CLOUDGRID_SURREALDB_DATABASE: surrealDatabase,
      CLOUDGRID_SURREALDB_USERNAME: surrealUsername,
      CLOUDGRID_SURREALDB_PASSWORD: surrealPassword,
      CLOUDGRID_STORAGE_READ_HEALTH_HOST: "127.0.0.1",
      CLOUDGRID_STORAGE_READ_HEALTH_PORT: String(storageReadHealthPort),
      CLOUDGRID_STORAGE_WRITE_HEALTH_HOST: "127.0.0.1",
      CLOUDGRID_STORAGE_WRITE_HEALTH_PORT: String(storageWriteHealthPort),
      CLOUDGRID_CONTROL_PLANE_HEALTH_HOST: "127.0.0.1",
      CLOUDGRID_CONTROL_PLANE_HEALTH_PORT: String(controlPlaneHealthPort),
      CLOUDGRID_AI_EVAL_ENABLED: "true",
      CLOUDGRID_AI_EVAL_RUNNER_HEALTH_HOST: "127.0.0.1",
      CLOUDGRID_AI_EVAL_RUNNER_HEALTH_PORT: String(aiEvalRunnerHealthPort),
      CLOUDGRID_AI_EVAL_HARNESS_URL: aiEvalHarnessURL,
      CLOUDGRID_BFF_HOST: "127.0.0.1",
      CLOUDGRID_BFF_PORT: String(bffPort),
      CLOUDGRID_GRAPHQL_UI: "false",
      CLOUDGRID_AI_CHAT_HARNESS_MODE: "mock",
      CLOUDGRID_LOG_LEVEL: "debug",
      CLOUDGRID_SELF_OBSERVABILITY_ENABLED: "false",
      CLOUDGRID_OTLP_HTTP_ADDR: `127.0.0.1:${otlpPort}`,
      CLOUDGRID_OTLP_GRPC_ADDR: `127.0.0.1:${otlpGrpcPort}`,
      CLOUDGRID_DATASET_TRANSFER_DIR: datasetTransferDir,
    };

    console.log("Starting CloudGrid services...");
    processes.push(
      startProcess(
        "storage-write",
        ["go", "run", "-tags", "surrealdb", "./core/storage-write/cmd/storage-write"],
        serviceEnv,
      ),
    );
    await processes.at(-1).waitForLog("startup_ready", 20_000);

    processes.push(
      startProcess(
        "storage-read",
        ["go", "run", "-tags", "surrealdb", "./core/storage-read/cmd/storage-read"],
        serviceEnv,
      ),
    );
    await processes.at(-1).waitForLog("startup_ready", 20_000);

    processes.push(
      startProcess("control-plane", ["go", "run", "./core/control-plane/cmd/control-plane"], {
        ...serviceEnv,
      }),
    );
    await waitForHttp(`http://127.0.0.1:${controlPlaneHealthPort}/readyz`, 20_000);

    processes.push(
      startProcess(
        "ai-eval-harness",
        ["bun", "tooling/scripts/ai-eval-dev-harness.mjs"],
        serviceEnv,
      ),
    );
    await waitForHttp(`${aiEvalHarnessURL}/readyz`, 20_000);

    processes.push(
      startProcess(
        "ai-eval-runner",
        ["go", "run", "./core/ai-eval-runner/cmd/ai-eval-runner"],
        serviceEnv,
      ),
    );
    await waitForHttp(`http://127.0.0.1:${aiEvalRunnerHealthPort}/readyz`, 20_000);

    processes.push(
      startProcess("bff", ["bun", "run", "--cwd", "apps/backend", "src/index.ts"], {
        ...serviceEnv,
      }),
    );
    await waitForHttp(`http://127.0.0.1:${bffPort}/readyz`, 20_000);

    processes.push(
      startProcess("otlp-collector", ["go", "run", "./core/otlp-collector/cmd/otlp-collector"], {
        ...serviceEnv,
      }),
    );
    await waitForHttp(`http://127.0.0.1:${otlpPort}/readyz`, 20_000);

    console.log("Asserting public health endpoints...");
    await assertJsonStatus(`http://127.0.0.1:${bffPort}/livez`, "ok");
    await assertJsonStatus(`http://127.0.0.1:${bffPort}/readyz`, "ok");
    await assertJsonStatus(`http://127.0.0.1:${bffPort}/api/health`, "ok");
    await assertJsonStatus(`http://127.0.0.1:${storageWriteHealthPort}/readyz`, "ok");
    await assertJsonStatus(`http://127.0.0.1:${storageReadHealthPort}/readyz`, "ok");
    await assertJsonStatus(`http://127.0.0.1:${controlPlaneHealthPort}/readyz`, "ok");
    await assertJsonStatus(`http://127.0.0.1:${otlpPort}/readyz`, "ok");

    console.log("Asserting public GraphQL control-plane path...");
    const viewer = await graphql(bffPort, viewerOperation, {}, "Viewer");
    assert(
      viewer.data?.viewer?.user?.id === "local-user",
      "viewer query did not bootstrap local user",
    );
    assert(
      viewer.data.viewer.organizations?.[0]?.projects?.some((project) => project.id === "default"),
      "viewer query did not expose default local project",
    );
    const selected = await graphql(
      bffPort,
      selectProjectOperation,
      { projectId: "default" },
      "SelectProject",
    );
    assert(
      selected.data?.selectProject?.selectedProject?.id === "default",
      "selectProject mutation did not return selected default project",
    );
    const organizationId = viewer.data.viewer.organizations[0].id;

    await assertAdminGraphQLScenario(bffPort, organizationId, runID);
    await assertProjectSettingsScenario(bffPort, "default");
    await assertAiChatScenario(bffPort, organizationId, "default", runID);
    await assertAlertingScenario(bffPort, "default", runMetricFixture.metricName);

    console.log("Asserting shared frontend dashboard operations...");
    const dashboardName = `Integration dashboard ${Date.now()}`;
    const savedDashboard = await graphql(
      bffPort,
      saveDashboardOperation,
      {
        input: {
          name: dashboardName,
          description: null,
          tags: ["integration"],
          visibility: "personal",
          defaultTimeWindow: "PT1H",
          widgets: [
            {
              id: "widget-1",
              title: "Metric series",
              description: null,
              kind: "metric_timeseries",
              layout: { x: 0, y: 0, w: 6, h: 4 },
              richMetric: null,
              logs: null,
              traces: null,
              liveTraces: null,
              metric: {
                metricName: runMetricFixture.metricName,
                aggregation: "avg",
                groupBy: [],
                filters: [],
                timeWindow: "PT1H",
                interval: null,
                visualization: "line",
                legend: true,
                maxSeries: 20,
                thresholds: [],
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
            {
              id: "widget-3",
              title: "Metric comparison",
              description: null,
              kind: "metric_rich",
              layout: { x: 0, y: 4, w: 6, h: 4, minW: null, minH: null },
              metric: null,
              logs: null,
              traces: null,
              liveTraces: null,
              richMetric: {
                query: {
                  timeWindow: "PT1H",
                  interval: "PT1M",
                  queries: [
                    {
                      id: "query-a",
                      label: "Integration metric",
                      metricName: runMetricFixture.metricName,
                      aggregation: "avg",
                      groupBy: [],
                      filters: [],
                      maxSeries: 20,
                    },
                  ],
                  formulas: [],
                  displaySeries: [],
                },
                visualization: "line",
                legend: true,
                maxSeries: 20,
                thresholds: [],
              },
            },
            {
              id: "widget-4",
              title: "Recent traces",
              description: null,
              kind: "trace_table",
              layout: { x: 6, y: 4, w: 6, h: 4, minW: null, minH: null },
              metric: null,
              richMetric: null,
              logs: null,
              liveTraces: null,
              traces: {
                service: runTraceFixture.serviceName,
                query: null,
                operationName: null,
                spanName: null,
                status: null,
                minDurationMs: null,
                maxDurationMs: null,
                attributes: [],
                sort: "startedAt_desc",
                limit: 50,
                columns: ["started_at", "status", "service", "operation", "duration"],
              },
            },
            {
              id: "widget-5",
              title: "Live traces",
              description: null,
              kind: "live_trace_table",
              layout: { x: 0, y: 8, w: 12, h: 4, minW: null, minH: null },
              metric: null,
              richMetric: null,
              logs: null,
              traces: null,
              liveTraces: {
                service: runTraceFixture.serviceName,
                query: null,
                operationName: null,
                spanName: null,
                status: null,
                minDurationMs: null,
                maxDurationMs: null,
                attributes: [],
                limit: 50,
              },
            },
          ],
        },
      },
      "SaveDashboard",
    );
    const dashboard = savedDashboard.data?.saveDashboard;
    assert(dashboard?.id, "SaveDashboard did not return a dashboard id");
    assert(dashboard.widgets?.length === 5, "SaveDashboard did not persist all widget types");

    const dashboards = await graphql(
      bffPort,
      dashboardsOperation,
      { input: { includeBuiltins: true, query: dashboardName } },
      "Dashboards",
    );
    assert(
      dashboards.data?.dashboards?.items?.some((item) => item.id === dashboard.id),
      "Dashboards query did not return the saved dashboard",
    );

    const pin = await graphql(
      bffPort,
      setDashboardPinnedOperation,
      { input: { dashboardId: dashboard.id, pinned: true } },
      "SetDashboardPinned",
    );
    assert(
      pin.data?.setDashboardPinned?.pinnedDashboardIds?.includes(dashboard.id),
      "SetDashboardPinned did not pin the saved dashboard",
    );

    const reordered = await graphql(
      bffPort,
      reorderDashboardPinsOperation,
      { input: { dashboardIds: [dashboard.id] } },
      "ReorderDashboardPins",
    );
    assert(
      reordered.data?.reorderDashboardPins?.pinnedDashboardIds?.[0] === dashboard.id,
      "ReorderDashboardPins did not preserve the saved dashboard pin",
    );

    console.log("Opening GraphQL live trace subscription...");
    const liveTraceSubscription = await openLiveTraceSubscription(bffPort, runTraceFixture);

    console.log("Posting OTLP JSON and protobuf fixtures...");
    await postTraceJson(otlpPort, runTraceFixture);
    await postLogProtobuf(otlpPort);
    await postMetricJson(otlpPort, runMetricFixture);
    await postGeneratedFixtures(otlpPort);

    console.log("Asserting GraphQL live trace delivery...");
    await liveTraceSubscription.waitForTrace(runTraceFixture.traceIdHex, 20_000);
    await liveTraceSubscription.close();
    await eventually(() => {
      assert(
        processes
          .find((process) => process.name === "storage-read")
          ?.lines.some((line) => line.includes("telemetry.traces.live.stop")),
        "storage-read did not observe live stop",
      );
    }, 25_000);

    console.log("Asserting GraphQL read path...");
    await eventually(async () => {
      const traces = await graphql(
        bffPort,
        traceSearchOperation,
        { input: { service: runTraceFixture.serviceName, limit: 10 } },
        "TraceSearch",
      );
      const trace = traces.data?.traces?.items?.find(
        (item) => item.id === runTraceFixture.traceIdHex,
      );
      assert(trace, "GraphQL traces query did not return the JSON trace fixture");
      assert(trace.spanCount >= 1, "Trace summary did not include persisted span count");
    }, 20_000);

    const detail = await graphql(
      bffPort,
      traceDetailOperation,
      { id: runTraceFixture.traceIdHex },
      "TraceDetail",
    );
    assert(
      detail.data?.trace?.trace?.id === runTraceFixture.traceIdHex,
      "Trace detail missing trace",
    );
    assert(detail.data.trace.spans.length >= 1, "Trace detail missing spans");

    await eventually(async () => {
      const logs = await graphql(
        bffPort,
        logSearchOperation,
        { input: { service: "checkout-api", search: "order created", limit: 10 } },
        "LogSearch",
      );
      assert(logs.data?.logs?.items?.length >= 1, "GraphQL logs query did not return protobuf log");
    }, 20_000);

    const facets = await graphql(
      bffPort,
      telemetryFacetsOperation,
      { input: { service: runTraceFixture.serviceName, limit: 10 } },
      "TelemetryFacets",
    );
    assert(
      facets.data?.telemetryFacets?.services?.some(
        (facet) => facet.value === runTraceFixture.serviceName,
      ),
      "GraphQL telemetryFacets query did not return the trace service fixture",
    );

    await eventually(async () => {
      const metricNames = await graphql(
        bffPort,
        metricNamesOperation,
        {
          input: {
            query: runMetricFixture.metricName,
            from: new Date(Number(metricNow / 1_000_000n) - 60 * 60 * 1000).toISOString(),
            to: new Date(Number(metricNow / 1_000_000n) + 60 * 1000).toISOString(),
            limit: 10,
          },
        },
        "MetricNames",
      );
      const descriptor = metricNames.data?.metricNames?.items?.find(
        (item) => item.name === runMetricFixture.metricName,
      );
      assert(descriptor, "GraphQL metricNames query did not return the JSON metric fixture");

      const series = await graphql(
        bffPort,
        metricSeriesOperation,
        {
          input: {
            metricName: runMetricFixture.metricName,
            from: new Date(Number(metricNow / 1_000_000n) - 60 * 60 * 1000).toISOString(),
            to: new Date(Number(metricNow / 1_000_000n) + 60 * 1000).toISOString(),
            aggregation: "avg",
            interval: "PT1M",
            limit: 10,
          },
        },
        "MetricSeries",
      );
      const points = series.data?.metricSeries?.series?.flatMap((item) => item.points) ?? [];
      assert(points.length >= 1, "GraphQL metricSeries query did not return metric points");
      assert(
        points.some((point) => point.value === 42.5),
        "GraphQL metricSeries did not include the expected metric value",
      );
    }, 20_000);

    console.log("Asserting dashboard widget runtime queries...");
    await eventually(
      () =>
        assertDashboardWidgetRuntimeScenario(bffPort, {
          dashboardId: dashboard.id,
          dashboardName,
          from: new Date(Number(metricNow / 1_000_000n) - 60 * 60 * 1000).toISOString(),
          to: new Date(Date.now() + 60 * 1000).toISOString(),
        }),
      20_000,
    );

    const deleted = await graphql(
      bffPort,
      deleteDashboardOperation,
      { id: dashboard.id },
      "DeleteDashboard",
    );
    assert(
      deleted.data?.deleteDashboard === true,
      "DeleteDashboard did not delete saved dashboard",
    );

    await assertAiEvalScenario(bffPort, natsUrl, runID, runTraceFixture);

    console.log("Asserting collector failure mappings...");
    await assertCollectorProblem(otlpPort, {
      path: "/v1/traces",
      body: "{}",
      contentType: "text/plain",
      status: 415,
      id: "ERR-002",
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    await assertCollectorProblem(otlpPort, {
      path: "/v1/logs",
      body: "{",
      contentType: "application/json",
      status: 400,
      id: "ERR-008",
      code: "OTLP_DECODE_FAILED",
    });
    await assertCollectorProblem(otlpPort, {
      path: "/v1/logs",
      body: Buffer.from([0xff]),
      contentType: "application/x-protobuf",
      status: 400,
      id: "ERR-008",
      code: "OTLP_DECODE_FAILED",
    });
    await assertCollectorNatsStartupFailure(serviceEnv, await freePort());

    console.log("Asserting duplicate JetStream command handling...");
    await assertDuplicateCommandDoesNotRewrite(natsUrl, bffPort);

    console.log("Local integration checks passed.");
    console.log(
      "Collector NATS startup ERR-013 is covered by an isolated failing collector process.",
    );
  } finally {
    await Promise.allSettled(processes.reverse().map((process) => process.stop()));
    await Promise.allSettled(containers.reverse().map((container) => container.stop()));
    rmSync(resolve(repoRoot, ".cloudgrid", "integration", runID), {
      force: true,
      recursive: true,
    });
  }
}

function startProcess(name, cmd, env) {
  const lines = [];
  const proc = Bun.spawn({
    cmd,
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  collect(proc.stdout, name, lines);
  collect(proc.stderr, name, lines);
  return {
    name,
    proc,
    lines,
    async waitForLog(pattern, timeoutMs) {
      await eventually(() => {
        assert(
          lines.some((line) => line.includes(pattern)),
          `${name} did not log ${pattern}`,
        );
      }, timeoutMs);
    },
    async stop() {
      const pids = await processTree(proc.pid);
      terminatePids(pids, "SIGTERM");
      if (proc.exitCode === null) {
        proc.kill("SIGTERM");
      }
      await Promise.race([proc.exited, sleep(2_000)]);
      if (proc.exitCode === null) {
        terminatePids(pids, "SIGKILL");
        proc.kill("SIGKILL");
        await proc.exited;
      }
    },
  };
}

async function startDockerContainer({ name, image, ports, args, volumes = [] }) {
  const portArgs = ports.flatMap(([hostPort, containerPort]) => [
    "-p",
    `127.0.0.1:${hostPort}:${containerPort}`,
  ]);
  const volumeArgs = volumes.flatMap(([hostPath, containerPath, mode]) => [
    "-v",
    `${hostPath}:${containerPath}${mode ? `:${mode}` : ""}`,
  ]);
  const proc = Bun.spawn({
    cmd: ["docker", "run", "--rm", "--name", name, ...portArgs, ...volumeArgs, image, ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const lines = [];
  collect(proc.stdout, name, lines);
  collect(proc.stderr, name, lines);
  proc.exited.then((code) => {
    if (code !== 0) {
      console.error(`[${name}] docker container exited with ${code}`);
    }
  });
  await sleep(250);
  if (proc.exitCode !== null) {
    throw new Error(`${name} exited before becoming ready`);
  }
  return {
    name,
    proc,
    lines,
    async stop() {
      await Bun.spawn({
        cmd: ["docker", "rm", "-f", name],
        stdout: "ignore",
        stderr: "ignore",
      }).exited;
      await Promise.race([proc.exited, sleep(2_000)]);
    },
  };
}

async function processTree(rootPid) {
  const seen = new Set([rootPid]);
  const pending = [rootPid];
  while (pending.length > 0) {
    const pid = pending.pop();
    const children = await childPids(pid);
    for (const child of children) {
      if (!seen.has(child)) {
        seen.add(child);
        pending.push(child);
      }
    }
  }
  return [...seen].sort((left, right) => right - left);
}

async function childPids(pid) {
  const proc = Bun.spawn({
    cmd: ["pgrep", "-P", String(pid)],
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await streamText(proc.stdout);
  await proc.exited;
  return output
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function terminatePids(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

async function collect(stream, name, lines) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      lines.push(line);
      console.log(`[${name}] ${line}`);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer) {
    lines.push(buffer);
    console.log(`[${name}] ${buffer}`);
  }
}

async function postTraceJson(port, fixture) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/traces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "integration-trace-json",
    },
    body: JSON.stringify(buildTraceJsonFixture(fixture)),
  });
  assert(
    response.status === 200,
    `trace JSON ingest returned ${response.status}: ${await response.text()}`,
  );
}

async function postLogProtobuf(port) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
    method: "POST",
    headers: {
      "content-type": "application/x-protobuf",
      "x-request-id": "integration-log-protobuf",
    },
    body: protobufLogFixture,
  });
  assert(
    response.status === 200,
    `log protobuf ingest returned ${response.status}: ${await response.text()}`,
  );
}

async function postMetricJson(port, fixture) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/metrics`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": "integration-metric-json",
    },
    body: JSON.stringify(buildMetricJsonFixture(fixture)),
  });
  assert(
    response.status === 200,
    `metric JSON ingest returned ${response.status}: ${await response.text()}`,
  );
}

async function postGeneratedFixtures(port) {
  const requests = buildFixtureRequests({
    endpoint: `http://127.0.0.1:${port}`,
    fixtureSet: "generated",
    format: "json",
    signal: "all",
    seedContext: createSeedRunContext(),
    token: null,
  });
  for (const request of requests) {
    await postFixture(request);
  }
}

export function dashboardWidgetRuntimeRequests(dashboard, range) {
  const requests = [];
  for (const widget of dashboard.widgets ?? []) {
    const widgetLabel = `${dashboard.id}:${widget.id}`;
    if (widget.metric) {
      requests.push({
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetKind: widget.kind,
        operationName: "MetricSeries",
        document: metricSeriesOperation,
        variables: {
          input: {
            metricName: widget.metric.metricName,
            from: range.from,
            to: range.to,
            aggregation: widget.metric.aggregation,
            groupBy: widget.metric.groupBy ?? [],
            filters: widget.metric.filters ?? [],
            limit: widget.metric.maxSeries ?? 1000,
            ...(widget.metric.interval ? { interval: widget.metric.interval } : {}),
          },
        },
        assertResult(body) {
          assert(
            Array.isArray(body.data?.metricSeries?.series),
            `${widgetLabel} MetricSeries did not return a series array`,
          );
        },
      });
    }
    if (widget.richMetric) {
      requests.push({
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetKind: widget.kind,
        operationName: "RichMetricSeries",
        document: richMetricSeriesOperation,
        variables: {
          input: {
            from: range.from,
            to: range.to,
            query: widget.richMetric.query,
          },
        },
        assertResult(body) {
          assert(
            Array.isArray(body.data?.richMetricSeries?.series),
            `${widgetLabel} RichMetricSeries did not return a series array`,
          );
        },
      });
    }
    if (widget.logs) {
      requests.push({
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetKind: widget.kind,
        operationName: "LogSearch",
        document: logSearchOperation,
        variables: {
          input: {
            service: widget.logs.service ?? null,
            traceId: widget.logs.traceId ?? null,
            spanId: widget.logs.spanId ?? null,
            severity: widget.logs.severity ?? null,
            from: range.from,
            to: range.to,
            search: widget.logs.search ?? null,
            attributes: widget.logs.attributes ?? [],
            sort: widget.logs.sort ?? "timestamp_desc",
            limit: widget.logs.limit ?? 50,
          },
        },
        assertResult(body) {
          assert(
            Array.isArray(body.data?.logs?.items),
            `${widgetLabel} LogSearch did not return an items array`,
          );
        },
      });
    }
    if (widget.traces) {
      requests.push({
        dashboardId: dashboard.id,
        widgetId: widget.id,
        widgetKind: widget.kind,
        operationName: "TraceSearch",
        document: traceSearchOperation,
        variables: {
          input: {
            service: widget.traces.service ?? null,
            query: widget.traces.query ?? null,
            operationName: widget.traces.operationName ?? null,
            spanName: widget.traces.spanName ?? null,
            from: range.from,
            to: range.to,
            status: widget.traces.status ?? null,
            minDurationMs: widget.traces.minDurationMs ?? null,
            maxDurationMs: widget.traces.maxDurationMs ?? null,
            attributes: widget.traces.attributes ?? [],
            sort: widget.traces.sort ?? "startedAt_desc",
            limit: widget.traces.limit ?? 50,
          },
        },
        assertResult(body) {
          assert(
            Array.isArray(body.data?.traces?.items),
            `${widgetLabel} TraceSearch did not return an items array`,
          );
        },
      });
    }
  }
  return requests;
}

async function assertDashboardWidgetRuntimeScenario(
  port,
  { dashboardId, dashboardName, from, to },
) {
  const dashboards = await graphql(
    port,
    dashboardsOperation,
    { input: { includeBuiltins: true } },
    "Dashboards",
  );
  const items = dashboards.data?.dashboards?.items ?? [];
  assert(
    items.some((item) => item.id === dashboardId),
    "saved dashboard is missing at runtime",
  );
  assert(
    items.some((item) => item.name === dashboardName),
    "saved dashboard name is missing at runtime",
  );

  let executed = 0;
  let liveWidgets = 0;
  for (const dashboard of items) {
    for (const request of dashboardWidgetRuntimeRequests(dashboard, { from, to })) {
      const body = await graphql(port, request.document, request.variables, request.operationName);
      request.assertResult(body);
      executed += 1;
    }
    liveWidgets += (dashboard.widgets ?? []).filter((widget) => widget.liveTraces).length;
  }
  assert(executed >= 4, "dashboard runtime did not execute expected widget query operations");
  assert(liveWidgets >= 1, "dashboard runtime did not include a live trace widget");
}

async function assertAdminGraphQLScenario(port, organizationId, runID) {
  console.log("Asserting public GraphQL organization and project admin workflows...");
  const organizations = await graphql(port, organizationsOperation, {}, "Organizations");
  assert(
    organizations.data?.organizations?.some((organization) => organization.id === organizationId),
    "Organizations query did not return the local organization",
  );

  const organization = await graphql(
    port,
    organizationOperation,
    { id: organizationId },
    "Organization",
  );
  assert(
    organization.data?.organization?.id === organizationId,
    "Organization query did not return the requested organization",
  );

  const projects = await graphql(
    port,
    projectsOperation,
    { input: { organizationId } },
    "Projects",
  );
  assert(
    projects.data?.projects?.some((project) => project.id === "default"),
    "Projects query did not return the default project",
  );

  const projectName = `Integration project ${runID}`;
  const projectSlug = `integration-${runID}`;
  const created = await graphql(
    port,
    createProjectOperation,
    { input: { organizationId, name: projectName, slug: projectSlug } },
    "CreateProject",
  );
  const createdProject = created.data?.createProject;
  assert(createdProject?.id, "CreateProject did not return a project id");
  assert(createdProject.name === projectName, "CreateProject did not persist the project name");

  const project = await graphql(port, projectOperation, { id: createdProject.id }, "Project");
  assert(
    project.data?.project?.id === createdProject.id,
    "Project query did not return created project",
  );

  const members = await graphql(
    port,
    organizationMembersOperation,
    { organizationId },
    "OrganizationMembers",
  );
  assert(
    members.data?.organizationMembers?.some((member) => member.user.id === "local-user"),
    "OrganizationMembers did not include the local user",
  );

  const inviteEmail = `integration-${Date.now()}@example.com`;
  const invitation = await graphql(
    port,
    inviteOrganizationMemberOperation,
    { input: { organizationId, email: inviteEmail } },
    "InviteOrganizationMember",
  );
  assert(
    invitation.data?.inviteOrganizationMember?.email === inviteEmail,
    "InviteOrganizationMember did not return the invited email",
  );

  const invitations = await graphql(
    port,
    organizationInvitationsOperation,
    { organizationId },
    "OrganizationInvitations",
  );
  assert(
    invitations.data?.organizationInvitations?.some(
      (item) => item.id === invitation.data.inviteOrganizationMember.id,
    ),
    "OrganizationInvitations did not list the new invitation",
  );

  const revoked = await graphql(
    port,
    revokeOrganizationInvitationOperation,
    { id: invitation.data.inviteOrganizationMember.id },
    "RevokeOrganizationInvitation",
  );
  assert(
    revoked.data?.revokeOrganizationInvitation?.status === "revoked",
    "RevokeOrganizationInvitation did not revoke the invitation",
  );

  const updatedMember = await graphql(
    port,
    updateOrganizationMemberOperation,
    { input: { organizationId, userId: "local-user", role: "admin" } },
    "UpdateOrganizationMember",
  );
  assert(
    updatedMember.data?.updateOrganizationMember?.role === "admin",
    "UpdateOrganizationMember did not preserve the local admin role",
  );

  await graphqlProblem(
    port,
    removeOrganizationMemberOperation,
    { input: { organizationId, userId: "local-user" } },
    "RemoveOrganizationMember",
    "FORBIDDEN",
  );
}

async function assertProjectSettingsScenario(port, projectId) {
  console.log("Asserting public GraphQL project settings workflows...");
  const members = await graphql(port, projectMembersOperation, { projectId }, "ProjectMembers");
  assert(
    members.data?.projectMembers?.some((member) => member.userId === "local-user"),
    "ProjectMembers did not include the local user",
  );

  const updatedMember = await graphql(
    port,
    updateProjectMemberOperation,
    { projectId, userId: "local-user", role: "admin" },
    "UpdateProjectMember",
  );
  assert(
    updatedMember.data?.updateProjectMember?.role === "admin",
    "UpdateProjectMember did not preserve the local admin role",
  );
  await graphqlProblem(
    port,
    removeProjectMemberOperation,
    { projectId, userId: "local-user" },
    "RemoveProjectMember",
    "FORBIDDEN",
  );

  const credentialsBefore = await graphql(
    port,
    ingestCredentialsOperation,
    { projectId },
    "IngestCredentials",
  );
  assert(
    Array.isArray(credentialsBefore.data?.ingestCredentials?.items),
    "IngestCredentials did not return a credential list",
  );

  const createdCredential = await graphql(
    port,
    createIngestCredentialOperation,
    { input: { projectId, title: `Integration key ${Date.now()}` } },
    "CreateIngestCredential",
  );
  const credential = createdCredential.data?.createIngestCredential?.credential;
  assert(credential?.id, "CreateIngestCredential did not return a credential id");
  assert(
    createdCredential.data?.createIngestCredential?.secret,
    "CreateIngestCredential did not return the one-time secret",
  );

  const revokedCredential = await graphql(
    port,
    revokeIngestCredentialOperation,
    { id: credential.id },
    "RevokeIngestCredential",
  );
  assert(
    revokedCredential.data?.revokeIngestCredential?.revokedAt,
    "RevokeIngestCredential did not mark the credential revoked",
  );

  const retention = await graphql(port, retentionPolicyOperation, { projectId }, "RetentionPolicy");
  const retentionPolicy = retention.data?.retentionPolicy;
  assert(retentionPolicy?.version >= 1, "RetentionPolicy did not return a versioned policy");
  const updatedRetention = await graphql(
    port,
    updateRetentionPolicyOperation,
    {
      input: {
        projectId,
        expectedVersion: retentionPolicy.version,
        rules: retentionPolicy.rules.map(retentionRuleInput),
      },
    },
    "UpdateRetentionPolicy",
  );
  assert(
    updatedRetention.data?.updateRetentionPolicy?.version === retentionPolicy.version + 1,
    "UpdateRetentionPolicy did not advance the policy version",
  );

  const settings = await graphql(
    port,
    projectAiSettingsOperation,
    { projectId },
    "ProjectAiSettings",
  );
  const projectAiSettings = settings.data?.projectAiSettings;
  assert(projectAiSettings?.version >= 1, "ProjectAiSettings did not return versioned settings");
  const updatedSettings = await graphql(
    port,
    updateProjectAiSettingsOperation,
    { input: projectAiSettingsUpdateInput(projectAiSettings) },
    "UpdateProjectAiSettings",
  );
  assert(
    updatedSettings.data?.updateProjectAiSettings?.enabled === true,
    "UpdateProjectAiSettings did not enable AI Eval settings",
  );
}

async function assertAiChatScenario(port, organizationId, projectId, runID) {
  console.log("Asserting public GraphQL AI Chat workflow with mocked provider...");
  const currentSettings = await graphql(
    port,
    companyAiProviderSettingsOperation,
    { companyId: organizationId },
    "CompanyAiProviderSettings",
  );
  const version = currentSettings.data?.companyAiProviderSettings?.version;
  assert(Number.isInteger(version), "CompanyAiProviderSettings did not return a version");

  const providerId = `provider-${runID}`;
  const settings = await graphql(
    port,
    updateCompanyAiProviderSettingsOperation,
    {
      input: {
        companyId: organizationId,
        expectedVersion: version,
        providerProfile: {
          id: providerId,
          label: "Integration mock provider",
          providerKind: "openai",
          baseUrl: null,
          credentialValue: `integration-secret-${runID}`,
          models: { chat: ["mock-chat-model"] },
          parameters: {},
          timeoutMs: 30_000,
          maxConcurrency: null,
          disabled: false,
        },
        chatModelAlias: {
          id: `chat-${providerId}`,
          name: "chat-default",
          providerProfileId: providerId,
          model: "mock-chat-model",
          purpose: "chat",
          parameters: { extras: {} },
        },
      },
    },
    "UpdateCompanyAiProviderSettings",
  );
  assert(
    settings.data?.updateCompanyAiProviderSettings?.effective?.missingChatProvider === false,
    "UpdateCompanyAiProviderSettings did not enable AI Chat",
  );
  assert(
    settings.data.updateCompanyAiProviderSettings.providerProfile?.credentialRef?.startsWith(
      "managed:",
    ),
    "UpdateCompanyAiProviderSettings did not return a managed credential ref",
  );

  const firstUserMessage = `Investigate mocked provider ${runID}`;
  const created = await graphql(
    port,
    createAiChatConversationOperation,
    {
      input: {
        companyId: organizationId,
        projectId,
        title: null,
        firstUserMessage,
      },
    },
    "CreateAiChatConversation",
  );
  const conversation = created.data?.createAiChatConversation;
  assert(conversation?.id, "CreateAiChatConversation did not return a conversation id");
  assert(
    conversation.messages?.some((message) =>
      message.parts?.some((part) => part.type === "text" && part.text === firstUserMessage),
    ),
    "CreateAiChatConversation did not persist the first user message",
  );

  const streamEvents = await streamAiChatRun(port, {
    conversationId: conversation.id,
    projectId,
    userMessageClientId: `client-${runID}`,
    idempotencyKey: `idempotency-${runID}-${randomHex(8)}`,
    parts: [{ type: "text", text: "Summarize the current project state" }],
    timezone: "UTC",
  });
  assert(
    streamEvents.some((event) => event.type === "run.started"),
    "AI Chat stream did not emit run.started",
  );
  assert(
    streamEvents.some((event) => event.type === "text.delta"),
    "AI Chat stream did not emit text.delta",
  );
  assert(
    streamEvents.at(-1)?.type === "run.completed",
    `AI Chat stream terminal event was ${streamEvents.at(-1)?.type}`,
  );
  assert(
    !JSON.stringify(streamEvents).includes("integration-secret"),
    "AI Chat stream leaked credential material",
  );

  const history = await graphql(
    port,
    aiChatHistoryOperation,
    {
      input: {
        companyId: organizationId,
        projectId,
        includeArchived: false,
        first: 10,
        after: null,
      },
    },
    "AiChatHistory",
  );
  assert(
    history.data?.aiChatHistory?.projectGroups?.some((group) =>
      group.conversations?.some((item) => item.id === conversation.id),
    ),
    "AiChatHistory did not return the streamed conversation",
  );
}

function retentionRuleInput(rule) {
  const input = {
    dataClass: rule.dataClass,
    mode: rule.mode,
  };
  if (rule.retentionDays != null) {
    input.retentionDays = rule.retentionDays;
  }
  if (rule.softDeleteDays != null) {
    input.softDeleteDays = rule.softDeleteDays;
  }
  return input;
}

async function assertAlertingScenario(port, projectId, metricName) {
  console.log("Asserting public GraphQL alerting workflows...");
  const createdRule = await graphql(
    port,
    createAlertRuleOperation,
    {
      input: {
        projectId,
        name: `Integration metric threshold ${Date.now()}`,
        enabled: true,
        kind: "METRIC_THRESHOLD",
        severity: "ERROR",
        query: { metricName, aggregation: "avg" },
        condition: { operator: "GT", threshold: 10 },
        evaluationWindowSeconds: 300,
        pendingForSeconds: 60,
        cooldownSeconds: 600,
        notificationAdapterIds: ["in_app"],
      },
    },
    "CreateAlertRule",
  );
  const rule = createdRule.data?.createAlertRule;
  assert(rule?.id, "CreateAlertRule did not return a rule id");

  const listedRules = await graphql(port, alertRulesOperation, { projectId }, "AlertRules");
  assert(
    listedRules.data?.alertRules?.some((item) => item.id === rule.id),
    "AlertRules did not list the created rule",
  );

  const updatedRule = await graphql(
    port,
    updateAlertRuleOperation,
    {
      input: {
        id: rule.id,
        enabled: false,
        severity: "WARNING",
        expectedVersion: rule.version,
      },
    },
    "UpdateAlertRule",
  );
  assert(
    updatedRule.data?.updateAlertRule?.enabled === false,
    "UpdateAlertRule did not update the rule enabled state",
  );

  const startsAt = new Date(Date.now() - 60_000).toISOString();
  const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const createdSilence = await graphql(
    port,
    createAlertSilenceOperation,
    {
      input: {
        projectId,
        ruleId: rule.id,
        reason: "Integration maintenance window",
        startsAt,
        endsAt,
      },
    },
    "CreateAlertSilence",
  );
  const silence = createdSilence.data?.createAlertSilence;
  assert(silence?.id, "CreateAlertSilence did not return a silence id");
  assert(silence.active === true, "CreateAlertSilence did not create an active silence");

  const silences = await graphql(
    port,
    alertSilencesOperation,
    { projectId, ruleId: rule.id },
    "AlertSilences",
  );
  assert(
    silences.data?.alertSilences?.some((item) => item.id === silence.id),
    "AlertSilences did not list the created silence",
  );

  const history = await graphql(
    port,
    alertHistoryOperation,
    { projectId, ruleId: rule.id, first: 10 },
    "AlertHistory",
  );
  assert(
    Array.isArray(history.data?.alertHistory?.items),
    "AlertHistory did not return a connection",
  );

  const deletedSilence = await graphql(
    port,
    deleteAlertSilenceOperation,
    { id: silence.id },
    "DeleteAlertSilence",
  );
  assert(deletedSilence.data?.deleteAlertSilence === true, "DeleteAlertSilence did not delete");

  const deletedRule = await graphql(
    port,
    deleteAlertRuleOperation,
    { id: rule.id },
    "DeleteAlertRule",
  );
  assert(deletedRule.data?.deleteAlertRule === true, "DeleteAlertRule did not delete");
}

async function assertAiEvalScenario(port, natsUrl, runID, traceFixture) {
  console.log("Asserting public GraphQL AI Eval workspace workflows...");
  const datasetResult = await graphql(
    port,
    createDatasetOperation,
    {
      input: {
        name: `Integration dataset ${runID}`,
        description: "Dataset created by the local integration runner",
        tags: ["integration", runID],
      },
    },
    "CreateDataset",
  );
  const dataset = datasetResult.data?.createDataset;
  assert(dataset?.id, "CreateDataset did not return a dataset id");

  const scorerResult = await graphql(
    port,
    createScorerOperation,
    {
      input: {
        name: `Integration deterministic scorer ${runID}`,
        kind: "deterministic",
        definition: { type: "contains", field: "answer", expected: "ok" },
      },
    },
    "CreateScorer",
  );
  const scorer = scorerResult.data?.createScorer;
  assert(scorer?.id, "CreateScorer did not return a scorer id");

  const experimentResult = await graphql(
    port,
    createExperimentOperation,
    {
      input: {
        name: `Integration experiment ${runID}`,
        datasetId: dataset.id,
        datasetVersion: dataset.version,
        scorerIds: [scorer.id],
        solverRef: { kind: "integration", command: "cloudgrid-e2e" },
        tags: ["integration"],
      },
    },
    "CreateExperiment",
  );
  const experiment = experimentResult.data?.createExperiment;
  assert(experiment?.id, "CreateExperiment did not return an experiment id");

  const experimentRun = await graphql(
    port,
    startExperimentRunOperation,
    { input: { experimentId: experiment.id } },
    "StartExperimentRun",
  );
  assert(
    experimentRun.data?.startExperimentRun?.experimentId === experiment.id,
    "StartExperimentRun did not return a run for the created experiment",
  );

  const upload = await uploadDatasetImport(port, dataset.id, runID);
  const preparedImport = await graphql(
    port,
    prepareDatasetImportOperation,
    {
      input: {
        datasetId: dataset.id,
        uploadId: upload.uploadId,
        format: "jsonl",
        mapping: {
          input: [{ targetPath: "prompt", source: { jsonPath: "$.input.prompt" } }],
          expected: [{ targetPath: "answer", source: { jsonPath: "$.expected.answer" } }],
          metadata: [{ targetPath: "route", source: { jsonPath: "$.metadata.route" } }],
        },
        defaults: {
          split: "validation",
          reviewStatus: "reviewed",
          metadata: { source: "integration-local" },
          synthetic: false,
          allowPartialCommit: false,
        },
        previewLimit: 10,
      },
    },
    "PrepareDatasetImport",
  );
  const importJob = preparedImport.data?.prepareDatasetImport;
  assert(importJob?.status === "preview_ready", "PrepareDatasetImport did not create a preview");
  assert(importJob.validRows === 1, "PrepareDatasetImport did not detect the valid JSONL row");

  const committedImport = await graphql(
    port,
    commitDatasetImportOperation,
    {
      input: {
        importId: importJob.id,
        expectedDatasetVersion: 1,
        mode: "valid_rows_only",
      },
    },
    "CommitDatasetImport",
  );
  assert(
    committedImport.data?.commitDatasetImport?.status === "committed",
    "CommitDatasetImport did not commit the preview",
  );

  const appendedDataset = await graphql(
    port,
    appendDatasetItemsOperation,
    {
      input: {
        datasetId: dataset.id,
        expectedDatasetVersion: committedImport.data.commitDatasetImport.committedDatasetVersion,
        items: [
          {
            input: { prompt: `manual integration row ${runID}` },
            expected: { answer: "ok" },
            metadata: { source: "integration-local", mode: "manual-append" },
            split: "validation",
            reviewStatus: "reviewed",
          },
        ],
      },
    },
    "AppendDatasetItems",
  );
  assert(
    appendedDataset.data?.appendDatasetItems?.itemCount >= 2,
    "AppendDatasetItems did not persist a manual dataset row",
  );

  const agentRunId = `agent-run-${runID}`;
  try {
    await publishAiProjection(natsUrl, {
      runID,
      agentRunId,
      traceId: traceFixture.traceIdHex,
      spanId: traceFixture.rootSpanIdHex,
      serviceName: traceFixture.serviceName,
    });
  } catch (error) {
    const detail = describeError(error);
    console.error(`AI projection fixture publish failed: ${detail}`);
    throw new Error(`AI projection fixture publish failed: ${detail}`);
  }

  await eventually(async () => {
    const agentRuns = await graphql(
      port,
      agentRunsOperation,
      { input: { agentName: "checkout-agent", limit: 10 } },
      "AgentRuns",
    );
    assert(
      agentRuns.data?.agentRuns?.items?.some((item) => item.id === agentRunId),
      "AgentRuns did not return the persisted AI projection",
    );
  }, 20_000);

  const agentRun = await graphql(port, agentRunOperation, { id: agentRunId }, "AgentRun");
  assert(agentRun.data?.agentRun?.id === agentRunId, "AgentRun did not return persisted run");

  const datasets = await graphql(
    port,
    datasetsOperation,
    { input: { query: `Integration dataset ${runID}`, limit: 10 } },
    "Datasets",
  );
  assert(
    datasets.data?.datasets?.items?.some((item) => item.id === dataset.id && item.itemCount >= 1),
    `Datasets did not return the imported dataset item count: ${JSON.stringify(datasets.data?.datasets?.items)}`,
  );

  const datasetDetail = await graphql(port, datasetOperation, { id: dataset.id }, "Dataset");
  assert(datasetDetail.data?.dataset?.id === dataset.id, "Dataset did not return created dataset");
  assert(
    datasetDetail.data.dataset.items.items.length >= 1,
    "Dataset.items did not return committed import rows",
  );

  const scorers = await graphql(
    port,
    scorersOperation,
    { input: { query: "Integration deterministic", limit: 10 } },
    "Scorers",
  );
  assert(
    scorers.data?.scorers?.items?.some((item) => item.id === scorer.id),
    "Scorers did not return the created scorer",
  );

  const experiments = await graphql(
    port,
    experimentsOperation,
    { input: { datasetId: dataset.id, limit: 10 } },
    "Experiments",
  );
  assert(
    experiments.data?.experiments?.items?.some((item) => item.id === experiment.id),
    "Experiments did not return the created experiment",
  );

  const missingExperimentRun = await graphql(
    port,
    experimentRunOperation,
    { id: `experiment-run-${runID}` },
    "ExperimentRun",
  );
  assert(
    missingExperimentRun.data?.experimentRun === null,
    "ExperimentRun should be nullable for a missing run",
  );

  const annotationQueue = await graphql(
    port,
    annotationQueueOperation,
    { input: { status: "open", limit: 10 } },
    "AnnotationQueue",
  );
  assert(
    Array.isArray(annotationQueue.data?.annotationQueue?.items),
    "AnnotationQueue did not return a search result",
  );

  const quality = await graphql(
    port,
    aiQualityOverviewOperation,
    {
      input: {
        projectId: "default",
        agentName: "checkout-agent",
        service: traceFixture.serviceName,
        limit: 10,
      },
    },
    "AiQualityOverview",
  );
  assert(
    quality.data?.aiQualityOverview?.segments?.some((segment) => segment.runCount >= 1),
    "AiQualityOverview did not aggregate the persisted AI projection",
  );

  const exportJob = await graphql(
    port,
    startDatasetExportOperation,
    { input: { datasetId: dataset.id, format: "jsonl", includeMetadata: true } },
    "StartDatasetExport",
  );
  assert(
    exportJob.data?.startDatasetExport?.status === "ready",
    "StartDatasetExport did not produce a ready export",
  );

  const exportLookup = await graphql(
    port,
    datasetExportOperation,
    { id: exportJob.data.startDatasetExport.id },
    "DatasetExport",
  );
  assert(
    exportLookup.data?.datasetExport?.id === exportJob.data.startDatasetExport.id,
    "DatasetExport did not return the ready export",
  );

  const liveExperiment = await openLiveExperimentRunSubscription(port, `experiment-run-${runID}`);
  await liveExperiment.waitForHeartbeat(10_000);
  await liveExperiment.close();
}

function projectAiSettingsUpdateInput(settings) {
  return {
    projectId: settings.projectId,
    enabled: true,
    defaultProviderProfileId: "local-harness",
    defaultJudgeProfileId: "local-harness",
    defaultOptimizerProfileId: null,
    defaultEmbeddingProfileId: null,
    providerProfiles: [
      {
        id: "local-harness",
        label: "Local harness",
        providerKind: "local_harness",
        baseUrl: null,
        credentialRef: null,
        models: { default: "local-eval-model" },
        timeoutMs: 30_000,
        maxConcurrency: 2,
        disabled: false,
      },
    ],
    modelAliases: [
      {
        id: "judge-default",
        name: "judge-default",
        providerProfileId: "local-harness",
        model: "local-eval-model",
        purpose: "judge",
        parameters: {},
      },
    ],
    onlinePolicies: [],
    budget: {
      dailyUsd: 1,
      perRunUsd: null,
      deterministicOnly: true,
    },
    sampling: {
      defaultOnlineSampleRate: 0,
      maxOnlineSampleRate: 1,
      maxConcurrentExperimentItems: 4,
      maxConcurrentOptimizationCandidates: 2,
    },
    datasetDefaults: {
      splitAllocation: settings.datasetDefaults?.splitAllocation ?? {
        dev: 0.2,
        optimization: 0.4,
        validation: 0.2,
        regression: 0.15,
        holdout: 0.05,
      },
      smallDatasetReviewedThreshold: settings.datasetDefaults?.smallDatasetReviewedThreshold ?? 30,
      requireReviewForRegression: settings.datasetDefaults?.requireReviewForRegression ?? true,
    },
    expectedVersion: settings.version,
  };
}

async function graphqlProblem(port, query, variables, operationName, expectedCode) {
  const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const body = await response.json();
  const error = body.errors?.[0];
  assert(error, `${operationName} unexpectedly succeeded`);
  assert(
    error.extensions?.code === expectedCode,
    `${operationName} returned ${error.extensions?.code}, want ${expectedCode}`,
  );
}

async function uploadDatasetImport(port, datasetId, runID) {
  const filename = `ai-eval-${runID}.jsonl`;
  const line = JSON.stringify({
    input: { prompt: "Confirm order routing for integration checkout." },
    expected: { answer: "ok" },
    metadata: { route: "/integration", datasetId },
  });
  const form = new FormData();
  form.set("projectId", "default");
  form.set("filename", filename);
  form.set("file", new File([`${line}\n`], filename, { type: "application/jsonl" }));
  const response = await fetch(`http://127.0.0.1:${port}/api/ai-eval/dataset-imports/uploads`, {
    method: "POST",
    body: form,
  });
  const body = await response.json();
  assert(response.ok, `dataset import upload returned ${response.status}: ${JSON.stringify(body)}`);
  assert(body.uploadId, "dataset import upload did not return an upload id");
  return body;
}

async function publishAiProjection(natsUrl, { runID, agentRunId, traceId, spanId, serviceName }) {
  let nc;
  let step;
  try {
    step = "loading NATS client";
    const { JSONCodec, connect } = await loadNatsClient();
    step = "connecting to NATS for AI projection publish";
    nc = await connect({ servers: natsUrl, name: "cloudgrid-integration-ai-projection" });
    step = "creating JSON codec";
    const codec = JSONCodec();
    step = "creating JetStream context";
    const js = nc.jetstream();
    step = "checking TELEMETRY_INGEST stream";
    const jsm = await nc.jetstreamManager();
    const stream = await jsm.streams.info("TELEMETRY_INGEST");
    assert(
      stream.config.subjects?.includes("telemetry.ingest.ai_projections"),
      `TELEMETRY_INGEST subjects do not include telemetry.ingest.ai_projections: ${JSON.stringify(
        stream.config.subjects,
      )}`,
    );
    step = "building AI projection command";
    const startedAt = new Date(Date.now() - 5_000).toISOString();
    const endedAt = new Date().toISOString();
    const command = {
      ...bridgeEnvelope(`integration-ai-projection-${runID}`),
      commandId: `integration-ai-projection-${runID}`,
      traceId,
      spanId,
      kind: "agent_run",
      projection: {
        id: agentRunId,
        traceId,
        rootSpanId: spanId,
        agent: { id: "checkout-agent", name: "checkout-agent", version: "integration" },
        status: "ok",
        startedAt,
        endedAt,
        durationMs: 5_000,
        tokenTotals: { input: 11, output: 7, total: 18 },
        costEstimate: { amount: 0, currency: "USD" },
        metadata: {
          environment: "integration",
          service: serviceName,
          route: "/integration",
        },
        transcript: [
          {
            role: "assistant",
            content: "ok",
            contentDigest: "sha256:integration",
            spanId,
            timestamp: endedAt,
          },
        ],
        llmCalls: [],
        toolCalls: [],
        retrievalEvents: [],
        evalResults: [],
      },
    };
    step = "publishing telemetry.ingest.ai_projections";
    await js.publish("telemetry.ingest.ai_projections", codec.encode(command));
  } catch (error) {
    throw new Error(`${step} failed: ${describeError(error)}`);
  } finally {
    if (nc) {
      try {
        await nc.drain();
      } catch (error) {
        console.warn(`AI projection NATS drain failed after ${step}: ${describeError(error)}`);
      }
    }
  }
}

function describeError(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function openLiveExperimentRunSubscription(port, experimentRunId) {
  if (!globalThis.WebSocket) {
    throw new Error("Bun WebSocket client is required for live experiment integration checks");
  }
  const messages = [];
  let completed = false;
  const operationId = `live-experiment-${Date.now()}`;
  const socket = new globalThis.WebSocket(`ws://127.0.0.1:${port}/graphql`, "graphql-transport-ws");

  socket.addEventListener("message", (message) => {
    const parsed = parseSocketMessage(message.data);
    if (parsed) {
      messages.push(parsed);
    }
  });
  socket.addEventListener("error", () => {
    messages.push({ type: "error", payload: "WebSocket client error" });
  });

  await waitForSocketOpen(socket, 10_000);
  socket.send(JSON.stringify({ type: "connection_init" }));
  await eventually(() => {
    assert(
      messages.some((message) => message.type === "connection_ack"),
      "GraphQL WebSocket did not acknowledge live experiment connection",
    );
  }, 10_000);

  socket.send(
    JSON.stringify({
      id: operationId,
      type: "subscribe",
      payload: {
        query: liveExperimentRunSubscriptionOperation,
        variables: { input: { experimentRunId } },
      },
    }),
  );

  return {
    async waitForHeartbeat(timeoutMs) {
      await eventually(() => {
        assert(
          !messages.some((message) => message.type === "error" || message.payload?.errors?.length),
          "liveExperimentRun subscription returned an error",
        );
        assert(
          messages.some(
            (message) =>
              message.id === operationId &&
              message.type === "next" &&
              message.payload?.data?.liveExperimentRun?.type === "heartbeat",
          ),
          "liveExperimentRun subscription did not receive a heartbeat",
        );
      }, timeoutMs);
    },
    async close() {
      if (completed) {
        return;
      }
      completed = true;
      socket.send(JSON.stringify({ id: operationId, type: "complete" }));
      await sleep(250);
      socket.close();
    },
  };
}

function bridgeEnvelope(requestId) {
  const checkedAt = new Date().toISOString();
  return {
    requestId,
    issuedAt: checkedAt,
    authContext: {
      mode: "local",
      authMode: "local",
      principalId: "local-user",
      principalDisplayName: "Local User",
      principalEmail: "local@cloudgrid.dev",
      principalEmailVerified: true,
      tenantId: "local",
      companyId: "local",
      projectId: "default",
      scopes: [
        "telemetry:read",
        "telemetry:write",
        "telemetry:live",
        "control:read",
        "control:write",
      ],
      ingestAllowed: true,
      readAllowed: true,
      checkedAt,
    },
  };
}

async function openLiveTraceSubscription(port, fixture) {
  if (!globalThis.WebSocket) {
    throw new Error("Bun WebSocket client is required for live trace integration checks");
  }
  const messages = [];
  let completed = false;
  const operationId = `live-traces-${Date.now()}`;
  const socket = new globalThis.WebSocket(`ws://127.0.0.1:${port}/graphql`, "graphql-transport-ws");

  socket.addEventListener("message", (message) => {
    const parsed = parseSocketMessage(message.data);
    if (parsed) {
      messages.push(parsed);
    }
  });
  socket.addEventListener("error", () => {
    messages.push({ type: "error", payload: "WebSocket client error" });
  });

  await waitForSocketOpen(socket, 10_000);
  socket.send(JSON.stringify({ type: "connection_init" }));
  await eventually(() => {
    assert(
      messages.some((message) => message.type === "connection_ack"),
      "GraphQL WebSocket did not acknowledge connection",
    );
  }, 10_000);

  socket.send(
    JSON.stringify({
      id: operationId,
      type: "subscribe",
      payload: {
        query: liveTraceSubscriptionOperation,
        variables: { input: { service: fixture.serviceName, limit: 10 } },
      },
    }),
  );
  await eventually(() => {
    assert(
      messages.some(
        (message) =>
          message.id === operationId &&
          message.type === "next" &&
          message.payload?.data?.liveTraces?.type === "heartbeat",
      ),
      "liveTraces subscription did not receive initial heartbeat",
    );
    assert(
      !messages.some((message) => message.type === "error" || message.payload?.errors?.length),
      "liveTraces subscription returned an error",
    );
  }, 10_000);

  return {
    async waitForTrace(traceId, timeoutMs) {
      await eventually(() => {
        assert(
          !messages.some((message) => message.type === "error" || message.payload?.errors?.length),
          "liveTraces subscription returned an error",
        );
        const event = messages
          .filter((message) => message.id === operationId && message.type === "next")
          .map((message) => message.payload?.data?.liveTraces)
          .find((liveEvent) => liveEvent?.trace?.id === traceId);
        assert(event, `liveTraces did not receive trace ${traceId}`);
        assert(
          event.type === "added" || event.type === "updated",
          `unexpected live type ${event.type}`,
        );
        assert(event.trace.serviceName === fixture.serviceName, "live trace service mismatch");
        assert(event.trace.spanCount >= 1, "live trace span count missing");
      }, timeoutMs);
    },
    async close() {
      if (completed) {
        return;
      }
      completed = true;
      socket.send(JSON.stringify({ id: operationId, type: "complete" }));
      await sleep(250);
      socket.close();
    },
  };
}

async function assertCollectorProblem(port, scenario) {
  const response = await fetch(`http://127.0.0.1:${port}${scenario.path}`, {
    method: "POST",
    headers: { "content-type": scenario.contentType },
    body: scenario.body,
  });
  const body = await response.json();
  assert(response.status === scenario.status, `${scenario.path} status ${response.status}`);
  assert(body.error?.id === scenario.id, `${scenario.path} problem id ${body.error?.id}`);
  assert(body.error?.code === scenario.code, `${scenario.path} problem code ${body.error?.code}`);
}

async function assertCollectorNatsStartupFailure(baseEnv, port) {
  const proc = startProcess(
    "otlp-collector-nats-failure",
    ["go", "run", "./core/otlp-collector/cmd/otlp-collector"],
    {
      ...baseEnv,
      CLOUDGRID_NATS_URL: "nats://127.0.0.1:1",
      CLOUDGRID_OTLP_HTTP_ADDR: `127.0.0.1:${port}`,
    },
  );
  try {
    await eventually(async () => {
      const exitCode = await Promise.race([proc.proc.exited, sleep(50).then(() => null)]);
      assert(
        exitCode !== null && exitCode !== 0,
        "collector did not fail startup with unavailable NATS",
      );
    }, 10_000);
    assert(
      proc.lines.some((line) => line.includes("ERR-013")),
      "collector NATS failure missing ERR-013",
    );
  } finally {
    await proc.stop();
  }
}

async function assertDuplicateCommandDoesNotRewrite(natsUrl, bffPort) {
  const { JSONCodec, connect } = await loadNatsClient();
  const commandId = `integration-duplicate-${Date.now()}`;
  const commands = duplicateCommands(commandId, "integration-duplicate");
  const nc = await connect({ servers: natsUrl, name: "cloudgrid-integration-runner" });
  try {
    const js = nc.jetstream();
    const codec = JSONCodec();
    await js.publish("telemetry.ingest.traces", codec.encode(commands.original));
    await eventually(async () => {
      const detail = await graphql(
        bffPort,
        traceDetailOperation,
        { id: commands.originalTraceId },
        "TraceDetail",
      );
      assert(
        detail.data?.trace?.trace?.id === commands.originalTraceId,
        "original duplicate trace missing",
      );
    }, 20_000);

    await js.publish("telemetry.ingest.traces", codec.encode(commands.rewrite));
    await sleep(1_500);

    const rewrite = await graphql(
      bffPort,
      traceSearchOperation,
      { input: { service: "duplicate-rewrite", limit: 10 } },
      "TraceSearch",
    );
    assert(
      !rewrite.data?.traces?.items?.some((item) => item.id === commands.rewriteTraceId),
      "duplicate command rewrote data with second payload",
    );
  } finally {
    await nc.drain();
  }
}

function persistTraceCommand({
  commandId,
  requestId,
  issuedAt,
  traceId,
  spanId,
  serviceName,
  spanName,
  startedAt,
  endedAt,
}) {
  return {
    requestId,
    issuedAt,
    commandId,
    source: "otlp-traces",
    traces: [
      {
        id: traceId,
        serviceName,
        startedAt,
        endedAt,
        durationMs: 25,
        rootSpanId: spanId,
        status: "ok",
        attributes: { "service.name": serviceName },
      },
    ],
    spans: [
      {
        id: spanId,
        traceId,
        name: spanName,
        serviceName,
        startedAt,
        endedAt,
        durationMs: 25,
        status: "ok",
        attributes: { "service.name": serviceName },
        events: [],
      },
    ],
    logs: [],
  };
}

async function graphql(port, query, variables, operationName) {
  const response = await fetch(`http://127.0.0.1:${port}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationName, query, variables }),
  });
  const body = await response.json();
  if (body.errors?.length) {
    const errors = body.errors.map((error) => ({
      message: error.message,
      path: error.path,
      extensions: error.extensions,
    }));
    console.error(`GraphQL ${operationName ?? "operation"} errors`, errors);
    throw new Error(`GraphQL ${operationName ?? "operation"} errors: ${JSON.stringify(errors)}`);
  }
  return body;
}

async function streamAiChatRun(port, input) {
  const response = await fetch(`http://127.0.0.1:${port}/api/ai-chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  assert(response.ok, `AI Chat stream returned ${response.status}: ${body}`);
  return body
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
      return JSON.parse(data);
    });
}

async function assertNatsReady(natsUrl) {
  const { connect } = await loadNatsClient();
  const nc = await connect({ servers: natsUrl, name: "cloudgrid-integration-prereq" });
  await nc.drain();
}

async function loadNatsClient() {
  return import(pathToFileURL(join(repoRoot, "apps/backend/node_modules/nats/index.js")).href);
}

async function assertSurrealHttpReady(value, label) {
  const url = new URL(value);
  url.pathname = "/health";
  url.search = "";
  const response = await fetch(url).catch((error) => {
    throw new Error(`${label} is not reachable at ${url.toString()}: ${error.message}`);
  });
  assert(response.ok, `${label} health returned ${response.status}`);
}

async function waitForHttp(url, timeoutMs) {
  await eventually(async () => {
    const response = await fetch(url).catch(() => null);
    assert(response?.ok, `${url} is not ready`);
  }, timeoutMs);
}

async function assertJsonStatus(url, expectedStatus) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned ${response.status}`);
  const body = await response.json();
  assert(body.status === expectedStatus, `${url} status ${body.status}`);
}

async function waitForSocketOpen(socket, timeoutMs) {
  if (socket.readyState === WebSocket.OPEN) {
    return;
  }
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("GraphQL WebSocket did not open"));
    }, timeoutMs);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolvePromise();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("GraphQL WebSocket failed to open"));
      },
      { once: true },
    );
  });
}

function parseSocketMessage(data) {
  try {
    return typeof data === "string" ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

async function streamText(stream) {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of stream) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function eventually(fn, timeoutMs, intervalMs = 250) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }
  throw lastError ?? new Error("timed out");
}

function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePromise(address.port));
    });
    server.on("error", reject);
  });
}

function hexToBase64(value) {
  return Buffer.from(value, "hex").toString("base64");
}

function randomHex(byteLength) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(byteLength))).toString("hex");
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
