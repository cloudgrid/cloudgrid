import type {
  AgentRunSearchInput,
  AgentRunStatus,
  AiQualityOverviewInput,
  DatasetReviewStatus,
  DatasetSearchInput,
  DatasetSplit,
  ExperimentRunStatus,
  ExperimentSearchInput,
  ScorerKind,
  ScorerSearchInput,
} from "./index";

export const AI_EVAL_SEARCH_DEFAULT_LIMIT = 50;
export const AI_EVAL_SEARCH_HARD_LIMIT = 200;

const AGENT_RUN_STATUSES = ["ok", "error", "unset", "cancelled"] as const;
const DATASET_SPLITS = ["dev", "optimization", "validation", "regression", "holdout"] as const;
const DATASET_REVIEW_STATUSES = ["unreviewed", "reviewed", "rejected"] as const;
const SCORER_KINDS = [
  "deterministic",
  "schema_json",
  "semantic",
  "rag",
  "llm_judge",
  "pairwise_judge",
  "tool_correctness",
  "trajectory",
  "workflow",
  "human",
  "composite",
] as const;
const EXPERIMENT_RUN_STATUSES = [
  "queued",
  "running",
  "pausing",
  "paused",
  "resuming",
  "cancelling",
  "cancelled",
  "failed",
  "completed",
] as const;

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

/** Optional dataset query overrides accepted by UI routes and AI tool callers. */
export interface DatasetSearchDefaultsInput {
  query?: string | null;
  tag?: string | null;
  split?: string | null;
  reviewStatus?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

/** Optional scorer query overrides accepted by UI routes and AI tool callers. */
export interface ScorerSearchDefaultsInput {
  kind?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

/** Optional experiment query overrides accepted by UI routes and AI tool callers. */
export interface ExperimentSearchDefaultsInput {
  datasetId?: string | null;
  status?: string | null;
  split?: string | null;
  baselineRunId?: string | null;
  query?: string | null;
  limit?: number | null;
  cursor?: string | null;
}

/** Optional production quality query overrides accepted by UI routes and AI tool callers. */
export interface AiQualityOverviewDefaultsInput {
  projectId: string;
  from?: string | null;
  to?: string | null;
  agentName?: string | null;
  environment?: string | null;
  service?: string | null;
  route?: string | null;
  toolName?: string | null;
  model?: string | null;
  policyId?: string | null;
  scorerId?: string | null;
  limit?: number | null;
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

/** Builds a bounded `DatasetSearchInput` with shared AI Eval search defaults. */
export function buildDatasetSearchInput(
  input: DatasetSearchDefaultsInput = {},
): DatasetSearchInput {
  return {
    query: stringOrNull(input.query),
    tag: stringOrNull(input.tag),
    split: datasetSplitOrNull(input.split),
    reviewStatus: datasetReviewStatusOrNull(input.reviewStatus),
    limit: boundedAiEvalSearchLimit(input.limit),
    cursor: stringOrNull(input.cursor),
  };
}

/** Builds a bounded `ScorerSearchInput` with shared AI Eval search defaults. */
export function buildScorerSearchInput(input: ScorerSearchDefaultsInput = {}): ScorerSearchInput {
  return {
    kind: scorerKindOrNull(input.kind),
    query: stringOrNull(input.query),
    limit: boundedAiEvalSearchLimit(input.limit),
    cursor: stringOrNull(input.cursor),
  };
}

/** Builds a bounded `ExperimentSearchInput` with shared AI Eval search defaults. */
export function buildExperimentSearchInput(
  input: ExperimentSearchDefaultsInput = {},
): ExperimentSearchInput {
  return {
    datasetId: stringOrNull(input.datasetId),
    status: experimentRunStatusOrNull(input.status),
    split: datasetSplitOrNull(input.split),
    baselineRunId: stringOrNull(input.baselineRunId),
    query: stringOrNull(input.query),
    limit: boundedAiEvalSearchLimit(input.limit),
    cursor: stringOrNull(input.cursor),
  };
}

/** Builds a bounded `AiQualityOverviewInput` with explicit project scope. */
export function buildAiQualityOverviewInput(
  input: AiQualityOverviewDefaultsInput,
): AiQualityOverviewInput {
  return {
    projectId: input.projectId,
    from: stringOrNull(input.from),
    to: stringOrNull(input.to),
    agentName: stringOrNull(input.agentName),
    environment: stringOrNull(input.environment),
    service: stringOrNull(input.service),
    route: stringOrNull(input.route),
    toolName: stringOrNull(input.toolName),
    model: stringOrNull(input.model),
    policyId: stringOrNull(input.policyId),
    scorerId: stringOrNull(input.scorerId),
    limit: boundedAiEvalSearchLimit(input.limit),
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

function datasetSplitOrNull(value: string | null | undefined): DatasetSplit | null {
  return DATASET_SPLITS.includes(value as DatasetSplit) ? (value as DatasetSplit) : null;
}

function datasetReviewStatusOrNull(value: string | null | undefined): DatasetReviewStatus | null {
  return DATASET_REVIEW_STATUSES.includes(value as DatasetReviewStatus)
    ? (value as DatasetReviewStatus)
    : null;
}

function scorerKindOrNull(value: string | null | undefined): ScorerKind | null {
  return SCORER_KINDS.includes(value as ScorerKind) ? (value as ScorerKind) : null;
}

function experimentRunStatusOrNull(value: string | null | undefined): ExperimentRunStatus | null {
  return EXPERIMENT_RUN_STATUSES.includes(value as ExperimentRunStatus)
    ? (value as ExperimentRunStatus)
    : null;
}

function stringOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
