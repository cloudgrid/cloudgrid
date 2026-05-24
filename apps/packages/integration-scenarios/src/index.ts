import {
  type PublicGraphQLOperationName,
  publicGraphQLOperationNames,
} from "@cloudgrid/public-api-client/operations";

export type ScenarioExecutionMode = "local-e2e";

export interface IntegrationScenario {
  id: string;
  mode: ScenarioExecutionMode;
  description: string;
  covers: readonly PublicGraphQLOperationName[];
}

export const integrationScenarios = [
  {
    id: "control.viewer-and-project-selection",
    mode: "local-e2e",
    description: "Bootstraps the local viewer and selects the default project through GraphQL.",
    covers: ["Viewer", "SelectProject"],
  },
  {
    id: "control.organization-project-admin",
    mode: "local-e2e",
    description:
      "Exercises organization, project, member, and invitation workflows through the local GraphQL stack.",
    covers: [
      "Organizations",
      "Organization",
      "Projects",
      "Project",
      "CreateProject",
      "OrganizationMembers",
      "OrganizationInvitations",
      "InviteOrganizationMember",
      "ResendOrganizationInvitation",
      "RevokeOrganizationInvitation",
      "UpdateOrganizationMember",
      "RemoveOrganizationMember",
    ],
  },
  {
    id: "settings.project-configuration",
    mode: "local-e2e",
    description:
      "Exercises project membership, ingest credential, retention, and AI settings workflows through the local GraphQL stack.",
    covers: [
      "ProjectMembers",
      "InviteProjectMember",
      "UpdateProjectMember",
      "RemoveProjectMember",
      "IngestCredentials",
      "CreateIngestCredential",
      "RevokeIngestCredential",
      "RetentionPolicy",
      "UpdateRetentionPolicy",
      "ProjectAiSettings",
      "UpdateProjectAiSettings",
    ],
  },
  {
    id: "dashboards.crud-and-pins",
    mode: "local-e2e",
    description:
      "Creates, lists, pins, reorders, and deletes a dashboard using frontend operation documents.",
    covers: [
      "Dashboards",
      "SaveDashboard",
      "DeleteDashboard",
      "SetDashboardPinned",
      "ReorderDashboardPins",
    ],
  },
  {
    id: "dashboards.widget-runtime",
    mode: "local-e2e",
    description:
      "Executes every saved and built-in dashboard widget with the same GraphQL operations used by the frontend.",
    covers: [
      "Dashboards",
      "MetricSeries",
      "RichMetricSeries",
      "LogSearch",
      "TraceSearch",
      "LiveTrace",
    ],
  },
  {
    id: "telemetry.ingest-read-and-live",
    mode: "local-e2e",
    description:
      "Posts OTLP trace/log/metric fixtures and verifies GraphQL trace, log, metric, facet, and live subscription reads.",
    covers: [
      "TraceSearch",
      "TraceDetail",
      "LogSearch",
      "TelemetryFacets",
      "MetricNames",
      "MetricSeries",
      "LiveTrace",
    ],
  },
  {
    id: "alerting.rules-history-silences",
    mode: "local-e2e",
    description:
      "Creates, lists, updates, silences, reads history for, and deletes alert rules through the local GraphQL stack.",
    covers: [
      "AlertRules",
      "AlertHistory",
      "AlertSummary",
      "AlertSilences",
      "CreateAlertRule",
      "UpdateAlertRule",
      "DeleteAlertRule",
      "CreateAlertSilence",
      "DeleteAlertSilence",
    ],
  },
  {
    id: "ai-eval.workspace",
    mode: "local-e2e",
    description:
      "Exercises AI Eval workspace reads, dataset import/export, quality overview, and live subscription startup through the local stack.",
    covers: [
      "AgentRuns",
      "AgentRun",
      "Datasets",
      "Dataset",
      "CreateDataset",
      "AppendDatasetItems",
      "EvaluationDefinitions",
      "EvaluationDefinition",
      "CreateEvaluationDefinition",
      "UpdateEvaluationDefinition",
      "EvaluationRuns",
      "StartEvaluationRun",
      "PauseEvaluationRun",
      "ResumeEvaluationRun",
      "CancelEvaluationRun",
      "EvaluationRun",
      "EvaluationResults",
      "EvaluationComparisons",
      "CreateEvaluationComparison",
      "StartOptimizationRun",
      "PromoteTargetSnapshot",
      "DatasetCandidates",
      "PrepareDatasetCandidates",
      "CommitDatasetCandidates",
      "AnnotationQueue",
      "PrepareDatasetImport",
      "CommitDatasetImport",
      "StartDatasetExport",
      "DatasetExport",
      "AiQualityOverview",
      "LiveEvaluationRun",
    ],
  },
  {
    id: "ai-chat.workspace",
    mode: "local-e2e",
    description:
      "Exercises AI Chat provider status, history, conversation creation, conversation reads, and action approval through the local GraphQL stack.",
    covers: [
      "CompanyAiProviderSettings",
      "UpdateCompanyAiProviderSettings",
      "AiChatHistory",
      "AiChatConversation",
      "CreateAiChatConversation",
      "DeleteAiChatConversation",
      "ApproveAiChatAction",
    ],
  },
] as const satisfies readonly IntegrationScenario[];

export function coveredPublicGraphQLOperationNames() {
  return new Set(integrationScenarios.flatMap((scenario) => scenario.covers));
}

export function uncoveredPublicGraphQLOperationNames(
  operationNames: readonly PublicGraphQLOperationName[] = publicGraphQLOperationNames,
) {
  const covered = coveredPublicGraphQLOperationNames();
  return operationNames.filter((operationName) => !covered.has(operationName));
}

export function scenarioIdsForOperation(operationName: PublicGraphQLOperationName) {
  return integrationScenarios
    .filter((scenario) => (scenario.covers as readonly string[]).includes(operationName))
    .map((scenario) => scenario.id);
}
