import {
  type CloudGridErrorId,
  createProblemDetails,
  type ProblemDetails,
  z,
} from "@cloudgrid/runtime";
import type {
  AiChatConversation,
  AiChatMessage,
  AiChatMessagePart,
  AiProviderParameters,
  CompanyAiProviderSettings,
  JSONValue,
  TraceSearchResult,
  TraceSummary,
} from "@cloudgrid/ui-contracts";
import { GraphQLError } from "graphql";
import type { Hono } from "hono";
import type { NormalizedAuthContext } from "./auth";
import type { ControlPlaneBridge, TelemetryQueryBridge } from "./bridge";

export type AiChatStreamEventType =
  | "run.started"
  | "message.created"
  | "text.delta"
  | "tool.started"
  | "tool.completed"
  | "artifact.created"
  | "action.proposed"
  | "compaction.started"
  | "compaction.saved"
  | "run.completed"
  | "run.failed"
  | "heartbeat";

export interface AiChatStreamEvent {
  type: AiChatStreamEventType;
  conversationId: string;
  runId: string;
  sequence?: number;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface AiChatHarnessPort {
  streamChat(request: AiChatHarnessRequest): AsyncIterable<AiChatHarnessEvent>;
  compactConversation(request: AiChatCompactionRequest): Promise<AiChatCompactionDraft>;
}

export interface AiChatHarnessRequest {
  conversation: AiChatConversation;
  provider: {
    providerKind: string;
    model: string;
    baseUrl?: string | null;
    parameters: AiProviderParameters;
  };
  credential: {
    ref: string;
    value: string;
  };
  messages: AiChatConversation["messages"];
  compaction?: AiChatConversation["compaction"] | null;
  signal: AbortSignal;
}

export type AiChatHarnessEvent =
  | { kind: "text_delta"; text: string }
  | { kind: "final_message"; text: string }
  | { kind: "usage"; inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number }
  | { kind: "provider_error"; message?: string; retryable?: boolean }
  | { kind: "tool_call_requested"; name: string; arguments: Record<string, unknown> };

export interface AiChatCompactionRequest {
  conversation: AiChatConversation;
  provider: AiChatHarnessRequest["provider"];
  credential: AiChatHarnessRequest["credential"];
}

export interface AiChatCompactionDraft {
  summary: string;
  retainedMessageIds: string[];
}

interface AiChatVariables {
  bridge: Partial<ControlPlaneBridge & TelemetryQueryBridge>;
  auth: { authenticateRequest(request: Request): Promise<NormalizedAuthContext> };
}

interface AttachAiChatStreamOptions {
  harness?: AiChatHarnessPort | undefined;
}

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(20_000),
});

const streamRequestSchema = z.object({
  conversationId: z.string().min(1),
  projectId: z.string().min(1),
  userMessageClientId: z.string().min(1).max(120),
  idempotencyKey: z.string().min(16).max(160),
  parts: z.array(textPartSchema).min(1).max(16),
  skipUserMessageAppend: z.boolean().optional(),
  timezone: z.string().min(1).max(80).optional(),
});

type AiChatStreamRequest = z.infer<typeof streamRequestSchema>;

