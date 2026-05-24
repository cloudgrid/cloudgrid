import {
  type BridgeErrorLike,
  type CloudGridErrorId,
  type CloudGridLogger,
  parseWithZod,
  problemFromBridgeError,
  z,
} from "@cloudgrid/runtime";
import type {
  AgentRun,
  AgentRunSearchInput,
  AgentRunSearchResult,
  AiChatActionProposal,
  AiChatConversation,
  AiChatHistory,
  AiChatHistoryInput,
  AiChatMessagePart,
  AiChatRun,
  AiChatRunStatus,
  AiQualityOverview,
  AiQualityOverviewInput,
  CompanyAiProviderSettings,
  AlertEventConnection,
  AlertRule,
  AlertRuleSearchInput,
  AlertSilence,
  AlertSummary,
  AlertSummaryInput,
  AnnotationQueueItem,
  AnnotationQueueResult,
  AnnotationQueueSearchInput,
  AppendDatasetItemsInput,
  ApproveAiChatActionInput,
  CommitDatasetImportInput,
  CommitDatasetCandidatesInput,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateAiChatConversationInput,
  CreateDatasetInput,
  CreateEvaluationComparisonInput,
  CreateEvaluationDefinitionInput,
  CreatedIngestCredential,
  CreateExperimentInput,
  CreateIngestCredentialInput,
  CreateProjectInput,
  CreateScorerInput,
  Dashboard,
  DashboardListInput,
  DashboardListResult,
  DashboardPreferences,
  Dataset,
  DatasetCandidate,
  DatasetCandidateSearchInput,
  DatasetCandidateSearchResult,
  DatasetExportJob,
  DatasetImportJob,
  DatasetItem,
  DatasetItemRunSearchResult,
  DatasetItemSearchInput,
  DatasetItemSearchResult,
  DatasetSearchInput,
  DatasetSearchResult,
  EvalResultSearchInput,
  EvalResultSearchResult,
  EvaluationComparison,
  EvaluationComparisonSearchInput,
  EvaluationComparisonSearchResult,
  EvaluationDefinition,
  EvaluationDefinitionSearchInput,
  EvaluationDefinitionSearchResult,
  EvaluationItemRun,
  EvaluationItemRunSearchInput,
  EvaluationItemRunSearchResult,
  EvaluationResultsSearchInput,
  EvaluationRun,
  EvaluationRunControlInput,
  EvaluationRunEvent,
  EvaluationRunSearchInput,
  EvaluationRunSearchResult,
  Experiment,
  ExperimentRun,
  ExperimentRunEvent,
  ExperimentRunSearchResult,
  ExperimentSearchInput,
  ExperimentSearchResult,
  IngestCredential,
  IngestCredentialListResult,
  InviteOrganizationMemberInput,
  InviteProjectMemberInput,
  LiveExperimentRunInput,
  LiveEvaluationRunInput,
  LiveTraceEvent,
  LiveTraceInput,
  LogSearchInput,
  LogSearchResult,
  MetricNameSearchInput,
  MetricNameSearchResult,
  MetricSeriesInput,
  MetricSeriesResult,
  MetricResult,
  MetricResultSearchResult,
  OptimizationRun,
  OptimizationRunSearchInput,
  OptimizationRunSearchResult,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  PrepareDatasetImportInput,
  PrepareDatasetCandidatesInput,
  Project,
  ProjectAiProviderSettings,
  ProjectAiSettings,
  ProjectInvitationResult,
  ProjectListInput,
  ProjectMember,
  ProjectRole,
  ProjectTelemetryOverview,
  PromotePromptVersionInput,
  PromoteTargetSnapshotInput,
  PromoteSpanToDatasetItemInput,
  PromotionRecord,
  PromptVersion,
  RemoveOrganizationMemberInput,
  ReorderDashboardPinsInput,
  ResolveAnnotationInput,
  RetentionPolicy,
  RichMetricSeriesInput,
  RichMetricSeriesResult,
  SaveDashboardInput,
  Scorer,
  ScorerSearchInput,
  ScorerSearchResult,
  SetDashboardPinnedInput,
  StartDatasetExportInput,
  StartEvaluationRunInput,
  StartExperimentRunInput,
  StartOptimizationRunInput,
  TelemetryFacetInput,
  TelemetryFacetResult,
  TargetDiff,
  TargetDiffInput,
  TargetSnapshot,
  TraceDetail,
  TraceDetailInput,
  TraceSearchInput,
  TraceSearchResult,
  UpdateCompanyAiProviderSettingsInput,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectAiProviderSettingsInput,
  UpdateProjectAiSettingsInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
  UpdateEvaluationDefinitionInput,
  Viewer,
} from "@cloudgrid/ui-contracts";
import { GraphQLError } from "graphql";
import type { NormalizedAuthContext } from "./auth";
import {
  connectNATS,
  NATSBridgeLifecycle,
  NATSEphemeralPubSub,
  NATSRequestReplyClient,
} from "./bridge/adapters/nats";
import { bridgeSubjects as subjects } from "./bridge/subjects";
import { telemetryMetricPayload, telemetryQueryPayload } from "./bridge/telemetry-client";
import type {
  SelfObservabilityLogRecorder,
  SelfObservabilityTraceRecorder,
  TraceContext,
} from "./self-observability";
import { createTraceContext, traceContextToTraceParent } from "./self-observability";

interface BridgeEnvelope {
  requestId: string;
  issuedAt: string;
  authContext?: NormalizedAuthContext;
}

