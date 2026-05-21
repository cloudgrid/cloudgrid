import type { AgentRunSearchInput, AgentRunStatus } from "./index";

export const AI_EVAL_SEARCH_DEFAULT_LIMIT = 50;
export const AI_EVAL_SEARCH_HARD_LIMIT = 200;

const AGENT_RUN_STATUSES = ["ok", "error", "unset", "cancelled"] as const;

/** Optional agent-run query overrides accepted by UI routes and AI tool callers. */
export interface AgentRunSearchDefaultsInput {
  agentId?: string | null;
  agentName?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  experimentRunId?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

/** Builds a bounded `AgentRunSearchInput` with shared AI Eval search defaults. */
export function buildAgentRunSearchInput(
  input: AgentRunSearchDefaultsInput = {},
): AgentRunSearchInput {
  return {
    agentId: stringOrNull(input.agentId),
    agentName: stringOrNull(input.agentName),
    status: agentRunStatusOrNull(input.status),
    from: stringOrNull(input.from),
    to: stringOrNull(input.to),
    experimentRunId: stringOrNull(input.experimentRunId),
    query: stringOrNull(input.query),
    limit: boundedAiEvalSearchLimit(input.limit),
    cursor: stringOrNull(input.cursor),
  };
}

function boundedAiEvalSearchLimit(limit: number | null | undefined) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return AI_EVAL_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(1, Math.trunc(limit)), AI_EVAL_SEARCH_HARD_LIMIT);
}

function agentRunStatusOrNull(value: string | null | undefined): AgentRunStatus | null {
  return AGENT_RUN_STATUSES.includes(value as AgentRunStatus) ? (value as AgentRunStatus) : null;
}

function stringOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
