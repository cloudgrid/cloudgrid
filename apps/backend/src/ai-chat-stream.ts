import {
  type CloudGridErrorId,
  createProblemDetails,
  type ProblemDetails,
  z,
} from "@cloudgrid/runtime";
import type {
  AgentRunSearchResult,
  AgentRunStatus,
  AiChatConversation,
  AiChatMessage,
  AiChatMessagePart,
  AiProviderParameters,
  AiQualityOverview,
  AlertEventConnection,
  AlertRule,
  AlertSeverity,
  AlertSignal,
  CompanyAiProviderSettings,
  DashboardListResult,
  DatasetSearchResult,
  EvalResultSearchResult,
  ExperimentSearchResult,
  JSONValue,
  LogSearchResult,
  MetricAggregation,
  MetricSeriesResult,
  ScorerSearchResult,
  TelemetryFacetResult,
  TraceDetail,
  TraceSearchResult,
  TraceSummary,
} from "@cloudgrid/ui-contracts";
import {
  AI_EVAL_SEARCH_DEFAULT_LIMIT,
  buildAgentRunSearchInput,
  buildAiQualityOverviewInput,
  buildAlertHistoryInput,
  buildAlertRuleSearchInput,
  buildDashboardListInput,
  buildDatasetSearchInput,
  buildExperimentSearchInput,
  buildLogSearchInput,
  buildScorerSearchInput,
  buildTelemetryFacetInput,
  buildTraceDetailInput,
  buildTraceSearchInput,
  defaultMetricAggregationForMetricName,
  defaultMetricIntervalForHours,
  LOG_SEARCH_HARD_LIMIT,
  METRIC_SERIES_HARD_LIMIT,
} from "@cloudgrid/ui-contracts";
import { GraphQLError } from "graphql";
import type { Hono } from "hono";
import { AI_CHAT_CATALOG, type AiChatCatalogSnapshot, aiChatToolById } from "./ai-chat/catalog";
import type { NormalizedAuthContext } from "./auth";
import type {
  AiEvalBridge,
  ControlPlaneBridge,
  MetricQueryBridge,
  TelemetryQueryBridge,
} from "./bridge";

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
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<AiChatToolResult>;
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
  | { kind: "tool_call_requested"; name: string; arguments: Record<string, unknown> }
  | { kind: "tool_started"; toolCallId: string; name: string }
  | {
      kind: "tool_completed";
      toolCallId: string;
      name: string;
      output?: AiChatToolResult;
      errorCode?: CloudGridErrorId;
    };

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
  bridge: Partial<ControlPlaneBridge & TelemetryQueryBridge & MetricQueryBridge & AiEvalBridge>;
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

type AlertListToolIntent = {
  search?: string | null;
  severity?: AlertSeverity | null;
  signal?: AlertSignal | null;
  enabled?: boolean | null;
};

type AlertHistoryToolIntent = {
  ruleId?: string | null;
};

type AgentRunToolIntent = {
  range: TraceToolRange;
  limit: number;
  status?: AgentRunStatus | null;
  agentName?: string | null;
  query?: string | null;
};

