import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type AuthRuntimeConfig,
  type CloudGridLogger,
  createProblemDetails,
  createLogger,
} from "@cloudgrid/runtime";
import type {
  AgentRunSearchInput,
  AiQualityOverviewInput,
  AiChatHistoryInput,
  AnnotationQueueSearchInput,
  AppendDatasetItemsInput,
  ApproveAiChatActionInput,
  CommitDatasetImportInput,
  CreateAiChatConversationInput,
  CreateDatasetInput,
  CreateExperimentInput,
  CreateScorerInput,
  Dataset,
  DatasetItemSearchInput,
  DatasetSearchInput,
  EvalResultSearchInput,
  Experiment,
  ExperimentRun,
  ExperimentSearchInput,
  LiveExperimentRunInput,
  PrepareDatasetImportInput,
  PromotePromptVersionInput,
  PromoteSpanToDatasetItemInput,
  ResolveAnnotationInput,
  ScorerSearchInput,
  StartDatasetExportInput,
  StartExperimentRunInput,
  StartOptimizationRunInput,
  UpdateCompanyAiProviderSettingsInput,
  UpdateProjectAiProviderSettingsInput,
  UpdateProjectAiSettingsInput,
} from "@cloudgrid/ui-contracts";
import {
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  GraphQLScalarType,
  Kind,
  parse,
  type SelectionNode,
} from "graphql";
import { createSchema, createYoga } from "graphql-yoga";
import { Hono } from "hono";
import {
  type AuthProviderFixture,
  CloudGridAuthService,
  type NormalizedAuthContext,
  requireScopes,
} from "./auth";
import { attachAiChatStreamRoutes, type AiChatHarnessPort } from "./ai-chat-stream";
import { createAiChatHarness } from "./ai-chat-harness";
import {
  type AiEvalBridge,
  type ControlPlaneBridge,
  createNATSTelemetryQueryBridge,
  type MetricQueryBridge,
  type TelemetryQueryBridge,
} from "./bridge";
import { loadConfig } from "./config";
import { attachDatasetTransferRoutes } from "./dataset-transfer";
import type { GraphQLMetricsRecorder } from "./graphql-metrics";
import { healthResponse } from "./health";
import {
  OTLPSelfObservabilityExporter,
  type SelfObservabilityLogRecorder,
  type SelfObservabilityTraceRecorder,
} from "./self-observability";
import { attachStaticRoutes } from "./static";
import { controlPlaneResolvers } from "./graphql/resolvers/control-plane";
import {
  authContext,
  logGraphQLOperation,
  requireAiChatControlBridge,
  requireAiEvalBridge,
} from "./graphql/resolvers/context";
import { dashboardResolvers } from "./graphql/resolvers/dashboards";
import { metricsResolvers } from "./graphql/resolvers/metrics";
import { telemetryResolvers } from "./graphql/resolvers/telemetry";
import {
  validateAgentRunSearchInput,
  validateAiQualityOverviewInput,
  validateAiChatHistoryInput,
  validateAnnotationQueueSearchInput,
  validateAppendDatasetItemsInput,
  validateApproveAiChatActionInput,
  validateCommitDatasetImportInput,
  validateCreateAiChatConversationInput,
  validateCreateDatasetInput,
  validateCreateExperimentInput,
  validateCreateScorerInput,
  validateDatasetItemSearchInput,
  validateDatasetSearchInput,
  validateEvalResultSearchInput,
  validateExperimentSearchInput,
  validateId,
  validateLiveExperimentRunInput,
  validatePrepareDatasetImportInput,
  validatePromotePromptVersionInput,
  validatePromoteSpanToDatasetItemInput,
  validateResolveAnnotationInput,
  validateScorerSearchInput,
  validateStartDatasetExportInput,
  validateStartExperimentRunInput,
  validateStartOptimizationRunInput,
  validateUpdateCompanyAiProviderSettingsInput,
  validateUpdateProjectAiProviderSettingsInput,
  validateUpdateProjectAiSettingsInput,
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
  graphqlMaxDepth?: number;
  graphqlMaxComplexity?: number;
  graphqlResponseMediaType?: "compatible" | "graphql-response-json";
  auth?: AuthRuntimeConfig;
  authProvider?: AuthProviderFixture;
  authFetch?: typeof fetch;
  frontendServeStatic?: boolean;
  frontendStaticDir?: string;
  datasetTransferDir?: string;
  metricsRecorder?: GraphQLMetricsRecorder;
  traceRecorder?: SelfObservabilityTraceRecorder;
  logRecorder?: SelfObservabilityLogRecorder;
  aiChatHarness?: AiChatHarnessPort;
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
  const aiChatHarness = createAiChatHarness(config.aiChatHarnessMode);
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
      {
        ...config,
        ...(aiChatHarness ? { aiChatHarness } : {}),
        ...(selfObservability
          ? {
              metricsRecorder: selfObservability,
              traceRecorder: selfObservability,
              logRecorder: selfObservability,
            }
          : {}),
      },
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
  attachAiChatStreamRoutes(app, { harness: config.aiChatHarness });

  type YogaContext = CloudGridYogaContext;

  const yoga = createYoga<YogaContext>({
    graphqlEndpoint: "/graphql",
    schema: createCloudGridSchema(),
    graphiql: config.graphqlUI,
    context: ({ request }) => ({
      request,
      requestId: crypto.randomUUID(),
      logger,
      metricsRecorder: config.metricsRecorder,
      traceRecorder: config.traceRecorder,
      logRecorder: config.logRecorder,
      authContext: auth.authenticateRequest(request),
    }),
  });

  app.on(["GET", "POST", "OPTIONS"], "/graphql", async (context) => {
    const request = context.req.raw;
    const preflightResponse = await validateGraphQLRequestBounds(request, {
      maxDepth: config.graphqlMaxDepth ?? 12,
      maxComplexity: config.graphqlMaxComplexity ?? 500,
      responseMediaType: config.graphqlResponseMediaType ?? "compatible",
    });
    if (preflightResponse) {
      return preflightResponse;
    }
    const response = await yoga.handle(request, { hono: context });
    return normalizeGraphQLResponseMediaType(
      response,
      config.graphqlResponseMediaType ?? "compatible",
    );
  });

  attachStaticRoutes(
    app,
    {
      frontendServeStatic: config.frontendServeStatic ?? false,
      frontendStaticDir: config.frontendStaticDir ?? "./apps/backend/public",
    },
    auth,
  );

  return { app, bridge, auth };
}

