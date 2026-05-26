import type {
  AgentRun,
  AiQualityOverview,
  Dataset,
  DatasetItemRun,
  ExperimentRun,
  ExperimentRunStatus,
  JSONValue,
  ProjectAiSettings,
} from "@cloudgrid/ui-contracts";

export type AgentRunTimelineKind = "llm" | "tool" | "retrieval";

export interface AgentRunTimelineRow {
  id: string;
  kind: AgentRunTimelineKind;
  spanId: string;
  label: string;
  latencyMs: number;
  status?: string | null;
  tokenTotal?: number | null;
  details: string;
}

export interface ExperimentScoreboardRow {
  runId: string;
  status: ExperimentRunStatus;
  passRate?: number | null;
  meanScore?: number | null;
  p50Score?: number | null;
  p95Score?: number | null;
  regression: boolean;
  itemRunCount: number;
}

export interface AiEvalOverviewModel {
  qualityPassRate?: number | null;
  qualityMeanScore?: number | null;
  qualityRegressionCount: number;
  datasetCount: number;
  unhealthyDatasetCount: number;
  annotationBacklog: number;
  activePolicyCount: number;
  budgetSpentTodayUsd?: number | null;
  budgetDailyUsd?: number | null;
  warnings: string[];
}

export function agentRunTimelineRows(run: AgentRun): AgentRunTimelineRow[] {
  return [
    ...run.toolCalls.map((call) => ({
      id: call.id,
      kind: "tool" as const,
      spanId: call.spanId,
      label: call.toolName,
      latencyMs: call.latencyMs,
      status: call.status,
      tokenTotal: null,
      details: call.synthetic ? "synthetic" : call.toolCallId || "tool call",
    })),
    ...run.llmCalls.map((call) => ({
      id: call.id,
      kind: "llm" as const,
      spanId: call.spanId,
      label: call.responseModel ?? call.requestModel ?? call.provider ?? "model call",
      latencyMs: call.latencyMs,
      status: null,
      tokenTotal: call.tokenTotals?.total ?? null,
      details: call.provider ?? "LLM",
    })),
    ...run.retrievalEvents.map((event) => ({
      id: event.id,
      kind: "retrieval" as const,
      spanId: event.spanId,
      label: event.embeddingModel ?? "retrieval",
      latencyMs: event.latencyMs,
      status: null,
      tokenTotal: null,
      details: `${event.documentCount} documents${event.topK ? `, top ${event.topK}` : ""}`,
    })),
  ].toSorted(
    (left, right) => left.spanId.localeCompare(right.spanId) || left.id.localeCompare(right.id),
  );
}

export function aiEvalOverviewModel({
  annotationsOpen,
  datasets,
  quality,
  settings,
}: {
  annotationsOpen: number;
  datasets: Dataset[];
  quality: AiQualityOverview | null | undefined;
  settings: ProjectAiSettings | null | undefined;
}): AiEvalOverviewModel {
  const qualitySummary = summaryObject(quality?.summary);
  return {
    qualityPassRate: numericSummary(qualitySummary, "passRate"),
    qualityMeanScore: numericSummary(qualitySummary, "meanScore"),
    qualityRegressionCount:
      numericSummary(qualitySummary, "regressionCount") ??
      quality?.segments.reduce((total, segment) => total + segment.regressionCount, 0) ??
      0,
    datasetCount: datasets.length,
    unhealthyDatasetCount: datasets.filter((dataset) => dataset.health.status !== "ready").length,
    annotationBacklog: annotationsOpen,
    activePolicyCount: settings?.onlinePolicies.filter((policy) => policy.enabled).length ?? 0,
    budgetSpentTodayUsd: settings?.budget.spentTodayUsd ?? null,
    budgetDailyUsd: settings?.budget.dailyUsd ?? null,
    warnings: [...(quality?.warnings ?? []), ...(settings?.effective.warnings ?? [])],
  };
}

export function experimentScoreboardRows(runs: ExperimentRun[]): ExperimentScoreboardRow[] {
  return runs.map((run) => {
    const primaryScore = run.summary.scoreSummaries[0];
    const regression = run.summary.regressions.some((item) => item.blocker || item.count > 0);
    return {
      runId: run.id,
      status: run.status,
      passRate: primaryScore?.passRate ?? null,
      meanScore: primaryScore?.meanScore ?? null,
      p50Score: primaryScore?.p50 ?? null,
      p95Score: primaryScore?.p95 ?? null,
      regression,
      itemRunCount: run.itemRuns?.items.length ?? 0,
    };
  });
}

export function jsonPreview(value: JSONValue | undefined, maxLength = 96) {
  if (value === undefined) {
    return "";
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function itemRunScoreSummary(itemRun: DatasetItemRun) {
  return itemRun.evalResults.map((result) => ({
    id: result.id,
    scorerId: result.scorerId,
    score: result.score,
    passed: result.passed,
  }));
}

function summaryObject(summary: JSONValue | undefined): Record<string, JSONValue> {
  return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {};
}

function numericSummary(summary: Record<string, JSONValue>, key: string) {
  const value = summary[key];
  return typeof value === "number" ? value : null;
}
