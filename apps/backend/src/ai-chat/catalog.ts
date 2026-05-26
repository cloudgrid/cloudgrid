import type { CloudGridErrorId } from "@cloudgrid/runtime";
import type { ModelProvider } from "@purista/harness";
import { anthropic } from "@purista/harness-anthropic";
import { azureFoundry } from "@purista/harness-azure-foundry";
import { bedrock } from "@purista/harness-bedrock";
import { openai } from "@purista/harness-openai";

type AiChatCapability = "text_stream" | "tool_use" | "object" | "embeddings" | "rerank";
type AiChatProviderKind =
  | "openai"
  | "openai_compatible"
  | "anthropic"
  | "azure_foundry"
  | "aws_bedrock";
type AiChatToolOwner =
  | "storage-read"
  | "control-plane"
  | "sandbox"
  | "renderer"
  | "action"
  | "conversation"
  | "analysis";
type AiChatInjectedField = "companyId" | "projectId" | "userId" | "conversationId" | "authContext";
type AiChatRisk = "low" | "medium" | "high" | "destructive";
type AiChatApprovalBehavior = "none" | "approval_required" | "destructive_confirmation";
type AiChatPermission = "read" | "list" | "grep";

interface JsonSchemaObject {
  type?: string | string[];
  additionalProperties?: boolean | JsonSchemaObject;
  properties?: Record<string, JsonSchemaObject>;
  required?: readonly string[];
  enum?: readonly string[];
  items?: JsonSchemaObject;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export interface AiChatModelAlias {
  id: "chat_reasoning" | "structured_reasoning" | "embedding" | "rerank";
  usedBy: readonly string[];
  capabilities: readonly AiChatCapability[];
  notes: string;
}

export interface AiChatToolCatalogEntry {
  id: string;
  owner: AiChatToolOwner;
  modelInputSchema: JsonSchemaObject;
  injectedFields: readonly AiChatInjectedField[];
  backendPath: string;
  defaultWindow?: string;
  defaultLimit?: number | string;
  hardLimit?: number | string;
  resultEnvelope: readonly string[];
  streamLabel: string;
  errors: Partial<
    Record<"validation" | "auth" | "timeout" | "limit" | "sandbox" | "backend", CloudGridErrorId>
  >;
}

export interface AiChatRendererCatalogEntry {
  key: string;
  schemaRef: string;
}

export interface AiChatActionCatalogEntry {
  kind: string;
  binding: string;
  risk: AiChatRisk;
  redactionRule: string;
  requiredVersionFields: readonly string[];
  approvalBehavior: AiChatApprovalBehavior;
}

export interface AiChatSkillCatalogEntry {
  name: string;
  allowedAgents: readonly string[];
  permissions: readonly AiChatPermission[];
}

export interface AiChatBudgets {
  maxToolCallsPerRun: number;
  maxJsonRenderArtifactsPerRun: number;
  maxActionApprovalArtifactsPerPendingAction: number;
  inlineToolResultMaxBytes: number;
  renderSpecMaxBytes: number;
  embeddedTableRows: number;
  chartPoints: number;
  logListRows: number;
  traceWaterfallSpans: number;
  traceDetailSpans: number;
  searchTraceDefaultLimit: number;
  searchTraceHardLimit: number;
  searchLogDefaultLimit: number;
  searchLogHardLimit: number;
  aiEvalSearchDefaultLimit: number;
  aiEvalSearchHardLimit: number;
  alertHistoryDefaultLimit: number;
  alertHistoryHardLimit: number;
  sandboxScriptWallClockMs: number;
  sandboxScriptCpuMs: number;
  sandboxScriptMemoryBytes: number;
  sandboxMaxInputBytes: number;
  sandboxMaxOutputFileBytes: number;
  sandboxMaxRetainedArtifactBytes: number;
  contextCompactionMessageThreshold: number;
  contextCompactionInputBudgetRatio: number;
}

export const AI_CHAT_MODEL_ALIASES = {
  chat_reasoning: {
    id: "chat_reasoning",
    usedBy: ["agent.main_chat", "workflow.compact_conversation"],
    capabilities: ["object", "tool_use"],
    notes: "Runs the main CloudGrid AI Chat agent loop with typed tool calls.",
  },
  structured_reasoning: {
    id: "structured_reasoning",
    usedBy: [
      "agent.trace_analyst",
      "agent.logs_analyst",
      "agent.metrics_analyst",
      "agent.ai_eval_analyst",
    ],
    capabilities: ["object", "tool_use"],
    notes: "Returns validated specialist analysis and action/render intents.",
  },
  embedding: {
    id: "embedding",
    usedBy: ["future.retrieval"],
    capabilities: ["embeddings"],
    notes: "Reserved for future retrieval workflows; not used for v1 telemetry reads.",
  },
  rerank: {
    id: "rerank",
    usedBy: ["future.evidence_ranking"],
    capabilities: ["rerank"],
    notes: "Reserved for ranking already-authorized evidence.",
  },
} as const satisfies Record<string, AiChatModelAlias>;

const scopeInjectedFields = [
  "companyId",
  "projectId",
  "userId",
  "conversationId",
  "authContext",
] as const;
const defaultResultEnvelope = [
  "evidenceId",
  "summary",
  "rowCount",
  "sample",
  "fileRef",
  "routeLinks",
  "warnings",
] as const;
const readErrors = {
  validation: "ERR-001",
  auth: "ERR-016",
  timeout: "ERR-012",
  limit: "ERR-AIC-004",
  backend: "ERR-013",
} as const;
const modelObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
  required: [],
} as const;

