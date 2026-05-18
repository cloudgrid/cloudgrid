import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type AuthRuntimeConfig,
  type CloudGridErrorId,
  type CloudGridLogger,
  createLogger,
  type LogFields,
} from "@cloudgrid/runtime";
import type {
  AgentRunSearchInput,
  AiQualityOverviewInput,
  AlertRuleSearchInput,
  AnnotationQueueSearchInput,
  AppendDatasetItemsInput,
  CommitDatasetImportInput,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateDatasetInput,
  CreateExperimentInput,
  CreateIngestCredentialInput,
  CreateProjectInput,
  CreateScorerInput,
  DashboardListInput,
  Dataset,
  DatasetItemSearchInput,
  DatasetSearchInput,
  EvalResultSearchInput,
  Experiment,
  ExperimentRun,
  ExperimentSearchInput,
  InviteOrganizationMemberInput,
  InviteProjectMemberInput,
  LiveExperimentRunInput,
  LiveTraceInput,
  LogSearchInput,
  MetricNameSearchInput,
  MetricSeriesInput,
  PrepareDatasetImportInput,
  ProjectListInput,
  PromotePromptVersionInput,
  PromoteSpanToDatasetItemInput,
  RemoveOrganizationMemberInput,
  ReorderDashboardPinsInput,
  ResolveAnnotationInput,
  RichMetricSeriesInput,
  SaveDashboardInput,
  ScorerSearchInput,
  SetDashboardPinnedInput,
  StartDatasetExportInput,
  StartExperimentRunInput,
  StartOptimizationRunInput,
  TelemetryFacetInput,
  TraceDetailInput,
  TraceSearchInput,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectAiSettingsInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
} from "@cloudgrid/ui-contracts";
import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import { createSchema, createYoga } from "graphql-yoga";
import { Hono } from "hono";
import {
  type AuthProviderFixture,
  authGraphQLError,
  CloudGridAuthService,
  localAuthContext,
  type NormalizedAuthContext,
  requireScopes,
} from "./auth";
import {
  type AiEvalBridge,
  type ControlPlaneBridge,
  createNATSTelemetryQueryBridge,
  elapsedMilliseconds,
  type MetricQueryBridge,
  type TelemetryQueryBridge,
} from "./bridge";
import { loadConfig } from "./config";
import { attachDatasetTransferRoutes } from "./dataset-transfer";
import type { GraphQLMetricsRecorder } from "./graphql-metrics";
import {
  graphQLOperationType,
  recordGraphQLMetrics,
  sanitizeGraphQLOperationName,
} from "./graphql-metrics";
import { healthResponse } from "./health";
import {
  OTLPSelfObservabilityExporter,
  type SelfObservabilityLogRecorder,
  type SelfObservabilityTraceRecorder,
} from "./self-observability";
import { attachStaticRoutes } from "./static";
import {
  validateAgentRunSearchInput,
  validateAiQualityOverviewInput,
  validateAlertRuleSearchInput,
  validateAnnotationQueueSearchInput,
  validateAppendDatasetItemsInput,
  validateCommitDatasetImportInput,
  validateCreateAlertRuleInput,
  validateCreateAlertSilenceInput,
  validateCreateDatasetInput,
  validateCreateExperimentInput,
  validateCreateIngestCredentialInput,
  validateCreateProjectInput,
  validateCreateScorerInput,
  validateDashboardListInput,
  validateDatasetItemSearchInput,
  validateDatasetSearchInput,
  validateEvalResultSearchInput,
  validateExperimentSearchInput,
  validateId,
  validateInviteOrganizationMemberInput,
  validateInviteProjectMemberInput,
  validateLiveExperimentRunInput,
  validateLiveTraceInput,
  validateLogSearchInput,
  validateMetricNameSearchInput,
  validateMetricSeriesInput,
  validatePrepareDatasetImportInput,
  validateProjectListInput,
  validateProjectRole,
  validatePromotePromptVersionInput,
  validatePromoteSpanToDatasetItemInput,
  validateRemoveOrganizationMemberInput,
  validateReorderDashboardPinsInput,
  validateResolveAnnotationInput,
  validateRichMetricSeriesInput,
  validateSaveDashboardInput,
  validateScorerSearchInput,
  validateSetDashboardPinnedInput,
  validateStartDatasetExportInput,
  validateStartExperimentRunInput,
  validateStartOptimizationRunInput,
  validateTelemetryFacetInput,
  validateTraceDetailInput,
  validateTraceId,
  validateTraceSearchInput,
  validateUpdateAlertRuleInput,
  validateUpdateOrganizationMemberInput,
  validateUpdateProjectAiSettingsInput,
  validateUpdateProjectInput,
  validateUpdateRetentionPolicyInput,
} from "./validation";