interface BridgeError {
  id: CloudGridErrorId;
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

interface BridgeResponse<Data> {
  requestId: string;
  ok: boolean;
  data?: Data;
  error?: BridgeError;
}

const responseContractInvalidError = {
  id: "ERR-023",
  code: "RESPONSE_CONTRACT_INVALID",
  message: "Private service response did not match the message contract",
  retryable: false,
} satisfies BridgeErrorLike;

const maxLoggedValidationIssues = 5;
const maxLoggedValidationPathDepth = 6;

export interface TelemetryQueryBridge {
  searchTraces(
    input: TraceSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceSearchResult>;
  getTraceDetail(
    traceId: string,
    input: TraceDetailInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceDetail | null>;
  searchLogs(input: LogSearchInput, authContext?: NormalizedAuthContext): Promise<LogSearchResult>;
  telemetryFacets(
    input: TelemetryFacetInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TelemetryFacetResult>;
  subscribeLiveTraces(
    input: LiveTraceInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<LiveTraceEvent>;
  health(): Promise<"ok" | "unavailable">;
  close(): Promise<void>;
}

export interface MetricQueryBridge {
  metricNames(
    input: MetricNameSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricNameSearchResult>;
  metricSeries(
    input: MetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricSeriesResult>;
  richMetricSeries(
    input: RichMetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<RichMetricSeriesResult>;
}

export interface ControlPlaneBridge {
  viewer(authContext: NormalizedAuthContext): Promise<Viewer | null>;
  organizations(authContext: NormalizedAuthContext): Promise<Organization[]>;
  organization(id: string, authContext: NormalizedAuthContext): Promise<Organization | null>;
  organizationMembers(
    organizationId: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationMember[]>;
  organizationInvitations(
    organizationId: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation[]>;
  projects(input: ProjectListInput, authContext: NormalizedAuthContext): Promise<Project[]>;
  project(id: string, authContext: NormalizedAuthContext): Promise<Project | null>;
  createProject(input: CreateProjectInput, authContext: NormalizedAuthContext): Promise<Project>;
  updateProject(
    id: string,
    input: UpdateProjectInput,
    authContext: NormalizedAuthContext,
  ): Promise<Project>;
  selectProject(id: string, authContext: NormalizedAuthContext): Promise<Viewer>;
  inviteOrganizationMember(
    input: InviteOrganizationMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation>;
  inviteProjectMember(
    input: InviteProjectMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<ProjectInvitationResult>;
  resendOrganizationInvitation(
    id: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation>;
  revokeOrganizationInvitation(
    id: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation>;
  updateOrganizationMember(
    input: UpdateOrganizationMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationMember>;
  removeOrganizationMember(
    input: RemoveOrganizationMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<boolean>;
  projectMembers(projectId: string, authContext?: NormalizedAuthContext): Promise<ProjectMember[]>;
  updateProjectMember(
    projectId: string,
    userId: string,
    role: ProjectRole,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectMember>;
  removeProjectMember(
    projectId: string,
    userId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<boolean>;
  retentionPolicy(projectId: string, authContext?: NormalizedAuthContext): Promise<RetentionPolicy>;
  updateRetentionPolicy(
    input: UpdateRetentionPolicyInput,
    authContext?: NormalizedAuthContext,
  ): Promise<RetentionPolicy>;
  alertRules(
    projectId: string,
    input?: AlertRuleSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertRule[]>;
  createAlertRule(
    input: CreateAlertRuleInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertRule>;
  updateAlertRule(
    input: UpdateAlertRuleInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertRule>;
  deleteAlertRule(id: string, authContext?: NormalizedAuthContext): Promise<boolean>;
  alertSilences(
    projectId: string,
    ruleId?: string | null,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertSilence[]>;
  createAlertSilence(
    input: CreateAlertSilenceInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertSilence>;
  deleteAlertSilence(id: string, authContext?: NormalizedAuthContext): Promise<boolean>;
  alertHistory(
    projectId: string,
    ruleId?: string | null,
    first?: number | null,
    after?: string | null,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertEventConnection>;
  alertSummary(
    projectId: string,
    input?: AlertSummaryInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertSummary>;
  ingestCredentials(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<IngestCredentialListResult>;
  createIngestCredential(
    input: CreateIngestCredentialInput,
    authContext?: NormalizedAuthContext,
  ): Promise<CreatedIngestCredential>;
  revokeIngestCredential(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<IngestCredential>;
  dashboards(
    input: DashboardListInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DashboardListResult>;
  saveDashboard(input: SaveDashboardInput, authContext?: NormalizedAuthContext): Promise<Dashboard>;
  deleteDashboard(id: string, authContext?: NormalizedAuthContext): Promise<boolean>;
  setDashboardPinned(
    input: SetDashboardPinnedInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DashboardPreferences>;
  reorderDashboardPins(
    input: ReorderDashboardPinsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DashboardPreferences>;
  projectAiProviderSettings(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiProviderSettings>;
  updateProjectAiProviderSettings(
    input: UpdateProjectAiProviderSettingsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiProviderSettings>;
  companyAiProviderSettings(
    companyId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<CompanyAiProviderSettings>;
  updateCompanyAiProviderSettings(
    input: UpdateCompanyAiProviderSettingsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<CompanyAiProviderSettings>;
  resolveAiProviderSecret?(
    credentialRef: string,
    authContext?: NormalizedAuthContext,
  ): Promise<{ credentialRef: string; value: string }>;
  aiChatHistory(
    input: AiChatHistoryInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatHistory>;
  aiChatConversation(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatConversation | null>;
  createAiChatConversation(
    input: CreateAiChatConversationInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatConversation>;
  archiveAiChatConversation(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatConversation>;
  deleteAiChatConversation(id: string, authContext?: NormalizedAuthContext): Promise<boolean>;
  approveAiChatAction(
    input: ApproveAiChatActionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatActionProposal>;
  aiChatAppendMessage(
    input: AiChatAppendMessageInput,
    authContext?: NormalizedAuthContext,
  ): Promise<void>;
  aiChatCreateRun(
    input: AiChatCreateRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatRun>;
  aiChatUpdateRun(
    input: AiChatUpdateRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatRun>;
  aiChatFinalizeRun(
    input: AiChatFinalizeRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatRun>;
  aiChatProposeAction(
    input: AiChatProposeActionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatActionProposal>;
  aiChatFinishAction(
    input: AiChatFinishActionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<void>;
  aiChatSaveCompaction(
    input: AiChatSaveCompactionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<void>;
}

export interface AiChatAppendMessageInput {
  conversationId: string;
  runId: string;
  role: "user" | "assistant" | "tool" | "system";
  parts: AiChatMessagePart[];
}

export interface AiChatCreateRunInput {
  conversationId: string;
  projectId: string;
  userId: string;
  userMessageClientId: string;
  idempotencyKey: string;
  providerKind: string;
  providerProfileId: string;
  model: string;
  traceId?: string;
}

export interface AiChatUpdateRunInput {
  runId: string;
  status: AiChatRunStatus;
  toolCallCount?: number;
  sandboxScriptCount?: number;
  artifactCount?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  estimatedCostUsd?: number;
  error?: string;
}

export interface AiChatFinalizeRunInput extends AiChatUpdateRunInput {}

export interface AiChatProposeActionInput {
  conversationId: string;
  runId: string;
  projectId: string;
  title: string;
  description?: string;
  risk: string;
  actionKind: string;
  graphqlMutation?: string;
  inputPreview: Record<string, unknown>;
  requiresApproval: boolean;
  idempotencyKey: string;
  expiresAt: string;
}

export interface AiChatFinishActionInput {
  actionProposalId: string;
  status: string;
  result?: Record<string, unknown>;
}

export interface AiChatSaveCompactionInput {
  conversationId: string;
  sourceMessageCount: number;
  summary: string;
  retainedMessageIds: string[];
  artifactSummaries: string[];
  pendingActionIds: string[];
}

export interface AiEvalBridge {
  agentRuns(
    input: AgentRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AgentRunSearchResult>;
  agentRun(id: string, authContext?: NormalizedAuthContext): Promise<AgentRun | null>;
  datasets(
    input: DatasetSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetSearchResult>;
  dataset(id: string, authContext?: NormalizedAuthContext): Promise<Dataset | null>;
  datasetImport(id: string, authContext?: NormalizedAuthContext): Promise<DatasetImportJob | null>;
  datasetExport(id: string, authContext?: NormalizedAuthContext): Promise<DatasetExportJob | null>;
  datasetItems(
    datasetId: string,
    input: DatasetItemSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItemSearchResult>;
  datasetCandidates(
    input: DatasetCandidateSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetCandidateSearchResult>;
  scorers(
    input: ScorerSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ScorerSearchResult>;
  experiments(
    input: ExperimentSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentSearchResult>;
  experimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun | null>;
  experimentRuns(
    experimentId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRunSearchResult>;
  datasetItemRuns(
    experimentRunId: string,
    input: DatasetItemSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItemRunSearchResult>;
  evalResults(
    input: EvalResultSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvalResultSearchResult>;
  evaluationDefinitions(
    input: EvaluationDefinitionSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinitionSearchResult>;
  evaluationDefinition(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinition | null>;
  evaluationRuns(
    input: EvaluationRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRunSearchResult>;
  evaluationRun(id: string, authContext?: NormalizedAuthContext): Promise<EvaluationRun | null>;
  evaluationItemRuns(
    input: EvaluationItemRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationItemRunSearchResult>;
  evaluationResults(
    input: EvaluationResultsSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricResultSearchResult>;
  evaluationComparisons(
    input: EvaluationComparisonSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationComparisonSearchResult>;
  evaluationComparison(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationComparison | null>;
  optimizationRuns(
    input: OptimizationRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<OptimizationRunSearchResult>;
  optimizationRun(id: string, authContext?: NormalizedAuthContext): Promise<OptimizationRun | null>;
  targetSnapshot(id: string, authContext?: NormalizedAuthContext): Promise<TargetSnapshot | null>;
  targetDiff(input: TargetDiffInput, authContext?: NormalizedAuthContext): Promise<TargetDiff>;
  annotationQueue(
    input: AnnotationQueueSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AnnotationQueueResult>;
  projectAiSettings(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiSettings>;
  aiQualityOverview(
    input: AiQualityOverviewInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiQualityOverview>;
  createDataset(input: CreateDatasetInput, authContext?: NormalizedAuthContext): Promise<Dataset>;
  appendDatasetItems(
    input: AppendDatasetItemsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dataset>;
  prepareDatasetImport(
    input: PrepareDatasetImportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetImportJob>;
  commitDatasetImport(
    input: CommitDatasetImportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetImportJob>;
  startDatasetExport(
    input: StartDatasetExportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetExportJob>;
  prepareDatasetCandidates(
    input: PrepareDatasetCandidatesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetCandidateSearchResult>;
  commitDatasetCandidates(
    input: CommitDatasetCandidatesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dataset>;
  promoteSpanToDatasetItem(
    input: PromoteSpanToDatasetItemInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItem>;
  createScorer(input: CreateScorerInput, authContext?: NormalizedAuthContext): Promise<Scorer>;
  createEvaluationDefinition(
    input: CreateEvaluationDefinitionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinition>;
  updateEvaluationDefinition(
    input: UpdateEvaluationDefinitionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinition>;
  createExperiment(
    input: CreateExperimentInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Experiment>;
  startExperimentRun(
    input: StartExperimentRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun>;
  startEvaluationRun(
    input: StartEvaluationRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun>;
  cancelEvaluationRun(
    input: EvaluationRunControlInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun>;
  pauseEvaluationRun(
    input: EvaluationRunControlInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun>;
  resumeEvaluationRun(
    input: EvaluationRunControlInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun>;
  cancelExperimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun>;
  pauseExperimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun>;
  resumeExperimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun>;
  startOptimizationRun(
    input: StartOptimizationRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<OptimizationRun>;
  createEvaluationComparison(
    input: CreateEvaluationComparisonInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationComparison>;
  promotePromptVersion(
    input: PromotePromptVersionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<PromptVersion>;
  promoteTargetSnapshot(
    input: PromoteTargetSnapshotInput,
    authContext?: NormalizedAuthContext,
  ): Promise<PromotionRecord>;
  resolveAnnotation(
    input: ResolveAnnotationInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AnnotationQueueItem>;
  updateProjectAiSettings(
    input: UpdateProjectAiSettingsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiSettings>;
  subscribeLiveExperimentRun(
    input: LiveExperimentRunInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<ExperimentRunEvent>;
  subscribeLiveEvaluationRun(
    input: LiveEvaluationRunInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<EvaluationRunEvent>;
}

export type CloudGridBridge = TelemetryQueryBridge &
  MetricQueryBridge &
  ControlPlaneBridge &
  AiEvalBridge;

export interface RequestReplyClient {
  request(
    subject: string,
    payload: Uint8Array,
    options: { timeoutMs: number; headers?: Record<string, string> },
  ): Promise<Uint8Array>;
}

export interface EphemeralPubSub {
  subscribe(
    subject: string,
    onMessage: (message: BridgeMessage) => void | Promise<void>,
  ): Promise<AsyncDisposable>;
  publish(subject: string, payload: Uint8Array): Promise<void>;
}

export interface BridgeMessage {
  subject: string;
  data: Uint8Array;
}

interface MessageBridgeLifecycle {
  health(): Promise<"ok" | "unavailable">;
  close(): Promise<void>;
}

interface LiveTraceStartData {
  subscriptionId: string;
  heartbeatIntervalMs: number;
}

interface ProjectTelemetryOverviewTarget {
  tenantId?: string | null;
  companyId: string;
  projectId: string;
}

interface ProjectTelemetryOverviewItem {
  tenantId: string;
  companyId: string;
  projectId: string;
  telemetry: ProjectTelemetryOverview;
}

interface BridgeOptions {
  bffInstanceId?: string;
  subscriptionId?: () => string;
  liveTraceWatchdogMs?: number;
  metricsRecorder?: MessageBridgeMetricsRecorder;
  traceRecorder?: SelfObservabilityTraceRecorder;
  traceContextFactory?: () => TraceContext;
  logRecorder?: SelfObservabilityLogRecorder;
}

export type MessageBridgeMetricRecord =
  | {
      metric: "cloudgrid.message_bridge.requests";
      kind: "counter";
      value: 1;
      attributes: MessageBridgeMetricAttributes;
    }
  | {
      metric: "cloudgrid.message_bridge.duration";
      kind: "histogram";
      value: number;
      attributes: MessageBridgeMetricAttributes;
    };

export interface MessageBridgeMetricAttributes {
  service: "cloudgrid.bff";
  subject: string;
  result: "success" | "error";
}

export interface MessageBridgeMetricsRecorder {
  record(record: MessageBridgeMetricRecord): void;
}

export class MessageBridgeCloudGridBridge implements CloudGridBridge {
  #requestReply: RequestReplyClient;
  #pubSub: EphemeralPubSub | undefined;
  #lifecycle: MessageBridgeLifecycle | undefined;
  #timeoutMs: number;
  #logger: CloudGridLogger;
  #bffInstanceId: string;
  #subscriptionId: () => string;
  #liveTraceWatchdogMs: number | undefined;
  #metricsRecorder: MessageBridgeMetricsRecorder | undefined;
  #traceRecorder: SelfObservabilityTraceRecorder | undefined;
  #traceContextFactory: () => TraceContext;
  #logRecorder: SelfObservabilityLogRecorder | undefined;

  constructor(
    requestReply: RequestReplyClient,
    timeoutMs: number,
    logger: CloudGridLogger,
    options: BridgeOptions & { pubSub?: EphemeralPubSub; lifecycle?: MessageBridgeLifecycle } = {},
  ) {
    this.#requestReply = requestReply;
    this.#pubSub = options.pubSub;
    this.#lifecycle = options.lifecycle;
    this.#timeoutMs = timeoutMs;
    this.#logger = logger;
    this.#bffInstanceId = options.bffInstanceId ?? crypto.randomUUID();
    this.#subscriptionId = options.subscriptionId ?? (() => crypto.randomUUID());
    this.#liveTraceWatchdogMs = options.liveTraceWatchdogMs;
    this.#metricsRecorder = options.metricsRecorder;
    this.#traceRecorder = options.traceRecorder;
    this.#traceContextFactory = options.traceContextFactory ?? createTraceContext;
    this.#logRecorder = options.logRecorder;
  }

  async viewer(authContext: NormalizedAuthContext): Promise<Viewer | null> {
    const data = await this.#request<{ viewer?: Viewer | null }>(subjects.viewerGet, {
      ...envelope(authContext),
    });
    return data.viewer ? await this.#enrichViewerProjects(data.viewer, authContext) : null;
  }

  async organizations(authContext: NormalizedAuthContext): Promise<Organization[]> {
    const data = await this.#request<{ items: Organization[] }>(subjects.organizationsList, {
      ...envelope(authContext),
    });
    return this.#enrichOrganizationsProjects(data.items, authContext);
  }

  async organization(id: string, authContext: NormalizedAuthContext): Promise<Organization | null> {
    const data = await this.#request<{ organization?: Organization | null }>(
      subjects.organizationGet,
      {
        ...envelope(authContext),
        organizationId: id,
      },
    );
    return data.organization
      ? ((await this.#enrichOrganizationsProjects([data.organization], authContext))[0] ?? null)
      : null;
  }

  async projects(input: ProjectListInput, authContext: NormalizedAuthContext): Promise<Project[]> {
    const data = await this.#request<{ items: Project[] }>(subjects.projectsList, {
      ...envelope(authContext),
      ...compactInput(input as Record<string, unknown>),
    });
    return this.#enrichProjects(data.items, authContext);
  }

  async project(id: string, authContext: NormalizedAuthContext): Promise<Project | null> {
    const data = await this.#request<{ project?: Project | null }>(subjects.projectGet, {
      ...envelope(authContext),
      projectId: id,
    });
    return data.project
      ? ((await this.#enrichProjects([data.project], authContext))[0] ?? null)
      : null;
  }

  async createProject(
    input: CreateProjectInput,
    authContext: NormalizedAuthContext,
  ): Promise<Project> {
    const data = await this.#request<{ project?: Project }>(subjects.projectCreate, {
      ...envelope(authContext),
      ...input,
    });
    const project = requiredData(data.project, "Project create returned an empty response");
    return (await this.#enrichProjects([project], authContext))[0] ?? project;
  }

  async updateProject(
    id: string,
    input: UpdateProjectInput,
    authContext: NormalizedAuthContext,
  ): Promise<Project> {
    const data = await this.#request<{ project?: Project }>(subjects.projectUpdate, {
      ...envelope(authContext),
      projectId: id,
      ...compactInput(input as Record<string, unknown>),
    });
    const project = requiredData(data.project, "Project update returned an empty response");
    return (await this.#enrichProjects([project], authContext))[0] ?? project;
  }

  async selectProject(id: string, authContext: NormalizedAuthContext): Promise<Viewer> {
    const data = await this.#request<{ viewer?: Viewer }>(subjects.projectSelect, {
      ...envelope(authContext),
      projectId: id,
    });
    return this.#enrichViewerProjects(
      requiredData(data.viewer, "Project select returned an empty response"),
      authContext,
    );
  }

  async organizationMembers(
    organizationId: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationMember[]> {
    const data = await this.#request<{ items: OrganizationMember[] }>(subjects.membersList, {
      ...envelope(authContext),
      organizationId,
    });
    return data.items;
  }

  async organizationInvitations(
    organizationId: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation[]> {
    const data = await this.#request<{ items: OrganizationInvitation[] }>(
      subjects.invitationsList,
      {
        ...envelope(authContext),
        organizationId,
      },
    );
    return data.items;
  }

  async inviteOrganizationMember(
    input: InviteOrganizationMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation> {
    const data = await this.#request<{ invitation?: OrganizationInvitation }>(
      subjects.invitationCreate,
      {
        ...envelope(authContext),
        ...input,
      },
    );
    return requiredData(data.invitation, "Invitation create returned an empty response");
  }

  async inviteProjectMember(
    input: InviteProjectMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<ProjectInvitationResult> {
    const data = await this.#request<ProjectInvitationResult>(subjects.projectInvitationCreate, {
      ...envelope(authContext),
      ...input,
    });
    return data;
  }

  async resendOrganizationInvitation(
    id: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation> {
    const data = await this.#request<{ invitation?: OrganizationInvitation }>(
      subjects.invitationResend,
      {
        ...envelope(authContext),
        invitationId: id,
      },
    );
    return requiredData(data.invitation, "Invitation resend returned an empty response");
  }

  async revokeOrganizationInvitation(
    id: string,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationInvitation> {
    const data = await this.#request<{ invitation?: OrganizationInvitation }>(
      subjects.invitationRevoke,
      {
        ...envelope(authContext),
        invitationId: id,
      },
    );
    return requiredData(data.invitation, "Invitation revoke returned an empty response");
  }

  async updateOrganizationMember(
    input: UpdateOrganizationMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<OrganizationMember> {
    const data = await this.#request<{ member?: OrganizationMember }>(subjects.memberUpdate, {
      ...envelope(authContext),
      ...input,
    });
    return requiredData(data.member, "Member update returned an empty response");
  }

  async removeOrganizationMember(
    input: RemoveOrganizationMemberInput,
    authContext: NormalizedAuthContext,
  ): Promise<boolean> {
    const data = await this.#request<{ removed?: boolean }>(subjects.memberRemove, {
      ...envelope(authContext),
      ...input,
    });
    return data.removed === true;
  }

  async projectMembers(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectMember[]> {
    const data = await this.#request<{ items: ProjectMember[] }>(subjects.projectMembersList, {
      ...envelope(authContext),
      projectId,
    });
    return data.items;
  }

  async updateProjectMember(
    projectId: string,
    userId: string,
    role: ProjectRole,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectMember> {
    const data = await this.#request<{ member?: ProjectMember }>(subjects.projectMembersUpdate, {
      ...envelope(authContext),
      projectId,
      userId,
      role,
    });
    return requiredData(data.member, "Project member update returned an empty response");
  }

  async removeProjectMember(
    projectId: string,
    userId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<boolean> {
    const data = await this.#request<{ removed?: boolean }>(subjects.projectMembersRemove, {
      ...envelope(authContext),
      projectId,
      userId,
    });
    return data.removed === true;
  }

  async retentionPolicy(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<RetentionPolicy> {
    const data = await this.#request<{ policy?: RetentionPolicy }>(subjects.retentionGet, {
      ...envelope(authContext),
      projectId,
    });
    return requiredData(data.policy, "Retention policy get returned an empty response");
  }

  async updateRetentionPolicy(
    input: UpdateRetentionPolicyInput,
    authContext?: NormalizedAuthContext,
  ): Promise<RetentionPolicy> {
    const data = await this.#request<{ policy?: RetentionPolicy }>(subjects.retentionUpdate, {
      ...envelope(authContext),
      ...input,
    });
    return requiredData(data.policy, "Retention policy update returned an empty response");
  }

  async alertRules(
    projectId: string,
    input: AlertRuleSearchInput = {},
    authContext?: NormalizedAuthContext,
  ): Promise<AlertRule[]> {
    const data = await this.#request<{ items: AlertRule[] }>(subjects.alertRulesList, {
      ...envelope(authContext),
      projectId,
      input: compactInput(input as Record<string, unknown>) as AlertRuleSearchInput,
    });
    return data.items;
  }

  async createAlertRule(
    input: CreateAlertRuleInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertRule> {
    const data = await this.#request<{ rule?: AlertRule }>(subjects.alertRulesCreate, {
      ...envelope(authContext),
      input,
    });
    return requiredData(data.rule, "Alert rule create returned an empty response");
  }

  async updateAlertRule(
    input: UpdateAlertRuleInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertRule> {
    const data = await this.#request<{ rule?: AlertRule }>(subjects.alertRulesUpdate, {
      ...envelope(authContext),
      input,
    });
    return requiredData(data.rule, "Alert rule update returned an empty response");
  }

  async deleteAlertRule(id: string, authContext?: NormalizedAuthContext): Promise<boolean> {
    const data = await this.#request<{ deleted?: boolean }>(subjects.alertRulesDelete, {
      ...envelope(authContext),
      id,
    });
    return data.deleted === true;
  }

  async alertSilences(
    projectId: string,
    ruleId?: string | null,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertSilence[]> {
    const data = await this.#request<{ items: AlertSilence[] }>(subjects.alertSilencesList, {
      ...envelope(authContext),
      projectId,
      ...compactInput({ ruleId }),
    });
    return data.items;
  }

  async createAlertSilence(
    input: CreateAlertSilenceInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertSilence> {
    const data = await this.#request<{ silence?: AlertSilence }>(subjects.alertSilencesCreate, {
      ...envelope(authContext),
      input,
    });
    return requiredData(data.silence, "Alert silence create returned an empty response");
  }

  async deleteAlertSilence(id: string, authContext?: NormalizedAuthContext): Promise<boolean> {
    const data = await this.#request<{ deleted?: boolean }>(subjects.alertSilencesDelete, {
      ...envelope(authContext),
      id,
    });
    return data.deleted === true;
  }

  async alertHistory(
    projectId: string,
    ruleId?: string | null,
    first?: number | null,
    after?: string | null,
    authContext?: NormalizedAuthContext,
  ): Promise<AlertEventConnection> {
    const data = await this.#request<{ connection?: AlertEventConnection }>(
      subjects.alertHistoryList,
      {
        ...envelope(authContext),
        projectId,
        ...compactInput({ ruleId, first, after }),
      },
    );
    return requiredData(data.connection, "Alert history list returned an empty response");
  }

  async alertSummary(
    projectId: string,
    input: AlertSummaryInput = {},
    authContext?: NormalizedAuthContext,
  ): Promise<AlertSummary> {
    const data = await this.#request<{ summary?: AlertSummary }>(subjects.alertSummaryGet, {
      ...envelope(authContext),
      projectId,
      input: compactInput(input as Record<string, unknown>) as AlertSummaryInput,
    });
    return requiredData(data.summary, "Alert summary returned an empty response");
  }

  async agentRuns(
    input: AgentRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AgentRunSearchResult> {
    return this.#requestParsed(
      subjects.agentRunSearch,
      { ...envelope(authContext), input: compactInput(input as Record<string, unknown>) },
      agentRunSearchResultSchema,
    );
  }

  async agentRun(id: string, authContext?: NormalizedAuthContext): Promise<AgentRun | null> {
    const result = await this.#requestParsed(
      subjects.agentRunSearch,
      { ...envelope(authContext), input: { id } },
      agentRunSearchResultSchema,
    );
    return result.items[0] ?? null;
  }

  async datasets(
    input: DatasetSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetSearchResult> {
    return this.#requestParsed(
      subjects.datasetSearch,
      { ...envelope(authContext), input: compactInput(input as Record<string, unknown>) },
      datasetSearchResultSchema,
    );
  }

  async dataset(id: string, authContext?: NormalizedAuthContext): Promise<Dataset | null> {
    const result = await this.#requestParsed(
      subjects.datasetSearch,
      { ...envelope(authContext), input: { id } },
      datasetSearchResultSchema,
    );
    return result.items[0] ?? null;
  }

  async datasetImport(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetImportJob | null> {
    return this.#requestParsed(
      subjects.datasetTransferGet,
      { ...envelope(authContext), input: { id, kind: "import" } },
      typedDatasetImportJobSchema.nullable(),
    );
  }

  async datasetExport(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetExportJob | null> {
    return this.#requestParsed(
      subjects.datasetTransferGet,
      { ...envelope(authContext), input: { id, kind: "export" } },
      typedDatasetExportJobSchema.nullable(),
    );
  }

  async datasetItems(
    datasetId: string,
    input: DatasetItemSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItemSearchResult> {
    return this.#requestParsed(
      subjects.datasetSearch,
      {
        ...envelope(authContext),
        input: { datasetId, ...compactInput(input as Record<string, unknown>) },
      },
      datasetItemSearchResultSchema,
    );
  }

  async datasetCandidates(
    input: DatasetCandidateSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetCandidateSearchResult> {
    return this.#requestParsed(
      subjects.datasetCandidatesSearch,
      { ...envelope(authContext), ...compactInput(input as unknown as Record<string, unknown>) },
      datasetCandidateSearchResultSchema,
    );
  }

  async scorers(
    input: ScorerSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ScorerSearchResult> {
    return this.#requestParsed(
      subjects.scorerSearch,
      { ...envelope(authContext), input: compactInput(input as Record<string, unknown>) },
      scorerSearchResultSchema,
    );
  }

  async experiments(
    input: ExperimentSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentSearchResult> {
    return this.#requestParsed(
      subjects.experimentSearch,
      { ...envelope(authContext), input: compactInput(input as Record<string, unknown>) },
      experimentSearchResultSchema,
    );
  }

  async experimentRun(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun | null> {
    const result = await this.#requestParsed(
      subjects.experimentSearch,
      { ...envelope(authContext), input: { experimentRunId: id } },
      experimentRunSearchResultSchema,
    );
    return result.items[0] ?? null;
  }

  async experimentRuns(
    experimentId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRunSearchResult> {
    return this.#requestParsed(
      subjects.experimentSearch,
      { ...envelope(authContext), input: { experimentId } },
      experimentRunSearchResultSchema,
    );
  }

  async datasetItemRuns(
    experimentRunId: string,
    input: DatasetItemSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItemRunSearchResult> {
    return this.#requestParsed(
      subjects.experimentSearch,
      {
        ...envelope(authContext),
        input: {
          experimentRunId,
          itemRuns: true,
          ...compactInput(input as Record<string, unknown>),
        },
      },
      datasetItemRunSearchResultSchema,
    );
  }

  async evalResults(
    input: EvalResultSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvalResultSearchResult> {
    return this.#requestParsed(
      subjects.resultSearch,
      { ...envelope(authContext), input: compactInput(input as Record<string, unknown>) },
      evalResultSearchResultSchema,
    );
  }

  async evaluationDefinitions(
    input: EvaluationDefinitionSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinitionSearchResult> {
    return this.#requestParsed(
      subjects.evaluationSearch,
      {
        ...envelope(authContext),
        projectId: input.projectId ?? authContext?.projectId ?? "",
        ...compactInput(input as unknown as Record<string, unknown>),
      },
      evaluationDefinitionSearchResultSchema,
    );
  }

  async evaluationDefinition(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinition | null> {
    const input = compactInput({
      projectId: authContext?.projectId,
      limit: 1,
      query: id,
    }) as EvaluationDefinitionSearchInput;
    const result = await this.evaluationDefinitions(input, authContext);
    return result.items.find((item) => item.id === id) ?? result.items[0] ?? null;
  }

  async evaluationRuns(
    input: EvaluationRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRunSearchResult> {
    return this.#requestParsed(
      subjects.evaluationRunSearch,
      {
        ...envelope(authContext),
        projectId: input.projectId ?? authContext?.projectId ?? "",
        ...compactInput(input as unknown as Record<string, unknown>),
      },
      evaluationRunSearchResultSchema,
    );
  }

  async evaluationRun(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun | null> {
    const data = await this.#requestParsed(
      subjects.evaluationRunGet,
      {
        ...envelope(authContext),
        projectId: authContext?.projectId ?? "",
        evaluationRunId: id,
      },
      z.object({ run: evaluationRunSchema.optional().nullable() }),
    );
    return data.run ?? null;
  }

  async evaluationItemRuns(
    input: EvaluationItemRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationItemRunSearchResult> {
    return this.#requestParsed(
      subjects.evaluationRunSearch,
      {
        ...envelope(authContext),
        projectId: authContext?.projectId ?? "",
        itemRuns: true,
        ...compactInput(input as unknown as Record<string, unknown>),
      },
      evaluationItemRunSearchResultSchema,
    );
  }

  async evaluationResults(
    input: EvaluationResultsSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricResultSearchResult> {
    return this.#requestParsed(
      subjects.resultSearch,
      {
        ...envelope(authContext),
        projectId: input.projectId ?? authContext?.projectId ?? "",
        ...compactInput(input as unknown as Record<string, unknown>),
      },
      metricResultSearchResultSchema,
    );
  }

  async evaluationComparisons(
    input: EvaluationComparisonSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationComparisonSearchResult> {
    return this.#requestParsed(
      subjects.evaluationComparisonSearch,
      {
        ...envelope(authContext),
        projectId: input.projectId ?? authContext?.projectId ?? "",
        ...compactInput(input as unknown as Record<string, unknown>),
      },
      evaluationComparisonSearchResultSchema,
    );
  }

  async evaluationComparison(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationComparison | null> {
    const input = compactInput({
      projectId: authContext?.projectId,
      limit: 1,
    }) as EvaluationComparisonSearchInput;
    const result = await this.evaluationComparisons(input, authContext);
    return result.items.find((item) => item.id === id) ?? result.items[0] ?? null;
  }

  async optimizationRuns(
    input: OptimizationRunSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<OptimizationRunSearchResult> {
    return this.#requestParsed(
      subjects.optimizationSearch,
      {
        ...envelope(authContext),
        projectId: input.projectId ?? authContext?.projectId ?? "",
        ...compactInput(input as unknown as Record<string, unknown>),
      },
      optimizationRunSearchResultSchema,
    );
  }

  async optimizationRun(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<OptimizationRun | null> {
    const data = await this.#requestParsed(
      subjects.optimizationGet,
      {
        ...envelope(authContext),
        projectId: authContext?.projectId ?? "",
        optimizationRunId: id,
      },
      z.object({ run: optimizationRunSchema.optional().nullable() }),
    );
    return data.run ?? null;
  }

  async targetSnapshot(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<TargetSnapshot | null> {
    const data = await this.#requestParsed(
      subjects.targetSnapshotGet,
      {
        ...envelope(authContext),
        projectId: authContext?.projectId ?? "",
        targetSnapshotId: id,
      },
      z.object({ snapshot: targetSnapshotSchema.optional().nullable() }),
    );
    return data.snapshot ?? null;
  }

  async targetDiff(
    input: TargetDiffInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TargetDiff> {
    return this.#requestParsed(
      subjects.targetDiff,
      { ...envelope(authContext), ...compactInput(input as unknown as Record<string, unknown>) },
      targetDiffSchema,
    );
  }

  async annotationQueue(
    input: AnnotationQueueSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AnnotationQueueResult> {
    return this.#requestParsed(
      subjects.annotationQueueSearch,
      { ...envelope(authContext), input: compactInput(input as Record<string, unknown>) },
      annotationQueueResultSchema,
    );
  }

  async projectAiSettings(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiSettings> {
    const data = await this.#requestParsed(
      subjects.projectAiSettingsGet,
      { ...envelope(authContext), projectId },
      projectAiSettingsResponseSchema,
    );
    return data.settings;
  }

  async projectAiProviderSettings(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiProviderSettings> {
    const data = await this.#request<{ settings?: ProjectAiProviderSettings }>(
      subjects.projectAiProviderSettingsGet,
      { ...envelope(authContext), projectId },
    );
    return requiredData(
      data.settings,
      "Project AI provider settings get returned an empty response",
    );
  }

  async updateProjectAiProviderSettings(
    input: UpdateProjectAiProviderSettingsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiProviderSettings> {
    const data = await this.#request<{ settings?: ProjectAiProviderSettings }>(
      subjects.projectAiProviderSettingsUpdate,
      {
        ...envelope(authContext),
        projectId: input.projectId,
        providerProfiles: input.providerProfiles,
        modelAliases: input.modelAliases,
        expectedVersion: input.expectedVersion,
      },
    );
    return requiredData(
      data.settings,
      "Project AI provider settings update returned an empty response",
    );
  }

  async companyAiProviderSettings(
    companyId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<CompanyAiProviderSettings> {
    const data = await this.#request<{ settings?: CompanyAiProviderSettings }>(
      subjects.companyAiProviderSettingsGet,
      { ...envelope(authContext), companyId },
    );
    return requiredData(
      data.settings,
      "Company AI provider settings get returned an empty response",
    );
  }

  async updateCompanyAiProviderSettings(
    input: UpdateCompanyAiProviderSettingsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<CompanyAiProviderSettings> {
    const data = await this.#request<{ settings?: CompanyAiProviderSettings }>(
      subjects.companyAiProviderSettingsUpdate,
      {
        ...envelope(authContext),
        companyId: input.companyId,
        providerProfile: input.providerProfile,
        chatModelAlias: input.chatModelAlias,
        expectedVersion: input.expectedVersion,
      },
    );
    return requiredData(
      data.settings,
      "Company AI provider settings update returned an empty response",
    );
  }

  async resolveAiProviderSecret(
    credentialRef: string,
    authContext?: NormalizedAuthContext,
  ): Promise<{ credentialRef: string; value: string }> {
    const data = await this.#request<{ credential?: { credentialRef?: string; value?: string } }>(
      subjects.aiProviderSecretResolve,
      { ...envelope(authContext), credentialRef },
    );
    return requiredData(
      aiProviderSecretSchema.parse(data.credential),
      "AI provider secret resolver returned an empty response",
    );
  }

  async aiChatHistory(
    input: AiChatHistoryInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatHistory> {
    const data = await this.#request<{ history?: AiChatHistory }>(subjects.aiChatHistory, {
      ...envelope(authContext),
      userId: authContext?.principalId ?? "",
      ...compactInput(input as unknown as Record<string, unknown>),
    });
    return requiredData(data.history, "AI Chat history returned an empty response");
  }

  async aiChatConversation(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatConversation | null> {
    const data = await this.#request<{ conversation?: AiChatConversation | null }>(
      subjects.aiChatConversationGet,
      { ...envelope(authContext), conversationId: id },
    );
    return data.conversation ?? null;
  }

  async createAiChatConversation(
    input: CreateAiChatConversationInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatConversation> {
    const data = await this.#request<{ conversation?: AiChatConversation }>(
      subjects.aiChatConversationCreate,
      { ...envelope(authContext), ...input, userId: authContext?.principalId ?? "" },
    );
    return requiredData(
      data.conversation,
      "AI Chat conversation create returned an empty response",
    );
  }

  async archiveAiChatConversation(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatConversation> {
    const data = await this.#request<{ conversation?: AiChatConversation }>(
      subjects.aiChatConversationArchive,
      {
        ...envelope(authContext),
        conversationId: id,
        userId: authContext?.principalId ?? "",
        expectedVersion: 1,
      },
    );
    return requiredData(
      data.conversation,
      "AI Chat conversation archive returned an empty response",
    );
  }

  async deleteAiChatConversation(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<boolean> {
    const data = await this.#request<{ deleted?: boolean }>(subjects.aiChatConversationDelete, {
      ...envelope(authContext),
      conversationId: id,
      userId: authContext?.principalId ?? "",
    });
    return data.deleted === true;
  }

  async approveAiChatAction(
    input: ApproveAiChatActionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatActionProposal> {
    const data = await this.#request<{ action?: AiChatActionProposal }>(
      subjects.aiChatActionApprove,
      {
        ...envelope(authContext),
        actionProposalId: input.actionProposalId,
        idempotencyKey: input.idempotencyKey,
        approved: input.approved,
        userId: authContext?.principalId ?? "",
        reason: input.reason,
        expectedVersion: input.expectedVersion,
      },
    );
    return requiredData(data.action, "AI Chat action approval returned an empty response");
  }

  async aiChatAppendMessage(
    input: AiChatAppendMessageInput,
    authContext?: NormalizedAuthContext,
  ): Promise<void> {
    await this.#request<Record<string, unknown>>(subjects.aiChatMessageAppend, {
      ...envelope(authContext),
      ...input,
    });
  }

  async aiChatCreateRun(
    input: AiChatCreateRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatRun> {
    const data = await this.#request<{ run?: AiChatRun }>(subjects.aiChatRunCreate, {
      ...envelope(authContext),
      ...input,
    });
    return requiredData(data.run, "AI Chat run create returned an empty response");
  }

  async aiChatUpdateRun(
    input: AiChatUpdateRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatRun> {
    const data = await this.#request<{ run?: AiChatRun }>(subjects.aiChatRunUpdate, {
      ...envelope(authContext),
      ...compactInput(input as unknown as Record<string, unknown>),
    });
    return requiredData(data.run, "AI Chat run update returned an empty response");
  }

  async aiChatFinalizeRun(
    input: AiChatFinalizeRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatRun> {
    const data = await this.#request<{ run?: AiChatRun }>(subjects.aiChatRunFinalize, {
      ...envelope(authContext),
      ...compactInput(input as unknown as Record<string, unknown>),
    });
    return requiredData(data.run, "AI Chat run finalize returned an empty response");
  }

  async aiChatProposeAction(
    input: AiChatProposeActionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiChatActionProposal> {
    const data = await this.#request<{ action?: AiChatActionProposal }>(
      subjects.aiChatActionPropose,
      { ...envelope(authContext), ...input },
    );
    return requiredData(data.action, "AI Chat action proposal returned an empty response");
  }

  async aiChatFinishAction(
    input: AiChatFinishActionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<void> {
    await this.#request<Record<string, unknown>>(subjects.aiChatActionFinish, {
      ...envelope(authContext),
      ...input,
    });
  }

  async aiChatSaveCompaction(
    input: AiChatSaveCompactionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<void> {
    await this.#request<Record<string, unknown>>(subjects.aiChatCompactionSave, {
      ...envelope(authContext),
      ...input,
    });
  }

  async aiQualityOverview(
    input: AiQualityOverviewInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AiQualityOverview> {
    return this.#requestParsed(
      subjects.aiQualityOverview,
      {
        ...envelope(authContext),
        input: compactInput(input as unknown as Record<string, unknown>),
      },
      typedAiQualityOverviewSchema,
    );
  }

  async createDataset(
    input: CreateDatasetInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dataset> {
    return this.#requestParsed(
      subjects.datasetCreate,
      { ...envelope(authContext), input },
      typedDatasetSchema,
    );
  }

  async appendDatasetItems(
    input: AppendDatasetItemsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dataset> {
    return this.#requestParsed(
      subjects.datasetItemsAppend,
      {
        ...envelope(authContext),
        projectId: authContext?.projectId ?? "",
        input: { ...input, projectId: authContext?.projectId ?? "" },
      },
      typedDatasetSchema,
    );
  }

  async prepareDatasetImport(
    input: PrepareDatasetImportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetImportJob> {
    return this.#requestParsed(
      subjects.datasetImportPrepare,
      { ...envelope(authContext), input },
      typedDatasetImportJobSchema,
    );
  }

  async commitDatasetImport(
    input: CommitDatasetImportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetImportJob> {
    return this.#requestParsed(
      subjects.datasetImportCommit,
      { ...envelope(authContext), input },
      typedDatasetImportJobSchema,
    );
  }

  async startDatasetExport(
    input: StartDatasetExportInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetExportJob> {
    return this.#requestParsed(
      subjects.datasetExportStart,
      { ...envelope(authContext), input },
      typedDatasetExportJobSchema,
    );
  }

  async prepareDatasetCandidates(
    input: PrepareDatasetCandidatesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetCandidateSearchResult> {
    return this.#requestParsed(
      subjects.datasetCandidatesPrepare,
      { ...envelope(authContext), ...compactInput(input as unknown as Record<string, unknown>) },
      datasetCandidateSearchResultSchema,
    );
  }

  async commitDatasetCandidates(
    input: CommitDatasetCandidatesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dataset> {
    return this.#requestParsed(
      subjects.datasetCandidatesCommit,
      { ...envelope(authContext), ...compactInput(input as unknown as Record<string, unknown>) },
      typedDatasetSchema,
    );
  }

  async promoteSpanToDatasetItem(
    input: PromoteSpanToDatasetItemInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItem> {
    return this.#requestParsed(
      subjects.datasetItemPromote,
      { ...envelope(authContext), input },
      typedDatasetItemSchema,
    );
  }

  async createScorer(
    input: CreateScorerInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Scorer> {
    return this.#requestParsed(
      subjects.scorerCreate,
      { ...envelope(authContext), input },
      typedScorerSchema,
    );
  }

  async createEvaluationDefinition(
    input: CreateEvaluationDefinitionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinition> {
    return this.#requestParsed(
      subjects.evaluationCreate,
      {
        ...envelope(authContext),
        projectId: input.projectId,
        idempotencyKey: input.idempotencyKey,
        input,
      },
      evaluationDefinitionSchema,
    );
  }

  async updateEvaluationDefinition(
    input: UpdateEvaluationDefinitionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationDefinition> {
    return this.#requestParsed(
      subjects.evaluationUpdate,
      {
        ...envelope(authContext),
        projectId: authContext?.projectId ?? "",
        evaluationDefinitionId: input.id,
        idempotencyKey: input.idempotencyKey,
        input,
      },
      evaluationDefinitionSchema,
    );
  }

  async createExperiment(
    input: CreateExperimentInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Experiment> {
    return this.#requestParsed(
      subjects.experimentCreate,
      { ...envelope(authContext), input },
      typedExperimentSchema,
    );
  }

  async startExperimentRun(
    input: StartExperimentRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun> {
    return this.#requestParsed(
      subjects.experimentStart,
      { ...envelope(authContext), ...compactInput(input as unknown as Record<string, unknown>) },
      typedExperimentRunSchema,
    );
  }

  async startEvaluationRun(
    input: StartEvaluationRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun> {
    const targetSnapshotId =
      input.targetSnapshotId ??
      input.targetRef?.targetSnapshotId ??
      (input.targetRef
        ? (
            await this.#requestParsed(
              subjects.targetSnapshotCreate,
              {
                ...envelope(authContext),
                projectId: input.projectId,
                idempotencyKey: `${input.idempotencyKey}:target-snapshot`,
                targetRef: input.targetRef,
                input: {
                  kind: input.targetRef.kind,
                  name: input.targetRef.displayName,
                  targetRef: input.targetRef,
                  targetRefValue: input.targetRef.targetRef,
                  metadata: input.targetRef.metadata ?? {},
                  source: "evaluation_run_start",
                },
              },
              targetSnapshotSchema,
            )
          ).id
        : "");
    return this.#requestParsed(
      subjects.evaluationRunStart,
      {
        ...envelope(authContext),
        projectId: input.projectId,
        evaluationDefinitionId: input.evaluationDefinitionId,
        kind: input.kind,
        datasetVersionId: input.datasetVersionId,
        targetSnapshotId,
        selectedItemRevisionIds: input.selectedItemRevisionIds,
        splitSelector: input.splitSelector,
        metricSettings: input.metricSettings,
        runPolicy: input.runPolicy,
        retentionProfile: input.retentionProfile,
        retentionRole: input.retentionRole,
        idempotencyKey: input.idempotencyKey,
      },
      evaluationRunSchema,
    );
  }

  async cancelExperimentRun(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun> {
    return this.#requestParsed(
      subjects.experimentCancel,
      { ...envelope(authContext), experimentRunId: id },
      typedExperimentRunSchema,
    );
  }

  async pauseExperimentRun(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun> {
    return this.#requestParsed(
      subjects.experimentPause,
      {
        ...envelope(authContext),
        experimentRunId: id,
        command: "pause",
        idempotencyKey: `${id}:pause`,
      },
      typedExperimentRunSchema,
    );
  }

  async resumeExperimentRun(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun> {
    return this.#requestParsed(
      subjects.experimentResume,
      {
        ...envelope(authContext),
        experimentRunId: id,
        command: "resume",
        idempotencyKey: `${id}:resume`,
      },
      typedExperimentRunSchema,
    );
  }

  async cancelEvaluationRun(
    input: EvaluationRunControlInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun> {
    return this.#evaluationRunControl(subjects.evaluationRunCancel, input, authContext);
  }

  async pauseEvaluationRun(
    input: EvaluationRunControlInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun> {
    return this.#evaluationRunControl(subjects.evaluationRunPause, input, authContext);
  }

  async resumeEvaluationRun(
    input: EvaluationRunControlInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun> {
    return this.#evaluationRunControl(subjects.evaluationRunResume, input, authContext);
  }

  async #evaluationRunControl(
    subject: string,
    input: EvaluationRunControlInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationRun> {
    return this.#requestParsed(
      subject,
      {
        ...envelope(authContext),
        projectId: authContext?.projectId ?? "",
        evaluationRunId: input.evaluationRunId,
        idempotencyKey: input.idempotencyKey,
      },
      evaluationRunSchema,
    );
  }

  async startOptimizationRun(
    input: StartOptimizationRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<OptimizationRun> {
    return this.#requestParsed(
      subjects.optimizationStart,
      {
        ...envelope(authContext),
        projectId: input.projectId,
        targetSnapshotId: input.baselineTargetSnapshotId,
        datasetVersionId:
          input.quickShotPolicy && typeof input.quickShotPolicy === "object"
            ? String(
                (input.quickShotPolicy as { sourceDatasetVersionId?: unknown })
                  .sourceDatasetVersionId ?? "",
              )
            : "",
        config: input,
        idempotencyKey: input.idempotencyKey,
      },
      optimizationRunSchema,
    );
  }

  async createEvaluationComparison(
    input: CreateEvaluationComparisonInput,
    authContext?: NormalizedAuthContext,
  ): Promise<EvaluationComparison> {
    const comparison = await this.#requestParsed(
      subjects.evaluationComparisonCreate,
      {
        ...envelope(authContext),
        projectId: input.projectId,
        baselineRunId: input.baselineRunId,
        candidateRunId: input.candidateRunId,
        idempotencyKey: input.idempotencyKey,
      },
      evaluationComparisonSchema,
    );
    return normalizeEvaluationComparison(comparison);
  }

  async promotePromptVersion(
    input: PromotePromptVersionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<PromptVersion> {
    return this.#requestParsed(
      subjects.promptVersionPromote,
      { ...envelope(authContext), input },
      typedPromptVersionSchema,
    );
  }

  async promoteTargetSnapshot(
    input: PromoteTargetSnapshotInput,
    authContext?: NormalizedAuthContext,
  ): Promise<PromotionRecord> {
    return this.#requestParsed(
      subjects.targetPromote,
      {
        ...envelope(authContext),
        projectId: input.projectId,
        targetRef: { value: input.targetRef },
        candidateSnapshotId: input.candidateTargetSnapshotId,
        comparisonId: input.comparisonId,
        idempotencyKey: input.idempotencyKey,
      },
      promotionRecordSchema,
    );
  }

  async resolveAnnotation(
    input: ResolveAnnotationInput,
    authContext?: NormalizedAuthContext,
  ): Promise<AnnotationQueueItem> {
    return this.#requestParsed(
      subjects.annotationItemUpdate,
      { ...envelope(authContext), input },
      typedAnnotationQueueItemSchema,
    );
  }

  async updateProjectAiSettings(
    input: UpdateProjectAiSettingsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ProjectAiSettings> {
    const data = await this.#requestParsed(
      subjects.projectAiSettingsUpdate,
      {
        ...envelope(authContext),
        input,
        expectedVersion: input.expectedVersion,
      },
      projectAiSettingsResponseSchema,
    );
    return data.settings;
  }

  async *subscribeLiveExperimentRun(
    input: LiveExperimentRunInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<ExperimentRunEvent> {
    if (!this.#pubSub) {
      throw graphQLErrorFromBridge({
        id: "ERR-013",
        code: "MESSAGE_BRIDGE_UNAVAILABLE",
        message: "Message bridge live experiment adapter is unavailable",
        retryable: true,
      });
    }
    const subscriptionId = this.#subscriptionId();
    const sinkSubject = `eval.live.events.${this.#bffInstanceId}.${subscriptionId}`;
    const events = createAsyncQueue<ExperimentRunEvent>();
    const subscription = await this.#pubSub.subscribe(sinkSubject, (message) => {
      events.push(parseExperimentRunEvent(decodeJson(message.data)));
    });
    let started = false;
    try {
      await this.#requestParsed(
        subjects.liveExperimentStart,
        {
          ...envelope(authContext),
          subscriptionId,
          experimentRunId: input.experimentRunId,
          sinkSubject,
        },
        liveStartDataSchema,
      );
      started = true;
      for await (const event of events) {
        yield event;
      }
    } finally {
      events.close();
      await subscription[Symbol.asyncDispose]();
      if (started) {
        await this.#stopLiveExperimentRun(subscriptionId);
      }
    }
  }

  async *subscribeLiveEvaluationRun(
    input: LiveEvaluationRunInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<EvaluationRunEvent> {
    if (!this.#pubSub) {
      throw graphQLErrorFromBridge({
        id: "ERR-013",
        code: "MESSAGE_BRIDGE_UNAVAILABLE",
        message: "Message bridge live evaluation adapter is unavailable",
        retryable: true,
      });
    }
    const subscriptionId = this.#subscriptionId();
    const sinkSubject = `eval.live.events.${this.#bffInstanceId}.${subscriptionId}`;
    const events = createAsyncQueue<EvaluationRunEvent>();
    const subscription = await this.#pubSub.subscribe(sinkSubject, (message) => {
      events.push(parseEvaluationRunEvent(decodeJson(message.data)));
    });
    let started = false;
    try {
      await this.#requestParsed(
        subjects.liveExperimentStart,
        {
          ...envelope(authContext),
          subscriptionId,
          evaluationRunId: input.evaluationRunId,
          sinkSubject,
        },
        liveStartDataSchema,
      );
      started = true;
      for await (const event of events) {
        yield event;
      }
    } finally {
      events.close();
      await subscription[Symbol.asyncDispose]();
      if (started) {
        await this.#stopLiveExperimentRun(subscriptionId);
      }
    }
  }

  async searchTraces(
    input: TraceSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceSearchResult> {
    return this.#requestParsed(
      subjects.traceSearch,
      {
        ...envelope(authContext),
        ...telemetryQueryPayload(input),
      },
      traceSearchResultSchema,
    );
  }

  async getTraceDetail(
    traceId: string,
    input: TraceDetailInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceDetail | null> {
    return this.#request<TraceDetail>(subjects.traceGet, {
      ...envelope(authContext),
      traceId,
      ...telemetryQueryPayload(input),
    });
  }

  async searchLogs(
    input: LogSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<LogSearchResult> {
    return this.#request<LogSearchResult>(subjects.logSearch, {
      ...envelope(authContext),
      ...telemetryQueryPayload(input),
    });
  }

  async telemetryFacets(
    input: TelemetryFacetInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TelemetryFacetResult> {
    return this.#request<TelemetryFacetResult>(subjects.telemetryFacets, {
      ...envelope(authContext),
      ...telemetryQueryPayload(input),
    });
  }

  async metricNames(
    input: MetricNameSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricNameSearchResult> {
    return this.#request<MetricNameSearchResult>(subjects.metricNames, {
      ...envelope(authContext),
      ...telemetryMetricPayload(input),
    });
  }

  async metricSeries(
    input: MetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricSeriesResult> {
    return this.#request<MetricSeriesResult>(subjects.metricSeries, {
      ...envelope(authContext),
      ...telemetryMetricPayload(input),
    });
  }

  async richMetricSeries(
    input: RichMetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<RichMetricSeriesResult> {
    return this.#request<RichMetricSeriesResult>(subjects.richMetricSeries, {
      ...envelope(authContext),
      ...telemetryMetricPayload(input),
    });
  }

  async dashboards(
    input: DashboardListInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DashboardListResult> {
    return this.#requestParsed(
      subjects.dashboardsList,
      {
        ...envelope(authContext),
        input: compactInput(input as Record<string, unknown>) as DashboardListInput,
      },
      dashboardListResultSchema,
    );
  }

  async saveDashboard(
    input: SaveDashboardInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Dashboard> {
    const data = await this.#requestParsed(
      subjects.dashboardsSave,
      {
        ...envelope(authContext),
        input,
      },
      dashboardSaveResponseSchema,
    );
    return data.dashboard;
  }

  async deleteDashboard(id: string, authContext?: NormalizedAuthContext): Promise<boolean> {
    const data = await this.#requestParsed(
      subjects.dashboardsDelete,
      {
        ...envelope(authContext),
        dashboardId: id,
      },
      dashboardDeleteResponseSchema,
    );
    return data.deleted === true;
  }

  async setDashboardPinned(
    input: SetDashboardPinnedInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DashboardPreferences> {
    return this.#requestParsed(
      subjects.dashboardPinsSet,
      {
        ...envelope(authContext),
        ...input,
      },
      dashboardPreferencesSchema,
    );
  }

  async reorderDashboardPins(
    input: ReorderDashboardPinsInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DashboardPreferences> {
    return this.#requestParsed(
      subjects.dashboardPinsReorder,
      {
        ...envelope(authContext),
        ...input,
      },
      dashboardPreferencesSchema,
    );
  }

  async ingestCredentials(
    projectId: string,
    authContext?: NormalizedAuthContext,
  ): Promise<IngestCredentialListResult> {
    return this.#requestParsed(
      subjects.ingestCredentialsList,
      {
        ...envelope(authContext),
        projectId,
      },
      ingestCredentialListResultSchema,
    );
  }

  async createIngestCredential(
    input: CreateIngestCredentialInput,
    authContext?: NormalizedAuthContext,
  ): Promise<CreatedIngestCredential> {
    return this.#requestParsed(
      subjects.ingestCredentialsCreate,
      {
        ...envelope(authContext),
        projectId: input.projectId,
        title: input.title,
      },
      createdIngestCredentialSchema,
    );
  }

  async revokeIngestCredential(
    id: string,
    authContext?: NormalizedAuthContext,
  ): Promise<IngestCredential> {
    const data = await this.#requestParsed(
      subjects.ingestCredentialsRevoke,
      {
        ...envelope(authContext),
        credentialId: id,
      },
      ingestCredentialRevokeResponseSchema,
    );
    return data.credential;
  }

  subscribeLiveTraces(
    input: LiveTraceInput,
    authContext?: NormalizedAuthContext,
  ): AsyncIterableIterator<LiveTraceEvent> {
    if (!this.#pubSub) {
      throw graphQLErrorFromBridge({
        id: "ERR-013",
        code: "MESSAGE_BRIDGE_UNAVAILABLE",
        message: "Message bridge live trace adapter is unavailable",
        retryable: true,
      });
    }
    const subscriptionId = this.#subscriptionId();
    const sinkSubject = `telemetry.traces.live.events.${this.#bffInstanceId}.${subscriptionId}`;
    const events = createAsyncQueue<LiveTraceEvent>();
    async function* run(this: MessageBridgeCloudGridBridge) {
      const subscription = await this.#pubSub?.subscribe(sinkSubject, (message) => {
        events.push(parseLiveTraceEvent(decodeJson(message.data)));
      });
      if (!subscription) {
        throw graphQLErrorFromBridge({
          id: "ERR-013",
          code: "MESSAGE_BRIDGE_UNAVAILABLE",
          message: "Message bridge live trace adapter is unavailable",
          retryable: true,
        });
      }
      let started = false;
      try {
        const startData = await this.#request<LiveTraceStartData>(subjects.liveTraceStart, {
          ...envelope(authContext),
          subscriptionId,
          sinkSubject,
          query: compactInput(input as Record<string, unknown>) as LiveTraceInput,
        });
        started = true;
        const watchdogMs = this.#liveTraceWatchdogMs ?? liveTraceWatchdogMs(startData);
        while (true) {
          const result = await nextWithTimeout(events, watchdogMs, () =>
            graphQLErrorFromBridge({
              id: "ERR-014",
              code: "MESSAGE_BRIDGE_TIMEOUT",
              message: "Live trace subscription did not receive heartbeat or data before deadline",
              retryable: true,
            }),
          );
          if (result.done) {
            break;
          }
          yield result.value;
        }
      } finally {
        events.close();
        await subscription[Symbol.asyncDispose]();
        if (started) {
          await this.#stopLiveTraces(subscriptionId);
        }
      }
    }
    return cancelableAsyncIterator(run.call(this), events);
  }

  async health(): Promise<"ok" | "unavailable"> {
    return this.#lifecycle ? this.#lifecycle.health() : "ok";
  }

  async close(): Promise<void> {
    await this.#lifecycle?.close();
  }

  async #stopLiveTraces(subscriptionId: string): Promise<void> {
    try {
      await this.#request<{ subscriptionId: string }>(subjects.liveTraceStop, {
        ...envelope(),
        subscriptionId,
      });
    } catch (error) {
      const bridgeError =
        error instanceof GraphQLError
          ? graphQLErrorBridgeFields(error)
          : ({
              id: "ERR-013",
              code: "MESSAGE_BRIDGE_UNAVAILABLE",
              message: "Message bridge failed to stop live trace subscription",
              retryable: true,
            } satisfies BridgeErrorLike);
      this.#logger.warn("live_trace_stop_failed", {
        request_id: "",
        operation_or_subject: subjects.liveTraceStop,
        status: "error",
        duration_ms: 0,
        error_id: bridgeError.id,
        error_code: bridgeError.code,
      });
    }
  }

  async #stopLiveExperimentRun(subscriptionId: string): Promise<void> {
    try {
      await this.#requestParsed(
        subjects.liveExperimentStop,
        {
          ...envelope(),
          subscriptionId,
        },
        liveStartDataSchema,
      );
    } catch (error) {
      const bridgeError =
        error instanceof GraphQLError
          ? graphQLErrorBridgeFields(error)
          : ({
              id: "ERR-013",
              code: "MESSAGE_BRIDGE_UNAVAILABLE",
              message: "Message bridge failed to stop live experiment subscription",
              retryable: true,
            } satisfies BridgeErrorLike);
      this.#logger.warn("live_experiment_stop_failed", {
        request_id: "",
        operation_or_subject: subjects.liveExperimentStop,
        status: "error",
        duration_ms: 0,
        error_id: bridgeError.id,
        error_code: bridgeError.code,
      });
    }
  }

  async #enrichViewerProjects(viewer: Viewer, authContext: NormalizedAuthContext): Promise<Viewer> {
    const projects = viewer.organizations.flatMap((organization) => organization.projects);
    if (viewer.selectedProject) {
      projects.push(viewer.selectedProject);
    }
    const telemetryByProject = await this.#projectTelemetryByProject(projects, authContext);
    const organizations = viewer.organizations.map((organization) => ({
      ...organization,
      projects: organization.projects.map((project) =>
        mergeProjectTelemetry(project, telemetryByProject),
      ),
    }));
    const selectedProject = viewer.selectedProject
      ? mergeProjectTelemetry(viewer.selectedProject, telemetryByProject)
      : viewer.selectedProject;
    return selectedProject === undefined
      ? { ...viewer, organizations }
      : { ...viewer, organizations, selectedProject };
  }

  async #enrichOrganizationsProjects(
    organizations: Organization[],
    authContext: NormalizedAuthContext,
  ): Promise<Organization[]> {
    const projects = organizations.flatMap((organization) => organization.projects);
    const telemetryByProject = await this.#projectTelemetryByProject(projects, authContext);
    return organizations.map((organization) => ({
      ...organization,
      projects: organization.projects.map((project) =>
        mergeProjectTelemetry(project, telemetryByProject),
      ),
    }));
  }

  async #enrichProjects(
    projects: Project[],
    authContext: NormalizedAuthContext,
  ): Promise<Project[]> {
    const telemetryByProject = await this.#projectTelemetryByProject(projects, authContext);
    return projects.map((project) => mergeProjectTelemetry(project, telemetryByProject));
  }

  async #projectTelemetryByProject(
    projects: Project[],
    authContext: NormalizedAuthContext,
  ): Promise<Map<string, ProjectTelemetryOverview>> {
    const targets = projectTelemetryTargets(projects, authContext);
    if (targets.length === 0) {
      return new Map();
    }
    const data = await this.#request<{ items: ProjectTelemetryOverviewItem[] }>(
      subjects.projectTelemetryOverview,
      {
        ...envelope(authContext),
        projects: targets,
      },
    );
    const telemetryByProject = new Map<string, ProjectTelemetryOverview>();
    for (const item of data.items) {
      telemetryByProject.set(projectTelemetryKey(item.companyId, item.projectId), item.telemetry);
    }
    return telemetryByProject;
  }

  async #requestParsed<Data>(
    subject: string,
    payload: unknown,
    schema: z.ZodType<Data>,
  ): Promise<Data> {
    const data = await this.#request<unknown>(subject, payload);
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      this.#logger.error("nats_response_validation_failed", {
        request_id: requestIdFromPayload(payload),
        error_id: responseContractInvalidError.id,
        error_code: responseContractInvalidError.code,
        operation_or_subject: subject,
        issues: boundedValidationIssues(parsed.error.issues),
      });
      throw graphQLErrorFromBridge(responseContractInvalidError, requestIdFromPayload(payload));
    }
    return parsed.data;
  }

  async #request<Data>(subject: string, payload: unknown): Promise<Data> {
    const start = performance.now();
    const requestId = requestIdFromPayload(payload);
    const traceContext = this.#traceContextFactory();
    try {
      const data = await this.#requestReply.request(subject, encodeJson(payload), {
        timeoutMs: this.#timeoutMs,
        headers: traceContextHeaders(traceContext),
      });
      const responseValue = decodeBridgeResponsePayload(data);
      const response = parseBridgeResponse<Data>(responseValue);
      if (!response.ok) {
        this.#logRequest(
          "warn",
          subject,
          response.requestId || requestId,
          start,
          "error",
          traceContext,
          response.error,
        );
        throw graphQLErrorFromBridge(response.error, response.requestId);
      }
      if (response.data === undefined) {
        const error = {
          id: "ERR-006",
          code: "STORAGE_UNAVAILABLE",
          message: "Storage returned an empty response",
          retryable: true,
        } satisfies BridgeErrorLike;
        this.#logRequest(
          "error",
          subject,
          response.requestId || requestId,
          start,
          "error",
          traceContext,
          error,
        );
        throw graphQLErrorFromBridge(error, response.requestId || requestId);
      }
      this.#logRequest(
        "debug",
        subject,
        response.requestId || requestId,
        start,
        "ok",
        traceContext,
      );
      return response.data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      const bridgeError =
        error instanceof BridgeResponseContractError
          ? responseContractInvalidError
          : bridgeErrorFromTransportError(error);
      if (error instanceof BridgeResponseContractError) {
        this.#logger.error("nats_response_validation_failed", {
          request_id: requestId,
          error_id: bridgeError.id,
          error_code: bridgeError.code,
          operation_or_subject: subject,
          issues: error.issues,
        });
      }
      this.#logRequest("error", subject, requestId, start, "error", traceContext, bridgeError);
      throw graphQLErrorFromBridge(bridgeError, requestId);
    }
  }

  #logRequest(
    level: "debug" | "info" | "warn" | "error",
    subject: string,
    requestId: string,
    start: number,
    status: "ok" | "error",
    traceContext: TraceContext,
    error?: BridgeErrorLike,
  ) {
    const durationMs = elapsedMilliseconds(start);
    const subjectLabel = boundedMetricSubject(subject);
    const result = status === "ok" ? "success" : "error";
    this.#traceRecorder?.recordSpan({
      name: "nats.request",
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      ...(traceContext.parentSpanId ? { parentSpanId: traceContext.parentSpanId } : {}),
      ...(traceContext.traceState ? { traceState: traceContext.traceState } : {}),
      result,
      durationSeconds: durationMs / 1000,
      attributes: {
        "cloudgrid.request_id": requestId,
        "messaging.system": "nats",
        "messaging.destination.name": subjectLabel,
        "rpc.method": subjectLabel,
      },
    });
    if (error) {
      this.#logRecorder?.recordLog({
        event: "message_bridge_request_failed",
        severity: "WARN",
        attributes: {
          "messaging.system": "nats",
          "messaging.destination.name": subjectLabel,
          "rpc.method": subjectLabel,
          "error.id": error.id,
          "error.code": error.code,
        },
      });
    }
    this.#recordMessageBridgeMetrics(subject, status, durationMs / 1000);
    this.#logger[level]("nats_request_completed", {
      request_id: requestId,
      operation_or_subject: subject,
      status,
      duration_ms: durationMs,
      ...(error ? { error_id: error.id, error_code: error.code } : {}),
    });
  }

  #recordMessageBridgeMetrics(subject: string, status: "ok" | "error", durationSeconds: number) {
    if (!this.#metricsRecorder) {
      return;
    }
    const attributes = {
      service: "cloudgrid.bff",
      subject: boundedMetricSubject(subject),
      result: status === "ok" ? "success" : "error",
    } satisfies MessageBridgeMetricAttributes;
    try {
      this.#metricsRecorder.record({
        metric: "cloudgrid.message_bridge.requests",
        kind: "counter",
        value: 1,
        attributes,
      });
      this.#metricsRecorder.record({
        metric: "cloudgrid.message_bridge.duration",
        kind: "histogram",
        value: durationSeconds,
        attributes,
      });
    } catch {
      // Self-observability must not affect user-facing message bridge behavior.
    }
  }
}

