import type {
  AiChatActionProposal,
  AiChatArtifact,
  AiChatConversation,
  AiChatHistory,
  AiChatHistoryInput,
  AiChatProjectGroup,
  ApproveAiChatActionInput,
  CompanyAiProviderSettings,
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

export function aiChatHistoryQueryKey(input: Pick<AiChatHistoryInput, "companyId" | "projectId">) {
  return ["AiChatHistory", input.companyId, input.projectId ?? null, false, 50, null] as const;
}

export function aiChatConversationQueryKey(conversationId: string | null, projectId: string) {
  return ["AiChatConversation", projectId, conversationId ?? ""] as const;
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
): AiChatProjectGroup[] {
  return [...(history?.projectGroups ?? [])]
    .filter((group) => group.projectId === selectedProjectId)
    .map((group) => ({
      ...group,
      conversations: [...group.conversations]
        .filter((conversation) => conversation.projectId === selectedProjectId)
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
) {
  return orderedAiChatProjectGroups(history, selectedProjectId).flatMap(
    (group) => group.conversations,
  )[0];
}

export function findAiChatConversation(
  history: AiChatHistory | null | undefined,
  conversationId: string | null,
  selectedProjectId: string,
) {
  const conversations = orderedAiChatProjectGroups(history, selectedProjectId).flatMap(
    (group) => group.conversations,
  );
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

function compareConversationLastMessageDesc(left: AiChatConversation, right: AiChatConversation) {
  return Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}
