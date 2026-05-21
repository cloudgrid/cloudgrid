import type {
  AgentRun,
  AgentRunQueryData,
  AgentRunSearchInput,
  AgentRunsQueryData,
  AiChatActionProposal,
  AiChatConversation,
  AiChatConversationQueryData,
  AiChatHistory,
  AiChatHistoryInput,
  AiChatHistoryQueryData,
  AiQualityOverview,
  AiQualityOverviewInput,
  AiQualityOverviewQueryData,
  AlertEventConnection,
  AlertHistoryQueryData,
  AlertRule,
  AlertRuleSearchInput,
  AlertRulesQueryData,
  AlertSilence,
  AlertSilencesQueryData,
  AlertSummary,
  AlertSummaryInput,
  AlertSummaryQueryData,
  AnnotationQueueQueryData,
  AnnotationQueueResult,
  AnnotationQueueSearchInput,
  AppendDatasetItemsInput,
  AppendDatasetItemsMutationData,
  ApproveAiChatActionInput,
  ApproveAiChatActionMutationData,
  CommitDatasetImportInput,
  CompanyAiProviderSettings,
  CompanyAiProviderSettingsQueryData,
  CreateAlertRuleInput,
  CreateAlertRuleMutationData,
  CreateAlertSilenceInput,
  CreateAlertSilenceMutationData,
  CreateAiChatConversationInput,
  CreateAiChatConversationMutationData,
  CreateDatasetInput,
  CreateDatasetMutationData,
  CreatedIngestCredential,
  CreateExperimentInput,
  CreateExperimentMutationData,
  CreateIngestCredentialInput,
  CreateIngestCredentialMutationData,
  CreateProjectInput,
  CreateProjectMutationData,
  CreateScorerInput,
  CreateScorerMutationData,
  Dataset,
  DatasetExportJob,
  DatasetImportJob,
  DatasetQueryData,
  DatasetSearchInput,
  DatasetsQueryData,
  DeleteAlertRuleMutationData,
  DeleteAlertSilenceMutationData,
  DeleteAiChatConversationMutationData,
  ExperimentRun,
  ExperimentRunEvent,
  ExperimentRunQueryData,
  ExperimentSearchInput,
  ExperimentsQueryData,
  IngestCredential,
  IngestCredentialListResult,
  IngestCredentialsQueryData,
  InviteOrganizationMemberInput,
  InviteOrganizationMemberMutationData,
  InviteProjectMemberInput,
  InviteProjectMemberMutationData,
  LiveExperimentRunInput,
  LiveExperimentRunSubscriptionData,
  LiveTraceEvent,
  LiveTraceInput,
  LiveTraceSubscriptionData,
  LogSearchInput,
  LogSearchQueryData,
  LogSearchResult,
  MetricNameSearchInput,
  MetricNameSearchResult,
  MetricSeriesInput,
  MetricSeriesResult,
  Organization,
  OrganizationInvitation,
  OrganizationInvitationsQueryData,
  OrganizationMember,
  OrganizationMembersQueryData,
  OrganizationQueryData,
  OrganizationsQueryData,
  PrepareDatasetImportInput,
  Project,
  ProjectAiSettings,
  ProjectAiSettingsQueryData,
  ProjectInvitationResult,
  ProjectListInput,
  ProjectMember,
  ProjectMembersQueryData,
  ProjectQueryData,
  ProjectRole,
  ProjectsQueryData,
  RemoveOrganizationMemberInput,
  RemoveOrganizationMemberMutationData,
  RemoveProjectMemberMutationData,
  RetentionPolicy,
  RetentionPolicyQueryData,
  RevokeIngestCredentialMutationData,
  RevokeOrganizationInvitationMutationData,
  ResendOrganizationInvitationMutationData,
  RichMetricSeriesInput,
  RichMetricSeriesResult,
  Scorer,
  ScorerSearchInput,
  ScorersQueryData,
  SelectProjectMutationData,
  StartDatasetExportInput,
  StartExperimentRunInput,
  StartExperimentRunMutationData,
  TelemetryFacetInput,
  TelemetryFacetQueryData,
  TelemetryFacetResult,
  TraceDetail,
  TraceDetailInput,
  TraceDetailQueryData,
  TraceSearchInput,
  TraceSearchQueryData,
  TraceSearchResult,
  UpdateAlertRuleInput,
  UpdateAlertRuleMutationData,
  UpdateOrganizationMemberInput,
  UpdateOrganizationMemberMutationData,
  UpdateProjectAiSettingsInput,
  UpdateProjectAiSettingsMutationData,
  UpdateCompanyAiProviderSettingsInput,
  UpdateCompanyAiProviderSettingsMutationData,
  UpdateProjectMemberMutationData,
  UpdateRetentionPolicyInput,
  UpdateRetentionPolicyMutationData,
  Viewer,
  ViewerQueryData,
} from "@cloudgrid/ui-contracts";
import type {
  Dashboard,
  DashboardListInput,
  DashboardListResult,
  DashboardPreferences,
  ReorderDashboardPinsInput,
  SaveDashboardInput,
  SetDashboardPinnedInput,
} from "./dashboard-contracts";
import {
  approveAiChatActionOperation,
  aiChatConversationOperation,
  aiChatHistoryOperation,
  companyAiProviderSettingsOperation,
  createAiChatConversationOperation,
  deleteAiChatConversationOperation,
  streamAiChatRun,
  updateCompanyAiProviderSettingsOperation,
  type AiChatStreamEvent,
  type AiChatStreamOptions,
  type AiChatStreamRequest,
} from "./ai-chat";
import {
  alertHistoryOperation,
  alertRulesOperation,
  alertSilencesOperation,
  alertSummaryOperation,
  createAlertRuleOperation,
  createAlertSilenceOperation,
  createIngestCredentialOperation,
  createProjectOperation,
  deleteAlertRuleOperation,
  deleteAlertSilenceOperation,
  ingestCredentialsOperation,
  inviteOrganizationMemberOperation,
  inviteProjectMemberOperation,
  organizationInvitationsOperation,
  organizationMembersOperation,
  organizationOperation,
  organizationsOperation,
  projectAiSettingsOperation,
  projectMembersOperation,
  projectOperation,
  projectsOperation,
  removeOrganizationMemberOperation,
  removeProjectMemberOperation,
  resendOrganizationInvitationOperation,
  retentionPolicyOperation,
  revokeIngestCredentialOperation,
  revokeOrganizationInvitationOperation,
  selectProjectOperation,
  updateAlertRuleOperation,
  updateOrganizationMemberOperation,
  updateProjectAiSettingsOperation,
  updateProjectMemberOperation,
  updateRetentionPolicyOperation,
  viewerOperation,
} from "./control-plane";
import {
  dashboardsOperation,
  deleteDashboardOperation,
  reorderDashboardPinsOperation,
  saveDashboardOperation,
  setDashboardPinnedOperation,
} from "./dashboards";
import {
  graphqlWebSocketEndpoint,
  requestGraphQL,
  subscribeGraphQL,
  type LiveTraceConnectionState,
  type LiveTraceSubscription,
} from "./graphql-transport";
import {
  agentRunOperation,
  agentRunsOperation,
  aiQualityOverviewOperation,
  annotationQueueOperation,
  appendDatasetItemsOperation,
  commitDatasetImportOperation,
  createDatasetOperation,
  createExperimentOperation,
  createScorerOperation,
  datasetExportOperation,
  datasetOperation,
  datasetsOperation,
  experimentRunOperation,
  experimentsOperation,
  liveExperimentRunSubscriptionOperation,
  liveTraceSubscriptionOperation,
  logSearchOperation,
  metricNamesOperation,
  metricSeriesOperation,
  prepareDatasetImportOperation,
  richMetricSeriesOperation,
  scorersOperation,
  startDatasetExportOperation,
  startExperimentRunOperation,
  telemetryFacetsOperation,
  traceDetailOperation,
  traceSearchOperation,
} from "./observability";