function traceContextHeaders(context: TraceContext): Record<string, string> {
  return {
    traceparent: traceContextToTraceParent(context),
    ...(context.traceState ? { tracestate: context.traceState } : {}),
  };
}

function boundedMetricSubject(subject: string): string {
  return /^[a-z][a-z0-9_.]{0,127}$/.test(subject) ? subject : "unknown";
}

export class NATSTelemetryQueryBridge extends MessageBridgeCloudGridBridge {
  constructor(
    connection: ConstructorParameters<typeof NATSRequestReplyClient>[0],
    timeoutMs: number,
    logger: CloudGridLogger,
    options: BridgeOptions & {
      pubSub?: EphemeralPubSub;
      lifecycle?: MessageBridgeLifecycle;
      natsOperationFlushTimeoutMs?: number;
    } = {},
  ) {
    const requestReply = new NATSRequestReplyClient(connection);
    const lifecycle = new NATSBridgeLifecycle(
      connection,
      options.natsOperationFlushTimeoutMs === undefined
        ? {}
        : { flushTimeoutMs: options.natsOperationFlushTimeoutMs },
    );
    super(requestReply, timeoutMs, logger, {
      ...options,
      pubSub: options.pubSub ?? new NATSEphemeralPubSub(connection),
      lifecycle: options.lifecycle ?? lifecycle,
    });
  }
}