interface CloudGridHonoGetter {
  get(key: "auth"): CloudGridAuthService;
  get(key: "bridge"): AppBridge;
}

export type CloudGridYogaContext = {
  hono: CloudGridHonoGetter;
  request?: Request;
  requestId: string;
  logger: CloudGridLogger;
  metricsRecorder?: GraphQLMetricsRecorder;
  traceRecorder?: SelfObservabilityTraceRecorder;
  logRecorder?: SelfObservabilityLogRecorder;
  authContext?: Promise<NormalizedAuthContext> | NormalizedAuthContext;
};

interface GraphQLRequestBounds {
  maxDepth: number;
  maxComplexity: number;
  responseMediaType: "compatible" | "graphql-response-json";
}

async function validateGraphQLRequestBounds(
  request: Request,
  bounds: GraphQLRequestBounds,
): Promise<Response | undefined> {
  if (request.method === "OPTIONS") {
    return undefined;
  }
  const operation = await readGraphQLOperation(request);
  if (!operation?.query) {
    return undefined;
  }

  let document: DocumentNode;
  try {
    document = parse(operation.query);
  } catch {
    return undefined;
  }

  const depth = graphQLOperationDepth(document, operation.operationName);
  if (depth > bounds.maxDepth) {
    return graphQLValidationResponse(
      `GraphQL operation depth ${depth} exceeds configured maximum ${bounds.maxDepth}`,
      bounds.responseMediaType,
    );
  }

  const complexity = graphQLOperationComplexity(document, operation.operationName);
  if (complexity > bounds.maxComplexity) {
    return graphQLValidationResponse(
      `GraphQL operation complexity ${complexity} exceeds configured maximum ${bounds.maxComplexity}`,
      bounds.responseMediaType,
    );
  }
  return undefined;
}

