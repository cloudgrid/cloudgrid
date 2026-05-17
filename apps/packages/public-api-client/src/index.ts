import type {
  AgentRun,
  AgentRunQueryData,
  AgentRunSearchInput,
  AgentRunsQueryData,
  AiQualityOverview,
  AiQualityOverviewInput,
  AiQualityOverviewQueryData,
  AlertEventConnection,
  AlertHistoryQueryData,
  AlertRule,
  AlertRulesQueryData,
  AlertSilence,
  AlertSilencesQueryData,
  AnnotationQueueQueryData,
  AnnotationQueueResult,
  AnnotationQueueSearchInput,
  CommitDatasetImportInput,
  CreateAlertRuleInput,
  CreateAlertRuleMutationData,
  CreateAlertSilenceInput,
  CreateAlertSilenceMutationData,
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
  UpdateProjectMemberMutationData,
  UpdateRetentionPolicyInput,
  UpdateRetentionPolicyMutationData,
  Viewer,
  ViewerQueryData,
} from "@cloudgrid/ui-contracts";
import { z } from "zod";
import type {
  Dashboard,
  DashboardListInput,
  DashboardListResult,
  DashboardPreferences,
  ReorderDashboardPinsInput,
  SaveDashboardInput,
  SetDashboardPinnedInput,
} from "./dashboard-contracts";

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
  getAlertRules: (projectId: string) => Promise<AlertRule[]>;
  getAlertHistory: (input: {
    projectId: string;
    ruleId?: string | null;
    first?: number;
    after?: string | null;
  }) => Promise<AlertEventConnection>;
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

export type LiveTraceConnectionState = "connecting" | "live" | "reconnecting" | "closed" | "error";

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

