import { describe, expect, test } from "bun:test";
import type { AiChatConversation, AiChatRun, TraceSearchResult } from "@cloudgrid/ui-contracts";
import type { ModelProvider, TextRequest, TextResponse, TextStreamChunk } from "@purista/harness";
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
        { graphqlUI: false, aiChatHarness: harness },
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
      expect(provider.textStreamRequests).toHaveLength(1);
      expect(provider.textStreamRequests[0]?.model).toBe("gpt-5-mini");

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
        { graphqlUI: false, aiChatHarness: createAiChatHarness("provider") ?? undefined },
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
  const requests: TextRequest[] = [];
  const provider: ModelProvider & { textStreamRequests: TextRequest[] } = {
    id: "recording",
    genAiSystem: "recording",
    textStreamRequests: requests,
    async text(request: TextRequest): Promise<TextResponse> {
      requests.push(request);
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
      requests.push(request);
      for (const chunk of chunks) {
        yield chunk;
      }
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
