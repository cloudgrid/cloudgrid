import type {
  AiChatActionProposal,
  AiChatArtifact,
  AiChatConversation,
  AiChatHistory,
  AiChatHistoryInput,
  AiChatMessagePart,
  AiChatProjectGroup,
  ApproveAiChatActionInput,
  CompanyAiProviderSettings,
  JSONValue,
} from "@cloudgrid/ui-contracts";

export const approvedAiChatRenderers = [
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
] as const;

export type ApprovedAiChatRenderer = (typeof approvedAiChatRenderers)[number];

export type SafeAiChatArtifactView =
  | {
      artifact: AiChatArtifact;
      kind: "json_render";
      renderer: ApprovedAiChatRenderer;
      content: Record<string, unknown>;
    }
  | {
      artifact: AiChatArtifact;
      kind: "unsupported";
      reason: "renderer" | "kind" | "shape";
    };

const approvedRendererSet = new Set<string>(approvedAiChatRenderers);

export function aiChatProviderQueryKey(companyId: string) {
  return ["CompanyAiProviderSettings", companyId] as const;
}

export function aiChatHistoryQueryKey(
  input: Pick<AiChatHistoryInput, "companyId" | "projectId"> & { userId?: string | null },
) {
  const userId = input.userId ?? null;
  return [
    "AiChatHistory",
    input.companyId,
    input.projectId ?? null,
    userId,
    false,
    50,
    null,
  ] as const;
}

export function aiChatConversationQueryKey(input: {
  conversationId: string | null;
  projectId: string;
  userId?: string | null;
}) {
  return [
    "AiChatConversation",
    input.projectId,
    input.userId ?? null,
    input.conversationId ?? "",
  ] as const;
}

export function isCompanyAiChatProviderConfigured(
  settings: CompanyAiProviderSettings | null | undefined,
) {
  return Boolean(
    settings?.providerProfile &&
      settings.chatModelAlias &&
      settings.effective.missingChatProvider === false,
  );
}

export function orderedAiChatProjectGroups(
  history: AiChatHistory | null | undefined,
  selectedProjectId: string,
  currentUserId?: string | null,
): AiChatProjectGroup[] {
  return [...(history?.projectGroups ?? [])]
    .filter((group) => group.projectId === selectedProjectId)
    .map((group) => ({
      ...group,
      conversations: [...group.conversations]
        .filter(
          (conversation) =>
            conversation.projectId === selectedProjectId &&
            (!currentUserId || conversation.userId === currentUserId),
        )
        .sort(compareConversationLastMessageDesc),
    }))
    .filter((group) => group.conversations.length > 0)
    .sort((left, right) => {
      if (left.projectId === selectedProjectId) return -1;
      if (right.projectId === selectedProjectId) return 1;
      return left.projectName.localeCompare(right.projectName);
    });
}

export function firstAiChatConversation(
  history: AiChatHistory | null | undefined,
  selectedProjectId: string,
  currentUserId?: string | null,
) {
  return orderedAiChatProjectGroups(history, selectedProjectId, currentUserId).flatMap(
    (group) => group.conversations,
  )[0];
}