export interface TelemetryGraphQLClient {
  searchTraces: (input: TraceSearchInput) => Promise<TraceSearchResult>;
  getTrace: (traceId: string, input?: TraceDetailInput) => Promise<TraceDetail | null>;
  searchLogs: (input: LogSearchInput) => Promise<LogSearchResult>;
  getTelemetryFacets: (input: TelemetryFacetInput) => Promise<TelemetryFacetResult>;
  getMetricNames: (input: MetricNameSearchInput) => Promise<MetricNameSearchResult>;
  getMetricSeries: (input: MetricSeriesInput) => Promise<MetricSeriesResult>;
  getRichMetricSeries: (input: RichMetricSeriesInput) => Promise<RichMetricSeriesResult>;
  subscribeLiveTraces: (
    input: LiveTraceInput,
    observer: LiveTraceObserver,
  ) => LiveTraceSubscription;
  searchAgentRuns: (input: AgentRunSearchInput) => Promise<AgentRunsQueryData["agentRuns"]>;
  getAgentRun: (id: string) => Promise<AgentRun | null>;
  searchDatasets: (input: DatasetSearchInput) => Promise<DatasetsQueryData["datasets"]>;
  getDataset: (id: string) => Promise<Dataset | null>;
  createDataset: (input: CreateDatasetInput) => Promise<Dataset>;
  appendDatasetItems: (input: AppendDatasetItemsInput) => Promise<Dataset>;
  searchScorers: (input: ScorerSearchInput) => Promise<ScorersQueryData["scorers"]>;
  createScorer: (input: CreateScorerInput) => Promise<Scorer>;
  searchExperiments: (input: ExperimentSearchInput) => Promise<ExperimentsQueryData["experiments"]>;
  createExperiment: (
    input: CreateExperimentInput,
  ) => Promise<ExperimentsQueryData["experiments"]["items"][number]>;
  startExperimentRun: (input: StartExperimentRunInput) => Promise<ExperimentRun>;
  getExperimentRun: (id: string) => Promise<ExperimentRun | null>;
  searchAnnotationQueue: (input: AnnotationQueueSearchInput) => Promise<AnnotationQueueResult>;
  getAiQualityOverview: (input: AiQualityOverviewInput) => Promise<AiQualityOverview>;
  prepareDatasetImport: (input: PrepareDatasetImportInput) => Promise<DatasetImportJob>;
  commitDatasetImport: (input: CommitDatasetImportInput) => Promise<DatasetImportJob>;
  startDatasetExport: (input: StartDatasetExportInput) => Promise<DatasetExportJob>;
  getDatasetExport: (id: string) => Promise<DatasetExportJob | null>;
  subscribeLiveExperimentRun: (
    input: LiveExperimentRunInput,
    observer: LiveExperimentRunObserver,
  ) => LiveTraceSubscription;
}

