import { describe, expect, test } from "bun:test";
import type {
  AgentRun,
  AiChatRun,
  AiQualityOverview,
  AlertRule,
  CompanyAiProviderSettings,
  Dataset,
  Experiment,
  Scorer,
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
import { AI_CHAT_TOOLS } from "./ai-chat/catalog";
import { createAiChatHarness } from "./ai-chat-harness";
import type { AiChatHarnessEvent, AiChatHarnessPort } from "./ai-chat-stream";
import { validateAiChatRenderSpec } from "./ai-chat-stream";
import { graphQLErrorFromBridge } from "./bridge";
import { createAppWithBridge } from "./graphql";
import { bridge } from "./test-helpers";

describe("AI Chat stream endpoint", () => {
  test("rejects malformed trace waterfall render specs before streaming", () => {
    expect(() =>
      validateAiChatRenderSpec({
        renderer: "trace_waterfall",
        title: "Malformed trace",
        ariaLabel: "Malformed trace waterfall",
        data: { trace: {}, spans: [{}], structure: {} },
      }),
    ).toThrow("AI Chat render spec failed validation");
  });

  test("rejects malformed table, status, log, and metric render specs before streaming", () => {
    const base = { title: "Artifact", ariaLabel: "Artifact" };

    for (const renderSpec of [
      { ...base, renderer: "table", data: { rows: {} } },
      { ...base, renderer: "key_value", data: [] },
      { ...base, renderer: "status_summary", data: [] },
      { ...base, renderer: "log_list", data: { items: {} } },
      { ...base, renderer: "metric_timeseries", data: { result: { series: [] } } },
      { ...base, renderer: "metric_bar", data: { data: {} } },
      { ...base, renderer: "json_tree", data: [] },
      { ...base, renderer: "diff", data: { before: "a" } },
      { ...base, renderer: "mermaid", data: { diagram: 42 } },
      { ...base, renderer: "action_approval", data: { actionKind: "dashboard.save" } },
    ]) {
      expect(() => validateAiChatRenderSpec(renderSpec)).toThrow(
        "AI Chat render spec failed validation",
      );
    }
  });

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
      { aiChatHarness: harness },
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
      { aiChatHarness: harness },
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
      { aiChatHarness: harness },
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
      "text.delta",
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
      { aiChatHarness: harness },
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
        "run.completed",
      ]);
      expect(provider.objectRequests).toHaveLength(1);
      expect(provider.objectRequests[0]?.model).toBe("gpt-5-mini");
      expect(provider.objectRequests[0]?.messages[0]?.role).toBe("system");
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
      { aiChatHarness: harness },
    );

    const response = await app.fetch(streamRequest({ idempotencyKey: "idempotency-key-managed" }));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("stored-provider-key");
    expect(harness.requests.at(0)?.credential.value).toBe("stored-provider-key");
  });

  test("rejects managed chat credentials scoped to another company before secret resolution", async () => {
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    let resolved = false;
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
              credentialRef: "managed:company/other-company/provider-1",
            },
          });
        },
        async resolveAiProviderSecret() {
          resolved = true;
          return { credentialRef: "managed:company/other-company/provider-1", value: "wrong" };
        },
      }),
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({ idempotencyKey: "idempotency-key-wrong-company-credential" }),
    );
    const problem = await response.json();

    expect(response.status).toBe(503);
    expect(problem.id).toBe("ERR-AIP-001");
    expect(problem.detail).toBe("AI provider credential is not scoped to this conversation");
    expect(resolved).toBe(false);
    expect(harness.requests).toHaveLength(0);
  });

  test("rejects managed chat credentials scoped to another project before secret resolution", async () => {
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
    let resolved = false;
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
              credentialRef: "managed:project/other-project/provider-1",
            },
          });
        },
        async resolveAiProviderSecret() {
          resolved = true;
          return { credentialRef: "managed:project/other-project/provider-1", value: "wrong" };
        },
      }),
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({ idempotencyKey: "idempotency-key-wrong-project-credential" }),
    );
    const problem = await response.json();

    expect(response.status).toBe(503);
    expect(problem.id).toBe("ERR-AIP-001");
    expect(problem.detail).toBe("AI provider credential is not scoped to this conversation");
    expect(resolved).toBe(false);
    expect(harness.requests).toHaveLength(0);
  });

  test("rejects managed credential resolver responses that swap the credential ref", async () => {
    const harness = recordingHarness([{ kind: "final_message", text: "should not run" }]);
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
        async resolveAiProviderSecret() {
          return { credentialRef: "managed:company/company-2/provider-1", value: "wrong" };
        },
      }),
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({ idempotencyKey: "idempotency-key-swapped-managed-ref" }),
    );
    const problem = await response.json();

    expect(response.status).toBe(503);
    expect(problem.id).toBe("ERR-AIP-001");
    expect(harness.requests).toHaveLength(0);
  });

  test("maps provider runtime errors to safe actionable failure details", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([
      {
        kind: "provider_error",
        message: "401 Unauthorized: invalid API key sk-secret-provider-key",
        retryable: false,
      },
    ]);
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
      }),
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({ idempotencyKey: "idempotency-key-provider-error" }),
    );
    const body = await response.text();
    const failed = parseSse(body).find((event) => event.type === "run.failed");

    expect(response.status).toBe(200);
    expect(failed).toMatchObject({
      payload: {
        problem: {
          code: "AI_PROVIDER_CREDENTIAL_UNAVAILABLE",
          detail: "AI provider rejected the configured credential",
        },
      },
    });
    expect(body).not.toContain("sk-secret-provider-key");
    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("maps opaque provider runtime errors to a product-level failure detail", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = recordingHarness([
      {
        kind: "provider_error",
        message: "AI Chat harness execution failed",
        retryable: true,
      },
    ]);
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
      }),
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({ idempotencyKey: "idempotency-key-provider-opaque-error" }),
    );
    const body = await response.text();
    const failed = parseSse(body).find((event) => event.type === "run.failed");

    expect(response.status).toBe(200);
    expect(failed).toMatchObject({
      payload: {
        problem: {
          detail: "The configured AI provider could not complete this request",
        },
      },
    });
    expect(body).not.toContain("AI Chat harness execution failed");
    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
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
      { aiChatHarness: harness },
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
      { aiChatHarness: harness },
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
      { aiChatHarness: harness },
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
    const harness = toolCallingHarness({
      name: "telemetry.searchTraces",
      args: { window: "today", limit: 25 },
    });
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
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-trace-tool",
        parts: [{ type: "text", text: "what are the traces of today?" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();
    const events = parseSse(body);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.created",
      "tool.started",
      "tool.completed",
      "artifact.created",
      "text.delta",
      "run.completed",
    ]);
    expectArtifact(body, "table", "Traces");
    const toolEvents = events.filter(
      (event) => event.type === "tool.started" || event.type === "tool.completed",
    );
    expect(toolEvents.map((event) => event.payload)).toEqual([
      {
        toolCallId: "tool-1",
        toolName: "telemetry.searchTraces",
        label: "Searching traces",
        status: "running",
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
    expect(harness.requests).toHaveLength(1);
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
    const harness = toolCallingHarness({
      name: "telemetry.searchTraces",
      args: { limit: 10, windowHours: 24, status: "error" },
    });
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
      { aiChatHarness: harness },
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
    expect(harness.requests).toHaveLength(1);
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

  test("answers recent trace questions through the provider tool loop without asking for confirmation", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const provider = objectLoopProvider([
      {
        toolCalls: [
          {
            id: "call-recent-traces",
            name: "telemetry_searchTraces",
            arguments: { limit: 10, windowHours: 24 },
          },
        ],
      },
      {
        answer: "CloudGrid returned 1 recent trace. Open /traces/trace-recent-1 for details.",
        usage: { inputTokens: 40, outputTokens: 12, totalTokens: 52 },
      },
    ]);
    const harness = createAiChatHarness("provider", { providerFactory: () => provider });
    if (!harness) {
      throw new Error("expected provider harness");
    }
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
                id: "trace-recent-1",
                serviceName: "api",
                operationName: "GET /recent",
                startedAt: "2026-05-21T16:55:00.000Z",
                startedAtUnixNano: "0",
                endedAt: null,
                endedAtUnixNano: null,
                durationNano: "90000000",
                durationMs: 90,
                rootSpanId: "span-1",
                status: "ok",
                attributes: {},
                spanCount: 2,
                errorSpanCount: 0,
                logCount: 0,
                serviceCount: 1,
              },
            ],
            nextCursor: null,
          };
        },
        async aiChatAppendMessage() {},
      }),
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-recent-traces",
        parts: [{ type: "text", text: "what are the recent 10 traces?" }],
        timezone: "Europe/Berlin",
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(provider.objectRequests).toHaveLength(2);
    const providerToolNames = provider.objectRequests[0]?.tools?.map((tool) => tool.name) ?? [];
    expect(providerToolNames).toContain("telemetry_searchTraces");
    expect(providerToolNames).not.toContain("telemetry.searchTraces");
    expect(providerToolNames.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
    expect(traceInputs).toHaveLength(1);
    expect(traceInputs[0]).toMatchObject({
      limit: 10,
      sort: "startedAt_desc",
    });
    expectArtifact(body, "table", "Traces");
    expect(body).toContain("CloudGrid returned 1 recent trace");
    expect(body).toContain("/traces/trace-recent-1");
    expect(body).not.toContain("Would you like me");
    expect(body).not.toContain("confirm");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers metric questions with injected project context and default query settings", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = toolCallingHarness({
      name: "telemetry.queryMetrics",
      args: { metricName: "gen_ai.client.token.usage", windowHours: 24 },
    });
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
      { aiChatHarness: harness },
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
    expect(harness.requests).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "message.created",
      "tool.started",
      "tool.completed",
      "artifact.created",
      "text.delta",
      "run.completed",
    ]);
    expectArtifact(body, "metric_timeseries", "gen_ai.client.token.usage");
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
    const harness = toolCallingHarness({
      name: "telemetry.searchLogs",
      args: { limit: 10, severity: "error", service: "storage-write" },
    });
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
      { aiChatHarness: harness },
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
    expectArtifact(body, "log_list", "Logs");
    expect(harness.requests).toHaveLength(1);
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
    const harness = toolCallingHarness({
      name: "telemetry.getTrace",
      args: { traceId: "trace-detail-123" },
    });
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
      { aiChatHarness: harness },
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
    expectArtifact(body, "trace_waterfall", "Trace trace-detail-123");
    expect(parseSse(body)).toContainEqual(
      expect.objectContaining({
        type: "artifact.created",
        payload: expect.objectContaining({
          renderSpec: expect.objectContaining({
            data: expect.objectContaining({
              trace: expect.objectContaining({ id: "trace-detail-123" }),
              spans: expect.any(Array),
              structure: expect.any(Object),
            }),
          }),
        }),
      }),
    );
    expect(harness.requests).toHaveLength(1);
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
    const harness = toolCallingHarness({
      name: "telemetry.getFacets",
      args: { window: "today", search: "checkout" },
    });
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
      { aiChatHarness: harness },
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
    expectArtifact(body, "table", "Telemetry facets");
    expect(harness.requests).toHaveLength(1);
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
    const harness = toolCallingHarness({
      name: "dashboards.list",
      args: { query: "tokens" },
    });
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
      { aiChatHarness: harness },
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
    expectArtifact(body, "table", "Dashboards");
    expect(harness.requests).toHaveLength(1);
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
    const harness = toolCallingHarness({
      name: "alerts.list",
      args: { search: "checkout", severity: "ERROR", signal: "TRACE" },
    });
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
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-alert-list-tool",
        parts: [{ type: "text", text: "list error trace alerts for checkout" }],
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expectArtifact(body, "table", "Alert rules");
    expect(harness.requests).toHaveLength(1);
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
    const harness = toolCallingHarness({
      name: "alerts.history",
      args: { ruleId: "rule-checkout-errors" },
    });
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
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-alert-history-tool",
        parts: [{ type: "text", text: "show alert history for rule-checkout-errors" }],
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expectArtifact(body, "table", "Alert history");
    expect(harness.requests).toHaveLength(1);
    expect(historyInputs).toEqual([
      { projectId: "project-1", ruleId: "rule-checkout-errors", first: 50, after: null },
    ]);
    expect(body).toContain("CloudGrid returned 1 alert event");
    expect(body).toContain("Checkout trace errors is firing");
    expect(body).toContain("/traces/trace-alert-1?spanId=span-alert-1");
    expect(body).not.toContain("Project ID");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers AI Eval agent run questions with injected project context and shared defaults", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = toolCallingHarness({
      name: "aiEval.searchAgentRuns",
      args: { limit: 10, status: "error", agentName: "support" },
    });
    const agentRunInputs: unknown[] = [];
    const agentRunProjectIds: Array<string | undefined> = [];
    const { app } = createAppWithBridge(
      bridge({
        async aiChatConversation() {
          return conversation();
        },
        async companyAiProviderSettings() {
          return configuredCompanyProvider();
        },
        async agentRuns(input, authContext) {
          agentRunInputs.push(input);
          agentRunProjectIds.push(authContext?.projectId);
          return {
            items: [
              agentRunShape({
                id: "agent-run-checkout-1",
                traceId: "trace-agent-1",
                rootSpanId: "span-agent-1",
                agent: { name: "support" },
                status: "error",
                durationMs: 2450,
              }),
            ],
            nextCursor: null,
          };
        },
        async aiChatAppendMessage() {},
      }),
      { aiChatHarness: harness },
    );

    const response = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-ai-eval-agent-runs",
        parts: [{ type: "text", text: "show the last 10 failing AI Eval agent runs for support" }],
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expectArtifact(body, "table", "AI Eval agent runs");
    expect(harness.requests).toHaveLength(1);
    expect(agentRunProjectIds).toEqual(["project-1"]);
    expect(agentRunInputs).toHaveLength(1);
    expect(agentRunInputs[0]).toMatchObject({
      agentId: null,
      agentName: "support",
      status: "error",
      experimentRunId: null,
      query: null,
      limit: 10,
      cursor: null,
    });
    expect(String((agentRunInputs[0] as { from?: string }).from)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body).toContain("CloudGrid returned 1 AI Eval agent run");
    expect(body).toContain("support");
    expect(body).toContain("error");
    expect(body).toContain("/traces/trace-agent-1?spanId=span-agent-1");
    expect(body).not.toContain("Project ID");

    delete process.env.CLOUDGRID_TEST_AI_CHAT_KEY;
  });

  test("answers route-backed AI Eval questions with shared defaults", async () => {
    process.env.CLOUDGRID_TEST_AI_CHAT_KEY = "secret-provider-key";
    const harness = promptToolHarness([
      {
        includes: "datasets",
        name: "aiEval.searchDatasets",
        args: { query: "regression" },
      },
      {
        includes: "scorers",
        name: "aiEval.searchScorers",
        args: { query: "exact" },
      },
      {
        includes: "experiments",
        name: "aiEval.searchExperiments",
        args: { query: "checkout", status: "running" },
      },
      {
        includes: "production quality",
        name: "aiEval.qualityOverview",
        args: { service: "checkout" },
      },
    ]);
    const calls: Array<{ method: string; input: unknown; projectId: string | undefined }> = [];
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
        async datasets(input, authContext) {
          calls.push({ method: "datasets", input, projectId: authContext?.projectId });
          return {
            items: [datasetShape({ id: "dataset-regression", name: "Regression" })],
            nextCursor: null,
          };
        },
        async scorers(input, authContext) {
          calls.push({ method: "scorers", input, projectId: authContext?.projectId });
          return {
            items: [scorerShape({ id: "scorer-exact", name: "Exact answer" })],
            nextCursor: null,
          };
        },
        async experiments(input, authContext) {
          calls.push({ method: "experiments", input, projectId: authContext?.projectId });
          return {
            items: [experimentShape({ id: "experiment-checkout", name: "Checkout baseline" })],
            nextCursor: null,
          };
        },
        async aiQualityOverview(input, authContext) {
          calls.push({ method: "quality", input, projectId: authContext?.projectId });
          return qualityShape({ projectId: input.projectId });
        },
        async aiChatAppendMessage(input) {
          appended.push(input);
        },
        async aiChatFinalizeRun(input) {
          finalized.push(input);
          return runShape({ id: input.runId, status: input.status });
        },
      }),
      { aiChatHarness: harness },
    );

    const datasetResponse = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-ai-eval-datasets",
        parts: [{ type: "text", text: "list AI Eval datasets for regression" }],
      }),
    );
    const scorerResponse = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-ai-eval-scorers",
        parts: [{ type: "text", text: "show AI Eval scorers for exact" }],
      }),
    );
    const experimentResponse = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-ai-eval-experiments",
        parts: [{ type: "text", text: "list running AI Eval experiments for checkout" }],
      }),
    );
    const qualityResponse = await app.fetch(
      streamRequest({
        idempotencyKey: "idempotency-key-ai-eval-quality",
        parts: [{ type: "text", text: "show AI Eval production quality for checkout" }],
      }),
    );

    const bodies = await Promise.all([
      datasetResponse.text(),
      scorerResponse.text(),
      experimentResponse.text(),
      qualityResponse.text(),
    ]);

    expect([
      datasetResponse.status,
      scorerResponse.status,
      experimentResponse.status,
      qualityResponse.status,
    ]).toEqual([200, 200, 200, 200]);
    expect(harness.requests).toHaveLength(4);
    expect(calls).toHaveLength(4);
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "datasets",
        projectId: "project-1",
        input: expect.objectContaining({ query: "regression", limit: 50, cursor: null }),
      }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "scorers",
        projectId: "project-1",
        input: expect.objectContaining({ query: "exact", limit: 50, cursor: null }),
      }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "experiments",
        projectId: "project-1",
        input: expect.objectContaining({ query: "checkout", status: "running", limit: 50 }),
      }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: "quality",
        projectId: "project-1",
        input: expect.objectContaining({ projectId: "project-1", service: "checkout", limit: 50 }),
      }),
    );
    expect(bodies.join("\n")).toContain("Regression");
    expect(bodies.join("\n")).toContain("Exact answer");
    expect(bodies.join("\n")).toContain("Checkout baseline");
    expect(bodies.join("\n")).toContain("Production quality");
    const events = bodies.flatMap(parseSse);
    const artifactEvents = events.filter((event) => event.type === "artifact.created");
    expect(artifactEvents).toHaveLength(4);
    expect(
      artifactEvents.map((event) => (event.payload as { renderer?: string }).renderer),
    ).toEqual(["table", "table", "table", "status_summary"]);
    expect(artifactEvents[0]?.payload).toMatchObject({
      label: "AI Eval datasets",
      renderSpec: {
        renderer: "table",
        title: "AI Eval datasets",
        ariaLabel: "AI Eval datasets table",
        data: { rows: expect.any(Array) },
      },
    });
    expect(appended).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "artifact",
            renderer: "table",
            label: "AI Eval datasets",
            json: expect.objectContaining({
              renderSpec: expect.objectContaining({
                renderer: "table",
                title: "AI Eval datasets",
              }),
            }),
          }),
        ]),
      }),
    );
    expect(finalized).toEqual(
      expect.arrayContaining([expect.objectContaining({ artifactCount: 1 })]),
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
      { aiChatHarness: harness },
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

function expectArtifact(body: string, renderer: string, label: string) {
  const artifacts = parseSse(body).filter((event) => event.type === "artifact.created");
  expect(artifacts).toContainEqual(
    expect.objectContaining({
      payload: expect.objectContaining({
        renderer,
        label,
        renderSpec: expect.objectContaining({ renderer }),
      }),
    }),
  );
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

function toolCallingHarness(tool: { name: string; args: Record<string, unknown> }) {
  return promptToolHarness([{ includes: "", ...tool }]);
}

function promptToolHarness(
  tools: Array<{ includes: string; name: string; args: Record<string, unknown> }>,
) {
  const requests: Array<Parameters<AiChatHarnessPort["streamChat"]>[0]> = [];
  const harness: AiChatHarnessPort & {
    requests: Array<Parameters<AiChatHarnessPort["streamChat"]>[0]>;
  } = {
    requests,
    async *streamChat(request) {
      requests.push(request);
      const latestUserMessage =
        request.messages
          .at(-1)
          ?.parts.map((part) => (part.type === "text" ? part.text : ""))
          .join(" ")
          .toLowerCase() ?? "";
      const tool =
        tools.find((candidate) => latestUserMessage.includes(candidate.includes.toLowerCase())) ??
        tools[0];
      if (!tool) {
        yield { kind: "final_message", text: "No test tool configured." };
        return;
      }
      const toolCallId = "tool-1";
      yield { kind: "tool_started", toolCallId, name: tool.name };
      const output = await request.executeTool?.(tool.name, tool.args);
      yield { kind: "tool_completed", toolCallId, name: tool.name, ...(output ? { output } : {}) };
      yield { kind: "final_message", text: output?.text ?? "Tool completed." };
    },
    async compactConversation() {
      return {
        summary: "Test compaction",
        retainedMessageIds: [],
      };
    },
  };
  return harness;
}

function objectLoopProvider(
  responses: Array<{
    answer?: string;
    toolCalls?: NonNullable<ObjectResponse["toolCalls"]>;
    usage?: ObjectResponse["usage"];
  }>,
) {
  const objectRequests: ObjectRequest[] = [];
  let index = 0;
  const provider: ModelProvider & { objectRequests: ObjectRequest[] } = {
    id: "object-loop",
    genAiSystem: "recording",
    objectRequests,
    async object<T extends JsonValue>(request: ObjectRequest<T>): Promise<ObjectResponse<T>> {
      objectRequests.push(request);
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return {
        object: { answer: response?.answer ?? "" } as unknown as T,
        ...(response?.toolCalls?.length ? { toolCalls: response.toolCalls } : {}),
        usage: response?.usage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        finishReason: response?.toolCalls?.length ? "tool_calls" : "stop",
      };
    },
  };
  return provider;
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

function agentRunShape(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "agent-run-1",
    traceId: "trace-agent-1",
    rootSpanId: "span-agent-1",
    agent: { name: "support" },
    status: "ok",
    startedAt: "2026-05-21T16:52:14.000Z",
    endedAt: null,
    durationMs: 1200,
    tokenTotals: { input: 12, output: 8, total: 20 },
    costEstimate: { amount: 0.01, currency: "USD" },
    transcript: [{ role: "user", spanId: "span-agent-1" }],
    llmCalls: [],
    toolCalls: [],
    retrievalEvents: [],
    evalResults: [],
    ...overrides,
  };
}

function datasetShape(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "dataset-1",
    name: "Regression",
    description: null,
    version: 1,
    createdAt: "2026-05-21T16:52:14.000Z",
    itemCount: 10,
    reviewedItemCount: 8,
    splitCounts: { dev: 4, regression: 6 },
    health: {
      status: "ready",
      reviewedItemCount: 8,
      totalItemCount: 10,
      splitCounts: { dev: 4, regression: 6 },
      duplicateCandidateCount: 0,
      leakageWarningCount: 0,
      missingExpectedCount: 0,
      schemaIssueCount: 0,
      smallDataset: false,
      warnings: [],
    },
    tags: ["checkout"],
    ...overrides,
  };
}

function scorerShape(overrides: Partial<Scorer> = {}): Scorer {
  return {
    id: "scorer-1",
    name: "Exact answer",
    kind: "deterministic",
    definition: { type: "exact_match", field: "expected.answer" },
    judgeModelRef: null,
    version: 1,
    calibration: null,
    ...overrides,
  };
}

function experimentShape(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: "experiment-1",
    name: "Checkout baseline",
    datasetId: "dataset-1",
    datasetVersion: 1,
    splitSelector: { splits: ["regression"], reviewedOnly: true, includeSynthetic: false },
    scorerIds: ["scorer-1"],
    baselineRef: null,
    promptVersionRefs: [],
    skillSnapshotRefs: [],
    toolSnapshotRefs: [],
    providerProfileRefs: [],
    createdAt: "2026-05-21T16:52:14.000Z",
    tags: ["checkout"],
    runs: { items: [], nextCursor: null },
    ...overrides,
  };
}

function qualityShape(overrides: Partial<AiQualityOverview> = {}): AiQualityOverview {
  return {
    projectId: "project-1",
    from: "2026-05-14T16:52:14.000Z",
    to: "2026-05-21T16:52:14.000Z",
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
  const objectRequests: ObjectRequest[] = [];
  const provider: ModelProvider & {
    textStreamRequests: TextRequest[];
    objectRequests: ObjectRequest[];
  } = {
    id: "recording",
    genAiSystem: "recording",
    textStreamRequests,
    objectRequests,
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
    async object<T extends JsonValue>(request: ObjectRequest<T>): Promise<ObjectResponse<T>> {
      objectRequests.push(request);
      return {
        object: {
          answer: chunks
            .filter(
              (chunk): chunk is Extract<TextStreamChunk, { kind: "delta" }> =>
                chunk.kind === "delta",
            )
            .map((chunk) => chunk.text)
            .join(""),
        } as unknown as T,
        usage: { inputTokens: 7, outputTokens: 4, totalTokens: 11 },
        finishReason: "stop",
      };
    },
  };
  return provider;
}