export function findAiChatConversation(
  history: AiChatHistory | null | undefined,
  conversationId: string | null,
  selectedProjectId: string,
  currentUserId?: string | null,
) {
  const conversations = orderedAiChatProjectGroups(
    history,
    selectedProjectId,
    currentUserId,
  ).flatMap((group) => group.conversations);
  return conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export function aiChatApprovalInput(
  proposal: Pick<AiChatActionProposal, "id" | "version">,
  approved: boolean,
  reason: string | null = null,
): ApproveAiChatActionInput {
  return {
    actionProposalId: proposal.id,
    idempotencyKey: `approve:${proposal.id}:${approved ? "approve" : "reject"}:${proposal.version}`,
    approved,
    expectedVersion: proposal.version,
    reason,
  };
}

export function safeAiChatArtifactView(artifact: AiChatArtifact): SafeAiChatArtifactView {
  if (artifact.kind !== "json_render") {
    return { artifact, kind: "unsupported", reason: "kind" };
  }

  if (!isJsonObject(artifact.renderSpec)) {
    return { artifact, kind: "unsupported", reason: "shape" };
  }

  const renderer =
    stringValue(artifact.renderSpec.renderer) ??
    stringValue(artifact.renderSpec.rendererKey) ??
    stringValue(artifact.renderSpec.catalogKey) ??
    stringValue(artifact.renderSpec.type);

  if (!renderer || !approvedRendererSet.has(renderer)) {
    return { artifact, kind: "unsupported", reason: "renderer" };
  }

  return {
    artifact,
    kind: "json_render",
    renderer: renderer as ApprovedAiChatRenderer,
    content: artifact.renderSpec,
  };
}

export function aiChatActionById(conversation: AiChatConversation, actionId: string | null) {
  if (!actionId) return null;
  return (
    conversation.latestRun?.actionProposals.find((proposal) => proposal.id === actionId) ?? null
  );
}

export function aiChatArtifactById(conversation: AiChatConversation, artifactId: string | null) {
  if (!artifactId) return null;
  return conversation.latestRun?.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
}

export interface AiChatStreamEventView {
  type:
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
  conversationId: string;
  runId: string;
  sequence?: number | undefined;
  createdAt: string;
  payload: Record<string, unknown>;
}

export interface AiChatStreamViewState {
  actionProposals: AiChatActionProposal[];
  artifacts: AiChatArtifact[];
  assistantMessageId: string | null;
  assistantParts: AiChatMessagePart[];
  conversationId: string;
  error: string | null;
  runId: string | null;
  status: "streaming" | "completed" | "failed";
  userText: string;
}

export function createAiChatStreamViewState(input: {
  conversationId: string;
  userText: string;
}): AiChatStreamViewState {
  return {
    actionProposals: [],
    artifacts: [],
    assistantMessageId: null,
    assistantParts: [],
    conversationId: input.conversationId,
    error: null,
    runId: null,
    status: "streaming",
    userText: input.userText,
  };
}

export function applyAiChatStreamEvent(
  state: AiChatStreamViewState,
  event: AiChatStreamEventView,
): AiChatStreamViewState {
  if (event.conversationId !== state.conversationId) {
    return state;
  }

  const base = { ...state, runId: event.runId || state.runId };
  if (event.type === "run.started") {
    return { ...base, status: "streaming" };
  }
  if (event.type === "message.created" && event.payload.role === "assistant") {
    return {
      ...base,
      assistantMessageId: stringValue(event.payload.messageId) ?? state.assistantMessageId,
    };
  }
  if (event.type === "text.delta") {
    const text = stringValue(event.payload.text);
    if (!text) {
      return base;
    }
    return {
      ...base,
      assistantMessageId: stringValue(event.payload.messageId) ?? state.assistantMessageId,
      assistantParts: appendTextPart(base.assistantParts, text),
    };
  }
  if (event.type === "tool.started" || event.type === "tool.completed") {
    const toolCallId = stringValue(event.payload.toolCallId);
    const toolPart: AiChatMessagePart = {
      type: "tool_status",
      toolCallId,
      toolName: stringValue(event.payload.toolName),
      label: stringValue(event.payload.label),
      status: stringValue(event.payload.status),
      json: safeToolStatusJson(event.payload),
    };
    return {
      ...base,
      assistantParts: upsertToolStatusPart(base.assistantParts, toolPart),
    };
  }
  if (event.type === "artifact.created") {
    const artifactId = stringValue(event.payload.artifactId);
    const renderer = stringValue(event.payload.renderer);
    if (!artifactId || !renderer) {
      return base;
    }
    const renderSpec = isJsonObject(event.payload.renderSpec)
      ? ({ renderer, ...event.payload.renderSpec } as JSONValue)
      : ({ renderer } as JSONValue);
    const artifact: AiChatArtifact = {
      id: artifactId,
      conversationId: event.conversationId,
      runId: event.runId,
      kind: "json_render",
      label: stringValue(event.payload.label) ?? renderer,
      mediaType: "application/json",
      sizeBytes: 0,
      renderSpec,
      fileRef: null,
      createdAt: event.createdAt,
    };
    return {
      ...base,
      artifacts: replaceById(base.artifacts, artifact),
      assistantMessageId: stringValue(event.payload.messageId) ?? state.assistantMessageId,
      assistantParts: [
        ...base.assistantParts,
        {
          type: "artifact",
          artifactId,
          renderer,
          label: artifact.label,
          json: { renderSpec },
        },
      ],
    };
  }
  if (event.type === "action.proposed") {
    const actionProposalId = stringValue(event.payload.actionProposalId);
    if (!actionProposalId) {
      return base;
    }
    return {
      ...base,
      assistantMessageId: stringValue(event.payload.messageId) ?? state.assistantMessageId,
      assistantParts: [
        ...base.assistantParts,
        {
          type: "action_proposal",
          actionProposalId,
          json: {
            actionKind: stringValue(event.payload.actionKind),
            risk: stringValue(event.payload.risk),
          },
        },
      ],
    };
  }
  if (event.type === "compaction.started" || event.type === "compaction.saved") {
    return {
      ...base,
      assistantParts: [
        ...base.assistantParts,
        {
          type: "compaction_summary",
          text:
            event.type === "compaction.saved"
              ? "Conversation memory saved."
              : "Compacting conversation memory.",
          json: safeStatusJson(event.payload, ["status", "compactionId"]),
        },
      ],
    };
  }
  if (event.type === "run.failed") {
    const problem = isJsonObject(event.payload.problem) ? event.payload.problem : null;
    const detail = stringValue(problem?.detail) ?? "AI Chat run failed.";
    const errorPart: AiChatMessagePart = {
      type: "error",
      text: detail,
      ...(problem ? { problem: problem as JSONValue } : {}),
    };
    return {
      ...base,
      error: detail,
      status: "failed",
      assistantParts: [...base.assistantParts, errorPart],
    };
  }
  if (event.type === "run.completed") {
    return { ...base, status: "completed" };
  }
  return base;
}

function compareConversationLastMessageDesc(left: AiChatConversation, right: AiChatConversation) {
  return Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt);
}

function appendTextPart(parts: AiChatMessagePart[], text: string): AiChatMessagePart[] {
  const last = parts.at(-1);
  if (last?.type === "text") {
    return [...parts.slice(0, -1), { ...last, text: `${last.text ?? ""}${text}` }];
  }
  return [...parts, { type: "text", text }];
}

function upsertToolStatusPart(
  parts: AiChatMessagePart[],
  toolPart: AiChatMessagePart,
): AiChatMessagePart[] {
  const index = parts.findIndex(
    (part) => part.type === "tool_status" && part.toolCallId === toolPart.toolCallId,
  );
  if (index === -1) {
    return [...parts, toolPart];
  }
  return [...parts.slice(0, index), { ...parts[index], ...toolPart }, ...parts.slice(index + 1)];
}

function safeToolStatusJson(payload: Record<string, unknown>): JSONValue {
  return safeStatusJson(payload, ["durationMs", "errorCode"]);
}

function safeStatusJson(payload: Record<string, unknown>, keys: string[]): JSONValue {
  const json: Record<string, JSONValue> = {};
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      json[key] = value;
    }
  }
  return json;
}

function replaceById<T extends { id: string }>(items: T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) {
    return [...items, next];
  }
  return [...items.slice(0, index), next, ...items.slice(index + 1)];
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}