export function attachAiChatStreamRoutes<Variables extends AiChatVariables>(
  app: Hono<{ Variables: Variables }>,
  options: AttachAiChatStreamOptions = {},
) {
  app.post("/api/ai-chat/stream", async (context) => {
    const request = context.req.raw;
    const bridge = context.get("bridge");
    const auth = context.get("auth");
    if (!isAiChatBridge(bridge)) {
      return problemResponse("ERR-016");
    }

    let input: AiChatStreamRequest;
    try {
      input = streamRequestSchema.parse(await request.json());
    } catch {
      return problemResponse("ERR-001", "AI Chat stream request is invalid");
    }

    const authContext = await auth.authenticateRequest(request);
    const conversation = await bridge.aiChatConversation(input.conversationId, authContext);
    if (!conversation) {
      return problemResponse("ERR-001", "AI Chat conversation was not found");
    }
    if (conversation.projectId !== input.projectId) {
      return problemResponse("ERR-016");
    }
    if (conversation.status !== "active") {
      return problemResponse("ERR-001", "AI Chat conversation is archived");
    }
    if (!conversationOwnedByCurrentUser(conversation, authContext)) {
      return problemResponse("ERR-016");
    }

    const providerSettings = await bridge.companyAiProviderSettings(
      conversation.companyId,
      authContext,
    );
    const provider = redactedProvider(providerSettings);
    if (!provider) {
      return problemResponse("ERR-AIC-001");
    }
    const credential = await resolveCredential(provider.credentialRef, bridge, authContext);
    if (!credential) {
      return problemResponse("ERR-AIP-001");
    }
    const harness = options.harness;
    if (!harness) {
      return problemResponse("ERR-AIP-001", "AI Chat harness runtime is unavailable");
    }

    let runId: string;
    try {
      const run = await bridge.aiChatCreateRun(
        {
          conversationId: input.conversationId,
          projectId: input.projectId,
          userId: conversation.userId,
          userMessageClientId: input.userMessageClientId,
          idempotencyKey: input.idempotencyKey,
          providerKind: provider.publicSnapshot.providerKind,
          providerProfileId: provider.providerProfileId,
          model: provider.publicSnapshot.model,
        },
        authContext,
      );
      runId = run.id;
    } catch (error) {
      const response = problemResponseFromError(error);
      if (response) {
        return response;
      }
      throw error;
    }

    const userParts: AiChatMessagePart[] = input.parts.map((part) => ({
      type: "text",
      text: part.text,
    }));
    const shouldAppendUserMessage =
      input.skipUserMessageAppend !== true &&
      !conversationAlreadyHasMessage(conversation, userParts);
    const currentUserMessage: AiChatMessage = {
      id: input.userMessageClientId,
      conversationId: input.conversationId,
      role: "user",
      parts: userParts,
      createdAt: new Date().toISOString(),
    };
    const harnessMessages = shouldAppendUserMessage
      ? [...conversation.messages, currentUserMessage]
      : conversation.messages;

    if (shouldAppendUserMessage) {
      await bridge.aiChatAppendMessage(
        {
          conversationId: input.conversationId,
          runId,
          role: "user",
          parts: userParts,
        },
        authContext,
      );
    }

    return streamResponse(
      async (emit, signal) => {
        const assistantParts: AiChatMessagePart[] = [];
        const usage = {
          inputTokenCount: 0,
          outputTokenCount: 0,
          estimatedCostUsd: undefined as number | undefined,
        };
        let toolCallCount = 0;
        try {
          await emit("run.started", {
            userMessageClientId: input.userMessageClientId,
            provider: provider.publicSnapshot,
          });
          await emit("message.created", { role: "user", parts: userParts });

          const toolAnswer = await answerWithCloudGridTool({
            authContext,
            bridge,
            input,
            userText: userParts.map((part) => part.text ?? "").join("\n"),
          });
          if (toolAnswer) {
            toolCallCount = 1;
            await emit("tool.started", { name: toolAnswer.toolName });
            await emit("tool.completed", {
              name: toolAnswer.toolName,
              status: "completed",
              resultSummary: toolAnswer.resultSummary,
            });
            assistantParts.push({ type: "text", text: toolAnswer.text });
            await emit("text.delta", { text: toolAnswer.text });
            const finalParts = collapseTextParts(assistantParts);
            await bridge.aiChatAppendMessage(
              {
                conversationId: input.conversationId,
                runId,
                role: "assistant",
                parts: finalParts,
              },
              authContext,
            );
            await bridge.aiChatFinalizeRun(
              {
                runId,
                status: "completed",
                inputTokenCount: 0,
                outputTokenCount: 0,
                toolCallCount,
                sandboxScriptCount: 0,
                artifactCount: 0,
              },
              authContext,
            );
            await emit("run.completed", { status: "completed" });
            return;
          }

          for await (const event of harness.streamChat({
            conversation,
            provider: provider.publicSnapshot,
            credential,
            messages: harnessMessages,
            compaction: conversation.compaction,
            signal,
          })) {
            if (signal.aborted) {
              throw new AbortError();
            }
            if (event.kind === "text_delta") {
              assistantParts.push({ type: "text", text: event.text });
              await emit("text.delta", { text: event.text });
              continue;
            }
            if (event.kind === "final_message") {
              assistantParts.push({ type: "text", text: event.text });
              await emit("message.created", {
                role: "assistant",
                parts: [{ type: "text", text: event.text }],
              });
              continue;
            }
            if (event.kind === "provider_error") {
              throw providerFailure();
            }
            if (event.kind === "usage") {
              usage.inputTokenCount = event.inputTokens ?? usage.inputTokenCount;
              usage.outputTokenCount = event.outputTokens ?? usage.outputTokenCount;
              usage.estimatedCostUsd = event.estimatedCostUsd ?? usage.estimatedCostUsd;
              continue;
            }
            if (event.kind === "tool_call_requested") {
              toolCallCount += 1;
              await emit("tool.started", { name: event.name });
              await emit("tool.completed", {
                name: event.name,
                status: "rejected",
                error: "AI Chat tool execution is not configured for this runtime",
              });
            }
          }

          const finalParts = collapseTextParts(assistantParts);
          if (finalParts.length) {
            await bridge.aiChatAppendMessage(
              {
                conversationId: input.conversationId,
                runId,
                role: "assistant",
                parts: finalParts,
              },
              authContext,
            );
          }
          await bridge.aiChatFinalizeRun(
            {
              runId,
              status: "completed",
              inputTokenCount: usage.inputTokenCount,
              outputTokenCount: usage.outputTokenCount,
              ...estimatedCostInput(usage.estimatedCostUsd),
              toolCallCount,
              sandboxScriptCount: 0,
              artifactCount: 0,
            },
            authContext,
          );
          await emit("run.completed", { status: "completed" });
        } catch (error) {
          if (error instanceof AbortError || signal.aborted) {
            await appendTerminalAssistantPart(bridge, input.conversationId, runId, authContext, {
              type: "error",
              text: "AI Chat run was cancelled.",
            } as unknown as AiChatMessagePart);
            await bridge.aiChatFinalizeRun(
              {
                runId,
                status: "cancelled",
                inputTokenCount: usage.inputTokenCount,
                outputTokenCount: usage.outputTokenCount,
                ...estimatedCostInput(usage.estimatedCostUsd),
                toolCallCount,
                sandboxScriptCount: 0,
                artifactCount: 0,
                error: "AI Chat run was cancelled.",
              },
              authContext,
            );
            return;
          }
          const problem =
            error instanceof AiChatStreamProblem ? error.problem : providerFailure().problem;
          await appendTerminalAssistantPart(bridge, input.conversationId, runId, authContext, {
            type: "error",
            text: problem.detail,
            json: problem as unknown as JSONValue,
          } as unknown as AiChatMessagePart);
          await bridge.aiChatFinalizeRun(
            {
              runId,
              status: "failed",
              inputTokenCount: usage.inputTokenCount,
              outputTokenCount: usage.outputTokenCount,
              ...estimatedCostInput(usage.estimatedCostUsd),
              toolCallCount,
              sandboxScriptCount: 0,
              artifactCount: 0,
              error: problem.detail,
            },
            authContext,
          );
          await emit("run.failed", { problem: sanitizeProblem(problem) });
        }
      },
      input.conversationId,
      runId,
      request.signal,
    );
  });
}

