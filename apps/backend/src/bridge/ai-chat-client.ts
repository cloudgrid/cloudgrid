import type {
  AiChatActionProposal,
  AiChatMessagePart,
  AiChatRun,
  AiChatRunStatus,
} from "@cloudgrid/ui-contracts";

export type { AiChatRun };

export interface AiChatAppendMessageInput {
  conversationId: string;
  runId: string;
  role: "user" | "assistant" | "tool" | "system";
  parts: AiChatMessagePart[];
}

export interface AiChatCreateRunInput {
  conversationId: string;
  projectId: string;
  userId: string;
  userMessageClientId: string;
  idempotencyKey: string;
  providerKind: string;
  providerProfileId: string;
  model: string;
  traceId?: string;
}

export interface AiChatUpdateRunInput {
  runId: string;
  status: AiChatRunStatus;
  toolCallCount?: number;
  sandboxScriptCount?: number;
  artifactCount?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  estimatedCostUsd?: number;
  error?: string;
}

export interface AiChatFinalizeRunInput extends AiChatUpdateRunInput {}

export interface AiChatProposeActionInput {
  conversationId: string;
  runId: string;
  title: string;
  risk: string;
  operation: string;
  preview: Record<string, unknown>;
}

export interface AiChatFinishActionInput {
  actionId: string;
  status: string;
  result?: Record<string, unknown>;
}

export interface AiChatSaveCompactionInput {
  conversationId: string;
  summary: string;
  coveredMessageIds: string[];
  tokenCount: number;
}

export type AiChatActionResult = AiChatActionProposal;
