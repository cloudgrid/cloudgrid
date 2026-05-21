import { describe, expect, test } from "bun:test";
import type { ModelProvider, TextRequest, TextResponse, TextStreamChunk } from "@purista/harness";
import type { AiChatRun, AlertRule, CompanyAiProviderSettings } from "@cloudgrid/ui-contracts";
import { AI_CHAT_TOOLS } from "./ai-chat/catalog";
import { createAiChatHarness } from "./ai-chat-harness";
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
    expect(harness.requests.at(0)?.temporalContext).toMatchObject({
      timezone: "UTC",
    });
    expect(harness.requests.at(0)?.temporalContext.nowUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(harness.requests.at(0)?.messages.at(-1)?.parts).toEqual([
      { type: "text", text: "Investigate slow traces" },
    ]);
    expect(appended).toHaveLength(2);

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("streams through the provider harness with only the model provider stubbed", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const provider = recordingProvider([
      { kind: "delta", text: "CloudGrid " },
      { kind: "delta", text: "status is available." },
      {
        kind: "finish",
        usage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 },
        finishReason: "stop",
      },
    ]);
    const harness = createAiChatHarness("provider", {
      providerFactory: () => provider,
    });
    if (!harness) {
      throw new Error("expected provider harness");
    }
    const appended: unknown[] = [];
    const finalized: unknown[] = [];
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
        async aiChatFinalizeRun(input) {
          finalized.push(input);
          return runShape({ id: input.runId, status: input.status });
        },
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    try {
      const response = await app.fetch(
        streamRequest({
          idempotencyKey: "idempotency-key-provider-harness",
          parts: [{ type: "text", text: "Summarize CloudGrid observability status" }],
        }),
      );
      const body = await response.text();
      const events = parseSse(body);

      expect(response.status).toBe(200);
      expect(events.map((event) => event.type)).toEqual([
        "run.started",
        "message.created",
        "text.delta",
        "text.delta",
        "run.completed",
      ]);
      expect(provider.textStreamRequests).toHaveLength(1);
      expect(provider.textStreamRequests[0]?.model).toBe("gpt-5-mini");
      expect(provider.textStreamRequests[0]?.messages[0]?.role).toBe("system");
      expect(appended).toContainEqual(
        expect.objectContaining({
          role: "assistant",
          parts: [{ type: "text", text: "CloudGrid status is available." }],
        }),
      );
      expect(finalized.at(-1)).toMatchObject({
        status: "completed",
        inputTokenCount: 7,
        outputTokenCount: 4,
      });
      expect(body).not.toContain("secret-provider-key");
    } finally {
      delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
    }
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

  test("answers latest failing trace questions with current project defaults", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const traceInputs: unknown[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async searchTraces(input) {
          traceInputs.push(input);
          return {
            items: [
              {
                id: "trace-failing-1",
                serviceName: "api",
                operationName: "GET /broken",
                startedAt: "2026-05-21T16:50:00.000Z",
                startedAtUnixNano: "0",
                endedAt: null,
                endedAtUnixNano: null,
                durationNano: "250000000",
                durationMs: 250,
                rootSpanId: "span-1",
                status: "error",
                attributes: {},
                spanCount: 3,
                errorSpanCount: 1,
                logCount: 2,
                serviceCount: 1,
              },
            ],
            nextCursor: null,
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-failing-traces",
        parts: [{ type: "text", text: "what are the last 10 failing traces?" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(traceInputs).toHaveLength(1);
    expect(traceInputs[0]).toMatchObject({
      limit: 10,
      sort: "startedAt_desc",
      status: "error",
    });
    expect(String((traceInputs[0] as { from?: string }).from)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body).toContain("failing traces");
    expect(body).toContain("last 24 hours");
    expect(body).toContain("/traces/trace-failing-1");
    expect(body).not.toContain("Tell me the missing context");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers metric questions with injected project context and default query settings", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const metricInputs: unknown[] = [];
    const metricProjectIds: Array<string | undefined> = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async metricSeries(input, authContext) {
          metricInputs.push(input);
          metricProjectIds.push(authContext?.projectId);
          return {
            metric: metricDescriptor("gen_ai.client.token.usage"),
            aggregation: "sum",
            interval: "PT5M",
            groupBy: [],
            series: [
              {
                labels: {},
                points: [
                  {
                    timestamp: "2026-05-21T16:55:00.000Z",
                    value: 123,
                    count: 1,
                    exemplars: [],
                  },
                ],
              },
            ],
            warnings: [],
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-metric-tool",
        parts: [{ type: "text", text: "show gen_ai.client.token.usage for the last 24 hours" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();
    const events = parseSse(body);

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.created",
      "tool.started",
      "tool.completed",
      "text.delta",
      "run.completed",
    ]);
    expect(metricInputs).toHaveLength(1);
    expect(metricInputs[0]).toMatchObject({
      metricName: "gen_ai.client.token.usage",
      aggregation: "sum",
      interval: "PT5M",
      limit: 5000,
    });
    expect(String((metricInputs[0] as { from?: string }).from)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(String((metricInputs[0] as { to?: string }).to)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(metricInputs[0])).not.toContain("project-1");
    expect(metricProjectIds).toEqual(["project-1"]);
    expect(body).toContain("gen_ai.client.token.usage");
    expect(body).toContain("last 24 hours");
    expect(body).toContain("123");
    expect(body).not.toContain("Please provide");
    expect(body).not.toContain("Project ID");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers latest log questions with injected project context and default query settings", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const logInputs: unknown[] = [];
    const logProjectIds: Array<string | undefined> = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async searchLogs(input, authContext) {
          logInputs.push(input);
          logProjectIds.push(authContext?.projectId);
          return {
            items: [
              {
                id: "log-1",
                traceId: "trace-log-1",
                spanId: "span-log-1",
                serviceName: "storage-write",
                severityText: "error",
                severityNumber: 17,
                body: "storage is unavailable",
                timestamp: "2026-05-21T16:52:14.000Z",
                observedTimestamp: "2026-05-21T16:52:14.010Z",
                attributes: { error_code: "STORAGE_UNAVAILABLE" },
                correlation: "span",
              },
            ],
            nextCursor: null,
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-log-tool",
        parts: [{ type: "text", text: "show the latest 10 error logs from storage-write" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(logInputs).toHaveLength(1);
    expect(logInputs[0]).toMatchObject({
      service: "storage-write",
      severity: "error",
      sort: "timestamp_desc",
      limit: 10,
    });
    expect(String((logInputs[0] as { from?: string }).from)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(logInputs[0])).not.toContain("project-1");
    expect(logProjectIds).toEqual(["project-1"]);
    expect(body).toContain("CloudGrid returned 1 logs");
    expect(body).toContain("storage-write");
    expect(body).toContain("STORAGE_UNAVAILABLE");
    expect(body).toContain("/traces/trace-log-1?spanId=span-log-1");
    expect(body).not.toContain("Project ID");
    expect(body).not.toContain("Please provide");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers trace detail questions through the trace detail tool with default filters", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const traceDetailInputs: unknown[] = [];
    const traceProjectIds: Array<string | undefined> = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async getTraceDetail(traceId, input, authContext) {
          traceDetailInputs.push({ traceId, input });
          traceProjectIds.push(authContext?.projectId);
          return {
            trace: {
              id: traceId,
              serviceName: "checkout-api",
              startedAt: "2026-05-21T16:50:00.000Z",
              startedAtUnixNano: "0",
              endedAt: "2026-05-21T16:50:01.200Z",
              endedAtUnixNano: "0",
              durationNano: "1200000000",
              durationMs: 1200,
              rootSpanId: "span-root",
              status: "error",
              attributes: {},
            },
            structure: {
              rootSpanIds: ["span-root"],
              orphanSpanIds: [],
              criticalPathSpanIds: ["span-root", "span-db"],
              maxDepth: 2,
              serviceBreakdown: [],
            },
            spans: [
              {
                id: "span-root",
                traceId,
                parentSpanId: null,
                name: "POST /checkout",
                kind: "server",
                serviceName: "checkout-api",
                startedAt: "2026-05-21T16:50:00.000Z",
                startedAtUnixNano: "0",
                endedAt: "2026-05-21T16:50:01.200Z",
                endedAtUnixNano: "0",
                startOffsetNano: "0",
                durationNano: "1200000000",
                durationMs: 1200,
                status: "error",
                attributes: {},
                depth: 0,
                childCount: 1,
                hasError: true,
                isCriticalPath: true,
                isOrphan: false,
                isServiceEntry: true,
                exceptionCount: 1,
                events: [],
                links: [],
                exceptions: [],
              },
            ],
            selectedSpan: null,
            spanMatches: [],
            logs: [],
            relatedLogs: [],
            warnings: [],
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-trace-detail-tool",
        parts: [{ type: "text", text: "show trace trace-detail-123 and summarize it" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(traceDetailInputs).toEqual([
      {
        traceId: "trace-detail-123",
        input: {
          selectedSpanId: null,
          spanQuery: null,
          spanService: null,
          spanName: null,
          spanStatus: null,
          minSpanDurationMs: null,
          maxSpanDurationMs: null,
          attributes: null,
          showMatchesOnly: false,
          relatedLogLimit: 50,
          logSearch: null,
        },
      },
    ]);
    expect(traceProjectIds).toEqual(["project-1"]);
    expect(body).toContain("Trace trace-detail-123");
    expect(body).toContain("checkout-api");
    expect(body).toContain("POST /checkout");
    expect(body).toContain("/traces/trace-detail-123");
    expect(body).not.toContain("Project ID");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers telemetry facet questions with injected project context and shared defaults", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const facetInputs: unknown[] = [];
    const facetProjectIds: Array<string | undefined> = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async telemetryFacets(input, authContext) {
          facetInputs.push(input);
          facetProjectIds.push(authContext?.projectId);
          return {
            services: [{ value: "checkout-api", count: 12 }],
            operations: [{ value: "POST /checkout", count: 8 }],
            spanNames: [{ value: "db.query", count: 5 }],
            severities: [{ value: "error", count: 3 }],
            attributeKeys: [{ value: "http.method", count: 9 }],
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-facet-tool",
        parts: [{ type: "text", text: "show telemetry facets for checkout today" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(facetInputs).toHaveLength(1);
    expect(facetInputs[0]).toMatchObject({
      search: "checkout",
      service: null,
      limit: 25,
    });
    expect(String((facetInputs[0] as { from?: string }).from)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(facetProjectIds).toEqual(["project-1"]);
    expect(body).toContain("checkout-api");
    expect(body).toContain("POST /checkout");
    expect(body).toContain("http.method");
    expect(body).not.toContain("Please provide");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers dashboard list questions with injected project context and shared defaults", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const dashboardInputs: unknown[] = [];
    const dashboardProjectIds: Array<string | undefined> = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async dashboards(input, authContext) {
          dashboardInputs.push(input);
          dashboardProjectIds.push(authContext?.projectId);
          return {
            items: [
              dashboardShape({
                id: "dashboard-token-usage",
                name: "GenAI token usage",
                slug: "genai-token-usage",
                tags: ["genai", "tokens"],
                pinned: true,
                widgets: [
                  dashboardWidgetShape({
                    id: "tokens",
                    title: "Tokens",
                    kind: "metric_timeseries",
                  }),
                  dashboardWidgetShape({
                    id: "recent-logs",
                    title: "Recent logs",
                    kind: "log_table",
                  }),
                ],
              }),
            ],
            pinnedDashboardIds: ["dashboard-token-usage"],
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-dashboard-tool",
        parts: [{ type: "text", text: "list dashboards for tokens" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(dashboardInputs).toEqual([
      {
        includeBuiltins: true,
        query: "tokens",
        tag: null,
        visibility: null,
        pinnedOnly: null,
      },
    ]);
    expect(dashboardProjectIds).toEqual(["project-1"]);
    expect(body).toContain("CloudGrid returned 1 dashboard");
    expect(body).toContain("GenAI token usage");
    expect(body).toContain("metric_timeseries");
    expect(body).toContain("/dashboards?dashboard=dashboard-token-usage");
    expect(body).not.toContain("Project ID");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers alert list questions with injected project context and shared defaults", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const alertInputs: unknown[] = [];
    const alertProjectIds: string[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async alertRules(projectId, input) {
          alertProjectIds.push(projectId);
          alertInputs.push(input);
          return [
            alertRuleShape({
              id: "rule-checkout-errors",
              name: "Checkout trace errors",
              severity: "ERROR",
              kind: "TRACE_ERROR",
            }),
          ];
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-alert-list-tool",
        parts: [{ type: "text", text: "list error trace alerts for checkout" }],
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(alertProjectIds).toEqual(["project-1"]);
    expect(alertInputs).toEqual([
      {
        search: "checkout",
        status: null,
        severity: "ERROR",
        signal: "TRACE",
        enabled: null,
        sort: "updatedAt_desc",
      },
    ]);
    expect(body).toContain("CloudGrid returned 1 alert rule");
    expect(body).toContain("Checkout trace errors");
    expect(body).toContain("TRACE_ERROR");
    expect(body).not.toContain("Project ID");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers alert history questions with injected project context and shared defaults", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    const historyInputs: unknown[] = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async alertHistory(projectId, ruleId, first, after) {
          historyInputs.push({ projectId, ruleId, first, after });
          return {
            items: [
              {
                id: "event-1",
                projectId,
                ruleId: ruleId ?? "rule-1",
                instanceId: "instance-1",
                state: "FIRING",
                severity: "ERROR",
                summary: "Checkout trace errors is firing",
                deduplicationKey: "checkout:error",
                startedAt: "2026-05-21T16:52:14.000Z",
                endedAt: null,
                createdAt: "2026-05-21T16:52:14.000Z",
                evidenceTraceId: "trace-alert-1",
                evidenceSpanId: "span-alert-1",
                evidenceLogId: null,
                evidenceMetricName: null,
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          };
        },
        async aiChatAppendMessage() {},
      }),
      { graphqlUI: false, aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-alert-history-tool",
        parts: [{ type: "text", text: "show alert history for rule-checkout-errors" }],
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(harness.requests).toHaveLength(0);
    expect(historyInputs).toEqual([
      { projectId: "project-1", ruleId: "rule-checkout-errors", first: 50, after: null },
    ]);
    expect(body).toContain("CloudGrid returned 1 alert event");
    expect(body).toContain("Checkout trace errors is firing");
    expect(body).toContain("/traces/trace-alert-1?spanId=span-alert-1");
    expect(body).not.toContain("Project ID");

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

function metricDescriptor(name: string) {
  return {
    id: `metric:${name}`,
    tenantId: "tenant-1",
    projectId: "project-1",
    name,
    description: null,
    unit: "1",
    kind: "sum" as const,
    aggregationTemporality: "delta" as const,
    monotonic: true,
    attributeKeys: ["service.name", "gen_ai.system", "gen_ai.request.model", "gen_ai.token.type"],
    firstSeenAt: "2026-05-21T15:55:00.000Z",
    lastSeenAt: "2026-05-21T16:55:00.000Z",
  };
}

function dashboardShape(overrides: Record<string, unknown> = {}) {
  return {
    id: "dashboard-1",
    projectId: "project-1",
    slug: "genai-token-usage",
    name: "GenAI token usage",
    description: "Token usage by provider, model, and token type.",
    tags: ["genai"],
    version: 1,
    visibility: "personal" as const,
    defaultTimeWindow: "PT1H",
    pinned: false,
    widgets: [],
    createdAt: "2026-05-14T08:00:00.000Z",
    updatedAt: "2026-05-14T08:00:00.000Z",
    createdBy: "user-1",
    updatedBy: null,
    ...overrides,
  };
}

function alertRuleShape(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    projectId: "project-1",
    name: "Checkout trace errors",
    enabled: true,
    kind: "TRACE_ERROR",
    severity: "ERROR",
    query: { status: "error" },
    condition: { minCount: 1 },
    evaluationWindowSeconds: 300,
    pendingForSeconds: 60,
    cooldownSeconds: 300,
    notificationAdapterIds: ["in_app"],
    createdAt: "2026-05-14T08:00:00.000Z",
    updatedAt: "2026-05-14T08:00:00.000Z",
    updatedByUserId: "local-user",
    version: 1,
    ...overrides,
  };
}

function dashboardWidgetShape(overrides: Record<string, unknown> = {}) {
  return {
    id: "widget-1",
    title: "Widget",
    description: null,
    kind: "metric_timeseries" as const,
    layout: { x: 0, y: 0, w: 6, h: 4, minW: 3, minH: 2 },
    metric: null,
    richMetric: null,
    logs: null,
    traces: null,
    liveTraces: null,
    alert: null,
    ...overrides,
  };
}

function recordingProvider(chunks: TextStreamChunk[]) {
  const textStreamRequests: TextRequest[] = [];
  const provider: ModelProvider & { textStreamRequests: TextRequest[] } = {
    id: "recording",
    genAiSystem: "recording",
    textStreamRequests,
    async text(request): Promise<TextResponse> {
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
    async *textStream(request) {
      textStreamRequests.push(request);
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
  return provider;
}
