import type { CloudGridErrorId, CloudGridLogger, LogFields } from "@cloudgrid/runtime";
import { GraphQLError } from "graphql";
import {
  authGraphQLError,
  type CloudGridAuthService,
  localAuthContext,
  type NormalizedAuthContext,
} from "../../auth";
import {
  type AiEvalBridge,
  type ControlPlaneBridge,
  elapsedMilliseconds,
  type MetricQueryBridge,
  type TelemetryQueryBridge,
} from "../../bridge";
import type { GraphQLMetricsRecorder } from "../../graphql-metrics";
import {
  graphQLOperationType,
  recordGraphQLMetrics,
  sanitizeGraphQLOperationName,
} from "../../graphql-metrics";
import type {
  SelfObservabilityLogRecorder,
  SelfObservabilityTraceRecorder,
} from "../../self-observability";

type ResolverBridge = TelemetryQueryBridge &
  Partial<MetricQueryBridge> &
  Partial<ControlPlaneBridge> &
  Partial<AiEvalBridge>;

export interface ResolverContext {
  hono: {
    get(key: "bridge"): ResolverBridge;
    get(key: "auth"): CloudGridAuthService;
  };
  request?: Request;
  requestId: string;
  logger: CloudGridLogger;
  metricsRecorder?: GraphQLMetricsRecorder;
  traceRecorder?: SelfObservabilityTraceRecorder;
  logRecorder?: SelfObservabilityLogRecorder;
  authContext?: Promise<NormalizedAuthContext> | NormalizedAuthContext;
}

export async function authContext(context: ResolverContext): Promise<NormalizedAuthContext> {
  return context.authContext ? await context.authContext : localAuthContext();
}

export function requireControlBridge(context: ResolverContext): ControlPlaneBridge {
  const bridge = context.hono.get("bridge");
  if (
    !bridge.viewer ||
    !bridge.organizations ||
    !bridge.organization ||
    !bridge.projects ||
    !bridge.project ||
    !bridge.createProject ||
    !bridge.updateProject ||
    !bridge.selectProject ||
    !bridge.updateOrganizationMember ||
    !bridge.removeOrganizationMember ||
    !bridge.ingestCredentials ||
    !bridge.createIngestCredential ||
    !bridge.revokeIngestCredential ||
    !bridge.dashboards ||
    !bridge.saveDashboard ||
    !bridge.deleteDashboard ||
    !bridge.setDashboardPinned ||
    !bridge.reorderDashboardPins
  ) {
    throw authGraphQLError("ERR-016");
  }
  return bridge as ControlPlaneBridge;
}

export function requireAiChatControlBridge(context: ResolverContext): ControlPlaneBridge {
  const bridge = context.hono.get("bridge");
  if (
    !bridge.projectAiProviderSettings ||
    !bridge.updateProjectAiProviderSettings ||
    !bridge.companyAiProviderSettings ||
    !bridge.updateCompanyAiProviderSettings ||
    !bridge.aiChatHistory ||
    !bridge.aiChatConversation ||
    !bridge.createAiChatConversation ||
    !bridge.archiveAiChatConversation ||
    !bridge.deleteAiChatConversation ||
    !bridge.approveAiChatAction
  ) {
    throw authGraphQLError("ERR-016");
  }
  return bridge as ControlPlaneBridge;
}

export function requireMetricQueryBridge(context: ResolverContext): MetricQueryBridge {
  const bridge = context.hono.get("bridge");
  if (!bridge.metricNames || !bridge.metricSeries) {
    throw authGraphQLError("ERR-016");
  }
  return bridge as TelemetryQueryBridge & MetricQueryBridge;
}

