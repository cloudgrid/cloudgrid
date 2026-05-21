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
  AlertEventConnection,
  AlertRule,
  AlertSeverity,
  AlertSignal,
  CompanyAiProviderSettings,
  DashboardListResult,
  JSONValue,
  LogSearchResult,
  MetricAggregation,
  MetricSeriesResult,
  TelemetryFacetResult,
  TraceDetail,
  TraceSearchResult,
  TraceSummary,
} from "@cloudgrid/ui-contracts";
import {
  LOG_SEARCH_HARD_LIMIT,
  METRIC_SERIES_HARD_LIMIT,
  buildAlertHistoryInput,
  buildAlertRuleSearchInput,
  buildDashboardListInput,
  buildLogSearchInput,
  buildTelemetryFacetInput,
  buildTraceDetailInput,
  buildTraceSearchInput,
  defaultMetricAggregationForMetricName,
  defaultMetricIntervalForHours,
} from "@cloudgrid/ui-contracts";
import { GraphQLError } from "graphql";
import type { Hono } from "hono";
import { AI_CHAT_CATALOG, type AiChatCatalogSnapshot, aiChatToolById } from "./ai-chat/catalog";
import type { NormalizedAuthContext } from "./auth";
import type { ControlPlaneBridge, MetricQueryBridge, TelemetryQueryBridge } from "./bridge";

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
  sessionId: string;
  catalog: AiChatCatalogSnapshot;
  temporalContext: AiChatTemporalContext;
  messages: AiChatConversation["messages"];
  compaction?: AiChatConversation["compaction"] | null;
  signal: AbortSignal;
}

export interface AiChatTemporalContext {
  nowUtc: string;
  timezone: string;
  localDate: string;
  localTime: string;
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
  bridge: Partial<ControlPlaneBridge & TelemetryQueryBridge & MetricQueryBridge>;
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

type TraceToolRange = {
  from: Date;
  to: Date;
  label: string;
};

type TraceToolIntent =
  | { kind: "today"; range: TraceToolRange; limit: 25; status?: "error" }
  | { kind: "recent"; range: TraceToolRange; limit: number; status?: "error" };

type TraceDetailToolIntent = {
  traceId: string;
};

type TelemetryFacetToolIntent = {
  range: TraceToolRange;
  search?: string | null;
  service?: string | null;
};

type DashboardListToolIntent = {
  query?: string | null;
};

type AlertListToolIntent = {
  search?: string | null;
  severity?: AlertSeverity | null;
  signal?: AlertSignal | null;
  enabled?: boolean | null;
};

type AlertHistoryToolIntent = {
  ruleId?: string | null;
};

type MetricToolIntent = {
  metricName: string;
  range: TraceToolRange;
  aggregation: MetricAggregation;
  interval: string;
  limit: 5000;
};

type LogToolIntent = {
  range: TraceToolRange;
  limit: number;
  service?: string | null;
  severity?: string | null;
  search?: string | null;
};

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

