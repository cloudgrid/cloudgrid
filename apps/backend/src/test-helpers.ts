import type {
  AiChatActionProposal,
  AiChatHistoryInput,
  AiChatRun,
  AiChatRunStatus,
  AiQualityOverview,
  AiQualityOverviewInput,
  AlertEventConnection,
  AlertRule,
  AlertRuleSearchInput,
  AlertSilence,
  ApproveAiChatActionInput,
  CompanyAiProviderSettings,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateAiChatConversationInput,
  CreateIngestCredentialInput,
  CreateProjectInput,
  Dataset,
  DatasetExportJob,
  DatasetImportJob,
  DatasetItem,
  EvaluationDefinition,
  EvaluationRun,
  ExperimentRun,
  ExperimentRunEvent,
  InviteOrganizationMemberInput,
  InviteProjectMemberInput,
  LiveTraceEvent,
  LiveTraceInput,
  LogSearchInput,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  OptimizationRun,
  Project,
  ProjectAiProviderSettings,
  ProjectAiSettings,
  ProjectInvitationResult,
  ProjectListInput,
  ProjectMember,
  ProjectRole,
  RemoveOrganizationMemberInput,
  RetentionPolicy,
  RetentionRuleInput,
  TelemetryFacetInput,
  TraceDetail,
  TraceDetailInput,
  TraceSearchInput,
  UpdateCompanyAiProviderSettingsInput,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectAiProviderSettingsInput,
  UpdateProjectAiSettingsInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
  Viewer,
} from "@cloudgrid/ui-contracts";
import type { NormalizedAuthContext } from "./auth";
import type { CloudGridBridge } from "./bridge";

export function ssoAuthConfig() {
  return {
    mode: "sso" as const,
    provider: "google" as const,
    companyId: "company-1",
    providers: {
      github: {
        provider: "github" as const,
        clientId: "github-client-id",
        clientSecret: "github-client-secret",
        redirectUri: "https://cloudgrid.example/auth/callback",
      },
      google: {
        provider: "google" as const,
        issuer: "https://issuer.test",
        audience: "cloudgrid",
        clientId: "client-id",
        redirectUri: "https://cloudgrid.example/auth/callback",
      },
      azure: {
        provider: "azure" as const,
        issuer: "https://login.microsoftonline.com/tenant/v2.0",
        audience: "cloudgrid",
        clientId: "azure-client-id",
        redirectUri: "https://cloudgrid.example/auth/callback",
      },
    },
    sessionSecret: "test-session-secret",
    sessionTtlSeconds: 900,
  };
}

