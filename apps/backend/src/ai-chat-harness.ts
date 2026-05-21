import {
  createModelRegistry,
  type ModelCallOptions,
  type ModelDefaults,
  type ModelProvider,
  type SpanAttrs,
  type TelemetryShim,
} from "@purista/harness";
import { anthropic } from "@purista/harness-anthropic";
import { openai } from "@purista/harness-openai";
import type { AiChatHarnessEvent, AiChatHarnessPort, AiChatHarnessRequest } from "./ai-chat-stream";
import type { AiChatHarnessMode } from "./config";
import {
  createTraceContext,
  type SelfObservabilityTraceRecorder,
  type TraceContext,
  traceContextToTraceParent,
} from "./self-observability";

interface CreateAiChatHarnessOptions {
  providerFactory?: AiChatModelProviderFactory;
  traceContextFactory?: () => TraceContext;
  traceRecorder?: SelfObservabilityTraceRecorder;
}

type AiChatModelProviderFactory = (request: AiChatHarnessRequest) => ModelProvider;
type HarnessSpan = Parameters<Parameters<TelemetryShim["span"]>[2]>[0];
type ChatModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

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

/** Creates the AI Chat execution port for the configured runtime mode. */
export function createAiChatHarness(
  mode: AiChatHarnessMode,
  options: CreateAiChatHarnessOptions = {},
): AiChatHarnessPort | undefined {
  if (mode === "mock") {
    return new MockAiChatHarness();
  }
  if (mode === "provider") {
    return new PuristaAiChatHarness(options.providerFactory ?? providerFromAiChatSettings, {
      traceContextFactory: options.traceContextFactory ?? createTraceContext,
      ...(options.traceRecorder ? { traceRecorder: options.traceRecorder } : {}),
    });
  }
  return undefined;
}

class PuristaAiChatHarness implements AiChatHarnessPort {
  constructor(
    private readonly providerFactory: AiChatModelProviderFactory,
    private readonly telemetry: {
      traceContextFactory: () => TraceContext;
      traceRecorder?: SelfObservabilityTraceRecorder;
    },
  ) {}

  async *streamChat(request: AiChatHarnessRequest): AsyncIterable<AiChatHarnessEvent> {
    let provider: ModelProvider | undefined;
    try {
      provider = this.providerFactory(request);
      const defaults = modelDefaults(request);
      const telemetryShim = this.telemetry.traceRecorder
        ? new CloudGridHarnessTelemetryShim({
            traceContext: this.telemetry.traceContextFactory(),
            traceRecorder: this.telemetry.traceRecorder,
          })
        : undefined;
      const models = createModelRegistry(
        {
          chat: {
            provider,
            model: request.provider.model,
            capabilities: ["text_stream", "tool_use"] as const,
            ...(defaults ? { defaults } : {}),
          },
        },
        {
          harnessName: "cloudgrid-ai-chat",
          ...(telemetryShim ? { telemetry: telemetryShim } : {}),
        },
      );
      const chat = models.chat;
      if (!chat) {
        yield {
          kind: "provider_error",
          message: "AI Chat harness model alias was not registered",
          retryable: false,
        };
        return;
      }

      for await (const chunk of chat.textStream(
        { messages: modelMessages(request) },
        request.signal,
        {
          harnessName: "cloudgrid-ai-chat",
          sessionId: request.conversation.id,
          runId: request.conversation.latestRun?.id ?? request.conversation.id,
          agentId: "main",
        },
      )) {
        if (chunk.kind === "delta") {
          yield { kind: "text_delta", text: chunk.text };
        }
        if (chunk.kind === "tool_call") {
          yield {
            kind: "tool_call_requested",
            name: chunk.call.name,
            arguments: objectExtras(chunk.call.arguments),
          };
        }
        if (chunk.kind === "finish") {
          yield {
            kind: "usage",
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
          };
        }
      }
    } catch (error) {
      yield {
        kind: "provider_error",
        message: error instanceof Error ? error.message : "AI Chat harness execution failed",
        retryable: isRetryableHarnessError(error),
      };
    } finally {
      await provider?.close?.();
    }
  }

  async compactConversation() {
    return {
      summary: "Conversation compaction is not enabled for the CloudGrid AI Chat harness.",
      retainedMessageIds: [],
    };
  }
}

class CloudGridHarnessTelemetryShim implements TelemetryShim {
  readonly #traceRecorder: SelfObservabilityTraceRecorder;
  readonly #rootTraceContext: TraceContext;
  readonly #spanStack: TraceContext[] = [];

  constructor(options: {
    traceContext: TraceContext;
    traceRecorder: SelfObservabilityTraceRecorder;
  }) {
    this.#rootTraceContext = options.traceContext;
    this.#traceRecorder = options.traceRecorder;
  }

