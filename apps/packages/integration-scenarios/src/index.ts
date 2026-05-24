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

export interface IntegrationScenarioStep {
  operation: PublicGraphQLOperationName;
  purpose: string;
  expected: string;
}

export interface IntegrationScenarioFixture {
  id: string;
  scenarioId: string;
  description: string;
  defaultExecution: "hermetic" | "opt-in-external-adapter";
  steps: readonly IntegrationScenarioStep[];
  failureCases: readonly IntegrationScenarioStep[];
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
      "Exercises AI Eval v2 dataset curation, dataset evaluation, comparison, optimization, import/export, and live run reads through the local stack.",
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
      "OptimizationRuns",
      "PromoteTargetSnapshot",
      "PrepareDatasetImport",
      "CommitDatasetImport",
      "StartDatasetExport",
      "DatasetExport",
      "LiveEvaluationRun",
    ],
  },
  {
    id: "ai-eval.backlog-compatibility",
    mode: "local-e2e",
    description:
      "Tracks public GraphQL operations that remain in the contract for backlog or compatibility surfaces but are not primary AI Eval v2 workspace concepts.",
    covers: [
      "DatasetCandidates",
      "PrepareDatasetCandidates",
      "CommitDatasetCandidates",
      "AnnotationQueue",
      "AiQualityOverview",
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

export const aiEvalV2ScenarioFixtures = [
  {
    id: "ai-eval.dataset-evaluation.classification",
    scenarioId: "ai-eval.workspace",
    description:
      "Creates one schema-defined classification dataset, imports and appends curated rows, creates an evaluation, starts a run, and compares a candidate run against a baseline run.",
    defaultExecution: "hermetic",
    steps: [
      {
        operation: "CreateDataset",
        purpose: "Create a per-dataset input/expected-output schema with v2 split and curation defaults.",
        expected: "Dataset has a current version, ready item counts, split counts, and health metadata.",
      },
      {
        operation: "PrepareDatasetImport",
        purpose: "Preview JSONL rows mapped to input, expected, observedOutput, reason, metadata, source refs, split, and curationStatus.",
        expected: "Preview validates raw JSON values against dataset settings before commit.",
      },
      {
        operation: "CommitDatasetImport",
        purpose: "Commit valid preview rows into exactly one new dataset version.",
        expected: "Commit records the committed dataset version id and preserves source refs.",
      },
      {
        operation: "AppendDatasetItems",
        purpose: "Add one manual row with input, expected output, optional reason, validation split, and ready curation status.",
        expected: "The row creates an item revision and the dataset version changes.",
      },
      {
        operation: "CreateEvaluationDefinition",
        purpose: "Bind the dataset, ready validation split, target ref, metric settings, and run policy.",
        expected: "Evaluation definition persists immutable target and metric configuration.",
      },
      {
        operation: "StartEvaluationRun",
        purpose: "Execute the dataset evaluation against the configured target.",
        expected: "Run returns normal metric aggregates, item results, trajectory summaries, and trace refs.",
      },
      {
        operation: "EvaluationRun",
        purpose: "Read run detail without recomputing metrics in the caller.",
        expected: "Storage-read returns aggregates, item run rows, important steps, and bounded summaries.",
      },
      {
        operation: "CreateEvaluationComparison",
        purpose: "Compare baseline and candidate runs.",
        expected: "Comparison records metric deltas, target diff, examples, and summary text.",
      },
    ],
    failureCases: [
      {
        operation: "AppendDatasetItems",
        purpose: "Submit expected JSON that violates the dataset expected-output schema.",
        expected: "Storage-write rejects the row with a validation error and no dataset version is committed.",
      },
    ],
  },
  {
    id: "ai-eval.optimization.quick-shot",
    scenarioId: "ai-eval.workspace",
    description:
      "Starts optimization around a dataset evaluation with quick-shot selection, validates candidate evidence, and keeps promotion explicit.",
    defaultExecution: "hermetic",
    steps: [
      {
        operation: "StartOptimizationRun",
        purpose: "Start optimization with explicit objective, baseline target snapshot, validation split selector, and quick-shot policy.",
        expected: "Optimization run stores objective, budget snapshot, quick-shot policy, candidate snapshot ids, and caused evaluation run ids.",
      },
      {
        operation: "OptimizationRuns",
        purpose: "Read optimization progress and candidate evidence.",
        expected: "Progress exposes candidate snapshots, comparison ids, selected candidate, and promotion record state.",
      },
      {
        operation: "PromoteTargetSnapshot",
        purpose: "Promote only after full validation evidence exists.",
        expected: "Promotion writes a PromotionRecord with baseline, candidate, comparison, target ref, and evidence run ids.",
      },
    ],
    failureCases: [
      {
        operation: "StartEvaluationRun",
        purpose: "Run through an opt-in external adapter that exceeds the configured timeout.",
        expected: "Runner records bounded adapter timeout failure evidence without auto-promoting or mutating the target.",
      },
    ],
  },
] as const satisfies readonly IntegrationScenarioFixture[];

export function coveredPublicGraphQLOperationNames() {
  return new Set<PublicGraphQLOperationName>(
    integrationScenarios.flatMap((scenario) => scenario.covers),
  );
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