export async function createNATSTelemetryQueryBridge(
  servers: string,
  timeoutMs: number,
  logger: CloudGridLogger,
  options: BridgeOptions & {
    pubSub?: EphemeralPubSub;
    lifecycle?: MessageBridgeLifecycle;
    natsOperationFlushTimeoutMs?: number;
  } = {},
): Promise<NATSTelemetryQueryBridge> {
  const connection = await connectNATSWithStartupRetry({ servers, name: "cloudgrid-bff" });
  return new NATSTelemetryQueryBridge(connection, timeoutMs, logger, options);
}

async function connectNATSWithStartupRetry(options: { servers: string; name: string }) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      return await connectNATS(options);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function graphQLErrorFromBridge(error?: BridgeErrorLike, requestId?: string) {
  const bridgeError =
    error ??
    ({
      id: "ERR-006",
      code: "STORAGE_UNAVAILABLE",
      message: "Storage is unavailable",
      retryable: true,
    } satisfies BridgeErrorLike);
  const problem = problemFromBridgeError(
    bridgeError,
    requestId ? `/graphql/request/${requestId}` : undefined,
  );

  return new GraphQLError(problem.detail, {
    extensions: {
      code: bridgeError.code,
      problem,
    },
  });
}

export function compactInput<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  ) as T;
}