export interface LiveTraceSubscription {
  unsubscribe: () => void;
}

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
    async getAlertRules(projectId) {
      const data = await requestGraphQL<AlertRulesQueryData>(
        endpoint,
        "AlertRules",
        alertRulesOperation,
        { projectId },
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

const projectFields = `
  id
  organizationId
  name
  slug
  status
  telemetry {
    lastIngestAt
    traceCount
    logCount
    metricCount
    serviceCount
  }
`;

const organizationFields = `
  id
  name
  slug
  role
  projects {
    ${projectFields}
  }
`;

const viewerFields = `
  user {
    id
    displayName
    email
  }
  organizations {
    ${organizationFields}
  }
  selectedProject {
    ${projectFields}
  }
`;

export const viewerOperation = `
  query Viewer {
    viewer {
      ${viewerFields}
    }
  }
`;

export const organizationsOperation = `
  query Organizations {
    organizations {
      ${organizationFields}
    }
  }
`;

export const organizationOperation = `
  query Organization($id: ID!) {
    organization(id: $id) {
      ${organizationFields}
    }
  }
`;

export const projectsOperation = `
  query Projects($input: ProjectListInput) {
    projects(input: $input) {
      ${projectFields}
    }
  }
`;

export const projectOperation = `
  query Project($id: ID!) {
    project(id: $id) {
      ${projectFields}
    }
  }
`;

export const selectProjectOperation = `
  mutation SelectProject($projectId: ID!) {
    selectProject(projectId: $projectId) {
      ${viewerFields}
    }
  }
`;

export const createProjectOperation = `
  mutation CreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      ${projectFields}
    }
  }
`;

export const updateOrganizationMemberOperation = `
  mutation UpdateOrganizationMember($input: UpdateOrganizationMemberInput!) {
    updateOrganizationMember(input: $input) {
      user {
        id
        displayName
        email
      }
      role
    }
  }
`;

export const removeOrganizationMemberOperation = `
  mutation RemoveOrganizationMember($input: RemoveOrganizationMemberInput!) {
    removeOrganizationMember(input: $input)
  }
`;

const organizationMemberFields = `
  user {
    id
    displayName
    email
  }
  role
`;

const organizationInvitationFields = `
  id
  organizationId
  email
  role
  status
  invitedByUserId
  acceptedByUserId
  createdAt
  updatedAt
  acceptedAt
  revokedAt
  expiresAt
`;

export const organizationMembersOperation = `
  query OrganizationMembers($organizationId: ID!) {
    organizationMembers(organizationId: $organizationId) {
      ${organizationMemberFields}
    }
  }
`;

export const organizationInvitationsOperation = `
  query OrganizationInvitations($organizationId: ID!) {
    organizationInvitations(organizationId: $organizationId) {
      ${organizationInvitationFields}
    }
  }
`;

export const inviteOrganizationMemberOperation = `
  mutation InviteOrganizationMember($input: InviteOrganizationMemberInput!) {
    inviteOrganizationMember(input: $input) {
      ${organizationInvitationFields}
    }
  }
`;

export const revokeOrganizationInvitationOperation = `
  mutation RevokeOrganizationInvitation($id: ID!) {
    revokeOrganizationInvitation(id: $id) {
      ${organizationInvitationFields}
    }
  }
`;

const projectMemberFields = `
  projectId
  userId
  email
  displayName
  role
  effectiveRole
  source
  createdAt
  createdByUserId
  updatedAt
  updatedByUserId
`;

export const projectMembersOperation = `
  query ProjectMembers($projectId: ID!) {
    projectMembers(projectId: $projectId) {
      ${projectMemberFields}
    }
  }
`;

export const updateProjectMemberOperation = `
  mutation UpdateProjectMember($projectId: ID!, $userId: ID!, $role: ProjectRole!) {
    updateProjectMember(projectId: $projectId, userId: $userId, role: $role) {
      ${projectMemberFields}
    }
  }
`;

export const removeProjectMemberOperation = `
  mutation RemoveProjectMember($projectId: ID!, $userId: ID!) {
    removeProjectMember(projectId: $projectId, userId: $userId)
  }
`;

const ingestCredentialFields = `
  id
  projectId
  title
  scopes
  secretPreview
  createdAt
  lastUsedAt
  revokedAt
  createdByUserId
`;

export const ingestCredentialsOperation = `
  query IngestCredentials($projectId: ID!) {
    ingestCredentials(projectId: $projectId) {
      items {
        ${ingestCredentialFields}
      }
    }
  }
`;

export const createIngestCredentialOperation = `
  mutation CreateIngestCredential($input: CreateIngestCredentialInput!) {
    createIngestCredential(input: $input) {
      credential {
        ${ingestCredentialFields}
      }
      secret
    }
  }
`;

export const revokeIngestCredentialOperation = `
  mutation RevokeIngestCredential($id: ID!) {
    revokeIngestCredential(id: $id) {
      ${ingestCredentialFields}
    }
  }
`;

export const traceSearchOperation = `
  query TraceSearch($input: TraceSearchInput) {
    traces(input: $input) {
      items {
        id
        serviceName
        startedAt
        endedAt
        durationMs
        rootSpanId
        status
        attributes
        spanCount
        errorSpanCount
        logCount
        serviceCount
      }
      nextCursor
    }
  }
`;

export const traceDetailOperation = `
  query TraceDetail($id: ID!, $input: TraceDetailInput) {
    trace(id: $id, input: $input) {
      trace {
        id
        serviceName
        startedAt
        endedAt
        durationMs
        rootSpanId
        status
        attributes
      }
      structure {
        rootSpanIds
        orphanSpanIds
        criticalPathSpanIds
        maxDepth
        serviceBreakdown {
          serviceName
          spanCount
          errorSpanCount
          durationMs
          percentOfTraceDuration
        }
      }
      spans {
        id
        traceId
        parentSpanId
        name
        kind
        serviceName
        startedAt
        endedAt
        durationMs
        status
        attributes
        depth
        childCount
        hasError
        isCriticalPath
        isOrphan
        isServiceEntry
        exceptionCount
        events {
          name
          timestamp
          attributes
        }
        links {
          traceId
          spanId
          traceState
          attributes
          direction
        }
        exceptions {
          timestamp
          type
          message
          stacktrace
          escaped
          attributes
          frames {
            raw
            functionName
            fileName
            lineNumber
            columnNumber
            language
          }
        }
      }
      selectedSpan {
        id
        traceId
        parentSpanId
        name
        kind
        serviceName
        startedAt
        endedAt
        durationMs
        status
        attributes
        depth
        childCount
        hasError
        isCriticalPath
        isOrphan
        isServiceEntry
        exceptionCount
        events {
          name
          timestamp
          attributes
        }
        links {
          traceId
          spanId
          traceState
          attributes
          direction
        }
        exceptions {
          timestamp
          type
          message
          stacktrace
          escaped
          attributes
          frames {
            raw
            functionName
            fileName
            lineNumber
            columnNumber
            language
          }
        }
      }
      spanMatches {
        spanId
        reason
        fields
      }
      logs {
        id
        traceId
        spanId
        serviceName
        severityText
        severityNumber
        body
        timestamp
        observedTimestamp
        attributes
        correlation
      }
      relatedLogs {
        id
        traceId
        spanId
        serviceName
        severityText
        severityNumber
        body
        timestamp
        observedTimestamp
        attributes
        correlation
      }
      warnings {
        code
        message
        spanId
      }
    }
  }
`;

export const logSearchOperation = `
  query LogSearch($input: LogSearchInput) {
    logs(input: $input) {
      items {
        id
        traceId
        spanId
        serviceName
        severityText
        severityNumber
        body
        timestamp
        observedTimestamp
        attributes
        correlation
      }
      nextCursor
    }
  }
`;

export const telemetryFacetsOperation = `
  query TelemetryFacets($input: TelemetryFacetInput) {
    telemetryFacets(input: $input) {
      services {
        value
        count
      }
      operations {
        value
        count
      }
      spanNames {
        value
        count
      }
      severities {
        value
        count
      }
      attributeKeys {
        value
        count
      }
    }
  }
`;

const metricDescriptorFields = `
  id
  name
  description
  unit
  kind
  aggregationTemporality
  monotonic
  attributeKeys
  firstSeenAt
  lastSeenAt
`;

const dashboardThresholdFields = `
  value
  severity
  label
`;

const dashboardWidgetLayoutFields = `
  x
  y
  w
  h
  minW
  minH
`;

const dashboardWidgetFields = `
  id
  title
  description
  kind
  layout {
    ${dashboardWidgetLayoutFields}
  }
  metric {
    metricName
    aggregation
    groupBy
    filters {
      key
      operator
      value
    }
    timeWindow
    interval
    visualization
    legend
    maxSeries
    thresholds {
      ${dashboardThresholdFields}
    }
  }
  richMetric {
    query {
      timeWindow
      interval
      queries {
        id
        label
        metricName
        aggregation
        groupBy
        filters {
          key
          operator
          value
        }
        maxSeries
      }
      formulas {
        id
        label
        expression {
          kind
          refId
          value
          operator
          left {
            kind
            refId
            value
          }
          right {
            kind
            refId
            value
          }
          function
          arguments {
            kind
            refId
            value
          }
        }
        unit
      }
      displaySeries {
        id
        label
        sourceId
        visible
      }
    }
    visualization
    legend
    maxSeries
    thresholds {
      ${dashboardThresholdFields}
    }
  }
  logs {
    service
    traceId
    spanId
    severity
    search
    attributes {
      key
      operator
      value
    }
    sort
    limit
    columns
  }
  traces {
    service
    query
    operationName
    spanName
    status
    minDurationMs
    maxDurationMs
    attributes {
      key
      operator
      value
    }
    sort
    limit
    columns
  }
  liveTraces {
    service
    query
    operationName
    spanName
    status
    minDurationMs
    maxDurationMs
    attributes {
      key
      operator
      value
    }
    limit
  }
`;

const dashboardFields = `
  id
  projectId
  slug
  name
  description
  tags
  version
  visibility
  defaultTimeWindow
  pinned
  widgets {
    ${dashboardWidgetFields}
  }
  createdAt
  updatedAt
  createdBy
  updatedBy
`;

export const metricNamesOperation = `
  query MetricNames($input: MetricNameSearchInput) {
    metricNames(input: $input) {
      items {
        ${metricDescriptorFields}
      }
    }
  }
`;

export const metricSeriesOperation = `
  query MetricSeries($input: MetricSeriesInput!) {
    metricSeries(input: $input) {
      metric {
        ${metricDescriptorFields}
      }
      aggregation
      interval
      groupBy
      series {
        labels
        points {
          timestamp
          value
          count
          exemplars {
            timestamp
            value
            traceId
            spanId
            attributes
          }
        }
      }
      warnings {
        code
        message
        field
      }
    }
  }
`;

export const richMetricSeriesOperation = `
  query RichMetricSeries($input: RichMetricSeriesInput!) {
    richMetricSeries(input: $input) {
      interval
      series {
        id
        label
        sourceId
        unit
        labels
        points {
          timestamp
          value
          count
          exemplars {
            timestamp
            value
            traceId
            spanId
            attributes
          }
        }
      }
      displaySeries {
        id
        label
        sourceId
        visible
      }
      warnings {
        code
        message
        field
      }
    }
  }
`;

export const dashboardsOperation = `
  query Dashboards($input: DashboardListInput) {
    dashboards(input: $input) {
      items {
        ${dashboardFields}
      }
      pinnedDashboardIds
    }
  }
`;

export const saveDashboardOperation = `
  mutation SaveDashboard($input: SaveDashboardInput!) {
    saveDashboard(input: $input) {
      ${dashboardFields}
    }
  }
`;

export const deleteDashboardOperation = `
  mutation DeleteDashboard($id: ID!) {
    deleteDashboard(id: $id)
  }
`;

export const setDashboardPinnedOperation = `
  mutation SetDashboardPinned($input: SetDashboardPinnedInput!) {
    setDashboardPinned(input: $input) {
      projectId
      pinnedDashboardIds
      updatedAt
    }
  }
`;

export const reorderDashboardPinsOperation = `
  mutation ReorderDashboardPins($input: ReorderDashboardPinsInput!) {
    reorderDashboardPins(input: $input) {
      projectId
      pinnedDashboardIds
      updatedAt
    }
  }
`;

const retentionRuleFields = `
  dataClass
  mode
  retentionDays
  softDeleteDays
  updatedAt
  updatedByUserId
  version
`;

const retentionPolicyFields = `
  projectId
  rules {
    ${retentionRuleFields}
  }
  updatedAt
  updatedByUserId
  version
`;

export const retentionPolicyOperation = `
  query RetentionPolicy($projectId: ID!) {
    retentionPolicy(projectId: $projectId) {
      ${retentionPolicyFields}
    }
  }
`;

export const updateRetentionPolicyOperation = `
  mutation UpdateRetentionPolicy($input: UpdateRetentionPolicyInput!) {
    updateRetentionPolicy(input: $input) {
      ${retentionPolicyFields}
    }
  }
`;

const projectAiSettingsFields = `
  projectId
  enabled
  defaultProviderProfileId
  defaultJudgeProfileId
  defaultOptimizerProfileId
  defaultEmbeddingProfileId
  providerProfiles {
    id
    projectId
    label
    providerKind
    baseUrl
    credentialRef
    models
    timeoutMs
    maxConcurrency
    disabledAt
  }
  modelAliases {
    id
    name
    providerProfileId
    model
    purpose
    parameters
  }
  onlinePolicies {
    id
    enabled
    name
    target
    scorerIds
    sampleRate
    maxDailyRuns
    annotationRules {
      reason
      threshold
      assignTo
      datasetId
    }
    updatedAt
    updatedByUserId
  }
  budget {
    dailyUsd
    perRunUsd
    deterministicOnly
    spentTodayUsd
  }
  sampling {
    defaultOnlineSampleRate
    maxOnlineSampleRate
    maxConcurrentExperimentItems
    maxConcurrentOptimizationCandidates
  }
  datasetDefaults {
    splitAllocation
    smallDatasetReviewedThreshold
    requireReviewForRegression
  }
  effective {
    warnings
    deterministicOnly
    missingProviderProfiles
    disabledProviderProfiles
    budgetExhausted
  }
  version
  updatedAt
  updatedByUserId
`;

export const projectAiSettingsOperation = `
  query ProjectAiSettings($projectId: ID!) {
    projectAiSettings(projectId: $projectId) {
      ${projectAiSettingsFields}
    }
  }
`;

export const updateProjectAiSettingsOperation = `
  mutation UpdateProjectAiSettings($input: UpdateProjectAiSettingsInput!) {
    updateProjectAiSettings(input: $input) {
      ${projectAiSettingsFields}
    }
  }
`;

const alertRuleFields = `
  id
  projectId
  name
  enabled
  kind
  severity
  query
  condition
  evaluationWindowSeconds
  pendingForSeconds
  cooldownSeconds
  notificationAdapterIds
  createdAt
  updatedAt
  updatedByUserId
  version
`;

const alertEventFields = `
  id
  projectId
  ruleId
  instanceId
  state
  severity
  summary
  deduplicationKey
  startedAt
  endedAt
  createdAt
  evidenceTraceId
  evidenceSpanId
  evidenceLogId
  evidenceMetricName
`;

const alertSilenceFields = `
  id
  projectId
  ruleId
  reason
  startsAt
  endsAt
  createdAt
  createdByUserId
  active
`;

export const alertRulesOperation = `
  query AlertRules($projectId: ID!) {
    alertRules(projectId: $projectId) {
      ${alertRuleFields}
    }
  }
`;

export const alertHistoryOperation = `
  query AlertHistory($projectId: ID!, $ruleId: ID, $first: Int = 50, $after: String) {
    alertHistory(projectId: $projectId, ruleId: $ruleId, first: $first, after: $after) {
      items {
        ${alertEventFields}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const alertSilencesOperation = `
  query AlertSilences($projectId: ID!, $ruleId: ID) {
    alertSilences(projectId: $projectId, ruleId: $ruleId) {
      ${alertSilenceFields}
    }
  }
`;

export const createAlertRuleOperation = `
  mutation CreateAlertRule($input: CreateAlertRuleInput!) {
    createAlertRule(input: $input) {
      ${alertRuleFields}
    }
  }
`;

export const updateAlertRuleOperation = `
  mutation UpdateAlertRule($input: UpdateAlertRuleInput!) {
    updateAlertRule(input: $input) {
      ${alertRuleFields}
    }
  }
`;

export const deleteAlertRuleOperation = `
  mutation DeleteAlertRule($id: ID!) {
    deleteAlertRule(id: $id)
  }
`;

export const createAlertSilenceOperation = `
  mutation CreateAlertSilence($input: CreateAlertSilenceInput!) {
    createAlertSilence(input: $input) {
      ${alertSilenceFields}
    }
  }
`;

export const deleteAlertSilenceOperation = `
  mutation DeleteAlertSilence($id: ID!) {
    deleteAlertSilence(id: $id)
  }
`;

const evalResultFields = `
  id
  scorerId
  scorerVersion
  targetKind
  targetId
  experimentRunId
  score
  passed
  evidence
  judgeRunRef
  producedAt
`;

const datasetItemFields = `
  id
  datasetId
  version
  input
  expected
  metadata
  sourceTraceId
  sourceSpanId
  split
  reviewStatus
  synthetic
  duplicateOfItemId
  leakageWarnings
`;

const datasetItemRunFields = `
  id
  experimentRunId
  datasetItemId
  harnessRunId
  output
  latencyMs
  tokenTotals {
    input
    output
    total
  }
  evalResults {
    ${evalResultFields}
  }
`;

const experimentRunFields = `
  id
  experimentId
  solverRef
  manifest {
    digest
    datasetId
    datasetVersion
    splitSelector {
      splits
      reviewedOnly
      includeSynthetic
    }
    scorerRefs {
      id
      version
    }
    baselineRef
    solverRef
    promptVersionRefs
    skillSnapshotRefs
    toolSnapshotRefs
    providerProfileRefs
    budget
    concurrency
    createdAt
  }
  baselineRunId
  status
  startedAt
  endedAt
  summary
  itemRuns {
    items {
      ${datasetItemRunFields}
    }
    nextCursor
  }
`;

const agentRunFields = `
  id
  traceId
  rootSpanId
  agent {
    id
    name
    version
  }
  status
  startedAt
  endedAt
  durationMs
  tokenTotals {
    input
    output
    total
  }
  costEstimate {
    amount
    currency
  }
  transcript {
    role
    content
    contentDigest
    spanId
    timestamp
  }
  llmCalls {
    id
    traceId
    spanId
    provider
    requestModel
    responseModel
    latencyMs
    tokenTotals {
      input
      output
      total
    }
    tokenDetails
  }
  toolCalls {
    id
    traceId
    spanId
    toolName
    toolCallId
    parametersDigest
    resultDigest
    latencyMs
    status
    synthetic
  }
  retrievalEvents {
    id
    traceId
    spanId
    documentCount
    topK
    embeddingModel
    latencyMs
    documentDigests
  }
  evalResults {
    ${evalResultFields}
  }
`;

export const agentRunsOperation = `
  query AgentRuns($input: AgentRunSearchInput) {
    agentRuns(input: $input) {
      items {
        ${agentRunFields}
      }
      nextCursor
    }
  }
`;

export const agentRunOperation = `
  query AgentRun($id: ID!) {
    agentRun(id: $id) {
      ${agentRunFields}
    }
  }
`;

export const datasetsOperation = `
  query Datasets($input: DatasetSearchInput) {
    datasets(input: $input) {
      items {
        id
        name
        description
        version
        createdAt
        itemCount
        reviewedItemCount
        splitCounts
        health {
          status
          reviewedItemCount
          totalItemCount
          splitCounts
          duplicateCandidateCount
          leakageWarningCount
          missingExpectedCount
          schemaIssueCount
          smallDataset
          warnings
        }
        tags
        items {
          items {
            ${datasetItemFields}
          }
          nextCursor
        }
      }
      nextCursor
    }
  }
`;

export const datasetOperation = `
  query Dataset($id: ID!) {
    dataset(id: $id) {
      id
      name
      description
      version
      createdAt
      itemCount
      reviewedItemCount
      splitCounts
      health {
        status
        reviewedItemCount
        totalItemCount
        splitCounts
        duplicateCandidateCount
        leakageWarningCount
        missingExpectedCount
        schemaIssueCount
        smallDataset
        warnings
      }
      tags
      items {
        items {
          ${datasetItemFields}
        }
        nextCursor
      }
    }
  }
`;

export const createDatasetOperation = `
  mutation CreateDataset($input: CreateDatasetInput!) {
    createDataset(input: $input) {
      id
      name
      description
      version
      createdAt
      itemCount
      reviewedItemCount
      splitCounts
      health {
        status
        reviewedItemCount
        totalItemCount
        splitCounts
        duplicateCandidateCount
        leakageWarningCount
        missingExpectedCount
        schemaIssueCount
        smallDataset
        warnings
      }
      tags
      items {
        items {
          ${datasetItemFields}
        }
        nextCursor
      }
    }
  }
`;

export const scorersOperation = `
  query Scorers($input: ScorerSearchInput) {
    scorers(input: $input) {
      items {
        id
        name
        kind
        definition
        judgeModelRef
        version
      }
      nextCursor
    }
  }
`;

export const createScorerOperation = `
  mutation CreateScorer($input: CreateScorerInput!) {
    createScorer(input: $input) {
      id
      name
      kind
      definition
      judgeModelRef
      version
    }
  }
`;

export const experimentsOperation = `
  query Experiments($input: ExperimentSearchInput) {
    experiments(input: $input) {
      items {
        id
        name
        datasetId
        datasetVersion
        scorerIds
        splitSelector {
          splits
          reviewedOnly
          includeSynthetic
        }
        baselineRef
        promptVersionRefs
        skillSnapshotRefs
        toolSnapshotRefs
        providerProfileRefs
        createdAt
        tags
        runs {
          items {
            ${experimentRunFields}
          }
          nextCursor
        }
      }
      nextCursor
    }
  }
`;

export const createExperimentOperation = `
  mutation CreateExperiment($input: CreateExperimentInput!) {
    createExperiment(input: $input) {
      id
      name
      datasetId
      datasetVersion
      scorerIds
      splitSelector {
        splits
        reviewedOnly
        includeSynthetic
      }
      baselineRef
      promptVersionRefs
      skillSnapshotRefs
      toolSnapshotRefs
      providerProfileRefs
      createdAt
      tags
      runs {
        items {
          ${experimentRunFields}
        }
        nextCursor
      }
    }
  }
`;

export const startExperimentRunOperation = `
  mutation StartExperimentRun($input: StartExperimentRunInput!) {
    startExperimentRun(input: $input) {
      ${experimentRunFields}
    }
  }
`;

export const experimentRunOperation = `
  query ExperimentRun($id: ID!) {
    experimentRun(id: $id) {
      ${experimentRunFields}
    }
  }
`;

export const annotationQueueOperation = `
  query AnnotationQueue($input: AnnotationQueueSearchInput) {
    annotationQueue(input: $input) {
      items {
        id
        targetTraceId
        targetSpanId
        reason
        assignedTo
        status
        createdAt
        resolvedDatasetItemId
        scorerId
        score
        evidence
      }
      nextCursor
    }
  }
`;

const datasetImportJobFields = `
  id
  datasetId
  status
  format
  sourceFiles {
    path
    format
    sizeBytes
    rowCount
    sha256
  }
  mapping
  defaults
  previewRows {
    rowNumber
    filePath
    item {
      input
      expected
      metadata
      sourceTraceId
      sourceSpanId
      split
      reviewStatus
      synthetic
    }
    errors {
      code
      message
      path
    }
    warnings {
      code
      message
      path
    }
  }
  totalRows
  validRows
  errorRows
  warnings
  createdAt
  expiresAt
  committedDatasetVersion
`;

const datasetExportJobFields = `
  id
  datasetId
  datasetVersion
  status
  format
  rowCount
  sizeBytes
  sha256
  downloadUrl
  createdAt
  expiresAt
`;

export const prepareDatasetImportOperation = `
  mutation PrepareDatasetImport($input: PrepareDatasetImportInput!) {
    prepareDatasetImport(input: $input) {
      ${datasetImportJobFields}
    }
  }
`;

export const commitDatasetImportOperation = `
  mutation CommitDatasetImport($input: CommitDatasetImportInput!) {
    commitDatasetImport(input: $input) {
      ${datasetImportJobFields}
    }
  }
`;

export const startDatasetExportOperation = `
  mutation StartDatasetExport($input: StartDatasetExportInput!) {
    startDatasetExport(input: $input) {
      ${datasetExportJobFields}
    }
  }
`;

export const datasetExportOperation = `
  query DatasetExport($id: ID!) {
    datasetExport(id: $id) {
      ${datasetExportJobFields}
    }
  }
`;

export const aiQualityOverviewOperation = `
  query AiQualityOverview($input: AiQualityOverviewInput!) {
    aiQualityOverview(input: $input) {
      projectId
      from
      to
      summary
      warnings
      segments {
        key
        label
        dimensions
        runCount
        scoredRunCount
        passRate
        meanScore
        p50LatencyMs
        p95LatencyMs
        costUsd
        regressionCount
      }
    }
  }
`;

export const liveTraceSubscriptionOperation = `
  subscription LiveTrace($input: LiveTraceInput) {
    liveTraces(input: $input) {
      type
      seq
      receivedAt
      trace {
        id
        serviceName
        startedAt
        endedAt
        durationMs
        rootSpanId
        status
        attributes
        spanCount
        errorSpanCount
        logCount
        serviceCount
      }
    }
  }
`;

export const liveExperimentRunSubscriptionOperation = `
  subscription LiveExperimentRun($input: LiveExperimentRunInput!) {
    liveExperimentRun(input: $input) {
      type
      seq
      receivedAt
      run {
        ${experimentRunFields}
      }
      itemRun {
        ${datasetItemRunFields}
      }
    }
  }
`;

export type PublicGraphQLOperationKind = "query" | "mutation" | "subscription";

export interface PublicGraphQLOperationDescriptor {
  operationName: string;
  document: string;
  kind: PublicGraphQLOperationKind;
  area: "control" | "telemetry" | "dashboard" | "settings" | "alerting" | "ai-eval";
  requiresSelectedProject: boolean;
}

export const publicGraphQLOperations = [
  {
    operationName: "Viewer",
    document: viewerOperation,
    kind: "query",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "Organizations",
    document: organizationsOperation,
    kind: "query",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "Organization",
    document: organizationOperation,
    kind: "query",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "Projects",
    document: projectsOperation,
    kind: "query",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "Project",
    document: projectOperation,
    kind: "query",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "SelectProject",
    document: selectProjectOperation,
    kind: "mutation",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "CreateProject",
    document: createProjectOperation,
    kind: "mutation",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "UpdateOrganizationMember",
    document: updateOrganizationMemberOperation,
    kind: "mutation",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "RemoveOrganizationMember",
    document: removeOrganizationMemberOperation,
    kind: "mutation",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "OrganizationMembers",
    document: organizationMembersOperation,
    kind: "query",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "OrganizationInvitations",
    document: organizationInvitationsOperation,
    kind: "query",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "InviteOrganizationMember",
    document: inviteOrganizationMemberOperation,
    kind: "mutation",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "RevokeOrganizationInvitation",
    document: revokeOrganizationInvitationOperation,
    kind: "mutation",
    area: "control",
    requiresSelectedProject: false,
  },
  {
    operationName: "ProjectMembers",
    document: projectMembersOperation,
    kind: "query",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "UpdateProjectMember",
    document: updateProjectMemberOperation,
    kind: "mutation",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "RemoveProjectMember",
    document: removeProjectMemberOperation,
    kind: "mutation",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "IngestCredentials",
    document: ingestCredentialsOperation,
    kind: "query",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "CreateIngestCredential",
    document: createIngestCredentialOperation,
    kind: "mutation",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "RevokeIngestCredential",
    document: revokeIngestCredentialOperation,
    kind: "mutation",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "TraceSearch",
    document: traceSearchOperation,
    kind: "query",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "TraceDetail",
    document: traceDetailOperation,
    kind: "query",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "LogSearch",
    document: logSearchOperation,
    kind: "query",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "TelemetryFacets",
    document: telemetryFacetsOperation,
    kind: "query",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "MetricNames",
    document: metricNamesOperation,
    kind: "query",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "MetricSeries",
    document: metricSeriesOperation,
    kind: "query",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "RichMetricSeries",
    document: richMetricSeriesOperation,
    kind: "query",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "Dashboards",
    document: dashboardsOperation,
    kind: "query",
    area: "dashboard",
    requiresSelectedProject: true,
  },
  {
    operationName: "SaveDashboard",
    document: saveDashboardOperation,
    kind: "mutation",
    area: "dashboard",
    requiresSelectedProject: true,
  },
  {
    operationName: "DeleteDashboard",
    document: deleteDashboardOperation,
    kind: "mutation",
    area: "dashboard",
    requiresSelectedProject: true,
  },
  {
    operationName: "SetDashboardPinned",
    document: setDashboardPinnedOperation,
    kind: "mutation",
    area: "dashboard",
    requiresSelectedProject: true,
  },
  {
    operationName: "ReorderDashboardPins",
    document: reorderDashboardPinsOperation,
    kind: "mutation",
    area: "dashboard",
    requiresSelectedProject: true,
  },
  {
    operationName: "RetentionPolicy",
    document: retentionPolicyOperation,
    kind: "query",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "UpdateRetentionPolicy",
    document: updateRetentionPolicyOperation,
    kind: "mutation",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "ProjectAiSettings",
    document: projectAiSettingsOperation,
    kind: "query",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "UpdateProjectAiSettings",
    document: updateProjectAiSettingsOperation,
    kind: "mutation",
    area: "settings",
    requiresSelectedProject: true,
  },
  {
    operationName: "AlertRules",
    document: alertRulesOperation,
    kind: "query",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "AlertHistory",
    document: alertHistoryOperation,
    kind: "query",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "AlertSilences",
    document: alertSilencesOperation,
    kind: "query",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "CreateAlertRule",
    document: createAlertRuleOperation,
    kind: "mutation",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "UpdateAlertRule",
    document: updateAlertRuleOperation,
    kind: "mutation",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "DeleteAlertRule",
    document: deleteAlertRuleOperation,
    kind: "mutation",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "CreateAlertSilence",
    document: createAlertSilenceOperation,
    kind: "mutation",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "DeleteAlertSilence",
    document: deleteAlertSilenceOperation,
    kind: "mutation",
    area: "alerting",
    requiresSelectedProject: true,
  },
  {
    operationName: "AgentRuns",
    document: agentRunsOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "AgentRun",
    document: agentRunOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "Datasets",
    document: datasetsOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "Dataset",
    document: datasetOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "CreateDataset",
    document: createDatasetOperation,
    kind: "mutation",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "Scorers",
    document: scorersOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "CreateScorer",
    document: createScorerOperation,
    kind: "mutation",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "Experiments",
    document: experimentsOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "CreateExperiment",
    document: createExperimentOperation,
    kind: "mutation",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "StartExperimentRun",
    document: startExperimentRunOperation,
    kind: "mutation",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "ExperimentRun",
    document: experimentRunOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "AnnotationQueue",
    document: annotationQueueOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "PrepareDatasetImport",
    document: prepareDatasetImportOperation,
    kind: "mutation",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "CommitDatasetImport",
    document: commitDatasetImportOperation,
    kind: "mutation",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "StartDatasetExport",
    document: startDatasetExportOperation,
    kind: "mutation",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "DatasetExport",
    document: datasetExportOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "AiQualityOverview",
    document: aiQualityOverviewOperation,
    kind: "query",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
  {
    operationName: "LiveTrace",
    document: liveTraceSubscriptionOperation,
    kind: "subscription",
    area: "telemetry",
    requiresSelectedProject: true,
  },
  {
    operationName: "LiveExperimentRun",
    document: liveExperimentRunSubscriptionOperation,
    kind: "subscription",
    area: "ai-eval",
    requiresSelectedProject: true,
  },
] as const satisfies readonly PublicGraphQLOperationDescriptor[];

export type PublicGraphQLOperationName = (typeof publicGraphQLOperations)[number]["operationName"];

export const publicGraphQLOperationNames = publicGraphQLOperations.map(
  (operation) => operation.operationName,
) as PublicGraphQLOperationName[];

export type SupportedGraphQLData =
  | TraceSearchQueryData
  | TraceDetailQueryData
  | LogSearchQueryData
  | TelemetryFacetQueryData
  | OrganizationMembersQueryData
  | OrganizationInvitationsQueryData
  | ProjectMembersQueryData
  | RetentionPolicyQueryData
  | AlertRulesQueryData
  | AlertHistoryQueryData
  | AlertSilencesQueryData
  | LiveTraceSubscriptionData
  | AgentRunsQueryData
  | AgentRunQueryData
  | DatasetsQueryData
  | DatasetQueryData
  | CreateDatasetMutationData
  | ScorersQueryData
  | CreateScorerMutationData
  | ExperimentsQueryData
  | CreateExperimentMutationData
  | StartExperimentRunMutationData
  | ExperimentRunQueryData
  | AnnotationQueueQueryData
  | AiQualityOverviewQueryData
  | LiveExperimentRunSubscriptionData;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const cloudGridProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string(),
    instance: z.string().optional(),
    id: z.string(),
    code: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), jsonValueSchema).optional(),
  })
  .passthrough();

const graphQLErrorSchema = z.object({
  message: z.string(),
  path: z.array(z.union([z.string(), z.number()])).optional(),
  extensions: z
    .object({
      code: z.string().optional(),
      problem: cloudGridProblemSchema.optional(),
    })
    .passthrough()
    .optional(),
});

const graphQLResponseEnvelopeSchema = z
  .object({
    data: z.unknown().optional(),
    errors: z.array(graphQLErrorSchema).optional(),
  })
  .refine((response) => response.data !== undefined || response.errors !== undefined, {
    message: "GraphQL response must include data or errors",
  });

export type CloudGridProblemDetails = z.infer<typeof cloudGridProblemSchema>;
type GraphQLErrorEnvelope = z.infer<typeof graphQLErrorSchema>;

export class CloudGridGraphQLError extends Error {
  readonly problem: CloudGridProblemDetails | undefined;

  constructor(message: string, problem?: CloudGridProblemDetails) {
    super(message);
    this.name = "CloudGridGraphQLError";
    this.problem = problem;
  }
}

async function requestGraphQL<Data>(
  endpoint: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Data> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ operationName, query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed with HTTP ${response.status}`);
  }

  const parsedEnvelope = graphQLResponseEnvelopeSchema.safeParse(await response.json());
  if (!parsedEnvelope.success) {
    throw new Error("GraphQL response envelope was invalid");
  }

  const payload = parsedEnvelope.data;
  if (payload.errors?.length) {
    throw cloudGridGraphQLErrorFromEnvelope(payload.errors);
  }

  if (payload.data === undefined || payload.data === null) {
    throw new Error("GraphQL response did not include data");
  }
  return payload.data as Data;
}

