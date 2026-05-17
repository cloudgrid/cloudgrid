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
  AiQualityOverview,
  AiQualityOverviewInput,
  AlertEventConnection,
  AlertRule,
  AlertRuleSearchInput,
  AlertSilence,
  AnnotationQueueItem,
  AnnotationQueueResult,
  AnnotationQueueSearchInput,
  AppendDatasetItemsInput,
  CommitDatasetImportInput,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateDatasetInput,
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
  Experiment,
  ExperimentRun,
  ExperimentRunEvent,
  ExperimentRunSearchResult,
  ExperimentSearchInput,
  ExperimentSearchResult,
  IngestCredential,
  IngestCredentialListResult,
  InviteOrganizationMemberInput,
  LiveExperimentRunInput,
  LiveTraceEvent,
  LiveTraceInput,
  LogSearchInput,
  LogSearchResult,
  MetricNameSearchInput,
  MetricNameSearchResult,
  MetricSeriesInput,
  MetricSeriesResult,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  PrepareDatasetImportInput,
  Project,
  ProjectAiSettings,
  ProjectListInput,
  ProjectMember,
  ProjectRole,
  ProjectTelemetryOverview,
  PromotePromptVersionInput,
  PromoteSpanToDatasetItemInput,
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
  StartExperimentRunInput,
  StartOptimizationRunInput,
  TelemetryFacetInput,
  TelemetryFacetResult,
  TraceDetail,
  TraceDetailInput,
  TraceSearchInput,
  TraceSearchResult,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectAiSettingsInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
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