function compactNullish(value: object) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entryValue]) => entryValue !== null && entryValue !== undefined,
    ),
  );
}

function normalizeEvaluationComparison(comparison: EvaluationComparison): EvaluationComparison {
  const row = comparison as unknown as Record<string, unknown>;
  const summary = row.summary;
  return {
    ...comparison,
    baselineRunId: String(row.baselineRunId ?? row.baselineEvaluationRunId ?? ""),
    candidateRunId: String(row.candidateRunId ?? row.candidateEvaluationRunId ?? ""),
    metricResults: Array.isArray(row.metricResults) ? row.metricResults : [],
    metricAggregates: Array.isArray(row.metricAggregates) ? row.metricAggregates : [],
    summary: typeof summary === "string" ? summary : JSON.stringify(summary ?? {}),
  } as EvaluationComparison;
}

export function elapsedMilliseconds(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function decodeJson(value: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(value));
}

function envelope(authContext?: NormalizedAuthContext): BridgeEnvelope {
  const value: BridgeEnvelope = {
    requestId: crypto.randomUUID(),
    issuedAt: new Date().toISOString(),
  };
  if (authContext) {
    value.authContext = authContext;
  }
  return value;
}

function requiredData<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw graphQLErrorFromBridge({
      id: "ERR-006",
      code: "STORAGE_UNAVAILABLE",
      message,
      retryable: true,
    });
  }
  return value;
}

function projectTelemetryTargets(
  projects: Project[],
  authContext: NormalizedAuthContext,
): ProjectTelemetryOverviewTarget[] {
  const targets = new Map<string, ProjectTelemetryOverviewTarget>();
  for (const project of projects) {
    const companyId = project.organizationId.trim();
    const projectId = project.id.trim();
    if (!companyId || !projectId) {
      continue;
    }
    const key = projectTelemetryKey(companyId, projectId);
    if (!targets.has(key)) {
      targets.set(key, {
        tenantId: authContext.tenantId ?? null,
        companyId,
        projectId,
      });
    }
  }
  return [...targets.values()];
}

function mergeProjectTelemetry(
  project: Project,
  telemetryByProject: Map<string, ProjectTelemetryOverview>,
): Project {
  return {
    ...project,
    telemetry:
      telemetryByProject.get(projectTelemetryKey(project.organizationId, project.id)) ??
      project.telemetry,
  };
}

function projectTelemetryKey(companyId: string, projectId: string): string {
  return `${companyId}\u0000${projectId}`;
}

function requestIdFromPayload(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "requestId" in payload &&
    typeof payload.requestId === "string"
  ) {
    return payload.requestId;
  }
  return "";
}

function boundedValidationIssues(issues: z.ZodIssue[]): Array<{
  code: string;
  path: string;
  message: string;
}> {
  return issues.slice(0, maxLoggedValidationIssues).map((issue) => ({
    code: issue.code,
    path: issue.path.slice(0, maxLoggedValidationPathDepth).map(String).join(".") || "$",
    message: issue.message,
  }));
}

function bridgeErrorFromTransportError(error: unknown): BridgeErrorLike {
  const code = errorCode(error);
  if (isNatsTimeoutCode(code)) {
    return {
      id: "ERR-014",
      code: "MESSAGE_BRIDGE_TIMEOUT",
      message: "Message bridge request timed out",
      retryable: true,
    };
  }
  if (isNatsUnavailableCode(code)) {
    return {
      id: "ERR-013",
      code: "MESSAGE_BRIDGE_UNAVAILABLE",
      message: "Message bridge is unavailable",
      retryable: true,
    };
  }
  if (error instanceof SyntaxError) {
    return responseContractInvalidError;
  }
  return {
    id: "ERR-013",
    code: "MESSAGE_BRIDGE_UNAVAILABLE",
    message: "Message bridge is unavailable",
    retryable: true,
  };
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "";
}

function isNatsTimeoutCode(code: string): boolean {
  return code === "TIMEOUT" || code === "408" || code === "CONNECTION_TIMEOUT";
}

function isNatsUnavailableCode(code: string): boolean {
  return (
    code === "503" ||
    code === "CONNECTION_CLOSED" ||
    code === "CONNECTION_DRAINING" ||
    code === "CONNECTION_REFUSED" ||
    code === "DISCONNECT" ||
    code === "REQUEST_ERROR" ||
    code === "PERMISSIONS_VIOLATION" ||
    code === "AUTHORIZATION_VIOLATION" ||
    code === "AUTHENTICATION_EXPIRED" ||
    code === "AUTHENTICATION_TIMEOUT" ||
    code === "ACCOUNT_EXPIRED"
  );
}

const cloudGridErrorIdSchema = z.enum([
  "ERR-001",
  "ERR-002",
  "ERR-003",
  "ERR-004",
  "ERR-005",
  "ERR-006",
  "ERR-007",
  "ERR-008",
  "ERR-009",
  "ERR-010",
  "ERR-011",
  "ERR-012",
  "ERR-013",
  "ERR-014",
  "ERR-015",
  "ERR-016",
  "ERR-017",
  "ERR-018",
  "ERR-019",
  "ERR-020",
  "ERR-021",
  "ERR-022",
  "ERR-023",
]);

const bridgeErrorSchema = z.object({
  id: cloudGridErrorIdSchema,
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const bridgeResponseSchema = z.object({
  requestId: z.string().min(1),
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: bridgeErrorSchema.optional(),
});

class BridgeResponseContractError extends Error {
  issues: Array<{ code: string; path: string; message: string }>;

  constructor(message: string, issues: Array<{ code: string; path: string; message: string }>) {
    super(message);
    this.name = "BridgeResponseContractError";
    this.issues = issues;
  }
}

function decodeBridgeResponsePayload(value: Uint8Array): unknown {
  try {
    return decodeJson(value);
  } catch {
    throw new BridgeResponseContractError("Bridge response payload is not valid JSON", [
      {
        code: "invalid_json",
        path: "$",
        message: "Bridge response payload is not valid JSON",
      },
    ]);
  }
}

function parseBridgeResponse<Data>(value: unknown): BridgeResponse<Data> {
  const parsed = bridgeResponseSchema.safeParse(value);
  if (!parsed.success) {
    throw new BridgeResponseContractError(
      "Bridge response envelope did not match the message contract",
      boundedValidationIssues(parsed.error.issues),
    );
  }
  return parsed.data as BridgeResponse<Data>;
}

const dateTimeSchema = z.string().datetime({ offset: true });
const traceStatusSchema = z.enum(["ok", "error", "unset"]);
const metricAggregationSchema = z.enum([
  "avg",
  "sum",
  "min",
  "max",
  "count",
  "rate",
  "p50",
  "p90",
  "p95",
  "p99",
]);
const metricChartTypeSchema = z.enum([
  "line",
  "area",
  "bar",
  "pie",
  "donut",
  "stat",
  "radial",
  "radar",
  "heatmap",
  "histogram",
  "table",
]);
const logSortSchema = z.enum(["timestamp_desc", "timestamp_asc", "severity_desc"]);
const traceSortSchema = z.enum([
  "startedAt_desc",
  "startedAt_asc",
  "duration_desc",
  "duration_asc",
  "errorFirst",
]);
const attributeOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "exists",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
]);
const attributeFilterSchema = z.object({
  key: z.string().min(1),
  operator: attributeOperatorSchema,
  value: z.unknown().optional().nullable(),
});
const dashboardVisibilitySchema = z.enum(["builtin", "project", "personal"]);
const dashboardWidgetKindSchema = z.enum([
  "metric_timeseries",
  "metric_stat",
  "metric_table",
  "metric_rich",
  "log_table",
  "trace_table",
  "live_trace_table",
  "alert_status",
  "alert_history",
  "alert_evidence",
]);
const dashboardThresholdSeveritySchema = z.enum(["info", "warning", "error"]);
const dashboardLogColumnSchema = z.enum([
  "timestamp",
  "observed_timestamp",
  "severity",
  "service",
  "trace_span",
  "body",
  "attributes",
]);
const dashboardTraceColumnSchema = z.enum([
  "started_at",
  "status",
  "service",
  "operation",
  "duration",
  "span_count",
  "log_count",
]);
const agentRunStatusSchema = z.enum(["ok", "error", "unset", "cancelled"]);
const scorerKindSchema = z.enum([
  "deterministic",
  "schema_json",
  "semantic",
  "rag",
  "llm_judge",
  "pairwise_judge",
  "tool_correctness",
  "trajectory",
  "workflow",
  "human",
  "composite",
]);
const evalTargetKindSchema = z.enum(["agentRun", "span", "datasetItemRun"]);
const experimentRunStatusSchema = z.enum([
  "queued",
  "running",
  "pausing",
  "paused",
  "resuming",
  "cancelling",
  "cancelled",
  "failed",
  "completed",
]);
const annotationStatusSchema = z.enum(["open", "in_review", "resolved", "dismissed"]);
const evalSolverKindSchema = z.enum(["prompt", "agent", "workflow", "skill", "tool"]);
const evalBaselineKindSchema = z.enum(["experiment_run", "prompt_version", "solver_ref", "none"]);
const optimizerKindSchema = z.enum(["bootstrap_fewshot", "critic_mutate_judge_pick"]);
const bootstrapFewshotDiversityStrategySchema = z.enum([
  "none",
  "by_label",
  "by_cluster",
  "by_failure_mode",
]);
const evaluationFamilySchema = z.enum([
  "classification",
  "extraction",
  "freeform_answer",
  "tool_use",
  "agent_loop",
  "workflow",
  "skill",
]);
const datasetValueTypeSchema = z.enum(["text", "json"]);
const datasetSplitSchema = z.enum(["training", "validation", "test"]);
const datasetCurationStatusSchema = z.enum([
  "draft",
  "needs_expected",
  "needs_review",
  "ready",
  "rejected",
]);
const datasetReviewStatusSchema = datasetCurationStatusSchema;
const retentionProfileSchema = z.enum([
  "balanced",
  "fast_iteration",
  "audit_friendly",
  "minimal_storage",
]);
const datasetVersionSourceSchema = z.enum([
  "manual",
  "import",
  "trace_import",
  "optimization",
  "candidate_commit",
]);
const datasetTargetShapeSchema = z.enum([
  "single_turn",
  "conversation",
  "tool_call",
  "agent_trajectory",
  "workflow_trace",
  "retrieval_case",
  "production_trace_ref",
]);
const datasetContentTreatmentSchema = z.enum([
  "original",
  "realistic_anonymized",
  "redacted",
  "synthetic",
]);
const datasetCandidateStatusSchema = z.enum([
  "suggested",
  "reviewing",
  "ready",
  "committed",
  "dismissed",
  "superseded",
]);
const datasetCandidateSourceKindSchema = z.enum([
  "trace",
  "eval_result",
  "experiment_item_run",
  "production_measurement",
  "coverage_gap",
  "health_issue",
  "failure_cluster",
  "manual",
]);
const datasetHealthStatusSchema = z.enum([
  "ready",
  "needs_review",
  "low_confidence",
  "leakage_warning",
  "invalid",
]);
const providerKindSchema = z.enum([
  "openai",
  "anthropic",
  "azure_openai",
  "google_vertex",
  "bedrock",
  "openai_compatible",
  "local_harness",
  "custom_harness",
]);
const modelPurposeSchema = z.enum(["judge", "optimizer", "embedding", "replay", "default"]);