function graphqlWebSocketEndpoint(endpoint: string) {
  const base =
    typeof window === "undefined"
      ? "http://localhost"
      : `${window.location.protocol}//${window.location.host}`;
  const url = new URL(endpoint, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function subscribeGraphQL<Data>(
  endpoint: string,
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  observer: {
    onStateChange?: (state: LiveTraceConnectionState) => void;
    onData: (data: Data) => void;
    onError?: (error: Error) => void;
  },
): LiveTraceSubscription {
  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) {
    throw new Error("GraphQL subscriptions require WebSocket support");
  }

  let socket: WebSocket | null = null;
  let closedByClient = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const operationId = `${operationName}:${crypto.randomUUID()}`;

  const closeSocket = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      return;
    }
    socket.close();
  };

  const connect = () => {
    observer.onStateChange?.(socket ? "reconnecting" : "connecting");
    socket = new WebSocketCtor(endpoint, "graphql-transport-ws");

    socket.addEventListener("open", () => {
      socket?.send(JSON.stringify({ type: "connection_init" }));
    });

    socket.addEventListener("message", (message) => {
      const payload = parseGraphQLSocketMessage(message.data);
      if (!payload) {
        return;
      }

      if (payload.type === "connection_ack") {
        observer.onStateChange?.("live");
        socket?.send(
          JSON.stringify({
            id: operationId,
            type: "subscribe",
            payload: { operationName, query, variables },
          }),
        );
        return;
      }

      if (payload.type === "next" && payload.id === operationId) {
        const parsedEnvelope = graphQLResponseEnvelopeSchema.safeParse(payload.payload);
        if (!parsedEnvelope.success) {
          observer.onError?.(new Error("GraphQL subscription envelope was invalid"));
          return;
        }
        if (parsedEnvelope.data.errors?.length) {
          observer.onError?.(cloudGridGraphQLErrorFromEnvelope(parsedEnvelope.data.errors));
          return;
        }
        if (parsedEnvelope.data.data !== undefined && parsedEnvelope.data.data !== null) {
          observer.onData(parsedEnvelope.data.data as Data);
        }
        return;
      }

      if (payload.type === "error" && payload.id === operationId) {
        observer.onError?.(cloudGridGraphQLErrorFromSubscriptionPayload(payload.payload));
      }
    });

    socket.addEventListener("error", () => {
      observer.onStateChange?.("error");
      observer.onError?.(new Error("GraphQL subscription socket failed"));
    });

    socket.addEventListener("close", () => {
      if (closedByClient) {
        observer.onStateChange?.("closed");
        return;
      }
      observer.onStateChange?.("reconnecting");
      reconnectTimer = setTimeout(connect, 1000);
    });
  };

  connect();

  return {
    unsubscribe() {
      closedByClient = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: operationId, type: "complete" }));
      }
      closeSocket();
    },
  };
}

