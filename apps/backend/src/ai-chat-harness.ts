import type { AiChatHarnessEvent, AiChatHarnessPort, AiChatHarnessRequest } from "./ai-chat-stream";
import type { AiChatHarnessMode } from "./config";

interface CreateAiChatHarnessOptions {
  fetch?: HarnessFetch;
}

type HarnessFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const cloudGridDeveloperPrompt = [
  "You are the CloudGrid-native observability assistant running inside CloudGrid.",
  "Use CloudGrid product concepts: traces, logs, metrics, dashboards, alerts, and AI-evaluation evidence.",
  "Answer in terms of CloudGrid projects, telemetry views, dashboards, AI-eval runs, artifacts, and approved actions.",
  "Do not tell users to switch to Jaeger, Zipkin, Datadog, or another observability product as the primary answer.",
  "Never invent CloudGrid CLIs, REST telemetry read endpoints, product screens, dashboards, traces, logs, metrics, or tool output.",
  "If the user asks for telemetry and the runtime supplied tool evidence, answer only from that evidence.",
  "If the runtime did not supply evidence for a telemetry question, say that the requested CloudGrid data is unavailable in this run and ask for the missing project/time/filter context.",
  "Do not claim that tools, dashboards, traces, logs, metrics, NATS, SurrealDB, provider credentials, or shell commands were inspected unless the runtime supplied that evidence.",
  "Do not provide commands, API examples, UI routes, or setup steps unless they are present in CloudGrid specs or runtime evidence.",
  "Prefer concise CloudGrid-native summaries and links that are grounded in the supplied evidence.",
  "Never include provider secrets, bearer tokens, environment variables, NATS credentials, SurrealDB credentials, session cookies, or Authorization headers in responses.",
].join(" ");

export function createAiChatHarness(
  mode: AiChatHarnessMode,
  options: CreateAiChatHarnessOptions = {},
): AiChatHarnessPort | undefined {
  if (mode === "mock") {
    return new MockAiChatHarness();
  }
  if (mode === "provider") {
    return new OpenAiCompatibleChatHarness(options.fetch ?? fetch);
  }
  return undefined;
}

class OpenAiCompatibleChatHarness implements AiChatHarnessPort {
  constructor(private readonly fetchImpl: HarnessFetch) {}

  async *streamChat(request: AiChatHarnessRequest): AsyncIterable<AiChatHarnessEvent> {
    const endpoint = providerEndpoint(request);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${request.credential.value}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(providerRequestBody(request)),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      yield { kind: "provider_error", retryable: response.status >= 500 };
      return;
    }

    for await (const event of parseProviderSse(response.body)) {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        yield { kind: "text_delta", text: event.delta };
      }
      if (event.type === "response.completed" && isRecord(event.response)) {
        const usage = isRecord(event.response.usage) ? event.response.usage : {};
        const usageEvent: AiChatHarnessEvent = {
          kind: "usage",
        };
        const inputTokens = numberField(usage.input_tokens);
        const outputTokens = numberField(usage.output_tokens);
        if (inputTokens !== undefined) {
          usageEvent.inputTokens = inputTokens;
        }
        if (outputTokens !== undefined) {
          usageEvent.outputTokens = outputTokens;
        }
        yield usageEvent;
      }
      if (event.type === "error") {
        yield { kind: "provider_error", retryable: true };
      }
    }
  }

  async compactConversation() {
    return {
      summary: "Conversation compaction is not enabled for the direct provider harness.",
      retainedMessageIds: [],
    };
  }
}

class MockAiChatHarness implements AiChatHarnessPort {
  async *streamChat(request: AiChatHarnessRequest): AsyncIterable<AiChatHarnessEvent> {
    if (request.signal.aborted) {
      return;
    }
    const latestUserText = latestUserMessageText(request);
    const response = [
      "Mock provider response for CloudGrid AI Chat.",
      latestUserText ? ` I received: ${latestUserText}` : "",
    ].join("");
    yield { kind: "text_delta", text: response };
    yield {
      kind: "usage",
      inputTokens: estimateTokens(latestUserText),
      outputTokens: estimateTokens(response),
      estimatedCostUsd: 0,
    };
  }

  async compactConversation() {
    return {
      summary: "Mock AI Chat compaction retained the current conversation context.",
      retainedMessageIds: [],
    };
  }
}

function latestUserMessageText(request: AiChatHarnessRequest) {
  const latestUserMessage = [...request.messages]
    .reverse()
    .find((message) => message.role === "user");
  return (
    latestUserMessage?.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim() ?? ""
  );
}

function estimateTokens(value: string) {
  const text = value.trim();
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

function providerEndpoint(request: AiChatHarnessRequest) {
  if (request.provider.providerKind === "openai") {
    return "https://api.openai.com/v1/responses";
  }
  if (request.provider.providerKind === "openai_compatible" && request.provider.baseUrl) {
    const url = new URL(request.provider.baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/responses`;
    url.search = "";
    url.hash = "";
    return url.toString();
  }
  throw new Error(`Unsupported AI Chat provider kind: ${request.provider.providerKind}`);
}

function providerRequestBody(request: AiChatHarnessRequest) {
  const parameters = request.provider.parameters;
  return {
    ...objectExtras(parameters.extras),
    model: request.provider.model,
    input: [
      providerDeveloperMessage(),
      ...request.messages.map(providerMessage).filter((message) => message.content.length > 0),
    ],
    stream: true,
    ...(parameters.temperature === null || parameters.temperature === undefined
      ? {}
      : { temperature: parameters.temperature }),
    ...(parameters.topP === null || parameters.topP === undefined
      ? {}
      : { top_p: parameters.topP }),
    ...(parameters.maxOutputTokens === null || parameters.maxOutputTokens === undefined
      ? {}
      : { max_output_tokens: parameters.maxOutputTokens }),
    ...(parameters.reasoningEffort ? { reasoning: { effort: parameters.reasoningEffort } } : {}),
  };
}

function providerDeveloperMessage() {
  return {
    role: "developer",
    content: [
      {
        type: "input_text",
        text: cloudGridDeveloperPrompt,
      },
    ],
  };
}

function providerMessage(message: AiChatHarnessRequest["messages"][number]) {
  return {
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.parts
      .map((part) => (part.type === "text" && part.text ? part.text : ""))
      .filter(Boolean)
      .map((text) => ({
        type: message.role === "assistant" ? "output_text" : "input_text",
        text,
      })),
  };
}

async function* parseProviderSse(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const parsed = parseProviderSseEvent(event);
      if (parsed) {
        yield parsed;
      }
    }
  }
  buffer += decoder.decode();
  const parsed = parseProviderSseEvent(buffer);
  if (parsed) {
    yield parsed;
  }
}

function parseProviderSseEvent(event: string): Record<string, unknown> | null {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") {
    return null;
  }
  const parsed = JSON.parse(data) as unknown;
  return isRecord(parsed) ? parsed : null;
}

function objectExtras(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