const searchResultSchema = <Item extends z.ZodTypeAny>(item: Item) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().optional().nullable(),
  });

const traceSummarySchema = z.object({
  id: z.string().min(1),
  serviceName: z.string().optional().nullable(),
  operationName: z.string().optional().nullable(),
  startedAt: dateTimeSchema,
  startedAtUnixNano: z.string().min(1),
  endedAt: dateTimeSchema.optional().nullable(),
  endedAtUnixNano: z.string().optional().nullable(),
  durationNano: z.string().optional().nullable(),
  durationMs: z.number().optional().nullable(),
  rootSpanId: z.string().optional().nullable(),
  status: traceStatusSchema.optional().nullable(),
  attributes: z.record(z.string(), z.unknown()),
  spanCount: z.number().int(),
  errorSpanCount: z.number().int(),
  logCount: z.number().int(),
  serviceCount: z.number().int(),
});
const traceSearchResultSchema = searchResultSchema(
  traceSummarySchema,
) as z.ZodType<TraceSearchResult>;

const tokenTotalsSchema = z
  .object({
    input: z.number().int().optional().nullable(),
    output: z.number().int().optional().nullable(),
    total: z.number().int().optional().nullable(),
  })
  .optional()
  .nullable();

const moneySchema = z
  .object({
    amount: z.number(),
    currency: z.string().min(1),
  })
  .optional()
  .nullable();

const evalResultSchema = z.object({
  id: z.string().min(1),
  scorerId: z.string().min(1),
  scorerVersion: z.number().int(),
  targetKind: evalTargetKindSchema,
  targetId: z.string().min(1),
  experimentRunId: z.string().optional().nullable(),
  score: z.number(),
  passed: z.boolean(),
  runMode: z.string().optional().nullable(),
  resultKind: z.string().optional().nullable(),
  metrics: z.unknown().optional().nullable(),
  breakdown: z.unknown().optional().nullable(),
  visualization: z
    .object({
      kind: z.string().min(1),
      title: z.string().optional().nullable(),
      data: z.unknown(),
    })
    .optional()
    .nullable(),
  evidence: z.unknown().optional().nullable(),
  problem: z.unknown().optional().nullable(),
  judgeRunRef: z.string().optional().nullable(),
  producedAt: dateTimeSchema,
});

const agentRunSchema = z.object({
  id: z.string().min(1),
  traceId: z.string().min(1),
  rootSpanId: z.string().min(1),
  agent: z.object({
    id: z.string().optional().nullable(),
    name: z.string().min(1),
    version: z.string().optional().nullable(),
  }),
  status: agentRunStatusSchema,
  startedAt: dateTimeSchema,
  endedAt: dateTimeSchema.optional().nullable(),
  durationMs: z.number().optional().nullable(),
  tokenTotals: tokenTotalsSchema,
  costEstimate: moneySchema,
  transcript: z.array(
    z.object({
      role: z.string().min(1),
      content: z.unknown().optional().nullable(),
      contentDigest: z.string().optional().nullable(),
      spanId: z.string().min(1),
      timestamp: dateTimeSchema.optional().nullable(),
    }),
  ),
  llmCalls: z.array(
    z.object({
      id: z.string().min(1),
      traceId: z.string().min(1),
      spanId: z.string().min(1),
      provider: z.string().optional().nullable(),
      requestModel: z.string().optional().nullable(),
      responseModel: z.string().optional().nullable(),
      latencyMs: z.number(),
      tokenTotals: tokenTotalsSchema,
      tokenDetails: z.unknown(),
    }),
  ),
  toolCalls: z.array(
    z.object({
      id: z.string().min(1),
      traceId: z.string().min(1),
      spanId: z.string().min(1),
      toolName: z.string().min(1),
      toolCallId: z.string().optional().nullable(),
      parametersDigest: z.string().optional().nullable(),
      resultDigest: z.string().optional().nullable(),
      latencyMs: z.number(),
      status: traceStatusSchema,
      synthetic: z.boolean(),
    }),
  ),
  retrievalEvents: z.array(
    z.object({
      id: z.string().min(1),
      traceId: z.string().min(1),
      spanId: z.string().min(1),
      documentCount: z.number().int(),
      topK: z.number().int().optional().nullable(),
      embeddingModel: z.string().optional().nullable(),
      latencyMs: z.number(),
      documentDigests: z.array(z.string()),
    }),
  ),
  evalResults: z.array(evalResultSchema),
  metricResults: z.array(z.record(z.string(), z.unknown())).default([]),
});

const aiEvalSourceRefSchema = z.object({
  kind: z.string().min(1),
  traceId: z.string().optional().nullable(),
  spanId: z.string().optional().nullable(),
  evaluationRunId: z.string().optional().nullable(),
  evaluationItemRunId: z.string().optional().nullable(),
  importJobId: z.string().optional().nullable(),
  candidateId: z.string().optional().nullable(),
  metadata: z.unknown(),
});
const datasetItemRevisionSchema = z.preprocess(
  (value) => {
    const item = value && typeof value === "object" ? compactNullish(value) : {};
    const now = "1970-01-01T00:00:00.000Z";
    return {
      id: item.id ?? "revision-unknown",
      datasetItemId: item.datasetItemId ?? item.id ?? "item-unknown",
      datasetId: item.datasetId ?? "",
      input: item.input ?? {},
      expected: item.expected ?? null,
      observedOutput: item.observedOutput ?? null,
      reason: typeof item.reason === "string" ? item.reason : "",
      metadata: item.metadata ?? {},
      sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : [],
      split: item.split ?? "validation",
      curationStatus: item.curationStatus ?? item.reviewStatus ?? "draft",
      curationNote: item.curationNote ?? null,
      contentTreatment: item.contentTreatment ?? "original",
      anonymizationProvenance: item.anonymizationProvenance ?? item.anonymization ?? null,
      createdAt: item.createdAt ?? now,
      createdBy: item.createdBy ?? "system",
      updatedAt: item.updatedAt ?? item.createdAt ?? now,
      updatedBy: item.updatedBy ?? item.createdBy ?? "system",
    };
  },
  z.object({
    id: z.string().min(1),
    datasetItemId: z.string().min(1),
    datasetId: z.string().min(1),
    input: z.unknown(),
    expected: z.unknown().optional().nullable(),
    observedOutput: z.unknown().optional().nullable(),
    reason: z.string(),
    metadata: z.unknown(),
    sourceRefs: z.array(aiEvalSourceRefSchema),
    split: datasetSplitSchema,
    curationStatus: datasetCurationStatusSchema,
    curationNote: z.string().optional().nullable(),
    contentTreatment: datasetContentTreatmentSchema,
    anonymizationProvenance: z.unknown().optional().nullable(),
    createdAt: dateTimeSchema,
    createdBy: z.string().min(1),
    updatedAt: dateTimeSchema,
    updatedBy: z.string().min(1),
  }),
);
const datasetItemSchema = z.preprocess(
  (value) => {
    const item = value && typeof value === "object" ? compactNullish(value) : {};
    const now = "1970-01-01T00:00:00.000Z";
    const latestRevision = item.latestRevision ?? {
      ...item,
      id: item.latestRevisionId ?? item.id ?? "revision-unknown",
      datasetItemId: item.id ?? item.datasetItemId ?? "item-unknown",
    };
    return {
      id: item.id ?? item.datasetItemId ?? "item-unknown",
      datasetId: item.datasetId ?? "",
      latestRevisionId: item.latestRevisionId ?? latestRevision.id ?? item.id ?? "revision-unknown",
      latestRevision,
      createdAt: item.createdAt ?? latestRevision.createdAt ?? now,
      createdBy: item.createdBy ?? latestRevision.createdBy ?? "system",
      updatedAt: item.updatedAt ?? latestRevision.updatedAt ?? item.createdAt ?? now,
      updatedBy: item.updatedBy ?? latestRevision.updatedBy ?? item.createdBy ?? "system",
    };
  },
  z.object({
    id: z.string().min(1),
    datasetId: z.string().min(1),
    latestRevisionId: z.string().min(1),
    latestRevision: datasetItemRevisionSchema,
    createdAt: dateTimeSchema,
    createdBy: z.string().min(1),
    updatedAt: dateTimeSchema,
    updatedBy: z.string().min(1),
  }),
);

const datasetCandidateSchema = z.object({
  id: z.string().min(1),
  datasetId: z.string().optional().nullable(),
  status: datasetCandidateStatusSchema,
  sourceKind: datasetCandidateSourceKindSchema,
  source: z.unknown(),
  targetShape: datasetTargetShapeSchema,
  input: z.unknown().optional().nullable(),
  expected: z.unknown().optional().nullable(),
  metadata: z.unknown(),
  split: datasetSplitSchema,
  reviewStatus: datasetReviewStatusSchema,
  contentTreatment: datasetContentTreatmentSchema,
  anonymization: z
    .object({
      policyId: z.string().min(1),
      policyVersion: z.number().int().min(1),
      transformedAt: dateTimeSchema,
      consistencyScope: z.string().min(1),
      transformedFields: z.array(
        z.object({
          path: z.string().min(1),
          entityType: z.string().min(1),
          strategy: z.string().min(1),
        }),
      ),
    })
    .optional()
    .nullable(),
  reason: z.string().min(1),
  clusterId: z.string().optional().nullable(),
  warnings: z.array(z.string()),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
});

const datasetImportFormatSchema = z.enum(["jsonl", "json_array", "csv", "zip"]);
const datasetExportFormatSchema = z.enum(["jsonl", "json_array", "csv"]);
const datasetImportStatusSchema = z.enum([
  "staged",
  "preview_ready",
  "committed",
  "failed",
  "expired",
]);
const datasetExportStatusSchema = z.enum(["queued", "ready", "failed", "expired"]);
const datasetImportIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional().nullable(),
});
const datasetItemPreviewSchema = z.preprocess(
  (value) => {
    const item = value && typeof value === "object" ? compactNullish(value) : {};
    return {
      input: item.input ?? {},
      expected: item.expected ?? null,
      observedOutput: item.observedOutput ?? null,
      reason: typeof item.reason === "string" ? item.reason : "",
      metadata: item.metadata ?? {},
      split: item.split ?? "validation",
      curationStatus: item.curationStatus ?? item.reviewStatus ?? "needs_review",
      sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : [],
    };
  },
  z.object({
    input: z.unknown(),
    expected: z.unknown().optional().nullable(),
    observedOutput: z.unknown().optional().nullable(),
    reason: z.string(),
    metadata: z.unknown(),
    split: datasetSplitSchema,
    curationStatus: datasetCurationStatusSchema,
    sourceRefs: z.array(aiEvalSourceRefSchema),
  }),
);
const datasetImportJobSchema = z.object({
  id: z.string().min(1),
  datasetId: z.string().min(1),
  status: datasetImportStatusSchema,
  format: datasetImportFormatSchema,
  sourceFiles: z.array(
    z.object({
      path: z.string().min(1),
      format: datasetImportFormatSchema,
      sizeBytes: z.number().int().min(0),
      rowCount: z.number().int().optional().nullable(),
      sha256: z.string().min(1),
    }),
  ),
  mapping: z.unknown(),
  defaults: z.unknown(),
  previewRows: z.array(
    z.object({
      rowNumber: z.number().int().min(1),
      filePath: z.string().min(1),
      item: datasetItemPreviewSchema.optional().nullable(),
      errors: z.array(datasetImportIssueSchema),
      warnings: z.array(datasetImportIssueSchema),
    }),
  ),
  totalRows: z.number().int().min(0),
  validRows: z.number().int().min(0),
  errorRows: z.number().int().min(0),
  warnings: z.array(z.string()),
  createdAt: dateTimeSchema,
  expiresAt: dateTimeSchema,
  committedDatasetVersion: z.number().int().optional().nullable(),
});
const datasetExportJobSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") {
      return value;
    }
    const job = value as Record<string, unknown>;
    const datasetId = typeof job.datasetId === "string" ? job.datasetId : "";
    const datasetVersion =
      typeof job.datasetVersion === "number" && Number.isInteger(job.datasetVersion)
        ? job.datasetVersion
        : 1;
    return {
      ...job,
      datasetVersionId:
        typeof job.datasetVersionId === "string" && job.datasetVersionId.length > 0
          ? job.datasetVersionId
          : `${datasetId}:version:${datasetVersion}`,
    };
  },
  z.object({
    id: z.string().min(1),
    datasetId: z.string().min(1),
    datasetVersionId: z.string().min(1),
    datasetVersion: z.number().int().min(1),
    status: datasetExportStatusSchema,
    format: datasetExportFormatSchema,
    rowCount: z.number().int().min(0),
    sizeBytes: z.number().int().min(0).optional().nullable(),
    sha256: z.string().optional().nullable(),
    downloadUrl: z.string().optional().nullable(),
    createdAt: dateTimeSchema,
    expiresAt: dateTimeSchema,
  }),
);

const datasetHealthSchema = z.preprocess(
  (value) => ({
    ...defaultDatasetHealth(),
    ...(value && typeof value === "object" ? compactNullish(value) : {}),
  }),
  z.object({
    status: datasetHealthStatusSchema,
    readyItemCount: z.number().int(),
    totalItemCount: z.number().int(),
    splitCounts: z.unknown(),
    duplicateCandidateCount: z.number().int(),
    leakageWarningCount: z.number().int(),
    missingExpectedCount: z.number().int(),
    schemaIssueCount: z.number().int(),
    smallDataset: z.boolean(),
    warnings: z.array(z.string()),
  }),
);

function defaultDatasetHealth() {
  return {
    status: "needs_review",
    readyItemCount: 0,
    totalItemCount: 0,
    splitCounts: {},
    duplicateCandidateCount: 0,
    leakageWarningCount: 0,
    missingExpectedCount: 0,
    schemaIssueCount: 0,
    smallDataset: true,
    warnings: [],
  };
}