    const authContext = aiChatProjectAuthContext(
      await auth.authenticateRequest(request),
      input.projectId,
    );
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
            toolCallCount += 1;
            const toolCallId = toolCallIdFor(toolCallCount);
            await emit(
              "tool.started",
              safeToolStatusPayload({
                toolCallId,
                toolName: toolAnswer.toolName,
                status: "started",
              }),
            );
            await emit(
              "tool.completed",
              safeToolStatusPayload({
                toolCallId,
                toolName: toolAnswer.toolName,
                status: "completed",
              }),
            );
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
            sessionId: aiChatSessionId(conversation),
            catalog: AI_CHAT_CATALOG,
            temporalContext: aiChatTemporalContext(input.timezone),
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
              const toolCallId = toolCallIdFor(toolCallCount);
              await emit(
                "tool.started",
                safeToolStatusPayload({
                  toolCallId,
                  toolName: event.name,
                  status: "started",
                }),
              );
              await emit(
                "tool.completed",
                safeToolStatusPayload({
                  toolCallId,
                  toolName: event.name,
                  status: "failed",
                  errorCode: "ERR-AIC-001",
                }),
              );
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

function aiChatProjectAuthContext(
  authContext: NormalizedAuthContext,
  projectId: string,
): NormalizedAuthContext {
  return {
    ...authContext,
    projectId,
  };
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
  bridge: Partial<ControlPlaneBridge & TelemetryQueryBridge & MetricQueryBridge>;
  input: AiChatStreamRequest;
  userText: string;
}): Promise<{ text: string; toolName: string } | null> {
  const alertHistoryIntent = alertHistoryToolIntent(userText);
  if (alertHistoryIntent) {
    if (!bridge.alertHistory) {
      return {
        toolName: "alerts.history",
        text: "I could not query CloudGrid alert history because the alert history tool is not available in this run.",
      };
    }

    const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
    const historyInput = buildAlertHistoryInput({ ruleId: alertHistoryIntent.ruleId ?? null });
    const result = await bridge.alertHistory(
      input.projectId,
      historyInput.ruleId,
      historyInput.first,
      historyInput.after,
      authContext,
    );

    return {
      toolName: "alerts.history",
      text: formatAlertHistoryToolAnswer(result, project),
    };
  }

  const alertListIntent = alertListToolIntent(userText);
  if (alertListIntent) {
    if (!bridge.alertRules) {
      return {
        toolName: "alerts.list",
        text: "I could not query CloudGrid alerts because the alert list tool is not available in this run.",
      };
    }

    const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
    const result = await bridge.alertRules(
      input.projectId,
      buildAlertRuleSearchInput({
        search: alertListIntent.search ?? null,
        severity: alertListIntent.severity ?? null,
        signal: alertListIntent.signal ?? null,
        enabled: alertListIntent.enabled ?? null,
      }),
      authContext,
    );

    return {
      toolName: "alerts.list",
      text: formatAlertListToolAnswer(result, project),
    };
  }

  const dashboardIntent = dashboardListToolIntent(userText);
  if (dashboardIntent) {
    if (!bridge.dashboards) {
      return {
        toolName: "dashboards.list",
        text: "I could not query CloudGrid dashboards because the dashboard tool is not available in this run.",
      };
    }

    const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
    const result = await bridge.dashboards(
      buildDashboardListInput({ query: dashboardIntent.query ?? null }),
      authContext,
    );

    return {
      toolName: "dashboards.list",
      text: formatDashboardListToolAnswer(result, project),
    };
  }

  const traceDetailIntent = traceDetailToolIntent(userText);
  if (traceDetailIntent) {
    if (!bridge.getTraceDetail) {
      return {
        toolName: "telemetry.getTrace",
        text: "I could not query CloudGrid trace detail because the trace detail tool is not available in this run.",
      };
    }

    const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
    const result = await bridge.getTraceDetail(
      traceDetailIntent.traceId,
      buildTraceDetailInput(),
      authContext,
    );

    return {
      toolName: "telemetry.getTrace",
      text: formatTraceDetailToolAnswer(result, traceDetailIntent, project),
    };
  }

  const facetIntent = telemetryFacetToolIntent(userText, input.timezone);
  if (facetIntent) {
    if (!bridge.telemetryFacets) {
      return {
        toolName: "telemetry.getFacets",
        text: "I could not query CloudGrid telemetry facets because the facet tool is not available in this run.",
      };
    }

    const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
    const result = await bridge.telemetryFacets(
      buildTelemetryFacetInput({
        from: facetIntent.range.from.toISOString(),
        to: facetIntent.range.to.toISOString(),
        service: facetIntent.service ?? null,
        search: facetIntent.search ?? null,
      }),
      authContext,
    );

    return {
      toolName: "telemetry.getFacets",
      text: formatTelemetryFacetToolAnswer(result, facetIntent, project),
    };
  }

  const metricIntent = metricToolIntent(userText, input.timezone);
  if (metricIntent) {
    if (!bridge.metricSeries) {
      return {
        toolName: "telemetry.queryMetrics",
        text: "I could not query CloudGrid metrics because the metric query tool is not available in this run.",
      };
    }

    const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
    const result = await bridge.metricSeries(
      {
        metricName: metricIntent.metricName,
        from: metricIntent.range.from.toISOString(),
        to: metricIntent.range.to.toISOString(),
        interval: metricIntent.interval,
        aggregation: metricIntent.aggregation,
        groupBy: [],
        filters: [],
        limit: metricIntent.limit,
      },
      authContext,
    );

    return {
      toolName: "telemetry.queryMetrics",
      text: formatMetricToolAnswer(result, metricIntent, project),
    };
  }

  const logIntent = logToolIntent(userText, input.timezone);
  if (logIntent) {
    if (!bridge.searchLogs) {
      return {
        toolName: "telemetry.searchLogs",
        text: "I could not query CloudGrid logs because the log search tool is not available in this run.",
      };
    }

    const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
    const result = await bridge.searchLogs(
      buildLogSearchInput({
        from: logIntent.range.from.toISOString(),
        to: logIntent.range.to.toISOString(),
        service: logIntent.service ?? null,
        severity: logIntent.severity ?? null,
        search: logIntent.search ?? null,
        sort: "timestamp_desc",
        limit: logIntent.limit,
      }),
      authContext,
    );

    return {
      toolName: "telemetry.searchLogs",
      text: formatLogToolAnswer(result, logIntent, project),
    };
  }

  const intent = traceToolIntent(userText, input.timezone);
  if (!intent) {
    return null;
  }
  if (!bridge.searchTraces) {
    return {
      toolName: "telemetry.searchTraces",
      text: "I could not query CloudGrid traces because the trace search tool is not available in this run.",
    };
  }

  const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
  const result = await bridge.searchTraces(
    buildTraceSearchInput({
      from: intent.range.from.toISOString(),
      to: intent.range.to.toISOString(),
      limit: intent.limit,
      sort: "startedAt_desc",
      ...(intent.status ? { status: intent.status } : {}),
    }),
    authContext,
  );

  return {
    toolName: "telemetry.searchTraces",
    text: formatTraceToolAnswer(result, intent, project),
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

function traceToolIntent(text: string, timezone: string | undefined): TraceToolIntent | null {
  const normalized = text.toLowerCase();
  if (!/\btraces?\b/.test(normalized)) {
    return null;
  }
  const status = /\b(failing|failed|failure|error|errors|errored)\b/.test(normalized)
    ? "error"
    : undefined;
  if (/\btoday\b/.test(normalized) || /\bheute\b/.test(normalized)) {
    return { kind: "today", range: todayRange(timezone), limit: 25, ...(status ? { status } : {}) };
  }
  if (status && /\b(last|latest|recent|newest)\b/.test(normalized)) {
    return {
      kind: "recent",
      range: lastHoursRange(timezone, 24),
      limit: traceLimitFromText(normalized) ?? 10,
      status,
    };
  }
  return null;
}

function traceDetailToolIntent(text: string): TraceDetailToolIntent | null {
  const normalized = text.toLowerCase();
  if (!/\b(trace|span|waterfall|critical path|detail|details|summarize)\b/.test(normalized)) {
    return null;
  }
  const traceId = traceIdFromText(text);
  return traceId ? { traceId } : null;
}

function telemetryFacetToolIntent(
  text: string,
  timezone: string | undefined,
): TelemetryFacetToolIntent | null {
  const normalized = text.toLowerCase();
  if (!/\bfacets?\b/.test(normalized)) {
    return null;
  }
  if (
    !/\b(telemetry|trace|traces|log|logs|service|operation|attribute|severity)\b/.test(normalized)
  ) {
    return null;
  }
  const range = /\btoday\b/.test(normalized)
    ? todayRange(timezone)
    : lastHoursRange(timezone, metricHoursFromText(normalized) ?? 1);
  return {
    range,
    service: serviceFromFacetText(text),
    search: facetSearchFromText(text),
  };
}

function dashboardListToolIntent(text: string): DashboardListToolIntent | null {
  const normalized = text.toLowerCase();
  if (!/\bdashboards?\b/.test(normalized)) {
    return null;
  }
  if (!/\b(list|show|find|search|which|available)\b/.test(normalized)) {
    return null;
  }
  return {
    query: dashboardSearchFromText(text),
  };
}

function alertHistoryToolIntent(text: string): AlertHistoryToolIntent | null {
  const normalized = text.toLowerCase();
  if (!/\balerts?\b/.test(normalized) || !/\b(history|events?|recent)\b/.test(normalized)) {
    return null;
  }
  return { ruleId: alertRuleIdFromText(text) };
}

function alertListToolIntent(text: string): AlertListToolIntent | null {
  const normalized = text.toLowerCase();
  if (!/\balerts?\b/.test(normalized)) {
    return null;
  }
  if (!/\b(list|show|find|search|which|active|firing|errors?|failures?)\b/.test(normalized)) {
    return null;
  }
  return {
    search: alertSearchFromText(text),
    severity: alertSeverityFromText(normalized),
    signal: alertSignalFromText(normalized),
    enabled: /\b(disabled|inactive)\b/.test(normalized)
      ? false
      : /\b(enabled|active)\b/.test(normalized)
        ? true
        : null,
  };
}

function metricToolIntent(text: string, timezone: string | undefined): MetricToolIntent | null {
  const normalized = text.toLowerCase();
  const metricName = metricNameFromText(text);
  if (!metricName) {
    return null;
  }
  if (
    !/\b(metrics?|series|timeseries|time series|usage|tokens?|samples?|chart|plot|show)\b/.test(
      normalized,
    )
  ) {
    return null;
  }
  const hours = metricHoursFromText(normalized) ?? 1;
  const range = /\btoday\b/.test(normalized)
    ? todayRange(timezone)
    : lastHoursRange(timezone, hours);
  return {
    metricName,
    range,
    aggregation: defaultMetricAggregationForMetricName(metricName, normalized),
    interval: defaultMetricIntervalForHours(hours),
    limit: METRIC_SERIES_HARD_LIMIT,
  };
}

function logToolIntent(text: string, timezone: string | undefined): LogToolIntent | null {
  const normalized = text.toLowerCase();
  if (!/\blogs?\b/.test(normalized)) {
    return null;
  }
  if (!/\b(show|list|find|search|latest|last|recent|newest|errors?|failures?)\b/.test(normalized)) {
    return null;
  }
  const hours = metricHoursFromText(normalized) ?? 1;
  const range = /\btoday\b/.test(normalized)
    ? todayRange(timezone)
    : lastHoursRange(timezone, hours);
  return {
    range,
    limit: logLimitFromText(normalized) ?? 10,
    severity: logSeverityFromText(normalized),
    service: serviceFromLogText(text),
    search: quotedSearchFromText(text),
  };
}

function metricNameFromText(text: string) {
  const matches = text.match(/\b[a-zA-Z_:][a-zA-Z0-9_:]*(?:[._][a-zA-Z0-9_:]+)+\b/g) ?? [];
  return (
    matches
      .map((match) => match.replace(/[.,;:!?)]$/g, ""))
      .find((match) => match.includes(".") || match.includes("_")) ?? null
  );
}

function traceIdFromText(text: string) {
  const matches = text.match(/\btrace-[a-zA-Z0-9_.:-]{3,128}\b/g) ?? [];
  return matches.at(0)?.replace(/[.,;:!?)]$/g, "") ?? null;
}