  async span<T>(name: string, attrs: SpanAttrs, fn: (span: HarnessSpan) => Promise<T>): Promise<T> {
    const parent = this.#spanStack.at(-1);
    const parentSpanId = parent?.spanId ?? this.#rootTraceContext.spanId;
    const traceState = parent?.traceState ?? this.#rootTraceContext.traceState;
    const spanContext = createTraceContext({
      traceId: () => this.#rootTraceContext.traceId,
      ...(parentSpanId ? { parentSpanId } : {}),
      ...(traceState ? { traceState } : {}),
    });
    const started = Date.now();
    this.#spanStack.push(spanContext);
    try {
      const result = await fn(noopHarnessSpan());
      this.#recordSpan(name, attrs, spanContext, started, "success");
      return result;
    } catch (error) {
      this.#recordSpan(name, attrs, spanContext, started, "error", error);
      throw error;
    } finally {
      this.#spanStack.pop();
    }
  }

  recordHistogram(_name: string, _value: number, _attrs: SpanAttrs): void {}

  recordCounter(_name: string, _value: number, _attrs: SpanAttrs): void {}

  currentTraceparent(): string | undefined {
    return traceContextToTraceParent(this.#spanStack.at(-1) ?? this.#rootTraceContext);
  }

  #recordSpan(
    name: string,
    attrs: SpanAttrs,
    spanContext: TraceContext,
    started: number,
    result: "success" | "error",
    error?: unknown,
  ) {
    this.#traceRecorder.recordSpan({
      name,
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      ...(spanContext.parentSpanId ? { parentSpanId: spanContext.parentSpanId } : {}),
      ...(spanContext.traceState ? { traceState: spanContext.traceState } : {}),
      attributes: {
        ...stringAttributes(attrs),
        ...(error instanceof Error ? { "error.type": error.name } : {}),
      },
      result,
      durationSeconds: Math.max(0, Date.now() - started) / 1000,
    });
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

function providerFromAiChatSettings(request: AiChatHarnessRequest): ModelProvider {
  const apiKey = request.credential.value;
  switch (request.provider.providerKind) {
    case "openai":
      return openai({ apiKey });
    case "openai_compatible":
      if (!request.provider.baseUrl) {
        throw new Error("OpenAI-compatible AI Chat providers require baseUrl");
      }
      return openai({ apiKey, baseURL: request.provider.baseUrl });
    case "anthropic":
      return anthropic({ apiKey });
    default:
      throw new Error(
        `Unsupported AI Chat provider kind for installed PURISTA harness adapters: ${request.provider.providerKind}`,
      );
  }
}

function isRetryableHarnessError(error: unknown) {
  if (!(error instanceof Error)) {
    return true;
  }
  return !(
    error.message.startsWith("Unsupported AI Chat provider kind") ||
    error.message === "OpenAI-compatible AI Chat providers require baseUrl"
  );
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

function modelMessages(request: AiChatHarnessRequest): ChatModelMessage[] {
  return [
    { role: "system", content: cloudGridDeveloperPrompt },
    ...request.messages.flatMap((message): ChatModelMessage[] => {
      const content = message.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n")
        .trim();
      if (!content) {
        return [];
      }
      return [
        {
          role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content,
        },
      ];
    }),
  ];
}

function modelDefaults(request: AiChatHarnessRequest): ModelDefaults | undefined {
  const parameters = request.provider.parameters;
  const defaults: ModelDefaults = {};
  if (parameters.temperature !== null && parameters.temperature !== undefined) {
    defaults.temperature = parameters.temperature;
  }
  if (parameters.topP !== null && parameters.topP !== undefined) {
    defaults.topP = parameters.topP;
  }
  if (parameters.maxOutputTokens !== null && parameters.maxOutputTokens !== undefined) {
    defaults.maxTokens = parameters.maxOutputTokens;
  }
  const providerOptions = providerCallOptions(parameters.extras);
  if (providerOptions) {
    defaults.providerOptions = providerOptions;
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined;
}

function providerCallOptions(value: unknown): ModelCallOptions["providerOptions"] | undefined {
  const extras = objectExtras(value);
  return Object.keys(extras).length > 0 ? extras : undefined;
}

function estimateTokens(value: string) {
  const text = value.trim();
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

function objectExtras(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringAttributes(attrs: SpanAttrs): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) {
      continue;
    }
    output[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return output;
}

function noopHarnessSpan(): HarnessSpan {
  const span = {
    spanContext: () => ({}),
    setAttribute: () => span,
    setAttributes: () => span,
    addEvent: () => span,
    addLink: () => span,
    addLinks: () => span,
    setStatus: () => span,
    updateName: () => span,
    end: () => {},
    isRecording: () => false,
    recordException: () => {},
  };
  return span as unknown as HarnessSpan;
}
