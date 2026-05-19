import {
  type CloudGridErrorId,
  createProblemDetails,
  type ProblemDetails,
  z,
} from "@cloudgrid/runtime";
import type {
  AiChatConversation,
  AiChatMessagePart,
  AiProviderParameters,
  CompanyAiProviderSettings,
  JSONValue,
} from "@cloudgrid/ui-contracts";
import { GraphQLError } from "graphql";
import type { Hono } from "hono";
import type { NormalizedAuthContext } from "./auth";
import type { ControlPlaneBridge } from "./bridge";

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
  bridge: Partial<ControlPlaneBridge>;
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
    const credential = resolveCredential(provider.credentialRef);
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
    const shouldAppendUserMessage = !conversationAlreadyHasMessage(conversation, userParts);

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

          for await (const event of harness.streamChat({
            conversation,
            provider: provider.publicSnapshot,
            credential,
            messages: conversation.messages,
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
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = async (type: AiChatStreamEventType, payload: Record<string, unknown>) => {
        if (abort.signal.aborted) {
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await run(emit, abort.signal);
      } finally {
        outerSignal.removeEventListener("abort", onAbort);
        controller.close();
      }
    },
    cancel() {
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
    return conversation.userId === "user-local" || conversation.userId === "local";
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

function resolveCredential(ref: string) {
  if (!ref.startsWith("env:")) {
    return null;
  }
  const name = ref.slice("env:".length);
  if (!name || !/^[A-Z0-9_]+$/.test(name)) {
    return null;
  }
  const value = process.env[name];
  if (!value) {
    return null;
  }
  return { ref, value };
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