function serviceFromFacetText(text: string) {
  const match = text.match(/\bservice\s+([a-zA-Z0-9][a-zA-Z0-9_.:-]{1,80})\b/);
  return match?.[1]?.replace(/[.,;:!?)]$/g, "") ?? null;
}

function facetSearchFromText(text: string) {
  const quoted = quotedSearchFromText(text);
  if (quoted) {
    return quoted;
  }
  const match = text.match(/\b(?:for|matching|search)\s+([a-zA-Z0-9][a-zA-Z0-9_.:-]{1,80})\b/);
  return match?.[1]?.replace(/[.,;:!?)]$/g, "") ?? null;
}

function dashboardSearchFromText(text: string) {
  const quoted = quotedSearchFromText(text);
  if (quoted) {
    return quoted;
  }
  const match = text.match(
    /\b(?:for|matching|search|named)\s+([a-zA-Z0-9][a-zA-Z0-9_.:-]{1,80})\b/,
  );
  return match?.[1]?.replace(/[.,;:!?)]$/g, "") ?? null;
}

function alertRuleIdFromText(text: string) {
  const matches = text.match(/\brule-[a-zA-Z0-9_.:-]{3,128}\b/g) ?? [];
  return matches.at(0)?.replace(/[.,;:!?)]$/g, "") ?? null;
}