const subjects = {
  viewerGet: "control.viewer.get",
  organizationsList: "control.organizations.list",
  organizationGet: "control.organizations.get",
  membersList: "control.members.list",
  invitationsList: "control.invitations.list",
  invitationCreate: "control.invitations.create",
  invitationRevoke: "control.invitations.revoke",
  projectsList: "control.projects.list",
  projectGet: "control.projects.get",
  projectCreate: "control.projects.create",
  projectUpdate: "control.projects.update",
  projectSelect: "control.projects.select",
  memberUpdate: "control.members.update",
  memberRemove: "control.members.remove",
  projectMembersList: "control.project_members.list",
  projectMembersUpdate: "control.project_members.update",
  projectMembersRemove: "control.project_members.remove",
  retentionGet: "control.retention.get",
  retentionUpdate: "control.retention.update",
  alertRulesList: "control.alert_rules.list",
  alertRulesCreate: "control.alert_rules.create",
  alertRulesUpdate: "control.alert_rules.update",
  alertRulesDelete: "control.alert_rules.delete",
  alertSilencesList: "control.alert_silences.list",
  alertSilencesCreate: "control.alert_silences.create",
  alertSilencesDelete: "control.alert_silences.delete",
  alertHistoryList: "control.alert_history.list",
  ingestCredentialsList: "control.ingest_credentials.list",
  ingestCredentialsCreate: "control.ingest_credentials.create",
  ingestCredentialsRevoke: "control.ingest_credentials.revoke",
  traceSearch: "telemetry.traces.search",
  traceGet: "telemetry.traces.get",
  logSearch: "telemetry.logs.search",
  telemetryFacets: "telemetry.facets",
  projectTelemetryOverview: "telemetry.projects.overview",
  metricNames: "telemetry.metrics.names",
  metricSeries: "telemetry.metrics.query",
  richMetricSeries: "telemetry.metrics.rich_query",
  dashboardsList: "control.dashboards.list",
  dashboardsSave: "control.dashboards.save",
  dashboardsDelete: "control.dashboards.delete",
  dashboardPinsSet: "control.dashboard_pins.set",
  dashboardPinsReorder: "control.dashboard_pins.reorder",
  liveTraceStart: "telemetry.traces.live.start",
  liveTraceStop: "telemetry.traces.live.stop",
  agentRunSearch: "eval.agent_runs.search",
  datasetCreate: "eval.dataset.create",
  datasetSearch: "eval.dataset.search",
  datasetItemsAppend: "eval.dataset.items.append",
  datasetItemPromote: "eval.dataset.item.promote",
  datasetImportPrepare: "eval.dataset.import.prepare",
  datasetImportCommit: "eval.dataset.import.commit",
  datasetExportStart: "eval.dataset.export.start",
  datasetTransferGet: "eval.dataset.transfer.get",
  scorerCreate: "eval.scorer.create",
  scorerSearch: "eval.scorer.search",
  experimentCreate: "eval.experiment.create",
  experimentStart: "eval.experiment.start",
  experimentCancel: "eval.experiment.cancel",
  optimizationStart: "eval.optimization.start",
  experimentSearch: "eval.experiment.search",
  resultSearch: "eval.results.search",
  liveExperimentStart: "eval.live.start",
  liveExperimentStop: "eval.live.stop",
  annotationQueueSearch: "annotation.queue.search",
  annotationItemUpdate: "annotation.item.update",
  promptVersionPromote: "eval.prompt_version.promote",
  projectAiSettingsGet: "control.ai_settings.get",
  projectAiSettingsUpdate: "control.ai_settings.update",
  aiQualityOverview: "eval.quality.overview",
} as const;

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
  promoteSpanToDatasetItem(
    input: PromoteSpanToDatasetItemInput,
    authContext?: NormalizedAuthContext,
  ): Promise<DatasetItem>;
  createScorer(input: CreateScorerInput, authContext?: NormalizedAuthContext): Promise<Scorer>;
  createExperiment(
    input: CreateExperimentInput,
    authContext?: NormalizedAuthContext,
  ): Promise<Experiment>;
  startExperimentRun(
    input: StartExperimentRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun>;
  cancelExperimentRun(id: string, authContext?: NormalizedAuthContext): Promise<ExperimentRun>;
  startOptimizationRun(
    input: StartOptimizationRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun>;
  promotePromptVersion(
    input: PromotePromptVersionInput,
    authContext?: NormalizedAuthContext,
  ): Promise<PromptVersion>;
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
}

export type CloudGridBridge = TelemetryQueryBridge &
  MetricQueryBridge &
  ControlPlaneBridge &
  AiEvalBridge;

export interface RequestReplyClient {
  request(
    subject: string,
    payload: Uint8Array,
    options: { timeoutMs: number },
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
        input: { experimentRunId, ...compactInput(input as Record<string, unknown>) },
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
      { ...envelope(authContext), input },
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

  async startOptimizationRun(
    input: StartOptimizationRunInput,
    authContext?: NormalizedAuthContext,
  ): Promise<ExperimentRun> {
    return this.#requestParsed(
      subjects.optimizationStart,
      { ...envelope(authContext), ...compactInput(input as unknown as Record<string, unknown>) },
      typedExperimentRunSchema,
    );
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

  async searchTraces(
    input: TraceSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceSearchResult> {
    return this.#request<TraceSearchResult>(subjects.traceSearch, {
      ...envelope(authContext),
      query: compactInput(input as Record<string, unknown>) as TraceSearchInput,
    });
  }

  async getTraceDetail(
    traceId: string,
    input: TraceDetailInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TraceDetail | null> {
    return this.#request<TraceDetail>(subjects.traceGet, {
      ...envelope(authContext),
      traceId,
      query: compactInput(input as Record<string, unknown>) as TraceDetailInput,
    });
  }

  async searchLogs(
    input: LogSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<LogSearchResult> {
    return this.#request<LogSearchResult>(subjects.logSearch, {
      ...envelope(authContext),
      query: compactInput(input as Record<string, unknown>) as LogSearchInput,
    });
  }

  async telemetryFacets(
    input: TelemetryFacetInput,
    authContext?: NormalizedAuthContext,
  ): Promise<TelemetryFacetResult> {
    return this.#request<TelemetryFacetResult>(subjects.telemetryFacets, {
      ...envelope(authContext),
      query: compactInput(input as Record<string, unknown>) as TelemetryFacetInput,
    });
  }

  async metricNames(
    input: MetricNameSearchInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricNameSearchResult> {
    return this.#request<MetricNameSearchResult>(subjects.metricNames, {
      ...envelope(authContext),
      input: compactInput(input as Record<string, unknown>) as MetricNameSearchInput,
    });
  }

  async metricSeries(
    input: MetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<MetricSeriesResult> {
    return this.#request<MetricSeriesResult>(subjects.metricSeries, {
      ...envelope(authContext),
      input: compactInput(
        input as unknown as Record<string, unknown>,
      ) as unknown as MetricSeriesInput,
    });
  }

  async richMetricSeries(
    input: RichMetricSeriesInput,
    authContext?: NormalizedAuthContext,
  ): Promise<RichMetricSeriesResult> {
    return this.#request<RichMetricSeriesResult>(subjects.richMetricSeries, {
      ...envelope(authContext),
      input: compactInput(
        input as unknown as Record<string, unknown>,
      ) as unknown as RichMetricSeriesInput,
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
        operation_or_subject: subject,
        issues: parsed.error.issues,
      });
      throw graphQLErrorFromBridge({
        id: "ERR-013",
        code: "MESSAGE_BRIDGE_UNAVAILABLE",
        message: "Message bridge returned an invalid response",
        retryable: true,
      });
    }
    return parsed.data;
  }

  async #request<Data>(subject: string, payload: unknown): Promise<Data> {
    const start = performance.now();
    const requestId = requestIdFromPayload(payload);
    try {
      const data = await this.#requestReply.request(subject, encodeJson(payload), {
        timeoutMs: this.#timeoutMs,
      });
      const response = parseBridgeResponse<Data>(decodeJson(data));
      if (!response.ok) {
        this.#logRequest(
          "warn",
          subject,
          response.requestId || requestId,
          start,
          "error",
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
        this.#logRequest("error", subject, response.requestId || requestId, start, "error", error);
        throw graphQLErrorFromBridge(error, response.requestId || requestId);
      }
      this.#logRequest("info", subject, response.requestId || requestId, start, "ok");
      return response.data;
    } catch (error) {
      if (error instanceof GraphQLError) {
        throw error;
      }
      const bridgeError = {
        id: "ERR-014",
        code: "MESSAGE_BRIDGE_TIMEOUT",
        message: "Message bridge request timed out",
        retryable: true,
      } satisfies BridgeErrorLike;
      this.#logRequest("error", subject, requestId, start, "error", bridgeError);
      throw graphQLErrorFromBridge(bridgeError, requestId);
    }
  }

  #logRequest(
    level: "info" | "warn" | "error",
    subject: string,
    requestId: string,
    start: number,
    status: "ok" | "error",
    error?: BridgeErrorLike,
  ) {
    this.#logger[level]("nats_request_completed", {
      request_id: requestId,
      operation_or_subject: subject,
      status,
      duration_ms: elapsedMilliseconds(start),
      ...(error ? { error_id: error.id, error_code: error.code } : {}),
    });
  }
}