export function requireAiEvalBridge(context: ResolverContext): AiEvalBridge {
  const bridge = context.hono.get("bridge");
  if (
    !bridge.agentRuns ||
    !bridge.agentRun ||
    !bridge.datasets ||
    !bridge.dataset ||
    !bridge.datasetImport ||
    !bridge.datasetExport ||
    !bridge.datasetItems ||
    !bridge.scorers ||
    !bridge.experiments ||
    !bridge.experimentRun ||
    !bridge.experimentRuns ||
    !bridge.datasetItemRuns ||
    !bridge.evalResults ||
    !bridge.annotationQueue ||
    !bridge.projectAiSettings ||
    !bridge.aiQualityOverview ||
    !bridge.createDataset ||
    !bridge.appendDatasetItems ||
    !bridge.prepareDatasetImport ||
    !bridge.commitDatasetImport ||
    !bridge.startDatasetExport ||
    !bridge.promoteSpanToDatasetItem ||
    !bridge.createScorer ||
    !bridge.createExperiment ||
    !bridge.startExperimentRun ||
    !bridge.cancelExperimentRun ||
    !bridge.startOptimizationRun ||
    !bridge.promotePromptVersion ||
    !bridge.resolveAnnotation ||
    !bridge.updateProjectAiSettings ||
    !bridge.subscribeLiveExperimentRun
  ) {
    throw authGraphQLError("ERR-016");
  }
  return bridge as AiEvalBridge;
}

export async function logGraphQLOperation<T>(
  context: {
    requestId: string;
    logger: CloudGridLogger;
    metricsRecorder?: GraphQLMetricsRecorder;
    traceRecorder?: SelfObservabilityTraceRecorder;
    logRecorder?: SelfObservabilityLogRecorder;
  },
  operation: string,
  run: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  const operationName = sanitizeGraphQLOperationName(operation);
  const operationType = graphQLOperationType(operationName);
  try {
    const result = await run();
    context.traceRecorder?.recordSpan({
      name: "graphql.request",
      result: "success",
      durationSeconds: elapsedSecondsFromMilliseconds(start),
      attributes: {
        "cloudgrid.request_id": context.requestId,
        "graphql.operation.name": operationName,
        "graphql.operation.type": operationType,
      },
    });
    recordGraphQLMetrics(
      context.metricsRecorder,
      operation,
      "success",
      elapsedSecondsFromMilliseconds(start),
    );
    context.logger.debug("graphql_operation_completed", {
      request_id: context.requestId,
      operation_or_subject: operation,
      status: "ok",
      duration_ms: elapsedMilliseconds(start),
    });
    return result;
  } catch (error) {
    const mapped = graphQLErrorLogFields(error);
    const errorID = mapped.error_id ?? "ERR-006";
    const errorCode = mapped.error_code ?? "STORAGE_UNAVAILABLE";
    context.traceRecorder?.recordSpan({
      name: "graphql.request",
      result: "error",
      durationSeconds: elapsedSecondsFromMilliseconds(start),
      attributes: {
        "cloudgrid.request_id": context.requestId,
        "graphql.operation.name": operationName,
        "graphql.operation.type": operationType,
      },
    });
    context.logRecorder?.recordLog({
      event: "graphql_operation_failed",
      severity: "WARN",
      attributes: {
        "graphql.operation.name": operationName,
        "graphql.operation.type": operationType,
        "error.id": errorID,
        "error.code": errorCode,
      },
    });
    recordGraphQLMetrics(
      context.metricsRecorder,
      operation,
      "error",
      elapsedSecondsFromMilliseconds(start),
    );
    context.logger.warn("graphql_operation_completed", {
      request_id: context.requestId,
      operation_or_subject: operation,
      status: "error",
      duration_ms: elapsedMilliseconds(start),
      ...mapped,
    });
    throw error;
  }
}

function elapsedSecondsFromMilliseconds(start: number): number {
  return elapsedMilliseconds(start) / 1000;
}

function graphQLErrorLogFields(error: unknown): Pick<LogFields, "error_id" | "error_code"> {
  if (error instanceof GraphQLError) {
    const problem = error.extensions?.problem;
    if (isProblemLogFields(problem)) {
      return { error_id: problem.id, error_code: problem.code };
    }
    if (typeof error.extensions?.code === "string") {
      return { error_code: error.extensions.code };
    }
  }
  return {};
}

function isProblemLogFields(value: unknown): value is { id: CloudGridErrorId; code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "code" in value &&
    typeof value.id === "string" &&
    typeof value.code === "string"
  );
}
