import { describe, expect, test } from "bun:test";
import type { AiChatRun, CompanyAiProviderSettings } from "@cloudgrid/ui-contracts";
import { AI_CHAT_TOOLS } from "./ai-chat/catalog";
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
    expect(harness.requests.at(0)?.sessionId).toBe(
      "company:company-1:project:project-1:user:local-user:conversation:chat-1",
    );
    expect(harness.requests.at(0)?.catalog.tools.map((tool) => tool.id)).toEqual(
      AI_CHAT_TOOLS.map((tool) => tool.id),
    );
    expect(harness.requests.at(0)?.messages.at(-1)?.parts).toEqual([
      { type: "text", text: "Investigate slow traces" },
    ]);
    expect(appended).toHaveLength(2);

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("resolves managed provider credentials at runtime without exposing the API key", async () => {
    const harness = recordingHarness([{ kind: "final_message", text: "done" }]);
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          const settings = configuredCompanyProvider();
          const providerProfile = settings.providerProfile;
          if (!providerProfile) {
            throw new Error("test fixture requires a provider profile");
          }
          return configuredCompanyProvider({
            providerProfile: {
              ...providerProfile,
              credentialRef: "managed:company/company-1/provider-1",
            },
          });
        },
        async resolveAiProviderSecret(credentialRef) {
          return { credentialRef, value: "stored-provider-key" };
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-managed" }));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("stored-provider-key");
    expect(harness.requests.at(0)?.credential.value).toBe("stored-provider-key");
  });

  test("can skip appending the initial user message already persisted by conversation create", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "done" }]);
    const appended: unknown[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation({ messages: [], title: "Investigate slow traces" });
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

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-no-dupe",
        skipUserMessageAppend: true,
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(parseSse(body).map((event) => event.type)).toContain("run.completed");
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({ role: "assistant" });
    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("handles client cancellation without leaking stream abort errors", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    let observedSignal: AbortSignal | undefined;
    const harness: AiChatHarnessPort = {
      async *streamChat(request) {
        observedSignal = request.signal;
        yield { kind: "text_delta", text: "partial" };
        await new Promise((resolve) => setTimeout(resolve, 25));
        yield { kind: "text_delta", text: "after-cancel" };
      },
      async compactConversation() {
        throw new Error("unused");
      },
    };
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async aiChatAppendMessage() {},
        async aiChatFinalizeRun() {
          return runShape({
            status: "cancelled",
            completedAt: "2026-05-18T00:00:01.000Z",
            problem: { detail: "cancelled" },
          });
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-cancel" }));
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("missing response body");
    }
    await reader.read();

    await expect(reader.cancel()).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(observedSignal?.aborted).toBe(true);
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
          return runShape({
            id: "run-durable-1",
            conversationId: input.conversationId,
          });
        },
        async aiChatFinalizeRun(input) {
          finalizedRuns.push(input);
          return runShape({
            id: input.runId,
            status: input.status,
            completedAt: "2026-05-18T00:00:01.000Z",
          });
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
        userId: "local-user",
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

  test("answers today's trace questions from the CloudGrid trace tool without provider guesses", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const traceInputs: unknown[] = [];
    const traceProjectIds: Array<string | undefined> = [];
    const appended: unknown[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async viewer() {
          return {
            user: { id: "local-user", displayName: "Local user", email: null },
            organizations: [],
            selectedProject: {
              id: "project-1",
              organizationId: "company-1",
              name: "Default project",
              slug: "default",
              status: "active",
              telemetry: {
                traceCount: 1,
                logCount: 0,
                metricCount: 0,
                serviceCount: 1,
                lastIngestAt: "2026-05-21T08:15:00.000Z",
              },
            },
          };
        },
        async searchTraces(input, authContext) {
          traceInputs.push(input);
          traceProjectIds.push(authContext?.projectId);
          return {
            items: [
              {
                id: "trace-1234567890abcdef",
                serviceName: "checkout-api",
                operationName: "POST /checkout",
                startedAt: "2026-05-21T08:15:00.000Z",
                startedAtUnixNano: "0",
                endedAt: null,
                endedAtUnixNano: null,
                durationNano: "120000000",
                durationMs: 120,
                rootSpanId: "span-1",
                status: "error",
                attributes: {},
                spanCount: 4,
                errorSpanCount: 1,
                logCount: 0,
                serviceCount: 1,
              },
            ],
            nextCursor: null,
          };
        },
        async aiChatAppendMessage(input) {
          appended.push(input);
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-trace-tool",
        parts: [{ type: "text", text: "what are the traces of today?" }],
        timezone: "Europe/Berlin",
      }),
    );
    const events = parseSse(await response.text());

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.created",
      "tool.started",
      "tool.completed",
      "text.delta",
      "run.completed",
    ]);
    const toolEvents = events.filter(
      (event) => event.type === "tool.started" || event.type === "tool.completed",
    );
    expect(toolEvents.map((event) => event.payload)).toEqual([
      {
        toolCallId: "tool-1",
        toolName: "telemetry.searchTraces",
        label: "Searching traces",
        status: "started",
      },
      {
        toolCallId: "tool-1",
        toolName: "telemetry.searchTraces",
        label: "Searching traces",
        status: "completed",
      },
    ]);
    expect(JSON.stringify(toolEvents)).not.toContain("resultSummary");
    expect(JSON.stringify(toolEvents)).not.toContain("checkout-api");
    expect(harness.requests).toHaveLength(0);
    expect(traceInputs).toHaveLength(1);
    expect(traceInputs[0]).toMatchObject({ limit: 25, sort: "startedAt_desc" });
    expect(traceProjectIds).toEqual(["project-1"]);
    expect(JSON.stringify(events)).toContain("Default project (project-1)");
    expect(JSON.stringify(events)).toContain("checkout-api");
    expect(JSON.stringify(events)).toContain("/traces/trace-1234567890abcdef");
    expect(JSON.stringify(events)).not.toContain("cgctl");
    expect(JSON.stringify(events)).not.toContain("/v1/projects");
    expect(appended).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant", parts: expect.any(Array) }),
      ]),
    );

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
          return runShape({
            id: "run_durable_duplicate",
            conversationId: input.conversationId,
            providerProfileId: input.providerProfileId,
            model: input.model,
          });
        },
        async aiChatFinalizeRun() {
          runStatus = "completed";
          return runShape({
            id: "run_durable_duplicate",
            status: "completed",
            completedAt: "2026-05-18T00:00:01.000Z",
          });
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

function configuredCompanyProvider(
  overrides: Partial<CompanyAiProviderSettings> = {},
): CompanyAiProviderSettings {
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
      parameters: {},
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
    ...overrides,
  };
}

function conversation(overrides: Partial<ReturnType<typeof conversationShape>> = {}) {
  return {
    ...conversationShape(),
    ...overrides,
  };
}

function runShape(overrides: Partial<AiChatRun> = {}): AiChatRun {
  return {
    ...runBase(),
    ...overrides,
  };
}

function runBase(): AiChatRun {
  return {
    id: "run-1",
    conversationId: "chat-1",
    projectId: "project-1",
    userId: "local-user",
    status: "streaming" as const,
    providerKind: "openai",
    providerProfileId: "provider-1",
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
    startedAt: "2026-05-18T00:00:00.000Z",
    completedAt: null,
    problem: null,
  };
}

function conversationShape() {
  return {
    id: "chat-1",
    companyId: "company-1",
    projectId: "project-1",
    userId: "local-user",
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
