import { describe, expect, test } from "bun:test";
import { createLogger } from "@cloudgrid/runtime";
import type {
  AgentRun,
  AiQualityOverview,
  CreateDatasetInput,
  Dataset,
  DatasetItem,
  ExperimentRun,
  ExperimentRunEvent,
  LiveExperimentRunInput,
  ProjectAiSettings,
  UpdateProjectAiSettingsInput,
} from "@cloudgrid/ui-contracts";
import { parse, subscribe } from "graphql";
import {
  MessageBridgeCloudGridBridge,
  type BridgeMessage,
  type EphemeralPubSub,
  type RequestReplyClient,
} from "./bridge";
import { createAppWithBridge, createCloudGridSchema } from "./graphql";

describe("AI-eval bridge", () => {
  test("routes agent run searches through the portable request/reply adapter", async () => {
    const requests: Array<{ subject: string; payload: Record<string, unknown> }> = [];
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        requests.push({ subject, payload });
        return { items: [agentRun()], nextCursor: null };
      }),
      2000,
      createLogger("bff"),
    );

    const result = await bridge.agentRuns({ agentName: "support", limit: 10 });

    expect(result.items[0]?.id).toBe("agent-run-1");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      subject: "eval.agent_runs.search",
      payload: {
        input: { agentName: "support", limit: 10 },
      },
    });
  });

  test("rejects invalid AI-eval bridge replies before GraphQL mapping", async () => {
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply(() => ({ items: [{ id: "agent-run-1" }], nextCursor: null })),
      2000,
      createLogger("bff"),
    );

    await expect(bridge.agentRuns({ limit: 10 })).rejects.toMatchObject({
      extensions: { code: "MESSAGE_BRIDGE_UNAVAILABLE" },
    });
  });

  test("starts and stops live experiment subscriptions through storage-read subjects", async () => {
    const subjects: string[] = [];
    let sink: ((message: BridgeMessage) => void | Promise<void>) | undefined;
    const pubSub: EphemeralPubSub = {
      async subscribe(_subject, onMessage) {
        sink = onMessage;
        return {
          async [Symbol.asyncDispose]() {
            subjects.push("disposed");
          },
        };
      },
      async publish() {},
    };
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        subjects.push(subject);
        if (subject === "eval.live.start") {
          expect(payload).toMatchObject({
            experimentRunId: "experiment-run-1",
            sinkSubject: expect.stringContaining("eval.live.events."),
          });
          queueMicrotask(() => {
            void sink?.({
              subject: "eval.live.events.bff.sub",
              data: encodeJson(experimentRunEvent()),
            });
          });
          return { subscriptionId: payload.subscriptionId };
        }
        return { subscriptionId: payload.subscriptionId };
      }),
      2000,
      createLogger("bff"),
      { bffInstanceId: "bff", pubSub, subscriptionId: () => "sub" },
    );

    const iterator = bridge.subscribeLiveExperimentRun({ experimentRunId: "experiment-run-1" });
    const first = await iterator.next();
    await iterator.return?.();

    expect(first.value).toMatchObject({ type: "progress", seq: 1 });
    expect(subjects).toEqual(["eval.live.start", "disposed", "eval.live.stop"]);
  });

  test("routes AI-eval settings and quality requests to approved subjects", async () => {
    const requests: Array<{ subject: string; payload: Record<string, unknown> }> = [];
    const bridge = new MessageBridgeCloudGridBridge(
      requestReply((subject, payload) => {
        requests.push({ subject, payload });
        if (subject === "control.ai_settings.get" || subject === "control.ai_settings.update") {
          return { settings: projectAiSettings() };
        }
        return aiQualityOverview();
      }),
      2000,
      createLogger("bff"),
    );

    await bridge.projectAiSettings("project-1");
    await bridge.aiQualityOverview({ projectId: "project-1", agentName: "support", limit: 10 });
    await bridge.updateProjectAiSettings(projectAiSettingsInput());

    expect(requests.map((request) => request.subject)).toEqual([
      "control.ai_settings.get",
      "eval.quality.overview",
      "control.ai_settings.update",
    ]);
    expect(requests[0]?.payload).toMatchObject({ projectId: "project-1" });
    expect(requests[1]?.payload).toMatchObject({
      input: { projectId: "project-1", agentName: "support", limit: 10 },
    });
    expect(requests[2]?.payload).toMatchObject({
      expectedVersion: 1,
      input: { projectId: "project-1", expectedVersion: 1 },
    });
  });
});