export interface ControlPlaneGraphQLClient {
  getViewer: () => Promise<Viewer | null>;
  getOrganizations: () => Promise<Organization[]>;
  getOrganization: (id: string) => Promise<Organization | null>;
  getProjects: (input?: ProjectListInput) => Promise<Project[]>;
  getProject: (id: string) => Promise<Project | null>;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  selectProject: (projectId: string) => Promise<Viewer>;
  getOrganizationMembers: (organizationId: string) => Promise<OrganizationMember[]>;
  getOrganizationInvitations: (organizationId: string) => Promise<OrganizationInvitation[]>;
  inviteOrganizationMember: (
    input: InviteOrganizationMemberInput,
  ) => Promise<OrganizationInvitation>;
  inviteProjectMember: (input: InviteProjectMemberInput) => Promise<ProjectInvitationResult>;
  resendOrganizationInvitation: (id: string) => Promise<OrganizationInvitation>;
  revokeOrganizationInvitation: (id: string) => Promise<OrganizationInvitation>;
  updateOrganizationMember: (input: UpdateOrganizationMemberInput) => Promise<OrganizationMember>;
  removeOrganizationMember: (input: RemoveOrganizationMemberInput) => Promise<boolean>;
  getProjectMembers: (projectId: string) => Promise<ProjectMember[]>;
  updateProjectMember: (input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
  }) => Promise<ProjectMember>;
  removeProjectMember: (projectId: string, userId: string) => Promise<boolean>;
  getIngestCredentials: (projectId: string) => Promise<IngestCredentialListResult>;
  createIngestCredential: (input: CreateIngestCredentialInput) => Promise<CreatedIngestCredential>;
  revokeIngestCredential: (id: string) => Promise<IngestCredential>;
  getDashboards: (input?: DashboardListInput) => Promise<DashboardListResult>;
  saveDashboard: (input: SaveDashboardInput) => Promise<Dashboard>;
  deleteDashboard: (id: string) => Promise<boolean>;
  setDashboardPinned: (input: SetDashboardPinnedInput) => Promise<DashboardPreferences>;
  reorderDashboardPins: (input: ReorderDashboardPinsInput) => Promise<DashboardPreferences>;
  getRetentionPolicy: (projectId: string) => Promise<RetentionPolicy>;
  updateRetentionPolicy: (input: UpdateRetentionPolicyInput) => Promise<RetentionPolicy>;
  getProjectAiSettings: (projectId: string) => Promise<ProjectAiSettings>;
  updateProjectAiSettings: (input: UpdateProjectAiSettingsInput) => Promise<ProjectAiSettings>;
  getCompanyAiProviderSettings: (companyId: string) => Promise<CompanyAiProviderSettings>;
  updateCompanyAiProviderSettings: (
    input: UpdateCompanyAiProviderSettingsInput,
  ) => Promise<CompanyAiProviderSettings>;
  getAiChatHistory: (input: AiChatHistoryInput) => Promise<AiChatHistory>;
  getAiChatConversation: (id: string) => Promise<AiChatConversation | null>;
  createAiChatConversation: (input: CreateAiChatConversationInput) => Promise<AiChatConversation>;
  deleteAiChatConversation: (id: string) => Promise<boolean>;
  approveAiChatAction: (input: ApproveAiChatActionInput) => Promise<AiChatActionProposal>;
  streamAiChatRun: (
    input: AiChatStreamRequest,
    options?: AiChatStreamOptions,
  ) => AsyncIterable<AiChatStreamEvent>;
  getAlertRules: (projectId: string, input?: AlertRuleSearchInput) => Promise<AlertRule[]>;
  getAlertHistory: (input: {
    projectId: string;
    ruleId?: string | null;
    first?: number;
    after?: string | null;
  }) => Promise<AlertEventConnection>;
  getAlertSummary: (projectId: string, input?: AlertSummaryInput) => Promise<AlertSummary>;
  getAlertSilences: (input: {
    projectId: string;
    ruleId?: string | null;
  }) => Promise<AlertSilence[]>;
  createAlertRule: (input: CreateAlertRuleInput) => Promise<AlertRule>;
  updateAlertRule: (input: UpdateAlertRuleInput) => Promise<AlertRule>;
  deleteAlertRule: (id: string) => Promise<boolean>;
  createAlertSilence: (input: CreateAlertSilenceInput) => Promise<AlertSilence>;
  deleteAlertSilence: (id: string) => Promise<boolean>;
}

