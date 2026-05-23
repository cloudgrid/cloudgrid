import { describe, expect, test } from "bun:test";
import type {
  AiChatConversation,
  AiChatRun,
  AiQualityOverview,
  LogSearchResult,
  MetricSeriesResult,
  TraceSearchResult,
} from "@cloudgrid/ui-contracts";
import type {
  JsonValue,
  ModelProvider,
  ObjectRequest,
  ObjectResponse,
  TextRequest,
  TextResponse,
  TextStreamChunk,
} from "@purista/harness";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createControlPlaneGraphQLClient } from "../../packages/public-api-client/src";
import { createAiChatHarness } from "../../backend/src/ai-chat-harness";
import { createAppWithBridge } from "../../backend/src/graphql";
import { bridge } from "../../backend/src/test-helpers";
import { AiChatArtifactRenderer } from "../src/features/ai-chat/artifact-renderer";
import {
  applyAiChatStreamEvent,
  createAiChatStreamViewState,
  safeAiChatArtifactView,
} from "../src/features/ai-chat/view-model";

describe("AI Chat end-to-end stream integration", () => {
  test("streams provider output through the public client and frontend view model with stable message ids", async () => {
    await withProviderCredential(async () => {
      const conversation = conversationFixture();
      const provider = recordingProvider([
        { kind: "delta", text: "CloudGrid " },
        { kind: "delta", text: "status is available." },
        { kind: "finish", usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 } },
      ]);
      const harness = createAiChatHarness("provider", { providerFactory: () => provider });
      if (!harness) {
        throw new Error("expected provider harness");
      }
      const appended: unknown[] = [];
      const finalized: unknown[] = [];
      const { app } = createAppWithBridge(
        bridge({
          async aiChatConversation() {
            return conversation;
          },
          async aiChatAppendMessage(input) {
            appended.push(input);
          },
          async aiChatCreateRun(input) {
            return runFixture({
              conversationId: input.conversationId,
              providerProfileId: input.providerProfileId,
              model: input.model,
            });
          },
          async aiChatFinalizeRun(input) {
            finalized.push(input);
            return runFixture({ status: input.status });
          },
        }),
        { aiChatHarness: harness },
      );

      const events = await withAppFetch(app, async () => {
        const client = createControlPlaneGraphQLClient("https://cloudgrid.test/graphql");
        const streamEvents = [];
        for await (const event of client.streamAiChatRun({
          conversationId: conversation.id,
          projectId: conversation.projectId,
          userMessageClientId: "client-message-e2e-provider",
          idempotencyKey: "idempotency-key-e2e-provider",
          parts: [{ type: "text", text: "Explain the CloudGrid workspace in one sentence" }],
          timezone: "Europe/Berlin",
        })) {
          streamEvents.push(event);
        }
        return streamEvents;
      });

      expect(events.find((event) => event.type === "run.started")?.payload).toEqual({
        status: "streaming",
      });
      const messagePayloads = events
        .filter((event) => event.type === "message.created" || event.type === "text.delta")
        .map((event) => event.payload);
      expect(messagePayloads.every((payload) => typeof payload.messageId === "string")).toBe(true);
      expect(provider.objectRequests).toHaveLength(1);
      expect(provider.objectRequests[0]?.model).toBe("gpt-5-mini");

      const view = events.reduce(
        applyAiChatStreamEvent,
        createAiChatStreamViewState({
          conversationId: conversation.id,
          userText: "Explain the CloudGrid workspace in one sentence",
        }),
      );
      expect(view.status).toBe("completed");
      expect(view.assistantMessageId).toBeTruthy();
      expect(view.assistantParts).toContainEqual({
        type: "text",
        text: "CloudGrid status is available.",
      });
      expect(appended).toContainEqual(
        expect.objectContaining({
          role: "assistant",
          parts: [{ type: "text", text: "CloudGrid status is available." }],
        }),
      );
      expect(finalized).toContainEqual(expect.objectContaining({ status: "completed" }));
    });
  });

  test("streams deterministic trace artifacts through the public client into the shared renderer", async () => {
    await withProviderCredential(async () => {
      const conversation = conversationFixture();
      const { app } = createAppWithBridge(
        bridge({
          async aiChatConversation() {
            return conversation;
          },
          async searchTraces() {
            return traceSearchResult();
          },
          async aiChatCreateRun(input) {
            return runFixture({
              conversationId: input.conversationId,
              providerProfileId: input.providerProfileId,
              model: input.model,
            });
          },
          async aiChatAppendMessage() {},
          async aiChatFinalizeRun(input) {
            return runFixture({ status: input.status });
          },
        }),
        {
          aiChatHarness:
            createAiChatHarness("provider", {
              providerFactory: () =>
                toolCallingProvider({
                  call: {
                    id: "call-traces",
                    name: "telemetry_searchTraces",
                    arguments: { limit: 10, status: "error" },
                  },
                  finalAnswer: "Found failing traces.",
                }),
            }) ?? undefined,
        },
      );

      const events = await withAppFetch(app, async () => {
        const client = createControlPlaneGraphQLClient("https://cloudgrid.test/graphql");
        const streamEvents = [];
        for await (const event of client.streamAiChatRun({
          conversationId: conversation.id,
          projectId: conversation.projectId,
          userMessageClientId: "client-message-e2e-traces",
          idempotencyKey: "idempotency-key-e2e-traces",
          parts: [{ type: "text", text: "what are the last 10 failing traces?" }],
          timezone: "Europe/Berlin",
        })) {
          streamEvents.push(event);
        }
        return streamEvents;
      });

      expect(events.find((event) => event.type === "tool.started")?.payload).toMatchObject({
        status: "running",
        toolName: "telemetry.searchTraces",
      });
      const view = events.reduce(
        applyAiChatStreamEvent,
        createAiChatStreamViewState({
          conversationId: conversation.id,
          userText: "what are the last 10 failing traces?",
        }),
      );
      const artifact = view.artifacts.at(0);
      expect(artifact).toBeDefined();
      const safeView = safeAiChatArtifactView(artifact!);
      expect(safeView.kind).toBe("json_render");
      if (safeView.kind !== "json_render") {
        throw new Error("expected json render artifact");
      }
      const markup = renderToStaticMarkup(
        createElement(AiChatArtifactRenderer, {
          content: safeView.content,
          renderer: safeView.renderer,
        }),
      );

      expect(safeView.renderer).toBe("table");
      expect(markup).toContain("trace-e2e-failing");
      expect(markup).toContain("checkout-api");
      expect(markup).toContain("error");
    });
  });

  test("streams metrics, logs, and AI Eval artifacts through shared frontend renderers", async () => {
    await withProviderCredential(async () => {
      const cases = [
        {
          name: "metrics",
          prompt: "query token usage metrics for the last hour",
          expectedTool: "telemetry.queryMetrics",
          expectedRenderer: "metric_timeseries",
          expectedMarkup: ["gen_ai.client.token.usage", "input", "42"],
          toolArguments: { metricName: "gen_ai.client.token.usage" },
          bridgeOverrides: {
            async metricSeries() {
              return metricSeriesResult();
            },
          },
        },
        {
          name: "logs",
          prompt: "show the latest error logs for checkout-api",
          expectedTool: "telemetry.searchLogs",
          expectedRenderer: "log_list",
          expectedMarkup: ["storage is unavailable", "checkout-api", "ERROR"],
          toolArguments: {},
          bridgeOverrides: {
            async searchLogs() {
              return logSearchResult();
            },
          },
        },
        {
          name: "ai-eval-quality",
          prompt: "show AI Eval production quality for checkout",
          expectedTool: "aiEval.qualityOverview",
          expectedRenderer: "status_summary",
          expectedMarkup: ["Production quality", "0.92", "1"],
          toolArguments: {},
          bridgeOverrides: {
            async aiQualityOverview(input: { projectId: string }) {
              return aiQualityOverview(input.projectId);
            },
          },
        },
      ];

      for (const item of cases) {
        const conversation = conversationFixture({ id: `chat-e2e-${item.name}` });
        const { app } = createAppWithBridge(
          bridge({
            ...item.bridgeOverrides,
            async aiChatConversation() {
              return conversation;
            },
            async aiChatCreateRun(input) {
              return runFixture({
                id: `run-e2e-${item.name}`,
                conversationId: input.conversationId,
                providerProfileId: input.providerProfileId,
                model: input.model,
              });
            },
            async aiChatAppendMessage() {},
            async aiChatFinalizeRun(input) {
              return runFixture({
                id: `run-e2e-${item.name}`,
                conversationId: conversation.id,
                status: input.status,
              });
            },
          }),
          {
            aiChatHarness:
              createAiChatHarness("provider", {
                providerFactory: () =>
                  toolCallingProvider({
                    call: {
                      id: `call-${item.name}`,
                      name: item.expectedTool.replaceAll(".", "_"),
                      arguments: item.toolArguments,
                    },
                    finalAnswer: "Done.",
                  }),
              }) ?? undefined,
          },
        );

        const events = await withAppFetch(app, async () => {
          const client = createControlPlaneGraphQLClient("https://cloudgrid.test/graphql");
          const streamEvents = [];
          for await (const event of client.streamAiChatRun({
            conversationId: conversation.id,
            projectId: conversation.projectId,
            userMessageClientId: `client-message-e2e-${item.name}`,
            idempotencyKey: `idempotency-key-e2e-${item.name}`,
            parts: [{ type: "text", text: item.prompt }],
            timezone: "Europe/Berlin",
          })) {
            streamEvents.push(event);
          }
          return streamEvents;
        });

        expect(events.find((event) => event.type === "tool.started")?.payload).toMatchObject({
          status: "running",
          toolName: item.expectedTool,
        });
        const view = events.reduce(
          applyAiChatStreamEvent,
          createAiChatStreamViewState({
            conversationId: conversation.id,
            userText: item.prompt,
          }),
        );
        const artifact = view.artifacts.at(0);
        expect(artifact).toBeDefined();
        const safeView = safeAiChatArtifactView(artifact!);
        expect(safeView.kind).toBe("json_render");
        if (safeView.kind !== "json_render") {
          throw new Error("expected json render artifact");
        }
        const markup = renderToStaticMarkup(
          createElement(AiChatArtifactRenderer, {
            content: safeView.content,
            renderer: safeView.renderer,
          }),
        );

        expect(safeView.renderer).toBe(item.expectedRenderer);
        for (const expected of item.expectedMarkup) {
          expect(markup).toContain(expected);
        }
      }
    });
  });
});