function alertSearchFromText(text: string) {
  const quoted = quotedSearchFromText(text);
  if (quoted) {
    return quoted;
  }
  const match = text.match(
    /\b(?:for|matching|search|named)\s+([a-zA-Z0-9][a-zA-Z0-9_.:-]{1,80})\b/,
  );
  const value = match?.[1]?.replace(/[.,;:!?)]$/g, "") ?? null;
  return value?.startsWith("rule-") ? null : value;
}

function alertSeverityFromText(text: string): AlertSeverity | null {
  if (/\bcritical\b/.test(text)) return "CRITICAL";
  if (/\b(error|errors|errored|failed|failing|failure)\b/.test(text)) return "ERROR";
  if (/\b(warn|warning|warnings)\b/.test(text)) return "WARNING";
  if (/\b(info|information)\b/.test(text)) return "INFO";
  return null;
}

function alertSignalFromText(text: string): AlertSignal | null {
  if (/\btraces?\b/.test(text)) return "TRACE";
  if (/\blogs?\b/.test(text)) return "LOG";
  if (/\bmetrics?\b/.test(text)) return "METRIC";
  return null;
}

function metricHoursFromText(text: string) {
  const hourMatch = text.match(/\b(?:last|past)\s+(\d{1,3})\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hourMatch) {
    return boundedMetricHours(Number(hourMatch[1]));
  }
  const dayMatch = text.match(/\b(?:last|past)\s+(\d{1,2})\s*(?:d|day|days)\b/);
  if (dayMatch) {
    return boundedMetricHours(Number(dayMatch[1]) * 24);
  }
  return null;
}