const datasetSettingsSchema = z.preprocess(
  (value) => {
    const defaults = defaultDatasetSettings();
    const settings = value && typeof value === "object" ? compactNullish(value) : {};
    const intakePolicy =
      settings.intakePolicy && typeof settings.intakePolicy === "object"
        ? compactNullish(settings.intakePolicy)
        : {};
    return {
      ...defaults,
      ...settings,
      intakePolicy: {
        ...defaults.intakePolicy,
        ...intakePolicy,
      },
      defaultMetricSettings: Array.isArray(settings.defaultMetricSettings)
        ? settings.defaultMetricSettings
        : defaults.defaultMetricSettings,
    };
  },
  z.object({
    evaluationFamily: evaluationFamilySchema,
    inputType: datasetValueTypeSchema,
    expectedType: datasetValueTypeSchema,
    inputJsonSchema: z.unknown().optional().nullable(),
    expectedJsonSchema: z.unknown().optional().nullable(),
    defaultSplit: datasetSplitSchema,
    intakePolicy: z.object({
      manualDefaultStatus: datasetCurationStatusSchema,
      importDefaultStatus: datasetCurationStatusSchema,
      traceDefaultStatus: datasetCurationStatusSchema,
    }),
    traceExtractionSettings: z.unknown().optional().nullable(),
    anonymizationPolicy: z.unknown().optional().nullable(),
    defaultMetricSettings: z.array(z.unknown()),
    retentionProfile: retentionProfileSchema,
  }),
);

function defaultDatasetSettings() {
  return {
    evaluationFamily: "classification",
    inputType: "json",
    expectedType: "json",
    defaultSplit: "validation",
    intakePolicy: {
      manualDefaultStatus: "draft",
      importDefaultStatus: "needs_review",
      traceDefaultStatus: "needs_expected",
    },
    defaultMetricSettings: [],
    retentionProfile: "balanced",
  };
}

const datasetVersionSchema = z.preprocess(
  (value) => {
    const version = value && typeof value === "object" ? compactNullish(value) : {};
    return {
      id: version.id ?? "version-1",
      datasetId: version.datasetId ?? "",
      version: typeof version.version === "number" ? version.version : 1,
      digest: typeof version.digest === "string" ? version.digest : "digest-unknown",
      createdAt: version.createdAt ?? "1970-01-01T00:00:00.000Z",
      createdBy: version.createdBy ?? "system",
      settingsSnapshot: version.settingsSnapshot ?? defaultDatasetSettings(),
      itemRevisionIds: Array.isArray(version.itemRevisionIds) ? version.itemRevisionIds : [],
      parentVersionId: version.parentVersionId ?? null,
      changeSummary: version.changeSummary ?? null,
      source: version.source ?? "manual",
    };
  },
  z.object({
    id: z.string().min(1),
    datasetId: z.string(),
    version: z.number().int().min(1),
    digest: z.string().min(1),
    createdAt: dateTimeSchema,
    createdBy: z.string().min(1),
    settingsSnapshot: datasetSettingsSchema,
    itemRevisionIds: z.array(z.string()),
    parentVersionId: z.string().optional().nullable(),
    changeSummary: z.string().optional().nullable(),
    source: datasetVersionSourceSchema,
  }),
);

const datasetSchema = z.preprocess(
  (value) => {
    const dataset = value && typeof value === "object" ? compactNullish(value) : {};
    const itemCount = typeof dataset.itemCount === "number" ? dataset.itemCount : 0;
    const readyItemCount =
      typeof dataset.readyItemCount === "number"
        ? dataset.readyItemCount
        : typeof dataset.reviewedItemCount === "number"
          ? dataset.reviewedItemCount
          : 0;
    const version =
      typeof dataset.currentVersion === "number"
        ? dataset.currentVersion
        : typeof dataset.version === "number"
          ? dataset.version
          : 1;
    const currentVersionId =
      typeof dataset.currentVersionId === "string" && dataset.currentVersionId.length > 0
        ? dataset.currentVersionId
        : `${String(dataset.id ?? "dataset")}:version:${version}`;
    const createdAt =
      typeof dataset.createdAt === "string" ? dataset.createdAt : "1970-01-01T00:00:00.000Z";
    const splitCounts =
      dataset.splitCounts && typeof dataset.splitCounts === "object" ? dataset.splitCounts : {};
    const settings = dataset.settings ?? defaultDatasetSettings();
    return {
      ...dataset,
      projectId: typeof dataset.projectId === "string" ? dataset.projectId : "",
      currentVersionId,
      currentVersion: {
        id: currentVersionId,
        datasetId: typeof dataset.id === "string" ? dataset.id : "",
        version,
        digest:
          typeof dataset.currentDigest === "string"
            ? dataset.currentDigest
            : typeof dataset.digest === "string"
              ? dataset.digest
              : "digest-unknown",
        createdAt,
        createdBy: typeof dataset.createdBy === "string" ? dataset.createdBy : "system",
        settingsSnapshot: settings,
        itemRevisionIds: Array.isArray(dataset.itemRevisionIds) ? dataset.itemRevisionIds : [],
        source: "manual",
        ...(dataset.currentVersion && typeof dataset.currentVersion === "object"
          ? compactNullish(dataset.currentVersion)
          : {}),
      },
      settings,
      createdAt,
      createdBy: typeof dataset.createdBy === "string" ? dataset.createdBy : "system",
      updatedAt: typeof dataset.updatedAt === "string" ? dataset.updatedAt : createdAt,
      updatedBy: typeof dataset.updatedBy === "string" ? dataset.updatedBy : "system",
      itemCount,
      readyItemCount,
      splitCounts,
      health: {
        ...defaultDatasetHealth(),
        totalItemCount: itemCount,
        readyItemCount,
        splitCounts,
        ...(dataset.health && typeof dataset.health === "object"
          ? compactNullish(dataset.health)
          : {}),
      },
      tags: Array.isArray(dataset.tags) ? dataset.tags : [],
    };
  },
  z.object({
    id: z.string().min(1),
    projectId: z.string(),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    currentVersionId: z.string().min(1),
    currentVersion: datasetVersionSchema,
    settings: datasetSettingsSchema,
    createdAt: dateTimeSchema,
    createdBy: z.string().min(1),
    updatedAt: dateTimeSchema,
    updatedBy: z.string().min(1),
    itemCount: z.number().int(),
    readyItemCount: z.number().int(),
    splitCounts: z.unknown(),
    health: datasetHealthSchema,
    tags: z.array(z.string()),
    items: z.unknown().optional(),
  }),
);

const scorerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: scorerKindSchema,
  definition: z.unknown(),
  judgeModelRef: z.string().optional().nullable(),
  version: z.number().int(),
  calibration: z.unknown().optional().nullable(),
});

const datasetSplitSelectorSchema = z.object({
  splits: z.array(datasetSplitSchema),
  reviewedOnly: z.boolean(),
  includeSynthetic: z.boolean(),
});

const versionedRefSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
});

const evalSolverRefSchema = z.object({
  kind: evalSolverKindSchema,
  name: z.string().min(1),
  promptVersion: versionedRefSchema.optional().nullable(),
  agentRef: z.string().optional().nullable(),
  workflowRef: z.string().optional().nullable(),
  skillSnapshotRef: z.string().optional().nullable(),
  toolSnapshotRef: z.string().optional().nullable(),
  modelAlias: z.string().optional().nullable(),
  providerProfileId: z.string().optional().nullable(),
});

const evalBaselineRefSchema = z.object({
  kind: evalBaselineKindSchema,
  experimentRunId: z.string().optional().nullable(),
  promptVersion: versionedRefSchema.optional().nullable(),
  solverRef: evalSolverRefSchema.optional().nullable(),
});

const optimizationConfigSchema = z.object({
  optimizerKind: optimizerKindSchema,
  bootstrapFewshot: z
    .object({
      candidateCount: z.number().int(),
      maxExamplesPerCandidate: z.number().int(),
      selectionScorerIds: z.array(z.string()),
      seed: z.number().int(),
      diversityStrategy: bootstrapFewshotDiversityStrategySchema,
    })
    .optional()
    .nullable(),
  criticMutateJudgePick: z
    .object({
      candidateCount: z.number().int(),
      mutationInstructions: z.string(),
      judgeScorerIds: z.array(z.string()),
      seed: z.number().int(),
      maxRounds: z.number().int(),
      keepTopK: z.number().int().optional().nullable(),
    })
    .optional()
    .nullable(),
});

const evalRunPolicySchema = z.object({
  maxParallelRequests: z.number().int(),
  tokenBudget: z.unknown().optional().nullable(),
  costBudget: z.unknown().optional().nullable(),
  rateLimit: z.unknown().optional().nullable(),
  retry: z.unknown().optional().nullable(),
  timeout: z.unknown().optional().nullable(),
  failureBudget: z.unknown().optional().nullable(),
  backpressure: z.unknown().optional().nullable(),
  checkpoint: z.unknown().optional().nullable(),
  quarantine: z.unknown().optional().nullable(),
  workspaceQuota: z.unknown().optional().nullable(),
  cleanupRetry: z.unknown().optional().nullable(),
});

const experimentRunSummarySchema = z.object({
  itemCounts: z.object({
    total: z.number().int(),
    passed: z.number().int(),
    failed: z.number().int(),
    errored: z.number().int(),
    skipped: z.number().int(),
    needsReview: z.number().int(),
    quarantined: z.number().int(),
  }),
  scoreSummaries: z.array(
    z.object({
      scorerId: z.string().min(1),
      scorerVersion: z.number().int(),
      resultKind: z.string().optional().nullable(),
      passRate: z.number(),
      meanScore: z.number(),
      p50: z.number().optional().nullable(),
      p95: z.number().optional().nullable(),
      support: z.number().int(),
      visualization: z.unknown().optional().nullable(),
    }),
  ),
  problemCounts: z.object({
    modelQuality: z.number().int(),
    itemQuality: z.number().int(),
    scorerConfig: z.number().int(),
    infrastructure: z.number().int(),
  }),
  budgetUsage: z.object({
    inputTokens: z.number().int(),
    outputTokens: z.number().int(),
    totalTokens: z.number().int(),
    estimatedUsd: z.number(),
  }),
  latency: z.unknown().optional().nullable(),
  regressions: z.array(z.unknown()),
});

const experimentSchema = z.preprocess(
  (value) => {
    const experiment = value && typeof value === "object" ? compactNullish(value) : {};
    return {
      ...experiment,
      splitSelector: {
        splits: ["validation"],
        reviewedOnly: true,
        includeSynthetic: false,
        ...(experiment.splitSelector && typeof experiment.splitSelector === "object"
          ? compactNullish(experiment.splitSelector)
          : {}),
      },
      promptVersionRefs: Array.isArray(experiment.promptVersionRefs)
        ? experiment.promptVersionRefs
        : [],
      skillSnapshotRefs: Array.isArray(experiment.skillSnapshotRefs)
        ? experiment.skillSnapshotRefs
        : [],
      toolSnapshotRefs: Array.isArray(experiment.toolSnapshotRefs)
        ? experiment.toolSnapshotRefs
        : [],
      providerProfileRefs: Array.isArray(experiment.providerProfileRefs)
        ? experiment.providerProfileRefs
        : [],
      tags: Array.isArray(experiment.tags) ? experiment.tags : [],
    };
  },
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    datasetId: z.string().min(1),
    datasetVersion: z.number().int(),
    splitSelector: datasetSplitSelectorSchema,
    scorerIds: z.array(z.string().min(1)),
    baselineRef: evalBaselineRefSchema.optional().nullable(),
    promptVersionRefs: z.array(z.string()),
    skillSnapshotRefs: z.array(z.string()),
    toolSnapshotRefs: z.array(z.string()),
    providerProfileRefs: z.array(z.string()),
    createdAt: dateTimeSchema,
    tags: z.array(z.string()),
    runs: z.unknown().optional(),
  }),
);

const datasetItemRunSchema = z.object({
  id: z.string().min(1),
  experimentRunId: z.string().min(1),
  datasetItemId: z.string().min(1),
  harnessRunId: z.string().optional().nullable(),
  output: z.unknown(),
  latencyMs: z.number(),
  tokenTotals: tokenTotalsSchema,
  evalResults: z.array(evalResultSchema),
});

const experimentRunSchema = z.object({
  id: z.string().min(1),
  experimentId: z.string().min(1),
  solverRef: evalSolverRefSchema,
  manifest: z
    .object({
      digest: z.string().min(1),
      datasetId: z.string().min(1),
      datasetVersion: z.number().int(),
      splitSelector: datasetSplitSelectorSchema,
      scorerRefs: z.array(versionedRefSchema),
      baselineRef: evalBaselineRefSchema.optional().nullable(),
      solverRef: evalSolverRefSchema,
      optimizationConfig: optimizationConfigSchema.optional().nullable(),
      promptVersionRefs: z.array(z.string()),
      skillSnapshotRefs: z.array(z.string()),
      toolSnapshotRefs: z.array(z.string()),
      providerProfileRefs: z.array(z.string()),
      budget: z.unknown(),
      concurrency: z.unknown(),
      createdAt: dateTimeSchema,
    })
    .optional()
    .nullable(),
  baselineRunId: z.string().optional().nullable(),
  status: experimentRunStatusSchema,
  runPolicy: evalRunPolicySchema,
  startedAt: dateTimeSchema,
  endedAt: dateTimeSchema.optional().nullable(),
  summary: experimentRunSummarySchema,
  itemRuns: z.unknown().optional(),
});

const aiEvalObjectSchema = z.object({}).passthrough() as z.ZodType<Record<string, unknown>>;
const evaluationDefinitionSchema = aiEvalObjectSchema as unknown as z.ZodType<EvaluationDefinition>;
const evaluationRunSchema = aiEvalObjectSchema as unknown as z.ZodType<EvaluationRun>;
const evaluationItemRunSchema = aiEvalObjectSchema as unknown as z.ZodType<EvaluationItemRun>;
const metricResultSchema = aiEvalObjectSchema as unknown as z.ZodType<MetricResult>;
const evaluationComparisonSchema = aiEvalObjectSchema as unknown as z.ZodType<EvaluationComparison>;
const optimizationRunSchema = aiEvalObjectSchema as unknown as z.ZodType<OptimizationRun>;
const targetSnapshotSchema = aiEvalObjectSchema as unknown as z.ZodType<TargetSnapshot>;
const targetDiffSchema = aiEvalObjectSchema as unknown as z.ZodType<TargetDiff>;
const promotionRecordSchema = aiEvalObjectSchema as unknown as z.ZodType<PromotionRecord>;

const promptVersionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  text: z.string(),
  variableSchema: z.unknown().optional().nullable(),
  metadata: z.unknown().optional().nullable(),
  hash: z.string().min(1),
  tag: z.string().optional().nullable(),
  createdAt: dateTimeSchema,
  notes: z.string().optional().nullable(),
});

const annotationQueueItemSchema = z.object({
  id: z.string().min(1),
  targetTraceId: z.string().min(1),
  targetSpanId: z.string().optional().nullable(),
  reason: z.string().min(1),
  assignedTo: z.string().optional().nullable(),
  status: annotationStatusSchema,
  createdAt: dateTimeSchema,
  resolvedDatasetItemId: z.string().optional().nullable(),
  scorerId: z.string().optional().nullable(),
  score: z.number().optional().nullable(),
  evidence: z.unknown().optional().nullable(),
});

const annotationRuleSchema = z.object({
  reason: z.string().min(1),
  threshold: z.number().optional().nullable(),
  assignTo: z.string().optional().nullable(),
  datasetId: z.string().optional().nullable(),
});

const providerProfileSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  label: z.string().min(1),
  providerKind: providerKindSchema,
  baseUrl: z.string().optional().nullable(),
  credentialRef: z.string().optional().nullable(),
  models: z.unknown(),
  timeoutMs: z.number().int(),
  maxConcurrency: z.number().int().optional().nullable(),
  disabledAt: dateTimeSchema.optional().nullable(),
});

const modelAliasSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  providerProfileId: z.string().min(1),
  model: z.string().min(1),
  purpose: modelPurposeSchema,
  parameters: z.unknown(),
});

const onlineEvaluationPolicySchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
  name: z.string().min(1),
  target: z.unknown(),
  scorerIds: z.array(z.string().min(1)).optional(),
  metricIds: z.array(z.string().min(1)).optional(),
  sampleRate: z.number(),
  maxDailyRuns: z.number().int().optional().nullable(),
  annotationRules: z.array(annotationRuleSchema),
  updatedAt: dateTimeSchema,
  updatedByUserId: z.string().min(1),
});

const aiEvalBudgetSchema = z.object({
  dailyUsd: z.number(),
  perRunUsd: z.number().optional().nullable(),
  deterministicOnly: z.boolean(),
  spentTodayUsd: z.number(),
});

const aiEvalSamplingSchema = z.object({
  defaultOnlineSampleRate: z.number(),
  maxOnlineSampleRate: z.number(),
  maxConcurrentExperimentItems: z.number().int().optional(),
  maxConcurrentEvaluationItems: z.number().int().optional(),
  maxConcurrentOptimizationCandidates: z.number().int(),
});

const datasetDefaultsSchema = z.object({
  splitAllocation: z.unknown(),
  smallDatasetReviewedThreshold: z.number().int().optional(),
  requireReviewForRegression: z.boolean().optional(),
  smallDatasetReadyThreshold: z.number().int().optional(),
  requireReadyForTest: z.boolean().optional(),
});

