import type {
  AgentRun,
  AgentRunQueryData,
  AgentRunSearchInput,
  AgentRunsQueryData,
  AlertEventConnection,
  AlertHistoryQueryData,
  AlertRule,
  AlertRulesQueryData,
  AlertSilence,
  AlertSilencesQueryData,
  AnnotationQueueQueryData,
  AnnotationQueueResult,
  AnnotationQueueSearchInput,
  CreateAlertRuleInput,
  CreateAlertRuleMutationData,
  CreateAlertSilenceInput,
  CreateAlertSilenceMutationData,
  Dataset,
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
  LiveExperimentRunInput,
  LiveExperimentRunSubscriptionData,
  LogSearchInput,
  LogSearchQueryData,
  LogSearchResult,
  LiveTraceEvent,
  LiveTraceInput,
  LiveTraceSubscriptionData,
  MetricNameSearchInput,
  MetricNameSearchResult,
  MetricSeriesInput,
  MetricSeriesResult,
  CreateIngestCredentialInput,
  CreateIngestCredentialMutationData,
  CreateProjectInput,
  CreateProjectMutationData,
  CreatedIngestCredential,
  InviteOrganizationMemberInput,
  InviteOrganizationMemberMutationData,
  IngestCredential,
  IngestCredentialsQueryData,
  IngestCredentialListResult,
  RevokeIngestCredentialMutationData,
  TelemetryFacetInput,
  TelemetryFacetQueryData,
  TelemetryFacetResult,
  ScorerSearchInput,
  ScorersQueryData,
  Organization,
  OrganizationInvitation,
  OrganizationInvitationsQueryData,
  OrganizationMember,
  OrganizationMembersQueryData,
  OrganizationQueryData,
  OrganizationsQueryData,
  Project,
  ProjectListInput,
  ProjectMember,
  ProjectMembersQueryData,
  ProjectQueryData,
  ProjectsQueryData,
  RemoveOrganizationMemberInput,
  RemoveOrganizationMemberMutationData,
  RemoveProjectMemberMutationData,
  RevokeOrganizationInvitationMutationData,
  RetentionPolicy,
  RetentionPolicyQueryData,
  UpdateAlertRuleInput,
  UpdateAlertRuleMutationData,
  SelectProjectMutationData,
  TraceDetail,
  TraceDetailInput,
  TraceDetailQueryData,
  TraceSearchInput,
  TraceSearchQueryData,
  TraceSearchResult,
  UpdateOrganizationMemberInput,
  UpdateOrganizationMemberMutationData,
  UpdateProjectMemberMutationData,
  UpdateRetentionPolicyInput,
  UpdateRetentionPolicyMutationData,
  ProjectRole,
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
  subscribeLiveTraces: (
    input: LiveTraceInput,
    observer: LiveTraceObserver,
  ) => LiveTraceSubscription;
  searchAgentRuns: (input: AgentRunSearchInput) => Promise<AgentRunsQueryData["agentRuns"]>;
  getAgentRun: (id: string) => Promise<AgentRun | null>;
  searchDatasets: (input: DatasetSearchInput) => Promise<DatasetsQueryData["datasets"]>;
  getDataset: (id: string) => Promise<Dataset | null>;
  searchScorers: (input: ScorerSearchInput) => Promise<ScorersQueryData["scorers"]>;
  searchExperiments: (input: ExperimentSearchInput) => Promise<ExperimentsQueryData["experiments"]>;
  getExperimentRun: (id: string) => Promise<ExperimentRun | null>;
  searchAnnotationQueue: (input: AnnotationQueueSearchInput) => Promise<AnnotationQueueResult>;
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

const emptyTraceSearch: TraceSearchResult = {
  items: [],
  nextCursor: null,
};

const emptyLogSearch: LogSearchResult = {
  items: [],
  nextCursor: null,
};

const emptyTelemetryFacets: TelemetryFacetResult = {
  services: [],
  operations: [],
  spanNames: [],
  severities: [],
  attributeKeys: [],
};

export const mockTelemetryClient: TelemetryGraphQLClient = {
  async searchTraces() {
    return emptyTraceSearch;
  },
  async getTrace() {
    return null;
  },
  async searchLogs() {
    return emptyLogSearch;
  },
  async getTelemetryFacets() {
    return emptyTelemetryFacets;
  },
  async getMetricNames() {
    return { items: [] };
  },
  async getMetricSeries(input) {
    return {
      metric: {
        id: `metric:${input.metricName}`,
        tenantId: "local",
        projectId: "default",
        name: input.metricName,
        description: null,
        unit: "1",
        kind: "gauge",
        aggregationTemporality: null,
        monotonic: null,
        attributeKeys: [],
        firstSeenAt: input.from,
        lastSeenAt: input.to,
      },
      aggregation: input.aggregation,
      interval: input.interval ?? "PT1M",
      groupBy: input.groupBy ?? [],
      series: [],
      warnings: [],
    };
  },
  subscribeLiveTraces() {
    return { unsubscribe() {} };
  },
  async searchAgentRuns() {
    return { items: [], nextCursor: null };
  },
  async getAgentRun() {
    return null;
  },
  async searchDatasets() {
    return { items: [], nextCursor: null };
  },
  async getDataset() {
    return null;
  },
  async searchScorers() {
    return { items: [], nextCursor: null };
  },
  async searchExperiments() {
    return { items: [], nextCursor: null };
  },
  async getExperimentRun() {
    return null;
  },
  async searchAnnotationQueue() {
    return { items: [], nextCursor: null };
  },
  subscribeLiveExperimentRun() {
    return { unsubscribe() {} };
  },
};

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
    async searchScorers(input) {
      const data = await requestGraphQL<ScorersQueryData>(endpoint, "Scorers", scorersOperation, {
        input,
      });
      return data.scorers;
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

export const experimentsOperation = `
  query Experiments($input: ExperimentSearchInput) {
    experiments(input: $input) {
      items {
        id
        name
        datasetId
        datasetVersion
        scorerIds
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
      }
      nextCursor
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
  | ScorersQueryData
  | ExperimentsQueryData
  | ExperimentRunQueryData
  | AnnotationQueueQueryData
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
