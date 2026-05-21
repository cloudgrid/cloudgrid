import { describe, expect, test } from "bun:test";
import { createAiChatHarness } from "./ai-chat-harness";
import type { AiChatHarnessRequest } from "./ai-chat-stream";

describe("AI Chat provider harness", () => {
  test("streams OpenAI Responses API text deltas without exposing credentials", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit }> = [];
    const harness = createAiChatHarness("provider", {
      fetch: async (url, init) => {
        fetchCalls.push({ url: String(url), init: init ?? {} });
        return new Response(
          [
            'data: {"type":"response.output_text.delta","delta":"hello"}',
            "",
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":7,"output_tokens":3}}}',
            "",
          ].join("\n"),
          {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          },
        );
      },
    });

    if (!harness) {
      throw new Error("expected provider harness");
    }

    const events = [];
    for await (const event of harness.streamChat(providerRequest())) {
      events.push(event);
    }

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toBe("https://api.openai.com/v1/responses");
    expect(fetchCalls[0]?.init.headers).toMatchObject({
      authorization: "Bearer stored-secret",
    });
    const providerBody = JSON.parse(String(fetchCalls[0]?.init.body));
    expect(providerBody.input[0]).toMatchObject({
      role: "developer",
      content: [
        {
          type: "input_text",
        },
      ],
    });
    const developerPrompt = providerBody.input[0].content[0].text;
    expect(typeof developerPrompt).toBe("string");
    expect(String(developerPrompt).includes("CloudGrid-native observability assistant")).toBe(true);
    expect(
      String(developerPrompt).includes(
        "traces, logs, metrics, dashboards, alerts, and AI-evaluation",
      ),
    ).toBe(true);
    expect(
      String(developerPrompt).includes("Do not tell users to switch to Jaeger, Zipkin, Datadog"),
    ).toBe(true);
    expect(String(developerPrompt).includes("Never invent CloudGrid CLIs")).toBe(true);
    expect(String(developerPrompt).includes("answer only from that evidence")).toBe(true);
    expect(String(developerPrompt).includes("Do not provide commands, API examples")).toBe(true);
    expect(String(developerPrompt).includes("stored-secret")).toBe(false);
    expect(JSON.stringify(providerBody)).not.toContain("stored-secret");
    expect(providerBody).toMatchObject({
      model: "gpt-5-mini",
      stream: true,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: developerPrompt,
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "Investigate this trace" }],
        },
      ],
    });
    expect(JSON.stringify(events)).not.toContain("stored-secret");
    expect(events).toEqual([
      { kind: "text_delta", text: "hello" },
      { kind: "usage", inputTokens: 7, outputTokens: 3 },
    ]);
  });

  test("uses configured OpenAI-compatible base URLs", async () => {
    const urls: string[] = [];
    const harness = createAiChatHarness("provider", {
      fetch: async (url) => {
        urls.push(String(url));
        return new Response("data: [DONE]\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });

    if (!harness) {
      throw new Error("expected provider harness");
    }

    for await (const _event of harness.streamChat(
      providerRequest({
        provider: {
          providerKind: "openai_compatible",
          model: "custom-model",
          baseUrl: "https://llm.example.test/v1",
          parameters: { extras: {} },
        },
      }),
    )) {
      // Drain the stream.
    }

    expect(urls).toEqual(["https://llm.example.test/v1/responses"]);
  });
});

function providerRequest(overrides: Partial<AiChatHarnessRequest> = {}): AiChatHarnessRequest {
  return {
    conversation: {
      id: "chat-1",
      companyId: "company-1",
      projectId: "project-1",
      userId: "local-user",
      title: "Investigate",
      status: "active",
      messages: [],
      latestRun: null,
      compaction: null,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
      lastMessageAt: "2026-05-19T00:00:00.000Z",
      version: 1,
    },
    provider: {
      providerKind: "openai",
      model: "gpt-5-mini",
      baseUrl: null,
      parameters: { extras: {} },
    },
    credential: {
      ref: "managed:company/company-1/provider-1",
      value: "stored-secret",
    },
    messages: [
      {
        id: "message-1",
        conversationId: "chat-1",
        role: "user",
        parts: [{ type: "text", text: "Investigate this trace" }],
        createdAt: "2026-05-19T00:00:00.000Z",
      },
    ],
    signal: new AbortController().signal,
    ...overrides,
  };
}