const projectAiSettingsSchema = z.object({
  projectId: z.string().min(1),
  enabled: z.boolean(),
  defaultProviderProfileId: z.string().optional().nullable(),
  defaultJudgeProfileId: z.string().optional().nullable(),
  defaultOptimizerProfileId: z.string().optional().nullable(),
  defaultEmbeddingProfileId: z.string().optional().nullable(),
  providerProfiles: z.array(providerProfileSchema),
  modelAliases: z.array(modelAliasSchema),
  onlinePolicies: z.array(onlineEvaluationPolicySchema),
  budget: aiEvalBudgetSchema,
  sampling: aiEvalSamplingSchema,
  datasetDefaults: datasetDefaultsSchema,
  effective: z.object({
    warnings: z.array(z.string()),
    deterministicOnly: z.boolean(),
    missingProviderProfiles: z.array(z.string()),
    disabledProviderProfiles: z.array(z.string()),
    budgetExhausted: z.boolean(),
  }),
  version: z.number().int(),
  updatedAt: dateTimeSchema,
  updatedByUserId: z.string().min(1),
});

const aiProviderSecretSchema = z.object({
  credentialRef: z.string().min(1),
  value: z.string().min(1),
});

const aiQualityOverviewSchema = z.object({
  projectId: z.string().min(1),
  from: dateTimeSchema.optional().nullable(),
  to: dateTimeSchema.optional().nullable(),
  summary: z.unknown(),
  segments: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      dimensions: z.unknown(),
      runCount: z.number().int(),
      scoredRunCount: z.number().int(),
      passRate: z.number().optional().nullable(),
      meanScore: z.number().optional().nullable(),
      p50LatencyMs: z.number().optional().nullable(),
      p95LatencyMs: z.number().optional().nullable(),
      costUsd: z.number().optional().nullable(),
      regressionCount: z.number().int(),
    }),
  ),
  warnings: z.array(z.string()),
});

const dashboardLayoutSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
  minW: z.number().int().min(1).max(12),
  minH: z.number().int().min(1).max(12),
});
const dashboardThresholdSchema = z.object({
  value: z.number(),
  severity: dashboardThresholdSeveritySchema,
  label: z.string().optional().nullable(),
});
const dashboardMetricWidgetSchema = z.object({
  metricName: z.string().min(1),
  aggregation: metricAggregationSchema,
  groupBy: z.array(z.string()).default([]),
  filters: z.array(attributeFilterSchema).default([]),
  timeWindow: z.string().min(1),
  interval: z.string().optional().nullable(),
  visualization: metricChartTypeSchema,
  legend: z.boolean(),
  maxSeries: z.number().int().min(1).max(50),
  thresholds: z.array(dashboardThresholdSchema).default([]),
});
const dashboardMetricFormulaExpressionSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    kind: z.enum(["ref", "number", "binary", "unary", "function"]),
    refId: z.string().optional().nullable(),
    value: z.number().optional().nullable(),
    operator: z.enum(["add", "subtract", "multiply", "divide"]).optional().nullable(),
    left: dashboardMetricFormulaExpressionSchema.optional().nullable(),
    right: dashboardMetricFormulaExpressionSchema.optional().nullable(),
    function: z
      .enum([
        "sum_series",
        "avg_series",
        "min_series",
        "max_series",
        "ratio",
        "clamp_min",
        "clamp_max",
        "moving_average",
      ])
      .optional()
      .nullable(),
    arguments: z.array(dashboardMetricFormulaExpressionSchema).default([]),
  }),
);
const dashboardMetricQuerySchema = z.object({
  timeWindow: z.string().min(1),
  interval: z.string().optional().nullable(),
  queries: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      metricName: z.string().min(1),
      aggregation: metricAggregationSchema,
      groupBy: z.array(z.string()).default([]),
      filters: z.array(attributeFilterSchema).default([]),
      maxSeries: z.number().int().min(1).max(50),
    }),
  ),
  formulas: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        expression: dashboardMetricFormulaExpressionSchema,
        unit: z.string().optional().nullable(),
      }),
    )
    .default([]),
  displaySeries: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        sourceId: z.string().min(1),
        visible: z.boolean(),
      }),
    )
    .default([]),
});
const dashboardRichMetricWidgetSchema = z.object({
  query: dashboardMetricQuerySchema,
  visualization: metricChartTypeSchema,
  legend: z.boolean(),
  maxSeries: z.number().int().min(1).max(50),
  thresholds: z.array(dashboardThresholdSchema).default([]),
});
const dashboardLogWidgetSchema = z.object({
  service: z.string().optional().nullable(),
  traceId: z.string().optional().nullable(),
  spanId: z.string().optional().nullable(),
  severity: z.string().optional().nullable(),
  search: z.string().optional().nullable(),
  attributes: z.array(attributeFilterSchema),
  sort: logSortSchema,
  limit: z.number().int().min(1).max(200),
  columns: z.array(dashboardLogColumnSchema),
});
const dashboardTraceWidgetSchema = z.object({
  service: z.string().optional().nullable(),
  query: z.string().optional().nullable(),
  operationName: z.string().optional().nullable(),
  spanName: z.string().optional().nullable(),
  status: traceStatusSchema.optional().nullable(),
  minDurationMs: z.number().optional().nullable(),
  maxDurationMs: z.number().optional().nullable(),
  attributes: z.array(attributeFilterSchema),
  sort: traceSortSchema,
  limit: z.number().int().min(1).max(200),
  columns: z.array(dashboardTraceColumnSchema),
});
const dashboardLiveTraceWidgetSchema = z.object({
  service: z.string().optional().nullable(),
  query: z.string().optional().nullable(),
  operationName: z.string().optional().nullable(),
  spanName: z.string().optional().nullable(),
  status: traceStatusSchema.optional().nullable(),
  minDurationMs: z.number().optional().nullable(),
  maxDurationMs: z.number().optional().nullable(),
  attributes: z.array(attributeFilterSchema),
  limit: z.number().int().min(1).max(200),
});
const alertSeveritySchema = z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]);
const alertStateSchema = z.enum(["OK", "PENDING", "FIRING", "RESOLVED", "SILENCED", "ERROR"]);
const alertSignalSchema = z.enum(["METRIC", "LOG", "TRACE"]);
const dashboardAlertWidgetSchema = z.object({
  ruleIds: z.array(z.string()).default([]),
  states: z.array(alertStateSchema).default([]),
  severities: z.array(alertSeveritySchema).default([]),
  signals: z.array(alertSignalSchema).default([]),
  timeWindow: z.string().min(1),
  limit: z.number().int().min(1).max(100),
});
const dashboardWidgetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  kind: dashboardWidgetKindSchema,
  layout: dashboardLayoutSchema,
  metric: dashboardMetricWidgetSchema.optional().nullable(),
  richMetric: dashboardRichMetricWidgetSchema.optional().nullable(),
  logs: dashboardLogWidgetSchema.optional().nullable(),
  traces: dashboardTraceWidgetSchema.optional().nullable(),
  liveTraces: dashboardLiveTraceWidgetSchema.optional().nullable(),
  alert: dashboardAlertWidgetSchema.optional().nullable(),
});
const dashboardSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()),
  version: z.number().int().min(1),
  visibility: dashboardVisibilitySchema,
  defaultTimeWindow: z.string().min(1),
  pinned: z.boolean(),
  widgets: z.array(dashboardWidgetSchema),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  createdBy: z.string().optional().nullable(),
  updatedBy: z.string().optional().nullable(),
}) as unknown as z.ZodType<Dashboard>;
const dashboardListResultSchema = z.object({
  items: z.array(dashboardSchema),
  pinnedDashboardIds: z.array(z.string()),
}) as unknown as z.ZodType<DashboardListResult>;
const dashboardSaveResponseSchema = z.object({
  dashboard: dashboardSchema,
}) as unknown as z.ZodType<{ dashboard: Dashboard }>;
const dashboardDeleteResponseSchema = z.object({
  deleted: z.boolean(),
});
const dashboardPreferencesSchema = z.object({
  projectId: z.string().min(1),
  pinnedDashboardIds: z.array(z.string()),
  updatedAt: dateTimeSchema,
}) as unknown as z.ZodType<DashboardPreferences>;

const ingestCredentialSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  secretPreview: z.string().min(1),
  createdAt: dateTimeSchema,
  lastUsedAt: dateTimeSchema.optional().nullable(),
  revokedAt: dateTimeSchema.optional().nullable(),
  createdByUserId: z.string().min(1),
}) as unknown as z.ZodType<IngestCredential>;
const ingestCredentialListResultSchema = z.object({
  items: z.array(ingestCredentialSchema),
}) as unknown as z.ZodType<IngestCredentialListResult>;
const createdIngestCredentialSchema = z.object({
  credential: ingestCredentialSchema,
  secret: z.string().min(1),
}) as unknown as z.ZodType<CreatedIngestCredential>;
const ingestCredentialRevokeResponseSchema = z.object({
  credential: ingestCredentialSchema,
}) as unknown as z.ZodType<{ credential: IngestCredential }>;

const typedDatasetSchema = datasetSchema as unknown as z.ZodType<Dataset>;
const typedDatasetImportJobSchema =
  datasetImportJobSchema as unknown as z.ZodType<DatasetImportJob>;
const typedDatasetExportJobSchema =
  datasetExportJobSchema as unknown as z.ZodType<DatasetExportJob>;
const typedDatasetItemSchema = datasetItemSchema as unknown as z.ZodType<DatasetItem>;
const typedDatasetCandidateSchema =
  datasetCandidateSchema as unknown as z.ZodType<DatasetCandidate>;
const typedScorerSchema = scorerSchema as unknown as z.ZodType<Scorer>;
const typedExperimentSchema = experimentSchema as unknown as z.ZodType<Experiment>;
const typedExperimentRunSchema = experimentRunSchema as unknown as z.ZodType<ExperimentRun>;
const typedPromptVersionSchema = promptVersionSchema as unknown as z.ZodType<PromptVersion>;
const typedAnnotationQueueItemSchema =
  annotationQueueItemSchema as unknown as z.ZodType<AnnotationQueueItem>;
const typedAiQualityOverviewSchema =
  aiQualityOverviewSchema as unknown as z.ZodType<AiQualityOverview>;
const projectAiSettingsResponseSchema = z.object({
  settings: projectAiSettingsSchema,
}) as unknown as z.ZodType<{ settings: ProjectAiSettings }>;

const experimentRunEventSchema = z.object({
  type: z.enum([
    "started",
    "item_completed",
    "progress",
    "heartbeat",
    "cancelled",
    "failed",
    "completed",
  ]),
  seq: z.number().int().min(1),
  receivedAt: dateTimeSchema,
  experimentRunId: z.string().optional(),
  run: experimentRunSchema.optional().nullable(),
  itemRun: datasetItemRunSchema.optional().nullable(),
});

const evaluationRunEventSchema = z.object({
  type: z.enum([
    "started",
    "item_completed",
    "progress",
    "heartbeat",
    "cancelled",
    "failed",
    "completed",
  ]),
  seq: z.number().int().min(1),
  receivedAt: dateTimeSchema.optional(),
  occurredAt: dateTimeSchema.optional(),
  run: evaluationRunSchema.optional().nullable(),
  itemRun: evaluationItemRunSchema.optional().nullable(),
});

const agentRunSearchResultSchema = searchResultSchema(
  agentRunSchema,
) as unknown as z.ZodType<AgentRunSearchResult>;
const datasetSearchResultSchema = searchResultSchema(
  datasetSchema,
) as unknown as z.ZodType<DatasetSearchResult>;
const datasetItemSearchResultSchema = searchResultSchema(
  datasetItemSchema,
) as unknown as z.ZodType<DatasetItemSearchResult>;
const datasetCandidateSearchResultSchema = searchResultSchema(
  typedDatasetCandidateSchema,
) as unknown as z.ZodType<DatasetCandidateSearchResult>;
const scorerSearchResultSchema = searchResultSchema(
  scorerSchema,
) as unknown as z.ZodType<ScorerSearchResult>;
const experimentSearchResultSchema = searchResultSchema(
  experimentSchema,
) as unknown as z.ZodType<ExperimentSearchResult>;
const experimentRunSearchResultSchema = searchResultSchema(
  experimentRunSchema,
) as unknown as z.ZodType<ExperimentRunSearchResult>;
const datasetItemRunSearchResultSchema = searchResultSchema(
  datasetItemRunSchema,
) as unknown as z.ZodType<DatasetItemRunSearchResult>;
const evalResultSearchResultSchema = searchResultSchema(
  evalResultSchema,
) as unknown as z.ZodType<EvalResultSearchResult>;
const evaluationDefinitionSearchResultSchema = searchResultSchema(
  evaluationDefinitionSchema,
) as unknown as z.ZodType<EvaluationDefinitionSearchResult>;
const evaluationRunSearchResultSchema = searchResultSchema(
  evaluationRunSchema,
) as unknown as z.ZodType<EvaluationRunSearchResult>;
const evaluationItemRunSearchResultSchema = searchResultSchema(
  evaluationItemRunSchema,
) as unknown as z.ZodType<EvaluationItemRunSearchResult>;
const metricResultSearchResultSchema = searchResultSchema(
  metricResultSchema,
) as unknown as z.ZodType<MetricResultSearchResult>;
const evaluationComparisonSearchResultSchema = searchResultSchema(
  evaluationComparisonSchema,
) as unknown as z.ZodType<EvaluationComparisonSearchResult>;
const optimizationRunSearchResultSchema = searchResultSchema(
  optimizationRunSchema,
) as unknown as z.ZodType<OptimizationRunSearchResult>;
const annotationQueueResultSchema = searchResultSchema(
  annotationQueueItemSchema,
) as unknown as z.ZodType<AnnotationQueueResult>;
const liveStartDataSchema = z.object({ subscriptionId: z.string().min(1) });

const liveTraceEventSchema = z.object({
  type: z.enum(["snapshot", "added", "updated", "heartbeat"]),
  seq: z.number().int().min(0),
  receivedAt: z.string().datetime({ offset: true }),
  trace: z.unknown().optional().nullable(),
});

function parseLiveTraceEvent(value: unknown): LiveTraceEvent {
  try {
    return parseWithZod(liveTraceEventSchema, value, "live trace event") as LiveTraceEvent;
  } catch {
    throw graphQLErrorFromBridge(responseContractInvalidError);
  }
}

function parseExperimentRunEvent(value: unknown): ExperimentRunEvent {
  try {
    return parseWithZod(
      experimentRunEventSchema,
      value,
      "live experiment event",
    ) as ExperimentRunEvent;
  } catch {
    throw graphQLErrorFromBridge(responseContractInvalidError);
  }
}

function parseEvaluationRunEvent(value: unknown): EvaluationRunEvent {
  try {
    const event = parseWithZod(evaluationRunEventSchema, value, "live evaluation event");
    return {
      ...event,
      receivedAt: event.receivedAt ?? event.occurredAt ?? new Date().toISOString(),
    } as EvaluationRunEvent;
  } catch {
    throw graphQLErrorFromBridge(responseContractInvalidError);
  }
}

function graphQLErrorBridgeFields(error: GraphQLError): BridgeErrorLike {
  const problem = error.extensions?.problem;
  if (
    typeof problem === "object" &&
    problem !== null &&
    "id" in problem &&
    "code" in problem &&
    typeof problem.id === "string" &&
    typeof problem.code === "string"
  ) {
    return {
      id: problem.id as CloudGridErrorId,
      code: problem.code,
      message: error.message,
      retryable:
        "retryable" in problem && typeof problem.retryable === "boolean" ? problem.retryable : true,
    };
  }
  return {
    id: "ERR-013",
    code: "MESSAGE_BRIDGE_UNAVAILABLE",
    message: error.message,
    retryable: true,
  };
}

function createAsyncQueue<T>(): AsyncIterableIterator<T> & {
  push(value: T): void;
  close(): void;
} {
  const values: T[] = [];
  const waits: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  return {
    push(value: T) {
      const wait = waits.shift();
      if (wait) {
        wait({ value, done: false });
        return;
      }
      values.push(value);
    },
    close() {
      closed = true;
      for (const wait of waits.splice(0)) {
        wait({ value: undefined, done: true });
      }
    },
    async next() {
      const value = values.shift();
      if (value !== undefined) {
        return { value, done: false };
      }
      if (closed) {
        return { value: undefined, done: true };
      }
      return new Promise<IteratorResult<T>>((resolve) => waits.push(resolve));
    },
    async return() {
      this.close();
      return { value: undefined, done: true };
    },
    async throw(error?: unknown) {
      this.close();
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function cancelableAsyncIterator<T>(
  iterator: AsyncIterableIterator<T>,
  queue: { close(): void },
): AsyncIterableIterator<T> {
  return {
    next() {
      return iterator.next();
    },
    return(value?: unknown) {
      queue.close();
      return iterator.return?.(value) ?? Promise.resolve({ value: undefined, done: true });
    },
    throw(error?: unknown) {
      queue.close();
      return iterator.throw?.(error) ?? Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function liveTraceWatchdogMs(startData: LiveTraceStartData): number {
  return startData.heartbeatIntervalMs > 30_000 ? startData.heartbeatIntervalMs * 3 : 45_000;
}

function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
  timeoutError: () => Error,
): Promise<IteratorResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<IteratorResult<T>>((_resolve, reject) => {
    timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
  });
  return Promise.race([iterator.next(), timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}