async function readGraphQLOperation(
  request: Request,
): Promise<{ query: string; operationName?: string } | undefined> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const query = url.searchParams.get("query");
    if (!query) {
      return undefined;
    }
    const operationName = url.searchParams.get("operationName");
    return operationName ? { query, operationName } : { query };
  }
  if (request.method !== "POST") {
    return undefined;
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }
  try {
    const payload = (await request.clone().json()) as unknown;
    if (
      typeof payload === "object" &&
      payload !== null &&
      "query" in payload &&
      typeof payload.query === "string"
    ) {
      if ("operationName" in payload && typeof payload.operationName === "string") {
        return { query: payload.query, operationName: payload.operationName };
      }
      return { query: payload.query };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function graphQLOperationDepth(document: DocumentNode, operationName?: string): number {
  const fragments = graphQLFragments(document);
  const operation =
    document.definitions.find(
      (definition) =>
        definition.kind === Kind.OPERATION_DEFINITION &&
        (!operationName || definition.name?.value === operationName),
    ) ?? document.definitions.find((definition) => definition.kind === Kind.OPERATION_DEFINITION);
  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
    return 0;
  }
  return selectionDepth(operation.selectionSet.selections, fragments, new Set());
}

function selectionDepth(
  selections: readonly SelectionNode[],
  fragments: Map<string, FragmentDefinitionNode>,
  seenFragments: Set<string>,
): number {
  let maxDepth = 0;
  for (const selection of selections) {
    if (selection.kind === Kind.FIELD) {
      const childDepth = selection.selectionSet
        ? selectionDepth(selection.selectionSet.selections, fragments, seenFragments)
        : 0;
      maxDepth = Math.max(maxDepth, 1 + childDepth);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      maxDepth = Math.max(
        maxDepth,
        selectionDepth(selection.selectionSet.selections, fragments, seenFragments),
      );
    } else if (
      selection.kind === Kind.FRAGMENT_SPREAD &&
      !seenFragments.has(selection.name.value)
    ) {
      const fragment = fragments.get(selection.name.value);
      if (fragment) {
        seenFragments.add(selection.name.value);
        maxDepth = Math.max(
          maxDepth,
          selectionDepth(fragment.selectionSet.selections, fragments, seenFragments),
        );
        seenFragments.delete(selection.name.value);
      }
    }
  }
  return maxDepth;
}

function graphQLOperationComplexity(document: DocumentNode, operationName?: string): number {
  const fragments = graphQLFragments(document);
  const operation =
    document.definitions.find(
      (definition) =>
        definition.kind === Kind.OPERATION_DEFINITION &&
        (!operationName || definition.name?.value === operationName),
    ) ?? document.definitions.find((definition) => definition.kind === Kind.OPERATION_DEFINITION);
  if (!operation || operation.kind !== Kind.OPERATION_DEFINITION) {
    return 0;
  }
  return selectionComplexity(operation.selectionSet.selections, fragments, new Set());
}

function selectionComplexity(
  selections: readonly SelectionNode[],
  fragments: Map<string, FragmentDefinitionNode>,
  seenFragments: Set<string>,
): number {
  let complexity = 0;
  for (const selection of selections) {
    if (selection.kind === Kind.FIELD) {
      complexity += fieldComplexity(selection, fragments, seenFragments);
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      complexity += selectionComplexity(
        selection.selectionSet.selections,
        fragments,
        seenFragments,
      );
    } else if (
      selection.kind === Kind.FRAGMENT_SPREAD &&
      !seenFragments.has(selection.name.value)
    ) {
      const fragment = fragments.get(selection.name.value);
      if (fragment) {
        seenFragments.add(selection.name.value);
        complexity += selectionComplexity(
          fragment.selectionSet.selections,
          fragments,
          seenFragments,
        );
        seenFragments.delete(selection.name.value);
      }
    }
  }
  return complexity;
}

function fieldComplexity(
  field: FieldNode,
  fragments: Map<string, FragmentDefinitionNode>,
  seenFragments: Set<string>,
): number {
  return (
    1 +
    (field.selectionSet
      ? selectionComplexity(field.selectionSet.selections, fragments, seenFragments)
      : 0)
  );
}

function graphQLFragments(document: DocumentNode): Map<string, FragmentDefinitionNode> {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
    }
  }
  return fragments;
}

function graphQLValidationResponse(
  detail: string,
  responseMediaType: GraphQLRequestBounds["responseMediaType"],
): Response {
  const problem = createProblemDetails({
    id: "ERR-001",
    code: "VALIDATION_FAILED",
    detail,
    retryable: false,
    instance: "/graphql/request/preflight",
  });
  return new Response(
    JSON.stringify({
      errors: [
        {
          message: problem.detail,
          extensions: {
            code: problem.code,
            problem,
          },
        },
      ],
    }),
    {
      status: problem.status,
      headers: {
        "content-type": graphQLContentType(responseMediaType),
      },
    },
  );
}