export class NATSTelemetryQueryBridge extends MessageBridgeCloudGridBridge {
  constructor(
    connection: ConstructorParameters<typeof NATSRequestReplyClient>[0],
    timeoutMs: number,
    logger: CloudGridLogger,
    options: BridgeOptions & { pubSub?: EphemeralPubSub; lifecycle?: MessageBridgeLifecycle } = {},
  ) {
    const requestReply = new NATSRequestReplyClient(connection);
    const lifecycle = new NATSBridgeLifecycle(connection);
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
): Promise<NATSTelemetryQueryBridge> {
  const connection = await connectNATS({ servers, name: "cloudgrid-bff" });
  return new NATSTelemetryQueryBridge(connection, timeoutMs, logger);
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

function parseBridgeResponse<Data>(value: unknown): BridgeResponse<Data> {
  try {
    return parseWithZod(bridgeResponseSchema, value, "bridge response") as BridgeResponse<Data>;
  } catch {
    throw graphQLErrorFromBridge({
      id: "ERR-013",
      code: "MESSAGE_BRIDGE_UNAVAILABLE",
      message: "Message bridge returned an invalid response",
      retryable: true,
    });
  }
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
  "tool_correctness",
  "trajectory",
  "human",
]);
const evalTargetKindSchema = z.enum(["agentRun", "span", "datasetItemRun"]);
const experimentRunStatusSchema = z.enum(["queued", "running", "cancelled", "failed", "finished"]);
const annotationStatusSchema = z.enum(["open", "in_review", "resolved", "dismissed"]);
const datasetSplitSchema = z.enum(["dev", "optimization", "validation", "regression", "holdout"]);
const datasetReviewStatusSchema = z.enum(["unreviewed", "reviewed", "rejected"]);
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
  evidence: z.unknown().optional().nullable(),
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
});