function cloudGridGraphQLErrorFromEnvelope(errors: GraphQLErrorEnvelope[]) {
  const firstProblem = errors.find((error) => error.extensions?.problem)?.extensions?.problem;
  if (firstProblem) {
    return new CloudGridGraphQLError(
      firstProblem.detail || firstProblem.title || errors[0]?.message || firstProblem.code,
      firstProblem,
    );
  }

  return new CloudGridGraphQLError(errors.map((error) => error.message).join("; "));
}

function cloudGridGraphQLErrorFromSubscriptionPayload(payload: unknown) {
  const parsedEnvelope = graphQLResponseEnvelopeSchema.safeParse(payload);
  if (parsedEnvelope.success && parsedEnvelope.data.errors?.length) {
    return cloudGridGraphQLErrorFromEnvelope(parsedEnvelope.data.errors);
  }

  const parsedErrors = z.array(graphQLErrorSchema).safeParse(payload);
  if (parsedErrors.success && parsedErrors.data.length) {
    return cloudGridGraphQLErrorFromEnvelope(parsedErrors.data);
  }

  return new CloudGridGraphQLError("GraphQL subscription failed");
}

function parseGraphQLSocketMessage(data: unknown) {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return null;
    }
    return parsed as {
      id?: string;
      type: string;
      payload?: unknown;
    };
  } catch {
    return null;
  }
}