function normalizeGraphQLResponseMediaType(
  response: Response,
  responseMediaType: GraphQLRequestBounds["responseMediaType"],
): Response {
  if (responseMediaType !== "graphql-response-json") {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("content-type", graphQLContentType(responseMediaType));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function graphQLContentType(responseMediaType: GraphQLRequestBounds["responseMediaType"]): string {
  return responseMediaType === "graphql-response-json"
    ? "application/graphql-response+json; charset=utf-8"
    : "application/json; charset=utf-8";
}

export function createCloudGridSchema() {
  const controlPlane = controlPlaneResolvers();
  const dashboards = dashboardResolvers();
  const metrics = metricsResolvers();
  const telemetry = telemetryResolvers();
  return createSchema<CloudGridYogaContext>({
    typeDefs: readFileSync(schemaPath, "utf8"),
    resolvers: {
      JSON: JSONScalar,
      DateTime: DateTimeScalar,
      Query: {
        ...(controlPlane.Query as Record<string, unknown>),
        ...(dashboards.Query as Record<string, unknown>),
        ...(metrics.Query as Record<string, unknown>),
        ...(telemetry.Query as Record<string, unknown>),
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
        projectAiProviderSettings: async (_parent, args: { projectId: string }, context) =>
          logGraphQLOperation(context, "projectAiProviderSettings", async () =>
            requireAiChatControlBridge(context).projectAiProviderSettings(
              validateId(args.projectId, "project id"),
              await authContext(context),
            ),
          ),
        companyAiProviderSettings: async (_parent, args: { companyId: string }, context) =>
          logGraphQLOperation(context, "companyAiProviderSettings", async () =>
            requireAiChatControlBridge(context).companyAiProviderSettings(
              validateId(args.companyId, "company id"),
              await authContext(context),
            ),
          ),
        aiChatHistory: async (_parent, args: { input: AiChatHistoryInput }, context) =>
          logGraphQLOperation(context, "aiChatHistory", async () =>
            requireAiChatControlBridge(context).aiChatHistory(
              validateAiChatHistoryInput(args.input),
              await authContext(context),
            ),
          ),
        aiChatConversation: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "aiChatConversation", async () =>
            requireAiChatControlBridge(context).aiChatConversation(
              validateId(args.id, "AI Chat conversation id"),
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
        ...(controlPlane.Mutation as Record<string, unknown>),
        ...(dashboards.Mutation as Record<string, unknown>),
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
        updateProjectAiProviderSettings: async (
          _parent,
          args: { input: UpdateProjectAiProviderSettingsInput },
          context,
        ) =>
          logGraphQLOperation(context, "updateProjectAiProviderSettings", async () =>
            requireAiChatControlBridge(context).updateProjectAiProviderSettings(
              validateUpdateProjectAiProviderSettingsInput(args.input),
              await authContext(context),
            ),
          ),
        updateCompanyAiProviderSettings: async (
          _parent,
          args: { input: UpdateCompanyAiProviderSettingsInput },
          context,
        ) =>
          logGraphQLOperation(context, "updateCompanyAiProviderSettings", async () =>
            requireAiChatControlBridge(context).updateCompanyAiProviderSettings(
              validateUpdateCompanyAiProviderSettingsInput(args.input),
              await authContext(context),
            ),
          ),
        createAiChatConversation: async (
          _parent,
          args: { input: CreateAiChatConversationInput },
          context,
        ) =>
          logGraphQLOperation(context, "createAiChatConversation", async () =>
            requireAiChatControlBridge(context).createAiChatConversation(
              validateCreateAiChatConversationInput(args.input),
              await authContext(context),
            ),
          ),
        archiveAiChatConversation: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "archiveAiChatConversation", async () =>
            requireAiChatControlBridge(context).archiveAiChatConversation(
              validateId(args.id, "AI Chat conversation id"),
              await authContext(context),
            ),
          ),
        deleteAiChatConversation: async (_parent, args: { id: string }, context) =>
          logGraphQLOperation(context, "deleteAiChatConversation", async () =>
            requireAiChatControlBridge(context).deleteAiChatConversation(
              validateId(args.id, "AI Chat conversation id"),
              await authContext(context),
            ),
          ),
        approveAiChatAction: async (_parent, args: { input: ApproveAiChatActionInput }, context) =>
          logGraphQLOperation(context, "approveAiChatAction", async () =>
            requireAiChatControlBridge(context).approveAiChatAction(
              validateApproveAiChatActionInput(args.input),
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
        ...(telemetry.Subscription as Record<string, unknown>),
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
