import type {
  AlertRuleSearchInput,
  AlertSummaryInput,
  LogSearchInput,
  MetricNameSearchInput,
  MetricSeriesInput,
  RichMetricSeriesInput,
  TelemetryFacetInput,
  TraceDetailInput,
  TraceSearchInput,
} from "@cloudgrid/ui-contracts";
import type { DashboardListInput } from "./dashboard-contracts";

function normalizeVariables<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

const projectScopedQueryKeyPrefixes = new Set([
  "TraceSearch",
  "TraceDetail",
  "LogSearch",
  "TelemetryFacets",
  "MetricNames",
  "MetricSeries",
  "RichMetricSeries",
  "Dashboards",
  "ProjectAiSettings",
  "AiChatHistory",
  "AiChatConversation",
  "AlertRules",
  "AlertHistory",
  "AlertSummary",
  "AlertSilences",
]);

export function isProjectScopedQueryKey(queryKey: readonly unknown[]) {
  return typeof queryKey[0] === "string" && projectScopedQueryKeyPrefixes.has(queryKey[0]);
}

export const queryKeys = {
  traces: (input: TraceSearchInput) => ["TraceSearch", normalizeVariables({ ...input })] as const,
  trace: (traceId: string, input: TraceDetailInput) =>
    ["TraceDetail", { id: traceId, input: normalizeVariables({ ...input }) }] as const,
  logs: (input: LogSearchInput) => ["LogSearch", normalizeVariables({ ...input })] as const,
  telemetryFacets: (input: TelemetryFacetInput) =>
    ["TelemetryFacets", normalizeVariables({ ...input })] as const,
  metricNames: (input: MetricNameSearchInput) =>
    ["MetricNames", normalizeVariables({ ...input })] as const,
  metricSeries: (input: MetricSeriesInput) =>
    ["MetricSeries", normalizeVariables({ ...input })] as const,
  richMetricSeries: (input: RichMetricSeriesInput) =>
    ["RichMetricSeries", normalizeVariables({ ...input })] as const,
  dashboards: (input: DashboardListInput) =>
    ["Dashboards", normalizeVariables({ ...input })] as const,
  organizationMembers: (organizationId: string) => ["OrganizationMembers", organizationId] as const,
  organizationInvitations: (organizationId: string) =>
    ["OrganizationInvitations", organizationId] as const,
  projectMembers: (projectId: string) => ["ProjectMembers", projectId] as const,
  retentionPolicy: (projectId: string) => ["RetentionPolicy", projectId] as const,
  projectAiSettings: (projectId: string) => ["ProjectAiSettings", projectId] as const,
  alertRules: (projectId: string, input: AlertRuleSearchInput = {}) =>
    ["AlertRules", projectId, normalizeVariables({ ...input })] as const,
  alertHistory: (
    projectId: string,
    ruleId: string | null,
    first = 50,
    after: string | null = null,
  ) => ["AlertHistory", projectId, ruleId, first, after] as const,
  alertSummary: (projectId: string, input: AlertSummaryInput) =>
    ["AlertSummary", projectId, normalizeVariables({ ...input })] as const,
  alertSilences: (projectId: string, ruleId: string | null) =>
    ["AlertSilences", projectId, ruleId] as const,
};