const datasetItemSchema = z.object({
  id: z.string().min(1),
  datasetId: z.string().min(1),
  version: z.number().int(),
  input: z.unknown(),
  expected: z.unknown().optional().nullable(),
  metadata: z.unknown(),
  sourceTraceId: z.string().optional().nullable(),
  sourceSpanId: z.string().optional().nullable(),
  split: datasetSplitSchema,
  reviewStatus: datasetReviewStatusSchema,
  synthetic: z.boolean(),
  duplicateOfItemId: z.string().optional().nullable(),
  leakageWarnings: z.array(z.string()),
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
const datasetItemPreviewSchema = z.object({
  input: z.unknown(),
  expected: z.unknown().optional().nullable(),
  metadata: z.unknown(),
  split: datasetSplitSchema,
  reviewStatus: datasetReviewStatusSchema,
  sourceTraceId: z.string().optional().nullable(),
  sourceSpanId: z.string().optional().nullable(),
  synthetic: z.boolean(),
});
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
const datasetExportJobSchema = z.object({
  id: z.string().min(1),
  datasetId: z.string().min(1),
  datasetVersion: z.number().int().min(1),
  status: datasetExportStatusSchema,
  format: datasetExportFormatSchema,
  rowCount: z.number().int().min(0),
  sizeBytes: z.number().int().min(0).optional().nullable(),
  sha256: z.string().optional().nullable(),
  downloadUrl: z.string().optional().nullable(),
  createdAt: dateTimeSchema,
  expiresAt: dateTimeSchema,
});

const datasetHealthSchema = z.object({
  status: datasetHealthStatusSchema,
  reviewedItemCount: z.number().int(),
  totalItemCount: z.number().int(),
  splitCounts: z.unknown(),
  duplicateCandidateCount: z.number().int(),
  leakageWarningCount: z.number().int(),
  missingExpectedCount: z.number().int(),
  schemaIssueCount: z.number().int(),
  smallDataset: z.boolean(),
  warnings: z.array(z.string()),
});

const datasetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  version: z.number().int(),
  createdAt: dateTimeSchema,
  itemCount: z.number().int(),
  reviewedItemCount: z.number().int(),
  splitCounts: z.unknown(),
  health: datasetHealthSchema,
  tags: z.array(z.string()),
  items: z.unknown().optional(),
});

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

const experimentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  datasetId: z.string().min(1),
  datasetVersion: z.number().int(),
  splitSelector: datasetSplitSelectorSchema,
  scorerIds: z.array(z.string().min(1)),
  baselineRef: z.unknown().optional().nullable(),
  promptVersionRefs: z.array(z.string()),
  skillSnapshotRefs: z.array(z.string()),
  toolSnapshotRefs: z.array(z.string()),
  providerProfileRefs: z.array(z.string()),
  createdAt: dateTimeSchema,
  tags: z.array(z.string()),
  runs: z.unknown().optional(),
});

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
  solverRef: z.unknown(),
  manifest: z.unknown().optional().nullable(),
  baselineRunId: z.string().optional().nullable(),
  status: experimentRunStatusSchema,
  startedAt: dateTimeSchema,
  endedAt: dateTimeSchema.optional().nullable(),
  summary: z.unknown(),
  itemRuns: z.unknown().optional(),
});

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
  scorerIds: z.array(z.string().min(1)),
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
  maxConcurrentExperimentItems: z.number().int(),
  maxConcurrentOptimizationCandidates: z.number().int(),
});

const datasetDefaultsSchema = z.object({
  splitAllocation: z.unknown(),
  smallDatasetReviewedThreshold: z.number().int(),
  requireReviewForRegression: z.boolean(),
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
    "finished",
  ]),
  seq: z.number().int().min(1),
  receivedAt: dateTimeSchema,
  experimentRunId: z.string().optional(),
  run: experimentRunSchema.optional().nullable(),
  itemRun: datasetItemRunSchema.optional().nullable(),
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
    throw graphQLErrorFromBridge({
      id: "ERR-013",
      code: "MESSAGE_BRIDGE_UNAVAILABLE",
      message: "Message bridge returned an invalid live trace event",
      retryable: true,
    });
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
    throw graphQLErrorFromBridge({
      id: "ERR-013",
      code: "MESSAGE_BRIDGE_UNAVAILABLE",
      message: "Message bridge returned an invalid live experiment event",
      retryable: true,
    });
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