function boundedMetricHours(hours: number) {
  if (!Number.isFinite(hours) || hours < 1) {
    return null;
  }
  return Math.min(Math.trunc(hours), 24 * 30);
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

function lastHoursRange(timezone: string | undefined, hours: number): TraceToolRange {
  const safeTimezone = validTimeZone(timezone) ? (timezone as string) : "UTC";
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return {
    from,
    to,
    label: `last ${hours} hours (${safeTimezone})`,
  };
}

function traceLimitFromText(text: string) {
  const match = text.match(/\b(?:last|latest|recent|newest)\s+(\d{1,3})\b/);
  if (!match) {
    return null;
  }
  const limit = Number(match[1]);
  if (!Number.isInteger(limit) || limit < 1) {
    return null;
  }
  return Math.min(limit, 25);
}

function logLimitFromText(text: string) {
  const match = text.match(/\b(?:last|latest|recent|newest|show|list)\s+(\d{1,3})\b/);
  if (!match) {
    return null;
  }
  const limit = Number(match[1]);
  if (!Number.isInteger(limit) || limit < 1) {
    return null;
  }
  return Math.min(limit, LOG_SEARCH_HARD_LIMIT);
}

function logSeverityFromText(text: string) {
  if (/\b(error|errors|errored|failed|failing|failure)\b/.test(text)) return "error";
  if (/\b(warn|warning|warnings)\b/.test(text)) return "warn";
  if (/\b(info|information)\b/.test(text)) return "info";
  if (/\b(debug)\b/.test(text)) return "debug";
  return null;
}

function serviceFromLogText(text: string) {
  const match = text.match(/\b(?:from|for|service)\s+([a-zA-Z0-9][a-zA-Z0-9_.:-]{1,80})\b/);
  return match?.[1]?.replace(/[.,;:!?)]$/g, "") ?? null;
}

