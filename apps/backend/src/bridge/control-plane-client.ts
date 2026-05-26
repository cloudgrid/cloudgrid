import type {
  AlertEventConnection,
  AlertRule,
  AlertRuleSearchInput,
  AlertSilence,
  AlertSummary,
  AlertSummaryInput,
  CompanyAiProviderSettings,
  CreatedIngestCredential,
  CreateAlertRuleInput,
  CreateAlertSilenceInput,
  CreateIngestCredentialInput,
  CreateProjectInput,
  Dashboard,
  DashboardListInput,
  DashboardListResult,
  DashboardPreferences,
  IngestCredential,
  IngestCredentialListResult,
  InviteOrganizationMemberInput,
  InviteProjectMemberInput,
  Organization,
  OrganizationInvitation,
  OrganizationMember,
  Project,
  ProjectAiProviderSettings,
  ProjectInvitationResult,
  ProjectListInput,
  ProjectMember,
  ProjectRole,
  RemoveOrganizationMemberInput,
  ReorderDashboardPinsInput,
  RetentionPolicy,
  SaveDashboardInput,
  SetDashboardPinnedInput,
  UpdateCompanyAiProviderSettingsInput,
  UpdateAlertRuleInput,
  UpdateOrganizationMemberInput,
  UpdateProjectAiProviderSettingsInput,
  UpdateProjectInput,
  UpdateRetentionPolicyInput,
  Viewer,
} from "@cloudgrid/ui-contracts";
import type { NormalizedAuthContext } from "../auth";
import type {
  AiChatActionProposal,
  AiChatConversation,
  AiChatHistory,
  AiChatHistoryInput,
  ApproveAiChatActionInput,
  CreateAiChatConversationInput,
} from "@cloudgrid/ui-contracts";
import type {
  AiChatAppendMessageInput,
  AiChatCreateRunInput,
  AiChatFinalizeRunInput,
  AiChatFinishActionInput,
  AiChatProposeActionInput,
  AiChatRun,
  AiChatSaveCompactionInput,
  AiChatUpdateRunInput,
} from "./ai-chat-client";

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
