export type GraphQLOperationType = "query" | "mutation" | "subscription";
export type GraphQLOperationResult = "success" | "error";

export interface GraphQLMetricAttributes {
  operation_type: GraphQLOperationType;
  operation_name: string;
  result: GraphQLOperationResult;
}

export type GraphQLMetricRecord =
  | {
      metric: "cloudgrid.bff.graphql.operations";
      kind: "counter";
      value: 1;
      attributes: GraphQLMetricAttributes;
    }
  | {
      metric: "cloudgrid.bff.graphql.duration";
      kind: "histogram";
      value: number;
      attributes: GraphQLMetricAttributes;
    };

export interface GraphQLMetricsRecorder {
  record(record: GraphQLMetricRecord): void;
}

const MUTATION_OPERATIONS = new Set([
  "selectProject",
  "createProject",
  "updateProject",
  "inviteOrganizationMember",
  "inviteProjectMember",
  "resendOrganizationInvitation",
  "revokeOrganizationInvitation",
  "updateOrganizationMember",
  "removeOrganizationMember",
  "updateProjectMember",
  "removeProjectMember",
  "createIngestCredential",
  "revokeIngestCredential",
  "saveDashboard",
  "deleteDashboard",
  "setDashboardPinned",
  "reorderDashboardPins",
  "updateRetentionPolicy",
  "createAlertRule",
  "updateAlertRule",
  "deleteAlertRule",
  "createAlertSilence",
  "deleteAlertSilence",
  "createDataset",
  "appendDatasetItems",
  "prepareDatasetImport",
  "commitDatasetImport",
  "startDatasetExport",
  "promoteSpanToDatasetItem",
  "createEvaluationDefinition",
  "updateEvaluationDefinition",
  "startEvaluationRun",
  "cancelEvaluationRun",
  "pauseEvaluationRun",
  "resumeEvaluationRun",
  "createEvaluationComparison",
  "startOptimizationRun",
  "promoteTargetSnapshot",
  "resolveAnnotation",
  "updateProjectAiSettings",
]);

const SUBSCRIPTION_OPERATIONS = new Set(["liveTraces", "liveEvaluationRun"]);
const BOUNDED_OPERATION_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

export function recordGraphQLMetrics(
  recorder: GraphQLMetricsRecorder | undefined,
  operationName: string,
  result: GraphQLOperationResult,
  durationSeconds: number,
) {
  if (!recorder) {
    return;
  }
  const attributes = {
    operation_type: graphQLOperationType(operationName),
    operation_name: sanitizeGraphQLOperationName(operationName),
    result,
  };
  try {
    recorder.record({
      metric: "cloudgrid.bff.graphql.operations",
      kind: "counter",
      value: 1,
      attributes,
    });
    recorder.record({
      metric: "cloudgrid.bff.graphql.duration",
      kind: "histogram",
      value: durationSeconds,
      attributes,
    });
  } catch {
    // Self-observability must not affect user-facing GraphQL behavior.
  }
}

export function graphQLOperationType(operationName: string): GraphQLOperationType {
  if (MUTATION_OPERATIONS.has(operationName)) {
    return "mutation";
  }
  if (SUBSCRIPTION_OPERATIONS.has(operationName)) {
    return "subscription";
  }
  return "query";
}

export function sanitizeGraphQLOperationName(operationName: string): string {
  return BOUNDED_OPERATION_NAME.test(operationName) ? operationName : "unknown";
}