async function withProviderCredential(run: () => Promise<void>) {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-provider-key";
  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previous;
    }
  }
}

async function withAppFetch<T>(
  app: { fetch: (request: Request) => Response | Promise<Response> },
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return app.fetch(request);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function recordingProvider(chunks: TextStreamChunk[]) {
  const textStreamRequests: TextRequest[] = [];
  const objectRequests: ObjectRequest[] = [];
  const provider: ModelProvider & {
    textStreamRequests: TextRequest[];
    objectRequests: ObjectRequest[];
  } = {
    id: "recording",
    genAiSystem: "recording",
    textStreamRequests,
    objectRequests,
    async text(request: TextRequest): Promise<TextResponse> {
      textStreamRequests.push(request);
      return {
        content: chunks
          .filter(
            (chunk): chunk is Extract<TextStreamChunk, { kind: "delta" }> => chunk.kind === "delta",
          )
          .map((chunk) => chunk.text)
          .join(""),
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: "stop",
      };
    },
    async *textStream(request: TextRequest): AsyncIterable<TextStreamChunk> {
      textStreamRequests.push(request);
      for (const chunk of chunks) {
        yield chunk;
      }
    },
    async object<T extends JsonValue>(request: ObjectRequest<T>): Promise<ObjectResponse<T>> {
      objectRequests.push(request);
      return {
        object: {
          answer:
            chunks
              .filter(
                (chunk): chunk is Extract<TextStreamChunk, { kind: "delta" }> =>
                  chunk.kind === "delta",
              )
              .map((chunk) => chunk.text)
              .join("") || "done",
        } as unknown as T,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: "stop",
      };
    },
  };
  return provider;
}

function toolCallingProvider(input: {
  call: { id: string; name: string; arguments: Record<string, unknown> };
  finalAnswer: string;
}) {
  const objectRequests: ObjectRequest[] = [];
  const provider: ModelProvider & { objectRequests: ObjectRequest[] } = {
    id: "tool-calling",
    genAiSystem: "recording",
    objectRequests,
    async text(): Promise<TextResponse> {
      throw new Error("text should not be called");
    },
    async *textStream() {
      throw new Error("textStream should not be called");
    },
    async object<T extends JsonValue>(request: ObjectRequest<T>): Promise<ObjectResponse<T>> {
      objectRequests.push(request);
      if (objectRequests.length === 1) {
        return {
          object: { answer: "" } as unknown as T,
          toolCalls: [input.call],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          finishReason: "tool_calls",
        };
      }
      return {
        object: { answer: input.finalAnswer } as unknown as T,
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        finishReason: "stop",
      };
    },
  };
  return provider;
}

function conversationFixture(overrides: Partial<AiChatConversation> = {}): AiChatConversation {
  return {
    id: "chat-e2e",
    companyId: "org-1",
    projectId: "project-1",
    userId: "local-user",
    title: "E2E chat",
    status: "active",
    messages: [],
    latestRun: null,
    compaction: null,
    createdAt: "2026-05-21T18:00:00.000Z",
    updatedAt: "2026-05-21T18:00:00.000Z",
    lastMessageAt: "2026-05-21T18:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function runFixture(overrides: Partial<AiChatRun> = {}): AiChatRun {
  return {
    id: "run-e2e",
    conversationId: "chat-e2e",
    projectId: "project-1",
    userId: "local-user",
    status: "streaming",
    providerKind: "openai",
    providerProfileId: "company-profile-1",
    model: "gpt-5-mini",
    traceId: null,
    toolCallCount: 0,
    sandboxScriptCount: 0,
    artifactCount: 0,
    inputTokenCount: null,
    outputTokenCount: null,
    estimatedCostUsd: null,
    artifacts: [],
    actionProposals: [],
    startedAt: "2026-05-21T18:00:00.000Z",
    completedAt: null,
    problem: null,
    ...overrides,
  };
}

function traceSearchResult(): TraceSearchResult {
  return {
    items: [
      {
        id: "trace-e2e-failing",
        projectId: "project-1",
        serviceName: "checkout-api",
        operationName: "POST /checkout",
        startedAt: "2026-05-21T17:55:00.000Z",
        endedAt: "2026-05-21T17:55:01.000Z",
        durationMs: 1000,
        status: "error",
        spanCount: 8,
        errorSpanCount: 2,
        rootSpanId: "span-root",
        attributes: {},
      },
    ],
    nextCursor: null,
    totalCount: 1,
  } as TraceSearchResult;
}

function metricSeriesResult(): MetricSeriesResult {
  return {
    metric: {
      id: "metric:gen_ai.client.token.usage",
      tenantId: "tenant-1",
      projectId: "project-1",
      name: "gen_ai.client.token.usage",
      description: "Token usage by provider, model, and token type.",
      unit: "1",
      kind: "sum",
      aggregationTemporality: "delta",
      monotonic: true,
      attributeKeys: ["gen_ai.token.type", "service.name"],
      firstSeenAt: "2026-05-21T17:00:00.000Z",
      lastSeenAt: "2026-05-21T18:00:00.000Z",
    },
    aggregation: "sum",
    interval: "5m",
    groupBy: [],
    series: [
      {
        labels: { "gen_ai.token.type": "input", "service.name": "checkout-api" },
        points: [
          {
            timestamp: "2026-05-21T17:55:00.000Z",
            value: 42,
            count: 1,
            exemplars: [],
          },
        ],
      },
    ],
    warnings: [],
  };
}

function logSearchResult(): LogSearchResult {
  return {
    items: [
      {
        id: "log-e2e-storage",
        traceId: "trace-e2e-failing",
        spanId: "span-root",
        serviceName: "checkout-api",
        severityText: "ERROR",
        severityNumber: 17,
        body: "storage is unavailable",
        timestamp: "2026-05-21T17:56:00.000Z",
        observedTimestamp: "2026-05-21T17:56:00.000Z",
        attributes: { error_code: "STORAGE_UNAVAILABLE" },
        correlation: { trace: null, span: null },
      },
    ],
    nextCursor: null,
  };
}

function aiQualityOverview(projectId: string): AiQualityOverview {
  return {
    projectId,
    from: "2026-05-20T18:00:00.000Z",
    to: "2026-05-21T18:00:00.000Z",
    summary: { passRate: 0.92, meanScore: 0.87 },
    segments: [
      {
        key: "service:checkout",
        label: "Production quality",
        dimensions: { service: "checkout" },
        runCount: 12,
        scoredRunCount: 10,
        passRate: 0.92,
        meanScore: 0.87,
        p50LatencyMs: 120,
        p95LatencyMs: 240,
        costUsd: 0.42,
        regressionCount: 1,
      },
    ],
    warnings: [],
  };
}