export function bridge(overrides: Partial<CloudGridBridge> = {}): CloudGridBridge {
  const defaultBridge: CloudGridBridge = {
    async viewer(_authContext: NormalizedAuthContext) {
      return viewer();
    },
    async organizations(_authContext: NormalizedAuthContext) {
      return [organization()];
    },
    async organization(_id: string, _authContext: NormalizedAuthContext) {
      return organization();
    },
    async organizationMembers(_organizationId: string, _authContext: NormalizedAuthContext) {
      return [member()];
    },
    async organizationInvitations(_organizationId: string, _authContext: NormalizedAuthContext) {
      return [invitation()];
    },
    async projects(_input: ProjectListInput, _authContext: NormalizedAuthContext) {
      return [project()];
    },
    async project(_id: string, _authContext: NormalizedAuthContext) {
      return project();
    },
    async createProject(_input: CreateProjectInput, _authContext: NormalizedAuthContext) {
      return project();
    },
    async updateProject(
      _id: string,
      _input: UpdateProjectInput,
      _authContext: NormalizedAuthContext,
    ) {
      return project();
    },
    async selectProject(_id: string, _authContext: NormalizedAuthContext) {
      return viewer();
    },
    async inviteOrganizationMember(
      input: InviteOrganizationMemberInput,
      _authContext: NormalizedAuthContext,
    ) {
      return invitation({ organizationId: input.organizationId, email: input.email });
    },
    async inviteProjectMember(
      input: InviteProjectMemberInput,
      _authContext: NormalizedAuthContext,
    ): Promise<ProjectInvitationResult> {
      return {
        outcome: "invitation_pending",
        invitation: invitation({
          email: input.email,
          projectGrants: [
            {
              projectId: input.projectId,
              role: input.role,
              status: "pending",
              createdAt: "2026-05-16T09:00:00.000Z",
              createdByUserId: "admin-1",
              appliedAt: null,
            },
          ],
        }),
        projectMember: null,
      };
    },
    async resendOrganizationInvitation(id: string, _authContext: NormalizedAuthContext) {
      return invitation({ id, deliveryStatus: "pending" });
    },
    async revokeOrganizationInvitation(_id: string, _authContext: NormalizedAuthContext) {
      return invitation({ status: "revoked", revokedAt: "2026-05-16T10:00:00.000Z" });
    },
    async updateOrganizationMember(
      _input: UpdateOrganizationMemberInput,
      _authContext: NormalizedAuthContext,
    ) {
      return { user: { id: "user-1" }, role: "admin" };
    },
    async removeOrganizationMember(
      _input: RemoveOrganizationMemberInput,
      _authContext: NormalizedAuthContext,
    ) {
      return true;
    },
    async projectMembers(_projectId: string, _authContext?: NormalizedAuthContext) {
      return [projectMember()];
    },
    async updateProjectMember(
      projectId: string,
      userId: string,
      role: ProjectRole,
      _authContext?: NormalizedAuthContext,
    ) {
      return projectMember({ projectId, userId, role, effectiveRole: role });
    },
    async removeProjectMember(
      _projectId: string,
      _userId: string,
      _authContext?: NormalizedAuthContext,
    ) {
      return true;
    },
    async retentionPolicy(projectId: string, _authContext?: NormalizedAuthContext) {
      return retentionPolicy(projectId);
    },
    async updateRetentionPolicy(
      input: UpdateRetentionPolicyInput,
      _authContext?: NormalizedAuthContext,
    ) {
      return retentionPolicy(input.projectId, input.expectedVersion + 1);
    },
    async alertRules(
      projectId: string,
      _input?: AlertRuleSearchInput,
      _authContext?: NormalizedAuthContext,
    ) {
      return [alertRule(projectId)];
    },
    async createAlertRule(input: CreateAlertRuleInput, _authContext?: NormalizedAuthContext) {
      return alertRule(input.projectId);
    },
    async updateAlertRule(input: UpdateAlertRuleInput, _authContext?: NormalizedAuthContext) {
      return alertRule("project-1", input.id, input.expectedVersion + 1);
    },
    async deleteAlertRule(_id: string, _authContext?: NormalizedAuthContext) {
      return true;
    },
    async alertSilences(
      projectId: string,
      ruleId?: string | null,
      _authContext?: NormalizedAuthContext,
    ) {
      return [alertSilence(projectId, ruleId ?? "rule-1")];
    },
    async createAlertSilence(input: CreateAlertSilenceInput, _authContext?: NormalizedAuthContext) {
      return alertSilence(input.projectId, input.ruleId);
    },
    async deleteAlertSilence(_id: string, _authContext?: NormalizedAuthContext) {
      return true;
    },
    async alertHistory(
      projectId: string,
      ruleId?: string | null,
      _first?: number | null,
      _after?: string | null,
      _authContext?: NormalizedAuthContext,
    ) {
      return alertHistory(projectId, ruleId ?? "rule-1");
    },
    async alertSummary(_projectId: string, _input = {}, _authContext?: NormalizedAuthContext) {
      return {
        totalCount: 1,
        byState: [{ state: "FIRING", count: 1 }],
        bySeverity: [{ severity: "ERROR", count: 1 }],
        bySignal: [{ signal: "TRACE", count: 1 }],
      };
    },
    async ingestCredentials(_projectId: string, _authContext?: NormalizedAuthContext) {
      return { items: [] };
    },
    async createIngestCredential(
      _input: CreateIngestCredentialInput,
      _authContext?: NormalizedAuthContext,
    ) {
      return {
        credential: {
          id: "credential-1",
          projectId: "project-1",
          title: "Checkout service",
          scopes: ["telemetry:ingest:traces", "telemetry:ingest:logs", "telemetry:ingest:metrics"],
          secretPreview: "cgk_...1234",
          createdAt: "2026-05-14T00:00:00.000Z",
          lastUsedAt: null,
          revokedAt: null,
          createdByUserId: "user-1",
        },
        secret: "cgk_created_secret_1234567890",
      };
    },
    async revokeIngestCredential(_id: string, _authContext?: NormalizedAuthContext) {
      return {
        id: "credential-1",
        projectId: "project-1",
        title: "Checkout service",
        scopes: ["telemetry:ingest:traces", "telemetry:ingest:logs", "telemetry:ingest:metrics"],
        secretPreview: "cgk_...1234",
        createdAt: "2026-05-14T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: "2026-05-14T01:00:00.000Z",
        createdByUserId: "user-1",
      };
    },
    async searchTraces(_input: TraceSearchInput, _authContext?: NormalizedAuthContext) {
      return { items: [], nextCursor: null };
    },
    async getTraceDetail(
      _traceId: string,
      _input: TraceDetailInput,
      _authContext?: NormalizedAuthContext,
    ) {
      return traceDetail();
    },
    async searchLogs(_input: LogSearchInput, _authContext?: NormalizedAuthContext) {
      return { items: [], nextCursor: null };
    },
    async telemetryFacets(_input: TelemetryFacetInput, _authContext?: NormalizedAuthContext) {
      return {
        services: [],
        operations: [],
        spanNames: [],
        severities: [],
        attributeKeys: [],
      };
    },
    async metricNames() {
      return { items: [] };
    },
    async metricSeries() {
      return {
        metric: {
          id: "metric:empty",
          tenantId: "tenant-1",
          projectId: "project-1",
          name: "empty",
          description: null,
          unit: "1",
          kind: "gauge" as const,
          aggregationTemporality: null,
          monotonic: null,
          attributeKeys: [],
          firstSeenAt: "2026-05-14T00:00:00.000Z",
          lastSeenAt: "2026-05-14T00:00:00.000Z",
        },
        aggregation: "avg" as const,
        interval: null,
        groupBy: [],
        series: [],
        warnings: [],
      };
    },
    async richMetricSeries() {
      return {
        interval: "PT1M",
        series: [],
        displaySeries: [],
        warnings: [],
      };
    },
    async dashboards() {
      return { items: [], pinnedDashboardIds: [] };
    },
    async saveDashboard() {
      return {
        id: "dashboard-1",
        projectId: "project-1",
        slug: "dashboard-1",
        name: "Dashboard",
        description: null,
        tags: [],
        version: 1,
        visibility: "personal" as const,
        defaultTimeWindow: "PT1H",
        pinned: false,
        widgets: [],
        createdAt: "2026-05-14T00:00:00.000Z",
        updatedAt: "2026-05-14T00:00:00.000Z",
        createdBy: "user-1",
        updatedBy: "user-1",
      };
    },
    async deleteDashboard() {
      return true;
    },
    async setDashboardPinned() {
      return {
        projectId: "project-1",
        pinnedDashboardIds: [],
        updatedAt: "2026-05-14T00:00:00.000Z",
      };
    },
    async reorderDashboardPins() {
      return {
        projectId: "project-1",
        pinnedDashboardIds: [],
        updatedAt: "2026-05-14T00:00:00.000Z",
      };
    },
    subscribeLiveTraces(_input: LiveTraceInput, _authContext?: NormalizedAuthContext) {
      return liveEvents([]);
    },
    async agentRuns() {
      return { items: [], nextCursor: null };
    },
    async agentRun() {
      return null;
    },
    async datasets() {
      return { items: [], nextCursor: null };
    },
    async dataset() {
      return null;
    },
    async datasetImport() {
      return datasetImportJob();
    },
    async datasetExport() {
      return datasetExportJob();
    },
    async datasetItems() {
      return { items: [], nextCursor: null };
    },
    async datasetCandidates() {
      return { items: [], nextCursor: null };
    },
    async scorers() {
      return { items: [], nextCursor: null };
    },
    async experiments() {
      return { items: [], nextCursor: null };
    },
    async experimentRun() {
      return null;
    },
    async experimentRuns() {
      return { items: [], nextCursor: null };
    },
    async datasetItemRuns() {
      return { items: [], nextCursor: null };
    },
    async evalResults() {
      return { items: [], nextCursor: null };
    },
    async annotationQueue() {
      return { items: [], nextCursor: null };
    },
    async projectAiSettings(projectId: string) {
      return projectAiSettings(projectId);
    },
    async projectAiProviderSettings(projectId: string) {
      return projectAiProviderSettings(projectId);
    },
    async updateProjectAiProviderSettings(input: UpdateProjectAiProviderSettingsInput) {
      return projectAiProviderSettings(input.projectId, input.expectedVersion + 1);
    },
    async companyAiProviderSettings(companyId: string) {
      return companyAiProviderSettings(companyId);
    },
    async updateCompanyAiProviderSettings(input: UpdateCompanyAiProviderSettingsInput) {
      return companyAiProviderSettings(input.companyId, input.expectedVersion + 1);
    },
    async resolveAiProviderSecret(credentialRef: string) {
      return { credentialRef, value: "managed-provider-secret" };
    },
    async aiChatHistory(input: AiChatHistoryInput) {
      return {
        companyId: input.companyId,
        userId: "user-local",
        projectGroups: [
          {
            projectId: input.projectId ?? "project-1",
            projectName: "Default",
            conversations: [aiChatConversation(input.companyId, input.projectId ?? "project-1")],
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    },
    async aiChatConversation(id: string) {
      return aiChatConversation("org-1", "project-1", id);
    },
    async createAiChatConversation(input: CreateAiChatConversationInput) {
      return aiChatConversation(input.companyId, input.projectId, "chat-created");
    },
    async archiveAiChatConversation(id: string) {
      return { ...aiChatConversation("org-1", "project-1", id), status: "archived" as const };
    },
    async deleteAiChatConversation() {
      return true;
    },
    async approveAiChatAction(input: ApproveAiChatActionInput) {
      return aiChatActionProposal(input.actionProposalId, input.approved ? "approved" : "rejected");
    },
    async aiChatAppendMessage() {},
    async aiChatCreateRun(input) {
      return aiChatRun(
        input.conversationId,
        "run-default",
        "streaming",
        input.providerProfileId,
        input.model,
      );
    },
    async aiChatUpdateRun(input) {
      return aiChatRun("chat-1", input.runId, input.status);
    },
    async aiChatFinalizeRun(input) {
      return aiChatRun("chat-1", input.runId, input.status);
    },
    async aiChatProposeAction() {
      return aiChatActionProposal("action-1");
    },
    async aiChatFinishAction() {},
    async aiChatSaveCompaction() {},
    async aiQualityOverview(input: AiQualityOverviewInput) {
      return aiQualityOverview(input.projectId);
    },
    async createDataset() {
      return datasetShape();
    },
    async appendDatasetItems() {
      return datasetShape();
    },
    async prepareDatasetImport() {
      return datasetImportJob();
    },
    async commitDatasetImport() {
      return { ...datasetImportJob(), status: "committed" as const, committedDatasetVersion: 2 };
    },
    async startDatasetExport() {
      return datasetExportJob();
    },
    async prepareDatasetCandidates() {
      return { items: [], nextCursor: null };
    },
    async commitDatasetCandidates() {
      return datasetShape({
        currentVersionId: "dataset-version-2",
        currentVersion: {
          ...datasetVersionShape(),
          id: "dataset-version-2",
          version: 2,
          itemRevisionIds: ["dataset-item-revision-1"],
        },
        itemCount: 1,
        readyItemCount: 1,
        splitCounts: { validation: 1 },
      });
    },
    async promoteSpanToDatasetItem() {
      return datasetItemShape();
    },
    async createScorer() {
      return {
        id: "scorer-1",
        name: "Exact",
        kind: "deterministic" as const,
        definition: {},
        version: 1,
      };
    },
    async evaluationDefinitions() {
      return { items: [], nextCursor: null };
    },
    async evaluationDefinition() {
      return null;
    },
    async evaluationRuns() {
      return { items: [], nextCursor: null };
    },
    async evaluationRun() {
      return evaluationRun();
    },
    async evaluationItemRuns() {
      return { items: [], nextCursor: null };
    },
    async evaluationResults() {
      return { items: [], nextCursor: null };
    },
    async evaluationComparisons() {
      return { items: [], nextCursor: null };
    },
    async evaluationComparison() {
      return null;
    },
    async optimizationRuns() {
      return { items: [], nextCursor: null };
    },
    async optimizationRun() {
      return optimizationRun();
    },
    async targetSnapshot() {
      return null;
    },
    async targetDiff() {
      return {
        baselineTargetSnapshotId: "snapshot-1",
        candidateTargetSnapshotId: "snapshot-2",
        changedParts: [],
        summary: "",
      };
    },
    async createEvaluationDefinition() {
      return evaluationDefinition();
    },
    async updateEvaluationDefinition() {
      return evaluationDefinition();
    },
    async createExperiment() {
      return {
        id: "experiment-1",
        name: "Regression",
        datasetId: "dataset-1",
        datasetVersion: 1,
        splitSelector: { splits: ["training"], reviewedOnly: false, includeSynthetic: true },
        scorerIds: ["scorer-1"],
        promptVersionRefs: [],
        skillSnapshotRefs: [],
        toolSnapshotRefs: [],
        providerProfileRefs: [],
        createdAt: "2026-05-12T10:00:00.000Z",
        tags: [],
      };
    },
    async startExperimentRun() {
      return experimentRun();
    },
    async startEvaluationRun() {
      return evaluationRun();
    },
    async cancelExperimentRun() {
      return experimentRun();
    },
    async cancelEvaluationRun() {
      return evaluationRun();
    },
    async pauseExperimentRun() {
      return { ...experimentRun(), status: "paused" as const };
    },
    async pauseEvaluationRun() {
      return { ...evaluationRun(), status: "paused" as const };
    },
    async resumeExperimentRun() {
      return { ...experimentRun(), status: "running" as const };
    },
    async resumeEvaluationRun() {
      return { ...evaluationRun(), status: "running" as const };
    },
    async startOptimizationRun() {
      return optimizationRun();
    },
    async createEvaluationComparison() {
      return {
        id: "comparison-1",
        projectId: "project-1",
        baselineRunId: "run-1",
        candidateRunId: "run-2",
        metricResults: [],
        metricAggregates: [],
        summary: "",
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async promotePromptVersion() {
      return {
        id: "prompt-version-1",
        name: "base",
        text: "hello",
        hash: "hash",
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async promoteTargetSnapshot() {
      return {
        id: "promotion-1",
        projectId: "project-1",
        targetRef: "prompt:base",
        baselineTargetSnapshotId: "snapshot-1",
        candidateTargetSnapshotId: "snapshot-2",
        evidenceEvaluationRunIds: [],
        comparisonId: "comparison-1",
        summary: "",
        promotedBy: "user-1",
        promotedAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async resolveAnnotation() {
      return {
        id: "annotation-1",
        targetTraceId: "trace-1",
        reason: "failed",
        status: "resolved" as const,
        createdAt: "2026-05-12T10:00:00.000Z",
      };
    },
    async updateProjectAiSettings(input: UpdateProjectAiSettingsInput) {
      return projectAiSettings(input.projectId, input.expectedVersion + 1);
    },
    subscribeLiveExperimentRun() {
      return liveExperimentEvents([]);
    },
    async *subscribeLiveEvaluationRun() {
      yield* [];
    },
    async health() {
      return "ok" as const;
    },
    async close() {},
  };
  return { ...defaultBridge, ...overrides };
}

export function viewer(): Viewer {
  return {
    user: { id: "user-local", displayName: "Local User", email: "local@cloudgrid.dev" },
    organizations: [organization()],
    selectedProject: project(),
  };
}

export function organization(): Organization {
  return {
    id: "org-1",
    name: "Local",
    slug: "local",
    role: "admin",
    projects: [project()],
  };
}

export function project(): Project {
  return {
    id: "project-1",
    organizationId: "org-1",
    name: "Default",
    slug: "default",
    status: "active",
    telemetry: { traceCount: 0, logCount: 0, metricCount: 0, serviceCount: 0 },
  };
}

function projectAiProviderSettings(projectId: string, version = 1): ProjectAiProviderSettings {
  return {
    projectId,
    providerProfiles: [aiProviderProfile("profile-1", "project", projectId)],
    modelAliases: [aiModelAlias("alias-1", "profile-1")],
    effective: {
      warnings: [],
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      missingChatProvider: false,
    },
    version,
    updatedAt: "2026-05-18T00:00:00.000Z",
    updatedByUserId: "user-local",
  };
}

function companyAiProviderSettings(companyId: string, version = 1): CompanyAiProviderSettings {
  return {
    companyId,
    providerProfile: aiProviderProfile("company-profile-1", "company", companyId),
    chatModelAlias: aiModelAlias("company-chat", "company-profile-1"),
    effective: {
      warnings: [],
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      missingChatProvider: false,
    },
    version,
    updatedAt: "2026-05-18T00:00:00.000Z",
    updatedByUserId: "user-local",
  };
}

function aiProviderProfile(id: string, ownerScope: string, ownerId: string) {
  return {
    id,
    ownerScope,
    ownerId,
    label: "OpenAI",
    providerKind: "openai" as const,
    baseUrl: null,
    credentialRef: "env:OPENAI_API_KEY",
    models: { chat: ["gpt-5-mini"] },
    parameters: {},
    timeoutMs: 30_000,
    maxConcurrency: null,
    disabledAt: null,
  };
}

function aiModelAlias(id: string, providerProfileId: string) {
  return {
    id,
    name: "chat-default",
    providerProfileId,
    model: "gpt-5-mini",
    purpose: "chat" as const,
    parameters: { extras: {} },
  };
}

function aiChatConversation(companyId: string, projectId: string, id = "chat-1") {
  return {
    id,
    companyId,
    projectId,
    userId: "user-local",
    title: "Investigate slow traces",
    status: "active" as const,
    messages: [
      {
        id: "message-1",
        conversationId: id,
        role: "user" as const,
        parts: [{ type: "text" as const, text: "Investigate slow traces" }],
        createdAt: "2026-05-18T00:00:00.000Z",
      },
    ],
    latestRun: null,
    compaction: null,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    lastMessageAt: "2026-05-18T00:00:00.000Z",
    version: 1,
  };
}

function aiChatRun(
  conversationId: string,
  id = "run-1",
  status: AiChatRunStatus = "streaming",
  providerProfileId = "provider-1",
  model = "gpt-5-mini",
): AiChatRun {
  return {
    id,
    conversationId,
    projectId: "project-1",
    userId: "user-local",
    status,
    providerKind: "openai",
    providerProfileId,
    model,
    traceId: null,
    toolCallCount: 0,
    sandboxScriptCount: 0,
    artifactCount: 0,
    inputTokenCount: null,
    outputTokenCount: null,
    estimatedCostUsd: null,
    artifacts: [],
    actionProposals: [],
    startedAt: "2026-05-18T00:00:00.000Z",
    completedAt:
      status === "completed" || status === "failed" || status === "cancelled"
        ? "2026-05-18T00:00:01.000Z"
        : null,
    problem: status === "failed" ? { detail: "AI Chat provider execution failed" } : null,
  };
}

function aiChatActionProposal(
  id: string,
  status: AiChatActionProposal["status"] = "proposed",
): AiChatActionProposal {
  return {
    id,
    runId: "run-1",
    conversationId: "chat-1",
    title: "Save dashboard",
    description: "Create a saved dashboard",
    risk: "medium",
    status,
    actionKind: "dashboard.save",
    graphqlMutation: "saveDashboard",
    inputPreview: { name: "Latency" },
    requiresApproval: true,
    result: null,
    requestedAt: "2026-05-18T00:00:00.000Z",
    decidedAt: status === "proposed" ? null : "2026-05-18T00:01:00.000Z",
    decidedByUserId: status === "proposed" ? null : "user-local",
    expiresAt: "2026-05-18T00:15:00.000Z",
    version: 2,
  };
}

export function member(): OrganizationMember {
  return { user: { id: "user-1" }, role: "admin" };
}

export function invitation(
  overrides: Partial<OrganizationInvitation> = {},
): OrganizationInvitation {
  return {
    id: "invite-1",
    organizationId: "org-1",
    email: "ada@example.test",
    role: "user",
    status: "pending",
    deliveryStatus: "suppressed",
    lastDeliveryAttemptAt: null,
    lastDeliveryErrorCode: null,
    lastEmailDeliveryId: null,
    projectGrants: [],
    invitedByUserId: "admin-1",
    acceptedByUserId: null,
    createdAt: "2026-05-16T09:00:00.000Z",
    updatedAt: "2026-05-16T09:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    expiresAt: "2026-05-23T09:00:00.000Z",
    ...overrides,
  };
}

function projectMember(overrides: Partial<ProjectMember> = {}): ProjectMember {
  return {
    projectId: "project-1",
    userId: "user-1",
    email: "member@example.com",
    displayName: "Member",
    role: "viewer",
    effectiveRole: "viewer",
    source: "direct",
    createdAt: "2026-05-14T00:00:00.000Z",
    createdByUserId: "user-local",
    updatedAt: "2026-05-14T00:00:00.000Z",
    updatedByUserId: "user-local",
    ...overrides,
  };
}

function datasetHealth() {
  return {
    status: "needs_review" as const,
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

function datasetSettingsShape() {
  return {
    evaluationFamily: "classification" as const,
    inputType: "json" as const,
    expectedType: "json" as const,
    inputJsonSchema: {},
    expectedJsonSchema: {},
    defaultSplit: "validation" as const,
    intakePolicy: {
      manualDefaultStatus: "draft" as const,
      importDefaultStatus: "needs_review" as const,
      traceDefaultStatus: "needs_expected" as const,
    },
    traceExtractionSettings: null,
    anonymizationPolicy: null,
    defaultMetricSettings: [],
    retentionProfile: "balanced" as const,
  };
}

function datasetVersionShape() {
  return {
    id: "dataset-version-1",
    datasetId: "dataset-1",
    version: 1,
    digest: "digest-1",
    itemRevisionIds: [],
    settingsSnapshot: datasetSettingsShape(),
    changeSummary: "Initial dataset version",
    source: "manual" as const,
    createdAt: "2026-05-12T10:00:00.000Z",
    createdBy: "user-1",
  };
}

function datasetShape(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: "dataset-1",
    projectId: "project-1",
    name: "Regression",
    description: null,
    currentVersionId: "dataset-version-1",
    currentVersion: datasetVersionShape(),
    settings: datasetSettingsShape(),
    createdAt: "2026-05-12T10:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedBy: "user-1",
    itemCount: 0,
    readyItemCount: 0,
    splitCounts: {},
    health: datasetHealth(),
    tags: [],
    ...overrides,
  };
}

function datasetItemShape(): DatasetItem {
  return {
    id: "dataset-item-1",
    datasetId: "dataset-1",
    latestRevisionId: "dataset-item-revision-1",
    latestRevision: {
      id: "dataset-item-revision-1",
      datasetItemId: "dataset-item-1",
      datasetId: "dataset-1",
      input: {},
      expected: null,
      observedOutput: null,
      reason: "",
      metadata: {},
      sourceRefs: [],
      split: "training" as const,
      curationStatus: "draft" as const,
      contentTreatment: "original" as const,
      anonymizationProvenance: null,
      createdAt: "2026-05-12T10:00:00.000Z",
      createdBy: "user-1",
      updatedAt: "2026-05-12T10:00:00.000Z",
      updatedBy: "user-1",
    },
    createdAt: "2026-05-12T10:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedBy: "user-1",
  };
}

function datasetImportJob(): DatasetImportJob {
  return {
    id: "import-1",
    datasetId: "dataset-1",
    status: "preview_ready",
    format: "jsonl",
    sourceFiles: [],
    mapping: {},
    defaults: {},
    previewRows: [],
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    warnings: [],
    createdAt: "2026-05-12T10:00:00.000Z",
    expiresAt: "2026-05-13T10:00:00.000Z",
  };
}

function datasetExportJob(): DatasetExportJob {
  return {
    id: "export-1",
    datasetId: "dataset-1",
    datasetVersionId: "dataset-1:version:1",
    datasetVersion: 1,
    status: "ready",
    format: "jsonl",
    rowCount: 0,
    sizeBytes: 0,
    sha256: "sha",
    downloadUrl: "/api/ai-eval/dataset-exports/export-1/download",
    createdAt: "2026-05-12T10:00:00.000Z",
    expiresAt: "2026-05-13T10:00:00.000Z",
  };
}

function projectAiSettings(projectId = "project-1", version = 1): ProjectAiSettings {
  return {
    projectId,
    enabled: true,
    defaultProviderProfileId: "provider-1",
    defaultJudgeProfileId: "provider-1",
    defaultOptimizerProfileId: null,
    defaultEmbeddingProfileId: null,
    providerProfiles: [
      {
        id: "provider-1",
        projectId,
        label: "Harness",
        providerKind: "local_harness",
        models: {},
        timeoutMs: 30000,
      },
    ],
    modelAliases: [],
    onlinePolicies: [],
    budget: {
      dailyUsd: 10,
      deterministicOnly: false,
      spentTodayUsd: 0,
    },
    sampling: {
      defaultOnlineSampleRate: 0.1,
      maxOnlineSampleRate: 1,
      maxConcurrentEvaluationItems: 4,
      maxConcurrentOptimizationCandidates: 2,
    },
    runPolicyDefaults: { maxParallelRequests: 10 },
    datasetPipeline: {
      candidateSuggestionsEnabled: true,
      requireReviewBeforeCommit: true,
      anonymizationMode: "realistic",
      anonymizationPolicyId: null,
      anonymizationPolicyVersion: null,
      anonymizationConsistencyScope: "project",
      preserveLocale: true,
      preserveTemporalDistance: true,
      blockedEntityTypes: [],
    },
    datasetDefaults: {
      splitAllocation: {},
      smallDatasetReadyThreshold: 30,
      requireReadyForTest: true,
    },
    effective: {
      warnings: [],
      deterministicOnly: false,
      missingProviderProfiles: [],
      disabledProviderProfiles: [],
      budgetExhausted: false,
    },
    version,
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedByUserId: "user-1",
  };
}

function aiQualityOverview(projectId = "project-1"): AiQualityOverview {
  return {
    projectId,
    summary: {},
    segments: [
      {
        key: "agent:support",
        label: "support",
        dimensions: { agentName: "support" },
        runCount: 1,
        scoredRunCount: 1,
        passRate: 1,
        meanScore: 1,
        regressionCount: 0,
      },
    ],
    warnings: [],
  };
}

function retentionPolicy(projectId = "project-1", version = 1): RetentionPolicy {
  const inputs: RetentionRuleInput[] = [
    { dataClass: "TRACES", mode: "delete", retentionDays: 30 },
    { dataClass: "LOGS", mode: "delete", retentionDays: 30 },
    { dataClass: "METRICS", mode: "delete", retentionDays: 30 },
    { dataClass: "AI_EVALS", mode: "delete", retentionDays: 90 },
    { dataClass: "DATASETS", mode: "retain" },
    { dataClass: "SCORERS", mode: "retain" },
    { dataClass: "DASHBOARD_HISTORY", mode: "retain" },
    { dataClass: "INGEST_CREDENTIAL_AUDIT", mode: "delete", retentionDays: 365 },
  ];
  const rules: RetentionPolicy["rules"] = inputs.map((rule) => ({
    ...rule,
    retentionDays: rule.retentionDays ?? null,
    softDeleteDays: null,
    updatedAt: "2026-05-14T00:00:00.000Z",
    updatedByUserId: "user-local",
    version,
  }));
  return {
    projectId,
    rules,
    updatedAt: "2026-05-14T00:00:00.000Z",
    updatedByUserId: "user-local",
    version,
  };
}

function alertRule(projectId = "project-1", id = "rule-1", version = 1): AlertRule {
  return {
    id,
    projectId,
    name: "Errors",
    enabled: true,
    kind: "TRACE_ERROR",
    severity: "ERROR",
    query: { service: "api" },
    condition: { minCount: 1 },
    evaluationWindowSeconds: 60,
    pendingForSeconds: 0,
    cooldownSeconds: 60,
    notificationAdapterIds: ["in_app"],
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z",
    updatedByUserId: "user-local",
    version,
  };
}

function alertSilence(projectId = "project-1", ruleId = "rule-1"): AlertSilence {
  return {
    id: "silence-1",
    projectId,
    ruleId,
    reason: "maintenance",
    startsAt: "2026-05-14T08:00:00.000Z",
    endsAt: "2026-05-14T09:00:00.000Z",
    createdAt: "2026-05-14T08:00:00.000Z",
    createdByUserId: "user-local",
    active: true,
  };
}

function alertHistory(projectId = "project-1", ruleId = "rule-1"): AlertEventConnection {
  return {
    items: [
      {
        id: "event-1",
        projectId,
        ruleId,
        instanceId: "instance-1",
        state: "FIRING",
        severity: "ERROR",
        summary: "Errors firing",
        deduplicationKey: "errors:api",
        startedAt: "2026-05-14T08:00:00.000Z",
        endedAt: null,
        createdAt: "2026-05-14T08:00:00.000Z",
        evidenceTraceId: null,
        evidenceSpanId: null,
        evidenceLogId: null,
        evidenceMetricName: null,
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  };
}

export async function* liveEvents(events: LiveTraceEvent[]): AsyncIterableIterator<LiveTraceEvent> {
  for (const event of events) {
    yield event;
  }
}

export async function* liveExperimentEvents(
  events: ExperimentRunEvent[],
): AsyncIterableIterator<ExperimentRunEvent> {
  for (const event of events) {
    yield event;
  }
}

function experimentRun(): ExperimentRun {
  return {
    id: "experiment-run-1",
    experimentId: "experiment-1",
    solverRef: { kind: "agent", name: "candidate" },
    status: "running",
    runPolicy: { maxParallelRequests: 10 },
    startedAt: "2026-05-12T10:00:00.000Z",
    summary: {
      itemCounts: {
        total: 0,
        passed: 0,
        failed: 0,
        errored: 0,
        skipped: 0,
        needsReview: 0,
        quarantined: 0,
      },
      scoreSummaries: [],
      problemCounts: {
        modelQuality: 0,
        itemQuality: 0,
        scorerConfig: 0,
        infrastructure: 0,
      },
      budgetUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedUsd: 0,
      },
      latency: null,
      regressions: [],
    },
  };
}

function evaluationDefinition(): EvaluationDefinition {
  return {
    id: "evaluation-definition-1",
    projectId: "project-1",
    name: "Regression",
    datasetId: "dataset-1",
    datasetVersionPolicy: "latest_ready",
    splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
    targetRef: {
      kind: "prompt",
      displayName: "Prompt",
      metadata: {},
    },
    metricSettings: [],
    runPolicy: { maxParallelRequests: 1 },
    retentionProfile: "balanced",
    createdAt: "2026-05-12T10:00:00.000Z",
    createdBy: "user-1",
    updatedAt: "2026-05-12T10:00:00.000Z",
    updatedBy: "user-1",
    version: 1,
  };
}

function evaluationRun(): EvaluationRun {
  return {
    id: "evaluation-run-1",
    projectId: "project-1",
    evaluationDefinitionId: "evaluation-definition-1",
    kind: "dataset_evaluation",
    status: "running",
    datasetId: "dataset-1",
    datasetVersionId: "dataset-version-1",
    datasetDigest: "digest",
    selectedItemRevisionIds: [],
    splitSelector: { splits: ["validation"], curationStatuses: ["ready"] },
    targetSnapshotId: "target-snapshot-1",
    metricSettingsSnapshot: [],
    runPolicySnapshot: { maxParallelRequests: 10 },
    retentionProfile: "balanced",
    retentionRole: "validation",
    startedAt: "2026-05-12T10:00:00.000Z",
    summary: {
      itemCounts: {},
      metricAggregates: [],
      problemCounts: {},
      budgetUsage: {},
      latency: null,
    },
    metricResults: [],
    metricAggregates: [],
  };
}

function optimizationRun(): OptimizationRun {
  return {
    id: "optimization-run-1",
    projectId: "project-1",
    status: "running",
    baselineTargetSnapshotId: "target-snapshot-1",
    objective: { primaryMetricId: "exact_match" },
    candidateTargetSnapshotIds: [],
    causedEvaluationRunIds: [],
    comparisonIds: [],
    budgetSnapshot: {},
    createdAt: "2026-05-12T10:00:00.000Z",
    startedAt: "2026-05-12T10:00:00.000Z",
  };
}

function traceDetail(): TraceDetail {
  return {
    trace: {
      id: "trace-1",
      serviceName: "api",
      startedAt: "2026-05-08T10:00:00.000Z",
      startedAtUnixNano: "1778234400000000000",
      endedAt: "2026-05-08T10:00:01.000Z",
      endedAtUnixNano: "1778234401000000000",
      durationNano: "1000000000",
      durationMs: 1000,
      rootSpanId: "span-1",
      status: "error",
      attributes: {},
    },
    structure: {
      rootSpanIds: ["span-1"],
      orphanSpanIds: [],
      criticalPathSpanIds: ["span-1"],
      maxDepth: 0,
      serviceBreakdown: [],
    },
    spans: [],
    selectedSpan: null,
    spanMatches: [],
    logs: [],
    relatedLogs: [],
    warnings: [],
  };
}