export const AI_CHAT_TOOLS = [
  tool(
    "telemetry.searchTraces",
    "storage-read",
    "Query.traces / storage-read trace search",
    "Searching traces",
    {
      defaultWindow: "PT1H",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool(
    "telemetry.getTrace",
    "storage-read",
    "Query.trace / storage-read trace detail",
    "Loading trace",
    {
      hardLimit: 5000,
    },
  ),
  tool(
    "telemetry.searchLogs",
    "storage-read",
    "Query.logs / storage-read log search",
    "Searching logs",
    {
      defaultWindow: "PT1H",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool(
    "telemetry.queryMetrics",
    "storage-read",
    "Query.metricSeries or Query.richMetricSeries",
    "Querying metrics",
    {
      defaultWindow: "PT1H",
      defaultLimit: "storage-read default step",
      hardLimit: 5000,
    },
  ),
  tool("telemetry.getFacets", "storage-read", "Query.telemetryFacets", "Loading facets", {
    defaultWindow: "PT1H",
    defaultLimit: 25,
    hardLimit: 200,
  }),
  tool("dashboards.list", "control-plane", "Query.dashboards", "Loading dashboards"),
  tool("alerts.list", "control-plane", "Query.alertRules", "Loading alerts"),
  tool("alerts.history", "control-plane", "Query.alertHistory", "Loading alert history", {
    defaultWindow: "P1D",
    defaultLimit: 50,
    hardLimit: 200,
  }),
  tool(
    "aiEval.searchAgentRuns",
    "storage-read",
    "AI Eval GraphQL agent run search",
    "Searching AI Eval runs",
    {
      defaultWindow: "P7D",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool(
    "aiEval.searchDatasets",
    "control-plane",
    "AI Eval GraphQL dataset search",
    "Searching datasets",
    {
      defaultWindow: "P7D",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool(
    "aiEval.searchScorers",
    "control-plane",
    "AI Eval GraphQL scorer search",
    "Searching scorers",
    {
      defaultWindow: "P7D",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool(
    "aiEval.searchExperiments",
    "control-plane",
    "AI Eval GraphQL experiment search",
    "Searching experiments",
    {
      defaultWindow: "P7D",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool(
    "aiEval.searchEvalResults",
    "storage-read",
    "AI Eval GraphQL result search",
    "Searching eval results",
    {
      defaultWindow: "P7D",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool(
    "aiEval.qualityOverview",
    "storage-read",
    "AI Eval GraphQL quality overview",
    "Loading AI Eval quality",
    {
      defaultWindow: "P7D",
      defaultLimit: 50,
      hardLimit: 200,
    },
  ),
  tool("project.get", "control-plane", "Query.viewer selected project", "Loading project"),
  analysisTool("analysis.summarizeTrace", "Summarizing trace"),
  analysisTool("analysis.summarizeLogs", "Summarizing logs"),
  analysisTool("analysis.summarizeMetrics", "Summarizing metrics"),
  analysisTool("analysis.summarizeAiEval", "Summarizing AI Eval evidence"),
  tool("sandbox.writeDataFile", "sandbox", "sandbox.writeDataFile", "Writing data file", {
    errors: { ...readErrors, sandbox: "ERR-AIC-002" },
  }),
  tool("sandbox.readFile", "sandbox", "sandbox.readFile", "Reading sandbox file", {
    errors: { ...readErrors, sandbox: "ERR-AIC-002" },
  }),
  tool("sandbox.writeScript", "sandbox", "sandbox.writeScript", "Writing script", {
    errors: { ...readErrors, sandbox: "ERR-AIC-002" },
  }),
  tool("sandbox.runScript", "sandbox", "sandbox.runScript", "Running script", {
    errors: { ...readErrors, sandbox: "ERR-AIC-002" },
  }),
  tool("sandbox.listFiles", "sandbox", "sandbox.listFiles", "Listing sandbox files", {
    errors: { ...readErrors, sandbox: "ERR-AIC-002" },
  }),
  tool("render.emitJsonRender", "renderer", "AI Chat JSON-render validator", "Creating artifact", {
    errors: { ...readErrors, validation: "ERR-AIC-005" },
  }),
  tool("action.propose", "action", "AI Chat action proposal whitelist", "Preparing action", {
    errors: { ...readErrors, validation: "ERR-AIC-003" },
  }),
  tool(
    "conversation.compact",
    "conversation",
    "workflow.compact_conversation",
    "Compacting conversation",
  ),
] as const satisfies readonly AiChatToolCatalogEntry[];

export const AI_CHAT_RENDERERS = [
  "metric_timeseries",
  "metric_bar",
  "table",
  "key_value",
  "trace_waterfall",
  "log_list",
  "mermaid",
  "json_tree",
  "diff",
  "status_summary",
  "action_approval",
].map((key) => ({
  key,
  schemaRef: "specs/03-contracts/entities/ai/json-render-catalog.schema.json",
})) as readonly AiChatRendererCatalogEntry[];

export const AI_CHAT_ACTIONS = [
  action("dashboard.save", "Mutation.saveDashboard", "medium"),
  action("dashboard.delete", "Mutation.deleteDashboard", "destructive"),
  action("dashboard.pin", "Mutation.setDashboardPinned", "low"),
  action("dashboard.reorder_pins", "Mutation.reorderDashboardPins", "low"),
  action("alert.create", "Mutation.createAlertRule", "medium"),
  action("alert.update", "Mutation.updateAlertRule", "medium"),
  action("alert.delete", "Mutation.deleteAlertRule", "destructive"),
  action("alert.silence_create", "Mutation.createAlertSilence", "medium"),
  action("alert.silence_delete", "Mutation.deleteAlertSilence", "destructive"),
  action("dataset.create", "Mutation.createDataset", "medium"),
  action("dataset.items_append", "Mutation.appendDatasetItems", "medium"),
  action("dataset.item_promote", "Mutation.promoteSpanToDatasetItem", "medium"),
  action("scorer.create", "Mutation.createScorer", "medium"),
  action("experiment.create", "Mutation.createExperiment", "medium"),
  action("experiment.start", "Mutation.startExperimentRun", "medium"),
  action("experiment.cancel", "Mutation.cancelExperimentRun", "medium"),
  action("optimization.start", "Mutation.startOptimizationRun", "medium"),
  action("prompt.promote", "Mutation.promotePromptVersion", "high"),
  action("annotation.resolve", "Mutation.resolveAnnotation", "medium"),
  action("retention.update", "Mutation.updateRetentionPolicy", "high"),
  action("ingest_credential.revoke", "Mutation.revokeIngestCredential", "destructive"),
  action("project.update", "Mutation.updateProject", "high"),
  action("project_member.invite", "Mutation.inviteProjectMember", "high"),
  action("project_member.update", "Mutation.updateProjectMember", "high"),
  action("project_member.remove", "Mutation.removeProjectMember", "destructive"),
  action("organization_member.invite", "Mutation.inviteOrganizationMember", "high"),
  action("organization_member.update", "Mutation.updateOrganizationMember", "high"),
  action("organization_member.remove", "Mutation.removeOrganizationMember", "destructive"),
  action("organization_invitation.resend", "Mutation.resendOrganizationInvitation", "high"),
  action("organization_invitation.revoke", "Mutation.revokeOrganizationInvitation", "destructive"),
  action("provider.project_update", "Mutation.updateProjectAiProviderSettings", "high"),
  action("provider.company_update", "Mutation.updateCompanyAiProviderSettings", "high"),
  action("ai_eval.settings_update", "Mutation.updateProjectAiSettings", "high"),
] as const satisfies readonly AiChatActionCatalogEntry[];

export const AI_CHAT_SKILLS = [
  skill("cloudgrid-trace-investigation", ["trace_analyst", "main_chat"]),
  skill("cloudgrid-logs-investigation", ["logs_analyst", "main_chat"]),
  skill("cloudgrid-metrics-investigation", ["metrics_analyst", "main_chat"]),
  skill("cloudgrid-ai-eval-investigation", ["ai_eval_analyst", "main_chat"]),
  skill("cloudgrid-json-render-artifacts", [
    "main_chat",
    "trace_analyst",
    "logs_analyst",
    "metrics_analyst",
    "ai_eval_analyst",
  ]),
] as const satisfies readonly AiChatSkillCatalogEntry[];

export const AI_CHAT_BUDGETS = {
  maxToolCallsPerRun: 24,
  maxJsonRenderArtifactsPerRun: 12,
  maxActionApprovalArtifactsPerPendingAction: 1,
  inlineToolResultMaxBytes: 64 * 1024,
  renderSpecMaxBytes: 512 * 1024,
  embeddedTableRows: 500,
  chartPoints: 5000,
  logListRows: 200,
  traceWaterfallSpans: 5000,
  traceDetailSpans: 5000,
  searchTraceDefaultLimit: 50,
  searchTraceHardLimit: 200,
  searchLogDefaultLimit: 100,
  searchLogHardLimit: 1000,
  aiEvalSearchDefaultLimit: 50,
  aiEvalSearchHardLimit: 200,
  alertHistoryDefaultLimit: 50,
  alertHistoryHardLimit: 200,
  sandboxScriptWallClockMs: 15_000,
  sandboxScriptCpuMs: 5_000,
  sandboxScriptMemoryBytes: 256 * 1024 * 1024,
  sandboxMaxInputBytes: 100 * 1024 * 1024,
  sandboxMaxOutputFileBytes: 25 * 1024 * 1024,
  sandboxMaxRetainedArtifactBytes: 50 * 1024 * 1024,
  contextCompactionMessageThreshold: 40,
  contextCompactionInputBudgetRatio: 0.7,
} as const satisfies AiChatBudgets;

export const AI_CHAT_PROVIDER_ADAPTERS = {
  openai: { packageName: "@purista/harness-openai", supportsBaseUrl: false, factory: openai },
  openai_compatible: {
    packageName: "@purista/harness-openai",
    supportsBaseUrl: true,
    factory: openai,
  },
  anthropic: {
    packageName: "@purista/harness-anthropic",
    supportsBaseUrl: false,
    factory: anthropic,
  },
  azure_foundry: {
    packageName: "@purista/harness-azure-foundry",
    supportsBaseUrl: true,
    factory: azureFoundry,
  },
  aws_bedrock: {
    packageName: "@purista/harness-bedrock",
    supportsBaseUrl: false,
    factory: bedrock,
  },
} as const;

export type AiChatCatalogSnapshot = {
  modelAliases: typeof AI_CHAT_MODEL_ALIASES;
  tools: typeof AI_CHAT_TOOLS;
  renderers: typeof AI_CHAT_RENDERERS;
  actions: typeof AI_CHAT_ACTIONS;
  skills: typeof AI_CHAT_SKILLS;
  budgets: typeof AI_CHAT_BUDGETS;
};

export const AI_CHAT_CATALOG = {
  modelAliases: AI_CHAT_MODEL_ALIASES,
  tools: AI_CHAT_TOOLS,
  renderers: AI_CHAT_RENDERERS,
  actions: AI_CHAT_ACTIONS,
  skills: AI_CHAT_SKILLS,
  budgets: AI_CHAT_BUDGETS,
} as const satisfies AiChatCatalogSnapshot;

export function createAiChatProviderAdapter(options: {
  providerKind: string;
  apiKey: string;
  baseUrl?: string | null;
  region?: string | null;
}): ModelProvider {
  switch (options.providerKind as AiChatProviderKind) {
    case "openai":
      return AI_CHAT_PROVIDER_ADAPTERS.openai.factory({ apiKey: options.apiKey });
    case "openai_compatible":
      if (!options.baseUrl) {
        throw new Error("OpenAI-compatible AI Chat providers require baseUrl");
      }
      return AI_CHAT_PROVIDER_ADAPTERS.openai_compatible.factory({
        apiKey: options.apiKey,
        baseURL: options.baseUrl,
      });
    case "anthropic":
      return AI_CHAT_PROVIDER_ADAPTERS.anthropic.factory({ apiKey: options.apiKey });
    case "azure_foundry":
      if (!options.baseUrl) {
        throw new Error("Azure AI Foundry providers require baseUrl");
      }
      return AI_CHAT_PROVIDER_ADAPTERS.azure_foundry.factory({
        endpoint: options.baseUrl,
        apiKey: options.apiKey,
      });
    case "aws_bedrock":
      if (!options.region) {
        throw new Error("AWS Bedrock providers require region");
      }
      return AI_CHAT_PROVIDER_ADAPTERS.aws_bedrock.factory({
        region: options.region,
      });
    default:
      throw new Error(
        `Unsupported AI Chat provider kind for installed PURISTA harness adapters: ${options.providerKind}`,
      );
  }
}

export function aiChatToolById(id: string): AiChatToolCatalogEntry | undefined {
  return AI_CHAT_TOOLS.find((toolEntry) => toolEntry.id === id);
}

function tool(
  id: string,
  owner: AiChatToolOwner,
  backendPath: string,
  streamLabel: string,
  options: Partial<
    Pick<AiChatToolCatalogEntry, "defaultWindow" | "defaultLimit" | "hardLimit" | "errors">
  > = {},
): AiChatToolCatalogEntry {
  return {
    id,
    owner,
    modelInputSchema: modelObjectSchema,
    injectedFields: scopeInjectedFields,
    backendPath,
    ...(options.defaultWindow ? { defaultWindow: options.defaultWindow } : {}),
    ...(options.defaultLimit ? { defaultLimit: options.defaultLimit } : {}),
    ...(options.hardLimit ? { hardLimit: options.hardLimit } : {}),
    resultEnvelope: defaultResultEnvelope,
    streamLabel,
    errors: options.errors ?? readErrors,
  };
}

function analysisTool(id: string, streamLabel: string): AiChatToolCatalogEntry {
  return tool(id, "analysis", "typed specialist analysis workflow", streamLabel);
}

function action(kind: string, binding: string, risk: AiChatRisk): AiChatActionCatalogEntry {
  return {
    kind,
    binding,
    risk,
    redactionRule: "redacted structured inputPreview only",
    requiredVersionFields: risk === "low" ? [] : ["targetId", "version"],
    approvalBehavior:
      risk === "low"
        ? "none"
        : risk === "destructive"
          ? "destructive_confirmation"
          : "approval_required",
  };
}

function skill(name: string, allowedAgents: readonly string[]): AiChatSkillCatalogEntry {
  return {
    name,
    allowedAgents,
    permissions: ["read", "list", "grep"],
  };
}
