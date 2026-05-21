import { z } from "zod";
import { CloudGridGraphQLError, readCloudGridProblem } from "./graphql-transport";

export interface AiChatStreamOptions {
  signal?: AbortSignal;
}

export interface AiChatStreamRequest {
  conversationId: string;
  projectId: string;
  userMessageClientId: string;
  idempotencyKey: string;
  parts: AiChatStreamTextPart[];
  skipUserMessageAppend?: boolean;
  timezone?: string;
}

export interface AiChatStreamTextPart {
  type: "text";
  text: string;
}

export interface AiChatStreamEvent {
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

const aiProviderProfileFields = `
  id
  ownerScope
  ownerId
  label
  providerKind
  baseUrl
  credentialRef
  models
  parameters
  timeoutMs
  maxConcurrency
  disabledAt
`;

const aiModelAliasFields = `
  id
  name
  providerProfileId
  model
  purpose
  parameters {
    temperature
    topP
    maxOutputTokens
    reasoningEffort
    extras
  }
`;

const aiProviderEffectiveFields = `
  warnings
  missingProviderProfiles
  disabledProviderProfiles
  missingChatProvider
`;

const aiChatActionProposalFields = `
  id
  runId
  conversationId
  title
  description
  risk
  status
  operation
  preview
  result
  requestedAt
  decidedAt
  decidedByUserId
  version
`;

const aiChatConversationFields = `
  id
  companyId
  projectId
  userId
  title
  status
  messages {
    id
    conversationId
    role
    parts {
      type
      text
      json
      artifactId
      actionId
    }
    createdAt
  }
  latestRun {
    id
    conversationId
    status
    providerProfileId
    model
    artifacts {
      id
      runId
      kind
      label
      mimeType
      content
      createdAt
    }
    actionProposals {
      ${aiChatActionProposalFields}
    }
    startedAt
    completedAt
    error
  }
  compaction {
    id
    conversationId
    summary
    coveredMessageIds
    tokenCount
    createdAt
  }
  createdAt
  updatedAt
  lastMessageAt
  version
`;

export const companyAiProviderSettingsOperation = `
  query CompanyAiProviderSettings($companyId: ID!) {
    companyAiProviderSettings(companyId: $companyId) {
      companyId
      providerProfile {
        ${aiProviderProfileFields}
      }
      chatModelAlias {
        ${aiModelAliasFields}
      }
      effective {
        ${aiProviderEffectiveFields}
      }
      version
      updatedAt
      updatedByUserId
    }
  }
`;

export const updateCompanyAiProviderSettingsOperation = `
  mutation UpdateCompanyAiProviderSettings($input: UpdateCompanyAiProviderSettingsInput!) {
    updateCompanyAiProviderSettings(input: $input) {
      companyId
      providerProfile {
        ${aiProviderProfileFields}
      }
      chatModelAlias {
        ${aiModelAliasFields}
      }
      effective {
        ${aiProviderEffectiveFields}
      }
      version
      updatedAt
      updatedByUserId
    }
  }
`;

export const aiChatHistoryOperation = `
  query AiChatHistory($input: AiChatHistoryInput!) {
    aiChatHistory(input: $input) {
      companyId
      userId
      projectGroups {
        projectId
        projectName
        conversations {
          ${aiChatConversationFields}
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const aiChatConversationOperation = `
  query AiChatConversation($id: ID!) {
    aiChatConversation(id: $id) {
      ${aiChatConversationFields}
    }
  }
`;

export const createAiChatConversationOperation = `
  mutation CreateAiChatConversation($input: CreateAiChatConversationInput!) {
    createAiChatConversation(input: $input) {
      ${aiChatConversationFields}
    }
  }
`;

export const deleteAiChatConversationOperation = `
  mutation DeleteAiChatConversation($id: ID!) {
    deleteAiChatConversation(id: $id)
  }
`;

export const approveAiChatActionOperation = `
  mutation ApproveAiChatAction($input: ApproveAiChatActionInput!) {
    approveAiChatAction(input: $input) {
      ${aiChatActionProposalFields}
    }
  }
`;

const aiChatStreamEventSchema = z.object({
  type: z.enum([
    "run.started",
    "message.created",
    "text.delta",
    "tool.started",
    "tool.completed",
    "artifact.created",
    "action.proposed",
    "compaction.started",
    "compaction.saved",
    "run.completed",
    "run.failed",
    "heartbeat",
  ]),
  conversationId: z.string(),
  runId: z.string(),
  sequence: z.number().int().optional(),
  createdAt: z.string(),
  payload: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<AiChatStreamEvent>;

export async function* streamAiChatRun(
  endpoint: string,
  input: AiChatStreamRequest,
  options: AiChatStreamOptions = {},
): AsyncIterable<AiChatStreamEvent> {
  const init: RequestInit = {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  };
  if (options.signal) {
    init.signal = options.signal;
  }
  const response = await fetch(aiChatStreamEndpoint(endpoint), init);

  if (!response.ok) {
    const problem = await readCloudGridProblem(response);
    throw new CloudGridGraphQLError(
      problem?.detail ?? `AI Chat stream failed with HTTP ${response.status}`,
      problem,
    );
  }
  if (!response.body) {
    throw new Error("AI Chat stream response did not include a body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = parseSseEvent(part);
      if (event) {
        yield event;
      }
    }
  }
  buffer += decoder.decode();
  const event = parseSseEvent(buffer);
  if (event) {
    yield event;
  }
}

function aiChatStreamEndpoint(endpoint: string) {
  const base =
    typeof window === "undefined"
      ? "http://localhost"
      : `${window.location.protocol}//${window.location.host}`;
  const url = new URL(endpoint, base);
  url.pathname = "/api/ai-chat/stream";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function parseSseEvent(chunk: string): AiChatStreamEvent | null {
  const data = chunk
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n")
    .trim();
  if (!data) {
    return null;
  }
  const parsed = aiChatStreamEventSchema.safeParse(JSON.parse(data));
  if (!parsed.success) {
    throw new Error("AI Chat stream event was invalid");
  }
  return parsed.data;
}