function quotedSearchFromText(text: string) {
  const match = text.match(/["']([^"']{2,160})["']/);
  return match?.[1]?.trim() ?? null;
}

function formatTraceToolAnswer(
  result: TraceSearchResult,
  intent: TraceToolIntent,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    const qualifier = intent.status === "error" ? "failing " : "";
    return `No ${qualifier}traces were returned for ${intent.range.label} in project ${project.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`;
  }

  const rows = result.items.slice(0, intent.limit).map(traceSummaryRow);
  const errorCount = result.items.filter((trace) => trace.errorSpanCount > 0).length;
  const nextCursor = result.nextCursor
    ? "\n\nMore traces are available for this range; open Traces with the same time range to continue paging."
    : "";
  const noun = intent.status === "error" ? "failing traces" : "traces";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for ${intent.range.label} in project ${project.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`,
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

function formatTraceDetailToolAnswer(
  result: TraceDetail | null,
  intent: TraceDetailToolIntent,
  project: { id: string; label: string },
) {
  if (!result) {
    return `Trace ${intent.traceId} was not found in project ${project.label}.`;
  }

  const rootSpan =
    result.spans.find((span) => span.id === result.trace.rootSpanId) ?? result.spans.at(0) ?? null;
  const errorSpanCount = result.spans.filter((span) => span.hasError).length;
  const criticalPath = result.structure.criticalPathSpanIds.length;
  const warnings = result.warnings.length
    ? `\n\nWarnings: ${result.warnings.map((warning) => warning.message).join("; ")}`
    : "";
  return [
    `Trace ${result.trace.id} in project ${project.label}: ${result.trace.status ?? "unset"} status, ${durationLabel(result.trace.durationMs)}, ${result.spans.length} spans, ${errorSpanCount} error spans, ${result.relatedLogs.length} related logs.`,
    `Root service: ${result.trace.serviceName ?? rootSpan?.serviceName ?? "unknown"}. Root operation: ${rootSpan?.name ?? "unknown"}.`,
    `Critical path spans: ${criticalPath}. Max depth: ${result.structure.maxDepth}.`,
    `Open: /traces/${encodeURIComponent(result.trace.id)}`,
    warnings,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatTelemetryFacetToolAnswer(
  result: TelemetryFacetResult,
  intent: TelemetryFacetToolIntent,
  project: { id: string; label: string },
) {
  const sections = [
    facetSection("Services", result.services),
    facetSection("Operations", result.operations),
    facetSection("Span names", result.spanNames),
    facetSection("Severities", result.severities),
    facetSection("Attribute keys", result.attributeKeys),
  ].filter(Boolean);
  if (!sections.length) {
    return `No telemetry facets were returned for ${intent.range.label} in project ${project.label}.`;
  }
  return [
    `CloudGrid telemetry facets for ${intent.range.label} in project ${project.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}:`,
    "",
    ...sections,
  ].join("\n");
}

function formatDashboardListToolAnswer(
  result: DashboardListResult,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No dashboards were returned for project ${project.label}.`;
  }

  const rows = result.items.map((dashboard) => dashboardRow(dashboard, result.pinnedDashboardIds));
  const noun = result.items.length === 1 ? "dashboard" : "dashboards";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for project ${project.label}.`,
    "",
    "| Dashboard | Visibility | Pinned | Widgets | Tags |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function formatAlertListToolAnswer(rules: AlertRule[], project: { id: string; label: string }) {
  if (!rules.length) {
    return `No alert rules were returned for project ${project.label}.`;
  }

  const noun = rules.length === 1 ? "alert rule" : "alert rules";
  return [
    `CloudGrid returned ${rules.length} ${noun} for project ${project.label}.`,
    "",
    "| Rule | Enabled | Severity | Signal | Kind | Updated |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rules.map(alertRuleRow),
  ].join("\n");
}

function formatAlertHistoryToolAnswer(
  result: AlertEventConnection,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No alert events were returned for project ${project.label}.`;
  }

  const noun = result.items.length === 1 ? "alert event" : "alert events";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for project ${project.label}.`,
    "",
    "| Started | State | Severity | Summary | Evidence |",
    "| --- | --- | --- | --- | --- |",
    ...result.items.map(alertEventRow),
  ].join("\n");
}

function formatMetricToolAnswer(
  result: MetricSeriesResult,
  intent: MetricToolIntent,
  project: { id: string; label: string },
) {
  const pointCount = result.series.reduce((total, series) => total + series.points.length, 0);
  if (pointCount === 0) {
    return `No metric samples were returned for ${intent.metricName} in project ${project.label} for ${intent.range.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`;
  }

  const rows = result.series
    .slice(0, 8)
    .map((series, index) => metricSeriesRow(series, index + 1))
    .filter(Boolean);
  const warningText = result.warnings.length
    ? `\n\nWarnings: ${result.warnings.map((warning) => warning.message).join("; ")}`
    : "";
  return [
    `CloudGrid returned ${pointCount} samples across ${result.series.length} series for ${intent.metricName} in project ${project.label} for ${intent.range.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`,
    `Aggregation: ${result.aggregation}. Interval: ${result.interval ?? intent.interval}.`,
    "",
    "| Series | Labels | Latest sample | Value |",
    "| ---: | --- | --- | ---: |",
    ...rows,
    warningText,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatLogToolAnswer(
  result: LogSearchResult,
  intent: LogToolIntent,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No logs were returned for ${intent.range.label} in project ${project.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`;
  }

  const rows = result.items.slice(0, intent.limit).map(logEventRow);
  const nextCursor = result.nextCursor
    ? "\n\nMore logs are available for this range; open Logs with the same filters to continue paging."
    : "";
  return [
    `CloudGrid returned ${result.items.length} logs for ${intent.range.label} in project ${project.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`,
    "",
    "| Time | Severity | Service | Trace | Body |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    nextCursor,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function metricSeriesRow(series: MetricSeriesResult["series"][number], index: number) {
  const latest = series.points.at(-1);
  if (!latest) {
    return "";
  }
  const labels = metricLabels(series.labels);
  return [
    String(index),
    markdownTableCell(labels),
    markdownTableCell(latest.timestamp),
    String(latest.value),
  ].join(" | ");
}

function facetSection(label: string, values: TelemetryFacetResult["services"]) {
  if (!values.length) {
    return "";
  }
  return `${label}: ${values
    .slice(0, 8)
    .map((facet) => `${facet.value} (${facet.count})`)
    .join(", ")}`;
}

function dashboardRow(
  dashboard: DashboardListResult["items"][number],
  pinnedDashboardIds: string[],
) {
  const widgets = dashboard.widgets.map((widget) => widget.kind).join(", ") || "-";
  return [
    markdownTableCell(
      `[${dashboard.name}](/dashboards?dashboard=${encodeURIComponent(dashboard.id)})`,
    ),
    markdownTableCell(dashboard.visibility),
    pinnedDashboardIds.includes(dashboard.id) || dashboard.pinned ? "yes" : "no",
    markdownTableCell(widgets),
    markdownTableCell(dashboard.tags.join(", ") || "-"),
  ].join(" | ");
}

function alertRuleRow(rule: AlertRule) {
  return [
    markdownTableCell(rule.name),
    rule.enabled ? "yes" : "no",
    markdownTableCell(rule.severity),
    markdownTableCell(alertSignalFromKind(rule.kind)),
    markdownTableCell(rule.kind),
    markdownTableCell(rule.updatedAt),
  ].join(" | ");
}

function alertEventRow(event: AlertEventConnection["items"][number]) {
  return [
    markdownTableCell(event.startedAt),
    markdownTableCell(event.state),
    markdownTableCell(event.severity),
    markdownTableCell(event.summary),
    markdownTableCell(alertEvidenceLink(event)),
  ].join(" | ");
}

function alertSignalFromKind(kind: AlertRule["kind"]) {
  if (kind.startsWith("TRACE_")) return "TRACE";
  if (kind.startsWith("LOG_")) return "LOG";
  return "METRIC";
}

function alertEvidenceLink(event: AlertEventConnection["items"][number]) {
  if (event.evidenceTraceId && event.evidenceSpanId) {
    return `/traces/${encodeURIComponent(event.evidenceTraceId)}?spanId=${encodeURIComponent(event.evidenceSpanId)}`;
  }
  if (event.evidenceTraceId) {
    return `/traces/${encodeURIComponent(event.evidenceTraceId)}`;
  }
  if (event.evidenceLogId) {
    return event.evidenceLogId;
  }
  return event.evidenceMetricName ?? "-";
}

function durationLabel(durationMs: number | null | undefined) {
  return typeof durationMs === "number" ? `${durationMs.toFixed(1)} ms` : "unknown duration";
}

function metricLabels(labels: JSONValue) {
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
    return "{}";
  }
  const entries = Object.entries(labels as Record<string, unknown>);
  if (!entries.length) {
    return "{}";
  }
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function logEventRow(log: LogSearchResult["items"][number]) {
  const trace =
    log.traceId && log.spanId
      ? `[${shortTraceId(log.traceId)}](/traces/${encodeURIComponent(log.traceId)}?spanId=${encodeURIComponent(log.spanId)})`
      : log.traceId
        ? `[${shortTraceId(log.traceId)}](/traces/${encodeURIComponent(log.traceId)})`
        : "-";
  return [
    markdownTableCell(log.timestamp),
    markdownTableCell(log.severityText ?? "-"),
    markdownTableCell(log.serviceName ?? "-"),
    markdownTableCell(trace),
    markdownTableCell(logBodyPreview(log.body, log.attributes)),
  ].join(" | ");
}

function logBodyPreview(body: JSONValue, attributes: JSONValue) {
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  const attributeText = importantLogAttributes(attributes);
  return attributeText ? `${bodyText} (${attributeText})` : bodyText;
}

function importantLogAttributes(attributes: JSONValue) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return "";
  }
  const record = attributes as Record<string, unknown>;
  return ["error_code", "error.type", "exception.type"]
    .map((key) => (record[key] ? `${key}=${String(record[key])}` : ""))
    .filter(Boolean)
    .join(", ");
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
  const parts = dateTimePartsInTimeZone(date, timeZone);
  return {
    day: parts.day,
    month: parts.month,
    year: parts.year,
  };
}