const schemaPath = fileURLToPath(
  new URL("../../../specs/03-contracts/graphql/public-schema.graphql", import.meta.url),
);

interface AppContext {
  bridge: AppBridge;
  auth: CloudGridAuthService;
}

type AppBridge = TelemetryQueryBridge &
  Partial<MetricQueryBridge> &
  Partial<ControlPlaneBridge> &
  Partial<AiEvalBridge>;

interface CreateAppOptions {
  graphqlUI: boolean;
  auth?: AuthRuntimeConfig;
  authProvider?: AuthProviderFixture;
  authFetch?: typeof fetch;
  frontendServeStatic?: boolean;
  frontendStaticDir?: string;
  datasetTransferDir?: string;
  metricsRecorder?: GraphQLMetricsRecorder;
  traceRecorder?: SelfObservabilityTraceRecorder;
  logRecorder?: SelfObservabilityLogRecorder;
}

const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => parseLiteral(ast),
});

const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? ast.value : null),
});

export async function createApp(config = loadConfig(), logger = createLogger("bff")) {
  const selfObservability = OTLPSelfObservabilityExporter.fromConfig({
    serviceName: "cloudgrid.bff",
    deploymentMode: config.deploymentMode,
    selfObservability: config.selfObservability,
  });
  const bridge = await createNATSTelemetryQueryBridge(
    config.natsUrl,
    config.requestTimeoutMs,
    logger,
    selfObservability
      ? {
          metricsRecorder: selfObservability,
          traceRecorder: selfObservability,
          logRecorder: selfObservability,
        }
      : {},
  );
  return {
    ...createAppWithBridge(
      bridge,
      selfObservability
        ? {
            ...config,
            metricsRecorder: selfObservability,
            traceRecorder: selfObservability,
            logRecorder: selfObservability,
          }
        : config,
      logger,
    ),
    selfObservability,
  };
}

export function createAppWithBridge(
  bridge: AppBridge,
  config: CreateAppOptions,
  logger = createLogger("bff"),
) {
  const app = new Hono<{ Variables: AppContext }>();
  const auth = new CloudGridAuthService(config.auth, {
    ...(config.authProvider ? { provider: config.authProvider } : {}),
    ...(config.authFetch ? { fetch: config.authFetch } : {}),
  });

  app.use("*", async (context, next) => {
    context.set("bridge", bridge);
    context.set("auth", auth);
    await next();
  });

  app.get("/api/health", (context) => healthResponse(context, bridge));
  app.get("/livez", (context) => context.json({ status: "ok", service: "bff" }));
  app.get("/readyz", (context) => healthResponse(context, bridge));
  app.get("/auth/login", (context) => auth.login(context.req.raw));
  app.get("/auth/callback", (context) => auth.callback(context.req.raw));
  app.post("/auth/logout", (context) => auth.logout(context.req.raw));
  attachDatasetTransferRoutes(app, {
    datasetTransferDir: config.datasetTransferDir ?? ".cloudgrid/dataset-transfer",
  });

  type YogaContext = CloudGridYogaContext;

  const yoga = createYoga<YogaContext>({
    graphqlEndpoint: "/graphql",
    schema: createCloudGridSchema(),
    graphiql: config.graphqlUI,
    context: ({ request }) => ({
      requestId: crypto.randomUUID(),
      logger,
      metricsRecorder: config.metricsRecorder,
      traceRecorder: config.traceRecorder,
      logRecorder: config.logRecorder,
      authContext: auth.authenticateRequest(request),
    }),
  });

  app.on(["GET", "POST", "OPTIONS"], "/graphql", (context) =>
    yoga.handle(context.req.raw, { hono: context }),
  );

  attachStaticRoutes(app, {
    frontendServeStatic: config.frontendServeStatic ?? false,
    frontendStaticDir: config.frontendStaticDir ?? "./apps/backend/public",
  });

  return { app, bridge, auth };
}