type AiQualityToolIntent = {
  range: TraceToolRange;
  service?: string | null;
  agentName?: string | null;
  limit: number;
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

export type AiChatToolResult = {
  text: string;
  artifacts?: PendingAiChatArtifact[];
};

export type PendingAiChatArtifact = {
  renderer: "log_list" | "metric_timeseries" | "status_summary" | "table" | "trace_waterfall";
  label: string;
  renderSpec: Record<string, unknown>;
};

const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const renderRouteLinkSchema = z
  .object({
    label: z.string().min(1).max(120),
    to: z
      .string()
      .regex(
        /^\/(projects\/[^/]+\/)?(traces|logs|metrics|dashboards|ai-chat|ai-eval|settings)(\/.*)?$/,
      ),
  })
  .strict();

const traceRenderTraceSchema = z
  .object({
    id: z.string().min(1),
    serviceName: z.string().nullable().optional(),
    startedAt: z.string().min(1),
    startedAtUnixNano: z.string().regex(/^[0-9]+$/),
    endedAt: z.string().nullable().optional(),
    endedAtUnixNano: z.string().nullable().optional(),
    durationNano: z.string().nullable().optional(),
    durationMs: z.number().nonnegative().nullable().optional(),
    rootSpanId: z.string().nullable().optional(),
    status: z.enum(["ok", "error", "unset"]).nullable().optional(),
    attributes: z.record(z.string(), jsonValueSchema),
  })
  .strict();

const traceRenderSpanSchema = z
  .object({
    id: z.string().min(1),
    traceId: z.string().min(1),
    parentSpanId: z.string().nullable().optional(),
    name: z.string().min(1),
    kind: z.string().nullable().optional(),
    serviceName: z.string().nullable().optional(),
    startedAt: z.string().min(1),
    startedAtUnixNano: z.string().regex(/^[0-9]+$/),
    endedAt: z.string().min(1),
    endedAtUnixNano: z.string().regex(/^[0-9]+$/),
    startOffsetNano: z.string().regex(/^[0-9]+$/),
    durationNano: z.string().regex(/^[0-9]+$/),
    durationMs: z.number().nonnegative(),
    status: z.enum(["ok", "error", "unset"]).nullable().optional(),
    attributes: z.record(z.string(), jsonValueSchema),
    depth: z.number().int().nonnegative(),
    childCount: z.number().int().nonnegative(),
    hasError: z.boolean(),
    isCriticalPath: z.boolean(),
    isOrphan: z.boolean(),
    isServiceEntry: z.boolean(),
    exceptionCount: z.number().int().nonnegative(),
    events: z.array(z.record(z.string(), z.unknown())),
    links: z.array(z.record(z.string(), z.unknown())),
    exceptions: z.array(z.record(z.string(), z.unknown())),
  })
  .strict();

const traceRenderStructureSchema = z
  .object({
    rootSpanIds: z.array(z.string()),
    orphanSpanIds: z.array(z.string()),
    criticalPathSpanIds: z.array(z.string()),
    maxDepth: z.number().int().nonnegative(),
    serviceBreakdown: z.array(
      z
        .object({
          serviceName: z.string(),
          spanCount: z.number().int().nonnegative(),
          errorSpanCount: z.number().int().nonnegative(),
          durationMs: z.number().nonnegative(),
          percentOfTraceDuration: z.number().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

const traceWaterfallDataSchema = z
  .object({
    trace: traceRenderTraceSchema,
    spans: z.array(traceRenderSpanSchema).max(AI_CHAT_CATALOG.budgets.traceWaterfallSpans),
    structure: traceRenderStructureSchema,
    selectedSpan: traceRenderSpanSchema.nullable().optional(),
    spanMatches: z.array(z.record(z.string(), z.unknown())).optional(),
    logs: z.array(z.record(z.string(), z.unknown())).optional(),
    relatedLogs: z.array(z.record(z.string(), z.unknown())).optional(),
    warnings: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict();

const tableRenderDataSchema = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).max(AI_CHAT_CATALOG.budgets.embeddedTableRows),
  })
  .strict();

const keyValueRenderDataSchema = z
  .object({
    values: z.record(z.string(), z.unknown()),
  })
  .strict();

const statusSummaryRenderDataSchema = z
  .object({
    values: z.record(z.string(), z.unknown()).optional(),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .max(AI_CHAT_CATALOG.budgets.embeddedTableRows)
      .optional(),
  })
  .strict();

const logListRenderDataSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).max(AI_CHAT_CATALOG.budgets.logListRows),
    nextCursor: z.string().nullable().optional(),
  })
  .strict();

const metricSeriesRenderDataSchema = z
  .object({
    result: z
      .object({
        metric: z.record(z.string(), z.unknown()),
        series: z.array(
          z
            .object({
              labels: jsonValueSchema,
              points: z.array(z.record(z.string(), z.unknown())),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .strict()
  .superRefine((value, context) => {
    const pointCount = value.result.series.reduce(
      (total, series) => total + series.points.length,
      0,
    );
    if (pointCount > AI_CHAT_CATALOG.budgets.chartPoints) {
      context.addIssue({
        code: "custom",
        message: "metric series render data exceeds chart point limit",
        path: ["result", "series"],
      });
    }
  });

const metricBarRenderDataSchema = z
  .object({
    data: z.array(z.record(z.string(), z.unknown())).max(AI_CHAT_CATALOG.budgets.chartPoints),
    series: z
      .array(
        z
          .object({
            key: z.string().min(1),
            label: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    summary: z.string().optional(),
    label: z.string().optional(),
  })
  .strict();

const jsonTreeRenderDataSchema = z.record(z.string(), z.unknown());

const diffRenderDataSchema = z
  .object({
    before: z.string().max(20_000),
    after: z.string().max(20_000),
    language: z.string().max(40).optional(),
  })
  .strict();

const mermaidRenderDataSchema = z
  .object({
    diagram: z.string().min(1).max(20_000),
  })
  .strict();

const actionApprovalRenderDataSchema = z
  .object({
    actionProposalId: z.string().min(1),
    risk: z.enum(["low", "medium", "high", "destructive"]),
    actionKind: z.string().regex(/^[a-z]+\.[a-z_]+$/),
    summary: z.string().max(1000).optional(),
  })
  .strict();

const aiChatRenderSpecSchema = z
  .object({
    renderer: z.enum([
      "metric_timeseries",
      "metric_bar",
      "table",
      "key_value",
      "trace_waterfall",
      "log_list",
      "mermaid",
      "json_tree",
      "diff",
      "status_summary",
      "action_approval",
    ]),
    title: z.string().min(1).max(160),
    ariaLabel: z.string().min(1).max(240),
    data: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
    dataRef: z
      .string()
      .regex(/^sandbox:\/\/run\/[^/]+\/(inputs|outputs)\//)
      .optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    routeLinks: z.array(renderRouteLinkSchema).max(20).optional(),
    sourceToolCallIds: z.array(z.string()).optional(),
    artifactIds: z.array(z.string()).optional(),
    warnings: z.array(z.string().max(240)).max(10).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.data) === Boolean(value.dataRef)) {
      context.addIssue({
        code: "custom",
        message: "render spec must define exactly one of data or dataRef",
        path: ["data"],
      });
    }
    if (value.renderer === "trace_waterfall" && value.data !== undefined) {
      const result = traceWaterfallDataSchema.safeParse(value.data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          context.addIssue({ ...issue, path: ["data", ...issue.path] });
        }
      }
    }
    const rendererDataSchemas: Partial<Record<typeof value.renderer, z.ZodTypeAny>> = {
      table: tableRenderDataSchema,
      key_value: keyValueRenderDataSchema,
      status_summary: statusSummaryRenderDataSchema,
      log_list: logListRenderDataSchema,
      metric_timeseries: metricSeriesRenderDataSchema,
      metric_bar: metricBarRenderDataSchema,
      json_tree: jsonTreeRenderDataSchema,
      diff: diffRenderDataSchema,
      mermaid: mermaidRenderDataSchema,
      action_approval: actionApprovalRenderDataSchema,
    };
    const dataSchema = rendererDataSchemas[value.renderer];
    if (dataSchema && value.data !== undefined) {
      const result = dataSchema.safeParse(value.data);
      if (!result.success) {
        for (const issue of result.error.issues) {
          context.addIssue({ ...issue, path: ["data", ...issue.path] });
        }
      }
    }
  });

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
    const providerScope = providerCredentialScope(provider.credentialRef);
    if (!credentialScopeMatchesConversation(providerScope, conversation)) {
      return problemResponse(
        "ERR-AIP-001",
        "AI provider credential is not scoped to this conversation",
      );
    }
    const credential = await resolveCredential(
      provider.credentialRef,
      bridge,
      authContext,
      providerScope,
    );
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
        let artifactCount = 0;
        const assistantMessageId = assistantMessageIdFor(runId);
        try {
          await emit("run.started", {
            status: "streaming",
          });
          await emit("message.created", { messageId: input.userMessageClientId, role: "user" });

          for await (const event of harness.streamChat({
            conversation,
            provider: provider.publicSnapshot,
            credential,
            sessionId: aiChatSessionId(conversation),
            catalog: AI_CHAT_CATALOG,
            temporalContext: aiChatTemporalContext(input.timezone),
            messages: harnessMessages,
            compaction: conversation.compaction,
            executeTool: (name, args) =>
              executeAiChatTool({
                name,
                args,
                authContext,
                bridge,
                input,
              }),
            signal,
          })) {
            if (signal.aborted) {
              throw new AbortError();
            }
            if (event.kind === "text_delta") {
              assistantParts.push({ type: "text", text: event.text });
              await emit("text.delta", { messageId: assistantMessageId, text: event.text });
              continue;
            }
            if (event.kind === "final_message") {
              assistantParts.push({ type: "text", text: event.text });
              await emit("text.delta", { messageId: assistantMessageId, text: event.text });
              continue;
            }
            if (event.kind === "provider_error") {
              throw providerFailure(event.message);
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
                  status: "running",
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
            if (event.kind === "tool_started") {
              toolCallCount += 1;
              await emit(
                "tool.started",
                safeToolStatusPayload({
                  toolCallId: event.toolCallId,
                  toolName: event.name,
                  status: "running",
                }),
              );
              continue;
            }
            if (event.kind === "tool_completed") {
              await emit(
                "tool.completed",
                safeToolStatusPayload({
                  toolCallId: event.toolCallId,
                  toolName: event.name,
                  status: event.errorCode ? "failed" : "completed",
                  ...(event.errorCode ? { errorCode: event.errorCode } : {}),
                }),
              );
              if (event.output) {
                const artifacts = (event.output.artifacts ?? []).map((artifact, index) => ({
                  ...artifact,
                  renderSpec: validateAiChatRenderSpec(artifact.renderSpec),
                  artifactId: artifactIdFor(runId, toolCallCount, index + 1),
                }));
                for (const artifact of artifacts) {
                  artifactCount += 1;
                  assistantParts.push({
                    type: "artifact",
                    artifactId: artifact.artifactId,
                    renderer: artifact.renderer,
                    label: artifact.label,
                    json: {
                      renderSpec: artifact.renderSpec,
                    },
                  });
                  await emit("artifact.created", {
                    messageId: assistantMessageId,
                    artifactId: artifact.artifactId,
                    renderer: artifact.renderer,
                    label: artifact.label,
                    renderSpec: artifact.renderSpec,
                  });
                }
              }
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
              artifactCount,
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

export function validateAiChatRenderSpec(renderSpec: Record<string, unknown>): JSONValue {
  const json = JSON.stringify(renderSpec);
  if (json.length > AI_CHAT_CATALOG.budgets.renderSpecMaxBytes) {
    throw renderSpecProblem("render spec exceeds the configured size limit");
  }
  const parsed = aiChatRenderSpecSchema.safeParse(renderSpec);
  if (!parsed.success) {
    throw renderSpecProblem("AI Chat render spec failed validation");
  }
  return parsed.data as JSONValue;
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
  if (settings.companyId !== profile.ownerId || profile.ownerScope !== "company") {
    return null;
  }
  if (profile.id !== alias.providerProfileId) {
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

async function executeAiChatTool({
  name,
  args,
  authContext,
  bridge,
  input,
}: {
  name: string;
  args: Record<string, unknown>;
  authContext: NormalizedAuthContext;
  bridge: Partial<ControlPlaneBridge & TelemetryQueryBridge & MetricQueryBridge & AiEvalBridge>;
  input: AiChatStreamRequest;
}): Promise<AiChatToolResult> {
  switch (name) {
    case "telemetry.searchTraces": {
      if (!bridge.searchTraces) {
        return {
          text: "I could not query CloudGrid traces because the trace search tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const range = rangeFromToolArgs(args, input.timezone, 24);
      const limit = boundedIntegerArg(args.limit, 50, 1, 200);
      const status = stringArg(args.status);
      const result = await bridge.searchTraces(
        buildTraceSearchInput({
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          limit,
          sort: "startedAt_desc",
          ...(status === "error" ? { status } : {}),
        }),
        authContext,
      );
      const intent: TraceToolIntent =
        range.kind === "today"
          ? { kind: "today", range, limit: 25, ...(status === "error" ? { status } : {}) }
          : { kind: "recent", range, limit, ...(status === "error" ? { status } : {}) };
      return {
        text: formatTraceToolAnswer(result, intent, project),
        artifacts: [traceSearchTableArtifact(result)],
      };
    }
    case "telemetry.getTrace": {
      if (!bridge.getTraceDetail) {
        return {
          text: "I could not query CloudGrid trace detail because the trace detail tool is not available in this run.",
        };
      }
      const traceId = requiredStringArg(args.traceId ?? args.id, "traceId");
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const result = await bridge.getTraceDetail(traceId, buildTraceDetailInput(), authContext);
      return {
        text: formatTraceDetailToolAnswer(result, { traceId }, project),
        artifacts: result ? [traceWaterfallArtifact(result)] : [],
      };
    }
    case "telemetry.searchLogs": {
      if (!bridge.searchLogs) {
        return {
          text: "I could not query CloudGrid logs because the log search tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const range = rangeFromToolArgs(args, input.timezone, 1);
      const intent: LogToolIntent = {
        range,
        limit: boundedIntegerArg(args.limit, 10, 1, LOG_SEARCH_HARD_LIMIT),
        service: stringArg(args.service),
        severity: stringArg(args.severity),
        search: stringArg(args.search ?? args.query),
      };
      const result = await bridge.searchLogs(
        buildLogSearchInput({
          from: intent.range.from.toISOString(),
          to: intent.range.to.toISOString(),
          service: intent.service ?? null,
          severity: intent.severity ?? null,
          search: intent.search ?? null,
          sort: "timestamp_desc",
          limit: intent.limit,
        }),
        authContext,
      );
      return {
        text: formatLogToolAnswer(result, intent, project),
        artifacts: [logListArtifact(result)],
      };
    }
    case "telemetry.queryMetrics": {
      if (!bridge.metricSeries) {
        return {
          text: "I could not query CloudGrid metrics because the metric query tool is not available in this run.",
        };
      }
      const metricName = requiredStringArg(args.metricName ?? args.metric, "metricName");
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const range = rangeFromToolArgs(args, input.timezone, 1);
      const hours = rangeHours(range) ?? 1;
      const aggregation =
        metricAggregationArg(args.aggregation) ??
        defaultMetricAggregationForMetricName(metricName, "");
      const intent: MetricToolIntent = {
        metricName,
        range,
        aggregation,
        interval: stringArg(args.interval) ?? defaultMetricIntervalForHours(hours),
        limit: METRIC_SERIES_HARD_LIMIT,
      };
      const result = await bridge.metricSeries(
        {
          metricName,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          interval: intent.interval,
          aggregation: intent.aggregation,
          groupBy: [],
          filters: [],
          limit: intent.limit,
        },
        authContext,
      );
      return {
        text: formatMetricToolAnswer(result, intent, project),
        artifacts: [metricTimeseriesArtifact(result, metricName)],
      };
    }
    case "telemetry.getFacets": {
      if (!bridge.telemetryFacets) {
        return {
          text: "I could not query CloudGrid telemetry facets because the facet tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const range = rangeFromToolArgs(args, input.timezone, 1);
      const intent: TelemetryFacetToolIntent = {
        range,
        service: stringArg(args.service),
        search: stringArg(args.search ?? args.query),
      };
      const result = await bridge.telemetryFacets(
        buildTelemetryFacetInput({
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          service: intent.service ?? null,
          search: intent.search ?? null,
        }),
        authContext,
      );
      return {
        text: formatTelemetryFacetToolAnswer(result, intent, project),
        artifacts: [facetTableArtifact(result)],
      };
    }
    case "dashboards.list": {
      if (!bridge.dashboards) {
        return {
          text: "I could not query CloudGrid dashboards because the dashboard tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const result = await bridge.dashboards(
        buildDashboardListInput({ query: stringArg(args.query ?? args.search) ?? null }),
        authContext,
      );
      return {
        text: formatDashboardListToolAnswer(result, project),
        artifacts: [dashboardTableArtifact(result)],
      };
    }
    case "alerts.list": {
      if (!bridge.alertRules) {
        return {
          text: "I could not query CloudGrid alert rules because the alert rule tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const intent: AlertListToolIntent = {
        search: stringArg(args.search ?? args.query),
        severity: alertSeverityArg(args.severity),
        signal: alertSignalArg(args.signal),
        enabled: booleanArg(args.enabled),
      };
      const rules = await bridge.alertRules(
        input.projectId,
        buildAlertRuleSearchInput({
          search: intent.search ?? null,
          severity: intent.severity ?? null,
          signal: intent.signal ?? null,
          enabled: intent.enabled ?? null,
          sort: stringArg(args.sort),
        }),
        authContext,
      );
      return {
        text: formatAlertListToolAnswer(rules, project),
        artifacts: [alertRuleTableArtifact(rules)],
      };
    }
    case "alerts.history": {
      if (!bridge.alertHistory) {
        return {
          text: "I could not query CloudGrid alert history because the alert history tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const intent: AlertHistoryToolIntent = {
        ruleId: stringArg(args.ruleId ?? args.id),
      };
      const historyInput = buildAlertHistoryInput({
        ruleId: intent.ruleId ?? null,
        first: boundedIntegerArg(args.first ?? args.limit, 50, 1, 200),
        after: stringArg(args.after ?? args.cursor),
      });
      const result = await bridge.alertHistory(
        input.projectId,
        historyInput.ruleId,
        historyInput.first,
        historyInput.after,
        authContext,
      );
      return {
        text: formatAlertHistoryToolAnswer(result, project),
        artifacts: [alertHistoryTableArtifact(result)],
      };
    }
    case "aiEval.searchAgentRuns": {
      if (!bridge.agentRuns) {
        return {
          text: "I could not query CloudGrid AI Eval agent runs because the AI Eval run tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const range = rangeFromToolArgs(args, input.timezone, 24 * 7);
      const intent: AgentRunToolIntent = {
        range,
        limit: boundedIntegerArg(args.limit, AI_EVAL_SEARCH_DEFAULT_LIMIT, 1, 200),
        status: agentRunStatusArg(args.status),
        agentName: stringArg(args.agentName ?? args.agent),
        query: stringArg(args.query ?? args.search),
      };
      const result = await bridge.agentRuns(
        buildAgentRunSearchInput({
          from: intent.range.from.toISOString(),
          to: intent.range.to.toISOString(),
          status: intent.status ?? null,
          agentName: intent.agentName ?? null,
          query: intent.query ?? null,
          limit: intent.limit,
          cursor: stringArg(args.cursor),
          evaluationRunId: stringArg(args.evaluationRunId ?? args.experimentRunId),
        }),
        authContext,
      );
      return {
        text: formatAgentRunToolAnswer(result, intent, project),
        artifacts: [agentRunTableArtifact(result)],
      };
    }
    case "aiEval.searchDatasets": {
      if (!bridge.datasets) {
        return {
          text: "I could not query CloudGrid AI Eval datasets because the dataset tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const result = await bridge.datasets(
        buildDatasetSearchInput({
          query: stringArg(args.query ?? args.search),
          tag: stringArg(args.tag),
          split: stringArg(args.split),
          curationStatus: stringArg(args.curationStatus ?? args.reviewStatus),
          limit: boundedIntegerArg(args.limit, AI_EVAL_SEARCH_DEFAULT_LIMIT, 1, 200),
          cursor: stringArg(args.cursor),
        }),
        authContext,
      );
      return {
        text: formatDatasetToolAnswer(result, project),
        artifacts: [datasetTableArtifact(result)],
      };
    }
    case "aiEval.searchScorers": {
      if (!bridge.scorers) {
        return {
          text: "I could not query CloudGrid AI Eval scorers because the scorer tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const result = await bridge.scorers(
        buildScorerSearchInput({
          query: stringArg(args.query ?? args.search),
          kind: stringArg(args.kind),
          limit: boundedIntegerArg(args.limit, AI_EVAL_SEARCH_DEFAULT_LIMIT, 1, 200),
          cursor: stringArg(args.cursor),
        }),
        authContext,
      );
      return {
        text: formatScorerToolAnswer(result, project),
        artifacts: [scorerTableArtifact(result)],
      };
    }
    case "aiEval.searchExperiments": {
      if (!bridge.experiments) {
        return {
          text: "I could not query CloudGrid AI Eval experiments because the experiment tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const result = await bridge.experiments(
        buildExperimentSearchInput({
          query: stringArg(args.query ?? args.search),
          status: stringArg(args.status),
          split: stringArg(args.split),
          datasetId: stringArg(args.datasetId),
          baselineRunId: stringArg(args.baselineRunId),
          limit: boundedIntegerArg(args.limit, AI_EVAL_SEARCH_DEFAULT_LIMIT, 1, 200),
          cursor: stringArg(args.cursor),
        }),
        authContext,
      );
      return {
        text: formatExperimentToolAnswer(result, project),
        artifacts: [experimentTableArtifact(result)],
      };
    }
    case "aiEval.searchEvalResults": {
      if (!bridge.evalResults) {
        return {
          text: "I could not query CloudGrid AI Eval results because the eval result tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const result = await bridge.evalResults(
        {
          metricId: stringArg(args.metricId ?? args.scorerId),
          evaluationRunId: stringArg(args.evaluationRunId ?? args.experimentRunId),
          limit: boundedIntegerArg(args.limit, AI_EVAL_SEARCH_DEFAULT_LIMIT, 1, 200),
          cursor: stringArg(args.cursor),
        },
        authContext,
      );
      return {
        text: formatEvalResultToolAnswer(result, project),
        artifacts: [evalResultTableArtifact(result)],
      };
    }
    case "aiEval.qualityOverview": {
      if (!bridge.aiQualityOverview) {
        return {
          text: "I could not query CloudGrid AI Eval production quality because the quality overview tool is not available in this run.",
        };
      }
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      const range = rangeFromToolArgs(args, input.timezone, 24 * 7);
      const intent: AiQualityToolIntent = {
        range,
        service: stringArg(args.service),
        agentName: stringArg(args.agentName ?? args.agent),
        limit: boundedIntegerArg(args.limit, AI_EVAL_SEARCH_DEFAULT_LIMIT, 1, 200),
      };
      const result = await bridge.aiQualityOverview(
        buildAiQualityOverviewInput({
          projectId: input.projectId,
          from: intent.range.from.toISOString(),
          to: intent.range.to.toISOString(),
          service: intent.service ?? null,
          agentName: intent.agentName ?? null,
          environment: stringArg(args.environment),
          route: stringArg(args.route),
          toolName: stringArg(args.toolName),
          model: stringArg(args.model),
          policyId: stringArg(args.policyId),
          scorerId: stringArg(args.scorerId),
          limit: intent.limit,
        }),
        authContext,
      );
      return {
        text: formatAiQualityToolAnswer(result, intent, project),
        artifacts: [aiQualityArtifact(result)],
      };
    }
    case "project.get": {
      const project = await aiChatSelectedProjectContext(bridge, authContext, input.projectId);
      return {
        text: `Current CloudGrid project: ${project.label}.`,
        artifacts: [
          tableArtifact("Current project", "Current project table", [
            { id: project.id, label: project.label },
          ]),
        ],
      };
    }
    default:
      throw new AiChatStreamProblem(
        createProblemDetails({
          id: "ERR-AIC-001",
          detail: `AI Chat tool is not available: ${name}`,
        }),
      );
  }
}

function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanArg(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "enabled" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "disabled" || normalized === "no") {
      return false;
    }
  }
  return null;
}

function alertSeverityArg(value: unknown): AlertSeverity | null {
  const normalized = stringArg(value)?.toUpperCase();
  return normalized === "INFO" ||
    normalized === "WARNING" ||
    normalized === "ERROR" ||
    normalized === "CRITICAL"
    ? normalized
    : null;
}

function alertSignalArg(value: unknown): AlertSignal | null {
  const normalized = stringArg(value)?.toUpperCase();
  return normalized === "METRIC" || normalized === "LOG" || normalized === "TRACE"
    ? normalized
    : null;
}

function agentRunStatusArg(value: unknown): AgentRunStatus | null {
  const normalized = stringArg(value)?.toLowerCase();
  return normalized === "ok" ||
    normalized === "error" ||
    normalized === "unset" ||
    normalized === "cancelled"
    ? normalized
    : null;
}

function requiredStringArg(value: unknown, field: string): string {
  const parsed = stringArg(value);
  if (!parsed) {
    throw new AiChatStreamProblem(
      createProblemDetails({
        id: "ERR-001",
        detail: `AI Chat tool input is missing required field: ${field}`,
      }),
    );
  }
  return parsed;
}

function boundedIntegerArg(value: unknown, fallback: number, min: number, max: number): number {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function metricAggregationArg(value: unknown): MetricAggregation | null {
  const parsed = stringArg(value);
  if (
    parsed === "avg" ||
    parsed === "sum" ||
    parsed === "min" ||
    parsed === "max" ||
    parsed === "count" ||
    parsed === "rate" ||
    parsed === "p50" ||
    parsed === "p90" ||
    parsed === "p95" ||
    parsed === "p99"
  ) {
    return parsed;
  }
  return null;
}

function rangeFromToolArgs(
  args: Record<string, unknown>,
  timezone: string | undefined,
  fallbackHours: number,
): TraceToolRange & { kind: "today" | "recent" } {
  const from = stringArg(args.from);
  const to = stringArg(args.to);
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isFinite(fromDate.getTime()) && Number.isFinite(toDate.getTime())) {
      const fallbackLabel =
        fallbackHours === 24
          ? "last 24 hours"
          : `last ${fallbackHours} hour${fallbackHours === 1 ? "" : "s"}`;
      return {
        from: fromDate,
        to: toDate,
        label: `${fallbackLabel} (${timezone ?? "UTC"})`,
        kind: "recent",
      };
    }
  }
  const window = stringArg(args.window ?? args.timeWindow ?? args.range);
  if (window === "today") {
    return { ...todayRange(timezone), kind: "today" };
  }
  const hours = boundedIntegerArg(args.hours ?? args.windowHours, fallbackHours, 1, 24 * 30);
  return { ...lastHoursRange(timezone, hours), kind: "recent" };
}

function rangeHours(range: TraceToolRange): number | null {
  const diff = range.to.getTime() - range.from.getTime();
  if (!Number.isFinite(diff) || diff <= 0) {
    return null;
  }
  return Math.max(1, Math.round(diff / 3_600_000));
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

function formatAgentRunToolAnswer(
  result: AgentRunSearchResult,
  intent: AgentRunToolIntent,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    const qualifier = intent.status === "error" ? "failing " : "";
    return `No ${qualifier}AI Eval agent runs were returned for ${intent.range.label} in project ${project.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`;
  }

  const noun = result.items.length === 1 ? "AI Eval agent run" : "AI Eval agent runs";
  const nextCursor = result.nextCursor
    ? "\n\nMore AI Eval agent runs are available; open AI Eval with the same filters to continue paging."
    : "";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for ${intent.range.label} in project ${project.label} between ${intent.range.from.toISOString()} and ${intent.range.to.toISOString()}.`,
    "",
    "| Run | Agent | Status | Started | Duration | Tokens | Cost |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ...result.items.slice(0, intent.limit).map(agentRunRow),
    nextCursor,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatDatasetToolAnswer(
  result: DatasetSearchResult,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No AI Eval datasets were returned for project ${project.label}.`;
  }
  const noun = result.items.length === 1 ? "AI Eval dataset" : "AI Eval datasets";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for project ${project.label}.`,
    "",
    "| Dataset | Version | Items | Reviewed | Health | Tags |",
    "| --- | ---: | ---: | ---: | --- | --- |",
    ...result.items.map(datasetRow),
  ].join("\n");
}

function formatScorerToolAnswer(
  result: ScorerSearchResult,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No AI Eval scorers were returned for project ${project.label}.`;
  }
  const noun = result.items.length === 1 ? "AI Eval scorer" : "AI Eval scorers";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for project ${project.label}.`,
    "",
    "| Scorer | Kind | Version |",
    "| --- | --- | ---: |",
    ...result.items.map(scorerRow),
  ].join("\n");
}

function formatExperimentToolAnswer(
  result: ExperimentSearchResult,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No AI Eval experiments were returned for project ${project.label}.`;
  }
  const noun = result.items.length === 1 ? "AI Eval experiment" : "AI Eval experiments";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for project ${project.label}.`,
    "",
    "| Experiment | Dataset | Scorers | Runs | Tags |",
    "| --- | --- | ---: | ---: | --- |",
    ...result.items.map(experimentRow),
  ].join("\n");
}

function formatEvalResultToolAnswer(
  result: EvalResultSearchResult,
  project: { id: string; label: string },
) {
  if (!result.items.length) {
    return `No AI Eval results were returned for project ${project.label}.`;
  }
  const noun = result.items.length === 1 ? "AI Eval result" : "AI Eval results";
  const nextCursor = result.nextCursor
    ? "\n\nMore AI Eval results are available; open AI Eval with the same filters to continue paging."
    : "";
  return [
    `CloudGrid returned ${result.items.length} ${noun} for project ${project.label}.`,
    "",
    "| Result | Scorer | Target | Score | Passed | Produced |",
    "| --- | --- | --- | ---: | --- | --- |",
    ...result.items.map(evalResultRow),
    nextCursor,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatAiQualityToolAnswer(
  result: AiQualityOverview,
  intent: AiQualityToolIntent,
  project: { id: string; label: string },
) {
  if (!result.segments.length) {
    return `No AI Eval production quality segments were returned for ${intent.range.label} in project ${project.label}.`;
  }
  return [
    `CloudGrid returned ${result.segments.length} AI Eval Production quality segment${result.segments.length === 1 ? "" : "s"} for ${intent.range.label} in project ${project.label}.`,
    "",
    "| Segment | Runs | Scored | Pass rate | Mean score | p95 latency | Cost | Regressions |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...result.segments.map(qualitySegmentRow),
  ].join("\n");
}

function datasetTableArtifact(result: DatasetSearchResult): PendingAiChatArtifact {
  return tableArtifact(
    "AI Eval datasets",
    "AI Eval datasets table",
    result.items.map((dataset) => ({
      dataset: dataset.name,
      version: dataset.currentVersion.version,
      items: dataset.itemCount,
      ready: dataset.readyItemCount,
      health: dataset.health.status,
      tags: dataset.tags.join(", "),
    })),
  );
}

function scorerTableArtifact(result: ScorerSearchResult): PendingAiChatArtifact {
  return tableArtifact(
    "AI Eval scorers",
    "AI Eval scorers table",
    result.items.map((scorer) => ({
      scorer: scorer.name,
      kind: scorer.kind,
      version: scorer.version,
    })),
  );
}

function experimentTableArtifact(result: ExperimentSearchResult): PendingAiChatArtifact {
  return tableArtifact(
    "AI Eval experiments",
    "AI Eval experiments table",
    result.items.map((experiment) => ({
      experiment: experiment.name,
      dataset: `${experiment.datasetId}@${experiment.datasetVersion}`,
      scorers: experiment.scorerIds.length,
      runs: experiment.runs?.items.length ?? 0,
      tags: experiment.tags.join(", "),
    })),
  );
}

function evalResultTableArtifact(result: EvalResultSearchResult): PendingAiChatArtifact {
  return tableArtifact(
    "AI Eval results",
    "AI Eval results table",
    result.items.map((item) => ({
      result: item.id,
      scorerId: item.scorerId,
      scorerVersion: item.scorerVersion,
      target: `${item.targetKind}:${item.targetId}`,
      score: item.score,
      passed: item.passed,
      producedAt: item.producedAt,
    })),
  );
}

function aiQualityArtifact(result: AiQualityOverview): PendingAiChatArtifact {
  return {
    renderer: "status_summary",
    label: "AI Eval production quality",
    renderSpec: {
      renderer: "status_summary",
      title: "AI Eval production quality",
      ariaLabel: "AI Eval production quality summary",
      data: {
        values: {
          projectId: result.projectId,
          segments: result.segments.length,
          warnings: result.warnings.length,
        },
        rows: result.segments.map((segment) => ({
          segment: segment.label,
          runs: segment.runCount,
          scored: segment.scoredRunCount,
          passRate: segment.passRate,
          meanScore: segment.meanScore,
          p95LatencyMs: segment.p95LatencyMs,
          costUsd: segment.costUsd,
          regressions: segment.regressionCount,
        })),
      },
    },
  };
}

function tableArtifact(
  title: string,
  ariaLabel: string,
  rows: Array<Record<string, unknown>>,
): PendingAiChatArtifact {
  return {
    renderer: "table",
    label: title,
    renderSpec: {
      renderer: "table",
      title,
      ariaLabel,
      data: { rows },
    },
  };
}

function agentRunTableArtifact(result: AgentRunSearchResult): PendingAiChatArtifact {
  return tableArtifact(
    "AI Eval agent runs",
    "AI Eval agent runs table",
    result.items.map((run) => ({
      run: run.id,
      trace: `/traces/${run.traceId}?spanId=${run.rootSpanId}`,
      agent: run.agent.name ?? "-",
      status: run.status,
      startedAt: run.startedAt,
      durationMs: run.durationMs ?? null,
      tokens: run.tokenTotals?.total ?? null,
      cost: run.costEstimate ? `${run.costEstimate.amount} ${run.costEstimate.currency}` : null,
    })),
  );
}

function alertHistoryTableArtifact(result: AlertEventConnection): PendingAiChatArtifact {
  return tableArtifact(
    "Alert history",
    "Alert history table",
    result.items.map((event) => ({
      startedAt: event.startedAt,
      state: event.state,
      severity: event.severity,
      summary: event.summary,
      evidence: alertEvidenceLink(event),
      ruleId: event.ruleId,
    })),
  );
}

function alertRuleTableArtifact(rules: AlertRule[]): PendingAiChatArtifact {
  return tableArtifact(
    "Alert rules",
    "Alert rules table",
    rules.map((rule) => ({
      rule: rule.name,
      enabled: rule.enabled,
      severity: rule.severity,
      signal: alertSignalFromKind(rule.kind),
      kind: rule.kind,
      updatedAt: rule.updatedAt,
    })),
  );
}

function dashboardTableArtifact(result: DashboardListResult): PendingAiChatArtifact {
  return tableArtifact(
    "Dashboards",
    "Dashboards table",
    result.items.map((dashboard) => ({
      dashboard: dashboard.name,
      link: `/dashboards?dashboard=${dashboard.id}`,
      visibility: dashboard.visibility,
      pinned: result.pinnedDashboardIds.includes(dashboard.id) || dashboard.pinned,
      widgets: dashboard.widgets.map((widget) => widget.kind).join(", "),
      tags: dashboard.tags.join(", "),
    })),
  );
}

function traceSearchTableArtifact(result: TraceSearchResult): PendingAiChatArtifact {
  return tableArtifact(
    "Traces",
    "Trace search results table",
    result.items.map((trace) => ({
      trace: trace.id,
      link: `/traces/${trace.id}`,
      service: trace.serviceName ?? "-",
      operation: trace.operationName ?? "-",
      status: trace.status ?? "-",
      startedAt: trace.startedAt,
      durationMs: trace.durationMs ?? null,
      spans: trace.spanCount,
      errorSpans: trace.errorSpanCount,
    })),
  );
}

function traceWaterfallArtifact(result: TraceDetail): PendingAiChatArtifact {
  return {
    renderer: "trace_waterfall",
    label: `Trace ${result.trace.id}`,
    renderSpec: {
      renderer: "trace_waterfall",
      title: `Trace ${result.trace.id}`,
      ariaLabel: `Trace ${result.trace.id} waterfall`,
      data: {
        trace: result.trace,
        spans: result.spans,
        structure: result.structure,
        selectedSpan: result.selectedSpan ?? null,
        spanMatches: result.spanMatches,
        logs: result.logs,
        relatedLogs: result.relatedLogs,
        warnings: result.warnings,
      },
    },
  };
}

function facetTableArtifact(result: TelemetryFacetResult): PendingAiChatArtifact {
  return tableArtifact("Telemetry facets", "Telemetry facets table", [
    ...facetRows("service", result.services),
    ...facetRows("operation", result.operations),
    ...facetRows("spanName", result.spanNames),
    ...facetRows("severity", result.severities),
    ...facetRows("attributeKey", result.attributeKeys),
  ]);
}

function facetRows(kind: string, values: TelemetryFacetResult["services"]) {
  return values.map((facet) => ({
    kind,
    value: facet.value,
    count: facet.count,
  }));
}

function metricTimeseriesArtifact(
  result: MetricSeriesResult,
  requestedMetricName: string,
): PendingAiChatArtifact {
  return {
    renderer: "metric_timeseries",
    label: result.metric.name || requestedMetricName,
    renderSpec: {
      renderer: "metric_timeseries",
      title: result.metric.name || requestedMetricName,
      ariaLabel: `${result.metric.name || requestedMetricName} metric time series`,
      data: { result },
    },
  };
}

function logListArtifact(result: LogSearchResult): PendingAiChatArtifact {
  return {
    renderer: "log_list",
    label: "Logs",
    renderSpec: {
      renderer: "log_list",
      title: "Logs",
      ariaLabel: "Log results",
      data: {
        items: result.items,
        nextCursor: result.nextCursor ?? null,
      },
    },
  };
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

function agentRunRow(run: AgentRunSearchResult["items"][number]) {
  const trace = `[${run.id}](/traces/${encodeURIComponent(run.traceId)}?spanId=${encodeURIComponent(run.rootSpanId)})`;
  const tokens = run.tokenTotals?.total ?? "-";
  const cost = run.costEstimate
    ? `${run.costEstimate.amount.toFixed(4)} ${run.costEstimate.currency}`
    : "-";
  return [
    markdownTableCell(trace),
    markdownTableCell(run.agent.name ?? "-"),
    markdownTableCell(run.status),
    markdownTableCell(run.startedAt),
    typeof run.durationMs === "number" ? `${run.durationMs.toFixed(1)} ms` : "-",
    String(tokens),
    markdownTableCell(cost),
  ].join(" | ");
}

function datasetRow(dataset: DatasetSearchResult["items"][number]) {
  return [
    markdownTableCell(dataset.name),
    String(dataset.currentVersion.version),
    String(dataset.itemCount),
    String(dataset.readyItemCount),
    markdownTableCell(dataset.health.status),
    markdownTableCell(dataset.tags.join(", ") || "-"),
  ].join(" | ");
}

function scorerRow(scorer: ScorerSearchResult["items"][number]) {
  return [
    markdownTableCell(scorer.name),
    markdownTableCell(scorer.kind),
    String(scorer.version),
  ].join(" | ");
}

function experimentRow(experiment: ExperimentSearchResult["items"][number]) {
  return [
    markdownTableCell(experiment.name),
    markdownTableCell(`${experiment.datasetId}@${experiment.datasetVersion}`),
    String(experiment.scorerIds.length),
    String(experiment.runs?.items.length ?? 0),
    markdownTableCell(experiment.tags.join(", ") || "-"),
  ].join(" | ");
}

function evalResultRow(result: EvalResultSearchResult["items"][number]) {
  return [
    markdownTableCell(result.id),
    markdownTableCell(`${result.scorerId}@${result.scorerVersion}`),
    markdownTableCell(`${result.targetKind}:${result.targetId}`),
    String(result.score),
    result.passed ? "yes" : "no",
    markdownTableCell(result.producedAt),
  ].join(" | ");
}

function qualitySegmentRow(segment: AiQualityOverview["segments"][number]) {
  return [
    markdownTableCell(segment.label),
    String(segment.runCount),
    String(segment.scoredRunCount),
    formatRatio(segment.passRate),
    formatRatio(segment.meanScore),
    typeof segment.p95LatencyMs === "number" ? `${segment.p95LatencyMs.toFixed(1)} ms` : "-",
    typeof segment.costUsd === "number" ? segment.costUsd.toFixed(4) : "-",
    String(segment.regressionCount),
  ].join(" | ");
}

function formatRatio(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(3) : "-";
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
  scope: AiChatCredentialScope,
) {
  if (scope.kind === "managed") {
    if (!bridge.resolveAiProviderSecret) {
      return null;
    }
    const credential = await bridge.resolveAiProviderSecret(ref, authContext);
    if (credential.credentialRef !== ref) {
      return null;
    }
    return { ref: credential.credentialRef, value: credential.value };
  }
  if (scope.kind === "env") {
    if (!scope.name || !/^[A-Z0-9_]+$/.test(scope.name)) {
      return null;
    }
    const value = process.env[scope.name];
    if (!value) {
      return null;
    }
    return { ref, credentialRef: ref, value };
  }
  return null;
}

type AiChatCredentialScope =
  | { kind: "managed"; scope: "company" | "project"; ownerId: string; providerProfileId: string }
  | { kind: "env"; name: string }
  | { kind: "external"; provider: string; path: string }
  | { kind: "invalid" };

function providerCredentialScope(ref: string): AiChatCredentialScope {
  const trimmed = ref.trim();
  if (trimmed.startsWith("managed:")) {
    const parts = trimmed.split("/");
    if (parts.length !== 3) {
      return { kind: "invalid" };
    }
    const scope = parts[0]?.slice("managed:".length);
    const ownerId = parts[1] ?? "";
    const providerProfileId = parts[2] ?? "";
    if ((scope !== "company" && scope !== "project") || !ownerId || !providerProfileId) {
      return { kind: "invalid" };
    }
    return { kind: "managed", scope, ownerId, providerProfileId };
  }
  if (trimmed.startsWith("env:")) {
    return { kind: "env", name: trimmed.slice("env:".length) };
  }
  if (trimmed.startsWith("external:")) {
    const rest = trimmed.slice("external:".length);
    const separator = rest.indexOf("/");
    if (separator <= 0 || separator === rest.length - 1) {
      return { kind: "invalid" };
    }
    return {
      kind: "external",
      provider: rest.slice(0, separator),
      path: rest.slice(separator + 1),
    };
  }
  return { kind: "invalid" };
}

function credentialScopeMatchesConversation(
  scope: AiChatCredentialScope,
  conversation: AiChatConversation,
) {
  if (scope.kind === "managed") {
    if (scope.scope === "company") {
      return scope.ownerId === conversation.companyId;
    }
    return scope.ownerId === conversation.projectId;
  }
  return scope.kind === "env" || scope.kind === "external";
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

function artifactIdFor(runId: string, toolIndex: number, artifactIndex: number) {
  return `art_${runId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${toolIndex}_${artifactIndex}`;
}

function assistantMessageIdFor(runId: string) {
  return `msg_${runId.replace(/[^a-zA-Z0-9_-]/g, "_")}_assistant`;
}

function safeToolStatusPayload(input: {
  toolCallId: string;
  toolName: string;
  status: "running" | "completed" | "failed";
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
  const collapsed: AiChatMessagePart[] = [];
  let textBuffer = "";
  for (const part of parts) {
    if (part.type === "text") {
      textBuffer += part.text ?? "";
      continue;
    }
    const text = textBuffer.trim();
    if (text) {
      collapsed.push({ type: "text", text });
    }
    textBuffer = "";
    collapsed.push(part);
  }
  const text = textBuffer.trim();
  if (text) {
    collapsed.push({ type: "text", text });
  }
  return collapsed;
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

function providerFailure(message?: string) {
  return new AiChatStreamProblem(
    createProblemDetails({
      id: "ERR-AIP-001",
      detail: safeProviderFailureDetail(message),
    }),
  );
}

function safeProviderFailureDetail(message?: string) {
  const normalized = message?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "The configured AI provider could not complete this request";
  }
  if (
    normalized.includes("unauthorized") ||
    normalized.includes("authentication") ||
    normalized.includes("invalid api key") ||
    normalized.includes("incorrect api key") ||
    normalized.includes("401")
  ) {
    return "AI provider rejected the configured credential";
  }
  if (
    normalized.includes("forbidden") ||
    normalized.includes("permission") ||
    normalized.includes("403")
  ) {
    return "AI provider refused access for the configured credential";
  }
  if (
    normalized.includes("model") &&
    (normalized.includes("not found") ||
      normalized.includes("does not exist") ||
      normalized.includes("not available") ||
      normalized.includes("unsupported"))
  ) {
    return "AI provider model is unavailable or not accessible";
  }
  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return "AI provider rate limit was exceeded";
  }
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("network") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound")
  ) {
    return "AI provider request could not reach the configured endpoint";
  }
  if (
    normalized.includes("baseurl") ||
    normalized.includes("base url") ||
    normalized.includes("endpoint")
  ) {
    return "AI provider endpoint is invalid or unavailable";
  }
  return "The configured AI provider could not complete this request";
}

function renderSpecProblem(detail: string) {
  return new AiChatStreamProblem(createProblemDetails({ id: "ERR-AIC-005", detail }));
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