describe("AI-eval GraphQL resolvers", () => {
  test("routes AI-eval queries and mutations through the bridge", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const { app } = createAppWithBridge(
      bridge({
        async agentRuns(input) {
          calls.push({ method: "agentRuns", input });
          return { items: [agentRun()], nextCursor: null };
        },
        async createDataset(input) {
          calls.push({ method: "createDataset", input });
          return dataset();
        },
        async projectAiSettings(projectId) {
          calls.push({ method: "projectAiSettings", input: projectId });
          return projectAiSettings();
        },
        async aiQualityOverview(input) {
          calls.push({ method: "aiQualityOverview", input });
          return aiQualityOverview();
        },
        async updateProjectAiSettings(input) {
          calls.push({ method: "updateProjectAiSettings", input });
          return projectAiSettings();
        },
      }),
      { graphqlUI: false },
    );

    const queryResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query AgentRuns($input: AgentRunSearchInput) {
            agentRuns(input: $input) {
              items { id agent { name } transcript { role spanId } }
              nextCursor
            }
          }
        `,
        variables: { input: { agentName: "support", limit: 5 } },
      }),
    });
    const mutationResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation CreateDataset($input: CreateDatasetInput!) {
            createDataset(input: $input) { id name version itemCount tags }
          }
        `,
        variables: { input: { name: "Regression", tags: ["nightly"] } },
      }),
    });
    const settingsResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          query AiSettings($projectId: ID!, $quality: AiQualityOverviewInput!) {
            projectAiSettings(projectId: $projectId) { projectId enabled version }
            aiQualityOverview(input: $quality) { projectId segments { key runCount regressionCount } }
          }
        `,
        variables: {
          projectId: "project-1",
          quality: { projectId: "project-1", agentName: "support", limit: 10 },
        },
      }),
    });
    const updateSettingsResponse = await app.request("/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation UpdateAiSettings($input: UpdateProjectAiSettingsInput!) {
            updateProjectAiSettings(input: $input) { projectId enabled version }
          }
        `,
        variables: { input: projectAiSettingsInput() },
      }),
    });

    const queryBody = await queryResponse.json();
    const mutationBody = await mutationResponse.json();
    const settingsBody = await settingsResponse.json();
    const updateSettingsBody = await updateSettingsResponse.json();

    expect(queryBody.errors).toBeUndefined();
    expect(queryBody.data.agentRuns.items[0]).toMatchObject({
      id: "agent-run-1",
      agent: { name: "support" },
    });
    expect(mutationBody.errors).toBeUndefined();
    expect(mutationBody.data.createDataset).toMatchObject({
      id: "dataset-1",
      name: "Regression",
    });
    expect(settingsBody.errors).toBeUndefined();
    expect(settingsBody.data.projectAiSettings).toMatchObject({
      projectId: "project-1",
      enabled: true,
    });
    expect(settingsBody.data.aiQualityOverview.segments[0]).toMatchObject({
      key: "agent:support",
      runCount: 12,
    });
    expect(updateSettingsBody.errors).toBeUndefined();
    expect(updateSettingsBody.data.updateProjectAiSettings).toMatchObject({
      projectId: "project-1",
      enabled: true,
    });
    expect(calls).toEqual([
      { method: "agentRuns", input: { agentName: "support", limit: 5 } },
      { method: "createDataset", input: { name: "Regression", tags: ["nightly"] } },
      { method: "projectAiSettings", input: "project-1" },
      {
        method: "aiQualityOverview",
        input: { projectId: "project-1", agentName: "support", limit: 10 },
      },
      { method: "updateProjectAiSettings", input: projectAiSettingsInput() },
    ]);
  });

  test("liveExperimentRun validates input and streams bridge events", async () => {
    let receivedInput: LiveExperimentRunInput | undefined;
    const result = await subscribe({
      schema: createCloudGridSchema(),
      document: parse(`
        subscription Live($input: LiveExperimentRunInput!) {
          liveExperimentRun(input: $input) {
            type
            seq
            receivedAt
            run { id status summary }
          }
        }
      `),
      variableValues: { input: { experimentRunId: "experiment-run-1" } },
      contextValue: {
        hono: {
          get: () =>
            bridge({
              subscribeLiveExperimentRun(input) {
                receivedInput = input;
                return liveExperimentEvents([experimentRunEvent()]);
              },
            }),
        },
        requestId: "req-live-eval",
        logger: createLogger("bff"),
      },
    });

    if (!Symbol.asyncIterator || !(Symbol.asyncIterator in result)) {
      throw new Error("expected async iterable subscription result");
    }
    const first = await result.next();
    await result.return?.();

    if (first.done) {
      throw new Error("expected live experiment event");
    }
    expect(first.value.data?.liveExperimentRun).toMatchObject({
      type: "progress",
      seq: 1,
      run: { id: "experiment-run-1", status: "running" },
    });
    expect(receivedInput).toEqual({ experimentRunId: "experiment-run-1" });
  });
});