function isAiChatBridge(bridge: Partial<ControlPlaneBridge>): bridge is ControlPlaneBridge {
  return Boolean(
    bridge.aiChatConversation &&
      bridge.companyAiProviderSettings &&
      bridge.aiChatAppendMessage &&
      bridge.aiChatCreateRun &&
      bridge.aiChatFinalizeRun,
  );
}

function problemResponse(id: CloudGridErrorId, detail?: string, details?: Record<string, unknown>) {
  const input: {
    id: CloudGridErrorId;
    detail?: string;
    details?: Record<string, unknown>;
  } = { id };
  if (detail) {
    input.detail = detail;
  }
  if (details) {
    input.details = details;
  }
  const problem = createProblemDetails(input);
  return Response.json(problem, {
    status: problem.status,
    headers: { "content-type": "application/problem+json" },
  });
}

function problemResponseFromError(error: unknown) {
  if (!(error instanceof GraphQLError)) {
    return null;
  }
  const problem = error.extensions?.problem;
  if (!isProblemDetails(problem)) {
    return null;
  }
  return Response.json(problem, {
    status: problem.status,
    headers: { "content-type": "application/problem+json" },
  });
}

function streamResponse(
  run: (
    emit: (type: AiChatStreamEventType, payload: Record<string, unknown>) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void>,
  conversationId: string,
  runId: string,
  outerSignal: AbortSignal,
) {
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  outerSignal.addEventListener("abort", onAbort, { once: true });
  let sequence = 0;
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = async (type: AiChatStreamEventType, payload: Record<string, unknown>) => {
        if (abort.signal.aborted || closed) {
          throw new AbortError();
        }
        const event: AiChatStreamEvent = {
          type,
          conversationId,
          runId,
          createdAt: new Date().toISOString(),
          payload,
        };
        if (type !== "heartbeat") {
          sequence += 1;
          event.sequence = sequence;
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (error) {
          if (isStreamAbortError(error)) {
            abort.abort();
            throw new AbortError();
          }
          throw error;
        }
      };

      let closeError: unknown;
      try {
        await run(emit, abort.signal);
      } finally {
        outerSignal.removeEventListener("abort", onAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch (error) {
            if (!isStreamAbortError(error)) {
              closeError = error;
            }
          }
        }
      }
      if (closeError) {
        throw closeError;
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}

function conversationOwnedByCurrentUser(
  conversation: AiChatConversation,
  authContext: NormalizedAuthContext,
) {
  if (authContext.authMode === "local") {
    return conversation.userId === "local-user";
  }
  return Boolean(authContext.principalId && conversation.userId === authContext.principalId);
}

function conversationAlreadyHasMessage(
  conversation: AiChatConversation,
  parts: AiChatMessagePart[],
) {
  const lastMessage = conversation.messages.at(-1);
  if (!lastMessage || lastMessage.role !== "user") {
    return false;
  }
  return JSON.stringify(lastMessage.parts) === JSON.stringify(parts);
}

function redactedProvider(settings: CompanyAiProviderSettings) {
  const profile = settings.providerProfile;
  const alias = settings.chatModelAlias;
  if (!profile || !alias || settings.effective.missingChatProvider) {
    return null;
  }
  return {
    providerProfileId: profile.id,
    credentialRef: profile.credentialRef,
    publicSnapshot: {
      providerKind: profile.providerKind,
      model: alias.model,
      baseUrl: profile.baseUrl ?? null,
      parameters: alias.parameters,
    },
  };
}

async function answerWithCloudGridTool({
  authContext,
  bridge,
  input,
  userText,
}: {
  authContext: NormalizedAuthContext;
  bridge: Partial<ControlPlaneBridge & TelemetryQueryBridge>;
  input: AiChatStreamRequest;
  userText: string;
}): Promise<{ resultSummary: string; text: string; toolName: string } | null> {
  if (!isTodayTraceQuestion(userText)) {
    return null;
  }
  if (!bridge.searchTraces) {
    return {
      toolName: "cloudgrid.traces.search",
      resultSummary: "Trace search tool unavailable",
      text: "I could not query CloudGrid traces for today because the trace search tool is not available in this run.",
    };
  }

  const range = todayRange(input.timezone);
  const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
  const result = await bridge.searchTraces(
    {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      limit: 25,
      sort: "startedAt_desc",
    },
    authContext,
  );

  return {
    toolName: "cloudgrid.traces.search",
    resultSummary: `${result.items.length} traces returned for ${range.label} in ${project.label}`,
    text: formatTodayTracesAnswer(result, range, project),
  };
}

async function aiChatSelectedProjectContext(
  bridge: Partial<ControlPlaneBridge>,
  authContext: NormalizedAuthContext,
  projectId: string,
) {
  if (bridge.viewer) {
    try {
      const viewer = await bridge.viewer(authContext);
      const selectedProject = viewer?.selectedProject;
      if (selectedProject?.id === projectId) {
        return {
          id: selectedProject.id,
          label: `${selectedProject.name} (${selectedProject.id})`,
        };
      }
    } catch {
      // Trace search still has the authoritative project scope through authContext.
    }
  }
  return { id: projectId, label: projectId };
}

function isTodayTraceQuestion(text: string) {
  const normalized = text.toLowerCase();
  return (
    /\btraces?\b/.test(normalized) && (/\btoday\b/.test(normalized) || /\bheute\b/.test(normalized))
  );
}

function todayRange(timezone: string | undefined) {
  const safeTimezone = validTimeZone(timezone) ? (timezone as string) : "UTC";
  const now = new Date();
  const parts = datePartsInTimeZone(now, safeTimezone);
  const from = zonedDateTimeToUtc(parts.year, parts.month, parts.day, safeTimezone);
  return {
    from,
    to: now,
    label: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} (${safeTimezone})`,
  };
}

function formatTodayTracesAnswer(
  result: TraceSearchResult,
  range: ReturnType<typeof todayRange>,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No traces were returned for today in project ${project.label} (${range.label}) between ${range.from.toISOString()} and ${range.to.toISOString()}.`;
  }

  const rows = result.items.slice(0, 10).map(traceSummaryRow);
  const errorCount = result.items.filter((trace) => trace.errorSpanCount > 0).length;
  const nextCursor = result.nextCursor
    ? "\n\nMore traces are available for this range; open Traces with the same time range to continue paging."
    : "";
  return [
    `CloudGrid returned ${result.items.length} traces for today in project ${project.label} (${range.label}) between ${range.from.toISOString()} and ${range.to.toISOString()}.`,
    `Error traces in this result: ${errorCount}.`,
    "",
    "| Trace | Service | Operation | Started | Duration | Spans | Error spans |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ...rows,
    nextCursor,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function traceSummaryRow(trace: TraceSummary) {
  const operation = trace.operationName ?? "unknown";
  const service = trace.serviceName ?? "unknown";
  const duration = typeof trace.durationMs === "number" ? `${trace.durationMs.toFixed(1)} ms` : "-";
  return [
    markdownTableCell(`[${shortTraceId(trace.id)}](/traces/${encodeURIComponent(trace.id)})`),
    markdownTableCell(service),
    markdownTableCell(operation),
    markdownTableCell(trace.startedAt),
    markdownTableCell(duration),
    String(trace.spanCount),
    String(trace.errorSpanCount),
  ].join(" | ");
}

function shortTraceId(traceId: string) {
  return traceId.length > 12 ? `${traceId.slice(0, 12)}...` : traceId;
}

function markdownTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function validTimeZone(timezone: string | undefined) {
  if (!timezone) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    year: Number(parts.find((part) => part.type === "year")?.value ?? "1970"),
  };
}

function zonedDateTimeToUtc(year: number, month: number, day: number, timeZone: string) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return new Date(utcGuess.getTime() - timeZoneOffsetMs(utcGuess, timeZone));
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return asUtc - date.getTime();
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

async function resolveCredential(
  ref: string,
  bridge: ControlPlaneBridge,
  authContext: NormalizedAuthContext,
) {
  if (ref.startsWith("managed:")) {
    if (!bridge.resolveAiProviderSecret) {
      return null;
    }
    const credential = await bridge.resolveAiProviderSecret(ref, authContext);
    return { ref: credential.credentialRef, value: credential.value };
  }
  if (ref.startsWith("env:")) {
    const name = ref.slice("env:".length);
    if (!name || !/^[A-Z0-9_]+$/.test(name)) {
      return null;
    }
    const value = process.env[name];
    if (!value) {
      return null;
    }
    return { ref, credentialRef: ref, value };
  }
  return null;
}

function collapseTextParts(parts: AiChatMessagePart[]) {
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return text ? [{ type: "text" as const, text }] : [];
}

async function appendTerminalAssistantPart(
  bridge: ControlPlaneBridge,
  conversationId: string,
  runId: string,
  authContext: NormalizedAuthContext,
  part: AiChatMessagePart,
) {
  await bridge.aiChatAppendMessage(
    {
      conversationId,
      runId,
      role: "assistant",
      parts: [part],
    },
    authContext,
  );
}

function providerFailure() {
  return new AiChatStreamProblem(
    createProblemDetails({
      id: "ERR-AIP-001",
      detail: "AI Chat provider execution failed",
    }),
  );
}

function sanitizeProblem(problem: ProblemDetails) {
  return {
    type: problem.type,
    title: problem.title,
    status: problem.status,
    detail: problem.detail,
    id: problem.id,
    code: problem.code,
    retryable: problem.retryable,
  };
}

function estimatedCostInput(value: number | undefined) {
  return value === undefined ? {} : { estimatedCostUsd: value };
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "code" in value &&
    "status" in value &&
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    typeof value.status === "number"
  );
}

class AiChatStreamProblem extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail);
  }
}

class AbortError extends Error {}

function isStreamAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" ||
      error.name === "InvalidStateError" ||
      error.message === "The connection was closed.")
  );
}