export interface LiveTraceObserver {
  onStateChange?: (state: LiveTraceConnectionState) => void;
  onEvent: (event: LiveTraceEvent) => void;
  onError?: (error: Error) => void;
}

export interface LiveExperimentRunObserver {
  onStateChange?: (state: LiveTraceConnectionState) => void;
  onEvent: (event: ExperimentRunEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Creates a GraphQL client for CloudGrid telemetry and AI evaluation read flows.
 *
 * @param endpoint - Absolute or browser-relative GraphQL endpoint. Defaults to `/graphql`.
 * @returns A typed client whose methods execute CloudGrid telemetry queries, metric
 * reads, AI evaluation queries, and live subscriptions. Request failures, invalid
 * GraphQL envelopes, and CloudGrid problem responses reject with `Error` or
 * `CloudGridGraphQLError` from the public facade.
 */
export function createTelemetryGraphQLClient(endpoint = "/graphql"): TelemetryGraphQLClient {
  return {
    async searchTraces(input) {
      const data = await requestGraphQL<TraceSearchQueryData>(
        endpoint,
        "TraceSearch",
        traceSearchOperation,
        { input },
      );
      return data.traces;
    },
    async getTrace(traceId, input = {}) {
      const data = await requestGraphQL<TraceDetailQueryData>(
        endpoint,
        "TraceDetail",
        traceDetailOperation,
        { id: traceId, input },
      );
      return data.trace;
    },
    async searchLogs(input) {
      const data = await requestGraphQL<LogSearchQueryData>(
        endpoint,
        "LogSearch",
        logSearchOperation,
        {
          input,
        },
      );
      return data.logs;
    },
    async getTelemetryFacets(input) {
      const data = await requestGraphQL<TelemetryFacetQueryData>(
        endpoint,
        "TelemetryFacets",
        telemetryFacetsOperation,
        { input },
      );
      return data.telemetryFacets;
    },
    async getMetricNames(input) {
      const data = await requestGraphQL<{ metricNames: MetricNameSearchResult }>(
        endpoint,
        "MetricNames",
        metricNamesOperation,
        { input },
      );
      return data.metricNames;
    },
    async getMetricSeries(input) {
      const data = await requestGraphQL<{ metricSeries: MetricSeriesResult }>(
        endpoint,
        "MetricSeries",
        metricSeriesOperation,
        { input },
      );
      return data.metricSeries;
    },
    async getRichMetricSeries(input) {
      const data = await requestGraphQL<{ richMetricSeries: RichMetricSeriesResult }>(
        endpoint,
        "RichMetricSeries",
        richMetricSeriesOperation,
        { input },
      );
      return data.richMetricSeries;
    },
    subscribeLiveTraces(input, observer) {
      const subscriptionObserver: {
        onStateChange?: (state: LiveTraceConnectionState) => void;
        onData: (data: LiveTraceSubscriptionData) => void;
        onError?: (error: Error) => void;
      } = {
        onData(data) {
          observer.onEvent(data.liveTraces);
        },
      };
      if (observer.onStateChange) {
        subscriptionObserver.onStateChange = observer.onStateChange;
      }
      if (observer.onError) {
        subscriptionObserver.onError = observer.onError;
      }

      return subscribeGraphQL<LiveTraceSubscriptionData>(
        graphqlWebSocketEndpoint(endpoint),
        "LiveTrace",
        liveTraceSubscriptionOperation,
        { input },
        subscriptionObserver,
      );
    },
    async searchAgentRuns(input) {
      const data = await requestGraphQL<AgentRunsQueryData>(
        endpoint,
        "AgentRuns",
        agentRunsOperation,
        { input },
      );
      return data.agentRuns;
    },
    async getAgentRun(id) {
      const data = await requestGraphQL<AgentRunQueryData>(
        endpoint,
        "AgentRun",
        agentRunOperation,
        { id },
      );
      return data.agentRun ?? null;
    },
    async searchDatasets(input) {
      const data = await requestGraphQL<DatasetsQueryData>(
        endpoint,
        "Datasets",
        datasetsOperation,
        { input },
      );
      return data.datasets;
    },
    async getDataset(id) {
      const data = await requestGraphQL<DatasetQueryData>(endpoint, "Dataset", datasetOperation, {
        id,
      });
      return data.dataset ?? null;
    },
    async createDataset(input) {
      const data = await requestGraphQL<CreateDatasetMutationData>(
        endpoint,
        "CreateDataset",
        createDatasetOperation,
        { input },
      );
      return data.createDataset;
    },
    async appendDatasetItems(input) {
      const data = await requestGraphQL<AppendDatasetItemsMutationData>(
        endpoint,
        "AppendDatasetItems",
        appendDatasetItemsOperation,
        { input },
      );
      return data.appendDatasetItems;
    },
    async searchScorers(input) {
      const data = await requestGraphQL<ScorersQueryData>(endpoint, "Scorers", scorersOperation, {
        input,
      });
      return data.scorers;
    },
    async createScorer(input) {
      const data = await requestGraphQL<CreateScorerMutationData>(
        endpoint,
        "CreateScorer",
        createScorerOperation,
        { input },
      );
      return data.createScorer;
    },
    async searchExperiments(input) {
      const data = await requestGraphQL<ExperimentsQueryData>(
        endpoint,
        "Experiments",
        experimentsOperation,
        { input },
      );
      return data.experiments;
    },
    async createExperiment(input) {
      const data = await requestGraphQL<CreateExperimentMutationData>(
        endpoint,
        "CreateExperiment",
        createExperimentOperation,
        { input },
      );
      return data.createExperiment;
    },
    async startExperimentRun(input) {
      const data = await requestGraphQL<StartExperimentRunMutationData>(
        endpoint,
        "StartExperimentRun",
        startExperimentRunOperation,
        { input },
      );
      return data.startExperimentRun;
    },
    async getExperimentRun(id) {
      const data = await requestGraphQL<ExperimentRunQueryData>(
        endpoint,
        "ExperimentRun",
        experimentRunOperation,
        { id },
      );
      return data.experimentRun ?? null;
    },
    async searchAnnotationQueue(input) {
      const data = await requestGraphQL<AnnotationQueueQueryData>(
        endpoint,
        "AnnotationQueue",
        annotationQueueOperation,
        { input },
      );
      return data.annotationQueue;
    },
    async getAiQualityOverview(input) {
      const data = await requestGraphQL<AiQualityOverviewQueryData>(
        endpoint,
        "AiQualityOverview",
        aiQualityOverviewOperation,
        { input },
      );
      return data.aiQualityOverview;
    },
    async prepareDatasetImport(input) {
      const data = await requestGraphQL<{ prepareDatasetImport: DatasetImportJob }>(
        endpoint,
        "PrepareDatasetImport",
        prepareDatasetImportOperation,
        { input },
      );
      return data.prepareDatasetImport;
    },
    async commitDatasetImport(input) {
      const data = await requestGraphQL<{ commitDatasetImport: DatasetImportJob }>(
        endpoint,
        "CommitDatasetImport",
        commitDatasetImportOperation,
        { input },
      );
      return data.commitDatasetImport;
    },
    async startDatasetExport(input) {
      const data = await requestGraphQL<{ startDatasetExport: DatasetExportJob }>(
        endpoint,
        "StartDatasetExport",
        startDatasetExportOperation,
        { input },
      );
      return data.startDatasetExport;
    },
    async getDatasetExport(id) {
      const data = await requestGraphQL<{ datasetExport: DatasetExportJob | null }>(
        endpoint,
        "DatasetExport",
        datasetExportOperation,
        { id },
      );
      return data.datasetExport ?? null;
    },
    subscribeLiveExperimentRun(input, observer) {
      const subscriptionObserver: {
        onStateChange?: (state: LiveTraceConnectionState) => void;
        onData: (data: LiveExperimentRunSubscriptionData) => void;
        onError?: (error: Error) => void;
      } = {
        onData(data) {
          observer.onEvent(data.liveExperimentRun);
        },
      };
      if (observer.onStateChange) {
        subscriptionObserver.onStateChange = observer.onStateChange;
      }
      if (observer.onError) {
        subscriptionObserver.onError = observer.onError;
      }

      return subscribeGraphQL<LiveExperimentRunSubscriptionData>(
        graphqlWebSocketEndpoint(endpoint),
        "LiveExperimentRun",
        liveExperimentRunSubscriptionOperation,
        { input },
        subscriptionObserver,
      );
    },
  };
}

/**
 * Creates a GraphQL client for CloudGrid control-plane operations.
 *
 * @param endpoint - Absolute or browser-relative GraphQL endpoint. Defaults to `/graphql`.
 * @returns A typed client for viewer, organization, project, settings, dashboard,
 * alerting, and AI chat operations. GraphQL calls reject on transport failures,
 * invalid envelopes, or CloudGrid problem responses; `streamAiChatRun` yields
 * validated SSE events and rejects with `CloudGridGraphQLError` when the stream
 * endpoint returns a CloudGrid problem document.
 */
export function createControlPlaneGraphQLClient(endpoint = "/graphql"): ControlPlaneGraphQLClient {
  return {
    async getViewer() {
      const data = await requestGraphQL<ViewerQueryData>(endpoint, "Viewer", viewerOperation, {});
      return data.viewer ?? null;
    },
    async getOrganizations() {
      const data = await requestGraphQL<OrganizationsQueryData>(
        endpoint,
        "Organizations",
        organizationsOperation,
        {},
      );
      return data.organizations;
    },
    async getOrganization(id) {
      const data = await requestGraphQL<OrganizationQueryData>(
        endpoint,
        "Organization",
        organizationOperation,
        { id },
      );
      return data.organization ?? null;
    },
    async getProjects(input = {}) {
      const data = await requestGraphQL<ProjectsQueryData>(
        endpoint,
        "Projects",
        projectsOperation,
        {
          input,
        },
      );
      return data.projects;
    },
    async getProject(id) {
      const data = await requestGraphQL<ProjectQueryData>(endpoint, "Project", projectOperation, {
        id,
      });
      return data.project ?? null;
    },
    async createProject(input) {
      const data = await requestGraphQL<CreateProjectMutationData>(
        endpoint,
        "CreateProject",
        createProjectOperation,
        { input },
      );
      return data.createProject;
    },
    async selectProject(projectId) {
      const data = await requestGraphQL<SelectProjectMutationData>(
        endpoint,
        "SelectProject",
        selectProjectOperation,
        { projectId },
      );
      return data.selectProject;
    },
    async getOrganizationMembers(organizationId) {
      const data = await requestGraphQL<OrganizationMembersQueryData>(
        endpoint,
        "OrganizationMembers",
        organizationMembersOperation,
        { organizationId },
      );
      return data.organizationMembers;
    },
    async getOrganizationInvitations(organizationId) {
      const data = await requestGraphQL<OrganizationInvitationsQueryData>(
        endpoint,
        "OrganizationInvitations",
        organizationInvitationsOperation,
        { organizationId },
      );
      return data.organizationInvitations;
    },
    async inviteOrganizationMember(input) {
      const data = await requestGraphQL<InviteOrganizationMemberMutationData>(
        endpoint,
        "InviteOrganizationMember",
        inviteOrganizationMemberOperation,
        { input },
      );
      return data.inviteOrganizationMember;
    },
    async inviteProjectMember(input) {
      const data = await requestGraphQL<InviteProjectMemberMutationData>(
        endpoint,
        "InviteProjectMember",
        inviteProjectMemberOperation,
        { input },
      );
      return data.inviteProjectMember;
    },
    async resendOrganizationInvitation(id) {
      const data = await requestGraphQL<ResendOrganizationInvitationMutationData>(
        endpoint,
        "ResendOrganizationInvitation",
        resendOrganizationInvitationOperation,
        { id },
      );
      return data.resendOrganizationInvitation;
    },
    async revokeOrganizationInvitation(id) {
      const data = await requestGraphQL<RevokeOrganizationInvitationMutationData>(
        endpoint,
        "RevokeOrganizationInvitation",
        revokeOrganizationInvitationOperation,
        { id },
      );
      return data.revokeOrganizationInvitation;
    },
    async updateOrganizationMember(input) {
      const data = await requestGraphQL<UpdateOrganizationMemberMutationData>(
        endpoint,
        "UpdateOrganizationMember",
        updateOrganizationMemberOperation,
        { input },
      );
      return data.updateOrganizationMember;
    },
    async removeOrganizationMember(input) {
      const data = await requestGraphQL<RemoveOrganizationMemberMutationData>(
        endpoint,
        "RemoveOrganizationMember",
        removeOrganizationMemberOperation,
        { input },
      );
      return data.removeOrganizationMember;
    },
    async getProjectMembers(projectId) {
      const data = await requestGraphQL<ProjectMembersQueryData>(
        endpoint,
        "ProjectMembers",
        projectMembersOperation,
        { projectId },
      );
      return data.projectMembers;
    },
    async updateProjectMember(input) {
      const data = await requestGraphQL<UpdateProjectMemberMutationData>(
        endpoint,
        "UpdateProjectMember",
        updateProjectMemberOperation,
        input,
      );
      return data.updateProjectMember;
    },
    async removeProjectMember(projectId, userId) {
      const data = await requestGraphQL<RemoveProjectMemberMutationData>(
        endpoint,
        "RemoveProjectMember",
        removeProjectMemberOperation,
        { projectId, userId },
      );
      return data.removeProjectMember;
    },
    async getIngestCredentials(projectId) {
      const data = await requestGraphQL<IngestCredentialsQueryData>(
        endpoint,
        "IngestCredentials",
        ingestCredentialsOperation,
        { projectId },
      );
      return data.ingestCredentials;
    },
    async createIngestCredential(input) {
      const data = await requestGraphQL<CreateIngestCredentialMutationData>(
        endpoint,
        "CreateIngestCredential",
        createIngestCredentialOperation,
        { input },
      );
      return data.createIngestCredential;
    },
    async revokeIngestCredential(id) {
      const data = await requestGraphQL<RevokeIngestCredentialMutationData>(
        endpoint,
        "RevokeIngestCredential",
        revokeIngestCredentialOperation,
        { id },
      );
      return data.revokeIngestCredential;
    },
    async getDashboards(input = {}) {
      const data = await requestGraphQL<{ dashboards: DashboardListResult }>(
        endpoint,
        "Dashboards",
        dashboardsOperation,
        { input },
      );
      return data.dashboards;
    },
    async saveDashboard(input) {
      const data = await requestGraphQL<{ saveDashboard: Dashboard }>(
        endpoint,
        "SaveDashboard",
        saveDashboardOperation,
        { input },
      );
      return data.saveDashboard;
    },
    async deleteDashboard(id) {
      const data = await requestGraphQL<{ deleteDashboard: boolean }>(
        endpoint,
        "DeleteDashboard",
        deleteDashboardOperation,
        { id },
      );
      return data.deleteDashboard;
    },
    async setDashboardPinned(input) {
      const data = await requestGraphQL<{ setDashboardPinned: DashboardPreferences }>(
        endpoint,
        "SetDashboardPinned",
        setDashboardPinnedOperation,
        { input },
      );
      return data.setDashboardPinned;
    },
    async reorderDashboardPins(input) {
      const data = await requestGraphQL<{ reorderDashboardPins: DashboardPreferences }>(
        endpoint,
        "ReorderDashboardPins",
        reorderDashboardPinsOperation,
        { input },
      );
      return data.reorderDashboardPins;
    },
    async getRetentionPolicy(projectId) {
      const data = await requestGraphQL<RetentionPolicyQueryData>(
        endpoint,
        "RetentionPolicy",
        retentionPolicyOperation,
        { projectId },
      );
      return data.retentionPolicy;
    },
    async updateRetentionPolicy(input) {
      const data = await requestGraphQL<UpdateRetentionPolicyMutationData>(
        endpoint,
        "UpdateRetentionPolicy",
        updateRetentionPolicyOperation,
        { input },
      );
      return data.updateRetentionPolicy;
    },
    async getProjectAiSettings(projectId) {
      const data = await requestGraphQL<ProjectAiSettingsQueryData>(
        endpoint,
        "ProjectAiSettings",
        projectAiSettingsOperation,
        { projectId },
      );
      return data.projectAiSettings;
    },
    async updateProjectAiSettings(input) {
      const data = await requestGraphQL<UpdateProjectAiSettingsMutationData>(
        endpoint,
        "UpdateProjectAiSettings",
        updateProjectAiSettingsOperation,
        { input },
      );
      return data.updateProjectAiSettings;
    },
    async getCompanyAiProviderSettings(companyId) {
      const data = await requestGraphQL<CompanyAiProviderSettingsQueryData>(
        endpoint,
        "CompanyAiProviderSettings",
        companyAiProviderSettingsOperation,
        { companyId },
      );
      return data.companyAiProviderSettings;
    },
    async updateCompanyAiProviderSettings(input) {
      const data = await requestGraphQL<UpdateCompanyAiProviderSettingsMutationData>(
        endpoint,
        "UpdateCompanyAiProviderSettings",
        updateCompanyAiProviderSettingsOperation,
        { input },
      );
      return data.updateCompanyAiProviderSettings;
    },
    async getAiChatHistory(input) {
      const data = await requestGraphQL<AiChatHistoryQueryData>(
        endpoint,
        "AiChatHistory",
        aiChatHistoryOperation,
        { input },
      );
      return data.aiChatHistory;
    },
    async getAiChatConversation(id) {
      const data = await requestGraphQL<AiChatConversationQueryData>(
        endpoint,
        "AiChatConversation",
        aiChatConversationOperation,
        { id },
      );
      return data.aiChatConversation ?? null;
    },
    async createAiChatConversation(input) {
      const data = await requestGraphQL<CreateAiChatConversationMutationData>(
        endpoint,
        "CreateAiChatConversation",
        createAiChatConversationOperation,
        { input },
      );
      return data.createAiChatConversation;
    },
    async deleteAiChatConversation(id) {
      const data = await requestGraphQL<DeleteAiChatConversationMutationData>(
        endpoint,
        "DeleteAiChatConversation",
        deleteAiChatConversationOperation,
        { id },
      );
      return data.deleteAiChatConversation;
    },
    async approveAiChatAction(input) {
      const data = await requestGraphQL<ApproveAiChatActionMutationData>(
        endpoint,
        "ApproveAiChatAction",
        approveAiChatActionOperation,
        { input },
      );
      return data.approveAiChatAction;
    },
    streamAiChatRun(input, options) {
      return streamAiChatRun(endpoint, input, options);
    },
    async getAlertRules(projectId, input = {}) {
      const data = await requestGraphQL<AlertRulesQueryData>(
        endpoint,
        "AlertRules",
        alertRulesOperation,
        { projectId, input },
      );
      return data.alertRules;
    },
    async getAlertHistory({ projectId, ruleId = null, first = 50, after = null }) {
      const data = await requestGraphQL<AlertHistoryQueryData>(
        endpoint,
        "AlertHistory",
        alertHistoryOperation,
        { projectId, ruleId, first, after },
      );
      return data.alertHistory;
    },
    async getAlertSummary(projectId, input = {}) {
      const data = await requestGraphQL<AlertSummaryQueryData>(
        endpoint,
        "AlertSummary",
        alertSummaryOperation,
        { projectId, input },
      );
      return data.alertSummary;
    },
    async getAlertSilences({ projectId, ruleId = null }) {
      const data = await requestGraphQL<AlertSilencesQueryData>(
        endpoint,
        "AlertSilences",
        alertSilencesOperation,
        { projectId, ruleId },
      );
      return data.alertSilences;
    },
    async createAlertRule(input) {
      const data = await requestGraphQL<CreateAlertRuleMutationData>(
        endpoint,
        "CreateAlertRule",
        createAlertRuleOperation,
        { input },
      );
      return data.createAlertRule;
    },
    async updateAlertRule(input) {
      const data = await requestGraphQL<UpdateAlertRuleMutationData>(
        endpoint,
        "UpdateAlertRule",
        updateAlertRuleOperation,
        { input },
      );
      return data.updateAlertRule;
    },
    async deleteAlertRule(id) {
      const data = await requestGraphQL<DeleteAlertRuleMutationData>(
        endpoint,
        "DeleteAlertRule",
        deleteAlertRuleOperation,
        { id },
      );
      return data.deleteAlertRule;
    },
    async createAlertSilence(input) {
      const data = await requestGraphQL<CreateAlertSilenceMutationData>(
        endpoint,
        "CreateAlertSilence",
        createAlertSilenceOperation,
        { input },
      );
      return data.createAlertSilence;
    },
    async deleteAlertSilence(id) {
      const data = await requestGraphQL<DeleteAlertSilenceMutationData>(
        endpoint,
        "DeleteAlertSilence",
        deleteAlertSilenceOperation,
        { id },
      );
      return data.deleteAlertSilence;
    },
  };
}