function requestReply(
  handle: (subject: string, payload: Record<string, unknown>) => unknown,
): RequestReplyClient {
  return {
    async request(subject, payload) {
      const decoded = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
      return encodeJson({
        requestId: decoded.requestId,
        ok: true,
        data: handle(subject, decoded),
      });
    },
  };
}

function bridge(
  overrides: Partial<InstanceType<typeof MessageBridgeCloudGridBridge>> = {},
): InstanceType<typeof MessageBridgeCloudGridBridge> {
  return {
    async agentRuns() {
      return { items: [], nextCursor: null };
    },
    async agentRun() {
      return null;
    },
    async datasets() {
      return { items: [], nextCursor: null };
    },
    async dataset() {
      return null;
    },
    async datasetItems() {
      return { items: [], nextCursor: null };
    },
    async scorers() {
      return { items: [], nextCursor: null };
    },
    async experiments() {
      return { items: [], nextCursor: null };
    },
    async experimentRun() {
      return null;
    },
    async experimentRuns() {
      return { items: [], nextCursor: null };
    },
    async datasetItemRuns() {
      return { items: [], nextCursor: null };
    },
    async evalResults() {
      return { items: [], nextCursor: null };
    },
    async annotationQueue() {
      return { items: [], nextCursor: null };
    },
    async projectAiSettings() {
      return projectAiSettings();
    },
    async aiQualityOverview() {
      return aiQualityOverview();
    },
    async createDataset(_input: CreateDatasetInput) {
      return dataset();
    },
    async appendDatasetItems() {
      return dataset();
    },
    async promoteSpanToDatasetItem() {
      return datasetItem();
    },
    async createScorer() {
      return {
        id: "scorer-1",
        name: "Exact",
        kind: "deterministic",
        definition: {},
        version: 1,
      };
    },
    async createExperiment() {
      return {
        id: "experiment-1",
        name: "Regression",
        datasetId: "dataset-1",
        datasetVersion: 1,
        scorerIds: ["scorer-1"],
        createdAt: "2026-05-12T10:00:00.000Z",
        tags: [],
      };
    },
    async startExperimentRun() {
      return experimentRun();
    },
    async cancelExperimentRun() {
      return experimentRun();
    },
    async startOptimizationRun() {
      return experimentRun();
    },
    async promotePromptVersion() {
      return {
        id: "prompt-version-1",
        name: "base",
        text: "Hello",
        hash: "hash",
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async resolveAnnotation() {
      return {
        id: "annotation-1",
        targetTraceId: "trace-1",
        reason: "failed",
        status: "resolved",
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async updateProjectAiSettings() {
      return projectAiSettings();
    },
    subscribeLiveExperimentRun() {
      return liveExperimentEvents([]);
    },
    async searchTraces() {
      return { items: [], nextCursor: null };
    },
    async getTraceDetail() {
      return null;
    },
    async searchLogs() {
      return { items: [], nextCursor: null };
    },
    async telemetryFacets() {
      return { services: [], operations: [], spanNames: [], severities: [], attributeKeys: [] };
    },
    subscribeLiveTraces() {
      return liveTraceEvents([]);
    },
    async health() {
      return "ok" as const;
    },
    async close() {},
    ...overrides,
  } as InstanceType<typeof MessageBridgeCloudGridBridge>;
}

async function* liveExperimentEvents(
  events: ExperimentRunEvent[],
): AsyncIterableIterator<ExperimentRunEvent> {
  for (const event of events) {
    yield event;
  }
}

async function* liveTraceEvents(_events: never[] = []): AsyncIterableIterator<never> {}

function agentRun(): AgentRun {
  return {
    id: "agent-run-1",
    traceId: "trace-1",
    rootSpanId: "span-1",
    agent: { name: "support" },
    status: "ok",
    startedAt: "2026-05-12T10:00:00.000Z",
    transcript: [{ role: "user", spanId: "span-1" }],
    llmCalls: [],
    toolCalls: [],
    retrievalEvents: [],
    evalResults: [],
  };
}

function dataset(): Dataset {
  return {
    id: "dataset-1",
    name: "Regression",
    version: 1,
    createdAt: "2026-05-12T10:00:00.000Z",
    itemCount: 0,
    reviewedItemCount: 0,
    splitCounts: {},
    health: {
      status: "needs_review",
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
    tags: ["nightly"],
  };
}

function datasetItem(): DatasetItem {
  return {
    id: "dataset-item-1",
    datasetId: "dataset-1",
    version: 1,
    input: {},
    metadata: {},
    split: "dev",
    reviewStatus: "unreviewed",
    synthetic: false,
    leakageWarnings: [],
  };
}

function experimentRun(): ExperimentRun {
  return {
    id: "experiment-run-1",
    experimentId: "experiment-1",
    solverRef: {},
    status: "running",
    startedAt: "2026-05-12T10:00:00.000Z",
    summary: {},
  };
}

function experimentRunEvent(): ExperimentRunEvent {
  return {
    type: "progress",
    seq: 1,
    receivedAt: "2026-05-12T10:00:01.000Z",
    run: experimentRun(),
  };
}

function projectAiSettings(): ProjectAiSettings {
  return {
    projectId: "project-1",
    enabled: true,
    defaultProviderProfileId: "provider-1",
    defaultJudgeProfileId: "provider-1",
    defaultOptimizerProfileId: null,
    defaultEmbeddingProfileId: null,
    providerProfiles: [
      {
        id: "provider-1",
        projectId: "project-1",
        label: "Harness",
        providerKind: "local_harness",
        models: {},
        timeoutMs: 30000,
      },
    ],
    modelAliases: [
      {
        id: "alias-1",
        name: "judge",
        providerProfileId: "provider-1",
        model: "judge-model",
        purpose: "judge",
        parameters: {},
      },
    ],
    onlinePolicies: [
      {
        id: "policy-1",
        enabled: true,
        name: "Production quality",
        target: {},
        scorerIds: ["scorer-1"],
        sampleRate: 0.1,
        annotationRules: [],
        updatedAt: "2026-05-12T10:00:00.000Z",
        updatedByUserId: "user-1",
      },
    ],
    budget: {
      dailyUsd: 10,
      deterministicOnly: false,
      spentTodayUsd: 0,
    },
    sampling: {
      defaultOnlineSampleRate: 0.1,
      maxOnlineSampleRate: 1,
      maxConcurrentExperimentItems: 4,
      maxConcurrentOptimizationCandidates: 2,
    },
    datasetDefaults: {
      splitAllocation: {},
      smallDatasetReviewedThreshold: 30,
      requireReviewForRegression: true,
    },
    effective: {
      warnings: [],
      deterministicOnly: false,
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      budgetExhausted: false,
    },
    version: 1,
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedByUserId: "user-1",
  };
}

function projectAiSettingsInput(): UpdateProjectAiSettingsInput {
  return {
    projectId: "project-1",
    enabled: true,
    defaultProviderProfileId: "provider-1",
    defaultJudgeProfileId: "provider-1",
    providerProfiles: [
      {
            id: "provider-1",
            label: "Harness",
            providerKind: "local_harness",
            models: {},
            timeoutMs: 30000,
            disabled: false,
          },
        ],
    modelAliases: [],
    onlinePolicies: [],
    budget: {
      dailyUsd: 10,
      deterministicOnly: false,
    },
    sampling: {
      defaultOnlineSampleRate: 0.1,
      maxOnlineSampleRate: 1,
      maxConcurrentExperimentItems: 4,
      maxConcurrentOptimizationCandidates: 2,
    },
    datasetDefaults: {
      splitAllocation: {},
      smallDatasetReviewedThreshold: 30,
      requireReviewForRegression: true,
    },
    expectedVersion: 1,
  };
}

function aiQualityOverview(): AiQualityOverview {
  return {
    projectId: "project-1",
    summary: {},
    segments: [
      {
        key: "agent:support",
        label: "support",
        dimensions: { agentName: "support" },
        runCount: 12,
        scoredRunCount: 10,
        passRate: 0.9,
        meanScore: 0.82,
        regressionCount: 1,
      },
    ],
    warnings: [],
  };
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}
