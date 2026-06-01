import {
  type PublicGraphQLOperationName,
  publicGraphQLOperationNames,
} from "@cloudgrid/public-api-client/operations";
export {
  aiEvalV2ScenarioOperationNames,
  aiEvalV2SkillOptimizationScenarioOperationNames,
  runAiEvalV2FakeAdapterScenario,
  runAiEvalV2SkillOptimizationScenario,
  type AiEvalV2ScenarioContext,
  type AiEvalV2SkillOptimizationScenarioOptions,
  type AiEvalV2SkillOptimizationScenarioResult,
  type CapturedHarnessRequest,
} from "./ai-eval-v2-executable";
export {
  aiEvalExternalAdapterAsyncTraceLinkFixture,
  aiEvalStandardTraceFixtures,
  buildAiEvalTraceEvidenceFixture,
  missingTraceEvidenceExclusionFixture,
  traceFixtureIdsWithUnexpectedCloudGridFlavor,
  type AiEvalTraceEvidenceFixture,
  type ExternalAdapterAsyncTraceLinkFixture,
  type StandardSpanFixture,
  type StandardTraceFixture,
} from "./ai-eval-standard-trace-fixtures";

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
  defaultExecution: "hermetic";
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
        purpose:
          "Create a per-dataset input/expected-output schema with v2 split and curation defaults.",
        expected:
          "Dataset has a current version, ready item counts, split counts, and health metadata.",
      },
      {
        operation: "PrepareDatasetImport",
        purpose:
          "Preview JSONL rows mapped to input, expected, observedOutput, reason, metadata, source refs, split, and curationStatus.",
        expected: "Preview validates raw JSON values against dataset settings before commit.",
      },
      {
        operation: "CommitDatasetImport",
        purpose: "Commit valid preview rows into exactly one new dataset version.",
        expected: "Commit records the committed dataset version id and preserves source refs.",
      },
      {
        operation: "AppendDatasetItems",
        purpose:
          "Add one manual row with input, expected output, optional reason, validation split, and ready curation status.",
        expected: "The row creates an item revision and the dataset version changes.",
      },
      {
        operation: "CreateEvaluationDefinition",
        purpose:
          "Bind the dataset, ready validation split, target ref, metric settings, and run policy.",
        expected: "Evaluation definition persists immutable target and metric configuration.",
      },
      {
        operation: "StartEvaluationRun",
        purpose: "Execute the dataset evaluation against the configured target.",
        expected:
          "Run returns normal metric aggregates, item results, trajectory summaries, and trace refs.",
      },
      {
        operation: "EvaluationRun",
        purpose: "Read run detail without recomputing metrics in the caller.",
        expected:
          "Storage-read returns aggregates, item run rows, important steps, and bounded summaries.",
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
        expected:
          "Storage-write rejects the row with a validation error and no dataset version is committed.",
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
        purpose:
          "Start optimization with explicit objective, baseline target snapshot, validation split selector, and quick-shot policy.",
        expected:
          "Optimization run stores objective, budget snapshot, quick-shot policy, candidate snapshot ids, and caused evaluation run ids.",
      },
      {
        operation: "OptimizationRuns",
        purpose: "Read optimization progress and candidate evidence.",
        expected:
          "Progress exposes candidate snapshots, comparison ids, selected candidate, and promotion record state.",
      },
      {
        operation: "PromoteTargetSnapshot",
        purpose: "Promote only after full validation evidence exists.",
        expected:
          "Promotion writes a PromotionRecord with baseline, candidate, comparison, target ref, and evidence run ids.",
      },
    ],
    failureCases: [
      {
        operation: "StartEvaluationRun",
        purpose:
          "Run through the deterministic CloudGrid AI harness adapter timeout fixture.",
        expected:
          "Runner records bounded adapter timeout failure evidence without auto-promoting or mutating the target.",
      },
    ],
  },
  {
    id: "ai-eval.prompt-optimization.classification",
    scenarioId: "ai-eval.workspace",
    description:
      "Imports the support-intent classification fixture pack, evaluates a weak prompt target, starts prompt optimization, reads PromptOptimizationStep evidence, and promotes only after validation evidence.",
    defaultExecution: "hermetic",
    steps: [
      {
        operation: "CreateDataset",
        purpose:
          "Create a classification dataset from test_data/ai_eval/classification/dataset-settings.json.",
        expected:
          "Dataset settings include evaluationFamily classification, curationStatus defaults, label schema enum, and classification.accuracy as the primary metric.",
      },
      {
        operation: "PrepareDatasetImport",
        purpose:
          "Preview rows.jsonl with training, validation, and test rows using curationStatus and source refs.",
        expected:
          "Preview accepts every ready row, rejects legacy reviewStatus fields, and reports split counts before commit.",
      },
      {
        operation: "CommitDatasetImport",
        purpose: "Commit the support-intent rows into one immutable dataset version.",
        expected:
          "Committed rows preserve expected label JSON, reasons, content treatment, source refs, and split membership.",
      },
      {
        operation: "CreateEvaluationDefinition",
        purpose:
          "Bind the baseline prompt target snapshot, validation split selector, and classification metric settings.",
        expected:
          "Evaluation definition resolves target parts for prompt and examples without exposing hidden provider credentials.",
      },
      {
        operation: "StartEvaluationRun",
        purpose:
          "Run the weak baseline target to produce label errors and trace-backed item evidence.",
        expected:
          "Run aggregates classification.accuracy, per-label support, confusion matrix, unknown-label problems, and trajectory tradeoffs.",
      },
      {
        operation: "StartOptimizationRun",
        purpose:
          "Start critic_mutate_judge_pick prompt optimization against training rows and validation gates.",
        expected:
          "Runner creates PromptOptimizationStep records with label_confusion, unknown_label, fewshot_bootstrap, and success_preservation proposals.",
      },
      {
        operation: "OptimizationRuns",
        purpose:
          "Read family diagnosis, candidate prompt/example diffs, rejected changes, selected candidate, and validation deltas.",
        expected:
          "Storage-read returns prompt optimization detail without validation/test row content leakage to optimizer evidence.",
      },
      {
        operation: "PromoteTargetSnapshot",
        purpose: "Promote the selected prompt target only after validation evidence exists.",
        expected:
          "Promotion records baseline/candidate target snapshots, comparison id, evidence run ids, and explicit user action.",
      },
    ],
    failureCases: [
      {
        operation: "StartOptimizationRun",
        purpose:
          "Start classification optimization after removing allowed label options and making the JSON label path ambiguous.",
        expected:
          "Runner fails preflight before target execution with metric_config_invalid readiness details.",
      },
      {
        operation: "StartOptimizationRun",
        purpose:
          "Start optimization for an external adapter that does not declare candidateTargetContentMode.",
        expected:
          "Start is rejected; evaluation remains allowed but promotable prompt optimization is disabled.",
      },
    ],
  },
  {
    id: "ai-eval.prompt-optimization.extraction",
    scenarioId: "ai-eval.workspace",
    description:
      "Imports the order-confirmation extraction fixture pack, evaluates a weak prompt target, starts prompt optimization, reads PromptOptimizationStep evidence, and promotes only after validation evidence.",
    defaultExecution: "hermetic",
    steps: [
      {
        operation: "CreateDataset",
        purpose:
          "Create an extraction dataset from test_data/ai_eval/extraction/dataset-settings.json.",
        expected:
          "Dataset settings include evaluationFamily extraction, expectedJsonSchema, and extraction.field_match_rate as the primary metric.",
      },
      {
        operation: "PrepareDatasetImport",
        purpose:
          "Preview rows.jsonl with optional discountCode, zero totals, distractor amounts, word quantities, and country normalization examples.",
        expected:
          "Preview validates expected JSON values against the schema and reports training/validation/test split counts.",
      },
      {
        operation: "CommitDatasetImport",
        purpose: "Commit the order-extraction rows into one immutable dataset version.",
        expected:
          "Committed rows preserve expected JSON values, optional fields, reasons, content treatment, source refs, and split membership.",
      },
      {
        operation: "CreateEvaluationDefinition",
        purpose:
          "Bind the baseline prompt target snapshot, validation split selector, and extraction metric settings.",
        expected:
          "Evaluation definition resolves prompt/examples parts and keeps expectedJsonSchema immutable evidence.",
      },
      {
        operation: "StartEvaluationRun",
        purpose:
          "Run the weak baseline target to produce invalid JSON, missing field, weak-field, and type mismatch evidence.",
        expected:
          "Run aggregates extraction.valid_json_rate, extraction.schema_validity, extraction.exact_json_match, extraction.field_match_rate, and field breakdowns.",
      },
      {
        operation: "StartOptimizationRun",
        purpose:
          "Start critic_mutate_judge_pick prompt optimization against training rows and validation gates.",
        expected:
          "Runner creates PromptOptimizationStep records with schema_format, weak_field, fewshot_bootstrap, and success_preservation proposals.",
      },
      {
        operation: "OptimizationRuns",
        purpose:
          "Read weak-field diagnosis, candidate prompt/example diffs, rejected changes, selected candidate, and validation deltas.",
        expected:
          "Storage-read returns prompt optimization detail and proves validation/test row content is not sent to proposal generation.",
      },
      {
        operation: "PromoteTargetSnapshot",
        purpose: "Promote the selected prompt target only after validation evidence exists.",
        expected:
          "Promotion records baseline/candidate target snapshots, comparison id, evidence run ids, and explicit user action.",
      },
    ],
    failureCases: [
      {
        operation: "StartOptimizationRun",
        purpose: "Start extraction optimization after removing expectedJsonSchema.",
        expected:
          "Runner fails preflight before target execution with schema readiness details.",
      },
      {
        operation: "StartOptimizationRun",
        purpose:
          "Start optimization for an extraction proposal that attempts to mutate the dataset schema.",
        expected:
          "Runner rejects the proposal before candidate snapshot persistence and records bounded rejection evidence.",
      },
    ],
  },
  {
    id: "ai-eval.skill-optimization.external-adapter-standard-traces",
    scenarioId: "ai-eval.workspace",
    description:
      "Starts external-adapter skill optimization, follows async completion through W3C trace context, and proves optimizer evidence comes from standard OTLP spans.",
    defaultExecution: "hermetic",
    steps: [
      {
        operation: "StartOptimizationRun",
        purpose:
          "Start skill optimization against an external adapter with a terminal output ref and trace-link requirement.",
        expected:
          "Runner accepts async completion, preserves traceparent-derived trace refs, and waits for linked OTLP evidence.",
      },
      {
        operation: "OptimizationRuns",
        purpose:
          "Read skill optimization detail and list progress after deterministic skill edit proposals are evaluated.",
        expected:
          "Detail includes rejected protected edit summaries, accepted validation-backed skill edits, skill digest changes, and best target snapshot readiness.",
      },
      {
        operation: "OptimizationRuns",
        purpose:
          "Read skill optimization progress after standard GenAI, MCP, OpenInference, HTTP, DB, and exception spans are ingested.",
        expected:
          "Storage-read-derived important steps, trajectory summary, and evidence refs are present without CloudGrid source attributes.",
      },
      {
        operation: "PromoteTargetSnapshot",
        purpose:
          "Keep promotion as a user-confirmed action after best target snapshot and evidence are visible.",
        expected:
          "Scenario proves a best target snapshot is ready and no promotion record is created implicitly.",
      },
    ],
    failureCases: [
      {
        operation: "StartOptimizationRun",
        purpose: "Complete adapter execution with terminal output but without linked trace evidence.",
        expected:
          "Item scoring may use terminal output, but optimizer reflection excludes the item with trace_evidence_missing evidence.",
      },
      {
        operation: "StartOptimizationRun",
        purpose: "Reflect proposes an edit to a protected skill runtime file.",
        expected:
          "Runner rejects the protected-file proposal and continues to evaluate valid editable skill proposals.",
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