export type CloudGridYogaContext = {
  hono: { get: (key: "bridge") => AppBridge };
  requestId: string;
  logger: CloudGridLogger;
  metricsRecorder?: GraphQLMetricsRecorder;
  traceRecorder?: SelfObservabilityTraceRecorder;
  logRecorder?: SelfObservabilityLogRecorder;
  authContext?: Promise<NormalizedAuthContext> | NormalizedAuthContext;
};

export function createCloudGridSchema() {
  return createSchema<CloudGridYogaContext>({
    typeDefs: readFileSync(schemaPath, "utf8"),
    resolvers: {
      JSON: JSONScalar,
      DateTime: DateTimeScalar,
      Query: {
        viewer: async (_parent, _args, context) =>
          logGraphQLOperation(context, "viewer", async () =>
            requireControlBridge(context).viewer(await authContext(context)),
          ),
        organizations: async (_parent, _args, context) =>
          logGraphQLOperation(context, "organizations", async () =>
            requireControlBridge(context).organizations(await authContext(context)),
          ),
        organization: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "organization", async () =>
            requireControlBridge(context).organization(
              validateId(args.id, "organization id"),
              await authContext(context),
            ),
          ),
        organizationMembers: async (_parent, args: { organizationId: string }, context) =>
          logGraphQLOperation(context, "organizationMembers", async () =>
            requireControlBridge(context).organizationMembers(
              validateId(args.organizationId, "organization id"),
              await authContext(context),
            ),
          ),
        organizationInvitations: async (_parent, args: { organizationId: string }, context) =>
          logGraphQLOperation(context, "organizationInvitations", async () =>
            requireControlBridge(context).organizationInvitations(
              validateId(args.organizationId, "organization id"),
              await authContext(context),
            ),
          ),
        projects: async (_parent, args: { input?: ProjectListInput }, context) =>
          logGraphQLOperation(context, "projects", async () =>
            requireControlBridge(context).projects(
              validateProjectListInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        project: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "project", async () =>
            requireControlBridge(context).project(
              validateId(args.id, "project id"),
              await authContext(context),
            ),
          ),
        projectMembers: async (_parent, args: { projectId: string }, context) =>
          logGraphQLOperation(context, "projectMembers", async () =>
            requireControlBridge(context).projectMembers(
              validateId(args.projectId, "project id"),
              await authContext(context),
            ),
          ),
        traces: async (_parent, args: { input?: TraceSearchInput }, context) =>
          logGraphQLOperation(context, "traces", async () =>
            context.hono
              .get("bridge")
              .searchTraces(validateTraceSearchInput(args.input ?? {}), await authContext(context)),
          ),
        trace: async (_parent, args: { id: string; input?: TraceDetailInput }, context) =>
          logGraphQLOperation(context, "trace", async () =>
            context.hono
              .get("bridge")
              .getTraceDetail(
                validateTraceId(args.id),
                validateTraceDetailInput(args.input ?? {}),
                await authContext(context),
              ),
          ),
        logs: async (_parent, args: { input?: LogSearchInput }, context) =>
          logGraphQLOperation(context, "logs", async () =>
            context.hono
              .get("bridge")
              .searchLogs(validateLogSearchInput(args.input ?? {}), await authContext(context)),
          ),
        telemetryFacets: async (_parent, args: { input?: TelemetryFacetInput }, context) =>
          logGraphQLOperation(context, "telemetryFacets", async () =>
            context.hono
              .get("bridge")
              .telemetryFacets(
                validateTelemetryFacetInput(args.input ?? {}),
                await authContext(context),
              ),
          ),
        metricNames: async (_parent, args: { input?: MetricNameSearchInput }, context) =>
          logGraphQLOperation(context, "metricNames", async () =>
            requireMetricQueryBridge(context).metricNames(
              validateMetricNameSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        metricSeries: async (_parent, args: { input: MetricSeriesInput }, context) =>
          logGraphQLOperation(context, "metricSeries", async () =>
            requireMetricQueryBridge(context).metricSeries(
              validateMetricSeriesInput(args.input),
              await authContext(context),
            ),
          ),
        richMetricSeries: async (_parent, args: { input: RichMetricSeriesInput }, context) =>
          logGraphQLOperation(context, "richMetricSeries", async () =>
            requireMetricQueryBridge(context).richMetricSeries(
              validateRichMetricSeriesInput(args.input),
              await authContext(context),
            ),
          ),
        dashboards: async (_parent, args: { input?: DashboardListInput }, context) =>
          logGraphQLOperation(context, "dashboards", async () =>
            requireControlBridge(context).dashboards(
              validateDashboardListInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        retentionPolicy: async (_parent, args: { projectId: string }, context) =>
          logGraphQLOperation(context, "retentionPolicy", async () =>
            requireControlBridge(context).retentionPolicy(
              validateId(args.projectId, "project id"),
              await authContext(context),
            ),
          ),
        alertRules: async (
          _parent,
          args: { projectId: string; input?: AlertRuleSearchInput | null },
          context,
        ) =>
          logGraphQLOperation(context, "alertRules", async () =>
            requireControlBridge(context).alertRules(
              validateId(args.projectId, "project id"),
              validateAlertRuleSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        alertHistory: async (
          _parent,
          args: {
            projectId: string;
            ruleId?: string | null;
            first?: number | null;
            after?: string | null;
          },
          context,
        ) =>
          logGraphQLOperation(context, "alertHistory", async () =>
            requireControlBridge(context).alertHistory(
              validateId(args.projectId, "project id"),
              args.ruleId ? validateId(args.ruleId, "alert rule id") : null,
              args.first ?? 50,
              args.after ?? null,
              await authContext(context),
            ),
          ),
        alertSilences: async (
          _parent,
          args: { projectId: string; ruleId?: string | null },
          context,
        ) =>
          logGraphQLOperation(context, "alertSilences", async () =>
            requireControlBridge(context).alertSilences(
              validateId(args.projectId, "project id"),
              args.ruleId ? validateId(args.ruleId, "alert rule id") : null,
              await authContext(context),
            ),
          ),
        ingestCredentials: async (_parent, args: { projectId: string }, context) =>
          logGraphQLOperation(context, "ingestCredentials", async () =>
            requireControlBridge(context).ingestCredentials(
              validateId(args.projectId, "project id"),
              await authContext(context),
            ),
          ),
        agentRuns: async (_parent, args: { input?: AgentRunSearchInput }, context) =>
          logGraphQLOperation(context, "agentRuns", async () =>
            requireAiEvalBridge(context).agentRuns(
              validateAgentRunSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        agentRun: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "agentRun", async () =>
            requireAiEvalBridge(context).agentRun(
              validateId(args.id, "agent run id"),
              await authContext(context),
            ),
          ),
        datasets: async (_parent, args: { input?: DatasetSearchInput }, context) =>
          logGraphQLOperation(context, "datasets", async () =>
            requireAiEvalBridge(context).datasets(
              validateDatasetSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        dataset: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "dataset", async () =>
            requireAiEvalBridge(context).dataset(
              validateId(args.id, "dataset id"),
              await authContext(context),
            ),
          ),
        datasetImport: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "datasetImport", async () =>
            requireAiEvalBridge(context).datasetImport(
              validateId(args.id, "dataset import id"),
              await authContext(context),
            ),
          ),
        datasetExport: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "datasetExport", async () =>
            requireAiEvalBridge(context).datasetExport(
              validateId(args.id, "dataset export id"),
              await authContext(context),
            ),
          ),
        scorers: async (_parent, args: { input?: ScorerSearchInput }, context) =>
          logGraphQLOperation(context, "scorers", async () =>
            requireAiEvalBridge(context).scorers(
              validateScorerSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        experiments: async (_parent, args: { input?: ExperimentSearchInput }, context) =>
          logGraphQLOperation(context, "experiments", async () =>
            requireAiEvalBridge(context).experiments(
              validateExperimentSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        experimentRun: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "experimentRun", async () =>
            requireAiEvalBridge(context).experimentRun(
              validateId(args.id, "experiment run id"),
              await authContext(context),
            ),
          ),
        evalResults: async (_parent, args: { input?: EvalResultSearchInput }, context) =>
          logGraphQLOperation(context, "evalResults", async () =>
            requireAiEvalBridge(context).evalResults(
              validateEvalResultSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        annotationQueue: async (_parent, args: { input?: AnnotationQueueSearchInput }, context) =>
          logGraphQLOperation(context, "annotationQueue", async () =>
            requireAiEvalBridge(context).annotationQueue(
              validateAnnotationQueueSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
        projectAiSettings: async (_parent, args: { projectId: string }, context) =>
          logGraphQLOperation(context, "projectAiSettings", async () =>
            requireAiEvalBridge(context).projectAiSettings(
              validateId(args.projectId, "project id"),
              await authContext(context),
            ),
          ),
        aiQualityOverview: async (_parent, args: { input: AiQualityOverviewInput }, context) =>
          logGraphQLOperation(context, "aiQualityOverview", async () =>
            requireAiEvalBridge(context).aiQualityOverview(
              validateAiQualityOverviewInput(args.input),
              await authContext(context),
            ),
          ),
      },
      Mutation: {
        selectProject: async (_parent, args: { projectId: string }, context) =>
          logGraphQLOperation(context, "selectProject", async () =>
            requireControlBridge(context).selectProject(
              validateId(args.projectId, "project id"),
              await authContext(context),
            ),
          ),
        createProject: async (_parent, args: { input: CreateProjectInput }, context) =>
          logGraphQLOperation(context, "createProject", async () =>
            requireControlBridge(context).createProject(
              validateCreateProjectInput(args.input),
              await authContext(context),
            ),
          ),
        updateProject: async (_parent, args: { id: string; input: UpdateProjectInput }, context) =>
          logGraphQLOperation(context, "updateProject", async () =>
            requireControlBridge(context).updateProject(
              validateId(args.id, "project id"),
              validateUpdateProjectInput(args.input),
              await authContext(context),
            ),
          ),
        inviteOrganizationMember: async (
          _parent,
          args: { input: InviteOrganizationMemberInput },
          context,
        ) =>
          logGraphQLOperation(context, "inviteOrganizationMember", async () =>
            requireControlBridge(context).inviteOrganizationMember(
              validateInviteOrganizationMemberInput(args.input),
              await authContext(context),
            ),
          ),
        inviteProjectMember: async (_parent, args: { input: InviteProjectMemberInput }, context) =>
          logGraphQLOperation(context, "inviteProjectMember", async () =>
            requireControlBridge(context).inviteProjectMember(
              validateInviteProjectMemberInput(args.input),
              await authContext(context),
            ),
          ),
        resendOrganizationInvitation: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "resendOrganizationInvitation", async () =>
            requireControlBridge(context).resendOrganizationInvitation(
              validateId(args.id, "invitation id"),
              await authContext(context),
            ),
          ),
        revokeOrganizationInvitation: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "revokeOrganizationInvitation", async () =>
            requireControlBridge(context).revokeOrganizationInvitation(
              validateId(args.id, "invitation id"),
              await authContext(context),
            ),
          ),
        updateOrganizationMember: async (
          _parent,
          args: { input: UpdateOrganizationMemberInput },
          context,
        ) =>
          logGraphQLOperation(context, "updateOrganizationMember", async () =>
            requireControlBridge(context).updateOrganizationMember(
              validateUpdateOrganizationMemberInput(args.input),
              await authContext(context),
            ),
          ),
        removeOrganizationMember: async (
          _parent,
          args: { input: RemoveOrganizationMemberInput },
          context,
        ) =>
          logGraphQLOperation(context, "removeOrganizationMember", async () =>
            requireControlBridge(context).removeOrganizationMember(
              validateRemoveOrganizationMemberInput(args.input),
              await authContext(context),
            ),
          ),
        updateProjectMember: async (
          _parent,
          args: { projectId: string; userId: string; role: "viewer" | "editor" | "admin" },
          context,
        ) =>
          logGraphQLOperation(context, "updateProjectMember", async () =>
            requireControlBridge(context).updateProjectMember(
              validateId(args.projectId, "project id"),
              validateId(args.userId, "user id"),
              validateProjectRole(args.role),
              await authContext(context),
            ),
          ),
        removeProjectMember: async (
          _parent,
          args: { projectId: string; userId: string },
          context,
        ) =>
          logGraphQLOperation(context, "removeProjectMember", async () =>
            requireControlBridge(context).removeProjectMember(
              validateId(args.projectId, "project id"),
              validateId(args.userId, "user id"),
              await authContext(context),
            ),
          ),
        createIngestCredential: async (
          _parent,
          args: { input: CreateIngestCredentialInput },
          context,
        ) =>
          logGraphQLOperation(context, "createIngestCredential", async () =>
            requireControlBridge(context).createIngestCredential(
              validateCreateIngestCredentialInput(args.input),
              await authContext(context),
            ),
          ),
        revokeIngestCredential: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "revokeIngestCredential", async () =>
            requireControlBridge(context).revokeIngestCredential(
              validateId(args.id, "ingest credential id"),
              await authContext(context),
            ),
          ),
        saveDashboard: async (_parent, args: { input: SaveDashboardInput }, context) =>
          logGraphQLOperation(context, "saveDashboard", async () =>
            requireControlBridge(context).saveDashboard(
              validateSaveDashboardInput(args.input),
              await authContext(context),
            ),
          ),
        deleteDashboard: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "deleteDashboard", async () =>
            requireControlBridge(context).deleteDashboard(
              validateId(args.id, "dashboard id"),
              await authContext(context),
            ),
          ),
        setDashboardPinned: async (_parent, args: { input: SetDashboardPinnedInput }, context) =>
          logGraphQLOperation(context, "setDashboardPinned", async () =>
            requireControlBridge(context).setDashboardPinned(
              validateSetDashboardPinnedInput(args.input),
              await authContext(context),
            ),
          ),
        reorderDashboardPins: async (
          _parent,
          args: { input: ReorderDashboardPinsInput },
          context,
        ) =>
          logGraphQLOperation(context, "reorderDashboardPins", async () =>
            requireControlBridge(context).reorderDashboardPins(
              validateReorderDashboardPinsInput(args.input),
              await authContext(context),
            ),
          ),
        updateRetentionPolicy: async (
          _parent,
          args: { input: UpdateRetentionPolicyInput },
          context,
        ) =>
          logGraphQLOperation(context, "updateRetentionPolicy", async () =>
            requireControlBridge(context).updateRetentionPolicy(
              validateUpdateRetentionPolicyInput(args.input),
              await authContext(context),
            ),
          ),
        createAlertRule: async (_parent, args: { input: CreateAlertRuleInput }, context) =>
          logGraphQLOperation(context, "createAlertRule", async () =>
            requireControlBridge(context).createAlertRule(
              validateCreateAlertRuleInput(args.input),
              await authContext(context),
            ),
          ),
        updateAlertRule: async (_parent, args: { input: UpdateAlertRuleInput }, context) =>
          logGraphQLOperation(context, "updateAlertRule", async () =>
            requireControlBridge(context).updateAlertRule(
              validateUpdateAlertRuleInput(args.input),
              await authContext(context),
            ),
          ),
        deleteAlertRule: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "deleteAlertRule", async () =>
            requireControlBridge(context).deleteAlertRule(
              validateId(args.id, "alert rule id"),
              await authContext(context),
            ),
          ),
        createAlertSilence: async (_parent, args: { input: CreateAlertSilenceInput }, context) =>
          logGraphQLOperation(context, "createAlertSilence", async () =>
            requireControlBridge(context).createAlertSilence(
              validateCreateAlertSilenceInput(args.input),
              await authContext(context),
            ),
          ),
        deleteAlertSilence: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "deleteAlertSilence", async () =>
            requireControlBridge(context).deleteAlertSilence(
              validateId(args.id, "alert silence id"),
              await authContext(context),
            ),
          ),
        createDataset: async (_parent, args: { input: CreateDatasetInput }, context) =>
          logGraphQLOperation(context, "createDataset", async () =>
            requireAiEvalBridge(context).createDataset(
              validateCreateDatasetInput(args.input),
              await authContext(context),
            ),
          ),
        appendDatasetItems: async (_parent, args: { input: AppendDatasetItemsInput }, context) =>
          logGraphQLOperation(context, "appendDatasetItems", async () =>
            requireAiEvalBridge(context).appendDatasetItems(
              validateAppendDatasetItemsInput(args.input),
              await authContext(context),
            ),
          ),
        prepareDatasetImport: async (
          _parent,
          args: { input: PrepareDatasetImportInput },
          context,
        ) =>
          logGraphQLOperation(context, "prepareDatasetImport", async () =>
            requireAiEvalBridge(context).prepareDatasetImport(
              validatePrepareDatasetImportInput(args.input),
              await authContext(context),
            ),
          ),
        commitDatasetImport: async (_parent, args: { input: CommitDatasetImportInput }, context) =>
          logGraphQLOperation(context, "commitDatasetImport", async () =>
            requireAiEvalBridge(context).commitDatasetImport(
              validateCommitDatasetImportInput(args.input),
              await authContext(context),
            ),
          ),
        startDatasetExport: async (_parent, args: { input: StartDatasetExportInput }, context) =>
          logGraphQLOperation(context, "startDatasetExport", async () =>
            requireAiEvalBridge(context).startDatasetExport(
              validateStartDatasetExportInput(args.input),
              await authContext(context),
            ),
          ),
        promoteSpanToDatasetItem: async (
          _parent,
          args: { input: PromoteSpanToDatasetItemInput },
          context,
        ) =>
          logGraphQLOperation(context, "promoteSpanToDatasetItem", async () =>
            requireAiEvalBridge(context).promoteSpanToDatasetItem(
              validatePromoteSpanToDatasetItemInput(args.input),
              await authContext(context),
            ),
          ),
        createScorer: async (_parent, args: { input: CreateScorerInput }, context) =>
          logGraphQLOperation(context, "createScorer", async () =>
            requireAiEvalBridge(context).createScorer(
              validateCreateScorerInput(args.input),
              await authContext(context),
            ),
          ),
        createExperiment: async (_parent, args: { input: CreateExperimentInput }, context) =>
          logGraphQLOperation(context, "createExperiment", async () =>
            requireAiEvalBridge(context).createExperiment(
              validateCreateExperimentInput(args.input),
              await authContext(context),
            ),
          ),
        startExperimentRun: async (_parent, args: { input: StartExperimentRunInput }, context) =>
          logGraphQLOperation(context, "startExperimentRun", async () =>
            requireAiEvalBridge(context).startExperimentRun(
              validateStartExperimentRunInput(args.input),
              await authContext(context),
            ),
          ),
        cancelExperimentRun: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "cancelExperimentRun", async () =>
            requireAiEvalBridge(context).cancelExperimentRun(
              validateId(args.id, "experiment run id"),
              await authContext(context),
            ),
          ),
        startOptimizationRun: async (
          _parent,
          args: { input: StartOptimizationRunInput },
          context,
        ) =>
          logGraphQLOperation(context, "startOptimizationRun", async () =>
            requireAiEvalBridge(context).startOptimizationRun(
              validateStartOptimizationRunInput(args.input),
              await authContext(context),
            ),
          ),
        promotePromptVersion: async (
          _parent,
          args: { input: PromotePromptVersionInput },
          context,
        ) =>
          logGraphQLOperation(context, "promotePromptVersion", async () =>
            requireAiEvalBridge(context).promotePromptVersion(
              validatePromotePromptVersionInput(args.input),
              await authContext(context),
            ),
          ),
        resolveAnnotation: async (_parent, args: { input: ResolveAnnotationInput }, context) =>
          logGraphQLOperation(context, "resolveAnnotation", async () =>
            requireAiEvalBridge(context).resolveAnnotation(
              validateResolveAnnotationInput(args.input),
              await authContext(context),
            ),
          ),
        updateProjectAiSettings: async (
          _parent,
          args: { input: UpdateProjectAiSettingsInput },
          context,
        ) =>
          logGraphQLOperation(context, "updateProjectAiSettings", async () =>
            requireAiEvalBridge(context).updateProjectAiSettings(
              validateUpdateProjectAiSettingsInput(args.input),
              await authContext(context),
            ),
          ),
      },
      Dataset: {
        items: async (parent: Dataset, args: { input?: DatasetItemSearchInput }, context) =>
          logGraphQLOperation(context, "dataset.items", async () =>
            requireAiEvalBridge(context).datasetItems(
              validateId(parent.id, "dataset id"),
              validateDatasetItemSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
      },
      Experiment: {
        runs: async (parent: Experiment, _args: unknown, context) =>
          logGraphQLOperation(context, "experiment.runs", async () =>
            requireAiEvalBridge(context).experimentRuns(
              validateId(parent.id, "experiment id"),
              await authContext(context),
            ),
          ),
      },
      ExperimentRun: {
        itemRuns: async (
          parent: ExperimentRun,
          args: { input?: DatasetItemSearchInput },
          context,
        ) =>
          logGraphQLOperation(context, "experimentRun.itemRuns", async () =>
            requireAiEvalBridge(context).datasetItemRuns(
              validateId(parent.id, "experiment run id"),
              validateDatasetItemSearchInput(args.input ?? {}),
              await authContext(context),
            ),
          ),
      },
      Subscription: {
        liveTraces: {
          subscribe: (_parent, args: { input?: LiveTraceInput }, context) =>
            logGraphQLOperation(context, "liveTraces", async () => {
              const auth = await authContext(context);
              requireScopes(auth, ["telemetry:read", "telemetry:live"]);
              return context.hono
                .get("bridge")
                .subscribeLiveTraces(validateLiveTraceInput(args.input ?? {}), auth);
            }),
          resolve: (event: unknown) => event,
        },
        liveExperimentRun: {
          subscribe: (_parent, args: { input: LiveExperimentRunInput }, context) =>
            logGraphQLOperation(context, "liveExperimentRun", async () => {
              const auth = await authContext(context);
              requireScopes(auth, ["telemetry:read", "telemetry:live"]);
              return requireAiEvalBridge(context).subscribeLiveExperimentRun(
                validateLiveExperimentRunInput(args.input),
                auth,
              );
            }),
          resolve: (event: unknown) => event,
        },
      },
    },
  });
}

async function authContext(context: CloudGridYogaContext): Promise<NormalizedAuthContext> {
  return context.authContext ?? localAuthContext();
}

function requireControlBridge(context: CloudGridYogaContext): ControlPlaneBridge {
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

function requireMetricQueryBridge(context: CloudGridYogaContext): MetricQueryBridge {
  const bridge = context.hono.get("bridge");
  if (!bridge.metricNames || !bridge.metricSeries) {
    throw authGraphQLError("ERR-016");
  }
  return bridge as TelemetryQueryBridge & MetricQueryBridge;
}

function requireAiEvalBridge(context: CloudGridYogaContext): AiEvalBridge {
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

async function logGraphQLOperation<T>(
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
    context.logger.info("graphql_operation_completed", {
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

function parseLiteral(ast: Parameters<NonNullable<GraphQLScalarType["parseLiteral"]>>[0]): unknown {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.NULL:
      return null;
    case Kind.LIST:
      return ast.values.map((value) => parseLiteral(value));
    case Kind.OBJECT:
      return Object.fromEntries(
        ast.fields.map((field) => [field.name.value, parseLiteral(field.value)]),
      );
    default:
      return null;
  }
}
