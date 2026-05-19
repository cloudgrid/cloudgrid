import { describe, expect, test } from "bun:test";
import type { CompanyAiProviderSettings } from "@cloudgrid/ui-contracts";
import type { AiChatHarnessEvent, AiChatHarnessPort } from "./ai-chat-stream";
import { graphQLErrorFromBridge } from "./bridge";
import { createAppWithBridge } from "./graphql";
import { bridge } from "./test-helpers";

describe("AI Chat stream endpoint", () => {
  test("rejects a stream request whose project does not match the conversation", async () => {
    const harness = recordingHarness([{ kind: "text_delta", text: "nope" }]);
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation({ projectId: "project-1" });
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({ projectId: "project-2", idempotencyKey: "idempotency-key-0001" }),
    );
    const problem = await response.json();

    expect(response.status).toBe(403);
    expect(problem.id).toBe("ERR-016");
    expect(harness.requests).toHaveLength(0);
  });

  test("returns a setup error before harness execution when the company provider is missing", async () => {
    const harness = recordingHarness([{ kind: "text_delta", text: "nope" }]);
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return {
            ...configuredCompanyProvider(),
            providerProfile: null,
            chatModelAlias: null,
            effective: {
              warnings: ["missing provider"],
              missingProviderProfiles: [],
              disabledProviderProfiles: [],
              missingChatProvider: true,
            },
          };
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-0002" }));
    const problem = await response.json();

    expect(response.status).toBe(400);
    expect(problem.id).toBe("ERR-AIC-001");
    expect(harness.requests).toHaveLength(0);
  });

  test("streams ordered lifecycle events and does not expose credential material", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([
      { kind: "text_delta", text: "hello " },
      { kind: "text_delta", text: "world" },
      { kind: "final_message", text: "hello world" },
    ]);
    const appended: unknown[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async aiChatAppendMessage(input) {
          appended.push(input);
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-0003" }));
    const body = await response.text();
    const events = parseSse(body);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.created",
      "text.delta",
      "text.delta",
      "message.created",
      "run.completed",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(JSON.stringify(events)).not.toContain("secret-provider-key");
    expect(JSON.stringify(events)).not.toContain("CLOUDGRID_TEST_AI_CHAT_KEY");
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests.at(0)?.provider).toEqual({
      providerKind: "openai",
      model: "gpt-5-mini",
      baseUrl: null,
      parameters: { extras: {} },
    });
    expect(harness.requests.at(0)?.credential.value).toBe("secret-provider-key");
    expect(appended).toHaveLength(2);

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("persists run lifecycle through the control-plane bridge", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([
      { kind: "text_delta", text: "hello" },
      { kind: "usage", inputTokens: 12, outputTokens: 4, estimatedCostUsd: 0.002 },
      { kind: "final_message", text: "hello" },
    ]);
    const createdRuns: unknown[] = [];
    const finalizedRuns: unknown[] = [];
    const appended: unknown[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async aiChatCreateRun(input) {
          createdRuns.push(input);
          return {
            id: "run-durable-1",
            conversationId: input.conversationId,
            status: "streaming",
            providerProfileId: "provider-1",
            model: "gpt-5-mini",
            artifacts: [],
            actionProposals: [],
            startedAt: "2026-05-18T00:00:00.000Z",
            completedAt: null,
            error: null,
          };
        },
        async aiChatFinalizeRun(input) {
          finalizedRuns.push(input);
          return {
            id: input.runId,
            conversationId: "chat-1",
            status: input.status,
            providerProfileId: "provider-1",
            model: "gpt-5-mini",
            artifacts: [],
            actionProposals: [],
            startedAt: "2026-05-18T00:00:00.000Z",
            completedAt: "2026-05-18T00:00:01.000Z",
            error: null,
          };
        },
        async aiChatAppendMessage(input) {
          appended.push(input);
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-0005" }));
    const body = await response.text();
    const events = parseSse(body);

    expect(response.status).toBe(200);
    expect(events[0]).toMatchObject({
      type: "run.started",
      runId: "run-durable-1",
      sequence: 1,
    });
    expect(createdRuns).toEqual([
      {
        conversationId: "chat-1",
        projectId: "project-1",
        userId: "user-local",
        userMessageClientId: "client-message-1",
        idempotencyKey: "idempotency-key-0005",
        providerKind: "openai",
        providerProfileId: "provider-1",
        model: "gpt-5-mini",
      },
    ]);
    expect(appended).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId: "run-durable-1", role: "user" }),
        expect.objectContaining({ runId: "run-durable-1", role: "assistant" }),
      ]),
    );
    expect(finalizedRuns).toEqual([
      {
        runId: "run-durable-1",
        status: "completed",
        inputTokenCount: 12,
        outputTokenCount: 4,
        estimatedCostUsd: 0.002,
        toolCallCount: 0,
        sandboxScriptCount: 0,
        artifactCount: 0,
      },
    ]);

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("rejects a duplicate completed idempotency key with the existing run id", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "done" }]);
    let runStatus: "streaming" | "completed" = "streaming";
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async aiChatCreateRun(input) {
          if (runStatus === "completed") {
            throw graphQLErrorFromBridge({
              id: "ERR-001",
              code: "VALIDATION_FAILED",
              message: "Duplicate AI Chat run submission",
              retryable: false,
              details: { runId: "run_durable_duplicate", status: "completed" },
            });
          }
          return {
            id: "run_durable_duplicate",
            conversationId: input.conversationId,
            status: "streaming",
            providerProfileId: input.providerProfileId,
            model: input.model,
            artifacts: [],
            actionProposals: [],
            startedAt: "2026-05-18T00:00:00.000Z",
            completedAt: null,
            error: null,
          };
        },
        async aiChatFinalizeRun() {
          runStatus = "completed";
          return {
            id: "run_durable_duplicate",
            conversationId: "chat-1",
            status: "completed",
            providerProfileId: "provider-1",
            model: "gpt-5-mini",
            artifacts: [],
            actionProposals: [],
            startedAt: "2026-05-18T00:00:00.000Z",
            completedAt: "2026-05-18T00:00:01.000Z",
            error: null,
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const first = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-0004" }));
    await first.text();
    const second = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-0004" }));
    const problem = await second.json();

    expect(second.status).toBe(400);
    expect(problem.id).toBe("ERR-001");
    expect(problem.details.runId).toMatch(/^run_/);
    expect(problem.details.status).toBe("completed");
    expect(harness.requests).toHaveLength(1);

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });
});

function streamRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return new Request("https://cloudgrid.test/api/ai-chat/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversationId: "chat-1",
      projectId: "project-1",
      userMessageClientId: "client-message-1",
      idempotencyKey: "idempotency-key-default",
      parts: [{ type: "text", text: "Investigate slow traces" }],
      ...overrides,
    }),
  });
}

function parseSse(body: string) {
  return body
    .trim()
    .split("\n\n")
    .map((chunk) => {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
      return JSON.parse(data) as { type: string; sequence: number; payload: unknown };
    });
}

function recordingHarness(events: AiChatHarnessEvent[]) {
  const requests: Array<Parameters<AiChatHarnessPort["streamChat"]>[0]> = [];
  const harness: AiChatHarnessPort & {
    requests: Array<Parameters<AiChatHarnessPort["streamChat"]>[0]>;
  } = {
    requests,
    async *streamChat(request) {
      requests.push(request);
      for (const event of events) {
        yield event;
      }
    },
    async compactConversation() {
      return {
        summary: [
          "User goals",
          "Project context",
          "Important evidence",
          "Decisions and assumptions",
          "Artifacts",
          "Pending actions",
          "Open failures",
        ].join("\n"),
        retainedMessageIds: [],
      };
    },
  };
  return harness;
}

function configuredCompanyProvider(): CompanyAiProviderSettings {
  return {
    companyId: "company-1",
    providerProfile: {
      id: "provider-1",
      ownerScope: "company",
      ownerId: "company-1",
      label: "OpenAI",
      providerKind: "openai",
      baseUrl: null,
      credentialRef: "env:CLOUDGRID_TEST_AI_CHAT_KEY",
      models: { chat: ["gpt-5-mini"] },
      timeoutMs: 30_000,
      maxConcurrency: null,
      disabledAt: null,
    },
    chatModelAlias: {
      id: "alias-1",
      name: "chat-default",
      providerProfileId: "provider-1",
      model: "gpt-5-mini",
      purpose: "chat",
      parameters: { extras: {} },
    },
    effective: {
      warnings: [],
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      missingChatProvider: false,
    },
    version: 1,
    updatedAt: "2026-05-18T00:00:00.000Z",
    updatedByUserId: "user-local",
  };
}

function conversation(overrides: Partial<ReturnType<typeof conversationShape>> = {}) {
  return {
    ...conversationShape(),
    ...overrides,
  };
}

function conversationShape() {
  return {
    id: "chat-1",
    companyId: "company-1",
    projectId: "project-1",
    userId: "user-local",
    title: "Investigate slow traces",
    status: "active" as const,
    messages: [],
    latestRun: null,
    compaction: null,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    lastMessageAt: "2026-05-18T00:00:00.000Z",
    version: 1,
  };
}