function dateTimePartsInTimeZone(date: Date, timeZone: string) {
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
  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? "1"),
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "1"),
    second: Number(parts.find((part) => part.type === "second")?.value ?? "0"),
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

function aiChatSessionId(conversation: AiChatConversation) {
  return [
    `company:${conversation.companyId}`,
    `project:${conversation.projectId}`,
    `user:${conversation.userId}`,
    `conversation:${conversation.id}`,
  ].join(":");
}

function aiChatTemporalContext(timezone: string | undefined): AiChatTemporalContext {
  const safeTimezone = validTimeZone(timezone) ? (timezone as string) : "UTC";
  const now = new Date();
  const parts = dateTimePartsInTimeZone(now, safeTimezone);
  return {
    nowUtc: now.toISOString(),
    timezone: safeTimezone,
    localDate: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
    localTime: `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`,
  };
}

function toolCallIdFor(toolCallCount: number) {
  return `tool-${toolCallCount}`;
}

function safeToolStatusPayload(input: {
  toolCallId: string;
  toolName: string;
  status: "started" | "completed" | "failed";
  durationMs?: number;
  errorCode?: CloudGridErrorId;
}) {
  const tool = aiChatToolById(input.toolName);
  return {
    toolCallId: input.toolCallId,
    toolName: tool?.id ?? input.toolName,
    label: tool?.streamLabel ?? "Using CloudGrid tool",
    status: input.status,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  };
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
